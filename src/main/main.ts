import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  runFFprobe,
  analyzeLoudness,
  checkFastStart,
  extractThumbnail,
  getAudioWaveformData,
  detectFFmpegPaths,
  setFFmpegPaths,
  getFFmpegPaths,
} from './ffmpeg-integration';
import {
  detectWhisperPath,
  setWhisperPaths,
  getWhisperPaths,
  transcribeVideo,
  saveSRT,
} from './whisper-integration';
import type {
  ScanResult,
  ValidationCheck,
  ValidationPreset,
  ValidationReport,
  FileMetadata,
  VideoMetadata,
  AudioMetadata,
} from '../shared/types';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// ── Persistent config ────────────────────────────────────────────
function configPath() {
  return path.join(app.getPath('userData'), 'advalify-config.json');
}

function loadSavedConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const cfg = JSON.parse(raw) as { whisperBinary?: string; whisperModel?: string };
    if (cfg.whisperBinary || cfg.whisperModel) {
      setWhisperPaths(cfg.whisperBinary ?? '', cfg.whisperModel ?? '');
    }
  } catch { /* file doesn't exist yet */ }
}

function persistConfig() {
  try {
    const { binary, model } = getWhisperPaths();
    fs.writeFileSync(configPath(), JSON.stringify({ whisperBinary: binary, whisperModel: model }), 'utf-8');
  } catch { /* non-fatal */ }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: 'Kissd Video Validation Tool',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local file:// URLs
    },
    show: false,
    backgroundColor: '#0a0a0a',
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mxf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFilePath', async (_, defaultName: string) => {
  if (!mainWindow) return null;

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }],
  });

  return result.canceled ? null : result.filePath;
});

