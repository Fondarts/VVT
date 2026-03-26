import React from 'react';
import { Clock } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';

interface Props {
  versions: ProjectFile[];
  onSelect: (file: ProjectFile) => void;
}

export const VersionHistory: React.FC<Props> = ({ versions, onSelect }) => {
  return (
    <div style={{
      background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
      borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <Clock size={12} style={{ color: 'var(--color-text-muted)' }} />
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          Version History
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', minWidth: '100px' }}>Imported</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', minWidth: '80px' }}>By</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', minWidth: '60px', textAlign: 'right' }}>Size</span>
      </div>
      {versions.map(v => {
        const dateStr = v.addedAt
          ? new Date(v.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const author = v.addedBy
          ? (v.addedBy.length > 12 ? v.addedBy.slice(0, 12) + '…' : v.addedBy)
          : '';

        return (
          <div
            key={v.id}
            onClick={() => onSelect(v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 8px', borderRadius: '4px', cursor: 'pointer',
              background: v === versions[0] ? 'rgba(225,255,28,0.08)' : 'transparent',
            }}
          >
            <span style={{
              background: v === versions[0] ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              color: v === versions[0] ? '#000' : 'var(--color-text-muted)',
              borderRadius: '3px', padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
            }}>
              {v.versionTag?.toUpperCase() || 'V0'}
            </span>
            <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.name}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: '100px' }}>
              {dateStr}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {author}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: '60px', textAlign: 'right' }}>
              {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
            </span>
          </div>
        );
      })}
    </div>
  );
};
