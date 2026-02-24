import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getFFmpegPaths } from './ffmpeg-integration';

let whisperBinary = '';
let whisperModel  = '';

export function setWhisperPaths(binary: string, model: string) {
  whisperBinary = binary;
  whisperModel  = model;
}

export function getWhisperPaths() {
  return { binary: whisperBinary, model: whisperModel };
}

export async function detectWhisperPath(): Promise<{
  binaryFound: boolean;
  binary: string;
  model: string;
}> {
  const candidates = [
    'whisper-cli',
    'whisper-cli.exe',
    'main.exe',
    path.join(process.env.LOCALAPPDATA || '', 'whisper', 'whisper-cli.exe'),
    path.join('C:\\', 'whisper', 'whisper-cli.exe'),
  ];

  for (const bin of candidates) {
    const found = await canRun(bin);
    if (found) return { binaryFound: true, binary: bin, model: whisperModel };
  }

  return { binaryFound: false, binary: whisperBinary, model: whisperModel };
}

function canRun(bin: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const child = spawn(bin, ['--help'], { windowsHide: true });
      child.on('close', () => resolve(true));
      child.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

// ── Audio extraction ────────────────────────────────────────────

function extractAudioWav(ffmpegBin: string, videoPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', videoPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outPath];
    const child = spawn(ffmpegBin, args, { windowsHide: true });
    let err = '';
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg error (code ${code}): ${err.slice(-200)}`));
    });
    child.on('error', reject);
  });
}

// ── Whisper execution ───────────────────────────────────────────

function parseTimestampMs(ts: string): number {
  const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  const [, h, min, s, frac] = m.map(Number);
  const ms = frac < 100 ? frac * 10 : frac;
  return (h * 3600 + min * 60 + s) * 1000 + ms;
}

function parseWhisperStdout(text: string): TranscriptionSegmentRaw[] {
  const segs: TranscriptionSegmentRaw[] = [];
  const re = /\[(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\]\s+(.*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const text_ = match[3].trim();
    if (text_) segs.push({ from: parseTimestampMs(match[1]), to: parseTimestampMs(match[2]), text: text_ });
  }
  return segs;
}

interface TranscriptionSegmentRaw { from: number; to: number; text: string }

function runWhisperProcess(audioPath: string): Promise<TranscriptionSegmentRaw[]> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', whisperModel,
      '-f', audioPath,
      '--output-json',
      '-l', 'auto',
    ];

    const child = spawn(whisperBinary, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', reject);

    child.on('close', async code => {
      // Try JSON output file first (written by --output-json flag)
      const jsonPath = audioPath + '.json';
      if (fs.existsSync(jsonPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
            transcription?: Array<{
              offsets?: { from: number; to: number };
              timestamps?: { from: string; to: string };
              text: string;
            }>;
          };
          const segs = (raw.transcription ?? []).map(s => ({
            from: s.offsets?.from ?? parseTimestampMs(s.timestamps?.from ?? ''),
            to:   s.offsets?.to   ?? parseTimestampMs(s.timestamps?.to   ?? ''),
            text: s.text.trim(),
          })).filter(s => s.text.length > 0);
          try { fs.unlinkSync(jsonPath); } catch {}
          resolve(segs);
          return;
        } catch {/* fall through to text parse */}
      }

      // Fallback: parse stdout/stderr for timestamp lines
      const combined = stdout + '\n' + stderr;
      const segs = parseWhisperStdout(combined);
      if (segs.length > 0) {
        resolve(segs);
      } else if (code !== 0) {
        reject(new Error(`Whisper exited with code ${code}. Check binary/model paths.\n${stderr.slice(-400)}`));
      } else {
        // No segments found but exit 0 — probably silence or very short clip
        resolve([]);
      }
    });
  });
}

// ── Public API ──────────────────────────────────────────────────

export interface TranscriptionSegment {
  from: number;  // ms
  to: number;    // ms
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  language?: string;
}

export async function transcribeVideo(
  videoPath: string,
  workDir: string
): Promise<TranscriptionResult> {
  if (!whisperBinary) throw new Error('Whisper binary not configured.');
  if (!whisperModel)  throw new Error('Whisper model not configured.');

  const { ffmpeg } = getFFmpegPaths();
  const audioPath  = path.join(workDir, `_whisper_${Date.now()}.wav`);

  try {
    await extractAudioWav(ffmpeg, videoPath, audioPath);
    const segments = await runWhisperProcess(audioPath);
    const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    return { segments, fullText };
  } finally {
    try { fs.unlinkSync(audioPath); } catch {}
  }
}
