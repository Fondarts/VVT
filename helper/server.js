#!/usr/bin/env node
/**
 * KISSD Export Helper — local companion server for native FFmpeg exports.
 * Runs on localhost:3777. Communicates with the KISSD web app.
 *
 * On first run, automatically downloads FFmpeg if not found.
 */

const http = require('http');
const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '3777');
const VERSION = '1.0.0';
const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const FFMPEG_DIR = path.join(APP_DIR, 'ffmpeg');
const TEMP_DIR = path.join(os.tmpdir(), 'kissd-helper');
const FFMPEG_URL_WIN = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';

let ffmpegPath = null;
let ffprobePath = null;

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── State ──
let currentJob = null;

// ═══════════════════════════════════════════════
//  FFmpeg auto-detection & download
// ═══════════════════════════════════════════════

function findInPath(cmd) {
  try {
    const where = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${where} ${cmd}`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    return result.split(/\r?\n/)[0]; // first match
  } catch { return null; }
}

function findLocalFFmpeg() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const localFF = path.join(FFMPEG_DIR, `ffmpeg${ext}`);
  const localProbe = path.join(FFMPEG_DIR, `ffprobe${ext}`);
  if (fs.existsSync(localFF)) return { ffmpeg: localFF, ffprobe: fs.existsSync(localProbe) ? localProbe : null };
  return null;
}

function resolveFFmpeg() {
  // 1. Check local ./ffmpeg/ directory
  const local = findLocalFFmpeg();
  if (local) {
    ffmpegPath = local.ffmpeg;
    ffprobePath = local.ffprobe;
    return true;
  }
  // 2. Check system PATH
  const sysFF = findInPath('ffmpeg');
  if (sysFF) {
    ffmpegPath = sysFF;
    ffprobePath = findInPath('ffprobe');
    return true;
  }
  return false;
}

/** Download a URL to a file, following redirects. Returns a promise. */
function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (url, redirects = 0) => {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      const proto = url.startsWith('https') ? https : require('http');
      proto.get(url, { headers: { 'User-Agent': 'KISSD-Helper' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const ws = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) onProgress?.(Math.round(received / total * 100));
        });
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve(); });
        ws.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

function getFFmpegDownloadInfo() {
  const arch = process.arch; // 'x64' or 'arm64'
  if (process.platform === 'win32') {
    return {
      url: FFMPEG_URL_WIN,
      archive: 'ffmpeg.zip',
      extract: 'zip',
      binaries: ['ffmpeg.exe', 'ffprobe.exe'],
    };
  }
  if (process.platform === 'darwin') {
    // macOS — use evermeet.cx static builds (universal approach via BtbN for x64, or osxcross)
    // Using the BtbN linux builds won't work on mac. Use a different strategy:
    // Download individual binaries from evermeet.cx
    return {
      urlFFmpeg: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
      urlFFprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
      extract: 'zip-mac',
      binaries: ['ffmpeg', 'ffprobe'],
      arch,
    };
  }
  if (process.platform === 'linux') {
    return {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
      archive: 'ffmpeg.tar.xz',
      extract: 'tar',
      binaries: ['ffmpeg', 'ffprobe'],
    };
  }
  return null;
}

async function downloadFFmpeg() {
  const info = getFFmpegDownloadInfo();
  if (!info) {
    console.log('\n  Auto-download not supported on this platform.');
    console.log('  Please install FFmpeg manually.\n');
    return false;
  }

  console.log('\n  FFmpeg not found. Downloading automatically...');
  console.log('  (This only happens once)\n');

  if (!fs.existsSync(FFMPEG_DIR)) fs.mkdirSync(FFMPEG_DIR, { recursive: true });

  try {
    if (info.extract === 'zip-mac') {
      // macOS: download ffmpeg and ffprobe separately from evermeet.cx
      for (const [label, url] of [['ffmpeg', info.urlFFmpeg], ['ffprobe', info.urlFFprobe]]) {
        const zipPath = path.join(FFMPEG_DIR, `${label}.zip`);
        await download(url, zipPath, (pct) => {
          process.stdout.write(`\r  Downloading ${label}... ${pct}%  `);
        });
        console.log('');
        execSync(`unzip -o "${zipPath}" -d "${FFMPEG_DIR}"`, { stdio: 'inherit', timeout: 30000 });
        execSync(`chmod +x "${path.join(FFMPEG_DIR, label)}"`, { stdio: 'inherit' });
        try { fs.unlinkSync(zipPath); } catch {}
      }
    } else if (info.extract === 'zip') {
      // Windows
      const zipPath = path.join(FFMPEG_DIR, info.archive);
      await download(info.url, zipPath, (pct) => {
        process.stdout.write(`\r  Downloading FFmpeg... ${pct}%  `);
      });
      console.log('\n  Download complete. Extracting...');
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${FFMPEG_DIR}' -Force"`,
        { stdio: 'inherit', timeout: 120000 }
      );
      // Move binaries from nested folder
      const entries = fs.readdirSync(FFMPEG_DIR);
      const extracted = entries.find(e => e.startsWith('ffmpeg-') && fs.statSync(path.join(FFMPEG_DIR, e)).isDirectory());
      if (extracted) {
        const binDir = path.join(FFMPEG_DIR, extracted, 'bin');
        for (const file of info.binaries) {
          const src = path.join(binDir, file);
          const dest = path.join(FFMPEG_DIR, file);
          if (fs.existsSync(src)) fs.renameSync(src, dest);
        }
        fs.rmSync(path.join(FFMPEG_DIR, extracted), { recursive: true, force: true });
      }
      try { fs.unlinkSync(zipPath); } catch {}
    } else if (info.extract === 'tar') {
      // Linux
      const tarPath = path.join(FFMPEG_DIR, info.archive);
      await download(info.url, tarPath, (pct) => {
        process.stdout.write(`\r  Downloading FFmpeg... ${pct}%  `);
      });
      console.log('\n  Download complete. Extracting...');
      execSync(`tar xf "${tarPath}" -C "${FFMPEG_DIR}"`, { stdio: 'inherit', timeout: 120000 });
      const entries = fs.readdirSync(FFMPEG_DIR);
      const extracted = entries.find(e => e.startsWith('ffmpeg-') && fs.statSync(path.join(FFMPEG_DIR, e)).isDirectory());
      if (extracted) {
        const binDir = path.join(FFMPEG_DIR, extracted, 'bin');
        for (const file of info.binaries) {
          const src = path.join(binDir, file);
          const dest = path.join(FFMPEG_DIR, file);
          if (fs.existsSync(src)) fs.renameSync(src, dest);
        }
        fs.rmSync(path.join(FFMPEG_DIR, extracted), { recursive: true, force: true });
      }
      try { fs.unlinkSync(tarPath); } catch {}
    }

    console.log('  FFmpeg installed successfully!\n');
    return resolveFFmpeg();
  } catch (err) {
    console.error(`\n  Failed to download FFmpeg: ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════
//  HTTP helpers
// ═══════════════════════════════════════════════

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ═══════════════════════════════════════════════
//  FFmpeg version check
// ═══════════════════════════════════════════════

function checkFFmpeg() {
  if (!ffmpegPath) return Promise.resolve(null);
  return new Promise((resolve) => {
    exec(`"${ffmpegPath}" -version`, (err, stdout) => {
      if (err) resolve(null);
      else {
        const match = stdout.match(/ffmpeg version (\S+)/);
        resolve(match ? match[1] : 'unknown');
      }
    });
  });
}

// ═══════════════════════════════════════════════
//  Native file dialogs
// ═══════════════════════════════════════════════

function pickFile(title = 'Select file') {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true; $f.WindowState = 'Minimized'; $f.Show(); $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = '${title}'; $d.Filter = 'All files (*.*)|*.*'; if($d.ShowDialog($f) -eq 'OK'){$d.FileName}; $f.Close()`;
      exec(`powershell -NoProfile -Command "${ps}"`, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim() || null);
      });
    } else if (process.platform === 'darwin') {
      exec(`osascript -e 'POSIX path of (choose file with prompt "${title}")'`, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      });
    } else {
      exec(`zenity --file-selection --title="${title}"`, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      });
    }
  });
}

