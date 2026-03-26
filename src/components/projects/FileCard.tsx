import React from 'react';
import { FileVideo, Image as ImageIcon, Music, Folder, Trash2 } from 'lucide-react';
import type { VersionGroup, ProjectFolder } from '../../shared/types';

const TYPE_ICON: Record<string, React.ReactNode> = {
  video: <FileVideo size={18} style={{ color: '#FA4900' }} />,
  image: <ImageIcon size={18} style={{ color: '#34C759' }} />,
  audio: <Music size={18} style={{ color: '#0A84FF' }} />,
};

interface FileProps {
  group: VersionGroup;
  onDoubleClick: () => void;
  onExpandVersions?: () => void;
  onDelete?: () => void;
}

export const FileCard: React.FC<FileProps> = ({ group, onDoubleClick, onExpandVersions, onDelete }) => {
  const { latest, versions } = group;
  const hasVersions = versions.length > 1;

  return (
    <div
      onDoubleClick={onDoubleClick}
      style={{
        background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '8px', padding: '12px', cursor: 'pointer',
        transition: 'border-color 0.2s',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {TYPE_ICON[latest.type] || TYPE_ICON.video}
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {latest.name}
        </span>
        {latest.versionTag && (
          <span style={{
            background: 'var(--color-accent)', color: '#000', borderRadius: '4px',
            padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
          }}>
            {latest.versionTag.toUpperCase()}
          </span>
        )}
        <button
          className="btn btn-icon btn-sm"
          onClick={e => { e.stopPropagation(); onDelete?.(); }}
          title="Delete file"
          style={{ color: 'var(--color-text-muted)', flexShrink: 0, padding: '2px' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        <span>{latest.extension.toUpperCase()}</span>
        <span>{(latest.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
        {hasVersions && (
          <button
            onClick={e => { e.stopPropagation(); onExpandVersions?.(); }}
            style={{
              background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: '4px', padding: '1px 6px', fontSize: '0.65rem',
              color: 'var(--color-text-muted)', cursor: 'pointer', marginLeft: 'auto',
            }}
          >
            {versions.length} versions
          </button>
        )}
      </div>
    </div>
  );
};

interface FolderCardProps {
  folder: ProjectFolder;
  onClick: () => void;
  onDelete?: () => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({ folder, onClick, onDelete }) => {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onClick}
      style={{
        background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '8px', padding: '12px', cursor: 'pointer',
        transition: 'border-color 0.2s',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
    >
      <Folder size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.8125rem', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {folder.name}
      </span>
      <button
        className="btn btn-icon btn-sm"
        onClick={e => { e.stopPropagation(); onDelete?.(); }}
        title="Delete folder"
        style={{ color: 'var(--color-text-muted)', flexShrink: 0, padding: '2px' }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};
