import React, { useState, useRef, useCallback } from 'react';
import {
  Pipette,
  Square,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Camera,
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

// Calculate relative luminance for WCAG
function getLuminance(r: number, g: number, b: number): number {
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

// Calculate contrast ratio
function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) return 0;
  
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export const ContrastChecker: React.FC<ContrastCheckerProps> = ({
  filePath,
  duration,
  outputFolder,
  onContrastCheck,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [checks, setChecks] = useState<ContrastCheck[]>([]);
  const [textColor, setTextColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#000000');
  const [currentTime, setCurrentTime] = useState(duration / 2);
  const [isPicking, setIsPicking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const addCheck = useCallback(async () => {
    const ratio = getContrastRatio(textColor, bgColor);
    
    // Extract thumbnail at current time
    const thumbPath = `${outputFolder}/contrast_${Date.now()}.jpg`;
    await window.electronAPI.video.extractFrame(filePath, currentTime, thumbPath);

    const newCheck: ContrastCheck = {
      id: Date.now().toString(),
      timestamp: currentTime,
      textColor,
      backgroundColor: bgColor,
      ratio,
      aaNormal: ratio >= 4.5,
      aaLarge: ratio >= 3,
      aaaNormal: ratio >= 7,
      aaaLarge: ratio >= 4.5,
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

  const updateSavedCheck = useCallback((id: string, field: 'textColor' | 'backgroundColor', value: string) => {
    const updated = checks.map(c => {
      if (c.id !== id) return c;
      const newText = field === 'textColor' ? value : c.textColor;
      const newBg   = field === 'backgroundColor' ? value : c.backgroundColor;
      const r = getContrastRatio(newText, newBg);
      return { ...c, textColor: newText, backgroundColor: newBg, ratio: r,
        aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7, aaaLarge: r >= 4.5 };
    });
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

      {!collapsed && <div className="card-content" style={{ padding: '16px' }}>
        {/* Color inputs */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
              Text Color
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                style={{ width: '40px', height: '32px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                style={{ 
                  flex: 1, 
                  background: 'var(--color-bg-tertiary)', 
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem'
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
              Background Color
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                style={{ width: '40px', height: '32px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                style={{ 
                  flex: 1, 
                  background: 'var(--color-bg-tertiary)', 
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem'
                }}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div style={{ 
          padding: '16px', 
          background: bgColor,
          borderRadius: '8px',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          <p style={{ 
            color: textColor, 
            fontSize: '1.25rem', 
            fontWeight: 600,
            margin: 0
          }}>
            Sample Text
          </p>
          <p style={{ 
            color: textColor, 
            fontSize: '0.875rem',
            margin: '8px 0 0 0'
          }}>
            This is how your text looks
          </p>
        </div>

        {/* Results */}
        <div style={{ 
          background: 'var(--color-bg-tertiary)', 
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Contrast Ratio
            </span>
            <span style={{ 
              fontSize: '1.5rem', 
              fontWeight: 700,
              color: ratio >= 4.5 ? 'var(--color-success)' : ratio >= 3 ? 'var(--color-warning)' : 'var(--color-error)'
            }}>
              {ratio.toFixed(2)}:1
            </span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem' }}>
            <div style={{ 
              padding: '6px 10px', 
              borderRadius: '4px',
              background: ratio >= 4.5 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: ratio >= 4.5 ? 'var(--color-success)' : 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {ratio >= 4.5 ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              WCAG AA Normal
            </div>
            <div style={{ 
              padding: '6px 10px', 
              borderRadius: '4px',
              background: ratio >= 3 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: ratio >= 3 ? 'var(--color-success)' : 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {ratio >= 3 ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              WCAG AA Large
            </div>
            <div style={{ 
              padding: '6px 10px', 
              borderRadius: '4px',
              background: ratio >= 7 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: ratio >= 7 ? 'var(--color-success)' : 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {ratio >= 7 ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              WCAG AAA Normal
            </div>
            <div style={{ 
              padding: '6px 10px', 
              borderRadius: '4px',
              background: ratio >= 4.5 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: ratio >= 4.5 ? 'var(--color-success)' : 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {ratio >= 4.5 ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              WCAG AAA Large
            </div>
          </div>
        </div>

        {/* Time slider and add button */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
            Timestamp: {currentTime.toFixed(2)}s
          </label>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            style={{ width: '100%', marginBottom: '8px' }}
          />
          <button 
            className="btn btn-primary btn-sm"
            onClick={addCheck}
            style={{ width: '100%' }}
          >
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
                <div 
                  key={check.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: '6px',
                    fontSize: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="color"
                      value={check.textColor}
                      title="Text color"
                      onChange={e => updateSavedCheck(check.id, 'textColor', e.target.value)}
                      style={{ width: '20px', height: '20px', padding: 0, border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer' }}
                    />
                    <input
                      type="color"
                      value={check.backgroundColor}
                      title="Background color"
                      onChange={e => updateSavedCheck(check.id, 'backgroundColor', e.target.value)}
                      style={{ width: '20px', height: '20px', padding: 0, border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer' }}
                    />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{check.ratio.toFixed(2)}:1</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>@ {check.timestamp.toFixed(1)}s</span>
                  <span style={{ 
                    color: check.aaNormal ? 'var(--color-success)' : 'var(--color-error)',
                    marginLeft: 'auto'
                  }}>
                    {check.aaNormal ? 'AA ✓' : 'AA ✗'}
                  </span>
                  <button
                    className="btn btn-icon btn-sm"
                    onClick={() => deleteCheck(check.id)}
                    style={{ color: 'var(--color-error)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
};