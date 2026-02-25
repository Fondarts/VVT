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

/** Extract mono 16kHz Float32Array from any browser-decodable audio/video file. */
async function extractAudio16k(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const decodeCtx = new AudioContext();
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  // Resample to 16 kHz mono using OfflineAudioContext
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

        // Strip Whisper noise/non-speech tags: [BEEP], [Music], [Noise], ♪, etc.
        const NOISE_TAG = /\s*\[(BEEP|BEP|Music|MUSIC|Applause|APPLAUSE|Noise|NOISE|Laughter|LAUGHTER|BLANK_AUDIO|Silence|SILENCE|inaudible|INAUDIBLE)\]\s*/gi;
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
