import React, { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { ValidationCheck, ScanResult } from '../shared/types';

interface CheckResultsProps {
  checks: ValidationCheck[];
  noPreset?: boolean;
  scanResult?: ScanResult | null;
  presetName?: string;
}

interface RowDef {
  label: string;
  detected: string;
  checkId?: string | string[];
}

const statusIcon = (status: 'pass' | 'warn' | 'fail') => {
  if (status === 'pass') return <CheckCircle2 size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />;
  if (status === 'warn') return <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />;
  return <AlertCircle size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />;
};

export const CheckResults: React.FC<CheckResultsProps> = ({ checks, noPreset, scanResult, presetName }) => {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['container', 'video', 'audio']);

  const toggle = (key: string) =>
    setExpandedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const checkMap = new Map(checks.map(c => [c.id, c]));
  const hasPreset = !noPreset && checks.length > 0;

  const findCheck = (ids: string | string[] | undefined): ValidationCheck | undefined => {
    if (!ids) return undefined;
    const arr = Array.isArray(ids) ? ids : [ids];
    return arr.map(id => checkMap.get(id)).find(Boolean);
  };

  const renderGroup = (key: string, icon: string, label: string, rows: RowDef[]) => {
    const expanded = expandedGroups.includes(key);
    const groupChecks = rows.map(r => findCheck(r.checkId)).filter(Boolean) as ValidationCheck[];
    const groupStatus: 'pass' | 'warn' | 'fail' | null =
      !hasPreset || groupChecks.length === 0 ? null
      : groupChecks.some(c => c.status === 'fail') ? 'fail'
      : groupChecks.some(c => c.status === 'warn') ? 'warn'
      : 'pass';

    return (
      <div key={key} style={{ borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => toggle(key)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: 'transparent', border: 'none',
            color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left',
            borderBottom: expanded ? '1px solid var(--border-color)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{icon}</span>
            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{label}</span>
            {!hasPreset && <Info size={11} style={{ color: 'var(--color-text-muted)' }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {groupStatus && statusIcon(groupStatus)}
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </button>

        {expanded && (
          <div style={{ padding: '2px 16px 8px' }}>
            {rows.map(row => {
              const check = findCheck(row.checkId);
              const valueColor = !check
                ? 'var(--color-text-primary)'
                : check.status === 'pass' ? 'var(--color-success)'
                : check.status === 'warn' ? 'var(--color-warning)'
                : 'var(--color-error)';

              return (
                <div
                  key={row.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.8125rem',
                  }}
                >
                  {/* Property label */}
                  <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, width: '120px' }}>
                    {row.label}
                  </span>

                  {/* Expected column (standard) */}
                  {hasPreset && (
                    <span style={{
                      flex: 1, textAlign: 'center', fontSize: '0.72rem',
                      color: 'var(--color-text-muted)', fontStyle: 'italic',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {check?.expected ?? '—'}
                    </span>
                  )}

                  {/* Detected value */}
                  <span style={{ fontWeight: 500, color: valueColor, flexShrink: 0, textAlign: 'right' }}>
                    {row.detected}
                  </span>

                  {/* Status icon */}
                  {hasPreset && (
                    <span style={{ width: '16px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      {check ? statusIcon(check.status) : null}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!scanResult) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontSize: '0.875rem' }}>Checks</h3>
        </div>
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
          Select a standard from the dropdown to run validation checks.
        </div>
      </div>
    );
  }

  const { file, video, audio, fastStart } = scanResult;

  const groups = [
    {
      key: 'container', icon: '📦', label: 'Container',
      rows: [
        { label: 'Format',         detected: file.container.toUpperCase(),               checkId: 'container-format' },
        { label: 'Format Profile', detected: file.formatProfile ?? 'N/A' },
        { label: 'Duration',       detected: file.durationFormatted,                     checkId: 'duration' },
        { label: 'File Size',      detected: file.sizeFormatted,                         checkId: 'file-size' },
        { label: 'Fast Start',     detected: fastStart.enabled ? 'Enabled' : 'Disabled', checkId: 'fast-start' },
        { label: 'Creation Date',  detected: file.creationDate ?? 'N/A' },
      ] as RowDef[],
    },
    {
      key: 'video', icon: '🎬', label: 'Video',
      rows: [
        { label: 'Format',               detected: video.format || video.codec.toUpperCase() },
        { label: 'Format Version',       detected: video.formatVersion ?? 'N/A' },
        { label: 'Format Profile',       detected: video.profile || 'N/A' },
        { label: 'Codec',                detected: video.codec.toUpperCase(),                          checkId: 'video-codec' },
        { label: 'Codec ID',             detected: video.codecId ?? 'N/A' },
        { label: 'Resolution',           detected: `${video.width} × ${video.height}`,                checkId: ['resolution', 'aspect-ratio'] },
        { label: 'Display Aspect Ratio', detected: video.displayAspectRatio || 'N/A' },
        { label: 'Frame Rate',           detected: `${video.frameRateFormatted} fps`,                 checkId: 'frame-rate' },
        { label: 'Frame Rate Mode',      detected: video.frameRateMode || 'N/A' },
        { label: 'Bit Rate',             detected: video.bitRateFormatted,                            checkId: ['max-bitrate', 'min-bitrate'] },
        { label: 'Chroma',               detected: video.chromaSubsampling,                           checkId: 'chroma-subsampling' },
        { label: 'Scan Type',            detected: video.scanType,                                    checkId: 'scan-type' },
        { label: 'Bit Depth',            detected: video.bitDepth ? `${video.bitDepth}-bit` : 'N/A', checkId: 'bit-depth' },
        { label: 'Color Space',          detected: video.colorSpace || 'N/A',                         checkId: 'color-space' },
        { label: 'Color Range',          detected: video.colorRange || 'N/A' },
        { label: 'Color Primaries',      detected: video.colorPrimaries || 'N/A' },
      ] as RowDef[],
    },
    ...(audio ? [{
      key: 'audio', icon: '🔊', label: 'Audio',
      rows: [
        { label: 'Codec',             detected: audio.codec.toUpperCase(),                            checkId: 'audio-codec' },
        { label: 'Compression Mode',  detected: audio.compressionMode ?? 'N/A' },
        { label: 'Sample Rate',       detected: `${audio.sampleRate} Hz`,                             checkId: 'audio-sample-rate' },
        { label: 'Channels',          detected: `${audio.channels} (${audio.channelLayout})`,         checkId: 'audio-channels' },
        { label: 'Bit Depth',         detected: audio.bitDepth ? `${audio.bitDepth}-bit` : 'N/A' },
        { label: 'Loudness',          detected: audio.lufs === -99 ? 'Measuring…' : `${audio.lufs} LUFS`,       checkId: 'audio-lufs' },
        { label: 'True Peak',         detected: audio.lufs === -99 ? 'Measuring…' : `${audio.truePeak} dBTP`, checkId: 'audio-truepeak' },
      ] as RowDef[],
    }] : []),
  ];

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>Checks</h3>
        {hasPreset && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {checks.filter(c => c.status === 'pass').length} / {checks.length} passed
          </span>
        )}
      </div>

      {/* Column header row when a standard is active */}
      {hasPreset && (
        <div style={{
          display: 'flex', gap: '8px', padding: '5px 16px',
          background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid var(--border-color)',
          fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          <span style={{ width: '120px', flexShrink: 0 }}>Property</span>
          <span style={{ flex: 1, textAlign: 'center' }}>{presetName ?? 'Standard'}</span>
          <span style={{ flexShrink: 0 }}>Detected</span>
          <span style={{ width: '16px', flexShrink: 0 }} />
        </div>
      )}

      <div className="card-content" style={{ padding: 0 }}>
        {groups.map(g => renderGroup(g.key, g.icon, g.label, g.rows))}
      </div>
    </div>
  );
};
