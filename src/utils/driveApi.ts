/**
 * Google Drive API v3 — read-only file access.
 *
 * Uses OAuth2 access token obtained during Google sign-in.
 * Only needs the drive.readonly scope.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/** Search for a file in Drive by exact name. Returns file ID or null. */
export async function findDriveFile(
  accessToken: string,
  fileName: string,
): Promise<{ id: string; name: string; mimeType: string; size: string } | null> {
  const q = `name='${fileName.replace(/'/g, "\\'")}'  and trashed=false`;
  const fields = 'files(id,name,mimeType,size)';
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=5`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.warn('[DriveAPI] Search failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  return data.files?.[0] ?? null;
}

/** Get a direct download URL for a Drive file (streams via API) */
export function getDriveFileUrl(accessToken: string, fileId: string): string {
  return `${DRIVE_API}/files/${fileId}?alt=media&access_token=${encodeURIComponent(accessToken)}`;
}

/** Download a Drive file as a File object with correct MIME type */
export async function downloadDriveFile(accessToken: string, fileId: string, fileName: string): Promise<File> {
  // First get file metadata for MIME type
  const metaRes = await fetch(`${DRIVE_API}/files/${fileId}?fields=mimeType,size`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = metaRes.ok ? await metaRes.json() : {};
  const mimeType = meta.mimeType || 'video/mp4';

  // Download the file content
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], fileName, { type: mimeType });
}
