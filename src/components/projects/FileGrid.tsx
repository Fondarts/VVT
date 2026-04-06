import React, { useState, useMemo } from 'react';
import { FileVideo, Image as ImageIcon, Music, Folder, Trash2, Upload } from 'lucide-react';
import type { VersionGroup, ProjectFolder, ProjectFile } from '../../shared/types';
import { FileCard, FolderCard } from './FileCard';
import { VersionHistory } from './VersionHistory';
import { FileContextMenu, useFileContextMenu } from './FileContextMenu';

const TYPE_ICON_SM: Record<string, React.ReactNode> = {
  video: <FileVideo size={14} style={{ color: '#FA4900' }} />,
  image: <ImageIcon size={14} style={{ color: '#34C759' }} />,
  audio: <Music size={14} style={{ color: '#0A84FF' }} />,
};

type SortMode = 'name' | 'date-asc' | 'date-desc';

interface Props {
  folders: ProjectFolder[];
  versionGroups: VersionGroup[];
  viewMode: 'grid' | 'list';
  onFolderClick: (path: string) => void;
  onFileDoubleClick: (file: ProjectFile) => void;
  onDeleteFolder?: (folder: ProjectFolder) => void;
  onDeleteFile?: (file: ProjectFile) => void;
  onMoveToVersion?: (fileId: string, targetBaseName: string) => void;
  onReorderVersion?: (fileId: string, newVersionNumber: number) => void;
  sortMode?: SortMode;
  driveToken?: string | null;
}

