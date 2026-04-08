import type { TranscriptionResult } from '../shared/types';

export type WhisperModel =
  | 'Xenova/whisper-tiny'
  | 'Xenova/whisper-base'
  | 'Xenova/whisper-small'
  | 'whisperx/tiny'
  | 'whisperx/base'
  | 'whisperx/small'
  | 'whisperx/medium'
  | 'whisperx/large-v3';

export const WHISPER_MODELS: { id: WhisperModel; label: string; size: string; group: 'browser' | 'whisperx' }[] = [
  { id: 'Xenova/whisper-tiny',  label: 'Tiny',      size: '~75 MB',   group: 'browser'  },
  { id: 'Xenova/whisper-base',  label: 'Base',      size: '~145 MB',  group: 'browser'  },
  { id: 'Xenova/whisper-small', label: 'Small',     size: '~460 MB',  group: 'browser'  },
  { id: 'whisperx/tiny',        label: 'Tiny',      size: '~75 MB',   group: 'whisperx' },
  { id: 'whisperx/base',        label: 'Base',      size: '~145 MB',  group: 'whisperx' },
  { id: 'whisperx/small',       label: 'Small',     size: '~460 MB',  group: 'whisperx' },
  { id: 'whisperx/medium',      label: 'Medium',    size: '~1.5 GB',  group: 'whisperx' },
  { id: 'whisperx/large-v3',    label: 'Large v3',  size: '~3 GB',    group: 'whisperx' },
];

export const WHISPER_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en',   label: 'English'     },
  { code: 'es',   label: 'Spanish'     },
  { code: 'fr',   label: 'French'      },
  { code: 'de',   label: 'German'      },
  { code: 'it',   label: 'Italian'     },
  { code: 'pt',   label: 'Portuguese'  },
  { code: 'zh',   label: 'Chinese'     },
  { code: 'ja',   label: 'Japanese'    },
  { code: 'ko',   label: 'Korean'      },
];

export interface TranscribeOpts {
  model?: WhisperModel;
  language?: string;
  onStatus?: (label: string, progress?: number) => void;
}

const HELPER_URL = 'http://127.0.0.1:3777';

