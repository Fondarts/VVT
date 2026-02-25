import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, Copy, Check, FileDown, AlertCircle,
  ChevronDown, ChevronUp, Play, Loader2,
} from 'lucide-react';
import type { TranscriptionResult } from '../shared/types';
import { exportSRT } from '../api/ffmpeg';
import { transcribeFile, WHISPER_MODELS, WHISPER_LANGUAGES } from '../api/whisper';
import type { WhisperModel } from '../api/whisper';

interface Props {
  result?: TranscriptionResult | null;
  onTranscriptionDone?: (result: TranscriptionResult) => void;
  onSeek?: (timeMs: number) => void;
  videoFile?: File | null;
  transcodedVideoSrc?: string;
}

interface EditableSegment { from: number; to: number; text: string }

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

// ── Component ────────────────────────────────────────────────────

export const TranscriptionPanel: React.FC<Props> = ({
  result: externalResult,
  onTranscriptionDone,
  onSeek,
  videoFile,
  transcodedVideoSrc,
}) => {
  const [internalResult, setInternalResult] = useState<TranscriptionResult | null>(null);
  const result = externalResult ?? internalResult;

  const [editedSegments, setEditedSegments] = useState<EditableSegment[]>([]);
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const [editingTcIdx, setEditingTcIdx]     = useState<number | null>(null);
  const [tcField, setTcField]       = useState<'from' | 'to'>('from');
  const [tcDraft, setTcDraft]       = useState('');
  const [collapsed, setCollapsed]   = useState(false);
  const [copied, setCopied]         = useState(false);
  const [srtSaved, setSrtSaved]     = useState(false);

  // Transcription state
  const [transcribing, setTranscribing]       = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [selectedModel, setSelectedModel]     = useState<WhisperModel>('Xenova/whisper-base');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const tcEditRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (result) {
      setEditedSegments(result.segments.map(s => ({ ...s })));
      setEditingTextIdx(null);
      setEditingTcIdx(null);
    }
  }, [result]);

  useEffect(() => { if (editingTextIdx !== null) textEditRef.current?.focus(); }, [editingTextIdx]);
  useEffect(() => { if (editingTcIdx !== null) { tcEditRef.current?.focus(); tcEditRef.current?.select(); } }, [editingTcIdx]);

  // ── Transcription ───────────────────────────────────────────────
  const handleTranscribe = async () => {
    if (!videoFile || transcribing) return;
    setTranscribing(true);
    setTranscribeProgress(0);
    setTranscribeStatus('Starting…');
    setTranscribeError(null);
    try {
      // Prefer the transcoded H.264 file (much smaller, AAC audio) when available.
      // This avoids loading a 700MB+ ProRes file into Web Audio API.
      let fileForTranscription: File = videoFile;
      if (transcodedVideoSrc) {
        try {
          setTranscribeStatus('Preparing audio…');
          const response = await fetch(transcodedVideoSrc);
          const blob = await response.blob();
          fileForTranscription = new File([blob], 'transcoded.mp4', { type: 'video/mp4' });
        } catch {
          // Fall back to original file if fetch fails
        }
      }
      const res = await transcribeFile(fileForTranscription, {
        model: selectedModel,
        language: selectedLanguage,
        onStatus: (label, progress) => {
          setTranscribeStatus(label);
          if (progress !== undefined) setTranscribeProgress(progress);
        },
      });
      setInternalResult(res);
      onTranscriptionDone?.(res);
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscribing(false);
    }
  };

  // ── Segment editing ─────────────────────────────────────────────
  const notifyParent = (segs: EditableSegment[]) => {
    if (!result) return;
    const updated: TranscriptionResult = {
      ...result,
      segments: segs,
      fullText: segs.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim(),
    };
    onTranscriptionDone?.(updated);
    setInternalResult(updated);
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

  const handleExportSRT = () => {
    if (editedSegments.length === 0) return;
    exportSRT(editedSegments);
    setSrtSaved(true); setTimeout(() => setSrtSaved(false), 2000);
  };

  // ── Timecode inline editor ──────────────────────────────────────
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
        onClick={() => onSeek ? onSeek(value) : openTcEdit(idx, field)}
        onDoubleClick={() => openTcEdit(idx, field)}
        title={onSeek ? `Seek to ${msToTimecode(value)} (double-click to edit)` : `Edit ${field} timecode`}
      >
        {msToTimecode(value)}
      </span>
    );
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="card" style={{ padding: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mic size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Audio Transcription</span>
          {result && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
              {editedSegments.length} segs
            </span>
          )}
        </div>
        {result && (
          <button className="btn btn-icon btn-sm" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
      </div>

      {/* Controls — shown when no result yet OR always for re-transcription */}
      {!result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {videoFile ? (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1', minWidth: '130px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Model</label>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value as WhisperModel)}
                    disabled={transcribing}
                    style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem', padding: '4px 6px' }}
                  >
                    {WHISPER_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label} ({m.size})</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1', minWidth: '110px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Language</label>
                  <select
                    value={selectedLanguage}
                    onChange={e => setSelectedLanguage(e.target.value)}
                    disabled={transcribing}
                    style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem', padding: '4px 6px' }}
                  >
                    {WHISPER_LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleTranscribe}
                disabled={transcribing}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', fontSize: '0.82rem' }}
              >
                {transcribing
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{transcribeStatus || 'Working…'}</>
                  : <><Play size={14} />Transcribe Audio</>
                }
              </button>

              {transcribing && transcribeProgress > 0 && transcribeProgress < 100 && (
                <div style={{ height: '3px', background: 'var(--color-bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${transcribeProgress}%`, background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
                </div>
              )}

              {transcribeError && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px' }}>
                  <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '0.73rem', color: '#ef4444' }}>{transcribeError}</span>
                </div>
              )}

              {!transcribing && !transcribeError && (
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  First run downloads {WHISPER_MODELS.find(m => m.id === selectedModel)?.size} — cached for future sessions.
                </p>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
              <AlertCircle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '1px' }} />
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                Scan a video file first to enable transcription.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Transcript display */}
      {result && !collapsed && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              Transcript
              {result.language && result.language !== 'auto' && (
                <span style={{ marginLeft: '6px', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>({result.language})</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                const rowBg = i % 2 !== 0 ? 'rgba(255,255,255,0.04)' : 'transparent';
                return (
                  <div
                    key={i}
                    style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px', padding: '4px 6px', borderRadius: '4px', fontSize: '0.78rem', alignItems: 'start', background: rowBg }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-tertiary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = rowBg; }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingTop: '2px' }}>
                      <TcSpan idx={i} field="from" value={seg.from} />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', paddingLeft: '2px' }}>→</span>
                      <TcSpan idx={i} field="to" value={seg.to} />
                    </div>
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
            Click timecodes to seek · Double-click to edit · Enter to confirm · Esc to cancel
          </p>
        </div>
      )}
    </div>
  );
};
