import React, { useState, useCallback } from 'react';
import { FolderPlus, Upload, Loader2 } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';
import { useProjectFiles } from '../../hooks/useProjectFiles';
import { ProjectBreadcrumb } from './ProjectBreadcrumb';
import { FileGrid } from './FileGrid';
import { CreateFolderModal } from './CreateFolderModal';

interface Props {
  projectId: string;
  projectName: string;
  path: string;
  breadcrumbs: { label: string; path: string | null }[];
  userId: string;
  onNavigate: (path: string) => void;
  onGoToDashboard: () => void;
  onFileOpen: (file: ProjectFile) => void;
}

export const ProjectView: React.FC<Props> = ({
  projectId, projectName, path, breadcrumbs, userId,
  onNavigate, onGoToDashboard, onFileOpen,
}) => {
  const { folders, versionGroups, loading, addFiles, createFolder } = useProjectFiles(projectId, path);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files: File[] = [];
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      files.push(e.dataTransfer.files[i]);
    }
    if (files.length === 0) return;
    setAdding(true);
    try {
      await addFiles(files, projectId, path, userId);
    } finally {
      setAdding(false);
    }
  }, [addFiles, projectId, path, userId]);

  return (
    <>
      {showCreateFolder && (
        <CreateFolderModal
          onConfirm={async (name) => { await createFolder(projectId, path, name, userId); setShowCreateFolder(false); }}
          onClose={() => setShowCreateFolder(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <ProjectBreadcrumb
          crumbs={breadcrumbs}
          projectName={projectName}
          onNavigate={onNavigate}
          onGoToDashboard={onGoToDashboard}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateFolder(true)}>
            <FolderPlus size={14} /> New Folder
          </button>
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          minHeight: '200px',
          border: isDragOver ? '2px dashed var(--color-accent)' : '2px dashed transparent',
          borderRadius: '12px',
          background: isDragOver ? 'rgba(225,255,28,0.05)' : 'transparent',
          transition: 'all 0.2s',
          padding: isDragOver ? '16px' : '0',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
            Loading...
          </div>
        ) : (
          <FileGrid
            folders={folders}
            versionGroups={versionGroups}
            onFolderClick={onNavigate}
            onFileDoubleClick={onFileOpen}
          />
        )}

        {adding && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
            <Loader2 size={14} className="animate-spin" /> Adding files...
          </div>
        )}

        {!loading && !isDragOver && folders.length === 0 && versionGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-text-muted)' }}>
            <Upload size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
            <p style={{ fontSize: '0.875rem' }}>Drag files from Google Drive Desktop</p>
            <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>or create a subfolder</p>
          </div>
        )}
      </div>
    </>
  );
};
