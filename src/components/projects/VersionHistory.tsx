import React, { useState } from 'react';
import { Clock, GripVertical } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';

interface Props {
  versions: ProjectFile[];
  baseName: string;
  onSelect: (file: ProjectFile) => void;
  onReorder?: (fileId: string, newVersionNumber: number) => void;
  onMoveToGroup?: (fileId: string, targetBaseName: string) => void;
}

export const VersionHistory: React.FC<Props> = ({ versions, baseName, onSelect, onReorder, onMoveToGroup }) => {
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, file: ProjectFile, idx: number) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/versionhistory', JSON.stringify({ fileId: file.id, idx }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIdx(null);

    // Try internal reorder first
    const internalData = e.dataTransfer.getData('application/versionhistory');
    if (internalData) {
      try {
        const data = JSON.parse(internalData);
        if (data.fileId && data.idx !== targetIdx && onReorder) {
          const targetVersion = versions[targetIdx];
          onReorder(data.fileId, targetVersion.versionNumber);
        }
        return;
      } catch { /* fall through */ }
    }

    // Try external file drop (from FileGrid)
    const externalData = e.dataTransfer.getData('text/plain');
    if (externalData) {
      try {
        const data = JSON.parse(externalData);
        if (data.fileId && data.baseName?.toLowerCase() !== baseName.toLowerCase()) {
          onMoveToGroup?.(data.fileId, baseName);
        }
      } catch { /* ignore */ }
    }
  };

  const [containerDragOver, setContainerDragOver] = useState(false);

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setContainerDragOver(false);
    const externalData = e.dataTransfer.getData('text/plain');
    if (externalData) {
      try {
        const data = JSON.parse(externalData);
        if (data.fileId && data.baseName?.toLowerCase() !== baseName.toLowerCase()) {
          onMoveToGroup?.(data.fileId, baseName);
        }
      } catch { /* ignore */ }
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setContainerDragOver(true); }}
      onDragLeave={() => setContainerDragOver(false)}
      onDrop={handleContainerDrop}
      style={{
        background: 'var(--color-bg-primary)',
        border: containerDragOver ? '2px dashed var(--color-accent)' : '1px solid var(--border-color)',
        borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <Clock size={12} style={{ color: 'var(--color-text-muted)' }} />
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          Version History
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', minWidth: '100px' }}>Imported</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', minWidth: '80px' }}>By</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', minWidth: '60px', textAlign: 'right' }}>Size</span>
      </div>
      {versions.map((v, idx) => {
        const dateStr = v.addedAt
          ? new Date(v.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const author = v.addedBy
          ? (v.addedBy.length > 12 ? v.addedBy.slice(0, 12) + '…' : v.addedBy)
          : '';
        const isLatest = idx === 0;

        return (
          <div
            key={v.id}
            draggable
            onDragStart={e => handleDragStart(e, v, idx)}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(idx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={e => handleDrop(e, idx)}
            onDoubleClick={() => onSelect(v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '5px 8px', borderRadius: '4px', cursor: 'grab',
              background: dragOverIdx === idx ? 'rgba(225,255,28,0.12)' : isLatest ? 'rgba(225,255,28,0.08)' : 'transparent',
              borderTop: dragOverIdx === idx ? '2px solid var(--color-accent)' : '2px solid transparent',
            }}
          >
            <GripVertical size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: 0.4 }} />
            <span style={{
              background: isLatest ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              color: isLatest ? '#000' : 'var(--color-text-muted)',
              borderRadius: '3px', padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, minWidth: '28px', textAlign: 'center',
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
