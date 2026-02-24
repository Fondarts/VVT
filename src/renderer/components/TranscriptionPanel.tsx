import React, { useState, useEffect } from 'react';
import { Mic, Loader2, Settings, ChevronDown, ChevronUp, Copy, Check, FileDown } from 'lucide-react';
import type { TranscriptionResult } from '../../shared/types';

interface Props {
  filePath: string;
  outputFolder: string;
  onTranscriptionDone?: (result: TranscriptionResult) => void;
  onSeek?: (timeMs: number) => void;
}

function msToTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h   = Math.floor(totalSec / 3600);
  const m   = Math.floor((totalSec % 3600) / 60);
  const s   = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 10);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}

export const TranscriptionPanel: React.FC<Props> = ({ filePath, outputFolder, onTranscriptionDone, onSeek }) => {
  const [binary, setBinary]       = useState('');
  const [model, setModel]         = useState('');
  const [configured, setConfigured] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult]           = useState<TranscriptionResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [collapsed, setCollapsed]     = useState(false);
  const [copied, setCopied]           = useState(false);
  const [srtSaved, setSrtSaved]       = useState(false);

  // Load saved paths on mount
  useEffect(() => {
    window.electronAPI.whisper.getPath().then(({ binary: b, model: m }) => {
      if (b) { setBinary(b); setConfigured(true); }
      if (m) setModel(m);
    });
  }, []);

  const handleBrowseBinary = async () => {
    const path = await window.electronAPI.dialog.openFile();
    if (path) setBinary(path);
  };

  const handleBrowseModel = async () => {
    const path = await window.electronAPI.dialog.openFile();
    if (path) setModel(path);
  };

  const handleSaveConfig = async () => {
    if (!binary || !model) return;
    await window.electronAPI.whisper.setPath(binary, model);
    setConfigured(true);
    setShowSetup(false);
  };

  const handleTranscribe = async () => {
    if (!filePath || !configured) return;
    setTranscribing(true);
    setError(null);
    setResult(null);
    try {
      const r = await window.electronAPI.whisper.transcribe(filePath, outputFolder);
      setResult(r);
      onTranscriptionDone?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportSRT = async () => {
    if (!result || result.segments.length === 0) return;
    const savePath = await window.electronAPI.dialog.saveFilePath('subtitles.srt');
    if (!savePath) return;
    await window.electronAPI.whisper.saveSRT(result.segments, savePath);
    setSrtSaved(true);
    setTimeout(() => setSrtSaved(false), 2000);
  };

  return (
    <div className="card" style={{ padding: '16px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mic size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Audio Transcription</span>
          {result && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
              {result.segments.length} segments
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {result && (
            <button className="btn btn-icon btn-sm" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setShowSetup(s => !s)}
            title="Configure Whisper"
            style={{ color: configured ? 'var(--color-success)' : 'var(--color-text-muted)' }}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Setup panel */}
      {showSetup && (
        <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
            Requires <strong>whisper.cpp</strong> binary + GGML model file.
          </p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              value={binary}
              onChange={e => setBinary(e.target.value)}
              placeholder="Path to whisper-cli.exe / main.exe"
              style={{ flex: 1, fontSize: '0.75rem', padding: '5px 8px', background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
            />
            <button className="btn btn-secondary btn-sm" onClick={handleBrowseBinary}>Browse</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Path to ggml-base.en.bin (or any model)"
              style={{ flex: 1, fontSize: '0.75rem', padding: '5px 8px', background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
            />
            <button className="btn btn-secondary btn-sm" onClick={handleBrowseModel}>Browse</button>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveConfig}
            disabled={!binary || !model}
            style={{ alignSelf: 'flex-end' }}
          >
            Save
          </button>
        </div>
      )}

      {/* Action / status row */}
      {!configured ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Click <Settings size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> to configure Whisper.
        </p>
      ) : !result && !transcribing ? (
        <button className="btn btn-secondary" onClick={handleTranscribe} style={{ width: '100%' }}>
          <Mic size={14} />
          Transcribe Audio
        </button>
      ) : transcribing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
          <Loader2 size={14} className="animate-spin" />
          Transcribing… this may take a moment
        </div>
      ) : null}

      {error && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '8px', whiteSpace: 'pre-wrap' }}>{error}</p>
      )}

      {/* Transcript */}
      {result && !collapsed && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transcript</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-icon btn-sm" onClick={handleCopy} title="Copy full text">
                {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
              </button>
              <button className="btn btn-icon btn-sm" onClick={handleExportSRT} title="Export SRT subtitles">
                {srtSaved ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <FileDown size={12} />}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleTranscribe}>
                Re-run
              </button>
            </div>
          </div>

          {result.segments.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No speech detected.</p>
          ) : (
            <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {result.segments.map((seg, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', gap: '10px', padding: '4px 6px', borderRadius: '4px', cursor: onSeek ? 'pointer' : 'default', fontSize: '0.78rem' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-tertiary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                  onClick={() => onSeek?.(seg.from)}
                >
                  <span style={{ color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: '54px' }}>
                    {msToTimecode(seg.from)}
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>{seg.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
