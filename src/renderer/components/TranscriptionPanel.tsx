import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, Loader2, Settings, ChevronDown, ChevronUp,
  Copy, Check, FileDown, Download, Zap, AlertCircle,
} from 'lucide-react';
import type { TranscriptionResult } from '../../shared/types';

interface Props {
  filePath: string;
  outputFolder: string;
  onTranscriptionDone?: (result: TranscriptionResult) => void;
  onSeek?: (timeMs: number) => void;
}

interface EditableSegment { from: number; to: number; text: string }
type Engine = 'whisperCpp' | 'whisperX';

// ── Timecode helpers ─────────────────────────────────────────────

function msToTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h   = Math.floor(totalSec / 3600);
  const m   = Math.floor((totalSec % 3600) / 60);
  const s   = totalSec % 60;
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

const WX_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'] as const;
const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' }, { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' }, { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' }, { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' }, { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' }, { code: 'ar', label: 'العربية' },
];

// ── Component ────────────────────────────────────────────────────

export const TranscriptionPanel: React.FC<Props> = ({ filePath, outputFolder, onTranscriptionDone, onSeek }) => {
  // whisper.cpp config
  const [binary, setBinary]         = useState('');
  const [model, setModel]           = useState('');
  const [cppConfigured, setCppConfigured] = useState(false);

  // WhisperX state
  const [wxAvail, setWxAvail]       = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [wxModel, setWxModel]       = useState('base');
  const [wxDevice, setWxDevice]     = useState('cpu');
  const [wxCompute, setWxCompute]   = useState('int8');
  const [wxInstalling, setWxInstalling] = useState(false);
  const [wxInstallLog, setWxInstallLog] = useState<string[]>([]);
  const [wxInstallStage, setWxInstallStage] = useState('');
  const [wxInstallPkg, setWxInstallPkg]     = useState('');
  const [wxInstallProgress, setWxInstallProgress] = useState(0);
  const [wxInstallError, setWxInstallError] = useState<string | null>(null);
  const [wxFixing, setWxFixing]             = useState(false);
  const wxInstallCollecting = useRef(0);
  const wxInstallDownloading = useRef(0);

  // Shared state
  const [engine, setEngine]         = useState<Engine>('whisperX');
  const [language, setLanguage]     = useState('auto');
  const [showSetup, setShowSetup]   = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult]         = useState<TranscriptionResult | null>(null);
  const [editedSegments, setEditedSegments] = useState<EditableSegment[]>([]);
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const [editingTcIdx, setEditingTcIdx]     = useState<number | null>(null);
  const [tcField, setTcField]       = useState<'from' | 'to'>('from');
  const [tcDraft, setTcDraft]       = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [collapsed, setCollapsed]   = useState(false);
  const [copied, setCopied]         = useState(false);
  const [srtSaved, setSrtSaved]     = useState(false);

  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const tcEditRef   = useRef<HTMLInputElement>(null);
  const logEndRef   = useRef<HTMLDivElement>(null);

  // Init: load saved configs + check whisperX
  useEffect(() => {
    window.electronAPI.whisper.getPath().then(({ binary: b, model: m }) => {
      if (b) { setBinary(b); setCppConfigured(true); }
      if (m) setModel(m);
    });
    window.electronAPI.whisperx.getConfig().then(cfg => {
      setWxModel(cfg.model);
      setWxDevice(cfg.device);
      setWxCompute(cfg.computeType);
      // Restore last used engine choice
      if ((cfg as any).preferredEngine === 'whisperCpp') setEngine('whisperCpp');
    });
    // Check uses pip show — fast, no full import needed.
    // Never auto-switch engine: the user's saved choice is always respected.
    window.electronAPI.whisperx.check().then(({ available }) => {
      setWxAvail(available ? 'available' : 'unavailable');
    });
  }, []);

  // Sync editable segments on new result
  useEffect(() => {
    if (result) {
      setEditedSegments(result.segments.map(s => ({ ...s })));
      setEditingTextIdx(null);
      setEditingTcIdx(null);
    }
  }, [result]);

  useEffect(() => { if (editingTextIdx !== null) textEditRef.current?.focus(); }, [editingTextIdx]);
  useEffect(() => { if (editingTcIdx !== null) { tcEditRef.current?.focus(); tcEditRef.current?.select(); } }, [editingTcIdx]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [wxInstallLog]);

  // ── whisper.cpp setup ──────────────────────────────────────────
  const handleBrowseBinary = async () => { const p = await window.electronAPI.dialog.openFile(); if (p) setBinary(p); };
  const handleBrowseModel  = async () => { const p = await window.electronAPI.dialog.openFile(); if (p) setModel(p); };
  const handleSaveCppConfig = async () => {
    if (!binary || !model) return;
    await window.electronAPI.whisper.setPath(binary, model);
    setCppConfigured(true);
    setShowSetup(false);
  };

  // ── WhisperX setup ─────────────────────────────────────────────
  const handleInstallWX = async () => {
    setWxInstalling(true);
    setWxInstallLog([]);
    setWxInstallStage('Starting installation…');
    setWxInstallPkg('');
    setWxInstallProgress(2);
    setWxInstallError(null);
    wxInstallCollecting.current  = 0;
    wxInstallDownloading.current = 0;

    const unsub = window.electronAPI.whisperx.onInstallProgress(line => {
      // Strip ANSI escape codes
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (!clean) return;

      setWxInstallLog(prev => [...prev.slice(-80), clean]);

      if (/^Collecting\s/.test(clean)) {
        wxInstallCollecting.current++;
        const pct = Math.min(25, 2 + wxInstallCollecting.current * 1.5);
        setWxInstallStage('Resolving dependencies');
        setWxInstallPkg(clean.replace('Collecting ', '').split(' ')[0]);
        setWxInstallProgress(pct);
      } else if (/Downloading\s+\S/.test(clean)) {
        wxInstallDownloading.current++;
        const pct = Math.min(70, 25 + wxInstallDownloading.current * 3);
        setWxInstallStage('Downloading packages');
        const m = clean.match(/Downloading\s+(\S+)/);
        if (m) setWxInstallPkg(m[1].replace(/-[\d.]+.*$/, ''));
        setWxInstallProgress(pct);
      } else if (/Installing collected packages/.test(clean)) {
        setWxInstallStage('Installing packages');
        setWxInstallPkg('');
        setWxInstallProgress(82);
      } else if (/Building wheel/.test(clean)) {
        setWxInstallStage('Building wheels');
        setWxInstallProgress(prev => Math.min(80, prev + 2));
      } else if (/Successfully installed/.test(clean)) {
        setWxInstallStage('Complete!');
        setWxInstallPkg('');
        setWxInstallProgress(100);
      }
    });

    try {
      await window.electronAPI.whisperx.install();
      setWxAvail('available');
      setWxInstallStage('Installation complete!');
      setWxInstallProgress(100);
    } catch (err) {
      setWxInstallError(err instanceof Error ? err.message : 'Installation failed');
      setWxInstallStage('Failed');
      setWxInstallProgress(0);
    } finally {
      setWxInstalling(false);
      unsub();
    }
  };

  const handleFixTorch = async () => {
    setWxFixing(true);
    setWxInstallLog([]);
    setWxInstallStage('Installing PyTorch (CPU)…');
    setWxInstallPkg('');
    setWxInstallProgress(2);
    setWxInstallError(null);
    wxInstallCollecting.current  = 0;
    wxInstallDownloading.current = 0;

    const unsub = window.electronAPI.whisperx.onInstallProgress(line => {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (!clean) return;
      setWxInstallLog(prev => [...prev.slice(-80), clean]);
      if (/Downloading\s+\S/.test(clean)) {
        wxInstallDownloading.current++;
        setWxInstallStage('Downloading PyTorch');
        const m = clean.match(/Downloading\s+(\S+)/);
        if (m) setWxInstallPkg(m[1].replace(/-[\d.]+.*$/, ''));
        setWxInstallProgress(Math.min(85, 10 + wxInstallDownloading.current * 15));
      } else if (/Installing collected packages/.test(clean)) {
        setWxInstallStage('Installing…'); setWxInstallPkg(''); setWxInstallProgress(90);
      } else if (/Successfully installed/.test(clean)) {
        setWxInstallStage('Done!'); setWxInstallProgress(100);
      }
    });

    try {
      await window.electronAPI.whisperx.installTorch();
      setWxInstallStage('PyTorch installed! Try transcribing again.');
      setWxInstallProgress(100);
      setWxInstallError(null);
    } catch (err) {
      setWxInstallError(err instanceof Error ? err.message : 'Failed');
      setWxInstallStage('Failed');
    } finally {
      setWxFixing(false);
      unsub();
    }
  };

  const handleSaveWXConfig = async () => {
    await window.electronAPI.whisperx.setConfig({ model: wxModel, device: wxDevice, computeType: wxCompute, preferredEngine: engine } as any);
    setShowSetup(false);
  };

  // Persist engine choice whenever it changes
  const handleSetEngine = (e: Engine) => {
    setEngine(e);
    window.electronAPI.whisperx.setConfig({ preferredEngine: e } as any);
  };

  // ── Transcription ──────────────────────────────────────────────
  const handleTranscribe = async () => {
    if (!filePath) return;
    if (engine === 'whisperCpp' && !cppConfigured) return;
    if (engine === 'whisperX' && wxAvail !== 'available') return;

    setTranscribing(true);
    setError(null);
    setResult(null);

    try {
      let r: TranscriptionResult;
      if (engine === 'whisperX') {
        r = await window.electronAPI.whisperx.transcribe(filePath, outputFolder, {
          model: wxModel, language, computeType: wxCompute, device: wxDevice,
        });
      } else {
        r = await window.electronAPI.whisper.transcribe(filePath, outputFolder, language);
      }
      setResult(r);
      onTranscriptionDone?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  // ── Segment editing ────────────────────────────────────────────
  const notifyParent = (segs: EditableSegment[]) => {
    if (!result) return;
    onTranscriptionDone?.({
      ...result,
      segments: segs,
      fullText: segs.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim(),
    });
  };

  const commitTextEdit = (idx: number, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) { setEditingTextIdx(null); return; }
    const updated = editedSegments.map((s, i) => i === idx ? { ...s, text: trimmed } : s);
    setEditedSegments(updated);
    setEditingTextIdx(null);
    notifyParent(updated);
  };

  const openTcEdit = (idx: number, field: 'from' | 'to') => {
    setEditingTcIdx(idx);
    setTcField(field);
    setTcDraft(msToTimecode(editedSegments[idx][field]));
    setEditingTextIdx(null);
  };

  const commitTcEdit = () => {
    if (editingTcIdx === null) return;
    const ms = parseTimecodeToMs(tcDraft);
    if (ms !== null && ms >= 0) {
      const updated = editedSegments.map((s, i) => i === editingTcIdx ? { ...s, [tcField]: ms } : s);
      setEditedSegments(updated);
      notifyParent(updated);
    }
    setEditingTcIdx(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedSegments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleExportSRT = async () => {
    if (editedSegments.length === 0) return;
    const savePath = await window.electronAPI.dialog.saveFilePath('subtitles.srt');
    if (!savePath) return;
    await window.electronAPI.whisper.saveSRT(editedSegments, savePath);
    setSrtSaved(true); setTimeout(() => setSrtSaved(false), 2000);
  };

  // ── Timecode inline editor ─────────────────────────────────────
  const TcSpan: React.FC<{ idx: number; field: 'from' | 'to'; value: number }> = ({ idx, field, value }) => {
    const isEditing = editingTcIdx === idx && tcField === field;
    if (isEditing) return (
      <input
        ref={tcEditRef}
        value={tcDraft}
        onChange={e => setTcDraft(e.target.value)}
        onBlur={commitTcEdit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commitTcEdit(); }
          if (e.key === 'Escape') setEditingTcIdx(null);
        }}
        style={{ width: '72px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent)', borderRadius: '3px', color: 'var(--color-accent)', fontSize: '0.72rem', padding: '1px 4px', fontFamily: 'var(--font-mono)' }}
      />
    );
    return (
      <span
        style={{ color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}
        onClick={() => openTcEdit(idx, field)}
        title={`Edit ${field} timecode`}
      >
        {msToTimecode(value)}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────
  const isConfigured = engine === 'whisperX' ? wxAvail === 'available' : cppConfigured;

  return (
    <div className="card" style={{ padding: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mic size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Audio Transcription</span>
          {/* Engine badge */}
          <span style={{
            fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
            background: engine === 'whisperX' ? 'rgba(99,102,241,0.2)' : 'var(--color-bg-tertiary)',
            color: engine === 'whisperX' ? '#818cf8' : 'var(--color-text-muted)',
          }}>
            {engine === 'whisperX' ? '⚡ WhisperX' : 'whisper.cpp'}
          </span>
          {result && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
              {editedSegments.length} segs
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {result && (
            <button className="btn btn-icon btn-sm" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setShowSetup(s => !s)}
            title="Configure"
            style={{ color: isConfigured ? 'var(--color-success)' : 'var(--color-text-muted)' }}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Setup panel */}
      {showSetup && (
        <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>

          {/* Engine toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {(['whisperX', 'whisperCpp'] as Engine[]).map(e => (
              <button
                key={e}
                onClick={() => handleSetEngine(e)}
                style={{
                  flex: 1, padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: engine === e ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  color: engine === e ? '#fff' : 'var(--color-text-muted)',
                  opacity: e === 'whisperX' && wxAvail === 'unavailable' && !wxInstalling ? 0.6 : 1,
                }}
              >
                {e === 'whisperX' ? '⚡ WhisperX' : 'whisper.cpp'}
              </button>
            ))}
          </div>

          {engine === 'whisperX' ? (
            <>
              {wxAvail === 'unavailable' && !wxInstalling && (
                <div style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                    WhisperX not installed. First run downloads ~500MB of models.
                  </p>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={handleInstallWX}>
                    <Download size={13} /> Install WhisperX (pip install)
                  </button>
                  {wxInstallError && (
                    <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-error)', margin: '0 0 4px 0', fontWeight: 600 }}>Installation failed:</p>
                      <p style={{ fontSize: '0.67rem', color: 'var(--color-error)', margin: 0, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{wxInstallError}</p>
                      {wxInstallLog.length > 0 && (
                        <details style={{ marginTop: '6px' }}>
                          <summary style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Show log</summary>
                          <div style={{ maxHeight: '80px', overflowY: 'auto', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            {wxInstallLog.map((l, i) => <div key={i}>{l}</div>)}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}

              {wxInstalling && (
                <div style={{ marginBottom: '10px', background: 'var(--color-bg-primary)', borderRadius: '8px', padding: '12px' }}>
                  {/* Stage + spinner */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {wxInstallStage || 'Installing…'}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: '6px', background: 'var(--color-bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{
                      height: '100%',
                      width: `${wxInstallProgress}%`,
                      background: 'var(--color-accent)',
                      borderRadius: '3px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  {/* Current package */}
                  {wxInstallPkg && (
                    <p style={{ fontSize: '0.67rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wxInstallPkg}
                    </p>
                  )}
                  {/* Collapsible raw log */}
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                      Show full log ({wxInstallLog.length} lines)
                    </summary>
                    <div style={{ marginTop: '4px', maxHeight: '100px', overflowY: 'auto', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', borderRadius: '4px', padding: '6px' }}>
                      {wxInstallLog.map((l, i) => <div key={i}>{l}</div>)}
                      <div ref={logEndRef} />
                    </div>
                  </details>
                </div>
              )}

              {!wxInstalling && wxAvail === 'available' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontSize: '0.75rem', color: 'var(--color-success)' }}>
                  <Check size={13} /> WhisperX installed
                </div>
              )}

              {/* Model selector */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Model</label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {WX_MODELS.map(m => (
                    <button
                      key={m}
                      onClick={() => setWxModel(m)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', border: 'none',
                        background: wxModel === m ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                        color: wxModel === m ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                  tiny/base = fast · large-v2 = best accuracy · first run downloads model
                </p>
              </div>

              {/* Device + Compute */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Device</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['cpu', 'cuda'].map(d => (
                      <button key={d} onClick={() => setWxDevice(d)} style={{ flex: 1, padding: '3px 0', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', border: 'none', background: wxDevice === d ? 'var(--color-accent)' : 'var(--color-bg-secondary)', color: wxDevice === d ? '#fff' : 'var(--color-text-muted)' }}>
                        {d.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Compute</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['int8', 'float32'].map(c => (
                      <button key={c} onClick={() => setWxCompute(c)} style={{ flex: 1, padding: '3px 0', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', border: 'none', background: wxCompute === c ? 'var(--color-accent)' : 'var(--color-bg-secondary)', color: wxCompute === c ? '#fff' : 'var(--color-text-muted)' }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button className="btn btn-primary btn-sm" onClick={handleSaveWXConfig} style={{ width: '100%' }}>
                Save Settings
              </button>
            </>
          ) : (
            /* whisper.cpp config */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Requires <strong>whisper.cpp</strong> binary + GGML model file.
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input value={binary} onChange={e => setBinary(e.target.value)} placeholder="Path to whisper-cli.exe"
                  style={{ flex: 1, fontSize: '0.75rem', padding: '5px 8px', background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--color-text-primary)' }} />
                <button className="btn btn-secondary btn-sm" onClick={handleBrowseBinary}>Browse</button>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="Path to ggml-base.bin"
                  style={{ flex: 1, fontSize: '0.75rem', padding: '5px 8px', background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--color-text-primary)' }} />
                <button className="btn btn-secondary btn-sm" onClick={handleBrowseModel}>Browse</button>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleSaveCppConfig} disabled={!binary || !model} style={{ alignSelf: 'flex-end' }}>
                Save
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      {!isConfigured && !showSetup ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          <AlertCircle size={12} />
          {wxAvail === 'checking' ? 'Checking WhisperX…' : `Click `}
          {wxAvail !== 'checking' && <Settings size={11} style={{ display: 'inline' }} />}
          {wxAvail !== 'checking' && ` to configure`}
        </div>
      ) : !result && !transcribing ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
          >
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={handleTranscribe} style={{ flex: 1 }} disabled={wxAvail === 'checking'}>
            {engine === 'whisperX' ? <Zap size={14} /> : <Mic size={14} />}
            Transcribe Audio
          </button>
        </div>
      ) : transcribing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
          <Loader2 size={14} className="animate-spin" />
          {engine === 'whisperX' ? 'Transcribing with WhisperX… (first run downloads models)' : 'Transcribing…'}
        </div>
      ) : null}

      {error && (() => {
        const isTorchError = /Wav2Vec2|Could not import module|ModuleNotFoundError.*torch/i.test(error);
        return (
          <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px' }}>
            {isTorchError ? (
              <>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-error)', margin: '0 0 6px 0', fontWeight: 600 }}>
                  Missing dependency: PyTorch
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '0 0 8px 0' }}>
                  WhisperX needs PyTorch to run forced alignment. Click below to install the CPU version (~180 MB).
                </p>
                {wxFixing ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-primary)' }}>{wxInstallStage}</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--color-bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${wxInstallProgress}%`, background: 'var(--color-accent)', transition: 'width 0.4s ease' }} />
                    </div>
                    {wxInstallPkg && <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', margin: '4px 0 0 0' }}>{wxInstallPkg}</p>}
                  </div>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={handleFixTorch} style={{ width: '100%' }}>
                    <Download size={12} /> Install PyTorch CPU (~180 MB)
                  </button>
                )}
                <details style={{ marginTop: '8px' }}>
                  <summary style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Full error</summary>
                  <p style={{ fontSize: '0.65rem', color: 'var(--color-error)', margin: '4px 0 0 0', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</p>
                </details>
              </>
            ) : (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-error)', margin: 0, whiteSpace: 'pre-wrap' }}>{error}</p>
            )}
          </div>
        );
      })()}

      {/* Transcript */}
      {result && !collapsed && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              Transcript
              {result.language && result.language !== 'auto' && (
                <span style={{ marginLeft: '6px', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>({result.language})</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 6px', fontSize: '0.7rem', cursor: 'pointer' }}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === 'auto' ? 'Auto' : l.code.toUpperCase()}</option>)}
              </select>
              <button className="btn btn-icon btn-sm" onClick={handleCopy} title="Copy full text">
                {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
              </button>
              <button className="btn btn-icon btn-sm" onClick={handleExportSRT} title="Export SRT">
                {srtSaved ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <FileDown size={12} />}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleTranscribe}>Re-run</button>
            </div>
          </div>

          {editedSegments.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No speech detected.</p>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {editedSegments.map((seg, i) => {
                const rowBg = i % 2 !== 0 ? 'rgba(255,255,255,0.04)' : 'transparent';
                return (
                <div
                  key={i}
                  style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px', padding: '4px 6px', borderRadius: '4px', fontSize: '0.78rem', alignItems: 'start', background: rowBg }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-tertiary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = rowBg; }}
                >
                  {/* Timecodes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingTop: '2px' }}>
                    <TcSpan idx={i} field="from" value={seg.from} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', paddingLeft: '2px' }}>→</span>
                    <TcSpan idx={i} field="to" value={seg.to} />
                  </div>
                  {/* Text */}
                  {editingTextIdx === i ? (
                    <textarea
                      ref={textEditRef}
                      defaultValue={seg.text}
                      rows={2}
                      onBlur={e => commitTextEdit(i, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(i, (e.target as HTMLTextAreaElement).value); }
                        if (e.key === 'Escape') setEditingTextIdx(null);
                      }}
                      style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem', padding: '2px 6px', resize: 'none', fontFamily: 'inherit', lineHeight: '1.4' }}
                    />
                  ) : (
                    <span
                      style={{ color: 'var(--color-text-primary)', cursor: 'text', paddingTop: '2px', lineHeight: '1.4' }}
                      onClick={() => { setEditingTcIdx(null); setEditingTextIdx(i); }}
                      title="Click to edit"
                    >
                      {seg.text}
                    </span>
                  )}
                </div>
                );
              })}
            </div>
          )}
          <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            Click timecodes or text to edit · Enter to confirm · Esc to cancel
          </p>
        </div>
      )}
    </div>
  );
};