/** Check if WhisperX is available via helper */
export async function checkWhisperXStatus(): Promise<{ python: boolean; whisperx: boolean; installCommand?: string }> {
  try {
    const res = await fetch(`${HELPER_URL}/whisperx/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return await res.json();
  } catch {}
  return { python: false, whisperx: false };
}

function isWhisperXModel(model: WhisperModel): boolean {
  return model.startsWith('whisperx/');
}

function getWhisperXModelName(model: WhisperModel): string {
  return model.replace('whisperx/', '');
}

// ── Multi-feature Voice Activity Detection (VAD) ────────────────────────────
// Fixes Whisper hallucinating text over silence, music, or SFX.
// Uses three features to distinguish real speech from everything else:
//   1. Speech-band energy (300Hz–3kHz bandpass)
//   2. Zero-crossing rate (ZCR) — speech has characteristic ZCR range
//   3. Syllabic modulation rate — speech modulates amplitude at 3–7 Hz (syllables)

const SAMPLE_RATE = 16000;
const FRAME_S = 0.025;   // 25ms analysis frames
const HOP_S   = 0.010;   // 10ms hop

// ── IIR Filters ──

function highPassFilter(audio: Float32Array, cutoffHz: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + 1 / SAMPLE_RATE);
  const out = new Float32Array(audio.length);
  out[0] = audio[0];
  for (let i = 1; i < audio.length; i++) {
    out[i] = alpha * (out[i - 1] + audio[i] - audio[i - 1]);
  }
  return out;
}

function lowPassFilter(audio: Float32Array, cutoffHz: number): Float32Array {
  const alpha = (1 / SAMPLE_RATE) / (1 / (2 * Math.PI * cutoffHz) + 1 / SAMPLE_RATE);
  const out = new Float32Array(audio.length);
  out[0] = audio[0];
  for (let i = 1; i < audio.length; i++) {
    out[i] = out[i - 1] + alpha * (audio[i] - out[i - 1]);
  }
  return out;
}

function bandPassFilter(audio: Float32Array, lo: number, hi: number): Float32Array {
  return lowPassFilter(highPassFilter(audio, lo), hi);
}

// ── Per-frame feature extraction ──

interface VADFrame {
  time: number;   // center of frame (seconds)
  energy: number; // RMS in speech band
  zcr: number;    // zero-crossing rate (crossings per second)
}

function extractFrames(audio: Float32Array): VADFrame[] {
  const speechAudio = bandPassFilter(audio, 300, 3000);
  const frameSamples = Math.round(FRAME_S * SAMPLE_RATE);
  const hopSamples   = Math.round(HOP_S * SAMPLE_RATE);
  const frames: VADFrame[] = [];

  for (let start = 0; start + frameSamples <= audio.length; start += hopSamples) {
    // Energy in speech band
    let sum = 0;
    for (let i = start; i < start + frameSamples; i++) {
      sum += speechAudio[i] * speechAudio[i];
    }
    const energy = Math.sqrt(sum / frameSamples);

    // Zero-crossing rate on ORIGINAL audio (not filtered)
    let crossings = 0;
    for (let i = start + 1; i < start + frameSamples; i++) {
      if ((audio[i] >= 0) !== (audio[i - 1] >= 0)) crossings++;
    }
    const zcr = crossings / FRAME_S; // crossings per second

    frames.push({ time: (start + frameSamples / 2) / SAMPLE_RATE, energy, zcr });
  }
  return frames;
}

// ── Syllabic modulation detector ──
// Speech amplitude modulates at ~3–7 Hz (syllable rate).
// We compute the energy envelope, then measure the dominant modulation
// frequency using autocorrelation over a sliding 1-second window.

/**
 * Returns true if the energy envelope in [fromS, toS] has a dominant
 * amplitude modulation in the 3–7 Hz range (syllable rate).
 */
function hasSyllabicModulation(
  frames: VADFrame[],
  fromS: number,
  toS: number,
): boolean {
  const windowFrames = frames.filter(f => f.time >= fromS && f.time <= toS);
  if (windowFrames.length < 30) return false; // need ~300ms minimum

  // Energy envelope (one value per HOP_S)
  const env = windowFrames.map(f => f.energy);

  // Remove DC (mean)
  const mean = env.reduce((s, v) => s + v, 0) / env.length;
  const centered = env.map(v => v - mean);

  // Autocorrelation for lags corresponding to 2–10 Hz
  const minLag = Math.round(1 / 10 / HOP_S); // 10 Hz → ~10 frames
  const maxLag = Math.round(1 / 2 / HOP_S);  //  2 Hz → ~50 frames
  if (maxLag >= centered.length) return false;

  // Autocorrelation at lag 0 (normalization)
  let r0 = 0;
  for (let i = 0; i < centered.length; i++) r0 += centered[i] * centered[i];
  if (r0 < 1e-10) return false;

  let bestLag = minLag;
  let bestR = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i < centered.length - lag; i++) {
      r += centered[i] * centered[i + lag];
    }
    r /= r0; // normalized
    if (r > bestR) { bestR = r; bestLag = lag; }
  }

  const dominantHz = 1 / (bestLag * HOP_S);
  // Speech syllable rate: 3–7 Hz, with meaningful autocorrelation peak (>0.15)
  return dominantHz >= 3 && dominantHz <= 7 && bestR > 0.15;
}

// ── Combined VAD decision ──

/**
 * Compute adaptive energy threshold from the speech-band energy distribution.
 */
function computeEnergyThreshold(frames: VADFrame[]): number {
  const sorted = frames.map(f => f.energy).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const q15 = sorted[Math.floor(0.15 * (sorted.length - 1))];
  const q85 = sorted[Math.floor(0.85 * (sorted.length - 1))];
  return Math.max(q15, q85 * 0.15);
}

/**
 * For each frame, decide if it's speech using all three features:
 *  - energy above threshold (speech band has content)
 *  - ZCR in speech range (1000–5000 crossings/s — voiced speech)
 *  - nearby region shows syllabic modulation
 */
function classifyFrames(
  frames: VADFrame[],
  energyThreshold: number,
): boolean[] {
  // Pre-compute syllabic modulation in 1-second sliding windows (step 0.5s)
  const modMap = new Map<number, boolean>(); // slotIndex → hasMod
  const slotStep = 0.5;
  const slotWindow = 1.0;
  const totalDuration = frames.length > 0 ? frames[frames.length - 1].time : 0;
  for (let t = 0; t + slotWindow <= totalDuration; t += slotStep) {
    const key = Math.round(t / slotStep);
    modMap.set(key, hasSyllabicModulation(frames, t, t + slotWindow));
  }

  function hasNearbySyllabicMod(time: number): boolean {
    // Check the two nearest 1s windows
    const slot = Math.round(time / slotStep);
    return modMap.get(slot) === true
        || modMap.get(slot - 1) === true
        || modMap.get(slot + 1) === true;
  }

  return frames.map(f => {
    const hasEnergy = f.energy > energyThreshold;
    // Voiced speech ZCR: roughly 1000–5000 crossings/s at 16kHz
    // Pure tones (music notes) tend to be <1000, noise/sibilants >5000
    const speechZCR = f.zcr >= 500 && f.zcr <= 6000;
    const hasMod = hasNearbySyllabicMod(f.time);

    // Require energy + at least one of the other two features
    return hasEnergy && (speechZCR && hasMod);
  });
}

/**
 * Find the first time where speech is sustained for at least `minDurationS`.
 * Returns the start time of that sustained speech region.
 */
function findFirstSpeechTime(frames: VADFrame[], isSpeech: boolean[], minDurationS = 0.3): number {
  const minFrames = Math.round(minDurationS / HOP_S);
  let consecutive = 0;
  for (let i = 0; i < isSpeech.length; i++) {
    if (isSpeech[i]) {
      consecutive++;
      if (consecutive >= minFrames) {
        return frames[i - minFrames + 1].time;
      }
    } else {
      consecutive = 0;
    }
  }
  return 0;
}

/**
 * Filter out Whisper hallucinated words using multi-feature VAD.
 *
 * Strategy: use the full VAD only to find WHERE speech starts, then
 * drop every word that STARTS before that point. This avoids the
 * per-word VAD being too aggressive and killing real speech mid-stream
 * (Whisper's own timestamps are reliable once speech has begun).
 *
 * Words before firstSpeech are split into two groups:
 *  - Pure noise tags ([MUSIC], [PLAYING], etc.) → dropped entirely
 *  - Real words with bad timestamps → re-timestamped to start at firstSpeech
 *    (Whisper knows the words are there, it just gave them wrong times)
 * Words at or after firstSpeech → always kept as-is (trust Whisper).
 */
function filterSilentWords(
  words: Array<{ timestamp: [number, number | null]; text: string }>,
  audio: Float32Array,
): Array<{ timestamp: [number, number | null]; text: string }> {
  const frames = extractFrames(audio);
  const energyThreshold = computeEnergyThreshold(frames);
  const isSpeech = classifyFrames(frames, energyThreshold);
  const firstSpeech = findFirstSpeechTime(frames, isSpeech);

  const speechCount = isSpeech.filter(Boolean).length;
  console.log(`[VAD] Energy threshold: ${energyThreshold.toFixed(4)}, speech frames: ${speechCount}/${frames.length}, first speech: ${firstSpeech.toFixed(2)}s`);

  // If VAD didn't detect speech at all, don't filter anything
  if (firstSpeech === 0) return words;

  // Noise patterns — these are never real words, always drop
  const NOISE_PATTERN = /^\s*[\[♪♫]|^\s*$/;

  // Collect pre-speech real words to re-timestamp
  const preWords: typeof words = [];
  const result: typeof words = [];

  for (const w of words) {
    const wStart = w.timestamp[0] ?? 0;

    if (wStart < firstSpeech) {
      if (NOISE_PATTERN.test(w.text)) {
        console.log(`[VAD] Dropping noise "${w.text.trim()}" at ${wStart.toFixed(2)}s`);
      } else {
        // Real word with bad timestamp — save for re-timestamping
        preWords.push(w);
        console.log(`[VAD] Re-timestamping "${w.text.trim()}" from ${wStart.toFixed(2)}s → ${firstSpeech.toFixed(2)}s`);
      }
    } else {
      result.push(w);
    }
  }

  // Re-timestamp pre-speech words: pack them just before the first real word
  if (preWords.length > 0) {
    // Find where the first post-speech word starts
    const firstPostStart = result.length > 0 ? (result[0].timestamp[0] ?? firstSpeech) : firstSpeech;
    // Spread pre-speech words evenly in [firstSpeech, firstPostStart]
    const slotDuration = (firstPostStart - firstSpeech) / preWords.length;
    for (let i = 0; i < preWords.length; i++) {
      const newStart = firstSpeech + i * slotDuration;
      const newEnd = newStart + Math.max(slotDuration * 0.9, 0.15);
      result.unshift(); // placeholder — we'll build the final array below
      preWords[i] = {
        ...preWords[i],
        timestamp: [newStart, newEnd],
      };
    }
    return [...preWords, ...result];
  }

  return result;
}

// ── Subtitle segment splitting (fit to display limits) ──────────────

/**
 * Simulate word-wrapping to count how many display lines a text produces.
 */
function countWrappedLines(text: string, maxCharsPerLine: number): number {
  const words = text.split(/\s+/);
  let lines = 1;
  let lineLen = 0;
  for (const word of words) {
    const needed = lineLen > 0 ? lineLen + 1 + word.length : word.length;
    if (needed > maxCharsPerLine && lineLen > 0) {
      lines++;
      lineLen = word.length;
    } else {
      lineLen = needed;
    }
  }
  return lines;
}

/**
 * Split segments that are too long to display within maxCharsPerLine × maxLines.
 * Uses the same word-wrap logic as the renderer to ensure accurate line counting.
 * Distributes time proportionally by word count.
 */
export function splitLongSegments(
  segments: Array<{ from: number; to: number; text: string }>,
  maxCharsPerLine: number,
  maxLines: number,
): Array<{ from: number; to: number; text: string }> {
  const result: Array<{ from: number; to: number; text: string }> = [];

  for (const seg of segments) {
    if (countWrappedLines(seg.text, maxCharsPerLine) <= maxLines) {
      result.push(seg);
      continue;
    }

    // Split into sub-segments that fit within maxLines when wrapped
    const words = seg.text.split(/\s+/);
    const totalWords = words.length;
    const totalDuration = seg.to - seg.from;
    const msPerWord = totalWords > 0 ? totalDuration / totalWords : 0;

    const subs: Array<{ words: string[]; startIdx: number }> = [];
    let buf: string[] = [];
    let bufStartIdx = 0;

    for (let i = 0; i < words.length; i++) {
      const candidate = [...buf, words[i]].join(' ');
      if (countWrappedLines(candidate, maxCharsPerLine) > maxLines && buf.length > 0) {
        // Flush current buffer
        subs.push({ words: [...buf], startIdx: bufStartIdx });
        buf = [words[i]];
        bufStartIdx = i;
      } else {
        buf.push(words[i]);
      }
    }
    if (buf.length > 0) {
      subs.push({ words: [...buf], startIdx: bufStartIdx });
    }

    // Build sub-segments with proportional timing
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const from = i === 0
        ? seg.from
        : Math.round(seg.from + sub.startIdx * msPerWord) + 1;
      const to = i === subs.length - 1
        ? seg.to
        : Math.round(seg.from + (sub.startIdx + sub.words.length) * msPerWord);
      result.push({ from, to, text: sub.words.join(' ') });
    }
  }

  return result;
}

// ── Subtitle building from word-level timestamps ──────────────────

const MAX_SUBTITLE_CHARS = 80;
/** Silence gap (seconds) between words that triggers a segment break */
const SILENCE_GAP_THRESHOLD = 0.35;
/** Minimum padding (ms) trimmed from segment edges to avoid bleeding into silence */
const EDGE_PAD_MS = 30;
/** Minimum gap (ms) between consecutive segments so they don't flash */
const MIN_INTER_SEGMENT_GAP_MS = 80;
/** Comma/semicolon with a silence gap above this triggers a break */
const CLAUSE_GAP_THRESHOLD = 0.25;

/**
 * Aggregate word-level Whisper chunks into subtitle segments.
 * Splits on:
 *  1. Sentence-ending punctuation (. ? !)
 *  2. Silence gaps between words (> SILENCE_GAP_THRESHOLD)
 *  3. Clause boundaries (, ; :) when followed by a meaningful pause
 *  4. Character overflow (> MAX_SUBTITLE_CHARS)
 *
 * After building, segments are snapped so they start/end at silence
 * boundaries and don't overlap or flash.
 */
function buildSegmentsFromWords(
  words: Array<{ timestamp: [number, number | null]; text: string }>,
  cleanFn: (s: string) => string,
  /** When true (forced-aligned), don't split on inter-word silence gaps */
  preciseTimestamps = false,
): Array<{ from: number; to: number; text: string }> {
  // Filter to valid words with timestamps
  const validWords = words
    .map(w => ({
      text: w.text,
      cleaned: cleanFn(w.text),
      start: w.timestamp[0] ?? 0,
      end: w.timestamp[1] ?? (w.timestamp[0] ?? 0) + 0.3,
    }))
    .filter(w => w.cleaned.length > 0);

  if (validWords.length === 0) return [];

  const segs: Array<{ from: number; to: number; text: string }> = [];
  let buf = '';
  let segFrom: number | null = null;
  let segTo = 0;

  const flush = () => {
    const t = cleanFn(buf);
    if (t && segFrom !== null) {
      segs.push({
        from: Math.round(segFrom * 1000),
        to:   Math.round(segTo * 1000),
        text: t,
      });
    }
    buf = '';
    segFrom = null;
  };

  for (let i = 0; i < validWords.length; i++) {
    const w = validWords[i];

    // Character overflow — flush before adding this word
    if (segFrom !== null && cleanFn(buf + w.text).length > MAX_SUBTITLE_CHARS) {
      flush();
    }

    if (segFrom === null) segFrom = w.start;
    buf   += w.text;
    segTo  = w.end;

    // Sentence-ending punctuation — always split
    if (/[.?!]$/.test(w.cleaned)) { flush(); continue; }

    // Check the gap to the NEXT word (only for approximate Whisper timestamps)
    if (!preciseTimestamps && i < validWords.length - 1) {
      const gap = validWords[i + 1].start - w.end;

      // Large silence gap — natural break point
      if (gap >= SILENCE_GAP_THRESHOLD) { flush(); continue; }

      // Clause boundary (, ; :) with a noticeable pause
      if (gap >= CLAUSE_GAP_THRESHOLD && /[,;:]$/.test(w.cleaned)) { flush(); continue; }
    }
  }
  flush();

  // ── Post-process: snap edges and enforce minimum inter-segment gaps ──
  for (let i = 0; i < segs.length; i++) {
    // Pad segment start forward (don't start during silence before speech)
    if (i > 0) {
      const prevEnd = segs[i - 1].to;
      const gapMs = segs[i].from - prevEnd;
      if (gapMs > MIN_INTER_SEGMENT_GAP_MS) {
        // Start this segment a bit after the silence begins
        segs[i].from = Math.min(segs[i].from + EDGE_PAD_MS, segs[i].to - 1);
      }
    }
    // Pad segment end backward (don't linger into silence after speech)
    if (i < segs.length - 1) {
      const nextStart = segs[i + 1].from;
      const gapMs = nextStart - segs[i].to;
      if (gapMs > MIN_INTER_SEGMENT_GAP_MS) {
        segs[i].to = Math.max(segs[i].to - EDGE_PAD_MS, segs[i].from + 1);
      }
    }
    // Enforce minimum gap between consecutive segments
    if (i < segs.length - 1) {
      const overlap = segs[i].to - segs[i + 1].from;
      if (overlap >= 0) {
        const mid = Math.round((segs[i].to + segs[i + 1].from) / 2);
        segs[i].to = mid - Math.round(MIN_INTER_SEGMENT_GAP_MS / 2);
        segs[i + 1].from = mid + Math.round(MIN_INTER_SEGMENT_GAP_MS / 2);
      }
    }
  }

  return segs;
}

// Singleton worker — model stays in memory between calls
let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL('../workers/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return _worker;
}

/** Spin up the worker thread in the background so it's ready when the user transcribes. */
export function preloadWhisperWorker(): void {
  getWorker();
}

/**
 * Check if a Whisper model is already cached in browser Cache Storage.
 * @xenova/transformers caches model files at their huggingface.co CDN URLs.
 */
export async function checkModelCached(model: WhisperModel): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    const modelShortName = model.split('/')[1]; // e.g. 'whisper-tiny'
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some(req => req.url.includes(modelShortName))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

interface AudioExtraction {
  audio: Float32Array;
  /** Path to the WAV on the helper server (if extracted via helper) — reused for alignment */
  wavPath?: string;
}

/**
 * Extract mono 16kHz Float32Array from any audio/video file.
 * Tries Helper (native FFmpeg) first for reliable extraction from any codec,
 * falls back to browser's Web Audio API.
 */
async function extractAudio16k(file: File): Promise<AudioExtraction> {
  // Try native FFmpeg via helper — works with ProRes, MXF, etc.
  try {
    const health = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (health?.ok) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const uploadRes = await fetch(`${HELPER_URL}/upload-video?ext=${ext}`, { method: 'POST', body: file });
      if (uploadRes.ok) {
        const { path: inputPath } = await uploadRes.json();
        if (inputPath) {
          // Extract audio as 16kHz mono WAV via helper
          const extractRes = await fetch(`${HELPER_URL}/extract-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputPath }),
          });
          if (extractRes.ok) {
            const { path: wavPath } = await extractRes.json();
            if (wavPath) {
              const wavRes = await fetch(`${HELPER_URL}/serve-file?path=${encodeURIComponent(wavPath)}`);
              const wavBuffer = await wavRes.arrayBuffer();
              const int16 = new Int16Array(wavBuffer.slice(44));
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
              console.log('[Whisper] Audio extracted via helper:', float32.length, 'samples,', (float32.length / 16000).toFixed(1), 'seconds');
              return { audio: float32, wavPath };
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Whisper] Helper audio extraction failed, falling back to browser:', e);
  }

  // Fallback: browser Web Audio API (limited codec support)
  const arrayBuffer = await file.arrayBuffer();
  const decodeCtx = new AudioContext();
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const targetRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * targetRate),
    targetRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const resampled = await offlineCtx.startRendering();
  return { audio: resampled.getChannelData(0) };
}