ipcMain.handle('file:saveFile', async (_, srcPath: string, destPath: string) => {
  await fs.promises.copyFile(srcPath, destPath);
  return destPath;
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ── Color inference helpers ─────────────────────────────────────

// Color model from pix_fmt — matches MediaInfo "Color space" (YUV / RGB)
function colorModelFromPixFmt(pixFmt?: string): string {
  if (!pixFmt) return 'YUV';
  if (pixFmt.startsWith('rgb') || pixFmt.startsWith('bgr')) return 'RGB';
  if (pixFmt.startsWith('gray')) return 'Grayscale';
  return 'YUV';
}

function inferColorRange(pixFmt?: string): string {
  return pixFmt?.startsWith('yuvj') ? 'pc' : 'tv';
}

function inferColorPrimaries(w: number, h: number): string {
  if (w >= 3840 || h >= 2160) return 'bt2020';
  if (w >= 1280 || h >= 720)  return 'bt709';
  return 'smpte170m';
}

function inferColorTransfer(w: number, h: number): string {
  if (w >= 3840 || h >= 2160) return 'bt2020-10';
  if (w >= 1280 || h >= 720)  return 'bt709';
  return 'smpte170m';
}

ipcMain.handle('video:scan', async (_, filePath: string) => {
  const ffprobeData = await runFFprobe(filePath);
  const loudness = await analyzeLoudness(filePath);
  const fastStart = await checkFastStart(filePath);
  const fileStats = fs.statSync(filePath);
  
  const videoStream = ffprobeData.streams.find(s => s.codec_type === 'video');
  const audioStream = ffprobeData.streams.find(s => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error('No video stream found');
  }

  const [width, height] = [videoStream.width || 0, videoStream.height || 0];
  
  // Parse frame rate
  let frameRate = 0;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    frameRate = den ? num / den : num;
  }

  // Calculate bitrate
  const duration = parseFloat(ffprobeData.format.duration || '0');
  const bitRate = Math.round((fileStats.size * 8) / duration / 1000);

  const fileMetadata: FileMetadata = {
    name: path.basename(filePath),
    path: filePath,
    extension: path.extname(filePath).slice(1),
    sizeBytes: fileStats.size,
    sizeFormatted: formatBytes(fileStats.size),
    duration,
    durationFormatted: formatDuration(duration),
    container: ffprobeData.format.format_name.split(',')[0],
    format: ffprobeData.format.format_long_name || ffprobeData.format.format_name,
    hash: await calculateHash(filePath),
  };

  const videoMetadata: VideoMetadata = {
    codec: videoStream.codec_name || 'unknown',
    profile: videoStream.profile,
    width,
    height,
    frameRate,
    frameRateFormatted: frameRate.toFixed(3),
    bitRate,
    bitRateFormatted: `${bitRate} kbps`,
    bitDepth: videoStream.bits_per_raw_sample ? parseInt(videoStream.bits_per_raw_sample) : undefined,
    colorSpace:     colorModelFromPixFmt(videoStream.pix_fmt),
    colorRange:     videoStream.color_range     || inferColorRange(videoStream.pix_fmt),
    colorPrimaries: videoStream.color_primaries || inferColorPrimaries(width, height),
    colorTransfer:  videoStream.color_transfer  || inferColorTransfer(width, height),
    chromaSubsampling: videoStream.pix_fmt?.includes('422') ? '4:2:2' : 
                       videoStream.pix_fmt?.includes('444') ? '4:4:4' : '4:2:0',
    scanType: videoStream.field_order === 'progressive' ? 'Progressive' : 
              videoStream.field_order === 'tt' || videoStream.field_order === 'bb' ? 'Interlaced' : 'Progressive',
  };

  const audioMetadata: AudioMetadata | undefined = audioStream ? {
    codec: audioStream.codec_name || 'unknown',
    sampleRate: parseInt(audioStream.sample_rate || '0'),
    channels: audioStream.channels || 0,
    channelLayout: audioStream.channel_layout || 'unknown',
    bitDepth: audioStream.sample_fmt?.includes('16') ? 16 :
              audioStream.sample_fmt?.includes('24') ? 24 :
              audioStream.sample_fmt?.includes('32') ? 32 : undefined,
    bitRate: audioStream.bit_rate ? parseInt(audioStream.bit_rate) : undefined,
    lufs: parseFloat(parseFloat(String(loudness.input_i)).toFixed(1)),
    truePeak: parseFloat(parseFloat(String(loudness.input_tp)).toFixed(1)),
  } : undefined;

  const result: ScanResult = {
    file: fileMetadata,
    video: videoMetadata,
    audio: audioMetadata,
    fastStart: {
      enabled: fastStart.hasFastStart,
      moovAt: fastStart.moovPosition,
    },
  };

  return result;
});

ipcMain.handle('video:generateThumbnails', async (_, filePath: string, outputDir: string) => {
  const ffprobeData = await runFFprobe(filePath);
  const duration = parseFloat(ffprobeData.format.duration || '0');
  
  // Generate 10 thumbnails: first frame, 8 evenly spaced, last frame
  const numThumbs = 10;
  const thumbnails: string[] = [];

  await fs.promises.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < numThumbs; i++) {
    let time: number;
    if (i === 0) {
      time = 0;                               // first frame
    } else if (i === numThumbs - 1) {
      time = Math.max(0, duration - 0.1);     // last frame
    } else {
      time = (duration / (numThumbs - 1)) * i; // evenly spaced in between
    }
    const outputPath = path.join(outputDir, `thumb_${i + 1}.jpg`);
    await extractThumbnail(filePath, time, outputPath);
    thumbnails.push(outputPath);
  }
  
  return thumbnails;
});

ipcMain.handle('video:extractFrame', async (_, filePath: string, time: number, outputPath: string) => {
  await extractThumbnail(filePath, time, outputPath);
  return outputPath;
});

ipcMain.handle('video:getWaveform', async (_, filePath: string) => {
  const data = await getAudioWaveformData(filePath);
  return data;
});

