import React, { useState } from 'react';
import type { VersionGroup, ProjectFolder, ProjectFile } from '../../shared/types';
import { FileCard, FolderCard } from './FileCard';
import { VersionHistory } from './VersionHistory';

interface Props {
  folders: ProjectFolder[];
  versionGroups: VersionGroup[];
  onFolderClick: (path: string) => void;
  onFileDoubleClick: (file: ProjectFile) => void;
}

export const FileGrid: React.FC<Props> = ({ folders, versionGroups, onFolderClick, onFileDoubleClick }) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const isEmpty = folders.length === 0 && versionGroups.length === 0;

  if (isEmpty) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-text-muted)' }}>
        <p style={{ fontSize: '0.875rem' }}>This folder is empty</p>
        <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Drag files here or create a subfolder</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Folders first */}
      {folders.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {folders.map(f => (
            <FolderCard key={f.id} folder={f} onClick={() => onFolderClick(f.path)} />
          ))}
        </div>
      )}

      {/* Files */}
      {versionGroups.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {versionGroups.map(g => (
            <React.Fragment key={g.baseName}>
              <FileCard
                group={g}
                onDoubleClick={() => onFileDoubleClick(g.latest)}
                onExpandVersions={() => setExpandedGroup(expandedGroup === g.baseName ? null : g.baseName)}
              />
              {expandedGroup === g.baseName && g.versions.length > 1 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <VersionHistory versions={g.versions} onSelect={onFileDoubleClick} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
