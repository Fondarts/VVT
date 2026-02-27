/**
 * FFmpeg.wasm API layer
 * Replaces all Electron IPC + Node.js ffmpeg/ffprobe calls
 * with browser-native WebAssembly equivalents.
 *
 * Uses @ffmpeg/ffmpeg 0.12.x + @ffmpeg/core (single-thread)
 * Core files served from /public/ffmpeg-core/ (copied from node_modules/@ffmpeg/core/dist/umd/).
 * Served locally to avoid COEP issues with importScripts() + cross-origin CDN URLs.
 */

import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type {
  ScanResult,
  FileMetadata,
  VideoMetadata,
  AudioMetadata,
  FastStartInfo,
} from '../shared/types';

// ── Singleton FFmpeg instance ────────────────────────────────────────────────

let _ffmpeg: FFmpeg | null = null;
let _loaded = false;
let _loadPromise: Promise<FFmpeg> | null = null;

const BASE_ST = '/ffmpeg-core';   // single-thread, served from public/ffmpeg-core/

export async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (_loaded && _ffmpeg) return _ffmpeg;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    _ffmpeg = new FFmpeg();
    if (onLog) _ffmpeg.on('log', ({ message }) => onLog(message));

    const base = `${location.origin}${BASE_ST}`;
    // Single-thread mode only.
    // Multi-thread (@ffmpeg/core-mt) requires pthread proxy calls from sub-threads
    // back to the main emscripten thread, but that thread is blocked in Atomics.wait()
    // during exec() — causing an unrecoverable deadlock. ST is reliable and fast enough.
    await _ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    _loaded = true;
    return _ffmpeg;
  })();

  return _loadPromise;
}