ipcMain.handle('validation:run', async (_, scanResult: ScanResult, preset: ValidationPreset) => {
  const checks: ValidationCheck[] = [];

  // Container checks
  checks.push({
    id: 'container-format',
    name: 'Container Format',
    category: 'container',
    status: 'pass',
    message: `${scanResult.file.container.toUpperCase()} format supported`,
    detected: scanResult.file.container,
  });

  checks.push({
    id: 'fast-start',
    name: 'Fast Start (Moov Atom)',
    category: 'container',
    status: scanResult.fastStart.enabled ? 'pass' : 'fail',
    message: scanResult.fastStart.enabled
      ? 'Moov atom optimized for streaming'
      : 'Moov atom is not at the beginning of the file',
    detected: scanResult.fastStart.enabled ? 'Yes' : 'No',
  });

  // Video checks
  checks.push({
    id: 'video-codec',
    name: 'Video Codec',
    category: 'video',
    status: preset.allowedVideoCodecs?.includes(scanResult.video.codec.toLowerCase()) ? 'pass' : 'warn',
    message: `Codec: ${scanResult.video.codec.toUpperCase()}`,
    detected: scanResult.video.codec,
  });

  const isResolutionValid = preset.resolutions?.some(r =>
    r.width === scanResult.video.width && r.height === scanResult.video.height
  ) ?? true;
  checks.push({
    id: 'resolution',
    name: 'Resolution',
    category: 'video',
    status: isResolutionValid ? 'pass' : 'warn',
    message: `${scanResult.video.width}x${scanResult.video.height}`,
    detected: `${scanResult.video.width}x${scanResult.video.height}`,
  });

  const isFrameRateValid = preset.frameRates.some(fr =>
    Math.abs(fr - scanResult.video.frameRate) < 0.1
  );
  checks.push({
    id: 'frame-rate',
    name: 'Frame Rate',
    category: 'video',
    status: isFrameRateValid ? 'pass' : 'warn',
    message: `${scanResult.video.frameRate.toFixed(3)} fps`,
    detected: `${scanResult.video.frameRate.toFixed(3)} fps`,
  });

  checks.push({
    id: 'scan-type',
    name: 'Scan Type',
    category: 'video',
    status: preset.requireProgressive && scanResult.video.scanType !== 'Progressive' ? 'fail' : 'pass',
    message: scanResult.video.scanType,
    detected: scanResult.video.scanType,
  });

  checks.push({
    id: 'chroma-subsampling',
    name: 'Chroma Subsampling',
    category: 'video',
    status: scanResult.video.chromaSubsampling === preset.chromaSubsampling ? 'pass' : 'warn',
    message: scanResult.video.chromaSubsampling,
    detected: scanResult.video.chromaSubsampling,
  });

  // Aspect ratio check
  if (preset.aspectRatios && preset.aspectRatios.length > 0) {
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const d = gcd(scanResult.video.width, scanResult.video.height);
    const detectedAR = `${scanResult.video.width / d}:${scanResult.video.height / d}`;
    const arPass = preset.aspectRatios.some(ar => ar.trim() === detectedAR);
    checks.push({
      id: 'aspect-ratio',
      name: 'Aspect Ratio',
      category: 'video',
      status: arPass ? 'pass' : 'warn',
      message: detectedAR,
      detected: detectedAR,
      expected: preset.aspectRatios.join(', '),
    });
  }

  // Bitrate checks
  if (preset.maxBitrateMbps != null) {
    const mbps = scanResult.video.bitRate / 1_000_000;
    checks.push({
      id: 'video-bitrate-max',
      name: 'Video Bitrate (max)',
      category: 'video',
      status: mbps <= preset.maxBitrateMbps ? 'pass' : 'warn',
      message: `${mbps.toFixed(2)} Mbps`,
      detected: `${mbps.toFixed(2)} Mbps`,
      expected: `≤ ${preset.maxBitrateMbps} Mbps`,
    });
  }

  if (preset.minBitrateMbps != null) {
    const mbps = scanResult.video.bitRate / 1_000_000;
    checks.push({
      id: 'video-bitrate-min',
      name: 'Video Bitrate (min)',
      category: 'video',
      status: mbps >= preset.minBitrateMbps ? 'pass' : 'warn',
      message: `${mbps.toFixed(2)} Mbps`,
      detected: `${mbps.toFixed(2)} Mbps`,
      expected: `≥ ${preset.minBitrateMbps} Mbps`,
    });
  }

  // File size check
  if (preset.maxFileSizeMb != null) {
    const fileMb = scanResult.file.sizeBytes / (1024 * 1024);
    checks.push({
      id: 'file-size',
      name: 'File Size',
      category: 'container',
      status: fileMb <= preset.maxFileSizeMb ? 'pass' : 'fail',
      message: `${fileMb.toFixed(1)} MB`,
      detected: `${fileMb.toFixed(1)} MB`,
      expected: `≤ ${preset.maxFileSizeMb} MB`,
    });
  }

  // Audio checks
  if (scanResult.audio) {
    const lufsInRange = scanResult.audio.lufs >= -16 && scanResult.audio.lufs <= -14;
    checks.push({
      id: 'audio-lufs',
      name: 'Loudness (LUFS)',
      category: 'audio',
      status: lufsInRange ? 'pass' : 'warn',
      message: `Integrated: ${scanResult.audio.lufs} LUFS`,
      detected: `${scanResult.audio.lufs} LUFS`,
    });

    const tpInRange = scanResult.audio.truePeak <= -1.0;
    checks.push({
      id: 'audio-truepeak',
      name: 'True Peak',
      category: 'audio',
      status: tpInRange ? 'pass' : 'fail',
      message: `${scanResult.audio.truePeak} dBTP`,
      detected: `${scanResult.audio.truePeak} dBTP`,
    });

    checks.push({
      id: 'audio-codec',
      name: 'Audio Codec',
      category: 'audio',
      status: preset.allowedAudioCodecs && preset.allowedAudioCodecs.length > 0
        ? (preset.allowedAudioCodecs.includes(scanResult.audio.codec.toLowerCase()) ? 'pass' : 'warn')
        : 'pass',
      message: scanResult.audio.codec.toUpperCase(),
      detected: scanResult.audio.codec,
      expected: preset.allowedAudioCodecs?.join(', ').toUpperCase(),
    });

    if (preset.audioSampleRate != null) {
      checks.push({
        id: 'audio-sample-rate',
        name: 'Audio Sample Rate',
        category: 'audio',
        status: scanResult.audio.sampleRate === preset.audioSampleRate ? 'pass' : 'warn',
        message: `${scanResult.audio.sampleRate} Hz`,
        detected: `${scanResult.audio.sampleRate} Hz`,
        expected: `${preset.audioSampleRate} Hz`,
      });
    }

    if (preset.audioChannels != null) {
      checks.push({
        id: 'audio-channels',
        name: 'Audio Channels',
        category: 'audio',
        status: scanResult.audio.channels === preset.audioChannels ? 'pass' : 'warn',
        message: `${scanResult.audio.channels} ch (${scanResult.audio.channelLayout})`,
        detected: `${scanResult.audio.channels}`,
        expected: `${preset.audioChannels}`,
      });
    }

    if (preset.minAudioKbps != null && scanResult.audio.bitRate != null) {
      const kbps = scanResult.audio.bitRate / 1000;
      checks.push({
        id: 'audio-bitrate',
        name: 'Audio Bitrate (min)',
        category: 'audio',
        status: kbps >= preset.minAudioKbps ? 'pass' : 'warn',
        message: `${kbps.toFixed(0)} kbps`,
        detected: `${kbps.toFixed(0)} kbps`,
        expected: `≥ ${preset.minAudioKbps} kbps`,
      });
    }

    if (preset.audioBitDepth != null && scanResult.audio.bitDepth != null) {
      checks.push({
        id: 'audio-bit-depth',
        name: 'Audio Bit Depth',
        category: 'audio',
        status: scanResult.audio.bitDepth === preset.audioBitDepth ? 'pass' : 'warn',
        message: `${scanResult.audio.bitDepth}-bit`,
        detected: `${scanResult.audio.bitDepth}`,
        expected: `${preset.audioBitDepth}-bit`,
      });
    }
  }

  return checks;
});

