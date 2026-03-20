import React, { useState } from 'react';
import { X, Settings } from 'lucide-react';
import type { SubtitleStyle } from '../shared/types';
import type { WhisperModel } from '../api/whisper';
import { WHISPER_MODELS } from '../api/whisper';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  maxCharsPerLine: 42,
  fontFamily: 'Arial',
  fontSize: 48,
  color: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  showBackground: true,
  backgroundColor: 'rgba(0,0,0,0.78)',
};

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Inter',
  'Roboto',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
];

interface Props {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
  selectedModel: WhisperModel;
  onModelChange: (model: WhisperModel) => void;
  cachedModels: Partial<Record<WhisperModel, boolean>>;
  onClose: () => void;
}

export const SubtitleSettingsModal: React.FC<Props> = ({
  style: subStyle,
  onChange,
  selectedModel,
  onModelChange,
  cachedModels,
  onClose,
}) => {
  const [local, setLocal] = useState<SubtitleStyle>({ ...subStyle });

  const update = (patch: Partial<SubtitleStyle>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
    borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem', padding: '4px 8px',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '420px', maxWidth: '90vw', padding: 0 }}>
        {/* Header */}
        <div className="card-header" style={{ padding: '14px 16px' }}>
          <h3 className="card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} style={{ color: 'var(--color-accent)' }} />
            Transcription Settings
          </h3>
          <button className="btn btn-icon btn-sm" onClick={onClose} style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* ── Model ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
              Whisper Model
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {WHISPER_MODELS.map(m => {
                const active = selectedModel === m.id;
                const cached = cachedModels[m.id] === true;
                return (
                  <button
                    key={m.id}
                    onClick={() => onModelChange(m.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '5px', textAlign: 'left', cursor: 'pointer',
                      border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: active ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                    }}
                  >
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />}
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{m.label}</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)' }}>{m.size}</span>
                    <span style={{ fontSize: '0.58rem', color: cached ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                      {cached ? 'cached' : 'download'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Subtitle Appearance ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>
              Subtitle Appearance
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* Max chars per line */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Max chars/line</label>
                <input
                  type="number" min={10} max={80} value={local.maxCharsPerLine}
                  onChange={e => update({ maxCharsPerLine: Math.max(10, Math.min(80, parseInt(e.target.value) || 42)) })}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              {/* Font size */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Font size (px @1080p)</label>
                <input
                  type="number" min={16} max={120} value={local.fontSize}
                  onChange={e => update({ fontSize: Math.max(16, Math.min(120, parseInt(e.target.value) || 48)) })}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              {/* Font family */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', gridColumn: 'span 2' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Font</label>
                <select
                  value={local.fontFamily}
                  onChange={e => update({ fontFamily: e.target.value })}
                  style={{ ...inputStyle, width: '100%' }}
                >
                  {FONT_OPTIONS.map(f => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Text color */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Text color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="color" value={local.color}
                    onChange={e => update({ color: e.target.value })}
                    style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{local.color}</span>
                </div>
              </div>

              {/* Stroke color */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Stroke color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="color" value={local.strokeColor}
                    onChange={e => update({ strokeColor: e.target.value })}
                    style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{local.strokeColor}</span>
                </div>
              </div>

              {/* Stroke width */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Stroke width</label>
                <input
                  type="number" min={0} max={10} value={local.strokeWidth}
                  onChange={e => update({ strokeWidth: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              {/* Background toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Background</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
                  <input
                    type="checkbox"
                    className="toggle-checkbox"
                    checked={local.showBackground}
                    onChange={e => update({ showBackground: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                  {local.showBackground ? 'On' : 'Off'}
                </label>
              </div>
            </div>
          </div>

          {/* ── Preview ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
              Preview
            </label>
            <div style={{
              background: '#111', borderRadius: '6px', padding: '24px 16px',
              display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
              minHeight: '80px', border: '1px solid var(--color-border)',
            }}>
              <span style={{
                fontFamily: local.fontFamily,
                fontSize: `${Math.max(12, local.fontSize * 0.35)}px`,
                color: local.color,
                WebkitTextStroke: local.strokeWidth > 0 ? `${local.strokeWidth * 0.35}px ${local.strokeColor}` : undefined,
                paintOrder: 'stroke fill',
                background: local.showBackground ? local.backgroundColor : 'transparent',
                padding: local.showBackground ? '4px 14px' : '4px 0',
                borderRadius: '4px',
                textAlign: 'center',
                maxWidth: '90%',
                lineHeight: 1.4,
              }}>
                Sample subtitle text
              </span>
            </div>
          </div>

          {/* ── Close ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={onClose} style={{ padding: '6px 20px', fontSize: '0.8rem' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