function pickSaveFile(title = 'Save as', defaultName = 'output.mp4') {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const ext = path.extname(defaultName).slice(1);
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true; $f.WindowState = 'Minimized'; $f.Show(); $d = New-Object System.Windows.Forms.SaveFileDialog; $d.Title = '${title}'; $d.FileName = '${defaultName}'; $d.Filter = '${ext.toUpperCase()} files (*.${ext})|*.${ext}|All files (*.*)|*.*'; if($d.ShowDialog($f) -eq 'OK'){$d.FileName}; $f.Close()`;
      exec(`powershell -NoProfile -Command "${ps}"`, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim() || null);
      });
    } else if (process.platform === 'darwin') {
      exec(`osascript -e 'POSIX path of (choose file name with prompt "${title}" default name "${defaultName}")'`, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      });
    } else {
      exec(`zenity --file-selection --save --title="${title}" --filename="${defaultName}"`, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      });
    }
  });
}

// ═══════════════════════════════════════════════
//  Video probing
// ═══════════════════════════════════════════════

function probeVideo(filePath) {
  const probeBin = ffprobePath || ffmpegPath;
  const useProbe = !!ffprobePath;
  return new Promise((resolve) => {
    if (useProbe) {
      exec(`"${probeBin}" -v quiet -print_format json -show_streams -show_format "${filePath}"`, (err, stdout) => {
        if (err) return resolve({ width: 1920, height: 1080, fps: 25, hasAudio: true });
        try {
          const data = JSON.parse(stdout);
          const video = data.streams.find(s => s.codec_type === 'video');
          const audio = data.streams.find(s => s.codec_type === 'audio');
          const [num, den] = (video?.r_frame_rate || '25/1').split('/').map(Number);
          resolve({
            width: video?.width || 1920,
            height: video?.height || 1080,
            fps: Math.round((den ? num / den : num) * 100) / 100,
            hasAudio: !!audio,
          });
        } catch { resolve({ width: 1920, height: 1080, fps: 25, hasAudio: true }); }
      });
    } else {
      // Fallback: parse ffmpeg stderr
      exec(`"${ffmpegPath}" -hide_banner -i "${filePath}" -f null - 2>&1`, { timeout: 15000 }, (err, stdout, stderr) => {
        const output = stderr || stdout || '';
        let width = 1920, height = 1080, fps = 25;
        const resMatch = output.match(/(\d{2,5})x(\d{2,5})/);
        if (resMatch) { width = parseInt(resMatch[1]); height = parseInt(resMatch[2]); }
        const fpsMatch = output.match(/([\d.]+)\s*fps/);
        if (fpsMatch) fps = parseFloat(fpsMatch[1]);
        const hasAudio = /Audio:/.test(output);
        resolve({ width, height, fps, hasAudio });
      });
    }
  });
}

// ═══════════════════════════════════════════════
//  Export engine
// ═══════════════════════════════════════════════

function buildExportCommand(job) {
  const { inputPath, blocks, codec, outputPath, probe, assPath } = job;
  const { width, height, fps, hasAudio } = probe;
  const args = ['-hide_banner', '-y'];

  let vCodec, vArgs, aCodec, aArgs, pixFmt;
  if (codec.codec === 'prores') {
    vCodec = 'prores_ks'; vArgs = ['-profile:v', '3', '-vendor', 'apl0'];
    aCodec = 'pcm_s16le'; aArgs = []; pixFmt = 'yuva444p10le';
  } else if (codec.codec === 'prores_lt') {
    vCodec = 'prores_ks'; vArgs = ['-profile:v', '2', '-vendor', 'apl0'];
    aCodec = 'pcm_s16le'; aArgs = []; pixFmt = 'yuva444p10le';
  } else if (codec.codec === 'prores_proxy') {
    vCodec = 'prores_ks'; vArgs = ['-profile:v', '0', '-vendor', 'apl0'];
    aCodec = 'pcm_s16le'; aArgs = []; pixFmt = 'yuva444p10le';
  } else if (codec.codec === 'xdcam') {
    vCodec = 'mpeg2video'; vArgs = ['-b:v', '50M', '-maxrate', '50M', '-minrate', '50M', '-bufsize', '17825792',
      '-rc_max_vbv_use', '1', '-rc_min_vbv_use', '1', '-flags', '+ildct+ilme', '-top', '1'];
    aCodec = 'pcm_s16le'; aArgs = []; pixFmt = 'yuv422p';
  } else if (codec.codec === 'dnxhd') {
    vCodec = 'dnxhd'; vArgs = ['-b:v', '185M'];
    aCodec = 'pcm_s16le'; aArgs = []; pixFmt = 'yuv422p';
  } else if (codec.codec === 'dnxhr') {
    vCodec = 'dnxhd'; vArgs = ['-profile:v', 'dnxhr_hq'];
    aCodec = 'pcm_s16le'; aArgs = []; pixFmt = 'yuv422p';
  } else {
    vCodec = 'libx264';
    const crf = codec.quality === 'high' ? '15' : codec.quality === 'medium' ? '20' : '28';
    const preset = codec.quality === 'high' ? 'slow' : codec.quality === 'medium' ? 'medium' : 'ultrafast';
    vArgs = ['-preset', preset, '-crf', crf]; aCodec = 'aac'; aArgs = ['-b:a', '192k'];
    pixFmt = 'yuv420p';
  }

  const filterParts = [];
  const inputs = [];
  let inputIdx = 0;

  for (const block of blocks) {
    if (block.type === 'video') {
      args.push('-i', inputPath);
      const assFilter = assPath ? `,ass='${assPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : '';
      filterParts.push(`[${inputIdx}:v]setpts=PTS-STARTPTS,scale=${width}:${height}${assFilter},format=${pixFmt}[v${inputIdx}]`);
      if (hasAudio) {
        filterParts.push(`[${inputIdx}:a]aresample=48000[a${inputIdx}]`);
      } else {
        filterParts.push(`anullsrc=r=48000:cl=stereo:d=${block.duration}[a${inputIdx}]`);
      }
      inputs.push(`[v${inputIdx}][a${inputIdx}]`);
    } else if (block.type === 'slate') {
      args.push('-loop', '1', '-framerate', String(fps), '-t', String(block.duration), '-i', block.assetPath);
      filterParts.push(`[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=${pixFmt},setpts=PTS-STARTPTS[v${inputIdx}]`);
      filterParts.push(`anullsrc=r=48000:cl=stereo:d=${block.duration}[a${inputIdx}]`);
      inputs.push(`[v${inputIdx}][a${inputIdx}]`);
    } else {
      args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${block.duration},format=${pixFmt}`);
      filterParts.push(`[${inputIdx}:v]setpts=PTS-STARTPTS[v${inputIdx}]`);
      filterParts.push(`anullsrc=r=48000:cl=stereo:d=${block.duration}[a${inputIdx}]`);
      inputs.push(`[v${inputIdx}][a${inputIdx}]`);
    }
    inputIdx++;
  }

  filterParts.push(`${inputs.join('')}concat=n=${inputs.length}:v=1:a=1[outv][outa]`);
  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[outv]', '-map', '[outa]');
  args.push('-c:v', vCodec, ...vArgs, '-c:a', aCodec, ...aArgs, '-pix_fmt', pixFmt);
  if (codec.codec === 'h264') args.push('-movflags', '+faststart');
  args.push(outputPath);

  return args;
}

function runFF(args, totalDuration) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stderr.on('data', (data) => {
      const str = data.toString();
      const timeMatch = str.match(/time=(\d+):(\d+):([\d.]+)/);
      if (timeMatch && totalDuration > 0 && currentJob) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        currentJob.progress = Math.min(99, Math.round((secs / totalDuration) * 100));
      }
    });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`)));
    proc.on('error', reject);
  });
}

