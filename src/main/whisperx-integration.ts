import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { extractAudioWav } from './whisper-integration';

// ── Types ────────────────────────────────────────────────────────

interface TranscriptionSegmentRaw { from: number; to: number; text: string }

export interface WhisperXOptions {
  model: string;         // tiny | base | small | medium | large-v2 | large-v3
  language: string;      // auto | en | es | ...
  computeType: string;   // int8 | float32
  device: string;        // cpu | cuda
}

export interface WhisperXConfig {
  model: string;
  computeType: string;
  device: string;
}

let wxConfig: WhisperXConfig = {
  model: 'base',
  computeType: 'int8',
  device: 'cpu',
};

export function setWhisperXConfig(cfg: Partial<WhisperXConfig>) {
  wxConfig = { ...wxConfig, ...cfg };
}

export function getWhisperXConfig(): WhisperXConfig {
  return { ...wxConfig };
}

// ── Check / Install ──────────────────────────────────────────────

// Check via Python import (most reliable on Windows)
export function checkWhisperX(): Promise<{ available: boolean }> {
  return new Promise(resolve => {
    const child = spawn('python', ['-c', 'import whisperx; print("ok")'], {
      windowsHide: true,
      shell: true,
    });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.on('close', code => resolve({ available: code === 0 && out.includes('ok') }));
    child.on('error', () => resolve({ available: false }));
  });
}

