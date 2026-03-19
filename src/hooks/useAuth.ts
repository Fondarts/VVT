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
}

declare global {
  interface Window {
    google?: { accounts: GisAccounts };
  }
}

/* ── Hook ──────────────────────────────────────────────────────────── */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  /* Firebase auth state listener */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  /* Initialize GIS once the <script> loads */
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
      initialized.current = true;
      return true;
    }

    if (tryInit()) return;
    const iv = setInterval(() => { if (tryInit()) clearInterval(iv); }, 250);
    return () => clearInterval(iv);
  }, []);

  /* Sign in — shows Google One Tap, falls back to rendered button */
  const signIn = useCallback(() => {
    setError(null);
    const gid = window.google?.accounts?.id;
    if (!gid) {
      setError('Google sign-in not ready yet — try again in a moment.');
      return;
    }
    gid.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap suppressed → show a standard Google button in a modal
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

  /* Sign out */
  const signOut = useCallback(async () => {
    if (user?.email && window.google?.accounts?.id) {
      window.google.accounts.id.revoke(user.email);
    }
    await fbSignOut(auth);
    setError(null);
  }, [user]);

  return { user, loading, error, signIn, signOut };
}
