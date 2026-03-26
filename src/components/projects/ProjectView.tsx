import React, { useState, useCallback } from 'react';
import { FolderPlus, Upload, Loader2, LayoutGrid, List, HardDrive, Check } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';
import { useProjectFiles } from '../../hooks/useProjectFiles';
import { useDirectoryAccess } from '../../hooks/useDirectoryAccess';
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
  onFileOpen: (file: File, ctx?: { currentFile: ProjectFile; versions: ProjectFile[]; getLocalFile: (pf: ProjectFile) => File | null }) => void;
}

export const ProjectView: React.FC<Props> = ({
  projectId, projectName, path, breadcrumbs, userId,
  onNavigate, onGoToDashboard, onFileOpen,
}) => {
  const dirAccess = useDirectoryAccess();
  const { folders, versionGroups, loading, addFiles, createFolder, removeFile, removeFolder, moveToVersionGroup, reorderVersion, getLocalFile, resolveLocalFile } = useProjectFiles(projectId, path, dirAccess.resolveFile);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(() => (localStorage.getItem('projectViewMode') as 'grid' | 'list') || 'grid');
  const setViewMode = (m: 'grid' | 'list') => { setViewModeState(m); localStorage.setItem('projectViewMode', m); };

  // Read ALL entries from a directory (readEntries can return batches)
  const readAllEntries = useCallback(async (dirReader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
    const all: FileSystemEntry[] = [];
    let batch: FileSystemEntry[];
    do {
      batch = await new Promise<FileSystemEntry[]>((res, rej) => dirReader.readEntries(res, rej));
      all.push(...batch);
    } while (batch.length > 0);
    return all;
  }, []);

  // Recursively process a directory: create folders in Firestore and add files
  const processDirectory = useCallback(async (dirEntry: FileSystemDirectoryEntry, parentPath: string) => {
    const children = await readAllEntries(dirEntry.createReader());
    for (const child of children) {
      if (child.isFile) {
        const file = await new Promise<File>((res, rej) => (child as FileSystemFileEntry).file(res, rej));
        await addFiles([file], projectId, parentPath, userId);
      } else if (child.isDirectory) {
        const subPath = parentPath === '/' ? `/${child.name}` : `${parentPath}/${child.name}`;
        await createFolder(projectId, parentPath, child.name, userId);
        await processDirectory(child as FileSystemDirectoryEntry, subPath);
      }
    }
  }, [addFiles, createFolder, readAllEntries, projectId, userId]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setAdding(true);

    try {
      const items = e.dataTransfer.items;
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      if (entries.length > 0) {
        for (const entry of entries) {
          if (entry.isDirectory) {
            const folderPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
            await createFolder(projectId, path, entry.name, userId);
            await processDirectory(entry as FileSystemDirectoryEntry, folderPath);
          } else {
            const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
            await addFiles([file], projectId, path, userId);
          }
        }
      } else {
        // Fallback for browsers without webkitGetAsEntry
        const files: File[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          files.push(e.dataTransfer.files[i]);
        }
        if (files.length > 0) await addFiles(files, projectId, path, userId);
      }
    } finally {
      setAdding(false);
    }
  }, [addFiles, createFolder, processDirectory, projectId, path, userId]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '4px 8px' }}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '4px 8px' }}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
          {dirAccess.supported && (
            <button
              className={`btn btn-sm ${dirAccess.connected ? 'btn-secondary' : 'btn-primary'}`}
              onClick={dirAccess.connectDirectory}
              title={dirAccess.connected ? `Connected: ${dirAccess.directoryName}` : 'Connect a local folder for direct file access'}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
            >
              {dirAccess.connected ? <Check size={13} /> : <HardDrive size={13} />}
              <span style={{ fontSize: '0.75rem' }}>{dirAccess.connected ? dirAccess.directoryName : 'Connect Drive'}</span>
            </button>
          )}
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
            viewMode={viewMode}
            onFolderClick={onNavigate}
            onDeleteFolder={(folder) => {
              if (window.confirm(`Delete folder "${folder.name}" and all its contents?`)) {
                removeFolder(projectId, folder.path, folder.id);
              }
            }}
            onDeleteFile={(file) => {
              if (window.confirm(`Delete "${file.name}"?`)) {
                removeFile(file.id);
              }
            }}
            onMoveToVersion={(fileId, targetBaseName) => moveToVersionGroup(fileId, targetBaseName)}
            onReorderVersion={(fileId, newVersionNumber) => reorderVersion(fileId, newVersionNumber)}
            onFileDoubleClick={async (pf) => {
              const group = versionGroups.find(g =>
                g.versions.some(v => v.id === pf.id)
              );
              const ctx = group ? { currentFile: pf, versions: group.versions, getLocalFile } : undefined;

              // Try memory cache first, then directory access
              const resolved = await resolveLocalFile(pf);
              if (resolved) {
                onFileOpen(resolved, ctx);
              } else {
                // Last resort: file picker
                const input = document.createElement('input');
                input.type = 'file'; input.accept = 'video/*,image/*,audio/*';
                input.onchange = () => {
                  const f = input.files?.[0];
                  if (f) onFileOpen(f, ctx);
                };
                input.click();
              }
            }}
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
