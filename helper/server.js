#!/usr/bin/env node
/**
 * KISSD Export Helper — local companion server for native FFmpeg exports.
 * Runs on localhost:3777. Communicates with the KISSD web app.
 *
 * Usage: node server.js [--port 3777] [--ffmpeg /path/to/ffmpeg]
 */

const http = require('http');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '3777');
const FFMPEG = process.argv.find((_, i, a) => a[i - 1] === '--ffmpeg') || 'ffmpeg';
const TEMP_DIR = path.join(os.tmpdir(), 'kissd-helper');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── State ──
let currentJob = null; // { id, progress, label, done, error, outputPath }

// ── CORS helper ──
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

// ── Check FFmpeg ──
function checkFFmpeg() {
  return new Promise((resolve) => {
    exec(`"${FFMPEG}" -version`, (err, stdout) => {
      if (err) resolve(null);
      else {
        const match = stdout.match(/ffmpeg version (\S+)/);
        resolve(match ? match[1] : 'unknown');
      }
    });
  });
}

// ── Native file picker (Windows / macOS / Linux) ──
function pickFile(title = 'Select file') {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true; $f.WindowState = 'Minimized'; $f.Show(); $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = '${title}'; $d.Filter = 'All files (*.*)|*.*'; if($d.ShowDialog($f) -eq 'OK'){$d.FileName}; $f.Close()`;
      exec(`powershell -Command "${ps}"`, (err, stdout) => {
        if (err) reject(err);
        else {
          const p = stdout.trim();
          resolve(p || null);
        }
      });
    } else if (process.platform === 'darwin') {
      exec(`osascript -e 'POSIX path of (choose file with prompt "${title}")'`, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      });
    } else {
      // Linux — zenity
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
      exec(`powershell -Command "${ps}"`, (err, stdout) => {
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

// ── Build FFmpeg command for timeline export ──
function buildExportCommand(job) {
  const { inputPath, blocks, codec, outputPath, probe } = job;
  const { width, height, fps } = probe;
  const args = ['-hide_banner', '-y'];

  // Codec settings
  let vCodec, vArgs, aCodec, aArgs, pixFmt;
  if (codec.codec === 'prores') {
    vCodec = 'prores_ks'; vArgs = ['-profile:v', '3', '-vendor', 'apl0'];
    aCodec = 'pcm_s16le'; aArgs = [];
    pixFmt = 'yuva444p10le';
  } else if (codec.codec === 'prores_lt') {
    vCodec = 'prores_ks'; vArgs = ['-profile:v', '2', '-vendor', 'apl0'];
    aCodec = 'pcm_s16le'; aArgs = [];
    pixFmt = 'yuva444p10le';
  } else if (codec.codec === 'prores_proxy') {
    vCodec = 'prores_ks'; vArgs = ['-profile:v', '0', '-vendor', 'apl0'];
    aCodec = 'pcm_s16le'; aArgs = [];
    pixFmt = 'yuva444p10le';
  } else {
    vCodec = 'libx264';
    const crf = codec.quality === 'high' ? '15' : codec.quality === 'medium' ? '20' : '28';
    const preset = codec.quality === 'high' ? 'slow' : codec.quality === 'medium' ? 'medium' : 'ultrafast';
    vArgs = ['-preset', preset, '-crf', crf];
    aCodec = 'aac'; aArgs = ['-b:a', '192k'];
    pixFmt = 'yuv420p';
  }

  // Build inputs and filter_complex for concat
  const inputs = [];
  const filterParts = [];
  let inputIdx = 0;

  for (const block of blocks) {
    if (block.type === 'video') {
      args.push('-i', inputPath);
      filterParts.push(`[${inputIdx}:v]setpts=PTS-STARTPTS,scale=${width}:${height},format=${pixFmt}[v${inputIdx}]`);
      filterParts.push(`[${inputIdx}:a]aresample=48000[a${inputIdx}]`);
      inputs.push({ v: `[v${inputIdx}]`, a: `[a${inputIdx}]` });
    } else if (block.type === 'slate') {
      args.push('-loop', '1', '-framerate', String(fps), '-t', String(block.duration), '-i', block.assetPath);
      filterParts.push(`[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=${pixFmt},setpts=PTS-STARTPTS[v${inputIdx}]`);
      filterParts.push(`anullsrc=r=48000:cl=stereo:d=${block.duration}[a${inputIdx}]`);
      inputs.push({ v: `[v${inputIdx}]`, a: `[a${inputIdx}]` });
    } else {
      // black
      args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${block.duration},format=${pixFmt}`);
      filterParts.push(`[${inputIdx}:v]setpts=PTS-STARTPTS[v${inputIdx}]`);
      filterParts.push(`anullsrc=r=48000:cl=stereo:d=${block.duration}[a${inputIdx}]`);
      inputs.push({ v: `[v${inputIdx}]`, a: `[a${inputIdx}]` });
    }
    inputIdx++;
  }

  // Concat
  const concatInputs = inputs.map((inp, i) => `${inp.v}${inp.a}`).join('');
  filterParts.push(`${concatInputs}concat=n=${inputs.length}:v=1:a=1[outv][outa]`);

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[outv]', '-map', '[outa]');
  args.push('-c:v', vCodec, ...vArgs);
  args.push('-c:a', aCodec, ...aArgs);
  args.push('-pix_fmt', pixFmt);
  if (codec.codec === 'h264') args.push('-movflags', '+faststart');
  args.push(outputPath);

  return args;
}

