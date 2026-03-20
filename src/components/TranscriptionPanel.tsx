import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, Copy, Check, FileDown, AlertCircle,
  ChevronDown, ChevronUp, Play, Loader2, Settings, Scissors, Merge, Plus,
} from 'lucide-react';
import type { TranscriptionResult, SubtitleStyle } from '../shared/types';
import { exportSRT } from '../api/ffmpeg';
import { transcribeFile, checkModelCached, WHISPER_MODELS, WHISPER_LANGUAGES } from '../api/whisper';
import type { WhisperModel } from '../api/whisper';
import { DEFAULT_SUBTITLE_STYLE, FONT_OPTIONS, CHECKERBOARD } from './SubtitleSettingsModal';

interface Props {
  result?: TranscriptionResult | null;
  onTranscriptionDone?: (result: TranscriptionResult) => void;
  onSeek?: (timeMs: number) => void;
  videoFile?: File | null;
  transcodedVideoSrc?: string;
  subtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
}

interface EditableSegment { from: number; to: number; text: string }

const CUSTOM_FONTS_KEY = 'kissd-custom-fonts';
function loadCustomFonts(): string[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FONTS_KEY) || '[]'); } catch { return []; }
}
function saveCustomFonts(fonts: string[]) { localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(fonts)); }

// ── Timecode helpers ─────────────────────────────────────────────

function msToTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 10);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(frac).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(frac).padStart(2,'0')}`;
}

function parseTimecodeToMs(raw: string): number | null {
  const s = raw.trim();
  let m = s.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (m) return (Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]))*1000 + Number(m[4].padEnd(3,'0'));
  m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return (Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]))*1000;
  m = s.match(/^(\d+):(\d{2})[,.](\d{1,2})$/);
  if (m) return (Number(m[1])*60 + Number(m[2]))*1000 + Number(m[3].padEnd(2,'0'))*10;
  m = s.match(/^(\d+):(\d{2})$/);
  if (m) return (Number(m[1])*60 + Number(m[2]))*1000;
  return null;
}

/** Convert hex color to rgba with alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Extract hex and alpha from rgba string */
function rgbaToHexAlpha(rgba: string): { hex: string; alpha: number } {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { hex: '#000000', alpha: 0.78 };
  const hex = '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return { hex, alpha: m[4] !== undefined ? parseFloat(m[4]) : 1 };
}

// ── Component ────────────────────────────────────────────────────

export const TranscriptionPanel: React.FC<Props> = ({
  result: externalResult,
  onTranscriptionDone,
  onSeek,
  videoFile,
  transcodedVideoSrc,
  subtitleStyle,
  onSubtitleStyleChange,
}) => {
  const [internalResult, setInternalResult] = useState<TranscriptionResult | null>(null);
  const result = externalResult ?? internalResult;

  const [editedSegments, setEditedSegments] = useState<EditableSegment[]>([]);
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const [editingTcIdx, setEditingTcIdx] = useState<number | null>(null);
  const [tcField, setTcField] = useState<'from' | 'to'>('from');
  const [tcDraft, setTcDraft] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [srtSaved, setSrtSaved] = useState(false);

  // Selection
  const [selectedSegs, setSelectedSegs] = useState<Set<number>>(new Set());

  // Transcription state
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<WhisperModel>('Xenova/whisper-base');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [cachedModels, setCachedModels] = useState<Partial<Record<WhisperModel, boolean>>>({});
  const [showSettings, setShowSettings] = useState(false);

  // Custom fonts
  const [customFonts, setCustomFonts] = useState<string[]>(loadCustomFonts);
  const [addingFont, setAddingFont] = useState(false);
  const [fontDraft, setFontDraft] = useState('');

  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const tcEditRef = useRef<HTMLInputElement>(null);

  // Subtitle style
  const [internalStyle, setInternalStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const ss = subtitleStyle ?? internalStyle;
  const updateStyle = (patch: Partial<SubtitleStyle>) => {
    const next = { ...ss, ...patch };
    setInternalStyle(next);
    onSubtitleStyleChange?.(next);
  };

  const bgParsed = rgbaToHexAlpha(ss.backgroundColor);

  useEffect(() => {
    if (result) {
      setEditedSegments(result.segments.map(s => ({ ...s })));
      setEditingTextIdx(null);
      setEditingTcIdx(null);
      setSelectedSegs(new Set());
    }
  }, [result]);

  useEffect(() => { if (editingTextIdx !== null) textEditRef.current?.focus(); }, [editingTextIdx]);
  useEffect(() => { if (editingTcIdx !== null) { tcEditRef.current?.focus(); tcEditRef.current?.select(); } }, [editingTcIdx]);

  useEffect(() => {
    Promise.all(
      WHISPER_MODELS.map(m => checkModelCached(m.id).then(cached => ({ id: m.id, cached })))
    ).then(results => {
      const map: Partial<Record<WhisperModel, boolean>> = {};
      results.forEach(r => { map[r.id] = r.cached; });
      setCachedModels(map);
    });
  }, []);

  const allFonts = [...FONT_OPTIONS, ...customFonts];

  // ── Transcription ───────────────────────────────────────────────
  const handleTranscribe = async () => {
    if (!videoFile || transcribing) return;
    setTranscribing(true); setTranscribeProgress(0);
    setTranscribeStatus('Starting...'); setTranscribeError(null);
    try {
      let fileForTranscription: File = videoFile;
      if (transcodedVideoSrc) {
        try {
          setTranscribeStatus('Preparing audio...');
          const response = await fetch(transcodedVideoSrc);
          const blob = await response.blob();
          fileForTranscription = new File([blob], 'transcoded.mp4', { type: 'video/mp4' });
        } catch { /* Fall back */ }
      }
      const res = await transcribeFile(fileForTranscription, {
        model: selectedModel, language: selectedLanguage,
        onStatus: (label, progress) => { setTranscribeStatus(label); if (progress !== undefined) setTranscribeProgress(progress); },
      });
      setInternalResult(res);
      onTranscriptionDone?.(res);
      setCachedModels(prev => ({ ...prev, [selectedModel]: true }));
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : String(err));
    } finally { setTranscribing(false); }
  };

  // ── Segment editing ─────────────────────────────────────────────
  const notifyParent = useCallback((segs: EditableSegment[]) => {
    if (!result) return;
    const updated: TranscriptionResult = {
      ...result, segments: segs,
      fullText: segs.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim(),
    };
    onTranscriptionDone?.(updated);
    setInternalResult(updated);
  }, [result, onTranscriptionDone]);

  const commitTextEdit = (idx: number, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) { setEditingTextIdx(null); return; }
    const updated = editedSegments.map((s, i) => i === idx ? { ...s, text: trimmed } : s);
    setEditedSegments(updated); setEditingTextIdx(null); notifyParent(updated);
  };

  const openTcEdit = (idx: number, field: 'from' | 'to') => {
    setEditingTcIdx(idx); setTcField(field);
    setTcDraft(msToTimecode(editedSegments[idx][field]));
    setEditingTextIdx(null);
  };

  const commitTcEdit = () => {
    if (editingTcIdx === null) return;
    const ms = parseTimecodeToMs(tcDraft);
    if (ms !== null && ms >= 0) {
      const updated = editedSegments.map((s, i) => i === editingTcIdx ? { ...s, [tcField]: ms } : s);
      setEditedSegments(updated); notifyParent(updated);
    }
    setEditingTcIdx(null);
  };

  // ── Selection ───────────────────────────────────────────────────
  const toggleSelect = (idx: number, e: React.MouseEvent) => {
    setSelectedSegs(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const sorted = [...prev].sort((a, b) => a - b);
        const anchor = sorted[0];
        const lo = Math.min(anchor, idx);
        const hi = Math.max(anchor, idx);
        for (let i = lo; i <= hi; i++) next.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(idx)) next.delete(idx); else next.add(idx);
      } else {
        if (next.size === 1 && next.has(idx)) { next.clear(); } else { next.clear(); next.add(idx); }
      }
      return next;
    });
  };

  // ── Split segment ───────────────────────────────────────────────
  const handleSplit = () => {
    if (selectedSegs.size !== 1) return;
    const idx = [...selectedSegs][0];
    const seg = editedSegments[idx];
    const mid = Math.round((seg.from + seg.to) / 2);
    const words = seg.text.split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const text1 = words.slice(0, half).join(' ');
    const text2 = words.slice(half).join(' ') || '...';
    const updated = [
      ...editedSegments.slice(0, idx),
      { from: seg.from, to: mid, text: text1 },
      { from: mid, to: seg.to, text: text2 },
      ...editedSegments.slice(idx + 1),
    ];
    setEditedSegments(updated); notifyParent(updated);
    setSelectedSegs(new Set([idx, idx + 1]));
  };

  // ── Join segments ───────────────────────────────────────────────
  const handleJoin = () => {
    if (selectedSegs.size < 2) return;
    const sorted = [...selectedSegs].sort((a, b) => a - b);
    // Only join consecutive segments
    const isConsecutive = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (!isConsecutive) return;
    const first = editedSegments[sorted[0]];
    const last = editedSegments[sorted[sorted.length - 1]];
    const joined: EditableSegment = {
      from: first.from, to: last.to,
      text: sorted.map(i => editedSegments[i].text).join(' '),
    };
    const updated = [
      ...editedSegments.slice(0, sorted[0]),
      joined,
      ...editedSegments.slice(sorted[sorted.length - 1] + 1),
    ];
    setEditedSegments(updated); notifyParent(updated);
    setSelectedSegs(new Set([sorted[0]]));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedSegments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleExportSRT = () => {
    if (editedSegments.length === 0) return;
    exportSRT(editedSegments);
    setSrtSaved(true); setTimeout(() => setSrtSaved(false), 2000);
  };

  const handleAddFont = () => {
    const name = fontDraft.trim();
    if (!name || allFonts.includes(name)) { setAddingFont(false); setFontDraft(''); return; }
    const updated = [...customFonts, name];
    setCustomFonts(updated); saveCustomFonts(updated);
    updateStyle({ fontFamily: name });
    setAddingFont(false); setFontDraft('');
  };

  // ── Shared styles ──
  const inp: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
    borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.72rem', padding: '3px 6px',
  };
  const lbl: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' };

  // ── Timecode inline editor ──
  const TcSpan: React.FC<{ idx: number; field: 'from' | 'to'; value: number }> = ({ idx, field, value }) => {
    const isEditing = editingTcIdx === idx && tcField === field;
    if (isEditing) return (
      <input ref={tcEditRef} value={tcDraft}
        onChange={e => setTcDraft(e.target.value)} onBlur={commitTcEdit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTcEdit(); } if (e.key === 'Escape') setEditingTcIdx(null); }}
        style={{ width: '72px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent)', borderRadius: '3px', color: 'var(--color-accent)', fontSize: '0.72rem', padding: '1px 4px', fontFamily: 'var(--font-mono)' }}
      />
    );
    return (
      <span style={{ color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', userSelect: 'none' }}
        onClick={() => onSeek ? onSeek(value) : openTcEdit(idx, field)}
        onDoubleClick={() => openTcEdit(idx, field)}
        title={onSeek ? `Seek to ${msToTimecode(value)} (double-click to edit)` : `Edit ${field} timecode`}
      >{msToTimecode(value)}</span>
    );
  };

  const canSplit = selectedSegs.size === 1;
  const canJoin = selectedSegs.size >= 2 && (() => {
    const sorted = [...selectedSegs].sort((a, b) => a - b);
    return sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  })();

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="card">

      {/* Header */}
      <div className="card-header" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setCollapsed(c => !c)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mic size={14} style={{ color: 'var(--color-accent)' }} />
          <h3 className="card-title" style={{ fontSize: '0.85rem' }}>Audio Transcription</h3>
          {result && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
              {editedSegments.length} segs
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button className="btn btn-icon btn-sm" onClick={e => { e.stopPropagation(); setShowSettings(s => !s); if (collapsed) setCollapsed(false); }} title="Subtitle settings">
            <Settings size={13} style={{ color: showSettings ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
          </button>
          <button className="btn btn-icon btn-sm" onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}>
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && <div className="card-content">

      {/* ── Inline settings panel ── */}
      {showSettings && (
        <div style={{ marginBottom: '10px', padding: '10px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Row 1: Model + Transcribe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={lbl}>Model</label>
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value as WhisperModel)} style={{ ...inp, flex: 1 }}>
              {WHISPER_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}{cachedModels[m.id] ? ' ✓' : ''}</option>
              ))}
            </select>
            {videoFile && (
              <button className="btn btn-secondary btn-sm" onClick={handleTranscribe} disabled={transcribing}
                style={{ fontSize: '0.65rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                {transcribing ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={11} />}
                {transcribing ? 'Working' : 'Transcribe'}
              </button>
            )}
          </div>

          {/* Row 2: Font + size + color + stroke */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={lbl}>Font</label>
            <select value={ss.fontFamily} onChange={e => updateStyle({ fontFamily: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0 }}>
              {allFonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {!addingFont ? (
              <button className="btn btn-icon btn-sm" onClick={() => setAddingFont(true)} title="Add custom font" style={{ padding: '3px' }}>
                <Plus size={12} />
              </button>
            ) : (
              <input value={fontDraft} onChange={e => setFontDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddFont(); if (e.key === 'Escape') { setAddingFont(false); setFontDraft(''); } }}
                onBlur={handleAddFont} placeholder="Font name" autoFocus
                style={{ ...inp, width: '80px' }} />
            )}
            <input type="number" min={16} max={120} value={ss.fontSize}
              onChange={e => updateStyle({ fontSize: Math.max(16, Math.min(120, parseInt(e.target.value) || 48)) })}
              title="Font size (px @1080p)" style={{ ...inp, width: '44px', textAlign: 'center' }} />
            <span style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)' }}>px</span>
            <div style={{ width: '1px', height: '16px', background: 'var(--color-border)', flexShrink: 0 }} />
            <label style={lbl}>Color</label>
            <input type="color" value={ss.color} onChange={e => updateStyle({ color: e.target.value })}
              style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
            <label style={lbl}>Stroke</label>
            <input type="color" value={ss.strokeColor} onChange={e => updateStyle({ strokeColor: e.target.value })}
              style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
            <input type="number" min={0} max={10} value={ss.strokeWidth}
              onChange={e => updateStyle({ strokeWidth: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
              title="Stroke width" style={{ ...inp, width: '36px', textAlign: 'center' }} />
          </div>

          {/* Row 3: Chars + Lines + BG */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={lbl}>Chars/line</label>
            <input type="number" min={10} max={80} value={ss.maxCharsPerLine}
              onChange={e => updateStyle({ maxCharsPerLine: Math.max(10, Math.min(80, parseInt(e.target.value) || 42)) })}
              style={{ ...inp, width: '46px', textAlign: 'center' }} />
            <label style={lbl}>Lines</label>
            <select value={ss.maxLines} onChange={e => updateStyle({ maxLines: parseInt(e.target.value) })}
              style={{ ...inp, width: '42px', textAlign: 'center', padding: '3px 2px' }}>
              <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
            </select>
            <div style={{ flex: 1 }} />
            <label style={lbl}>BG</label>
            <input type="color" value={bgParsed.hex}
              onChange={e => updateStyle({ showBackground: true, backgroundColor: hexToRgba(e.target.value, bgParsed.alpha) })}
              style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input type="checkbox" className="toggle-checkbox" checked={ss.showBackground}
                onChange={e => updateStyle({ showBackground: e.target.checked })} />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {/* Row 4: Position */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={lbl}>Position</label>
            {(['top', 'center', 'bottom'] as const).map(p => (
              <button key={p} onClick={() => updateStyle({ position: p })}
                style={{
                  fontSize: '0.65rem', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer',
                  border: ss.position === p ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  background: ss.position === p ? 'rgba(225,255,28,0.12)' : 'transparent',
                  color: ss.position === p ? 'var(--color-accent)' : 'var(--color-text-muted)',
                }}
              >{p[0].toUpperCase() + p.slice(1)}</button>
            ))}
          </div>

          {/* Preview */}
          <div style={{
            background: CHECKERBOARD, borderRadius: '5px', padding: '14px 10px',
            display: 'flex', justifyContent: 'center',
            alignItems: ss.position === 'top' ? 'flex-start' : ss.position === 'center' ? 'center' : 'flex-end',
            minHeight: '56px', border: '1px solid var(--color-border)',
          }}>
            <span style={{
              fontFamily: ss.fontFamily,
              fontSize: `${Math.max(11, ss.fontSize * 0.28)}px`,
              color: ss.color,
              WebkitTextStroke: ss.strokeWidth > 0 ? `${ss.strokeWidth * 0.28}px ${ss.strokeColor}` : undefined,
              paintOrder: 'stroke fill',
              background: ss.showBackground ? ss.backgroundColor : 'transparent',
              padding: ss.showBackground ? '3px 10px' : '3px 0',
              borderRadius: '3px', textAlign: 'center', maxWidth: '95%', lineHeight: 1.4,
            }}>
              Sample subtitle text
            </span>
          </div>
        </div>
      )}

      {/* Controls — shown when no result yet */}
      {!result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {videoFile ? (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1', minWidth: '110px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Language</label>
                  <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} disabled={transcribing}
                    style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem', padding: '4px 6px' }}>
                    {WHISPER_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={handleTranscribe} disabled={transcribing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '5px 14px' }}>
                  {transcribing
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{transcribeStatus || 'Working...'}</>
                    : <><Play size={14} />Transcribe</>}
                </button>
              </div>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Using: {WHISPER_MODELS.find(m => m.id === selectedModel)?.label}
                {cachedModels[selectedModel] ? ' ✓' : ` (${WHISPER_MODELS.find(m => m.id === selectedModel)?.size} download)`}
              </p>
              {transcribing && transcribeStatus.includes('Downloading') && (
                <div>
                  <div style={{ height: '3px', background: 'var(--color-bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${transcribeProgress}%`, background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
                  </div>
                  <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Downloading model... {transcribeProgress}%</p>
                </div>
              )}
              {transcribeError && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px' }}>
                  <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '0.73rem', color: '#ef4444' }}>{transcribeError}</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
              <AlertCircle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '1px' }} />
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Scan a video file first to enable transcription.</p>
            </div>
          )}
        </div>
      )}

      {/* Transcript display */}
      {result && !collapsed && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              Transcript
              {result.language && result.language !== 'auto' && (
                <span style={{ marginLeft: '6px', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>({result.language})</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {/* Split / Join */}
              {canSplit && (
                <button className="btn btn-icon btn-sm" onClick={handleSplit} title="Split segment at midpoint">
                  <Scissors size={12} />
                </button>
              )}
              {canJoin && (
                <button className="btn btn-icon btn-sm" onClick={handleJoin} title="Join selected segments">
                  <Merge size={12} />
                </button>
              )}
              {selectedSegs.size > 0 && (
                <button className="btn btn-icon btn-sm" onClick={() => setSelectedSegs(new Set())} title="Clear selection"
                  style={{ fontSize: '0.6rem', padding: '2px 4px', color: 'var(--color-text-muted)' }}>
                  {selectedSegs.size}✕
                </button>
              )}
              <div style={{ width: '1px', height: '12px', background: 'var(--color-border)', margin: '0 2px' }} />
              {videoFile && (
                <button className="btn btn-icon btn-sm" onClick={handleTranscribe} disabled={transcribing} title="Re-transcribe">
                  {transcribing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} />}
                </button>
              )}
              <button className="btn btn-icon btn-sm" onClick={handleCopy} title="Copy full text">
                {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
              </button>
              <button className="btn btn-icon btn-sm" onClick={handleExportSRT} title="Export SRT">
                {srtSaved ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <FileDown size={12} />}
              </button>
            </div>
          </div>

          {editedSegments.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No speech detected.</p>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {editedSegments.map((seg, i) => {
                const isSelected = selectedSegs.has(i);
                const rowBg = isSelected
                  ? 'rgba(225,255,28,0.08)'
                  : i % 2 !== 0 ? 'rgba(255,255,255,0.04)' : 'transparent';
                return (
                  <div key={i}
                    style={{
                      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px',
                      padding: '4px 6px', borderRadius: '4px', fontSize: '0.78rem', alignItems: 'start',
                      background: rowBg, cursor: 'default',
                      borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
                    }}
                    onClick={e => { if (editingTextIdx === null && editingTcIdx === null) toggleSelect(i, e); }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-tertiary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = rowBg; }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingTop: '2px' }}>
                      <TcSpan idx={i} field="from" value={seg.from} />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', paddingLeft: '2px', userSelect: 'none' }}>→</span>
                      <TcSpan idx={i} field="to" value={seg.to} />
                    </div>
                    {editingTextIdx === i ? (
                      <textarea ref={textEditRef} defaultValue={seg.text} rows={2}
                        onBlur={e => commitTextEdit(i, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(i, (e.target as HTMLTextAreaElement).value); } if (e.key === 'Escape') setEditingTextIdx(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem', padding: '2px 6px', resize: 'none', fontFamily: 'inherit', lineHeight: '1.4' }}
                      />
                    ) : (
                      <span
                        style={{ color: 'var(--color-text-primary)', cursor: 'default', paddingTop: '2px', lineHeight: '1.4', userSelect: 'none' }}
                        onDoubleClick={e => { e.stopPropagation(); setEditingTcIdx(null); setEditingTextIdx(i); }}
                        title="Double-click to edit text · Click to select"
                      >{seg.text}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            Click to select · Shift+click range · Ctrl+click multi · Double-click to edit text
          </p>
        </div>
      )}

      </div>}
    </div>
  );
};
