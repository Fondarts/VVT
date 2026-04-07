import type { TranscriptionResult } from '../shared/types';

export type WhisperModel =
  | 'Xenova/whisper-tiny'
  | 'Xenova/whisper-base'
  | 'Xenova/whisper-small';

export const WHISPER_MODELS: { id: WhisperModel; label: string; size: string }[] = [
  { id: 'Xenova/whisper-tiny',  label: 'Tiny',  size: '~75 MB'  },
  { id: 'Xenova/whisper-base',  label: 'Base',  size: '~145 MB' },
  { id: 'Xenova/whisper-small', label: 'Small', size: '~460 MB' },
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

// ── Subtitle building from word-level timestamps ──────────────────

const MAX_SUBTITLE_CHARS = 80;

/**
 * Aggregate word-level Whisper chunks into subtitle segments.
 * A new segment starts when:
 *  - the current word ends with sentence-ending punctuation (. ? !)
 *  - OR adding the next word would exceed MAX_SUBTITLE_CHARS
 * Timestamps come directly from the word data — no estimation needed.
 */
function buildSegmentsFromWords(
  words: Array<{ timestamp: [number, number | null]; text: string }>,
  cleanFn: (s: string) => string
): Array<{ from: number; to: number; text: string }> {
  const segs: Array<{ from: number; to: number; text: string }> = [];
  let buf = '';
  let segFrom: number | null = null;
  let segTo = 0;

  const flush = () => {
    const t = cleanFn(buf);
    if (t && segFrom !== null) {
      segs.push({ from: Math.round(segFrom * 1000), to: Math.round(segTo * 1000), text: t });
    }
    buf = '';
    segFrom = null;
  };

  for (const word of words) {
    const cleaned = cleanFn(word.text);
    if (!cleaned) continue; // skip noise tags / empty tokens

    const wStart = word.timestamp[0] ?? 0;
    const wEnd   = word.timestamp[1] ?? wStart + 0.3;

    // Split if adding this word would overflow the line
    if (segFrom !== null && cleanFn(buf + word.text).length > MAX_SUBTITLE_CHARS) {
      flush();
    }

    if (segFrom === null) segFrom = wStart;
    buf   += word.text;
    segTo  = wEnd;

    // Split at sentence boundaries
    if (/[.?!]$/.test(cleaned)) flush();
  }
  flush();

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

const HELPER_URL = 'http://127.0.0.1:3777';

/**
 * Extract mono 16kHz Float32Array from any audio/video file.
 * Tries Helper (native FFmpeg) first for reliable extraction from any codec,
 * falls back to browser's Web Audio API.
 */
async function extractAudio16k(file: File): Promise<Float32Array> {
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
              // Parse WAV: skip 44-byte header, read as float32 PCM
              const pcmData = new Float32Array(wavBuffer.slice(44).byteLength / 4);
              new Float32Array(wavBuffer.slice(44)).forEach((v, i) => { pcmData[i] = v; });
              // Actually, FFmpeg outputs 16-bit PCM by default. Read as Int16 and convert.
              const int16 = new Int16Array(wavBuffer.slice(44));
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
              console.log('[Whisper] Audio extracted via helper:', float32.length, 'samples,', (float32.length / 16000).toFixed(1), 'seconds');
              return float32;
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
  return resampled.getChannelData(0);
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

  onStatus?.('Extracting audio…');
  const audio = await extractAudio16k(file);

  return new Promise<TranscriptionResult>((resolve, reject) => {
    const worker = getWorker();

    const handler = ({ data }: MessageEvent) => {
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

        const wordChunks: Array<{ timestamp: [number, number | null]; text: string }> =
          output.chunks ?? [];

        // Strip Whisper noise/non-speech tags: [MUSIC PLAYING], [Music], [Noise], ♪, etc.
        // Catches any bracketed tag that contains common non-speech keywords
        const NOISE_TAG = /\s*\[[^\]]*?\b(MUSIC|Music|music|PLAYING|playing|BEEP|BEP|Beep|Applause|applause|Noise|noise|Laughter|laughter|BLANK_AUDIO|Silence|silence|inaudible|INAUDIBLE|background|BACKGROUND|crosstalk|CROSSTALK)\b[^\]]*?\]\s*/g;
        const MUSIC_NOTES = /[♪♫]+/g;

        function cleanText(raw: string): string {
          return raw.replace(NOISE_TAG, ' ').replace(MUSIC_NOTES, ' ').replace(/\s{2,}/g, ' ').trim();
        }

        // Build subtitle segments directly from word-level timestamps
        const segments = buildSegmentsFromWords(wordChunks, cleanText);

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