/**
 * Try forced alignment via Helper's wav2vec2 endpoint.
 * Returns re-timestamped word chunks, or null if not available.
 */
async function tryForcedAlignment(
  wavPath: string,
  words: Array<{ timestamp: [number, number | null]; text: string }>,
): Promise<Array<{ timestamp: [number, number | null]; text: string }> | null> {
  try {
    // Check if alignment is available
    const statusRes = await fetch(`${HELPER_URL}/align/status`, { signal: AbortSignal.timeout(2000) });
    if (!statusRes.ok) return null;
    const status = await statusRes.json();
    if (!status.available || !status.modelReady) {
      console.log('[Align] Model not ready, skipping forced alignment');
      return null;
    }

    // Clean words for alignment (strip noise tags, keep only real words)
    // Matches: [MUSIC, PLAYING], [Silence], ♪, etc. — both halves of split tags
    const NOISE_PATTERN = /[\[♪♫]|^\s*\]|MUSIC|PLAYING|BLANK_AUDIO|Silence|Noise|Laughter|Applause/i;
    const cleanWords = words
      .filter(w => {
        const t = w.text.trim();
        return t.length > 0 && !NOISE_PATTERN.test(t);
      })
      .map(w => ({
        text: w.text.trim(),
        start: w.timestamp[0] ?? 0,
        end: w.timestamp[1] ?? (w.timestamp[0] ?? 0) + 0.3,
      }));

    if (cleanWords.length === 0) return null;

    // Find the earliest real word timestamp as a speech-start hint
    // This tells the aligner to skip the music/silence intro
    const firstRealWord = words.find(w => {
      const t = w.text.trim();
      return t.length > 0 && !NOISE_PATTERN.test(t) && (w.timestamp[0] ?? 0) > 0;
    });
    const startTime = firstRealWord ? (firstRealWord.timestamp[0] ?? 0) : 0;

    console.log(`[Align] Sending ${cleanWords.length} words, speech hint: ${startTime.toFixed(2)}s`);

    const alignRes = await fetch(`${HELPER_URL}/align`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wavPath, words: cleanWords, startTime }),
    });

    if (!alignRes.ok) {
      const err = await alignRes.json().catch(() => ({}));
      console.warn('[Align] Failed:', err.error || alignRes.status);
      return null;
    }

    const { words: aligned } = await alignRes.json();
    if (!aligned || aligned.length === 0) return null;

    console.log(`[Align] Got ${aligned.length} aligned words. First: "${aligned[0].word}" at ${aligned[0].start}s`);

    // Convert back to Whisper chunk format
    return aligned.map((a: { word: string; start: number; end: number }) => ({
      timestamp: [a.start, a.end] as [number, number | null],
      text: ' ' + a.word,
    }));
  } catch (e) {
    console.warn('[Align] Forced alignment failed, using Whisper timestamps:', e);
    return null;
  }
}

