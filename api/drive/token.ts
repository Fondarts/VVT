/**
 * GET /api/drive/token
 *
 * Returns a fresh Google Drive access token by using the stored refresh token.
 * Called on every page load (after the first Drive consent) to silently
 * restore Drive access without any popup or user interaction.
 *
 * Auth: Authorization: Bearer {firebaseIdToken}
 *
 * Required env vars:
 *   VITE_GOOGLE_CLIENT_ID   — OAuth client ID
 *   GOOGLE_CLIENT_SECRET    — OAuth client secret
 *   FIREBASE_PROJECT_ID     — Firebase project ID
 */

export const config = { runtime: 'edge' };

const FIRESTORE_BASE = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function decodeJwtUid(token: string): string {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(base64));
  return payload.sub as string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });
  const idToken = authHeader.slice(7);

  let uid: string;
  try {
    uid = decodeJwtUid(idToken);
    if (!uid) throw new Error('No uid');
  } catch {
    return new Response('Invalid token', { status: 401 });
  }

  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!clientId || !clientSecret || !projectId) {
    return new Response('Server misconfigured', { status: 500 });
  }

  // Read refresh_token from Firestore, authenticated as the user
  const fsUrl = `${FIRESTORE_BASE(projectId)}/userTokens/${uid}`;
  const fsRes = await fetch(fsUrl, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });

  if (fsRes.status === 404) {
    return new Response(
      JSON.stringify({ error: 'No refresh token stored' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!fsRes.ok) {
    return new Response(
      JSON.stringify({ error: 'Firestore error' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const fsDoc = await fsRes.json() as { fields?: { driveRefreshToken?: { stringValue?: string } } };
  const refreshToken = fsDoc.fields?.driveRefreshToken?.stringValue;

  if (!refreshToken) {
    return new Response(
      JSON.stringify({ error: 'No refresh token in document' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Exchange refresh_token for a new access_token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!tokens.access_token) {
    return new Response(
      JSON.stringify({ error: tokens.error ?? 'Refresh failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ access_token: tokens.access_token, expires_in: tokens.expires_in }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
