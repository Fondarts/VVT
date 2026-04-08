/**
 * Forced Alignment using wav2vec2 + CTC Viterbi alignment.
 *
 * Given audio + already-transcribed text, returns precise word-level timestamps.
 * Uses wav2vec2-base-960h ONNX model via onnxruntime-node.
 *
 * How it works:
 *  1. wav2vec2 processes raw 16kHz audio → character-level log-probabilities per 20ms frame
 *  2. CTC forced alignment maps the known text to exact frame positions
 *  3. Frame positions → timestamps with 20ms resolution
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Lazy-loaded onnxruntime
let ort = null;

// wav2vec2-base-960h vocab (CTC): <pad>=blank, |=word separator
const VOCAB = {
  '<pad>': 0, '<s>': 1, '</s>': 2, '<unk>': 3, '|': 4,
  'E': 5, 'T': 6, 'A': 7, 'O': 8, 'N': 9, 'I': 10, 'H': 11,
  'S': 12, 'R': 13, 'D': 14, 'L': 15, 'U': 16, 'C': 17, 'M': 18,
  'W': 19, 'F': 20, 'G': 21, 'Y': 22, 'P': 23, 'B': 24, 'V': 25,
  'K': 26, "'": 27, 'X': 28, 'J': 29, 'Q': 30, 'Z': 31,
};
const BLANK_ID = 0; // <pad> is the CTC blank
const WORD_SEP_ID = 4; // | is word separator
const FRAME_DURATION_S = 0.02; // 320 samples / 16kHz = 20ms per frame

// Model URLs (Xenova's HuggingFace ONNX exports)
const MODEL_URL = 'https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/main/onnx/model_quantized.onnx';
const MODEL_FILENAME = 'wav2vec2-base-960h-quantized.onnx';

let session = null;
let modelDir = null;

/**
 * Initialize: set data directory, lazy-load onnxruntime, ensure model exists.
 */
async function init(dataDir) {
  modelDir = path.join(dataDir, 'wav2vec2');
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  if (!ort) {
    try {
      ort = require('onnxruntime-node');
    } catch (e) {
      throw new Error('onnxruntime-node not installed. Run: npm install onnxruntime-node');
    }
  }
}

/**
 * Check if the model is already downloaded.
 */
function isModelReady() {
  if (!modelDir) return false;
  return fs.existsSync(path.join(modelDir, MODEL_FILENAME));
}

/**
 * Download the wav2vec2 ONNX model with progress callback.
 */
function downloadModel(onProgress) {
  return new Promise((resolve, reject) => {
    const modelPath = path.join(modelDir, MODEL_FILENAME);
    const tempPath = modelPath + '.downloading';

    if (fs.existsSync(modelPath)) { resolve(modelPath); return; }

    console.log(`[Align] Downloading wav2vec2 model from ${MODEL_URL}...`);

    function doFetch(url) {
      const proto = url.startsWith('https') ? https : http;
      proto.get(url, { headers: { 'User-Agent': 'KissdHelper/1.5' } }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doFetch(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(tempPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          fileStream.write(chunk);
          if (totalBytes > 0 && onProgress) {
            onProgress(Math.round((downloadedBytes / totalBytes) * 100), downloadedBytes, totalBytes);
          }
        });

        res.on('end', () => {
          fileStream.end(() => {
            fs.renameSync(tempPath, modelPath);
            console.log(`[Align] Model downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`);
            resolve(modelPath);
          });
        });

        res.on('error', (err) => {
          fileStream.end();
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          reject(err);
        });
      }).on('error', reject);
    }

    doFetch(MODEL_URL);
  });
}

/**
 * Load (or reuse) the ONNX inference session.
 */
async function getSession() {
  if (session) return session;
  const modelPath = path.join(modelDir, MODEL_FILENAME);
  if (!fs.existsSync(modelPath)) {
    throw new Error('Model not downloaded. Call downloadModel() first.');
  }
  console.log('[Align] Loading wav2vec2 ONNX model...');
  const opts = { executionProviders: ['cpu'], graphOptimizationLevel: 'all' };
  session = await ort.InferenceSession.create(modelPath, opts);
  console.log('[Align] Model loaded.');
  return session;
}

