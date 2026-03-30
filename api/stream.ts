/**
 * Vercel Edge Function — /api/stream?token=TOKEN
 *
 * Validates a share link token via Firestore REST API, then proxies the
 * corresponding Google Drive file with full Range header support (video seeking).
 *
 * Required env vars (set in Vercel dashboard):
 *   FIREBASE_PROJECT_ID   — Firebase project ID
 *   FIREBASE_API_KEY      — Firebase/GCP API key (must have Cloud Firestore API enabled)
 *   GOOGLE_DRIVE_API_KEY  — GCP API key with Google Drive API enabled
 *                           (can be the same key if both APIs are enabled)
 */

export const config = { runtime: 'edge' };

const FIRESTORE_BASE = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token || !/^[A-Za-z0-9]{10,64}$/.test(token)) {
    return new Response('Invalid token', { status: 400 });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const fbApiKey = process.env.FIREBASE_API_KEY;
  const driveApiKey = process.env.GOOGLE_DRIVE_API_KEY;

  if (!projectId || !fbApiKey || !driveApiKey) {
    return new Response('Server misconfigured', { status: 500 });
  }

  // ── 1. Validate share token via Firestore REST ─────────────────────────────
  const fsUrl = `${FIRESTORE_BASE(projectId)}/shareLinks/${token}?key=${fbApiKey}`;
  const fsRes = await fetch(fsUrl);

  if (fsRes.status === 404) return new Response('Share link not found', { status: 404 });
  if (!fsRes.ok) return new Response('Firestore error', { status: 502 });

  const fsDoc = await fsRes.json();
  const f = fsDoc.fields as Record<string, { booleanValue?: boolean; stringValue?: string; integerValue?: string }>;

  if (f.disabled?.booleanValue) return new Response('Share link disabled', { status: 403 });

  if (f.expiresAt?.stringValue) {
    if (new Date(f.expiresAt.stringValue) < new Date()) {
      return new Response('Share link expired', { status: 403 });
    }
  }

  const driveFileId = f.driveFileId?.stringValue;
  if (!driveFileId) return new Response('No drive file associated', { status: 400 });

  // ── 2. Proxy from Google Drive with Range support ─────────────────────────
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&key=${driveApiKey}`;
  const range = req.headers.get('range');

  const driveRes = await fetch(driveUrl, {
    headers: range ? { Range: range } : {},
  });

  if (!driveRes.ok && driveRes.status !== 206) {
    return new Response(`Drive error: ${driveRes.status}`, { status: 502 });
  }

  const responseHeaders = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, max-age=3600',
  });

  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const val = driveRes.headers.get(key);
    if (val) responseHeaders.set(key, val);
  }

  return new Response(driveRes.body, {
    status: driveRes.status,
    headers: responseHeaders,
  });
}