export function getFFmpeg(): FFmpeg | null {
  return _ffmpeg;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

/**
 * Map a pix_fmt string to chroma subsampling + bit depth.
 * Handles: yuv420p, yuv422p, yuv444p, yuv420p10le, etc.
 */
function parsePixFmt(pixFmt: string): { chroma: string; bitDepth: number } {
  const f = pixFmt.toLowerCase();
  let chroma = '4:2:0';
  let bitDepth = 8;

  if (f.includes('444')) chroma = '4:4:4';
  else if (f.includes('422')) chroma = '4:2:2';
  else if (f.includes('420')) chroma = '4:2:0';
  else if (f.includes('410')) chroma = '4:1:0';
  else if (f.includes('411')) chroma = '4:1:1';
  else if (f.includes('400')) chroma = '4:0:0';
  else if (f.startsWith('rgb') || f.startsWith('bgr') || f === 'gbrp') chroma = '4:4:4';

  if (f.includes('10')) bitDepth = 10;
  else if (f.includes('12')) bitDepth = 12;
  else if (f.includes('16')) bitDepth = 16;

  return { chroma, bitDepth };
}

// ── Codec display name mapping ───────────────────────────────────────────────
const CODEC_FORMAT_NAMES: Record<string, string> = {
  h264: 'AVC', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1',
  prores: 'Apple ProRes', dnxhd: 'DNxHD', dnxhr: 'DNxHR',
  mpeg2video: 'MPEG-2 Video', mpeg4: 'MPEG-4 Visual',
  mjpeg: 'MJPEG', theora: 'Theora',
};

const CODEC_FORMAT_VERSIONS: Record<string, string> = {
  mpeg2video: 'Version 2', mpeg4: 'Version 2',
  h264: 'Version 4', hevc: 'Version 1', prores: 'Version 0',
};

// Maps ProRes codec tag → profile name (more specific than ffmpeg's short strings)
const PRORES_PROFILE_MAP: Record<string, string> = {
  apch: '422 HQ', apcn: '422', apcs: '422 LT', apco: '422 Proxy',
  ap4h: '4444', ap4x: '4444 XQ',
};

const CONTAINER_PROFILE_MAP: Record<string, string> = {
  isom: 'Base Media', mp41: 'Base Media / Version 1', mp42: 'Base Media / Version 2',
  qt: 'QuickTime', M4V: 'Apple iTunes Video', M4A: 'Apple iTunes Audio',
  mxf: 'MXF', avc1: 'AVC', f4v: 'Adobe Flash Video',
};

const LOSSLESS_AUDIO_CODECS = ['pcm_', 'alac', 'flac', 'wav', 'aiff'];

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

/**
 * Parse FFmpeg's info output (stderr) for video/audio stream metadata.
 * This is the human-readable format FFmpeg prints when processing a file.
 *
 * Example input line:
 *   "Stream #0:0(und): Video: h264 (High) (avc1 / ...), yuv420p(tv, bt709), 1920x1080, 4834 kb/s, 23.98 fps"
 *   "Stream #0:1(und): Audio: aac (LC) (mp4a / ...), 48000 Hz, stereo, fltp, 191 kb/s"
 */
function parseFFmpegInfo(stderr: string): {
  container: string;
  containerFormatProfile: string | undefined;
  duration: number;
  overallBitrate: number;
  video: VideoMetadata | null;
  audio: Omit<AudioMetadata, 'lufs' | 'truePeak'> | null;
} {
  const lines = stderr.split('\n');

  // Container format profile from major_brand tag (parsed first to disambiguate container)
  const majorBrandMatch = stderr.match(/major_brand\s*:\s*(\S+)/);
  const majorBrand = majorBrandMatch ? majorBrandMatch[1].trim().replace(/\s+$/, '') : undefined;
  const containerFormatProfile = majorBrand ? (CONTAINER_PROFILE_MAP[majorBrand] ?? majorBrand) : undefined;

  // Container format — ffmpeg reports mov+mp4 together as "mov,mp4,m4a,...";
  // use major_brand to pick the right one: qt→mov, everything else MPEG-4→mp4.
  const MP4_BRANDS = new Set(['isom', 'mp41', 'mp42', 'avc1', 'M4V', 'M4A', 'f4v']);
  let container = 'unknown';
  const inputMatch = stderr.match(/Input #0,\s*([^\s,]+)/);
  if (inputMatch) {
    const formats = inputMatch[1].split(',');
    const raw = formats.find(f => ['mp4', 'mov', 'mkv', 'mxf', 'avi', 'webm', 'ts', 'm4v'].includes(f)) ?? formats[0];
    // Prefer major_brand to distinguish mp4 vs mov when ffmpeg bundles them
    if (majorBrand && (raw === 'mov' || raw === 'mp4')) {
      container = majorBrand === 'qt' ? 'mov' : MP4_BRANDS.has(majorBrand) ? 'mp4' : raw;
    } else {
      container = raw;
    }
  }

  // Duration and overall bitrate
  let duration = 0;
  let overallBitrate = 0;
  const durMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (durMatch) {
    duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
  }
  const bitrateMatch = stderr.match(/Duration:.*?bitrate:\s*(\d+)\s*kb\/s/);
  if (bitrateMatch) {
    overallBitrate = parseInt(bitrateMatch[1]) * 1000;
  }

  // Video stream
  let video: VideoMetadata | null = null;
  const videoLine = lines.find(l => /Stream #\d+:\d+.*?Video:/.test(l));
  if (videoLine) {
    // Codec
    const codecMatch = videoLine.match(/Video:\s*(\w+)/);
    const codec = codecMatch ? codecMatch[1].toLowerCase() : 'unknown';

    // Profile (e.g. "h264 (High)" or "prores (ProRes 422 HQ)")
    const profileMatch = videoLine.match(/Video:\s*\w+\s*\(([^)]+)\)/);
    const profile = profileMatch ? profileMatch[1] : undefined;

    // Resolution
    const resMatch = videoLine.match(/(\d{3,5})x(\d{3,5})/);
    const width = resMatch ? parseInt(resMatch[1]) : 0;
    const height = resMatch ? parseInt(resMatch[2]) : 0;

    // Frame rate
    let frameRate = 0;
    const fpsMatch = videoLine.match(/(\d+\.?\d*)\s*fps/);
    if (fpsMatch) frameRate = parseFloat(fpsMatch[1]);
    // Fallback to tbr
    if (!frameRate) {
      const tbrMatch = videoLine.match(/(\d+\.?\d*)\s*tbr/);
      if (tbrMatch) frameRate = parseFloat(tbrMatch[1]);
    }

    // Video bitrate
    let videoBitrate = 0;
    const vbrMatch = videoLine.match(/(\d+)\s*kb\/s/);
    if (vbrMatch) videoBitrate = parseInt(vbrMatch[1]) * 1000;
    if (!videoBitrate) videoBitrate = overallBitrate;

    // Pixel format + color info
    // Line may contain: "yuv420p(tv, bt709)" or just "yuv420p"
    const pixFmtMatch = videoLine.match(/,\s*(yuv\w+|rgb\w+|bgr\w+|gbrp\w*|gray\w*)(\([^)]*\))?/);
    const pixFmt = pixFmtMatch ? pixFmtMatch[1] : 'yuv420p';
    const { chroma, bitDepth } = parsePixFmt(pixFmt);

    // Color space from pixel format family (YUV, RGB, Grayscale)
    let colorRange: string | undefined;
    let colorPrimaries: string | undefined;
    let colorTransfer: string | undefined;
    let colorSpace: string | undefined;
    if (pixFmt.startsWith('yuv') || pixFmt.startsWith('yuvj')) colorSpace = 'YUV';
    else if (pixFmt.startsWith('rgb') || pixFmt.startsWith('bgr') || pixFmt === 'gbrp') colorSpace = 'RGB';
    else if (pixFmt.startsWith('gray')) colorSpace = 'Grayscale';

    // Color primaries/transfer/range from paren group: "(tv, bt709)" or "(pc, bt709, bt709, bt709)"
    if (pixFmtMatch?.[2]) {
      const inner = pixFmtMatch[2].slice(1, -1); // remove parens
      const parts = inner.split(',').map(s => s.trim());
      if (parts[0] === 'tv' || parts[0] === 'pc') colorRange = parts[0] === 'tv' ? 'limited' : 'full';
      if (parts[1]) {
        colorPrimaries = parts[1];
        colorTransfer = parts[2] ?? parts[1];
      }
    }

    // Scan type (interlaced markers)
    const isInterlaced = videoLine.includes('interlaced') || /,\s*\d+\s*tbr.*1000k tbn/.test(videoLine);
    const scanType = isInterlaced ? 'Interlaced' : 'Progressive';

    // Codec ID (4-char tag, e.g. "avc1", "hvc1") from "(avc1 / 0x...)" pattern
    const codecTagMatch = videoLine.match(/\(([a-zA-Z0-9_\-]{2,6})\s*\/\s*0x[0-9a-fA-F]+\)/);
    const codecId = codecTagMatch ? codecTagMatch[1] : undefined;

    // Display aspect ratio from width/height
    const g = gcd(width, height);
    const displayAspectRatio = width && height ? `${width / g}:${height / g}` : undefined;

    // Frame rate mode: VFR when fps ≈ 0 but tbr is present; otherwise Constant
    const hasFps = !!fpsMatch;
    const hasTbr = /\d+\.?\d*\s*tbr/.test(videoLine);
    const frameRateMode = (!hasFps && hasTbr) ? 'Variable' : 'Constant';

    // For ProRes, use codec-tag-based profile ("422 HQ") over ffmpeg's short string ("HQ")
    const resolvedProfile = (codecId && PRORES_PROFILE_MAP[codecId]) ?? profile;

    video = {
      codec,
      format: CODEC_FORMAT_NAMES[codec] ?? codec.toUpperCase(),
      formatVersion: CODEC_FORMAT_VERSIONS[codec],
      codecId,
      profile: resolvedProfile,
      displayAspectRatio,
      frameRateMode,
      width,
      height,
      frameRate,
      frameRateFormatted: frameRate % 1 === 0 ? frameRate.toString() : frameRate.toFixed(3).replace(/\.?0+$/, ''),
      bitRate: videoBitrate,
      bitRateFormatted: formatBitrate(videoBitrate),
      bitDepth,
      colorSpace,
      colorRange,
      colorPrimaries,
      colorTransfer,
      chromaSubsampling: chroma,
      scanType,
    };
  }

  // Audio stream
  let audio: Omit<AudioMetadata, 'lufs' | 'truePeak'> | null = null;
  const audioLine = lines.find(l => /Stream #\d+:\d+.*?Audio:/.test(l));
  if (audioLine) {
    const aCodecMatch = audioLine.match(/Audio:\s*(\w+)/);
    const aCodec = aCodecMatch ? aCodecMatch[1].toLowerCase() : 'unknown';

    const sampleRateMatch = audioLine.match(/(\d+)\s*Hz/);
    const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) : 48000;

    // Channel layout
    let channels = 2;
    let channelLayout = 'stereo';
    if (/\bmono\b/.test(audioLine)) { channels = 1; channelLayout = 'mono'; }
    else if (/\bstereo\b/.test(audioLine)) { channels = 2; channelLayout = 'stereo'; }
    else if (/5\.1/.test(audioLine)) { channels = 6; channelLayout = '5.1'; }
    else if (/7\.1/.test(audioLine)) { channels = 8; channelLayout = '7.1'; }
    else {
      // Try to find "X channels" pattern
      const chMatch = audioLine.match(/(\d+)\s*channels?/);
      if (chMatch) {
        channels = parseInt(chMatch[1]);
        channelLayout = `${channels}ch`;
      }
    }

    // Audio bitrate
    let aBitrate: number | undefined;
    const abrMatch = audioLine.match(/(\d+)\s*kb\/s/);
    if (abrMatch) aBitrate = parseInt(abrMatch[1]) * 1000;

    // Bit depth from sample format (fltp=float32, s16=16-bit, s24=24-bit, s32=32-bit)
    let bitDepth: number | undefined;
    if (/\bfltp?\b/.test(audioLine)) bitDepth = 32;
    else if (/\bs16\b/.test(audioLine)) bitDepth = 16;
    else if (/\bs24\b/.test(audioLine)) bitDepth = 24;
    else if (/\bs32\b/.test(audioLine)) bitDepth = 32;

    const compressionMode = LOSSLESS_AUDIO_CODECS.some(lc => aCodec.includes(lc)) ? 'Lossless' : 'Lossy';
    audio = { codec: aCodec, sampleRate, channels, channelLayout, bitDepth, bitRate: aBitrate, compressionMode };
  }

  return { container, containerFormatProfile, duration, overallBitrate, video, audio };
}

// ── Fast-start check (browser File API, no FFmpeg needed) ────────────────────

export async function checkFastStart(file: File): Promise<FastStartInfo> {
  // Read first 8KB to find 'moov' atom
  const buffer = await file.slice(0, 8192).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Search for 'moov' ASCII bytes: 0x6D, 0x6F, 0x6F, 0x76
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x6D && bytes[i+1] === 0x6F && bytes[i+2] === 0x6F && bytes[i+3] === 0x76) {
      return { enabled: i < 1024, moovAt: i };
    }
  }
  return { enabled: false, moovAt: -1 };
}