/**
 * Normalize audio to zero mean, unit variance (wav2vec2 feature extractor).
 */
function normalizeAudio(audio) {
  const n = audio.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += audio[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) variance += (audio[i] - mean) ** 2;
  variance /= n;
  const std = Math.sqrt(variance + 1e-7);

  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) result[i] = (audio[i] - mean) / std;
  return result;
}

/**
 * Run wav2vec2 inference → log-probabilities per frame.
 * Input: 16kHz mono Float32Array
 * Output: { logProbs: Float32Array, frames: number, vocabSize: number }
 */
async function getLogProbs(audio) {
  const sess = await getSession();
  const normalized = normalizeAudio(audio);

  const inputTensor = new ort.Tensor('float32', normalized, [1, normalized.length]);
  const results = await sess.run({ input_values: inputTensor });

  // Output shape: [1, T, V] where T = frames, V = vocab size
  const logits = results.logits;
  const [, frames, vocabSize] = logits.dims;
  const data = logits.data; // Float32Array

  // Convert logits to log-softmax
  const logProbs = new Float32Array(frames * vocabSize);
  for (let t = 0; t < frames; t++) {
    const offset = t * vocabSize;
    // Find max for numerical stability
    let maxVal = -Infinity;
    for (let v = 0; v < vocabSize; v++) {
      if (data[offset + v] > maxVal) maxVal = data[offset + v];
    }
    // Compute log-sum-exp
    let sumExp = 0;
    for (let v = 0; v < vocabSize; v++) {
      sumExp += Math.exp(data[offset + v] - maxVal);
    }
    const logSumExp = maxVal + Math.log(sumExp);
    // Log-softmax
    for (let v = 0; v < vocabSize; v++) {
      logProbs[offset + v] = data[offset + v] - logSumExp;
    }
  }

  return { logProbs, frames, vocabSize };
}

/**
 * Convert text to CTC target sequence with blanks.
 * "AT HONDA" → [ε, A, ε, T, ε, |, ε, H, ε, O, ε, N, ε, D, ε, A, ε]
 *
 * Returns { targets: number[], charInfo: Array<{char, wordIdx, isBlank, isSep}> }
 */
function textToTargets(text) {
  // Uppercase, collapse whitespace, strip unsupported chars
  const clean = text.toUpperCase().replace(/\s+/g, ' ').trim();
  const chars = [];

  for (const ch of clean) {
    if (ch === ' ') {
      chars.push({ char: '|', id: WORD_SEP_ID, isSep: true });
    } else if (VOCAB[ch] !== undefined) {
      chars.push({ char: ch, id: VOCAB[ch], isSep: false });
    }
    // Skip unknown chars silently
  }

  // Build CTC target: blank between every char, plus start/end blanks
  const targets = [];
  const charInfo = [];

  targets.push(BLANK_ID);
  charInfo.push({ char: 'ε', wordIdx: -1, isBlank: true, isSep: false });

  // Track word index
  let wordIdx = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].isSep) {
      targets.push(chars[i].id);
      charInfo.push({ char: '|', wordIdx: -1, isBlank: false, isSep: true });
      wordIdx++;
    } else {
      targets.push(chars[i].id);
      charInfo.push({ char: chars[i].char, wordIdx, isBlank: false, isSep: false });
    }
    targets.push(BLANK_ID);
    charInfo.push({ char: 'ε', wordIdx: -1, isBlank: true, isSep: false });
  }

  return { targets, charInfo };
}

/**
 * CTC Viterbi forced alignment.
 *
 * Given log-probabilities [T × V] and a target sequence with blanks [S],
 * finds the optimal frame-to-token alignment.
 *
 * Returns: number[] of length T — the target index assigned to each frame.
 */
