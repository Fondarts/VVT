/**
 * File access via the KISSD Helper server (localhost:3777).
 * Uses native filesystem access — works across all browsers,
 * no permission prompts, supports Google Drive on-demand files.
 */

const HELPER_URL = 'http://127.0.0.1:3777';

/** Check if the helper server is running */
export async function isHelperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Open native directory picker via helper */
export async function pickDirectoryViaHelper(title?: string): Promise<string | null> {
  try {
    const res = await fetch(`${HELPER_URL}/pick-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Select root folder' }),
    });
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}

/** Search for a file by name in a directory tree via helper */
export async function findFileViaHelper(rootDir: string, fileName: string): Promise<string | null> {
  try {
    const res = await fetch(`${HELPER_URL}/find-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootDir, fileName }),
    });
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}

/** Get a URL that streams the file directly from disk via helper */
export function getServeFileUrl(filePath: string): string {
  return `${HELPER_URL}/serve-file?path=${encodeURIComponent(filePath)}`;
}

/**
 * Upload a file to the helper and transcode to H.264 preview.
 * Returns a serve URL for the transcoded file, or null if unavailable.
 */
export async function transcodePreviewViaHelper(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<string | null> {
  // 1. Check helper is available
  console.log('[Helper] Checking health…');
  const healthRes = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
  if (!healthRes?.ok) { console.log('[Helper] Health check failed'); return null; }
  const health = await healthRes.json().catch(() => null);
  if (!health?.ffmpeg) { console.log('[Helper] No ffmpeg in health response'); return null; }
  console.log('[Helper] Health OK, hwEncoder:', health.hwEncoder);

  // 2. Upload file to helper
  onProgress?.(5, 'Uploading to helper…');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  console.log('[Helper] Uploading', file.name, `(${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
  const uploadRes = await fetch(`${HELPER_URL}/upload-video?ext=${ext}`, {
    method: 'POST',
    body: file,
  });
  if (!uploadRes.ok) { console.warn('[Helper] Upload failed:', uploadRes.status); return null; }
  const uploadData = await uploadRes.json();
  const inputPath = uploadData.path;
  if (!inputPath) { console.warn('[Helper] No path in upload response'); return null; }
  console.log('[Helper] Uploaded to:', inputPath);

  onProgress?.(30, 'Transcoding…');

  // 3. Start transcode
  console.log('[Helper] Starting transcode-preview…');
  const startRes = await fetch(`${HELPER_URL}/transcode-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputPath }),
  });
  if (!startRes.ok) { console.warn('[Helper] Transcode start failed:', startRes.status); return null; }
  const startData = await startRes.json();
  console.log('[Helper] Transcode response:', startData);

  if (startData.ready) {
    onProgress?.(100, 'Ready');
    return `${HELPER_URL}${startData.url}`;
  }

  // 4. Poll for completion
  const cacheKey = startData.cacheKey;
  console.log('[Helper] Polling for completion, cacheKey:', cacheKey);
  for (let attempt = 0; attempt < 600; attempt++) { // max 5 min
    await new Promise(r => setTimeout(r, 500));
    try {
      const pollRes = await fetch(`${HELPER_URL}/transcode-preview/status?key=${cacheKey}`);
      if (!pollRes.ok) { console.warn('[Helper] Poll failed:', pollRes.status); return null; }
      const poll = await pollRes.json();

      if (poll.error) { console.warn('[Helper] Transcode error:', poll.error); return null; }
      if (poll.ready) {
        const url = `${HELPER_URL}${poll.url}`;
        console.log('[Helper] Transcode ready:', url);
        onProgress?.(100, 'Ready');
        return url;
      }

      const totalPct = 30 + Math.round((poll.progress || 0) * 0.7);
      onProgress?.(totalPct, `Transcoding… ${poll.progress}%`);
    } catch (pollErr) {
      console.warn('[Helper] Poll exception:', pollErr);
      return null;
    }
  }
  console.warn('[Helper] Transcode timed out after 5 min');
  return null;
}