// ── Probe video ──
function probeVideo(filePath) {
  return new Promise((resolve) => {
    exec(`"${FFMPEG}" -hide_banner -i "${filePath}" -f null - 2>&1`, (err, stdout, stderr) => {
      const output = stderr || stdout || '';
      let width = 1920, height = 1080, fps = 25;
      const resMatch = output.match(/(\d{2,5})x(\d{2,5})/);
      if (resMatch) { width = parseInt(resMatch[1]); height = parseInt(resMatch[2]); }
      const fpsMatch = output.match(/([\d.]+)\s*fps/);
      if (fpsMatch) fps = parseFloat(fpsMatch[1]);
      resolve({ width, height, fps });
    });
  });
}

// ── Run a single ffmpeg command with progress tracking ──
function runFF(args, totalDuration) {
  return new Promise((resolve, reject) => {
    const ffProcess = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    ffProcess.stderr.on('data', (data) => {
      const str = data.toString();
      const timeMatch = str.match(/time=(\d+):(\d+):([\d.]+)/);
      if (timeMatch && totalDuration > 0) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        currentJob.progress = Math.min(99, Math.round((secs / totalDuration) * 100));
      }
    });
    ffProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
    ffProcess.on('error', reject);
  });
}

// ── Run export ──
async function runExport(job) {
  currentJob = { id: job.id, progress: 0, label: 'Starting…', done: false, error: null, outputPath: job.outputPath };
  const { inputPath, blocks, codec, outputPath } = job;
  const streamCopy = codec.streamCopy && codec.codec === 'h264';

  try {
    currentJob.label = 'Probing video…';
    const probe = await probeVideo(inputPath);
    const { width, height, fps } = probe;
    const totalDuration = blocks.reduce((s, b) => s + b.duration, 0);

    if (streamCopy) {
      // ── Stream copy path: build individual clips then concat demuxer ──
      const clipFiles = [];
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const clipPath = path.join(TEMP_DIR, `clip_${job.id}_${i}.mp4`);
        clipFiles.push(clipPath);
        currentJob.label = `Block ${i + 1}/${blocks.length}…`;

        if (block.type === 'video') {
          // Stream copy — instant
          await runFF(['-hide_banner', '-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', clipPath], block.duration);
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

      // Concat demuxer
      currentJob.label = 'Concatenating…';
      const concatFile = path.join(TEMP_DIR, `concat_${job.id}.txt`);
      fs.writeFileSync(concatFile, clipFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
      await runFF(['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', '-movflags', '+faststart', outputPath], totalDuration);

      // Cleanup temp clips
      clipFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
      try { fs.unlinkSync(concatFile); } catch {}

    } else {
      // ── Full re-encode path: filter_complex concat ──
      job.probe = probe;
      currentJob.label = 'Encoding…';
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

// ── HTTP Server ──
const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /health
  if (url.pathname === '/health' && req.method === 'GET') {
    const ffVersion = await checkFFmpeg();
    return json(res, {
      status: 'ok',
      version: '1.0.0',
      ffmpeg: ffVersion,
      platform: process.platform,
    });
  }

  // POST /pick-file
  if (url.pathname === '/pick-file' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const filePath = await pickFile(body.title || 'Select input file');
      return json(res, { path: filePath });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // POST /pick-save
  if (url.pathname === '/pick-save' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const filePath = await pickSaveFile(body.title || 'Save export as', body.defaultName || 'output.mp4');
      return json(res, { path: filePath });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // POST /upload-video — receive the video file and save to temp
  if (url.pathname === '/upload-video' && req.method === 'POST') {
    try {
      const ext = url.searchParams.get('ext') || 'mp4';
      const data = await readBody(req);
      const id = crypto.randomBytes(8).toString('hex');
      const videoPath = path.join(TEMP_DIR, `${id}.${ext}`);
      fs.writeFileSync(videoPath, data);
      return json(res, { path: videoPath });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // POST /upload-asset — receive a PNG slate and save to temp
  if (url.pathname === '/upload-asset' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const id = crypto.randomBytes(8).toString('hex');
      const assetPath = path.join(TEMP_DIR, `${id}.png`);
      fs.writeFileSync(assetPath, data);
      return json(res, { path: assetPath });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // POST /export — start export job
  if (url.pathname === '/export' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString());
      // body: { inputPath, blocks: [{type, duration, assetPath?}], codec: {codec, quality}, outputPath }
      const jobId = crypto.randomBytes(8).toString('hex');
      runExport({ ...body, id: jobId }); // fire and forget
      return json(res, { id: jobId });
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  // GET /export/status
  if (url.pathname === '/export/status' && req.method === 'GET') {
    if (!currentJob) return json(res, { active: false });
    return json(res, {
      active: true,
      id: currentJob.id,
      progress: currentJob.progress,
      label: currentJob.label,
      done: currentJob.done,
      error: currentJob.error,
      outputPath: currentJob.outputPath,
    });
  }

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '127.0.0.1', async () => {
  const ffVersion = await checkFFmpeg();
  console.log(`\n  KISSD Export Helper v1.0.0`);
  console.log(`  Listening on http://127.0.0.1:${PORT}`);
  console.log(`  FFmpeg: ${ffVersion || 'NOT FOUND — install FFmpeg and ensure it is in PATH'}`);
  console.log(`  Temp dir: ${TEMP_DIR}\n`);
});