function ctcViterbiAlign(logProbs, frames, vocabSize, targets) {
  const S = targets.length;
  const NEG_INF = -1e9;

  // dp[s] = best log-prob ending in state s at current frame
  let dp = new Float64Array(S).fill(NEG_INF);
  let prev = new Float64Array(S).fill(NEG_INF);

  // Backpointers: backPtr[t][s] = previous state index
  const backPtr = new Array(frames);
  for (let t = 0; t < frames; t++) backPtr[t] = new Int32Array(S).fill(-1);

  // Initialize frame 0: can only start at state 0 (first blank) or state 1 (first char)
  dp[0] = logProbs[0 * vocabSize + targets[0]];
  if (S > 1) {
    dp[1] = logProbs[0 * vocabSize + targets[1]];
  }

  // Fill
  for (let t = 1; t < frames; t++) {
    const frameOffset = t * vocabSize;
    // Swap buffers
    [prev, dp] = [dp, prev];
    dp.fill(NEG_INF);

    for (let s = 0; s < S; s++) {
      const emitLogP = logProbs[frameOffset + targets[s]];

      // Option 1: stay in same state
      let bestLogP = prev[s];
      let bestPrev = s;

      // Option 2: come from previous state (s-1)
      if (s >= 1 && prev[s - 1] > bestLogP) {
        bestLogP = prev[s - 1];
        bestPrev = s - 1;
      }

      // Option 3: skip over blank (s-2), only if s-1 is blank AND targets[s] != targets[s-2]
      if (s >= 2 && targets[s - 1] === BLANK_ID && targets[s] !== targets[s - 2]) {
        if (prev[s - 2] > bestLogP) {
          bestLogP = prev[s - 2];
          bestPrev = s - 2;
        }
      }

      if (bestLogP > NEG_INF) {
        dp[s] = bestLogP + emitLogP;
        backPtr[t][s] = bestPrev;
      }
    }
  }

  // Find best final state (must be last blank S-1 or last char S-2)
  let bestFinalState = S - 1;
  if (S >= 2 && dp[S - 2] > dp[S - 1]) {
    bestFinalState = S - 2;
  }

  // Backtrack
  const alignment = new Int32Array(frames);
  alignment[frames - 1] = bestFinalState;
  for (let t = frames - 1; t > 0; t--) {
    alignment[t - 1] = backPtr[t][alignment[t]];
  }

  return alignment;
}

/**
 * Main alignment function.
 *
 * @param {Float32Array} audio - 16kHz mono PCM
 * @param {Array<{text: string}>} words - words from Whisper (order matters, timestamps ignored)
 * @returns {Array<{word: string, start: number, end: number}>} - precise timestamps in seconds
 */
/**
 * Align a single chunk of audio against a subset of words.
 * Returns word-level timestamps adjusted by audioOffset.
 */
async function alignChunk(fullLogProbs, totalFrames, vocabSize, words, wordIndexOffset, fromFrame, toFrame, audioOffset) {
  const chunkFrames = toFrame - fromFrame;
  if (chunkFrames <= 0 || words.length === 0) return [];

  // Extract logProbs slice for this chunk
  const chunkLogProbs = new Float32Array(chunkFrames * vocabSize);
  for (let t = 0; t < chunkFrames; t++) {
    const srcOffset = (fromFrame + t) * vocabSize;
    const dstOffset = t * vocabSize;
    for (let v = 0; v < vocabSize; v++) {
      chunkLogProbs[dstOffset + v] = fullLogProbs[srcOffset + v];
    }
  }

  const text = words.map(w => w.text.trim()).join(' ');
  const { targets, charInfo } = textToTargets(text);
  if (targets.length === 0) return [];

  const alignment = ctcViterbiAlign(chunkLogProbs, chunkFrames, vocabSize, targets);

  // Extract word boundaries
  const wordBounds = new Map();
  for (let t = 0; t < chunkFrames; t++) {
    const stateIdx = alignment[t];
    if (stateIdx < 0 || stateIdx >= charInfo.length) continue;
    const info = charInfo[stateIdx];
    if (info.isBlank || info.isSep) continue;
    const wIdx = info.wordIdx;
    if (!wordBounds.has(wIdx)) {
      wordBounds.set(wIdx, { firstFrame: t, lastFrame: t });
    } else {
      wordBounds.get(wIdx).lastFrame = t;
    }
  }

  const result = [];
  for (let i = 0; i < words.length; i++) {
    const bounds = wordBounds.get(i);
    if (bounds) {
      result.push({
        word: words[i].text.trim(),
        start: parseFloat(((fromFrame + bounds.firstFrame) * FRAME_DURATION_S + audioOffset).toFixed(3)),
        end: parseFloat(((fromFrame + bounds.lastFrame + 1) * FRAME_DURATION_S + audioOffset).toFixed(3)),
      });
    } else {
      const prevEnd = result.length > 0 ? result[result.length - 1].end : (fromFrame * FRAME_DURATION_S + audioOffset);
      result.push({ word: words[i].text.trim(), start: prevEnd, end: prevEnd + 0.2 });
    }
  }
  return result;
}

