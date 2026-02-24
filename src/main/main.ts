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
    colorSpace: videoStream.color_space,
    colorRange: videoStream.color_range,
    colorPrimaries: videoStream.color_primaries,
    colorTransfer: videoStream.color_transfer,
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
      status: preset.allowedAudioCodecs?.includes(scanResult.audio.codec.toLowerCase()) ? 'pass' : 'warn',
      message: scanResult.audio.codec.toUpperCase(),
      detected: scanResult.audio.codec,
    });
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

// App events
app.whenReady().then(() => {
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