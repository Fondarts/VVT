import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { ValidationCheck, ScanResult } from '../../shared/types';

interface CheckResultsProps {
  checks: ValidationCheck[];
  noPreset?: boolean;
  scanResult?: ScanResult | null;
}

const categoryIcons: Record<string, string> = {
  container: '📦',
  video: '🎬',
  audio: '🔊',
};

const categoryLabels: Record<string, string> = {
  container: 'Container',
  video: 'Video',
  audio: 'Audio',
};

const statusIcons = {
  pass: <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />,
  warn: <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />,
  fail: <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  fontSize: '0.8125rem',
};

interface InfoRowProps { label: string; value: React.ReactNode }
const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div style={rowStyle}>
    <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
);

export const CheckResults: React.FC<CheckResultsProps> = ({ checks, noPreset, scanResult }) => {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['video', 'audio', 'container']);
  const [expandedInfoGroups, setExpandedInfoGroups] = useState<string[]>(['container', 'video', 'audio']);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const toggleInfoGroup = (group: string) => {
    setExpandedInfoGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  const checksByCategory = checks.reduce((acc, check) => {
    if (!acc[check.category]) acc[check.category] = [];
    acc[check.category].push(check);
    return acc;
  }, {} as Record<string, ValidationCheck[]>);

  const getCategoryStatus = (categoryChecks: ValidationCheck[]) => {
    if (categoryChecks.some(c => c.status === 'fail')) return 'fail';
    if (categoryChecks.some(c => c.status === 'warn')) return 'warn';
    return 'pass';
  };

  const groupHeaderStyle = (group: string): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    borderBottom: '1px solid var(--border-color)',
  });

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>Checks</h3>
        {!noPreset && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {checks.filter(c => c.status === 'pass').length} / {checks.length} passed
          </span>
        )}
      </div>

      <div className="card-content" style={{ padding: 0 }}>
        {/* ── NO PRESET: show raw detected properties ── */}
        {noPreset && scanResult && (() => {
          const groups = [
            {
              key: 'container',
              label: 'Container',
              icon: '📦',
              rows: [
                { label: 'Format', value: scanResult.file.container.toUpperCase() },
                { label: 'Duration', value: scanResult.file.durationFormatted },
                { label: 'File Size', value: scanResult.file.sizeFormatted },
                { label: 'Fast Start', value: scanResult.fastStart.enabled ? 'Enabled' : 'Disabled' },
              ],
            },
            {
              key: 'video',
              label: 'Video',
              icon: '🎬',
              rows: [
                { label: 'Codec', value: scanResult.video.codec.toUpperCase() },
                { label: 'Profile', value: scanResult.video.profile || 'N/A' },
                { label: 'Resolution', value: `${scanResult.video.width} × ${scanResult.video.height}` },
                { label: 'Frame Rate', value: `${scanResult.video.frameRateFormatted} fps` },
                { label: 'Bit Rate', value: scanResult.video.bitRateFormatted },
                { label: 'Chroma', value: scanResult.video.chromaSubsampling },
                { label: 'Scan Type', value: scanResult.video.scanType },
                { label: 'Color Space', value: scanResult.video.colorSpace || 'N/A' },
                { label: 'Color Range', value: scanResult.video.colorRange || 'N/A' },
                { label: 'Color Primaries', value: scanResult.video.colorPrimaries || 'N/A' },
              ],
            },
            ...(scanResult.audio ? [{
              key: 'audio',
              label: 'Audio',
              icon: '🔊',
              rows: [
                { label: 'Codec', value: scanResult.audio!.codec.toUpperCase() },
                { label: 'Sample Rate', value: `${scanResult.audio!.sampleRate} Hz` },
                { label: 'Channels', value: `${scanResult.audio!.channels} (${scanResult.audio!.channelLayout})` },
                { label: 'Bit Depth', value: scanResult.audio!.bitDepth ? `${scanResult.audio!.bitDepth}-bit` : 'N/A' },
                { label: 'Loudness', value: `${scanResult.audio!.lufs} LUFS` },
                { label: 'True Peak', value: `${scanResult.audio!.truePeak} dBTP` },
              ],
            }] : []),
          ];

          return groups.map(group => {
            const expanded = expandedInfoGroups.includes(group.key);
            return (
              <div key={group.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <button style={groupHeaderStyle(group.key)} onClick={() => toggleInfoGroup(group.key)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{group.icon}</span>
                    <span>{group.label}</span>
                    <Info size={12} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {expanded && (
                  <div style={{ padding: '4px 16px 12px' }}>
                    {group.rows.map(r => <InfoRow key={r.label} label={r.label} value={r.value} />)}
                  </div>
                )}
              </div>
            );
          });
        })()}

        {/* ── NO PRESET and no scan result ── */}
        {noPreset && !scanResult && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
            Select a standard from the dropdown to run validation checks.
          </div>
        )}

        {/* ── WITH PRESET: show validation results ── */}
        {!noPreset && Object.entries(checksByCategory).map(([category, categoryChecks]) => {
          const isExpanded = expandedCategories.includes(category);
          const categoryStatus = getCategoryStatus(categoryChecks);

          return (
            <div key={category} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <button
                onClick={() => toggleCategory(category)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1rem' }}>{categoryIcons[category]}</span>
                  <span>{categoryLabels[category]}</span>
                  <span style={{ color: '#666', fontWeight: 400 }}>
                    {categoryChecks.length} checks
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {statusIcons[categoryStatus]}
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {isExpanded && (
                <div style={{ padding: '0 16px 12px' }}>
                  {categoryChecks.map(check => (
                    <div
                      key={check.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '10px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div style={{ marginTop: '2px' }}>
                        {statusIcons[check.status]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: '2px' }}>
                          {check.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                          {check.message}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                          <span>
                            <strong>Expected:</strong>{' '}
                            <span style={{ color: 'var(--color-text-secondary)' }}>
                              {check.expected || 'N/A'}
                            </span>
                          </span>
                          <span>
                            <strong>Detected:</strong>{' '}
                            <span style={{
                              color: check.status === 'pass'
                                ? 'var(--color-success)'
                                : check.status === 'warn'
                                ? 'var(--color-warning)'
                                : 'var(--color-error)'
                            }}>
                              {check.detected}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
