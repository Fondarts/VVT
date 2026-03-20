import React, { useState, useEffect } from 'react';
import { X, Film, Monitor, Globe, Download, Plus, Trash2, Save } from 'lucide-react';
import { checkHelper } from '../api/helperClient';
import type { HelperHealth } from '../api/helperClient';

export type CodecId =
  | 'h264' | 'prores' | 'prores_lt' | 'prores_proxy'
  | 'xdcam' | 'dnxhd' | 'dnxhr';

export interface ExportSettings {
  codec: CodecId;
  quality: 'high' | 'medium' | 'draft';
  useNative: boolean;
  streamCopy: boolean;
}

/* ── Format families ── */

type Family = 'h264' | 'prores' | 'mxf';

interface FamilyDef {
  id: Family;
  label: string;
  desc: string;
  nativeOnly?: boolean;
}

const FAMILIES: FamilyDef[] = [
  { id: 'h264', label: 'H.264', desc: 'MP4 — universal playback' },
  { id: 'prores', label: 'ProRes', desc: 'MOV — broadcast quality', nativeOnly: true },
  { id: 'mxf', label: 'MXF', desc: 'MXF — broadcast delivery', nativeOnly: true },
];

/* ── Presets per family ── */

interface PresetDef {
  id: CodecId;
  quality: ExportSettings['quality'];
  label: string;
  desc: string;
  ext: string;
}

const PRESETS: Record<Family, PresetDef[]> = {
  h264: [
    { id: 'h264', quality: 'high', label: 'High Quality', desc: 'CRF 15 · slow preset · best quality', ext: '.mp4' },
    { id: 'h264', quality: 'medium', label: 'Balanced', desc: 'CRF 20 · medium preset', ext: '.mp4' },
    { id: 'h264', quality: 'draft', label: 'Fast Draft', desc: 'CRF 28 · ultrafast · preview quality', ext: '.mp4' },
  ],
  prores: [
    { id: 'prores', quality: 'high', label: 'ProRes 422 HQ', desc: 'Highest quality, large files', ext: '.mov' },
    { id: 'prores_lt', quality: 'high', label: 'ProRes 422 LT', desc: 'Good quality, smaller files', ext: '.mov' },
    { id: 'prores_proxy', quality: 'high', label: 'ProRes Proxy', desc: 'Lightweight, for offline editing', ext: '.mov' },
  ],
  mxf: [
    { id: 'xdcam', quality: 'high', label: 'XDCAM HD422', desc: 'MPEG-2 50 Mbps · broadcast standard', ext: '.mxf' },
    { id: 'dnxhd', quality: 'high', label: 'DNxHD 185', desc: 'Avid DNxHD 185 Mbps · post-production', ext: '.mxf' },
    { id: 'dnxhr', quality: 'high', label: 'DNxHR HQ', desc: 'Avid DNxHR · any resolution', ext: '.mxf' },
  ],
};

/* ── Custom presets (localStorage) ── */

interface CustomPreset {
  name: string;
  family: Family;
  presetIdx: number;
}

const STORAGE_KEY = 'kissd-export-custom-presets';