// ── ITU-R BS.1770-4 K-weighting loudness (native Web Audio API path) ─────────

// K-weighting filter coefficients — ITU-R BS.1770-4, 48 kHz
// Stage 1: high-shelf pre-filter
const KW_PRE_B: [number, number, number] = [ 1.53512485958697, -2.69169618940638,  1.19839281085285];
const KW_PRE_A: [number, number, number] = [ 1.0,              -1.69065929318241,  0.73248077421585];
// Stage 2: 2nd-order high-pass
const KW_HP_B:  [number, number, number] = [ 1.0,  -2.0,               1.0];
const KW_HP_A:  [number, number, number] = [ 1.0,  -1.99004745483398,  0.99007225036510];

/** Direct Form II Transposed biquad IIR filter (2nd order, in-place safe). */
function biquad(
  b: [number, number, number],
  a: [number, number, number],
  x: Float32Array,
): Float32Array {
  const out = new Float32Array(x.length);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b[0] * x[i] + s1;
    s1 = b[1] * x[i] - a[1] * y + s2;
    s2 = b[2] * x[i] - a[2] * y;
    out[i] = y;
  }
  return out;
}

/**
 * Compute ITU-R BS.1770-4 integrated loudness from an AudioBuffer.
 * The buffer is resampled to 48 kHz internally if needed.
 * Throws for files > 2 hours (fall back to FFmpeg loudnorm).
 */
async function analyzeLoudnessJS(audio: AudioBuffer): Promise<{ lufs: number; truePeak: number }> {
  // Resample to 48 kHz using OfflineAudioContext if needed
  let buf = audio;
  if (audio.sampleRate !== 48000) {
    const nCh = audio.numberOfChannels;
    const nSamp = Math.ceil(audio.duration * 48000);
    const off = new OfflineAudioContext(nCh, nSamp, 48000);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start(0);
    buf = await off.startRendering();
  }

  if (buf.duration > 7200) throw new Error('File too long for JS loudness analysis');

  const nCh = Math.min(buf.numberOfChannels, 5); // max 5.1, ignore LFE
  // BS.1770 channel weights: L R C Ls Rs
  const W = [1.0, 1.0, 1.0, 1.41, 1.41];

  // Apply K-weighting (two biquad stages) per channel
  const filtered: Float32Array[] = [];
  for (let c = 0; c < nCh; c++) {
    filtered.push(biquad(KW_HP_B, KW_HP_A, biquad(KW_PRE_B, KW_PRE_A, buf.getChannelData(c))));
  }

  // 400 ms blocks, 75% overlap (100 ms hop) — BS.1770-4 §3.2
  const blockSz = Math.round(48000 * 0.4);
  const hopSz   = Math.round(48000 * 0.1);
  const nSamp   = filtered[0].length;

  const blocks: number[] = [];
  for (let s = 0; s + blockSz <= nSamp; s += hopSz) {
    let sum = 0;
    for (let c = 0; c < nCh; c++) {
      const ch = filtered[c];
      let sq = 0;
      for (let i = s; i < s + blockSz; i++) sq += ch[i] * ch[i];
      sum += W[c] * sq / blockSz;
    }
    blocks.push(sum);
  }

  if (!blocks.length) return { lufs: -99, truePeak: 0 };

  // Absolute gate −70 LUFS  (10^(−70/10) ≈ 1e-7)
  const g1 = blocks.filter(v => v > 1e-7);
  if (!g1.length) return { lufs: -70, truePeak: 0 };

  // Relative gate = mean(g1) − 10 LU  (linear: × 0.1)
  const mean1 = g1.reduce((a, b) => a + b, 0) / g1.length;
  const g2 = g1.filter(v => v > mean1 * 0.1);
  if (!g2.length) return { lufs: -70, truePeak: 0 };

  const integrated = g2.reduce((a, b) => a + b, 0) / g2.length;
  const lufs = -0.691 + 10 * Math.log10(Math.max(integrated, 1e-10));

  // True peak: max absolute sample over original unfiltered data
  let tp = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > tp) tp = v; }
  }

  return {
    lufs:     Math.round(lufs * 10) / 10,
    truePeak: tp > 1e-9 ? Math.round(20 * Math.log10(tp) * 10) / 10 : -99,
  };
}

