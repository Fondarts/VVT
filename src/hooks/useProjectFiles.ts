import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProjectFile, ProjectFolder, VersionGroup } from '../shared/types';
import {
  subscribeFiles,
  subscribeFolders,
  addProjectFile,
  createFolder as createFolderFn,
} from '../utils/projectStorage';
import { parseVersion, detectFileType, groupByVersion } from '../utils/versionDetection';

export interface UseProjectFilesReturn {
  files: ProjectFile[];
  folders: ProjectFolder[];
  versionGroups: VersionGroup[];
  loading: boolean;
  addFiles: (files: File[], projectId: string, parentPath: string, userId: string) => Promise<void>;
  createFolder: (projectId: string, parentPath: string, name: string, userId: string) => Promise<void>;
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
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const { baseName, versionTag, versionNumber } = parseVersion(file.name);
      const type = detectFileType(file.name);

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

  return { files, folders, versionGroups, loading, addFiles, createFolder };
}
