import React, { useState } from 'react';
import { ChevronDown, GitCompare, ArrowLeft, Share2 } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';

interface Props {
  currentFile: ProjectFile;
  versions: ProjectFile[];
  onSwitchVersion: (file: ProjectFile) => void;
  onCompare: (fileA: ProjectFile, fileB: ProjectFile) => void;
  onBack: () => void;
  hideCompare?: boolean;
  onShareLink?: (url: string, mode: string) => void;
}

export const VersionBar: React.FC<Props> = ({ currentFile, versions, onSwitchVersion, onCompare, onBack, hideCompare, onShareLink }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const currentIdx = versions.findIndex(v => v.id === currentFile.id);
  const hasMultiple = versions.length > 1;

  return (
    <div className="tab-nav" style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: 'var(--spacing-xs)',
      marginBottom: '0',
      fontSize: '0.8125rem',
    }}>
      <button
        className="btn btn-secondary btn-sm"
        onClick={onBack}
        style={{ padding: '4px 8px' }}
        title="Back to project"
      >
        <ArrowLeft size={14} />
      </button>

      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Viewing:</span>

      {/* Version selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => hasMultiple && setShowDropdown(!showDropdown)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
            borderRadius: '6px', padding: '4px 10px', cursor: hasMultiple ? 'pointer' : 'default',
            color: 'var(--color-text-primary)', fontSize: '0.8125rem',
          }}
        >
          {currentFile.versionTag && (
            <span style={{
              background: 'var(--color-accent)', color: '#000', borderRadius: '3px',
              padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700,
            }}>
              {currentFile.versionTag.toUpperCase()}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
            {currentFile.name}
          </span>
          {hasMultiple && <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5 }} />}
        </button>

        {showDropdown && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
            background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
            borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            minWidth: '320px', maxHeight: '300px', overflowY: 'auto',
          }}>
            {versions.map((v, i) => (
              <div
                key={v.id}
                onClick={() => {
                  if (compareMode) {
                    setShowDropdown(false);
                    setCompareMode(false);
                    onCompare(currentFile, v);
                  } else {
                    onSwitchVersion(v);
                    setShowDropdown(false);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', cursor: 'pointer',
                  background: v.id === currentFile.id ? 'rgba(225,255,28,0.08)' : 'transparent',
                  borderBottom: i < versions.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
                onMouseEnter={e => { if (v.id !== currentFile.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (v.id !== currentFile.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  background: v.id === currentFile.id ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                  color: v.id === currentFile.id ? '#000' : 'var(--color-text-muted)',
                  borderRadius: '3px', padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700,
                  flexShrink: 0, minWidth: '28px', textAlign: 'center',
                }}>
                  {v.versionTag?.toUpperCase() || 'V0'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                  {v.name}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        {hasMultiple && `${currentIdx + 1} of ${versions.length}`}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Compare button */}
        {hasMultiple && !hideCompare && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setCompareMode(true); setShowDropdown(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
            title="Compare with another version"
          >
            <GitCompare size={13} />
            <span style={{ fontSize: '0.75rem' }}>Compare</span>
          </button>
        )}

        {/* Share button */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowShareMenu(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
            title="Share link"
          >
            <Share2 size={13} />
            <span style={{ fontSize: '0.75rem' }}>Share</span>
          </button>
          {showShareMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowShareMenu(false)} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
                background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
                borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                minWidth: '200px', overflow: 'hidden',
              }}>
                {(['internal', 'presentation'] as const).map(mode => {
                  const label = mode === 'internal' ? 'Internal Review' : 'Presentation';
                  const desc = mode === 'internal' ? 'Full access — all tools & compare' : 'View-only — feedback only';
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        const params = new URLSearchParams({
                          view: mode,
                          project: currentFile.projectId,
                          file: currentFile.id,
                        });
                        const url = `${window.location.origin}${window.location.pathname}?${params}`;
                        navigator.clipboard.writeText(url);
                        setShowShareMenu(false);
                        onShareLink?.(url, label);
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: '2px',
                        width: '100%', padding: '10px 14px', background: 'transparent',
                        border: 'none', borderBottom: mode === 'internal' ? '1px solid var(--border-color)' : 'none',
                        color: 'var(--color-text-primary)', cursor: 'pointer',
                        textAlign: 'left', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{desc}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showDropdown && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => { setShowDropdown(false); setCompareMode(false); }}
        />
      )}
    </div>
  );
};