// ── Loudness analysis ────────────────────────────────────────────────────────
//
// 3-tier strategy (fastest → slowest):
//   Tier 1 — native browser decode + JS BS.1770-4  (MP4/WebM/etc., < 200 MB)
//   Tier 2 — FFmpeg WAV extract → native decode + JS BS.1770-4 (ProRes, MXF, …)
//             WAV extract is fast: just demux audio track (no video decode).
//             PCM source (common in ProRes) makes even the extract near-instant.
//   Tier 3 — FFmpeg loudnorm filter (slowest fallback, any codec/length)

export async function analyzeLoudness(
  ff: FFmpeg,
  inputName: string,
  file?: File,
): Promise<{ lufs: number; truePeak: number }> {
  // ── Tier 1: native browser decode ─────────────────────────────────────────
  if (file && file.size < 200 * 1024 * 1024) {
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      await ctx.close();
      return await analyzeLoudnessJS(buf);
    } catch { /* browser can't decode this format — fall through */ }
  }

  // ── Tier 2: FFmpeg audio extract → WAV → native decode → JS BS.1770-4 ────
  const wavOut = '_ld_audio.wav';
  try {
    await ff.exec([
      '-threads', '1', '-i', inputName,
      '-vn', '-af', 'aresample=48000',
      '-c:a', 'pcm_s16le', '-f', 'wav', '-y', wavOut,
    ]);
    const wavRaw = await ff.readFile(wavOut) as Uint8Array<ArrayBuffer>;
    try { await ff.deleteFile(wavOut); } catch { /* ignore */ }

    // Copy to a plain ArrayBuffer so decodeAudioData doesn't fight WASM heap ownership
    const wavCopy = wavRaw.buffer.slice(wavRaw.byteOffset, wavRaw.byteOffset + wavRaw.byteLength);
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(wavCopy);
    await ctx.close();
    return await analyzeLoudnessJS(buf);
  } catch { /* fall through to loudnorm */ }

  // ── Tier 3: FFmpeg loudnorm (original approach — slowest fallback) ─────────
  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => logs.push(message);
  ff.on('log', logHandler);
  try {
    await ff.exec([
      '-threads', '1', '-i', inputName,
      '-af', 'loudnorm=print_format=json',
      '-f', 'null', '-',
    ]);
  } catch { /* exits non-zero */ }
  ff.off('log', logHandler);

  const output = logs.join('\n');
  const jsonMatch = output.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      return {
        lufs: parseFloat(data.input_i) || -99,
        truePeak: parseFloat(data.input_tp) || 0,
      };
    } catch { /* fall through */ }
  }

  return { lufs: -99, truePeak: 0 };
}

// ── Main scan function ───────────────────────────────────────────────────────