/**
 * Main alignment function.
 * Splits words into segments (by Whisper's approximate timestamps) and
 * aligns each segment independently to prevent drift.
 *
 * @param {Float32Array} audio - 16kHz mono PCM
 * @param {Array<{text: string, start?: number, end?: number}>} words - words with optional Whisper timestamps
 * @param {number} startTime - hint: approximate time of first speech (seconds)
 * @returns {Array<{word: string, start: number, end: number}>} - precise timestamps
 */
async function align(audio, words, startTime = 0) {
  console.log(`[Align] Running wav2vec2 on ${(audio.length / 16000).toFixed(1)}s audio, ${words.length} words...`);

  // Run wav2vec2 on full audio once (expensive step)
  const { logProbs, frames, vocabSize } = await getLogProbs(audio);
  console.log(`[Align] Got ${frames} frames (${(frames * FRAME_DURATION_S).toFixed(2)}s)`);

  if (frames === 0 || words.length === 0) {
    return words.map(w => ({ word: w.text.trim(), start: 0, end: 0 }));
  }

  // Split words into segments using their approximate timestamps.
  // A new segment starts when there's a gap > 1.5s between words (likely a pause/sentence break).
  const SEGMENT_GAP_S = 1.5;
  const MARGIN_S = 0.5; // extra margin around each segment
  const segments = []; // { words: [], approxStart, approxEnd }
  let currentSeg = { words: [words[0]], approxStart: words[0].start || startTime, approxEnd: words[0].end || startTime + 0.5 };

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const wStart = w.start || (currentSeg.approxEnd + 0.1);
    const wEnd = w.end || (wStart + 0.3);
    const gap = wStart - currentSeg.approxEnd;

    if (gap > SEGMENT_GAP_S) {
      segments.push(currentSeg);
      currentSeg = { words: [w], approxStart: wStart, approxEnd: wEnd };
    } else {
      currentSeg.words.push(w);
      currentSeg.approxEnd = Math.max(currentSeg.approxEnd, wEnd);
    }
  }
  segments.push(currentSeg);

  console.log(`[Align] Split into ${segments.length} segments for chunked alignment`);

  // Align each segment independently against its audio window
  const allResults = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const fromS = Math.max(0, seg.approxStart - MARGIN_S);
    const toS = Math.min(frames * FRAME_DURATION_S, seg.approxEnd + MARGIN_S);
    const fromFrame = Math.max(0, Math.floor(fromS / FRAME_DURATION_S));
    const toFrame = Math.min(frames, Math.ceil(toS / FRAME_DURATION_S));

    console.log(`[Align]   Segment ${s + 1}: ${seg.words.length} words, audio window ${fromS.toFixed(2)}-${toS.toFixed(2)}s (${toFrame - fromFrame} frames)`);

    const chunkResult = await alignChunk(logProbs, frames, vocabSize, seg.words, 0, fromFrame, toFrame, 0);
    allResults.push(...chunkResult);
  }

  console.log(`[Align] Aligned ${allResults.length} words. First: "${allResults[0]?.word}" at ${allResults[0]?.start}s, Last: "${allResults[allResults.length - 1]?.word}" at ${allResults[allResults.length - 1]?.start}s`);
  return allResults;
}

module.exports = { init, isModelReady, downloadModel, align };