export async function transcribeFile(
  file: File,
  opts: TranscribeOpts = {}
): Promise<TranscriptionResult> {
  const {
    model = 'Xenova/whisper-base',
    language = 'auto',
    onStatus,
  } = opts;

  // Route WhisperX models to the helper
  if (isWhisperXModel(model)) {
    return transcribeWithWhisperX(file, model, language, onStatus);
  }

  onStatus?.('Extracting audio…');
  const { audio, wavPath } = await extractAudio16k(file);

  return new Promise<TranscriptionResult>((resolve, reject) => {
    const worker = getWorker();

    const handler = async ({ data }: MessageEvent) => {
      if (data.type === 'status') {
        if (data.status === 'loading_model') {
          const pct = data.progress ? Math.round(data.progress) : 0;
          onStatus?.(`Downloading model… ${pct}%`, pct);
        } else if (data.status === 'transcribing') {
          onStatus?.('Transcribing…');
        }
      } else if (data.type === 'result') {
        worker.removeEventListener('message', handler);
        const output = data.output;

        const rawChunks: Array<{ timestamp: [number, number | null]; text: string }> =
          output.chunks ?? [];

        // Strip Whisper noise/non-speech tags
        const NOISE_TAG = /\s*\[[^\]]*?\b(MUSIC|Music|music|PLAYING|playing|BEEP|BEP|Beep|Applause|applause|Noise|noise|Laughter|laughter|BLANK_AUDIO|Silence|silence|inaudible|INAUDIBLE|background|BACKGROUND|crosstalk|CROSSTALK)\b[^\]]*?\]\s*/g;
        const MUSIC_NOTES = /[♪♫]+/g;

        function cleanText(raw: string): string {
          return raw.replace(NOISE_TAG, ' ').replace(MUSIC_NOTES, ' ').replace(/\s{2,}/g, ' ').trim();
        }

        // Try forced alignment via Helper (wav2vec2) for precise timestamps
        let wordChunks = rawChunks;
        let usedForcedAlign = false;
        if (wavPath) {
          onStatus?.('Aligning timestamps…');
          const aligned = await tryForcedAlignment(wavPath, rawChunks);
          if (aligned) {
            console.log('[Whisper] Using forced-aligned timestamps (wav2vec2)');
            wordChunks = aligned;
            usedForcedAlign = true;
          } else {
            // Fallback: VAD-based filtering for hallucinated words
            console.log('[Whisper] Using VAD-filtered Whisper timestamps');
            wordChunks = filterSilentWords(rawChunks, audio);
          }
        } else {
          // No helper — use VAD filtering
          wordChunks = filterSilentWords(rawChunks, audio);
        }

        // Build subtitle segments — with precise mode when forced-aligned
        const segments = buildSegmentsFromWords(wordChunks, cleanText, usedForcedAlign);

        const rawFullText = output.text ?? '';
        const fullText = cleanText(rawFullText) || segments.map(s => s.text).join(' ');

        resolve({
          segments,
          fullText,
          language: language === 'auto' ? undefined : language,
        });
      } else if (data.type === 'error') {
        worker.removeEventListener('message', handler);
        reject(new Error(data.message));
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'transcribe', audio, model, language });
  });
}

