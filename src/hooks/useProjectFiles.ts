import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProjectFile, ProjectFolder, VersionGroup } from '../shared/types';
import {
  subscribeFiles,
  subscribeFolders,
  addProjectFile,
  createFolder as createFolderFn,
  deleteProjectFile,
  deleteFolder as deleteFolderFn,
  updateFileBaseName,
} from '../utils/projectStorage';
import { parseVersion, detectFileType, groupByVersion, isSupportedMedia } from '../utils/versionDetection';

// Global cache: files dropped in this session are kept in memory
// so double-click can open them without re-picking
const fileCache = new Map<string, File>();

function cacheKey(name: string, size: number): string {
  return `${name}_${size}`;
}

export interface UseProjectFilesReturn {
  files: ProjectFile[];
  folders: ProjectFolder[];
  versionGroups: VersionGroup[];
  loading: boolean;
  addFiles: (files: File[], projectId: string, parentPath: string, userId: string) => Promise<void>;
  createFolder: (projectId: string, parentPath: string, name: string, userId: string) => Promise<void>;
  removeFile: (fileId: string) => Promise<void>;
  removeFolder: (projectId: string, folderPath: string, folderId: string) => Promise<void>;
  moveToVersionGroup: (fileId: string, targetBaseName: string) => Promise<void>;
  getLocalFile: (pf: ProjectFile) => File | null;
}

export function useProjectFiles(projectId: string | null, parentPath: string): UseProjectFilesReturn {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setFiles([]);
      setFolders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let filesReady = false;
    let foldersReady = false;
    const checkDone = () => { if (filesReady && foldersReady) setLoading(false); };

    const unsubFiles = subscribeFiles(projectId, parentPath, (f) => {
      setFiles(f);
      filesReady = true;
      checkDone();
    });

    const unsubFolders = subscribeFolders(projectId, parentPath, (f) => {
      setFolders(f);
      foldersReady = true;
      checkDone();
    });

    return () => { unsubFiles(); unsubFolders(); };
  }, [projectId, parentPath]);

  const versionGroups = useMemo(() => groupByVersion(files), [files]);

  const addFiles = useCallback(async (
    droppedFiles: File[],
    projId: string,
    path: string,
    userId: string,
  ) => {
    for (const file of droppedFiles) {
      if (!isSupportedMedia(file.name)) continue; // skip .ini, .ds_store, etc.
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const { baseName, versionTag, versionNumber } = parseVersion(file.name);
      const type = detectFileType(file.name);

      // Cache the File object so double-click can open it later
      fileCache.set(cacheKey(file.name, file.size), file);

      await addProjectFile(projId, path, {
        name: file.name,
        baseName,
        versionTag,
        versionNumber,
        type,
        extension: ext,
        sizeBytes: file.size,
        scanResult: null,
      }, userId);
    }
  }, []);

  const createFolder = useCallback(async (
    projId: string,
    path: string,
    name: string,
    userId: string,
  ) => {
    await createFolderFn(projId, path, name, userId);
  }, []);

  const removeFile = useCallback(async (fileId: string) => {
    await deleteProjectFile(fileId);
  }, []);

  const removeFolder = useCallback(async (projId: string, folderPath: string, folderId: string) => {
    await deleteFolderFn(projId, folderPath, folderId);
  }, []);

  const moveToVersionGroup = useCallback(async (fileId: string, targetBaseName: string) => {
    await updateFileBaseName(fileId, targetBaseName);
  }, []);

  const getLocalFile = useCallback((pf: ProjectFile): File | null => {
    return fileCache.get(cacheKey(pf.name, pf.sizeBytes)) ?? null;
  }, []);

  return { files, folders, versionGroups, loading, addFiles, createFolder, removeFile, removeFolder, moveToVersionGroup, getLocalFile };
}
