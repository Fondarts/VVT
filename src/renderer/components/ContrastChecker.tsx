import React, { useState, useCallback } from 'react';
import {
  Pipette,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ContrastCheck } from '../../shared/types';

interface ContrastCheckerProps {
  filePath: string;
  duration: number;
  outputFolder: string;
  onContrastCheck: (checks: ContrastCheck[]) => void;
}

// ── WCAG helpers ─────────────────────────────────────────────────

function getLuminance(r: number, g: number, b: number): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function getContrastRatio(c1: string, c2: string): number {
  const r1 = hexToRgb(c1), r2 = hexToRgb(c2);
  if (!r1 || !r2) return 0;
  const l1 = getLuminance(r1.r, r1.g, r1.b), l2 = getLuminance(r2.r, r2.g, r2.b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── EyeDropper color input ────────────────────────────────────────

const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

const ColorInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => {
  const handleEyeDrop = async () => {
    if (!hasEyeDropper) return;
    try {
      const picker = new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper();
      const result = await picker.open();
      onChange(result.sRGBHex);
    } catch { /* user cancelled */ }
  };

  const handleText = (raw: string) => {
    const s = raw.startsWith('#') ? raw : '#' + raw.replace(/[^a-fA-F0-9]/g, '');
    onChange(s.slice(0, 7));
  };

  const isValid = /^#[0-9a-fA-F]{6}$/.test(value);

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {/* Colored swatch — visual indicator only */}
        <div style={{
          width: 36, height: 36, flexShrink: 0,
          background: isValid ? value : '#888',
          border: '2px solid var(--border-color)',
          borderRadius: 6,
        }} />

        {/* Hex text input — primary entry */}
        <input
          type="text"
          value={value}
          onChange={e => handleText(e.target.value)}
          maxLength={7}
          spellCheck={false}
          placeholder="#rrggbb"
          style={{
            flex: 1,
            background: 'var(--color-bg-tertiary)',
            border: `1px solid ${isValid ? 'var(--border-color)' : 'var(--color-error)'}`,
            borderRadius: 4,
            padding: '6px 10px',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
          }}
        />

        {/* EyeDropper — pick from screen (including video) */}
        <button
          onClick={handleEyeDrop}
          title={hasEyeDropper ? 'Pick color from screen' : 'EyeDropper not available'}
          disabled={!hasEyeDropper}
          style={{
            width: 36, height: 36, flexShrink: 0,
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            cursor: hasEyeDropper ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-primary)',
            opacity: hasEyeDropper ? 1 : 0.4,
          }}
        >
          <Pipette size={14} />
        </button>
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────

export const ContrastChecker: React.FC<ContrastCheckerProps> = ({ filePath, duration, outputFolder, onContrastCheck }) => {
  const [collapsed, setCollapsed]     = useState(false);
  const [checks, setChecks]           = useState<ContrastCheck[]>([]);
  const [textColor, setTextColor]     = useState('#ffffff');
  const [bgColor, setBgColor]         = useState('#000000');
  const [currentTime, setCurrentTime] = useState(duration / 2);

  const addCheck = useCallback(async () => {
    const ratio = getContrastRatio(textColor, bgColor);
    const thumbPath = `${outputFolder}/contrast_${Date.now()}.jpg`;
    await window.electronAPI.video.extractFrame(filePath, currentTime, thumbPath);
    const newCheck: ContrastCheck = {
      id: Date.now().toString(),
      timestamp: currentTime,
      textColor,
      backgroundColor: bgColor,
      ratio,
      aaNormal:  ratio >= 4.5,
      aaLarge:   ratio >= 3,
      aaaNormal: ratio >= 7,
      aaaLarge:  ratio >= 4.5,
      thumbnailPath: thumbPath,
    };
    const updated = [...checks, newCheck];
    setChecks(updated);
    onContrastCheck(updated);
  }, [textColor, bgColor, currentTime, checks, filePath, outputFolder, onContrastCheck]);

  const deleteCheck = useCallback((id: string) => {
    const updated = checks.filter(c => c.id !== id);
    setChecks(updated);
    onContrastCheck(updated);
  }, [checks, onContrastCheck]);

  const ratio = getContrastRatio(textColor, bgColor);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>
          <Pipette size={14} style={{ marginRight: '8px', display: 'inline' }} />
          Contrast Checker (WCAG)
        </h3>
        <button className="btn btn-icon btn-sm" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="card-content" style={{ padding: '16px' }}>
          {/* Color inputs */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <ColorInput label="Text Color" value={textColor} onChange={setTextColor} />
            </div>
            <div style={{ flex: 1 }}>
              <ColorInput label="Background Color" value={bgColor} onChange={setBgColor} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ padding: '16px', background: bgColor, borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ color: textColor, fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Sample Text</p>
            <p style={{ color: textColor, fontSize: '0.875rem', margin: '8px 0 0 0' }}>This is how your text looks</p>
          </div>

          {/* Results */}
          <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Contrast Ratio</span>
              <span style={{
                fontSize: '1.5rem', fontWeight: 700,
                color: ratio >= 4.5 ? 'var(--color-success)' : ratio >= 3 ? 'var(--color-warning)' : 'var(--color-error)',
              }}>
                {ratio.toFixed(2)}:1
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem' }}>
              {([
                ['WCAG AA Normal',  ratio >= 4.5],
                ['WCAG AA Large',   ratio >= 3  ],
                ['WCAG AAA Normal', ratio >= 7  ],
                ['WCAG AAA Large',  ratio >= 4.5],
              ] as [string, boolean][]).map(([lbl, pass]) => (
                <div key={lbl} style={{
                  padding: '6px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px',
                  background: pass ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color:      pass ? 'var(--color-success)'  : 'var(--color-error)',
                }}>
                  {pass ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {lbl}
                </div>
              ))}
            </div>
          </div>

          {/* Time slider + add */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
              Timestamp: {currentTime.toFixed(2)}s
            </label>
            <input type="range" min="0" max={duration} step="0.1" value={currentTime}
              onChange={e => setCurrentTime(parseFloat(e.target.value))}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            <button className="btn btn-primary btn-sm" onClick={addCheck} style={{ width: '100%' }}>
              <Plus size={14} style={{ marginRight: '4px', display: 'inline' }} />
              Add Contrast Check
            </button>
          </div>

          {/* Saved checks */}
          {checks.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                Saved Checks ({checks.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {checks.map(check => (
                  <div key={check.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '8px 12px', background: 'var(--color-bg-tertiary)',
                    borderRadius: '6px', fontSize: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: 20, height: 20, background: check.textColor, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3 }} title={`Text: ${check.textColor}`} />
                      <div style={{ width: 20, height: 20, background: check.backgroundColor, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3 }} title={`BG: ${check.backgroundColor}`} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{check.ratio.toFixed(2)}:1</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>@ {check.timestamp.toFixed(1)}s</span>
                    <span style={{ color: check.aaNormal ? 'var(--color-success)' : 'var(--color-error)', marginLeft: 'auto' }}>
                      {check.aaNormal ? 'AA ✓' : 'AA ✗'}
                    </span>
                    <button className="btn btn-icon btn-sm" onClick={() => deleteCheck(check.id)} style={{ color: 'var(--color-error)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
