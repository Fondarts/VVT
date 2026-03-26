import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProjectFile, ProjectFolder, VersionGroup } from '../shared/types';
import {
  subscribeFiles,
  subscribeFolders,
  addProjectFile,
  createFolder as createFolderFn,
  deleteProjectFile,
  deleteFolder as deleteFolderFn,
  updateFileVersionGroup,
  updateFileVersionNumber,
} from '../utils/projectStorage';
import { parseVersion, detectFileType, groupByVersion, isSupportedMedia } from '../utils/versionDetection';
import { cacheFile, getCachedFile } from '../utils/fileCache';
import { findDriveFile, downloadDriveFile } from '../utils/driveApi';

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
  reorderVersion: (fileId: string, newVersionNumber: number) => Promise<void>;
  /** Get file from memory cache (sync) */
  getLocalFile: (pf: ProjectFile) => File | null;
  /** Get file from memory cache or OPFS persistent cache */
  resolveLocalFile: (pf: ProjectFile) => Promise<File | null>;
}

export function useProjectFiles(
  projectId: string | null,
  parentPath: string,
  driveToken?: string | null,
): UseProjectFilesReturn {
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

      // Cache in memory + OPFS
      fileCache.set(cacheKey(file.name, file.size), file);
      cacheFile(file).catch(() => {});

      // Try to find the Drive file ID for cross-team access
      let driveFileId: string | undefined;
      if (driveToken) {
        try {
          const driveFile = await findDriveFile(driveToken, file.name);
          if (driveFile) driveFileId = driveFile.id;
        } catch { /* ignore */ }
      }

      await addProjectFile(projId, path, {
        name: file.name,
        baseName,
        versionTag,
        versionNumber,
        type,
        extension: ext,
        sizeBytes: file.size,
        scanResult: null,
        driveFileId,
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
    // Find the file to get its name and re-parse its version
    const file = files.find(f => f.id === fileId);
    if (file) {
      const { versionTag, versionNumber } = parseVersion(file.name);
      await updateFileVersionGroup(fileId, targetBaseName, versionTag, versionNumber);
    } else {
      // Fallback: just update baseName
      await updateFileVersionGroup(fileId, targetBaseName, null, 0);
    }
  }, [files]);

  const getLocalFile = useCallback((pf: ProjectFile): File | null => {
    return fileCache.get(cacheKey(pf.name, pf.sizeBytes)) ?? null;
  }, []);

  const resolveLocalFile = useCallback(async (pf: ProjectFile): Promise<File | null> => {
    // 1. Memory cache (instant)
    const cached = fileCache.get(cacheKey(pf.name, pf.sizeBytes));
    if (cached) return cached;
    // 2. OPFS persistent cache (survives refresh, same machine)
    const opfs = await getCachedFile(pf.name, pf.sizeBytes);
    if (opfs) {
      fileCache.set(cacheKey(pf.name, pf.sizeBytes), opfs);
      return opfs;
    }
    // 3. Google Drive API (works cross-team if driveFileId saved)
    if (driveToken && pf.driveFileId) {
      try {
        const blob = await downloadDriveFile(driveToken, pf.driveFileId);
        const file = new File([blob], pf.name, { type: blob.type });
        fileCache.set(cacheKey(pf.name, pf.sizeBytes), file);
        cacheFile(file).catch(() => {}); // cache in OPFS for next time
        return file;
      } catch (e) {
        console.warn('[resolveLocalFile] Drive download failed:', e);
      }
    }
    return null;
  }, [driveToken]);

  const reorderVersion = useCallback(async (fileId: string, newVersionNumber: number) => {
    await updateFileVersionNumber(fileId, newVersionNumber);
  }, []);

  return { files, folders, versionGroups, loading, addFiles, createFolder, removeFile, removeFolder, moveToVersionGroup, reorderVersion, getLocalFile, resolveLocalFile };
}
