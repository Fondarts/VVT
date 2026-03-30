/**
 * ShareViewer — standalone component rendered when ?share=TOKEN is in the URL.
 * Does NOT require Google login. Uses Firebase anonymous auth to access Firestore.
 */
import React, { useEffect, useRef, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { AlertCircle, Link } from 'lucide-react';
import { auth } from '../../firebase';
import { getShareLink } from '../../utils/shareLinks';
import { FeedbackPanel } from '../FeedbackPanel';
import type { ShareLink } from '../../shared/types';

interface Props {
  token: string;
}

export const ShareViewer: React.FC<Props> = ({ token }) => {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Stream URL built from the token — no auth needed, validated server-side
  const streamUrl = `/api/stream?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Sign in anonymously so Firestore SDK works (rules: allow read on shareLinks)
        await signInAnonymously(auth);
        if (cancelled) return;

        const shareDoc = await getShareLink(token);
        if (cancelled) return;

        if (!shareDoc) {
          setError('Este link no es válido o ha expirado.');
        } else {
          setLink(shareDoc);
        }
      } catch (err) {
        if (!cancelled) setError('No se pudo cargar el link compartido.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [token]);

  const handleVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  };

  const handleSeek = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime = seconds;
  };

  const handleSubmitName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    setAuthorName(name);
    setNameSubmitted(true);
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid var(--border-color)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.875rem' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !link) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-muted)' }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <AlertCircle size={32} style={{ marginBottom: '12px', color: '#f87171' }} />
          <p style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--color-text-primary)' }}>{error ?? 'Link inválido'}</p>
          <p style={{ fontSize: '0.78rem' }}>Contactá a quien te compartió este link.</p>
        </div>
      </div>
    );
  }

  const isPresentation = link.mode === 'presentation';

  // ── Name prompt (before entering) ────────────────────────────────────────
  if (!nameSubmitted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '32px',
          maxWidth: '400px', width: '90vw',
          textAlign: 'center',
        }}>
          <Link size={28} style={{ color: 'var(--color-accent)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '6px' }}>
            {link.fileName}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Compartido por {link.createdByName} · {isPresentation ? 'Presentación' : 'Revisión interna'}
          </p>
          <form onSubmit={handleSubmitName}>
            <input
              type="text"
              placeholder="Tu nombre"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px', color: 'var(--color-text-primary)',
                fontSize: '0.9rem', marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main viewer ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--color-bg-secondary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {link.fileName}
        </span>
        <span style={{
          fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: '3px',
          background: isPresentation ? 'rgba(99,102,241,0.15)' : 'rgba(225,255,28,0.1)',
          color: isPresentation ? '#a5b4fc' : 'var(--color-accent)',
        }}>
          {isPresentation ? 'PRESENTACIÓN' : 'REVISIÓN INTERNA'}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
          {authorName}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Video */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', minWidth: 0 }}>
          <video
            ref={handleVideoRef}
            src={streamUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%', outline: 'none' }}
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
          />
        </div>

        {/* Feedback panel */}
        <div style={{
          width: '320px', flexShrink: 0,
          borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-bg-secondary)',
          overflow: 'hidden',
        }}>
          <FeedbackPanel
            fileName={link.fileName}
            fileSize={0}
            fileKeyOverride={link.id}
            currentTime={currentTime}
            frameRate={24}
            videoEl={videoEl}
            authorName={authorName}
            onSeek={handleSeek}
          />
        </div>
      </div>
    </div>
  );
};