async function runExport(job) {
  currentJob = { id: job.id, progress: 0, label: 'Starting...', done: false, error: null, outputPath: job.outputPath };

  try {
    currentJob.label = 'Probing video...';
    const probe = await probeVideo(job.inputPath);
    const totalDuration = job.blocks.reduce((s, b) => s + b.duration, 0);

    if (job.codec.streamCopy && job.codec.codec === 'h264' && !job.assPath) {
      // Stream copy path: encode slates/blacks individually, then concat demuxer
      const { width, height, fps } = probe;
      const clipFiles = [];

      for (let i = 0; i < job.blocks.length; i++) {
        const block = job.blocks[i];
        const clipPath = path.join(TEMP_DIR, `clip_${job.id}_${i}.mp4`);
        clipFiles.push(clipPath);
        currentJob.label = `Block ${i + 1}/${job.blocks.length}...`;

        if (block.type === 'video') {
          await runFF(['-hide_banner', '-y', '-i', job.inputPath, '-c', 'copy', '-movflags', '+faststart', clipPath], block.duration);
        } else if (block.type === 'slate') {
          await runFF(['-hide_banner', '-y', '-loop', '1', '-framerate', String(fps), '-i', block.assetPath,
            '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-t', String(block.duration),
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', clipPath], block.duration);
        } else {
          await runFF(['-hide_banner', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${block.duration}`,
            '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-t', String(block.duration),
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', clipPath], block.duration);
        }
      }

      currentJob.label = 'Concatenating...';
      const concatFile = path.join(TEMP_DIR, `concat_${job.id}.txt`);
      fs.writeFileSync(concatFile, clipFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
      await runFF(['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', '-movflags', '+faststart', job.outputPath], totalDuration);

      clipFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
      try { fs.unlinkSync(concatFile); } catch {}
    } else {
      // Full re-encode path
      job.probe = probe;
      currentJob.label = 'Encoding...';
      const args = buildExportCommand(job);
      await runFF(args, totalDuration);
    }

    currentJob.progress = 100;
    currentJob.label = 'Done';
    currentJob.done = true;
  } catch (err) {
    currentJob.error = err.message;
    currentJob.label = 'Failed';
    currentJob.done = true;
  }
}

// ═══════════════════════════════════════════════
//  HTTP Server
// ═══════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /health
  if (url.pathname === '/health' && req.method === 'GET') {
    const ffVersion = await checkFFmpeg();
    return json(res, { status: 'ok', version: VERSION, ffmpeg: ffVersion, platform: process.platform });
  }

  // POST /pick-file
  if (url.pathname === '/pick-file' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      return json(res, { path: await pickFile(body.title || 'Select input file') });
    } catch (err) { return json(res, { error: err.message }, 500); }
  }

  // POST /pick-save
  if (url.pathname === '/pick-save' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      return json(res, { path: await pickSaveFile(body.title || 'Save as', body.defaultName || 'output.mp4') });
    } catch (err) { return json(res, { error: err.message }, 500); }
  }

  // POST /upload-video
  if (url.pathname === '/upload-video' && req.method === 'POST') {
    try {
      const ext = url.searchParams.get('ext') || 'mp4';
      const id = crypto.randomBytes(8).toString('hex');
      const videoPath = path.join(TEMP_DIR, `${id}.${ext}`);
      const ws = fs.createWriteStream(videoPath);
      req.pipe(ws);
      ws.on('finish', () => json(res, { path: videoPath }));
      ws.on('error', (err) => json(res, { error: err.message }, 500));
      return;
    } catch (err) { return json(res, { error: err.message }, 500); }
  }

  // POST /upload-asset
  if (url.pathname === '/upload-asset' && req.method === 'POST') {
    try {
      const assetExt = url.searchParams.get('ext') || 'png';
      const id = crypto.randomBytes(8).toString('hex');
      const assetPath = path.join(TEMP_DIR, `${id}.${assetExt}`);
      const ws = fs.createWriteStream(assetPath);
      req.pipe(ws);
      ws.on('finish', () => json(res, { path: assetPath }));
      ws.on('error', (err) => json(res, { error: err.message }, 500));
      return;
    } catch (err) { return json(res, { error: err.message }, 500); }
  }

  // POST /export
  if (url.pathname === '/export' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString());
      const jobId = crypto.randomBytes(8).toString('hex');
      runExport({ ...body, id: jobId }); // fire-and-forget
      return json(res, { id: jobId });
    } catch (err) { return json(res, { error: err.message }, 500); }
  }

  // GET /export/status
  if (url.pathname === '/export/status' && req.method === 'GET') {
    if (!currentJob) return json(res, { active: false });
    return json(res, {
      active: true, id: currentJob.id, progress: currentJob.progress,
      label: currentJob.label, done: currentJob.done, error: currentJob.error,
      outputPath: currentJob.outputPath,
    });
  }

  json(res, { error: 'Not found' }, 404);
});

// ═══════════════════════════════════════════════
//  Startup
// ═══════════════════════════════════════════════

async function main() {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║     KISSD Export Helper v' + VERSION + '       ║');
  console.log('  ╚══════════════════════════════════════╝\n');

  // Try to find FFmpeg
  if (!resolveFFmpeg()) {
    const ok = await downloadFFmpeg();
    if (!ok) {
      console.log('  WARNING: Running without FFmpeg. Export will not work.\n');
    }
  }

  if (ffmpegPath) {
    const ver = await checkFFmpeg();
    console.log(`  FFmpeg:  ${ver || 'found'}`);
    console.log(`  Binary:  ${ffmpegPath}`);
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`  Server:  http://127.0.0.1:${PORT}`);
    console.log(`  Temp:    ${TEMP_DIR}`);
    console.log('\n  Ready! Keep this window open while using KISSD.\n');
    console.log('  ─────────────────────────────────────────\n');
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
