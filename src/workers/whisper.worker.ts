import { pipeline, env } from '@xenova/transformers';

// Use IndexedDB cache so the model isn't re-downloaded on every session
env.allowLocalModels = false;
env.useBrowserCache = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentPipe: any = null;
let currentModel: string | null = null;

self.onmessage = async ({ data }: MessageEvent) => {
  if (data.type !== 'transcribe') return;

  const { audio, model, language } = data as {
    type: 'transcribe';
    audio: Float32Array;
    model: string;
    language: string;
  };

  try {
    // Load or reuse pipeline
    if (!currentPipe || currentModel !== model) {
      self.postMessage({ type: 'status', status: 'loading_model', progress: 0 });

      currentPipe = await pipeline('automatic-speech-recognition', model, {
        quantized: true,
        progress_callback: (p: { status: string; progress?: number; file?: string }) => {
          if (p.status === 'progress') {
            self.postMessage({
              type: 'status',
              status: 'loading_model',
              progress: p.progress ?? 0,
              file: p.file,
            });
          }
        },
      });
      currentModel = model;
    }

    self.postMessage({ type: 'status', status: 'transcribing' });

    const output = await (currentPipe as any)(audio, {
      return_timestamps: 'word',
      language: language === 'auto' ? null : language,
      chunk_length_s: 30,
      stride_length_s: 5,
      condition_on_previous_text: false,
    });

    self.postMessage({ type: 'result', output });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