export const FileGrid: React.FC<Props> = ({ folders, versionGroups, viewMode, onFolderClick, onFileDoubleClick, onDeleteFolder, onDeleteFile, onMoveToVersion, onReorderVersion, sortMode = 'name', driveToken }) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const { menu, onContextMenu, closeMenu } = useFileContextMenu();

  const sortedFolders = useMemo(() => {
    const arr = [...folders];
    if (sortMode === 'date-desc') return arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (sortMode === 'date-asc') return arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return arr.sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, sortMode]);

  const sortedGroups = useMemo(() => {
    const arr = [...versionGroups];
    if (sortMode === 'date-desc') return arr.sort((a, b) => (b.latest.addedAt || '').localeCompare(a.latest.addedAt || ''));
    if (sortMode === 'date-asc') return arr.sort((a, b) => (a.latest.addedAt || '').localeCompare(b.latest.addedAt || ''));
    return arr.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }, [versionGroups, sortMode]);

  const isEmpty = sortedFolders.length === 0 && sortedGroups.length === 0;

  // Drag handlers for file rows
  const handleDragStart = (e: React.DragEvent, fileId: string, baseName: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ fileId, baseName }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnGroup = (e: React.DragEvent, targetBaseName: string) => {
    e.preventDefault();
    setDropTarget(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.fileId && data.baseName.toLowerCase() !== targetBaseName.toLowerCase()) {
        onMoveToVersion?.(data.fileId, targetBaseName);
      }
    } catch { /* ignore */ }
  };

  const handleDragOverGroup = (e: React.DragEvent, baseName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(baseName);
  };

  if (isEmpty) {
    return (
      <div className="empty-state">
        <Upload size={40} className="empty-state-icon" />
        <div className="empty-state-title">This folder is empty</div>
        <div className="empty-state-desc">Drag & drop files here or use the + button to upload videos and images.</div>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div style={{
        background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '10px', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '8px 16px', borderBottom: '1px solid var(--border-color)',
          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--color-text-muted)',
        }}>
          <span style={{ width: '18px', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ minWidth: '60px', flexShrink: 0 }}>Type</span>
          <span style={{ minWidth: '80px', flexShrink: 0 }}>Size</span>
          <span style={{ minWidth: '60px', flexShrink: 0 }}>Version</span>
          <span style={{ width: '32px', flexShrink: 0 }} />
        </div>

        {/* Folders */}
        {sortedFolders.map(f => (
          <div
            key={f.id}
            onClick={() => onFolderClick(f.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 16px', cursor: 'pointer',
              borderBottom: '1px solid var(--border-color)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Folder size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.name}
            </span>
            <span style={{ minWidth: '60px', flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Folder</span>
            <span style={{ minWidth: '80px', flexShrink: 0 }} />
            <span style={{ minWidth: '60px', flexShrink: 0 }} />
            <button
              className="btn btn-icon btn-sm"
              onClick={e => { e.stopPropagation(); onDeleteFolder?.(f); }}
              title="Delete folder"
              style={{ color: 'var(--color-text-muted)', flexShrink: 0, width: '32px' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {/* Files */}
        {sortedGroups.map(g => (
          <React.Fragment key={g.baseName}>
            <div
              draggable
              onDragStart={e => handleDragStart(e, g.latest.id, g.baseName)}
              onDragOver={e => g.versions.length > 0 ? handleDragOverGroup(e, g.baseName) : undefined}
              onDragLeave={() => setDropTarget(null)}
              onDrop={e => handleDropOnGroup(e, g.latest.baseName)}
              onDoubleClick={() => onFileDoubleClick(g.latest)}
              onContextMenu={e => onContextMenu(e, g.latest)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '8px 16px', cursor: 'grab',
                borderBottom: '1px solid var(--border-color)',
                transition: 'background 0.15s',
                background: dropTarget === g.baseName ? 'rgba(225,255,28,0.1)' : 'transparent',
                outline: dropTarget === g.baseName ? '2px dashed var(--color-accent)' : 'none',
                outlineOffset: '-2px',
              }}
              onMouseEnter={e => { if (!dropTarget) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (!dropTarget) e.currentTarget.style.background = 'transparent'; }}
            >
              {TYPE_ICON_SM[g.latest.type] || TYPE_ICON_SM.video}
              <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.latest.name}
              </span>
              <span style={{ minWidth: '60px', flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                {g.latest.extension.toUpperCase()}
              </span>
              <span style={{ minWidth: '80px', flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                {(g.latest.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </span>
              <span style={{ minWidth: '60px', flexShrink: 0 }}>
                {g.latest.versionTag ? (
                  <span style={{
                    background: 'var(--color-accent)', color: '#000', borderRadius: '4px',
                    padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700,
                  }}>
                    {g.latest.versionTag.toUpperCase()}
                  </span>
                ) : null}
                {g.versions.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedGroup(expandedGroup === g.baseName ? null : g.baseName); }}
                    style={{
                      background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
                      borderRadius: '4px', padding: '1px 6px', fontSize: '0.65rem',
                      color: 'var(--color-text-muted)', cursor: 'pointer', marginLeft: '4px',
                    }}
                  >
                    {g.versions.length}
                  </button>
                )}
              </span>
              <button
                className="btn btn-icon btn-sm"
                onClick={e => { e.stopPropagation(); onDeleteFile?.(g.latest); }}
                title="Delete file"
                style={{ color: 'var(--color-text-muted)', flexShrink: 0, width: '32px' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {expandedGroup === g.baseName && g.versions.length > 1 && (
              <div
                onDragOver={e => handleDragOverGroup(e, g.baseName)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={e => handleDropOnGroup(e, g.latest.baseName)}
                style={{
                  padding: '8px 16px 8px 44px',
                  borderBottom: '1px solid var(--border-color)',
                  background: dropTarget === g.baseName ? 'rgba(225,255,28,0.08)' : 'rgba(255,255,255,0.01)',
                }}
              >
                <VersionHistory versions={g.versions} baseName={g.latest.baseName} onSelect={onFileDoubleClick} onReorder={onReorderVersion} onMoveToGroup={onMoveToVersion} />
              </div>
            )}
          </React.Fragment>
        ))}
        {menu && <FileContextMenu file={menu.file} x={menu.x} y={menu.y} onClose={closeMenu} driveToken={driveToken} />}
      </div>
    );
  }

  // Grid mode
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {sortedFolders.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {sortedFolders.map(f => (
            <FolderCard key={f.id} folder={f} onClick={() => onFolderClick(f.path)} onDelete={() => onDeleteFolder?.(f)} />
          ))}
        </div>
      )}

      {sortedGroups.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {sortedGroups.map(g => (
            <React.Fragment key={g.baseName}>
              <div
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(g.baseName); }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={e => handleDropOnGroup(e, g.latest.baseName)}
                onContextMenu={e => onContextMenu(e, g.latest)}
                style={{
                  outline: dropTarget === g.baseName ? '2px dashed var(--color-accent)' : 'none',
                  borderRadius: '8px',
                }}
              >
                <FileCard
                  group={g}
                  draggable
                  onDragStart={e => handleDragStart(e, g.latest.id, g.baseName)}
                  onDoubleClick={() => onFileDoubleClick(g.latest)}
                  onExpandVersions={() => setExpandedGroup(expandedGroup === g.baseName ? null : g.baseName)}
                  onDelete={() => onDeleteFile?.(g.latest)}
                />
              </div>
              {expandedGroup === g.baseName && g.versions.length > 1 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    outline: dropTarget === g.baseName ? '2px dashed var(--color-accent)' : 'none',
                    borderRadius: '8px',
                  }}
                  onDragOver={e => handleDragOverGroup(e, g.baseName)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => handleDropOnGroup(e, g.latest.baseName)}
                >
                  <VersionHistory versions={g.versions} baseName={g.latest.baseName} onSelect={onFileDoubleClick} onReorder={onReorderVersion} onMoveToGroup={onMoveToVersion} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      {menu && <FileContextMenu file={menu.file} x={menu.x} y={menu.y} onClose={closeMenu} driveToken={driveToken} />}
    </div>
  );
};