export async function scanVideoFile(
  file: File,
  onProgress?: (pct: number, label: string) => void
): Promise<ScanResult> {
  onProgress?.(5, 'Loading FFmpeg…');
  const ff = await loadFFmpeg();

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
  const inputName = `input.${ext}`;

  onProgress?.(15, 'Reading file…');
  await ff.writeFile(inputName, await fetchFile(file));

  // ── Probe: collect stderr output ──────────────────────────────────
  onProgress?.(25, 'Analyzing metadata…');
  const probeLogs: string[] = [];
  const probeLogHandler = ({ message }: { message: string }) => probeLogs.push(message);
  ff.on('log', probeLogHandler);

  try {
    // Running ffmpeg with just -i (no output) prints stream info and exits 1.
    // We intentionally omit "-f null -" to avoid triggering MT video decoder
    // thread creation (H.264 slice threads proxy to the main emscripten thread
    // which is blocked in Atomics.wait → deadlock in MT mode).
    await ff.exec(['-hide_banner', '-v', 'info', '-i', inputName]);
  } catch {
    // Expected: exits 1 because no output was specified
  }

  ff.off('log', probeLogHandler);
  const probeOutput = probeLogs.join('\n');

  const { container, containerFormatProfile, duration, video, audio: audioBase } = parseFFmpegInfo(probeOutput);

  if (!video) {
    throw new Error('No video stream found in file');
  }

  // ── Creation date ─────────────────────────────────────────────────
  const creationTimeMatch = probeOutput.match(/creation_time\s*:\s*(\S+)/);
  let creationDate: string | undefined;
  if (creationTimeMatch) {
    try {
      creationDate = new Date(creationTimeMatch[1]).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { /* ignore */ }
  }
  if (!creationDate) {
    creationDate = new Date(file.lastModified).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  // ── Fast start (browser File API) ────────────────────────────────
  onProgress?.(40, 'Checking fast-start…');
  const fastStart = await checkFastStart(file);

  // ── Loudness (only if audio present) ─────────────────────────────
  let audio: AudioMetadata | undefined;
  if (audioBase) {
    onProgress?.(55, 'Measuring loudness…');
    const { lufs, truePeak } = await analyzeLoudness(ff, inputName);
    audio = { ...audioBase, lufs, truePeak };
  }

  onProgress?.(90, 'Finalizing…');

  // Clean up virtual filesystem
  try { await ff.deleteFile(inputName); } catch { /* ignore */ }

  const fileMetadata: FileMetadata = {
    name: file.name,
    path: file.name, // no real path in browser
    extension: ext,
    sizeBytes: file.size,
    sizeFormatted: formatBytes(file.size),
    duration,
    durationFormatted: formatDuration(duration),
    container,
    format: container,
    mimeType: file.type || undefined,
    width: video.width,
    height: video.height,
    creationDate,
    formatProfile: containerFormatProfile,
  };

  onProgress?.(100, 'Done');

  return { file: fileMetadata, video, audio, fastStart };
}

// ── Thumbnail generation ─────────────────────────────────────────────────────

/**
 * Generate thumbnails. When called from runScan, accepts a pre-written ff+inputName+duration
 * to avoid redundant file writes and duration probes.
 */
export async function generateThumbnails(
  file: File,
  count = 10,
  onProgress?: (i: number, total: number) => void,
  opts?: { ff?: FFmpeg; inputName?: string; duration?: number }
): Promise<string[]> {
  const ff = opts?.ff ?? await loadFFmpeg();
  const thumbCount = Math.max(1, count);

  // Write file if not already in FS
  let inputName = opts?.inputName;
  let ownedInput = false;
  if (!inputName) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
    inputName = `thumb_input.${ext}`;
    await ff.writeFile(inputName, await fetchFile(file));
    ownedInput = true;
  }

  // Get duration if not provided
  let duration = opts?.duration;
  if (!duration) {
    const dLogs: string[] = [];
    const dH = ({ message }: { message: string }) => dLogs.push(message);
    ff.on('log', dH);
    try { await ff.exec(['-hide_banner', '-v', 'info', '-i', inputName]); } catch { /* expected */ }
    ff.off('log', dH);
    const dMatch = dLogs.join('\n').match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
    duration = dMatch ? parseInt(dMatch[1]) * 3600 + parseInt(dMatch[2]) * 60 + parseFloat(dMatch[3]) : 60;
  }

  // Sequential extraction — file is already in the WASM virtual FS, so no re-upload cost.
  // Multi-input approach hits a stream limit (~4) in ffmpeg.wasm; sequential is reliable.
  const blobUrls: string[] = [];
  for (let i = 0; i < thumbCount; i++) {
    const t = thumbCount > 1
      ? Math.min(duration * (i / (thumbCount - 1)), duration - 0.1)
      : duration * 0.5;
    const thumbName = `thumb_${i}.jpg`;
    try {
      await ff.exec([
        '-threads', '1',  // prevent MT decoder sub-threads
        '-ss', t.toFixed(3), '-i', inputName,
        '-vframes', '1', '-q:v', '3', '-vf', 'scale=320:-1', '-y', thumbName,
      ]);
      const data = await ff.readFile(thumbName);
      blobUrls.push(URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })));
      try { await ff.deleteFile(thumbName); } catch { /* ignore */ }
    } catch { /* skip */ }
    onProgress?.(i + 1, thumbCount);
  }

  if (ownedInput) try { await ff.deleteFile(inputName); } catch { /* ignore */ }

  return blobUrls;
}

// ── Waveform data ────────────────────────────────────────────────────────────

/**
 * Extract waveform using the browser's native Web Audio API (fast, hardware-accelerated).
 * Falls back to FFmpeg.wasm for formats the browser can't decode directly.
 */
export async function getWaveformData(file: File): Promise<number[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    // Mix down to mono (use first channel)
    const channelData = audioBuffer.getChannelData(0);

    // Downsample to ~400 points using peak per chunk
    const target = 400;
    const step = Math.max(1, Math.floor(channelData.length / target));
    const result: number[] = [];
    for (let i = 0; i < channelData.length; i += step) {
      let peak = 0;
      const end = Math.min(i + step, channelData.length);
      for (let j = i; j < end; j++) {
        const v = Math.abs(channelData[j]);
        if (v > peak) peak = v;
      }
      result.push(peak);
    }
    return result;
  } catch {
    // Fallback: FFmpeg.wasm (e.g. for ProRes / MXF audio)
    return _getWaveformFFmpeg(file);
  }
}

async function _getWaveformFFmpeg(file: File): Promise<number[]> {
  const ff = await loadFFmpeg();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
  const inputName = `wave_input.${ext}`;
  const outputName = 'wave_output.raw';
  await ff.writeFile(inputName, await fetchFile(file));
  try {
    await ff.exec(['-threads', '1', '-i', inputName, '-vn', '-af', 'aresample=8000', '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', outputName]);
    const rawData = await ff.readFile(outputName);
    const int16 = new Int16Array((rawData as Uint8Array<ArrayBuffer>).buffer);
    const target = 400;
    const step = Math.max(1, Math.floor(int16.length / target));
    const result: number[] = [];
    for (let i = 0; i < int16.length; i += step) {
      let peak = 0;
      const end = Math.min(i + step, int16.length);
      for (let j = i; j < end; j++) { const v = Math.abs(int16[j] / 32768); if (v > peak) peak = v; }
      result.push(peak);
    }
    try { await ff.deleteFile(outputName); } catch { /* ignore */ }
    try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    return result;
  } catch {
    try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    return [];
  }
}

// ── Unified scan ─────────────────────────────────────────────────────────────
//
// Pipeline (fastest-to-slowest, progressive):
//   1. Load FFmpeg (singleton, fast after first run)
//   2. Mount file via WORKERFS  ← no full-file copy, instant for any size
//   3. Probe headers only       ← reads a few KB, very fast
//   4. checkFastStart           ← pure JS, instant
//   5. onScanReady fires        ← specs visible immediately, lufs=pending
//   6. Transcode if needed      ← ProRes/DNxHD/MPEG-2 → H.264 preview
//   7. Loudness analysis        ← full audio decode (slow for long files)
//   8. onLoudnessReady fires    ← UI updates loudness display
//   9. Waveform (Web Audio API) ← native, fast
//  10. Thumbnails (FFmpeg)      ← sequential frame extractions