ipcMain.handle('report:savePDF', async (_, report: ValidationReport, outputPath: string) => {
  // The PDF generation is done in the renderer process using jsPDF
  // This is just a placeholder - actual implementation sends data back
  return outputPath;
});

ipcMain.handle('shell:openPath', async (_, filePath: string) => {
  await shell.openPath(filePath);
});

ipcMain.handle('app:getTempDir', async () => {
  const dir = path.join(app.getPath('temp'), 'advalify');
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
});

ipcMain.handle('app:getSafezoneDir', () => {
  return path.join(app.getAppPath(), 'Safezones');
});

ipcMain.handle('file:copyFiles', async (_, sources: string[], destDir: string) => {
  await fs.promises.mkdir(destDir, { recursive: true });
  const results: string[] = [];
  for (const src of sources) {
    const dest = path.join(destDir, path.basename(src));
    await fs.promises.copyFile(src, dest);
    results.push(dest);
  }
  return results;
});

ipcMain.handle('ffmpeg:check', async () => {
  return detectFFmpegPaths();
});

ipcMain.handle('ffmpeg:setPath', async (_, ffmpegPath: string, ffprobePath: string) => {
  setFFmpegPaths(ffmpegPath, ffprobePath);
  return true;
});

ipcMain.handle('whisper:check', async () => {
  return detectWhisperPath();
});

ipcMain.handle('whisper:setPath', async (_, binary: string, model: string) => {
  setWhisperPaths(binary, model);
  persistConfig();
  return true;
});

ipcMain.handle('whisper:getPath', async () => {
  return getWhisperPaths();
});

ipcMain.handle('whisper:transcribe', async (_, videoPath: string, workDir: string) => {
  return transcribeVideo(videoPath, workDir);
});

ipcMain.handle('whisper:saveSRT', async (_, segments: { from: number; to: number; text: string }[], outputPath: string) => {
  return saveSRT(segments, outputPath);
});

// App events
app.whenReady().then(() => {
  loadSavedConfig();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});