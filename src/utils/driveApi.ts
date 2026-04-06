/**
 * Google Drive API v3 — read-only file access.
 *
 * Uses OAuth2 access token obtained during Google sign-in.
 * Only needs the drive.readonly scope.
 */

import { logger } from './logger';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/**
 * Wrapper around fetch that detects 401 (token expired) and dispatches
 * a custom event so the auth system can prompt for re-authentication.
 */
async function driveFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    logger.warn('[DriveAPI] Token expired (401) — requesting re-auth');
    window.dispatchEvent(new CustomEvent('kissd-drive-token-expired'));
  }
  return res;
}

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
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=5&includeItemsFromAllDrives=true&supportsAllDrives=true`;

  const res = await driveFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    logger.warn('[DriveAPI] Search failed:', res.status, await res.text());
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

/** Make a Drive file readable by anyone with the link (required before creating a share link) */
export async function setDriveFilePublicAccess(accessToken: string, fileId: string): Promise<void> {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive permissions failed (${res.status}): ${text}`);
  }
}

/** Get parent folder IDs of a Drive file */
export async function getDriveFileParents(accessToken: string, fileId: string): Promise<string[]> {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=parents&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.parents ?? [];
}

/** List all files in a Drive folder (direct children only) */
export async function listDriveFolderFiles(accessToken: string, folderId: string): Promise<DriveFileMeta[]> {
  const q = `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const fields = 'files(id,name,mimeType,size,owners/displayName,createdTime,videoMediaMetadata,imageMediaMetadata)';
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000&includeItemsFromAllDrives=true&supportsAllDrives=true`;

  const res = await driveFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.files ?? []).map((file: Record<string, unknown>) => {
    const vid = file.videoMediaMetadata as Record<string, unknown> | undefined;
    const img = file.imageMediaMetadata as Record<string, unknown> | undefined;
    const owners = file.owners as { displayName?: string }[] | undefined;
    return {
      id: file.id as string,
      name: file.name as string,
      mimeType: file.mimeType as string,
      size: file.size as string,
      ownerName: owners?.[0]?.displayName,
      createdTime: file.createdTime as string | undefined,
      width: (vid?.width ?? img?.width) as number | undefined,
      height: (vid?.height ?? img?.height) as number | undefined,
      durationMs: vid?.durationMillis ? Number(vid.durationMillis) : undefined,
    };
  });
}

/** Download a Drive file as a File object with correct MIME type */
export async function downloadDriveFile(accessToken: string, fileId: string, fileName: string): Promise<File> {
  // First get file metadata for MIME type
  const metaRes = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=mimeType,size`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = metaRes.ok ? await metaRes.json() : {};
  const mimeType = meta.mimeType || 'video/mp4';

  // Download the file content
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], fileName, { type: mimeType });
}