export async function runScan(
  file: File,
  opts?: {
    thumbnailCount?: number;
    onProgress?: (pct: number, label: string) => void;
    /** Fires as soon as metadata + codec specs are ready (before loudness). */
    onScanReady?: (scan: ScanResult) => void;
    /** Fires when loudness analysis completes. Update audio.lufs / audio.truePeak. */
    onLoudnessReady?: (lufs: number, truePeak: number) => void;
    /** Fires with a transcoded H.264 blob URL when the source codec needs it. */
    onTranscodeReady?: (url: string) => void;
    /** Fires if transcoding fails. */
    onTranscodeError?: (err: string) => void;
    /** Fires when waveform data is ready. */
    onWaveformReady?: (waveform: number[]) => void;
    /** Fires when all thumbnails are ready. */
    onThumbnailsReady?: (thumbnails: string[]) => void;
  }
): Promise<void> {
  const {
    thumbnailCount = 8, onProgress,
    onScanReady, onLoudnessReady,
    onTranscodeReady, onTranscodeError,
    onWaveformReady, onThumbnailsReady,
  } = opts ?? {};

  // ── 1. Load FFmpeg (singleton, cached after first load) ────────────
  onProgress?.(5, 'Loading FFmpeg…');
  const ff = await loadFFmpeg();

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';

  // ── 2. Mount file via WORKERFS (no file copy — instant for any size) ─
  // Falls back to writeFile if WORKERFS is unavailable in this build.
  const MOUNT = '/work';
  let inputPath: string;
  let useWorkerFS = false;

  onProgress?.(8, 'Mounting file…');
  try {
    await ff.mount(FFFSType.WORKERFS, { files: [file] }, MOUNT);
    inputPath = `${MOUNT}/${file.name}`;
    useWorkerFS = true;
  } catch {
    // WORKERFS not compiled into this core build — fall back to full copy
    inputPath = `input.${ext}`;
    onProgress?.(10, 'Reading file…');
    await ff.writeFile(inputPath, await fetchFile(file));
  }

  // ── 3. Probe: read container headers only (no frame decode) ────────
  onProgress?.(15, 'Analyzing metadata…');
  const probeLogs: string[] = [];
  const probeH = ({ message }: { message: string }) => probeLogs.push(message);
  ff.on('log', probeH);
  // "-i file" without output: FFmpeg prints stream info and exits 1.
  // No "-f null -" → no frame decode → no decoder threads → no deadlock.
  try { await ff.exec(['-hide_banner', '-v', 'info', '-i', inputPath]); } catch { /* exits 1 */ }
  ff.off('log', probeH);

  const probeOutput = probeLogs.join('\n');
  const { container, containerFormatProfile, duration, video, audio: audioBase } = parseFFmpegInfo(probeOutput);
  if (!video) throw new Error('No video stream found in file');

  // Creation date from metadata tag, fallback to file.lastModified
  const creationTimeMatch = probeOutput.match(/creation_time\s*:\s*(\S+)/);
  let creationDate: string | undefined;
  if (creationTimeMatch) {
    try {
      creationDate = new Date(creationTimeMatch[1]).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { /* ignore */ }
  }
  if (!creationDate) {
    creationDate = new Date(file.lastModified).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  // ── 4. Fast start (pure JS — instant) ──────────────────────────────
  onProgress?.(25, 'Checking fast-start…');
  const fastStart = await checkFastStart(file);

  // ── 5. Fire onScanReady NOW (specs visible before loudness) ────────
  // Audio loudness comes later via onLoudnessReady.
  // lufs: -99 is the "not yet measured" sentinel shown in the UI.
  const fileMetadata: FileMetadata = {
    name: file.name,
    path: file.name,
    extension: ext,
    sizeBytes: file.size,
    sizeFormatted: formatBytes(file.size),
    duration,
    durationFormatted: formatDuration(duration),
    container,
    format: container,
    mimeType: file.type || undefined,
    width: video.width,
    height: video.height,
    creationDate,
    formatProfile: containerFormatProfile,
  };

  const initialScan: ScanResult = {
    file: fileMetadata,
    video,
    audio: audioBase ? { ...audioBase, lufs: -99, truePeak: 0 } : undefined,
    fastStart,
  };
  onScanReady?.(initialScan);

  // ── 6. Transcode to H.264 for preview (ProRes/DNxHD/MPEG-2 etc.) ──
  // Skip transcode if the browser can play the codec natively (e.g. ProRes on macOS).
  if (onTranscodeReady && needsTranscodeCodec(video.codec)) {
    const nativePlay = await canBrowserPlay(file);
    if (nativePlay) {
      // Browser plays natively — hand the original file directly to the player
      onTranscodeReady(URL.createObjectURL(file));
    } else {
      onProgress?.(30, `Converting ${video.codec.toUpperCase()} → H.264…`);
      try {
        let url: string;
        try {
          // WebCodecs path: FFmpeg decodes → raw YUV → HW VideoEncoder (NVENC / QSV / VCE)
          url = await transcodeWithWebCodecs(ff, inputPath, video, duration, (p) =>
            onProgress?.(30 + Math.round(p * 0.2), `Converting… ${p}%`)
          );
        } catch {
          // WebCodecs unavailable or HW encoder missing → WASM libx264 fallback
          url = await transcodeInFs(ff, inputPath, (p) =>
            onProgress?.(30 + Math.round(p * 0.2), `Converting… ${p}%`)
          );
        }
        onTranscodeReady(url);
      } catch (e) {
        onTranscodeError?.(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // ── 7. Loudness (3-tier: native Web Audio → WAV extract → FFmpeg loudnorm) ─
  if (audioBase && onLoudnessReady) {
    onProgress?.(50, 'Measuring loudness…');
    const { lufs, truePeak } = await analyzeLoudness(ff, inputPath, file);
    onLoudnessReady(lufs, truePeak);
  }

  // ── 8. Waveform (Web Audio API — native, no FFmpeg) ────────────────
  onProgress?.(70, 'Generating waveform…');
  const wf = await getWaveformData(file);
  onWaveformReady?.(wf);

  // ── 9. Thumbnails ──────────────────────────────────────────────────
  onProgress?.(75, 'Generating thumbnails…');
  const thumbnails = await generateThumbnails(
    file, thumbnailCount,
    (i, total) => onProgress?.(75 + Math.round((i / total) * 23), 'Generating thumbnails…'),
    { ff, inputName: inputPath, duration }
  );
  onThumbnailsReady?.(thumbnails);

  // ── Cleanup ────────────────────────────────────────────────────────
  if (useWorkerFS) {
    try { await ff.unmount(MOUNT); } catch { /* ignore */ }
  } else {
    try { await ff.deleteFile(inputPath); } catch { /* ignore */ }
  }
  onProgress?.(100, 'Done');
}

// ── Browser native playback detection ────────────────────────────────────────
//
// On macOS, Chrome/Safari can play ProRes MOV via the OS codec.
// On Windows, they cannot. Detecting this avoids an unnecessary FFmpeg transcode.

const MIME_MAP: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mxf: 'application/mxf',
  mts: 'video/mp2t',
  ts: 'video/mp2t',
};

/**
 * Returns true if the current browser can play this file natively
 * (no transcode needed).
 *
 * ProRes/MOV strategy: only macOS Safari has VideoToolbox-backed ProRes support.
 * Chrome/Firefox on macOS use their own media stack and cannot decode ProRes.
 * UA detection is the only reliable method — oncanplay is unreliable under COEP.
 *
 * For other formats (MP4, WebM, etc.) we do a real decode probe.
 */
export function canBrowserPlay(file: File): Promise<boolean> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = file.type || MIME_MAP[ext] || 'video/mp4';

  // Quick rejection: canPlayType('') means definitely unsupported container
  const probe = document.createElement('video');
  if (probe.canPlayType(mimeType) === '') return Promise.resolve(false);

  // ProRes / MOV: on macOS, both Safari AND Chrome can decode via VideoToolbox /
  // AVFoundation. Firefox on macOS uses its own stack and cannot play ProRes.
  // On Windows/Linux no browser can play ProRes natively.
  if (ext === 'mov' || mimeType === 'video/quicktime') {
    const ua        = navigator.userAgent;
    const onMac     = /Macintosh|Mac OS X/.test(ua);
    const isFirefox = /Firefox\//.test(ua);
    return Promise.resolve(onMac && !isFirefox);
  }

  // For all other formats: do a real decode probe.
  // oncanplay fires when the browser confirms it can actually start playback.
  return new Promise(resolve => {
    const url   = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted   = true;
    video.preload = 'auto';
    let settled   = false;

    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.src = '';
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => done(false), 4000);
    video.oncanplay = () => done(true);
    video.onerror   = () => done(false);
    video.src = url;
    video.load();
    video.play().catch(() => { /* autoplay blocked — canplay may still fire */ });
  });
}

// ── Codec detection for browser-incompatible formats ────────────────────────

const NEEDS_TRANSCODE_CODECS = new Set([
  'prores', 'apch', 'apcn', 'apcs', 'apco', 'ap4h', 'ap4x',
  'dnxhd', 'dnxhr',
  'mpeg2video', 'mpeg1video',
  'v210', 'r10k', 'r210', 'dpx',
]);

export function needsTranscodeCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  return NEEDS_TRANSCODE_CODECS.has(c) || c.startsWith('prores') || c.startsWith('dnx');
}

// ── Transcode to H.264 (reuses file already in WASM FS) ──────────────────────

async function transcodeInFs(
  ff: FFmpeg,
  inputName: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const outputName = 'transcode_output.mp4';

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(99, Math.round(progress * 100)));
  };
  ff.on('progress', progressHandler);

  try {
    await ff.exec([
      '-threads', '1',        // prevent MT encoder sub-threads
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',           // Higher CRF = faster encode, fine for preview
      '-vf', 'scale=-2:480',  // 480p preview — faster encode than 720p
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ]);
  } finally {
    ff.off('progress', progressHandler);
  }

  onProgress?.(100);
  const data = await ff.readFile(outputName);
  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  try { await ff.deleteFile(outputName); } catch { /* ignore */ }
  return url;
}