// Run a single pip install command, streaming output to callback
function pipInstall(args: string[], label: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    onLine(`Running: python -m pip install ${args.join(' ')}`);
    const child = spawn('python', ['-m', 'pip', 'install', ...args, '--progress-bar', 'off'], {
      windowsHide: true,
      shell: true,
    });
    const handle = (d: Buffer) => {
      const raw = d.toString().replace(/\x1b\[[0-9;]*m/g, '');
      for (const l of raw.split('\n')) { if (l.trim()) onLine(l.trim()); }
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (exit ${code})`));
    });
    child.on('error', err => reject(new Error(`python not found in PATH: ${err.message}`)));
  });
}

// Install torchvision CPU-only pinned to version compatible with torch 2.8.0
// (fixes Wav2Vec2ForCTC import errors caused by mismatched torchvision)
// --no-deps prevents torchaudio from pulling torch back to an incompatible version
export function installTorchCPU(onLine: (line: string) => void): Promise<void> {
  return pipInstall(
    [
      'torchvision==0.23.0+cpu',
      '--index-url', 'https://download.pytorch.org/whl/cpu',
      '--no-deps',
    ],
    'torchvision CPU install',
    onLine,
  );
}

// Install WhisperX (two-step: whisperx first, then pin torchvision)
export async function installWhisperX(onLine: (line: string) => void): Promise<void> {
  // Step 1: install whisperx (brings torch 2.8.0 + torchaudio 2.8.0 as deps)
  onLine('=== Step 1/2: Installing WhisperX ===');
  await pipInstall(['whisperx'], 'whisperx', onLine);
  // Step 2: pin torchvision to the version compatible with torch 2.8.0
  // Must use --no-deps so torchaudio doesn't re-pin torch to an incompatible version
  onLine('=== Step 2/2: Installing torchvision (CPU, compatible with torch 2.8) ===');
  await pipInstall(
    [
      'torchvision==0.23.0+cpu',
      '--index-url', 'https://download.pytorch.org/whl/cpu',
      '--no-deps',
    ],
    'torchvision CPU',
    onLine,
  );
}

// ── Word-level grouping ──────────────────────────────────────────

interface WxWord { word: string; start?: number; end?: number; score?: number }

// Group word-level timestamps into subtitle lines
function groupWordsIntoSubtitles(words: WxWord[]): TranscriptionSegmentRaw[] {
  const MAX_CHARS = 42;
  const segs: TranscriptionSegmentRaw[] = [];

  // Filter words that have valid timestamps
  const valid = words
    .map(w => ({ word: w.word.replace(/^\s+/, ''), start: w.start, end: w.end }))
    .filter(w => w.word.length > 0 && w.start !== undefined && w.end !== undefined) as
    Array<{ word: string; start: number; end: number }>;

  if (valid.length === 0) return [];

  let groupWords: typeof valid = [];
  let groupText = '';

  const flush = () => {
    if (groupWords.length === 0) return;
    const text = groupText.trim();
    if (text) {
      segs.push({
        from: Math.round(groupWords[0].start * 1000),
        to:   Math.round(groupWords[groupWords.length - 1].end * 1000),
        text,
      });
    }
    groupWords = [];
    groupText  = '';
  };

  for (const w of valid) {
    const projected = groupText ? groupText + ' ' + w.word : w.word;

    // Break BEFORE this word if adding it would exceed limit
    if (projected.length > MAX_CHARS && groupText.length > 0) {
      flush();
    }

    groupWords.push(w);
    groupText = groupText ? groupText + ' ' + w.word : w.word;

    // Break AFTER strong punctuation (. ! ?)
    if (/[.!?]$/.test(w.word) && groupText.length >= 10) {
      flush();
    } else if (/,$/.test(w.word) && groupText.length >= 20) {
      // Break after comma only if the line is long enough
      flush();
    }
  }

  flush();
  return segs;
}

// ── WhisperX JSON parser ─────────────────────────────────────────

interface WxJsonSegment {
  start: number;
  end: number;
  text: string;
  words?: WxWord[];
}

function parseWhisperXJson(jsonPath: string): TranscriptionSegmentRaw[] {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
    segments?: WxJsonSegment[];
  };

  const segments = raw.segments ?? [];
  if (segments.length === 0) return [];

  // Collect all words across segments for word-level grouping
  const allWords: WxWord[] = [];
  let hasWordTimestamps = false;

  for (const seg of segments) {
    if (seg.words && seg.words.length > 0) {
      hasWordTimestamps = true;
      allWords.push(...seg.words);
    }
  }

  if (hasWordTimestamps && allWords.length > 0) {
    return groupWordsIntoSubtitles(allWords);
  }

  // Fallback: segment-level (no word timestamps available)
  return segments.map(s => ({
    from: Math.round(s.start * 1000),
    to:   Math.round(s.end   * 1000),
    text: s.text.trim(),
  })).filter(s => s.text.length > 0);
}

// ── Main transcription function ──────────────────────────────────

function runWhisperX(
  audioPath: string,
  outputDir: string,
  opts: WhisperXOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      audioPath,
      '--model',        opts.model,
      '--compute_type', opts.computeType,
      '--device',       opts.device,
      '--output_format', 'json',
      '--output_dir',   outputDir,
      '--batch_size',   opts.device === 'cpu' ? '1' : '8',
    ];

    if (opts.language && opts.language !== 'auto') {
      args.push('--language', opts.language);
    }

    const child = spawn('whisperx', args, { windowsHide: true, shell: true });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.stdout.on('data', d => { stderr += d.toString(); }); // whisperx logs to stdout too

    child.on('error', err => reject(new Error(`whisperx not found: ${err.message}\nMake sure it is installed: pip install whisperx`)));

    child.on('close', code => {
      if (code === 0 || code === null) {
        // Locate the JSON output file
        const baseName = path.basename(audioPath, path.extname(audioPath));
        const jsonPath = path.join(outputDir, baseName + '.json');
        if (fs.existsSync(jsonPath)) {
          resolve(jsonPath);
        } else {
          reject(new Error(`WhisperX finished but output JSON not found at: ${jsonPath}`));
        }
      } else {
        const detail = stderr.slice(-800).trim() || '(no output)';
        reject(new Error(`WhisperX exited with code ${code}.\n\n${detail}`));
      }
    });
  });
}

export async function transcribeWithWhisperX(
  videoPath: string,
  workDir: string,
  opts: WhisperXOptions,
): Promise<{ segments: TranscriptionSegmentRaw[]; language: string }> {
  const { ffmpeg } = (await import('./ffmpeg-integration')).getFFmpegPaths();
  const audioPath = path.join(workDir, `_wx_${Date.now()}.wav`);

  try {
    await extractAudioWav(ffmpeg, videoPath, audioPath);
    const jsonPath = await runWhisperX(audioPath, workDir, opts);

    try {
      const segments = parseWhisperXJson(jsonPath);
      // Clean up
      try { fs.unlinkSync(jsonPath); } catch {}

      // Detect language from filename or JSON (whisperx also writes .txt, .srt, etc.)
      return { segments, language: opts.language === 'auto' ? 'auto' : opts.language };
    } catch (parseErr) {
      throw new Error(`Failed to parse WhisperX output: ${(parseErr as Error).message}`);
    }
  } finally {
    try { fs.unlinkSync(audioPath); } catch {}
  }
}
