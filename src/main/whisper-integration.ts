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

export function extractAudioWav(ffmpegBin: string, videoPath: string, outPath: string): Promise<void> {
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

// Detect when audio first starts (end of leading silence) using ffmpeg silencedetect
function detectSpeechStartMs(ffmpegBin: string, audioPath: string): Promise<number> {
  return new Promise(resolve => {
    const args = ['-i', audioPath, '-af', 'silencedetect=n=-35dB:d=0.3', '-f', 'null', '-'];
    const child = spawn(ffmpegBin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', () => {
      // First "silence_end" is when the first non-silent audio appears
      const m = stderr.match(/silence_end:\s*([\d.]+)/);
      resolve(m ? Math.round(parseFloat(m[1]) * 1000) : 0);
    });
    child.on('error', () => resolve(0));
  });
}

// ── Segment post-processing ─────────────────────────────────────

interface TranscriptionSegmentRaw { from: number; to: number; text: string }

// Split text at punctuation boundaries, return array of parts (with punctuation kept at end)
function splitTextAtPunctuation(text: string): string[] {
  const parts: string[] = [];
  // Split at strong sentence ends (. ! ?) followed by a space
  const strongParts = text.split(/(?<=[.!?])\s+/);

  for (const part of strongParts) {
    // Further split long parts at commas (only if part before comma is ≥ 15 chars)
    const commaSplit = part.split(/(?<=,)\s+/);
    if (commaSplit.length > 1 && commaSplit[0].length >= 15) {
      parts.push(...commaSplit);
    } else {
      parts.push(part);
    }
  }

  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

// Re-split segments at punctuation, interpolating timestamps by char position
function splitSegmentsAtPunctuation(segs: TranscriptionSegmentRaw[]): TranscriptionSegmentRaw[] {
  const result: TranscriptionSegmentRaw[] = [];

  for (const seg of segs) {
    const parts = splitTextAtPunctuation(seg.text);
    if (parts.length <= 1) {
      result.push(seg);
      continue;
    }

    const totalChars = parts.join(' ').length;
    const totalMs    = seg.to - seg.from;
    let charPos      = 0;

    for (let i = 0; i < parts.length; i++) {
      const part    = parts[i];
      const from    = seg.from + Math.round((charPos / totalChars) * totalMs);
      charPos      += part.length + (i < parts.length - 1 ? 1 : 0); // +1 for space between parts
      const to      = i === parts.length - 1
        ? seg.to
        : seg.from + Math.round((charPos / totalChars) * totalMs);
      result.push({ from, to, text: part });
    }
  }

  return result;
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

function runWhisperProcess(audioPath: string, language = 'auto'): Promise<TranscriptionSegmentRaw[]> {
  return new Promise((resolve, reject) => {
    const outDir  = path.dirname(audioPath);
    const outFile = path.join(outDir, path.basename(audioPath, '.wav'));

    const args = [
      '-m', whisperModel,
      '-f', audioPath,
      '--language', language,
      '--split-on-word',
      '--output-json',
      '--output-file', outFile,
    ];

    const child = spawn(whisperBinary, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', reject);

    child.on('close', code => {
      const jsonPath = outFile + '.json';
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
        } catch {/* fall through */}
      }

      const combined = stdout + '\n' + stderr;
      const segs = parseWhisperStdout(combined);
      if (segs.length > 0) {
        resolve(segs);
        return;
      }

      if (code !== 0) {
        const detail = (stderr || stdout).slice(-600).trim() || '(no output)';
        reject(new Error(`Whisper exited with code ${code}.\n\n${detail}`));
      } else {
        resolve([]);
      }
    });
  });
}

// ── SRT generation ──────────────────────────────────────────────

function msToSRTTimestamp(ms: number): string {
  const h    = Math.floor(ms / 3600000);
  const m    = Math.floor((ms % 3600000) / 60000);
  const s    = Math.floor((ms % 60000) / 1000);
  const frac = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(frac).padStart(3,'0')}`;
}

export function generateSRT(segments: { from: number; to: number; text: string }[]): string {
  if (segments.length === 0) return '';
  return segments
    .map((seg, i) => `${i + 1}\n${msToSRTTimestamp(seg.from)} --> ${msToSRTTimestamp(seg.to)}\n${seg.text.trim()}`)
    .join('\n\n') + '\n';
}

export function saveSRT(segments: { from: number; to: number; text: string }[], outputPath: string): string {
  const srt = generateSRT(segments);
  fs.writeFileSync(outputPath, srt, 'utf-8');
  return outputPath;
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
  workDir: string,
  language = 'auto'
): Promise<TranscriptionResult> {
  if (!whisperBinary) throw new Error('Whisper binary not configured.');
  if (!whisperModel)  throw new Error('Whisper model not configured.');

  const { ffmpeg } = getFFmpegPaths();
  const audioPath  = path.join(workDir, `_whisper_${Date.now()}.wav`);

  try {
    await extractAudioWav(ffmpeg, videoPath, audioPath);

    // Detect when actual speech starts (end of leading silence)
    const speechStartMs = await detectSpeechStartMs(ffmpeg, audioPath);

    let segments = await runWhisperProcess(audioPath, language);

    // Fix first segment: if it claims to start at 0 but speech starts later, correct it
    if (segments.length > 0 && segments[0].from === 0 && speechStartMs > 200) {
      segments[0] = { ...segments[0], from: speechStartMs };
    }

    // Re-split segments at punctuation boundaries
    segments = splitSegmentsAtPunctuation(segments);

    const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    return { segments, fullText, language };
  } finally {
    try { fs.unlinkSync(audioPath); } catch {}
  }
}
