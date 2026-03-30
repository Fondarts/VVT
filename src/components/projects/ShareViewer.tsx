/**
 * ShareViewer — rendered when ?share=TOKEN is in the URL.
 *
 * Internal review:   redirects to normal app flow (?file=...&view=internal)
 *                    → requires Google sign-in but uses existing Drive auth
 * Presentation:      anonymous flow — reads share doc via Firestore REST,
 *                    streams video via /api/stream?token=TOKEN
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, Link } from 'lucide-react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../../firebase';
import { FeedbackPanel } from '../FeedbackPanel';
import { AnnotationCanvas } from '../AnnotationCanvas';
import type { AnnotationStroke } from '../../shared/types';

interface Props {
  token: string;
}

interface ShareDoc {
  fileId: string;
  fileName: string;
  mode: 'presentation' | 'internal';
  createdByName: string;
  disabled: boolean;
  expiresAt: string | null;
}

/** Read a shareLinks doc via Firestore REST (no auth required if rules allow get: if true) */
async function fetchShareDoc(token: string): Promise<ShareDoc | null> {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/shareLinks/${token}?key=${apiKey}`;

  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status}`);

  const data = await res.json();
  const f = data.fields as Record<string, { booleanValue?: boolean; stringValue?: string }>;

  if (f.disabled?.booleanValue) return null;
  if (f.expiresAt?.stringValue && new Date(f.expiresAt.stringValue) < new Date()) return null;

  return {
    fileId: f.fileId?.stringValue ?? '',
    fileName: f.fileName?.stringValue ?? '',
    mode: (f.mode?.stringValue ?? 'presentation') as 'presentation' | 'internal',
    createdByName: f.createdByName?.stringValue ?? '',
    disabled: false,
    expiresAt: f.expiresAt?.stringValue ?? null,
  };
}

export const ShareViewer: React.FC<Props> = ({ token }) => {
  const [doc, setDoc] = useState<ShareDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Drawing state
  const [drawActive, setDrawActive] = useState(false);
  const [drawColor, setDrawColor] = useState('#FA4900');
  const [drawTool, setDrawTool] = useState<'draw' | 'text' | 'eraser'>('draw');
  const [drawLineWidth, setDrawLineWidth] = useState(3);
  const [drawStrokes, setDrawStrokes] = useState<AnnotationStroke[]>([]);
  const drawStrokesRef = useRef<AnnotationStroke[]>([]);
  useEffect(() => { drawStrokesRef.current = drawStrokes; }, [drawStrokes]);

  const handleStartDraw = useCallback((color: string, tool: 'draw' | 'text' | 'eraser') => {
    setDrawColor(color);
    setDrawTool(tool);
    setDrawActive(true);
  }, []);

  const handleCaptureDrawStrokes = useCallback((): AnnotationStroke[] => {
    const strokes = [...drawStrokesRef.current];
    setDrawStrokes([]);
    setDrawActive(false);
    return strokes;
  }, []);

  const handleUndoLastStroke = useCallback(() => {
    setDrawStrokes(prev => prev.slice(0, -1));
  }, []);

  const streamUrl = `/api/stream?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;
    // Sign in anonymously so FeedbackPanel can read/write Firestore comments
    signInAnonymously(auth).catch(() => {});
    fetchShareDoc(token)
      .then(d => {
        if (cancelled) return;
        if (!d) { setError('This link is invalid or has expired.'); return; }

        // Internal review → redirect to the normal authenticated app flow
        if (d.mode === 'internal') {
          const params = new URLSearchParams({ file: d.fileId, view: 'internal' });
          window.location.replace(`${window.location.pathname}?${params}`);
          return;
        }

        setDoc(d);
      })
      .catch(() => { if (!cancelled) setError('Could not load the shared link.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const handleVideoRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  };

  const handleSubmitName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (name) { setAuthorName(name); setNameSubmitted(true); }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid var(--border-color)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.875rem' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !doc) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-muted)' }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <AlertCircle size={32} style={{ marginBottom: '12px', color: '#f87171' }} />
          <p style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
            {error ?? 'Invalid link'}
          </p>
          <p style={{ fontSize: '0.78rem' }}>Contact the person who shared this link.</p>
        </div>
      </div>
    );
  }

  // ── Name prompt ───────────────────────────────────────────────────────────
  if (!nameSubmitted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{
          background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '90vw', textAlign: 'center',
        }}>
          <Link size={28} style={{ color: 'var(--color-accent)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '6px' }}>{doc.fileName}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Shared by {doc.createdByName}
          </p>
          <form onSubmit={handleSubmitName}>
            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: '8px', color: 'var(--color-text-primary)',
                fontSize: '0.9rem', marginBottom: '12px', boxSizing: 'border-box',
              }}
            />
            <button type="submit" disabled={!nameInput.trim()} className="btn btn-primary" style={{ width: '100%' }}>
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Presentation viewer ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)', background: 'var(--color-bg-secondary)', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.fileName}
        </span>
        <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: '3px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
          PRESENTATION
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{authorName}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', minWidth: 0 }}>
          <video
            ref={handleVideoRef}
            src={streamUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%', outline: 'none' }}
            onTimeUpdate={() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); }}
          />
          {drawActive && videoEl && (
            <AnnotationCanvas
              targetEl={videoEl}
              color={drawColor}
              lineWidth={drawLineWidth}
              tool={drawTool}
              strokes={drawStrokes}
              onStrokesChange={setDrawStrokes}
            />
          )}
        </div>
        <div style={{
          width: '320px', flexShrink: 0, borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', background: 'var(--color-bg-secondary)', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <FeedbackPanel
            fileName={doc.fileName}
            fileSize={0}
            fileKeyOverride={doc.fileId}
            currentTime={currentTime}
            frameRate={24}
            videoEl={videoEl}
            authorName={authorName}
            onSeek={s => { if (videoRef.current) videoRef.current.currentTime = s; }}
            onStartDraw={handleStartDraw}
            onCaptureDrawStrokes={handleCaptureDrawStrokes}
            onSetLineWidth={setDrawLineWidth}
            onUndoLastStroke={handleUndoLastStroke}
          />
          </div>
        </div>
      </div>
    </div>
  );
};
