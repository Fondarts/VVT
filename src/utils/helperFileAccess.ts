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