// ── WebCodecs hybrid transcode ────────────────────────────────────────────────
//
// Strategy: FFmpeg WASM decodes ProRes → raw YUV (video.raw), processed in
// 3-second chunks to keep WASM FS memory bounded (~55 MB per chunk at 480p).
// Each frame is wrapped in a VideoFrame and fed to WebCodecs VideoEncoder,
// which uses OS hardware acceleration (NVENC / Intel QSV / AMD VCE on Windows).
// Audio is extracted as WAV → encoded to AAC via WebCodecs AudioEncoder.
// Everything is muxed into an in-memory MP4 via mp4-muxer.
//
// Falls back to transcodeInFs (WASM libx264) if:
//   - VideoEncoder not supported or no H.264 HW codec available
//   - Any step fails (file read, encoding, muxing errors)

async function transcodeWithWebCodecs(
  ff: FFmpeg,
  inputPath: string,
  video: VideoMetadata,
  duration: number,
  onProgress?: (pct: number) => void,
): Promise<string> {
  // ── Feature detection ──────────────────────────────────────────────
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    throw new Error('WebCodecs not available');
  }

  // Compute 480p output dimensions (even width required by H.264)
  const outHeight = Math.min(480, video.height);
  const outWidth  = Math.round(video.width * outHeight / video.height) & ~1;
  const fps       = video.frameRate || 25;
  const frameSize = outWidth * outHeight * 3 >> 1; // I420 bytes per frame

  // H.264 Main Profile level 3.1 — supports up to 480p @ 30fps
  const vcConfig: VideoEncoderConfig = {
    codec:       'avc1.4D001F',
    width:       outWidth,
    height:      outHeight,
    bitrate:     2_000_000,
    framerate:   fps,
    latencyMode: 'quality',
  };
  const support = await VideoEncoder.isConfigSupported(vcConfig);
  if (!support.supported) throw new Error('H.264 VideoEncoder not supported on this device');

  // ── mp4-muxer (dynamic import — only loaded when WebCodecs path is taken) ──
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  // ── Audio extraction (optional — video-only output if this fails) ──
  let audioBuffer: AudioBuffer | null = null;
  const wavFile = '_wc_audio.wav';
  try {
    await ff.exec([
      '-threads', '1', '-i', inputPath,
      '-vn', '-af', 'aresample=48000',
      '-c:a', 'pcm_s16le', '-f', 'wav', '-y', wavFile,
    ]);
    const wavRaw = await ff.readFile(wavFile) as Uint8Array<ArrayBuffer>;
    try { await ff.deleteFile(wavFile); } catch { /* ignore */ }
    const wavCopy = wavRaw.buffer.slice(wavRaw.byteOffset, wavRaw.byteOffset + wavRaw.byteLength);
    const ctx = new AudioContext({ sampleRate: 48000 });
    audioBuffer = await ctx.decodeAudioData(wavCopy);
    await ctx.close();
  } catch { /* no audio — video-only */ }

  const nCh = audioBuffer?.numberOfChannels ?? 2;

  // ── Configure muxer ────────────────────────────────────────────────
  const target = new ArrayBufferTarget();
  const muxer  = new Muxer({
    target,
    video: { codec: 'avc', width: outWidth, height: outHeight, frameRate: fps },
    ...(audioBuffer ? { audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: nCh } } : {}),
    fastStart:              'in-memory',
    firstTimestampBehavior: 'offset',
  });

  // ── Video encoding — chunked (3 s each) ────────────────────────────
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error:  (e) => { throw e; },
  });
  videoEncoder.configure(vcConfig);

  const chunkSecs = 3;
  let globalFrame = 0;

  for (let chunkStart = 0; chunkStart < duration; chunkStart += chunkSecs) {
    const chunkEnd    = Math.min(chunkStart + chunkSecs, duration);
    const chunkFrames = Math.round((chunkEnd - chunkStart) * fps);
    const rawFile     = '_wc_chunk.yuv';

    // Extract raw YUV for this chunk (no audio, scale to 480p)
    await ff.exec([
      '-threads', '1',
      '-ss', chunkStart.toFixed(6), '-t', (chunkEnd - chunkStart).toFixed(6),
      '-i', inputPath,
      '-an',
      '-vf', `scale=${outWidth}:${outHeight}`,
      '-pix_fmt', 'yuv420p',
      '-f', 'rawvideo', '-y', rawFile,
    ]);
    const rawData = await ff.readFile(rawFile) as Uint8Array<ArrayBuffer>;
    try { await ff.deleteFile(rawFile); } catch { /* ignore */ }

    // Copy out of WASM heap — VideoFrame needs a detached ArrayBuffer
    const rawCopy = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
    const maxFrames = Math.floor(rawCopy.byteLength / frameSize);

    for (let i = 0; i < Math.min(chunkFrames, maxFrames); i++) {
      const frameBuf  = rawCopy.slice(i * frameSize, (i + 1) * frameSize);
      const timestamp = Math.round(globalFrame * 1_000_000 / fps); // microseconds
      const frame     = new VideoFrame(frameBuf, {
        format:      'I420',
        codedWidth:  outWidth,
        codedHeight: outHeight,
        timestamp,
        duration: Math.round(1_000_000 / fps),
      });
      videoEncoder.encode(frame, { keyFrame: globalFrame % Math.round(fps * 2) === 0 });
      frame.close();
      globalFrame++;
    }

    // Flush after each chunk so chunks are muxed incrementally
    await videoEncoder.flush();
    onProgress?.(Math.round((chunkEnd / duration) * (audioBuffer ? 70 : 95)));
  }

  videoEncoder.close();

  // ── Audio encoding (WebCodecs AudioEncoder → AAC) ──────────────────
  if (audioBuffer) {
    const acConfig: AudioEncoderConfig = {
      codec:            'mp4a.40.2', // AAC-LC
      sampleRate:       48000,
      numberOfChannels: nCh,
      bitrate:          128_000,
    };
    const aSupport = await AudioEncoder.isConfigSupported(acConfig);
    if (aSupport.supported) {
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error:  (e) => console.warn('[WebCodecs] AudioEncoder error:', e),
      });
      audioEncoder.configure(acConfig);

      // Feed PCM data in 4096-sample frames (standard AAC block size)
      const frameLen = 4096;
      const numSamples = audioBuffer.length;

      // Build interleaved Float32 view of all channel data
      const interleaved = new Float32Array(numSamples * nCh);
      for (let c = 0; c < nCh; c++) {
        const ch = audioBuffer.getChannelData(c);
        for (let s = 0; s < numSamples; s++) interleaved[s * nCh + c] = ch[s];
      }

      for (let offset = 0; offset < numSamples; offset += frameLen) {
        const count     = Math.min(frameLen, numSamples - offset);
        const timestamp = Math.round(offset / 48000 * 1_000_000);
        const slice     = interleaved.subarray(offset * nCh, (offset + count) * nCh);
        const audioData = new AudioData({
          format:           'f32',  // 'f32' = interleaved 32-bit float (non-planar)
          sampleRate:       48000,
          numberOfFrames:   count,
          numberOfChannels: nCh,
          timestamp,
          data: slice,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }

      await audioEncoder.flush();
      audioEncoder.close();
    }
    onProgress?.(96);
  }

  // ── Finalize and return blob URL ────────────────────────────────────
  muxer.finalize();
  const { buffer } = target;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  onProgress?.(100);
  return URL.createObjectURL(blob);
}

