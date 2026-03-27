/**
 * Google Drive API v3 — read-only file access.
 *
 * Uses OAuth2 access token obtained during Google sign-in.
 * Only needs the drive.readonly scope.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/** Search for a file in Drive by exact name. Returns file ID or null. */
export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  ownerName?: string;
  createdTime?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export async function findDriveFile(
  accessToken: string,
  fileName: string,
): Promise<DriveFileMeta | null> {
  const q = `name='${fileName.replace(/'/g, "\\'")}'  and trashed=false`;
  const fields = 'files(id,name,mimeType,size,owners/displayName,createdTime,videoMediaMetadata,imageMediaMetadata)';
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=5`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.warn('[DriveAPI] Search failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const file = data.files?.[0];
  if (!file) return null;
  const vid = file.videoMediaMetadata;
  const img = file.imageMediaMetadata;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    ownerName: file.owners?.[0]?.displayName,
    createdTime: file.createdTime,
    width: vid?.width ?? img?.width,
    height: vid?.height ?? img?.height,
    durationMs: vid?.durationMillis ? Number(vid.durationMillis) : undefined,
  };
}

/** Get a streaming URL via helper proxy (supports range requests for video seeking) */
export function getDriveStreamUrl(accessToken: string, fileId: string): string {
  return `http://127.0.0.1:3777/proxy-drive?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(accessToken)}`;
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
