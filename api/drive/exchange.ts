/**
 * POST /api/drive/exchange
 *
 * Exchanges a Google authorization code for access + refresh tokens.
 * Stores the refresh token in Firestore so future sessions can get
 * a new access token without any user interaction.
 *
 * Body: { code: string }
 * Auth: Authorization: Bearer {firebaseIdToken}
 *
 * Required env vars (Vercel dashboard + .env.local):
 *   VITE_GOOGLE_CLIENT_ID   — OAuth client ID
 *   GOOGLE_CLIENT_SECRET    — OAuth client secret (never exposed to client)
 *   FIREBASE_PROJECT_ID     — Firebase project ID
 */

export const config = { runtime: 'edge' };

const FIRESTORE_BASE = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

/** Decode JWT payload without verifying signature.
 *  Security: the Firebase ID token is used directly with Firestore REST API,
 *  which verifies it server-side. We only extract the UID to build the path. */
function decodeJwtUid(token: string): string {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(base64));
  return payload.sub as string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

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

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { code } = body;
  if (!code) return new Response('Missing code', { status: 400 });

  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!clientId || !clientSecret || !projectId) {
    return new Response('Server misconfigured', { status: 500 });
  }

  // Exchange authorization code for access + refresh tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!tokens.access_token) {
    return new Response(
      JSON.stringify({ error: tokens.error ?? 'Token exchange failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Store refresh_token in Firestore, authenticated as the user
  // Firestore rules enforce that users can only write their own document
  if (tokens.refresh_token) {
    const fsUrl = `${FIRESTORE_BASE(projectId)}/userTokens/${uid}`;
    await fetch(fsUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          driveRefreshToken: { stringValue: tokens.refresh_token },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    // Non-fatal if write fails — user keeps working for this session via access_token
  }

  return new Response(
    JSON.stringify({ access_token: tokens.access_token, expires_in: tokens.expires_in }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