// ── Transcode to H.264 for browser preview ───────────────────────────────────
// Used for ProRes, DNxHD, MPEG-2 and other codecs Chromium can't decode.
// Writes the file to WASM FS itself; use transcodeInFs if file is already there.

export async function transcodeToH264(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const ff = await loadFFmpeg();

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mov';
  const inputName = `transcode_input.${ext}`;

  onProgress?.(5);
  await ff.writeFile(inputName, await fetchFile(file));
  onProgress?.(20);

  const url = await transcodeInFs(ff, inputName, (p) => onProgress?.(20 + Math.round(p * 0.78)));

  try { await ff.deleteFile(inputName); } catch { /* ignore */ }
  onProgress?.(100);
  return url;
}

// ── Frame extraction (for ContrastChecker snapshots) ────────────────────────
// Captures a frame from an HTML video element using Canvas.

export function captureFrameFromVideo(
  videoEl: HTMLVideoElement
): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}

// ── SRT export (pure JS, no FFmpeg needed) ───────────────────────────────────

export function exportSRT(segments: Array<{ from: number; to: number; text: string }>): void {
  const toSRTTime = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const f = ms % 1000;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(f).padStart(3,'0')}`;
  };

  const srt = segments
    .map((seg, i) => `${i + 1}\n${toSRTTime(seg.from)} --> ${toSRTTime(seg.to)}\n${seg.text}`)
    .join('\n\n');

  const blob = new Blob([srt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'subtitles.srt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