/**
 * Ensure WhisperX is installed. If not, installs it via Helper (pip install).
 * Streams install progress through onStatus.
 */
async function ensureWhisperXInstalled(
  onStatus?: (label: string, progress?: number) => void,
): Promise<void> {
  // Check helper is running
  const healthRes = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
  if (!healthRes?.ok) throw new Error('KISSD Helper is not running. Start it first.');

  // Check WhisperX status
  const statusRes = await fetch(`${HELPER_URL}/whisperx/status`, { signal: AbortSignal.timeout(5000) });
  if (!statusRes.ok) throw new Error('Helper does not support WhisperX. Update the Helper.');
  const status = await statusRes.json();

  if (!status.python) {
    throw new Error('Python 3.10+ not found. Install Python from python.org and restart the Helper.');
  }

  if (status.whisperx) return; // Already installed

  // Install WhisperX
  onStatus?.('Installing WhisperX (first time only, may take a few minutes)…');

  const installRes = await fetch(`${HELPER_URL}/whisperx/install`, { method: 'POST' });
  if (!installRes.ok) {
    const err = await installRes.json().catch(() => ({ error: 'Install failed' }));
    throw new Error(err.error || 'Failed to install WhisperX');
  }

  // If already installed (JSON response)
  const contentType = installRes.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return; // already_installed
  }

  // Parse SSE install stream
  const reader = installRes.body?.getReader();
  if (!reader) throw new Error('No install stream');

  const decoder = new TextDecoder();
  let installError: string | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.status === 'installing') {
          onStatus?.(`Installing: ${data.message?.slice(0, 60) || '...'}…`);
        } else if (data.status === 'error') {
          installError = data.error || 'Install failed';
        } else if (data.status === 'done') {
          installError = null; // success
        }
      } catch {
        // ignore JSON parse errors from partial chunks
      }
    }
  }

  if (installError) throw new Error(installError);

  // Verify installation actually worked
  onStatus?.('Verifying installation…');
  const verifyRes = await fetch(`${HELPER_URL}/whisperx/status`, { signal: AbortSignal.timeout(5000) });
  if (verifyRes.ok) {
    const verifyStatus = await verifyRes.json();
    if (!verifyStatus.whisperx) {
      throw new Error('WhisperX installation failed. Try manually: pip install whisperx');
    }
  }
}

