import React, { useState, useEffect } from 'react';
import { X, Film, Monitor, Globe, Download } from 'lucide-react';
import { checkHelper } from '../api/helperClient';
import type { HelperHealth } from '../api/helperClient';

export interface ExportSettings {
  codec: 'h264' | 'prores' | 'prores_lt' | 'prores_proxy';
  quality: 'high' | 'medium' | 'draft';
  useNative: boolean;
  streamCopy: boolean;
}

const CODEC_OPTIONS: { id: ExportSettings['codec']; label: string; desc: string; ext: string; nativeOnly?: boolean }[] = [
  { id: 'h264', label: 'H.264 (MP4)', desc: 'Universal playback, small files', ext: '.mp4' },
  { id: 'prores', label: 'ProRes 422 HQ', desc: 'Broadcast quality, large files', ext: '.mov' },
  { id: 'prores_lt', label: 'ProRes 422 LT', desc: 'Lighter ProRes, good quality', ext: '.mov' },
  { id: 'prores_proxy', label: 'ProRes 422 Proxy', desc: 'Smallest ProRes, for offline', ext: '.mov' },
];

const QUALITY_OPTIONS: { id: ExportSettings['quality']; label: string; desc: string }[] = [
  { id: 'high', label: 'High', desc: 'Best quality, slower' },
  { id: 'medium', label: 'Medium', desc: 'Balanced' },
  { id: 'draft', label: 'Draft', desc: 'Fast, lower quality' },
];

interface Props {
  onExport: (settings: ExportSettings) => void;
  onClose: () => void;
  inputCodec?: string; // e.g. 'h264', 'prores', 'hevc'
}

export const ExportModal: React.FC<Props> = ({ onExport, onClose, inputCodec }) => {
  const [codec, setCodec] = useState<ExportSettings['codec']>('h264');
  const [quality, setQuality] = useState<ExportSettings['quality']>('medium');
  const [helper, setHelper] = useState<HelperHealth | null | 'checking'>('checking');
  const [useNative, setUseNative] = useState(false);

  useEffect(() => {
    checkHelper().then(h => {
      setHelper(h);
      if (h?.ffmpeg) setUseNative(true);
    });
  }, []);

  const isProRes = codec.startsWith('prores');
  const helperReady = helper && helper !== 'checking' && helper.ffmpeg;
  const selectedCodec = CODEC_OPTIONS.find(c => c.id === codec)!;
  const canStreamCopy = inputCodec?.toLowerCase().includes('h264') && codec === 'h264';

  // ProRes only available with native helper
  useEffect(() => {
    if (isProRes && !helperReady) setCodec('h264');
  }, [isProRes, helperReady]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '440px', maxWidth: '90vw', padding: 0 }}>
        {/* Header */}
        <div className="card-header" style={{ padding: '14px 16px' }}>
          <h3 className="card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Film size={16} style={{ color: 'var(--color-accent)' }} />
            Export Video
            {/* Helper status dot */}
            {helper !== 'checking' && (
              <span title={helperReady ? `Helper connected — FFmpeg ${(helper as HelperHealth).ffmpeg}` : 'Helper not running'} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: helperReady ? '#22c55e' : '#666',
                flexShrink: 0,
              }} />
            )}
          </h3>
          <button className="btn btn-icon btn-sm" onClick={onClose} style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* ── Export engine toggle ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
              Export Engine
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setUseNative(false)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', textAlign: 'center',
                  border: !useNative ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  background: !useNative ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                }}
              >
                <Globe size={16} style={{ margin: '0 auto 4px', display: 'block', color: !useNative ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Browser</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>FFmpeg WASM — slower</div>
              </button>
              <button
                onClick={() => { if (helperReady) setUseNative(true); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: helperReady ? 'pointer' : 'default', textAlign: 'center',
                  border: useNative ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  background: useNative ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                  opacity: helperReady ? 1 : 0.5,
                }}
              >
                <Monitor size={16} style={{ margin: '0 auto 4px', display: 'block', color: useNative ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Native</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {helper === 'checking' ? 'Checking…'
                    : helperReady ? `FFmpeg ${(helper as HelperHealth).ffmpeg}`
                    : 'Not available'}
                </div>
              </button>
            </div>

            {/* Helper install prompt */}
            {!helperReady && helper !== 'checking' && (
              <div style={{
                marginTop: '8px', padding: '8px 10px', borderRadius: '6px',
                background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)',
                fontSize: '0.7rem', color: 'var(--color-text-muted)',
                display: 'flex', alignItems: 'flex-start', gap: '8px',
              }}>
                <Download size={14} style={{ flexShrink: 0, marginTop: '1px', color: '#2563EB' }} />
                <div>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Want faster exports + ProRes?</strong><br />
                  Install the <strong>KISSD Export Helper</strong> for native FFmpeg encoding with hardware acceleration.
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                    <a
                      href="https://github.com/Fondarts/VVT/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.65rem', padding: '2px 8px', textDecoration: 'none' }}
                    >
                      Download Helper
                    </a>
                    <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                      Then run: <code style={{ background: 'var(--color-bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>node helper/server.js</code>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Codec selector ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
              Codec
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {CODEC_OPTIONS.map(opt => {
                const disabled = opt.id.startsWith('prores') && !useNative;
                return (
                  <button
                    key={opt.id}
                    onClick={() => { if (!disabled) setCodec(opt.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '7px 12px', borderRadius: '6px', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
                      border: codec === opt.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: codec === opt.id ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${codec === opt.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {codec === opt.id && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)' }}>
                        {opt.desc}{disabled ? ' — requires Native helper' : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{opt.ext}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Quality (H.264 only) ── */}
          {!isProRes && (
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
                Quality
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {QUALITY_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setQuality(opt.id)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: '6px', cursor: 'pointer', textAlign: 'center',
                      border: quality === opt.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: quality === opt.id ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Summary ── */}
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', padding: '6px 10px', background: 'var(--color-bg-tertiary)', borderRadius: '6px' }}>
            {useNative ? <Monitor size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} /> : <Globe size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />}
            {useNative ? 'Native' : 'Browser'} &middot; <strong style={{ color: 'var(--color-text-primary)' }}>{selectedCodec.label}</strong>
            {!isProRes && !canStreamCopy && <> &middot; {QUALITY_OPTIONS.find(q => q.id === quality)?.label}</>}
            <> &middot; {selectedCodec.ext}</>
            {canStreamCopy && (
              <span style={{ color: '#22c55e', marginLeft: '6px' }}>
                ⚡ Stream copy — no re-encode
              </span>
            )}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onExport({ codec, quality, useNative, streamCopy: !!canStreamCopy })}
              style={{ padding: '6px 20px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Film size={14} />
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
