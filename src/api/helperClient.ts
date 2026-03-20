/**
 * Client for the KISSD Export Helper running on localhost.
 * Provides native FFmpeg export via a companion app.
 */

const HELPER_URL = 'http://127.0.0.1:3777';

export interface HelperHealth {
  status: string;
  version: string;
  ffmpeg: string | null;
  platform: string;
}

export interface HelperExportStatus {
  active: boolean;
  id?: string;
  progress?: number;
  label?: string;
  done?: boolean;
  error?: string | null;
  outputPath?: string;
}

/** Check if helper is running and FFmpeg is available */
export async function checkHelper(): Promise<HelperHealth | null> {
  try {
    const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Ask the helper to open a native file picker for the input file */
export async function pickInputFile(): Promise<string | null> {
  const res = await fetch(`${HELPER_URL}/pick-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Select input video' }),
  });
  const data = await res.json();
  return data.path || null;
}

/** Ask the helper to open a native save dialog */
export async function pickSaveFile(defaultName: string): Promise<string | null> {
  const res = await fetch(`${HELPER_URL}/pick-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Save export as', defaultName }),
  });
  const data = await res.json();
  return data.path || null;
}

/** Upload the video file to the helper, returns the temp path */
export async function uploadVideo(file: File, onProgress?: (pct: number) => void): Promise<string> {
  // Use XMLHttpRequest for upload progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const ext = file.name.split('.').pop() || 'mp4';
    xhr.open('POST', `${HELPER_URL}/upload-video?ext=${ext}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        if (data.error) reject(new Error(data.error));
        else resolve(data.path);
      } else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
}

/** Upload a PNG asset (slate image) to the helper, returns the temp path */
export async function uploadAsset(pngBytes: Uint8Array): Promise<string> {
  const res = await fetch(`${HELPER_URL}/upload-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: pngBytes as unknown as BodyInit,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.path;
}

export interface NativeExportBlock {
  type: 'slate' | 'video' | 'black';
  duration: number;
  assetPath?: string; // temp path for slates (from uploadAsset)
}

export interface NativeExportCodec {
  codec: 'h264' | 'prores' | 'prores_lt' | 'prores_proxy' | 'xdcam' | 'dnxhd' | 'dnxhr';
  quality: 'high' | 'medium' | 'draft';
  streamCopy?: boolean;
}

/** Upload a text asset (ASS subtitle file) to the helper, returns the temp path */
export async function uploadTextAsset(content: string, ext: string): Promise<string> {
  const res = await fetch(`${HELPER_URL}/upload-asset?ext=${ext}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new TextEncoder().encode(content),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.path;
}

/** Start a native export job */
export async function startNativeExport(opts: {
  inputPath: string;
  blocks: NativeExportBlock[];
  codec: NativeExportCodec;
  outputPath: string;
  assPath?: string;
}): Promise<string> {
  const res = await fetch(`${HELPER_URL}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.id;
}

/** Poll export status */
export async function getExportStatus(): Promise<HelperExportStatus> {
  const res = await fetch(`${HELPER_URL}/export/status`);
  return await res.json();
}

/**
 * Run a full native export flow:
 * 1. Upload video file to helper (localhost, fast)
 * 2. Upload slate assets
 * 3. Pick save location (native dialog)
 * 4. Start export
 * 5. Poll progress
 */
export async function runNativeExport(
  videoFile: File,
  blocks: { type: 'slate' | 'video' | 'black'; duration: number; slatePng?: Uint8Array }[],
  codec: NativeExportCodec,
  onProgress: (pct: number, label: string) => void,
  subtitleBurnIn?: import('./ffmpeg').SubtitleBurnIn,
): Promise<string> {
  // Upload video to helper
  onProgress(0, 'Uploading video to helper...');
  const inputPath = await uploadVideo(videoFile, (pct) => {
    onProgress(Math.round(pct * 0.4), `Uploading video... ${pct}%`);
  });

  // Upload slate assets
  onProgress(42, 'Uploading assets...');
  const exportBlocks: NativeExportBlock[] = [];
  for (const b of blocks) {
    if (b.type === 'slate' && b.slatePng) {
      const assetPath = await uploadAsset(b.slatePng);
      exportBlocks.push({ type: 'slate', duration: b.duration, assetPath });
    } else {
      exportBlocks.push({ type: b.type, duration: b.duration });
    }
  }

  // Upload ASS subtitle file if burn-in requested
  let assPath: string | undefined;
  if (subtitleBurnIn && subtitleBurnIn.segments.length > 0) {
    onProgress(43, 'Uploading subtitles...');
    // We need to generate the ASS here — import the generator
    const { generateASSForNative } = await import('./ffmpeg');
    const assContent = generateASSForNative(subtitleBurnIn);
    assPath = await uploadTextAsset(assContent, 'ass');
  }

  // Pick output path via native save dialog
  const ext = codec.codec.startsWith('prores') ? 'mov'
    : (codec.codec === 'xdcam' || codec.codec === 'dnxhd' || codec.codec === 'dnxhr') ? 'mxf'
    : 'mp4';
  const baseName = videoFile.name.replace(/\.[^.]+$/, '') || 'output';
  onProgress(45, 'Save dialog opened — check your taskbar');
  const outputPath = await pickSaveFile(`${baseName}_export.${ext}`);
  if (!outputPath) throw new Error('Export cancelled');

  // Start export
  onProgress(48, 'Starting FFmpeg...');
  await startNativeExport({ inputPath, blocks: exportBlocks, codec, outputPath, assPath });

  // Poll progress
  return new Promise((resolve, reject) => {
    const poll = setInterval(async () => {
      try {
        const status = await getExportStatus();
        if (!status.active) { clearInterval(poll); reject(new Error('Export not active')); return; }
        onProgress(48 + Math.round((status.progress ?? 0) * 0.52), status.label ?? 'Encoding…');
        if (status.done) {
          clearInterval(poll);
          if (status.error) reject(new Error(status.error));
          else resolve(status.outputPath ?? outputPath);
        }
      } catch (err) {
        clearInterval(poll);
        reject(err);
      }
    }, 500);
  });
}