/**
 * Transcribe via WhisperX (Python, via Helper).
 * Auto-installs WhisperX if not present.
 * Handles the full pipeline: Whisper + Silero VAD + wav2vec2 alignment.
 */
async function transcribeWithWhisperX(
  file: File,
  model: string,
  language: string,
  onStatus?: (label: string, progress?: number) => void,
): Promise<TranscriptionResult> {
  // Ensure WhisperX is installed (auto-install on first use)
  await ensureWhisperXInstalled(onStatus);

  onStatus?.('Uploading to Helper…');

  // Upload file to helper
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const uploadRes = await fetch(`${HELPER_URL}/upload-video?ext=${ext}`, { method: 'POST', body: file });
  if (!uploadRes.ok) throw new Error('Failed to upload file to helper');
  const { path: inputPath } = await uploadRes.json();

  onStatus?.('Starting WhisperX…');

  // Call WhisperX transcribe endpoint (SSE stream)
  const response = await fetch(`${HELPER_URL}/whisperx/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputPath,
      model: getWhisperXModelName(model as WhisperModel),
      language,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `WhisperX failed: ${response.status}`);
  }

  // Parse SSE stream
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let resultData: { words: Array<{ word: string; start: number; end: number }>; segments: Array<{ text: string; start: number; end: number }>; language: string } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.status === 'loading_model') onStatus?.('Loading WhisperX model…');
        else if (data.status === 'transcribing') onStatus?.('Transcribing (WhisperX)…');
        else if (data.status === 'aligning') onStatus?.('Aligning timestamps…');
        else if (data.status === 'result') resultData = data;
        else if (data.status === 'error') throw new Error(data.error);
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
  }

  if (!resultData || !resultData.segments) {
    throw new Error('No result from WhisperX');
  }

  console.log(`[WhisperX] Got ${resultData.words.length} words, ${resultData.segments.length} segments`);

  // Convert WhisperX segments to our format (milliseconds)
  const segments = resultData.segments.map(seg => ({
    from: Math.round(seg.start * 1000),
    to: Math.round(seg.end * 1000),
    text: seg.text,
  }));

  const fullText = segments.map(s => s.text).join(' ');

  return {
    segments,
    fullText,
    language: resultData.language,
  };
}
