import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, CheckCircle2, AlertCircle, MonitorDown, RefreshCw } from 'lucide-react';

interface HelperInfo {
  status: 'checking' | 'connected' | 'offline';
  version?: string;
  ffmpeg?: string;
}

const HELPER_URL = 'http://127.0.0.1:3777';
const RELEASE_URL = 'https://github.com/Fondarts/VVT/releases/latest';

export const HelperStatus: React.FC = () => {
  const [info, setInfo] = useState<HelperInfo>({ status: 'checking' });
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkHelper = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        setInfo({ status: 'connected', version: data.version, ffmpeg: data.ffmpeg });
      } else {
        setInfo({ status: 'offline' });
      }
    } catch {
      setInfo({ status: 'offline' });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHelper();
    const interval = setInterval(checkHelper, 60000);
    return () => clearInterval(interval);
  }, [checkHelper]);

  const color = info.status === 'connected' ? 'var(--color-success)'
    : info.status === 'offline' ? 'var(--color-text-muted)'
    : 'var(--color-warning)';

  const label = info.status === 'connected' ? `Helper v${info.version}`
    : info.status === 'offline' ? 'Helper offline'
    : 'Checking...';

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '0.65rem', color: 'var(--color-text-muted)',
          cursor: 'pointer', background: 'none', border: 'none',
          padding: 0,
        }}
      >
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: color, flexShrink: 0,
        }} />
        <span>{label}</span>
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 5000,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MonitorDown size={16} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Kissd Helper</span>
              </div>
              <button className="btn btn-icon btn-sm" onClick={() => setShowModal(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {/* Status */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '8px', marginBottom: '16px',
                background: info.status === 'connected'
                  ? 'rgba(34, 197, 94, 0.08)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${info.status === 'connected' ? 'rgba(34, 197, 94, 0.2)' : 'var(--border-color)'}`,
              }}>
                {info.status === 'connected'
                  ? <CheckCircle2 size={18} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  : <AlertCircle size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                    {checking ? 'Checking...' : info.status === 'connected' ? 'Connected' : 'Not running'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                    {info.status === 'connected'
                      ? `localhost:3777`
                      : 'The helper app is not detected on this machine.'
                    }
                  </div>
                </div>
                <button
                  className="btn btn-icon btn-sm"
                  onClick={checkHelper}
                  disabled={checking}
                  title="Check connection"
                  style={{ flexShrink: 0 }}
                >
                  <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Details when connected */}
              {info.status === 'connected' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Version</span>
                    <span style={{ fontWeight: 500 }}>{info.version}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>FFmpeg</span>
                    <span style={{ fontWeight: 500 }}>{info.ffmpeg || 'Not found'}</span>
                  </div>
                </div>
              )}

              {/* Description */}
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                <p style={{ marginBottom: '8px' }}>Kissd Helper is a companion desktop app needed to:</p>
                <ul style={{ margin: '0 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li><strong>Export</strong> — Timeline sequences to ProRes, DNxHD, and other professional codecs</li>
                  <li><strong>Decode</strong> — Native ProRes playback and scanning without browser transcoding</li>
                  <li><strong>Stream</strong> — Google Drive files via local proxy with range-request seeking</li>
                </ul>
              </div>

              {/* Download */}
              <a
                href={RELEASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
              >
                <Download size={14} />
                Download latest version
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
