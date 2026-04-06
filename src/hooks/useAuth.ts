import { useState, useEffect, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth, GOOGLE_CLIENT_ID } from '../firebase';
import { logger } from '../utils/logger';

/* ── Google Identity Services (GIS) type shims ─────────────────────── */
interface GisNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
}

interface GisAccounts {
  id: {
    initialize: (cfg: Record<string, unknown>) => void;
    prompt: (cb?: (n: GisNotification) => void) => void;
    renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
    revoke: (hint: string, cb?: () => void) => void;
  };
  oauth2: {
    initCodeClient: (cfg: Record<string, unknown>) => {
      requestCode: () => void;
    };
    hasGrantedAllScopes: (tokenResponse: unknown, scope: string) => boolean;
  };
}

declare global {
  interface Window {
    google?: { accounts: GisAccounts };
  }
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive';
// v2: bumped to force re-consent after adding drive scope
const DRIVE_CONSENT_KEY = 'kissd_drive_consent_v2';
// sessionStorage keys — survive page reloads in the same tab
const SESSION_TOKEN_KEY = 'kissd_drive_token';
const SESSION_TOKEN_EXPIRY_KEY = 'kissd_drive_token_expiry';

function loadSessionToken(): string | null {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  const expiry = sessionStorage.getItem(SESSION_TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry)) {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

function saveSessionToken(token: string, expiresIn = 3600) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  // Store with a 2-minute buffer
  sessionStorage.setItem(SESSION_TOKEN_EXPIRY_KEY, (Date.now() + (expiresIn - 120) * 1000).toString());
}

function clearSessionToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_EXPIRY_KEY);
}

/* ── Hook ──────────────────────────────────────────────────────────── */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(() => loadSessionToken());
  const initialized = useRef(false);
  const codeClientRef = useRef<{ requestCode: () => void } | null>(null);
  const silentRefreshDone = useRef(false);
  // True when sign-in was triggered by user click in THIS session
  const justSignedIn = useRef(false);

  /* Firebase auth state listener */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  /* Initialize GIS — One Tap for Firebase auth + Code Client for Drive */
  useEffect(() => {
    async function handleCredential(response: { credential: string }) {
      try {
        const cred = GoogleAuthProvider.credential(response.credential);
        await signInWithCredential(auth, cred);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('signInWithCredential failed:', msg);
        setError(msg);
      }
    }

    function tryInit(): boolean {
      if (initialized.current) return true;
      if (!window.google?.accounts?.id) return false;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });

      if (window.google.accounts.oauth2) {
        codeClientRef.current = window.google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: DRIVE_SCOPE,
          ux_mode: 'popup',
          callback: async (response: { code?: string; error?: string }) => {
            if (!response.code) return;
            try {
              const idToken = await auth.currentUser?.getIdToken();
              if (!idToken) return;
              const res = await fetch('/api/drive/exchange', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ code: response.code }),
              });
              if (res.ok) {
                const data = await res.json() as { access_token?: string; expires_in?: number };
                if (data.access_token) {
                  setDriveToken(data.access_token);
                  saveSessionToken(data.access_token, data.expires_in);
                  localStorage.setItem(DRIVE_CONSENT_KEY, '1');
                }
              }
            } catch (e) {
              logger.error('Drive token exchange failed:', e);
            }
          },
        });
      }

      initialized.current = true;
      return true;
    }

    if (tryInit()) return;
    const iv = setInterval(() => { if (tryInit()) clearInterval(iv); }, 250);
    return () => clearInterval(iv);
  }, []);

  /* Silent Drive token refresh on page load — fully automatic, no user gesture.
     Calls our own API which uses the stored refresh token in Firestore. */
  useEffect(() => {
    if (!user || driveToken || silentRefreshDone.current) return;
    const hadConsent = localStorage.getItem(DRIVE_CONSENT_KEY);
    if (!hadConsent) return; // Never granted — needs user gesture to go through consent
    silentRefreshDone.current = true;

    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/drive/token', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json() as { access_token?: string; expires_in?: number };
          if (data.access_token) {
            setDriveToken(data.access_token);
            saveSessionToken(data.access_token, data.expires_in);
          }
        }
      } catch { /* silent fail — Drive button available as fallback */ }
    })();
  }, [user, driveToken]);

  /* After a fresh sign-in (user gesture), auto-request Drive code.
     This IS from a user gesture chain so the popup won't be blocked. */
  useEffect(() => {
    if (!user || driveToken || !justSignedIn.current) return;
    if (!codeClientRef.current) return;
    justSignedIn.current = false;
    // Small delay so Firebase auth settles first
    const t = setTimeout(() => {
      codeClientRef.current?.requestCode();
    }, 300);
    return () => clearTimeout(t);
  }, [user, driveToken]);

  /* Sign in — One Tap, then auto-chain Drive request */
  const signIn = useCallback(() => {
    setError(null);
    justSignedIn.current = true;
    const gid = window.google?.accounts?.id;
    if (!gid) {
      setError('Google sign-in not ready yet — try again in a moment.');
      return;
    }
    gid.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        const overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const card = document.createElement('div');
        card.style.cssText =
          'background:#fff;padding:32px;border-radius:12px;min-width:280px;text-align:center;';
        overlay.appendChild(card);

        const title = document.createElement('p');
        title.textContent = 'Sign in with Google';
        title.style.cssText = 'margin:0 0 16px;font-size:16px;font-weight:600;color:#333;';
        card.appendChild(title);

        const btnDiv = document.createElement('div');
        card.appendChild(btnDiv);
        document.body.appendChild(overlay);

        gid.renderButton(btnDiv, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
        });
      }
    });
  }, []);

  /** Manually request Drive access (fallback button / first-time consent) */
  const requestDriveAccess = useCallback(() => {
    if (codeClientRef.current) {
      codeClientRef.current.requestCode();
    }
  }, []);

  /** Force re-consent — used when Drive API returns 403 on share link creation */
  const requestDriveWriteAccess = useCallback(() => {
    localStorage.removeItem(DRIVE_CONSENT_KEY);
    if (codeClientRef.current) {
      codeClientRef.current.requestCode();
    }
  }, []);

  /* Sign out */
  const signOut = useCallback(async () => {
    if (user?.email && window.google?.accounts?.id) {
      window.google.accounts.id.revoke(user.email);
    }
    await fbSignOut(auth);
    setDriveToken(null);
    clearSessionToken();
    silentRefreshDone.current = false;
    justSignedIn.current = false;
    setError(null);
  }, [user]);

  // Listen for Drive token expiration events from driveApi.ts
  useEffect(() => {
    const handler = () => {
      logger.warn('[useAuth] Drive token expired — clearing and requesting re-auth');
      setDriveToken(null);
      clearSessionToken();
      // Trigger re-consent after a short delay
      setTimeout(() => {
        if (codeClientRef.current) {
          codeClientRef.current.requestCode();
        }
      }, 500);
    };
    window.addEventListener('kissd-drive-token-expired', handler);
    return () => window.removeEventListener('kissd-drive-token-expired', handler);
  }, []);

  return { user, loading, error, signIn, signOut, driveToken, requestDriveAccess, requestDriveWriteAccess };
}
