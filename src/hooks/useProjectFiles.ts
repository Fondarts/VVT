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
import { findDriveFile, getDriveStreamUrl, getDriveFileParents, listDriveFolderFiles } from '../utils/driveApi';
import { updateFileDriveId } from '../utils/projectStorage';
import { logger } from '../utils/logger';

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
  addFiles: (files: File[], projectId: string, parentPath: string, userId: string, userName?: string) => Promise<void>;
  createFolder: (projectId: string, parentPath: string, name: string, userId: string) => Promise<void>;
  removeFile: (fileId: string) => Promise<void>;
  removeFolder: (projectId: string, folderPath: string, folderId: string) => Promise<void>;
  moveToVersionGroup: (fileId: string, targetBaseName: string) => Promise<void>;
  reorderVersion: (fileId: string, newVersionNumber: number) => Promise<void>;
  /** Get file from memory cache (sync) */
  getLocalFile: (pf: ProjectFile) => File | null;
  /** Resolve file: memory → OPFS → Drive stream URL */
  resolveLocalFile: (pf: ProjectFile) => Promise<{ file: File } | { streamUrl: string } | null>;
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

  // ── Auto-sync: discover new files from Google Drive folder ──
  useEffect(() => {
    if (!projectId || !driveToken || loading || files.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        // 1. Find Drive folder ID — try stored value first, then discover from files
        let driveFolderId: string | undefined;

        // Check if any subfolder has driveFolderId (for nested syncs)
        const folderWithDriveId = folders.find(f => f.driveFolderId);
        if (folderWithDriveId) driveFolderId = folderWithDriveId.driveFolderId;

        if (!driveFolderId) {
          // Find an anchor file that already has driveFileId
          let anchorDriveFileId = files.find(f => f.driveFileId)?.driveFileId;

          // Backfill: if no file has driveFileId, search Drive by name
          if (!anchorDriveFileId) {
            for (const f of files) {
              if (cancelled) return;
              const found = await findDriveFile(driveToken, f.name);
              if (found) {
                anchorDriveFileId = found.id;
                updateFileDriveId(f.id, found.id).catch(() => {});
                break;
              }
            }
          }

          if (!anchorDriveFileId || cancelled) return;

          // Get parent folder from Drive
          const parents = await getDriveFileParents(driveToken, anchorDriveFileId);
          if (cancelled || parents.length === 0) return;
          driveFolderId = parents[0];

          // Persist driveFolderId on the current ProjectFolder for future syncs
          // Note: folders state contains subfolders, so we need to find by path
          // We query Firestore directly since the current folder isn't in the subfolders list
        }

        if (!driveFolderId || cancelled) return;

        // List all files in the Drive folder
        const driveFiles = await listDriveFolderFiles(driveToken, driveFolderId);
        if (cancelled) return;

        // Find files in Drive but not in Firestore
        const existingNames = new Set(files.map(f => f.name));
        const newDriveFiles = driveFiles.filter(df =>
          !existingNames.has(df.name) && isSupportedMedia(df.name)
        );

        if (newDriveFiles.length === 0) return;

        // Add new files to Firestore (metadata only — downloaded on open)
        for (const df of newDriveFiles) {
          if (cancelled) return;
          const ext = df.name.split('.').pop()?.toLowerCase() ?? '';
          const { baseName, versionTag, versionNumber } = parseVersion(df.name);
          const type = detectFileType(df.name);
          const sizeBytes = df.size ? parseInt(df.size, 10) : 0;

          await addProjectFile(projectId, parentPath, {
            name: df.name,
            baseName,
            versionTag,
            versionNumber,
            type,
            extension: ext,
            sizeBytes,
            scanResult: null,
            driveFileId: df.id,
            driveCreatedTime: df.createdTime,
            driveWidth: df.width,
            driveHeight: df.height,
            driveDurationMs: df.durationMs,
          }, 'system', df.ownerName);
        }
      } catch (err) {
        logger.warn('[DriveSync] Auto-sync failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, parentPath, driveToken, loading]);

  const addFiles = useCallback(async (
    droppedFiles: File[],
    projId: string,
    path: string,
    userId: string,
    userName?: string,
  ) => {
    for (const file of droppedFiles) {
      if (!isSupportedMedia(file.name)) continue; // skip .ini, .ds_store, etc.
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const { baseName, versionTag, versionNumber } = parseVersion(file.name);
      const type = detectFileType(file.name);

      // Cache in memory + OPFS
      fileCache.set(cacheKey(file.name, file.size), file);
      cacheFile(file).catch(() => {});

      // Try to find Drive metadata (owner, dates, dimensions, duration)
      let driveFileId: string | undefined;
      let ownerName: string | undefined;
      let driveCreatedTime: string | undefined;
      let driveWidth: number | undefined;
      let driveHeight: number | undefined;
      let driveDurationMs: number | undefined;
      if (driveToken) {
        try {
          const driveFile = await findDriveFile(driveToken, file.name);
          if (driveFile) {
            driveFileId = driveFile.id;
            ownerName = driveFile.ownerName;
            driveCreatedTime = driveFile.createdTime;
            driveWidth = driveFile.width;
            driveHeight = driveFile.height;
            driveDurationMs = driveFile.durationMs;
          }
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
        driveCreatedTime,
        driveWidth,
        driveHeight,
        driveDurationMs,
      }, userId, ownerName || userName);
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

  const resolveLocalFile = useCallback(async (pf: ProjectFile): Promise<{ file: File } | { streamUrl: string } | null> => {
    // 1. Memory cache (instant)
    const cached = fileCache.get(cacheKey(pf.name, pf.sizeBytes));
    if (cached) return { file: cached };
    // 2. OPFS persistent cache (survives refresh, same machine)
    const opfs = await getCachedFile(pf.name, pf.sizeBytes);
    if (opfs) {
      fileCache.set(cacheKey(pf.name, pf.sizeBytes), opfs);
      return { file: opfs };
    }
    // 3. Google Drive streaming via helper proxy (no download needed)
    if (driveToken && pf.driveFileId) {
      return { streamUrl: getDriveStreamUrl(driveToken, pf.driveFileId) };
    }
    return null;
  }, [driveToken]);

  const reorderVersion = useCallback(async (fileId: string, newVersionNumber: number) => {
    await updateFileVersionNumber(fileId, newVersionNumber);
  }, []);

  return { files, folders, versionGroups, loading, addFiles, createFolder, removeFile, removeFolder, moveToVersionGroup, reorderVersion, getLocalFile, resolveLocalFile };
}
