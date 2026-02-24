import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

let ffmpegPath = 'ffmpeg';
let ffprobePath = 'ffprobe';

export function setFFmpegPaths(ffmpeg: string, ffprobe: string) {
  ffmpegPath = ffmpeg;
  ffprobePath = ffprobe;
}

export function getFFmpegPaths() {
  return { ffmpeg: ffmpegPath, ffprobe: ffprobePath };
}

export interface FFprobeOutput {
  streams: Array<{
    index: number;
    codec_type: string;
    codec_name?: string;
    codec_tag_string?: string;
    profile?: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    coded_width?: number;
    coded_height?: number;
    display_aspect_ratio?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    time_base?: string;
    bits_per_raw_sample?: string;
    color_range?: string;
    color_space?: string;
    color_transfer?: string;
    color_primaries?: string;
    chroma_location?: string;
    field_order?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    sample_fmt?: string;
    bit_rate?: string;
  }>;
  format: {
    filename: string;
    nb_streams: number;
    nb_programs: number;
    format_name: string;
    format_long_name?: string;
    start_time?: string;
    duration?: string;
    size: string;
    bit_rate?: string;
    probe_score?: number;
    tags?: Record<string, string>;
  };
}

export async function runFFprobe(filePath: string): Promise<FFprobeOutput> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-print_format', 'json',
      filePath
    ];
    
    const child = spawn(ffprobePath, args, {
      windowsHide: true,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed: ${stderr || 'Unknown error'}`));
        return;
      }
      try {
        const output = JSON.parse(stdout) as FFprobeOutput;
        resolve(output);
      } catch (e) {
        reject(new Error(`Failed to parse FFprobe output: ${e}`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`FFprobe error: ${err.message}`));
    });
  });
}

export interface AudioLoudness {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  output_i: number;
  output_tp: number;
  output_lra: number;
  output_thresh: number;
  target_offset: number;
}

export async function analyzeLoudness(filePath: string): Promise<AudioLoudness> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', filePath,
      '-af', 'loudnorm=print_format=json',
      '-f', 'null',
      '-'
    ];
    
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });
    
    let stderr = '';
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', () => {
      try {
        // Parse JSON from the stderr output
        const jsonMatch = stderr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          reject(new Error('Could not parse loudness data'));
          return;
        }
        const data = JSON.parse(jsonMatch[0]) as AudioLoudness;
        resolve(data);
      } catch (e) {
        reject(new Error(`Failed to parse loudness: ${e}`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`));
    });
  });
}

export interface FastStartInfo {
  hasFastStart: boolean;
  moovPosition: number;
}

export async function checkFastStart(filePath: string): Promise<FastStartInfo> {
  return new Promise((resolve, reject) => {
    // Read first 4KB of file to check for moov atom position
    const stream = fs.createReadStream(filePath, { start: 0, end: 4095 });
    let data = Buffer.alloc(0);
    
    stream.on('data', (chunk) => {
      data = Buffer.concat([data, chunk as Buffer]);
    });
    
    stream.on('end', () => {
      // Check if moov is in the first 4KB (fast start)
      const moovIndex = data.indexOf(Buffer.from('moov'));
      const hasFastStart = moovIndex > 0 && moovIndex < 1024;
      resolve({ hasFastStart, moovPosition: moovIndex });
    });
    
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

export async function extractThumbnail(
  filePath: string, 
  time: number, 
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', time.toString(),
      '-i', filePath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ];
    
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });
    
    let stderr = '';
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Thumbnail extraction failed: ${stderr}`));
        return;
      }
      resolve(outputPath);
    });
    
    child.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`));
    });
  });
}

export async function getAudioWaveformData(filePath: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', filePath,
      '-vn',
      '-af', 'aresample=8000',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-'
    ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
    });

    const chunks: Buffer[] = [];

    child.stdout.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    child.on('close', (code) => {
      const data = Buffer.concat(chunks);
      if (data.length < 2) {
        resolve([]);
        return;
      }
      // Parse 16-bit signed PCM samples
      const samples: number[] = [];
      for (let i = 0; i < data.length - 1; i += 2) {
        samples.push(Math.abs(data.readInt16LE(i) / 32768));
      }
      // Downsample to ~400 points for visualization
      const downsampled: number[] = [];
      const step = Math.max(1, Math.floor(samples.length / 400));
      for (let i = 0; i < samples.length; i += step) {
        const chunk = samples.slice(i, i + step);
        downsampled.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
      }
      resolve(downsampled);
    });

    child.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`));
    });
  });
}

export async function detectFFmpegPaths(): Promise<{ 
  ffmpeg: string; 
  ffprobe: string;
  ffmpegFound: boolean;
  ffprobeFound: boolean;
}> {
  // Check if ffmpeg is in PATH
  const checkBinary = (binary: string): Promise<{ ok: boolean; path: string }> => {
    return new Promise((resolve) => {
      const child = spawn(binary, ['-version'], {
        windowsHide: true,
      });
      
      child.on('error', () => {
        resolve({ ok: false, path: '' });
      });
      
      child.on('close', (code) => {
        resolve({ ok: code === 0, path: binary });
      });
    });
  };

  // Check common paths
  const ffmpegChecks = [
    'ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  
  const ffprobeChecks = [
    'ffprobe',
    '/usr/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe',
    'C:\\ffmpeg\\bin\\ffprobe.exe',
  ];

  let ffmpegPath = '';
  let ffprobePath = '';

  for (const check of ffmpegChecks) {
    const result = await checkBinary(check);
    if (result.ok) {
      ffmpegPath = check;
      break;
    }
  }

  for (const check of ffprobeChecks) {
    const result = await checkBinary(check);
    if (result.ok) {
      ffprobePath = check;
      break;
    }
  }

  return {
    ffmpeg: ffmpegPath,
    ffprobe: ffprobePath,
    ffmpegFound: ffmpegPath !== '',
    ffprobeFound: ffprobePath !== '',
  };
}