function loadCustomPresets(): CustomPreset[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveCustomPresets(presets: CustomPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

/* ── Component ── */

interface Props {
  onExport: (settings: ExportSettings) => void;
  onClose: () => void;
  inputCodec?: string;
}

export const ExportModal: React.FC<Props> = ({ onExport, onClose, inputCodec }) => {
  const [family, setFamily] = useState<Family>('h264');
  const [presetIdx, setPresetIdx] = useState(0);
  const [helper, setHelper] = useState<HelperHealth | null | 'checking'>('checking');
  const [useNative, setUseNative] = useState(false);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(loadCustomPresets);
  const [savingCustom, setSavingCustom] = useState(false);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    checkHelper().then(h => {
      setHelper(h);
      if (h?.ffmpeg) setUseNative(true);
    });
  }, []);

  const helperReady = helper && helper !== 'checking' && helper.ffmpeg;

  // Reset preset when family changes
  useEffect(() => { setPresetIdx(0); }, [family]);

  // Force browser if native-only family selected without helper
  useEffect(() => {
    const fam = FAMILIES.find(f => f.id === family);
    if (fam?.nativeOnly && !helperReady) setFamily('h264');
  }, [family, helperReady]);

  // Force native for native-only families
  useEffect(() => {
    const fam = FAMILIES.find(f => f.id === family);
    if (fam?.nativeOnly && helperReady) setUseNative(true);
  }, [family, helperReady]);

  const presets = PRESETS[family];
  const selected = presets[presetIdx] || presets[0];
  const canStreamCopy = inputCodec?.toLowerCase().includes('h264') && selected.id === 'h264';

  const handleSaveCustom = () => {
    if (!customName.trim()) return;
    const updated = [...customPresets, { name: customName.trim(), family, presetIdx }];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setSavingCustom(false);
    setCustomName('');
  };

  const handleDeleteCustom = (idx: number) => {
    const updated = customPresets.filter((_, i) => i !== idx);
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  const handleLoadCustom = (cp: CustomPreset) => {
    const fam = FAMILIES.find(f => f.id === cp.family);
    if (fam?.nativeOnly && !helperReady) return;
    setFamily(cp.family);
    setTimeout(() => setPresetIdx(cp.presetIdx), 0);
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
      <div className="card" style={{ width: '480px', maxWidth: '90vw', padding: 0 }}>
        {/* Header */}
        <div className="card-header" style={{ padding: '14px 16px' }}>
          <h3 className="card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Film size={16} style={{ color: 'var(--color-accent)' }} />
            Export Video
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
                  {helper === 'checking' ? 'Checking...'
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
                  Download and run the <strong>KISSD Export Helper</strong>. It includes FFmpeg automatically.
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <a
                      href="https://github.com/Fondarts/VVT/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.65rem', padding: '2px 8px', textDecoration: 'none' }}
                    >
                      Download KissdHelper.exe
                    </a>
                    <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                      Just run it and keep it open
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Format family ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
              Format
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {FAMILIES.map(fam => {
                const disabled = fam.nativeOnly && !helperReady;
                const active = family === fam.id;
                return (
                  <button
                    key={fam.id}
                    onClick={() => { if (!disabled) setFamily(fam.id); }}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: '6px', textAlign: 'center',
                      cursor: disabled ? 'default' : 'pointer',
                      border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: active ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                      {fam.label}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {fam.desc}{disabled ? ' · requires Helper' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Preset selector ── */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
              Preset
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {presets.map((preset, i) => {
                const active = presetIdx === i;
                return (
                  <button
                    key={`${preset.id}-${preset.quality}`}
                    onClick={() => setPresetIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '7px 12px', borderRadius: '6px', textAlign: 'left', cursor: 'pointer',
                      border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: active ? 'rgba(225,255,28,0.08)' : 'var(--color-bg-tertiary)',
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{preset.label}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)' }}>{preset.desc}</div>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{preset.ext}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Custom presets ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                My Presets
              </label>
              {!savingCustom && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setSavingCustom(true); setCustomName(''); }}
                  style={{ fontSize: '0.62rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={10} /> Save current
                </button>
              )}
            </div>

            {/* Save form */}
            {savingCustom && (
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                <input
                  className="input"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveCustom(); if (e.key === 'Escape') setSavingCustom(false); }}
                  placeholder={`${selected.label} preset name...`}
                  autoFocus
                  style={{ flex: 1, fontSize: '0.72rem', padding: '4px 8px' }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleSaveCustom} style={{ fontSize: '0.62rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Save size={10} /> Save
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSavingCustom(false)} style={{ fontSize: '0.62rem', padding: '4px 8px' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Custom preset list */}
            {customPresets.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {customPresets.map((cp, i) => {
                  const fam = FAMILIES.find(f => f.id === cp.family);
                  const preset = PRESETS[cp.family]?.[cp.presetIdx];
                  const disabled = fam?.nativeOnly && !helperReady;
                  if (!preset) return null;
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '5px 10px', borderRadius: '6px', cursor: disabled ? 'default' : 'pointer',
                        border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)',
                        opacity: disabled ? 0.4 : 1,
                      }}
                      onClick={() => handleLoadCustom(cp)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{cp.name}</div>
                        <div style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)' }}>
                          {fam?.label} &middot; {preset.label} &middot; {preset.ext}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteCustom(i); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px', display: 'flex' }}
                        title="Delete preset"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : !savingCustom && (
              <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No custom presets yet. Select a format and preset above, then save it here.
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onExport({
                codec: selected.id,
                quality: selected.quality,
                useNative,
                streamCopy: !!canStreamCopy,
              })}
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
