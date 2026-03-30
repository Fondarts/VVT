import { useState, useEffect, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth, GOOGLE_CLIENT_ID } from '../firebase';

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
    initTokenClient: (cfg: Record<string, unknown>) => {
      requestAccessToken: (overrides?: Record<string, unknown>) => void;
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

/* ── Hook ──────────────────────────────────────────────────────────── */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const initialized = useRef(false);
  const tokenClientRef = useRef<{
    requestAccessToken: (overrides?: Record<string, unknown>) => void;
  } | null>(null);
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

  /* Initialize GIS (One Tap for auth + OAuth2 client for Drive) */
  useEffect(() => {
    async function handleCredential(response: { credential: string }) {
      try {
        const cred = GoogleAuthProvider.credential(response.credential);
        await signInWithCredential(auth, cred);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('signInWithCredential failed:', msg);
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
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (response: { access_token?: string; error?: string }) => {
            if (response.access_token) {
              setDriveToken(response.access_token);
              localStorage.setItem(DRIVE_CONSENT_KEY, '1');
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

  /* Silent Drive token refresh on reload (only if consent was previously granted).
     prompt:'' tells GIS to skip UI if prior consent exists — no popup. */
  useEffect(() => {
    if (!user || driveToken || silentRefreshDone.current) return;
    if (!tokenClientRef.current) return;
    const hadConsent = localStorage.getItem(DRIVE_CONSENT_KEY);
    if (!hadConsent) return; // Never granted — needs user gesture
    silentRefreshDone.current = true;
    try {
      tokenClientRef.current.requestAccessToken({
        prompt: '',
        hint: user.email || undefined,
      });
    } catch { /* silent fail — Drive button is available as fallback */ }
  }, [user, driveToken]);

  /* After a fresh sign-in (user gesture), auto-request Drive token.
     This IS from a user gesture chain so the popup won't be blocked. */
  useEffect(() => {
    if (!user || driveToken || !justSignedIn.current) return;
    if (!tokenClientRef.current) return;
    justSignedIn.current = false;
    // Small delay so Firebase auth settles first
    const t = setTimeout(() => {
      tokenClientRef.current?.requestAccessToken({
        hint: user.email || undefined,
      });
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

  /** Manually request Drive access (fallback button) */
  const requestDriveAccess = useCallback(() => {
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken();
    }
  }, []);

  /* Sign out */
  const signOut = useCallback(async () => {
    if (user?.email && window.google?.accounts?.id) {
      window.google.accounts.id.revoke(user.email);
    }
    await fbSignOut(auth);
    setDriveToken(null);
    silentRefreshDone.current = false;
    justSignedIn.current = false;
    setError(null);
  }, [user]);

  return { user, loading, error, signIn, signOut, driveToken, requestDriveAccess };
}
