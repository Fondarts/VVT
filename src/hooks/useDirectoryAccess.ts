import { useState, useEffect, useCallback } from 'react';
import {
  loadDirectoryHandle,
  verifyPermission,
  pickDirectory,
  findFileInDirectory,
  isFileSystemAccessSupported,
} from '../utils/directoryAccess';

export interface UseDirectoryAccessReturn {
  /** Whether File System Access API is supported */
  supported: boolean;
  /** Whether a root directory is connected and accessible */
  connected: boolean;
  /** Name of the connected directory */
  directoryName: string | null;
  /** Prompt user to pick a root directory */
  connectDirectory: () => Promise<void>;
  /** Find a file by name+size in the connected directory tree */
  resolveFile: (fileName: string, fileSize: number) => Promise<File | null>;
}

export function useDirectoryAccess(): UseDirectoryAccessReturn {
  const supported = isFileSystemAccessSupported();
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [connected, setConnected] = useState(false);
  const [directoryName, setDirectoryName] = useState<string | null>(null);

  // Try to restore saved handle on mount
  useEffect(() => {
    if (!supported) return;
    (async () => {
      const saved = await loadDirectoryHandle();
      if (saved && await verifyPermission(saved)) {
        setHandle(saved);
        setConnected(true);
        setDirectoryName(saved.name);
      }
    })();
  }, [supported]);

  const connectDirectory = useCallback(async () => {
    const picked = await pickDirectory();
    if (picked) {
      setHandle(picked);
      setConnected(true);
      setDirectoryName(picked.name);
    }
  }, []);

  const resolveFile = useCallback(async (fileName: string, fileSize: number): Promise<File | null> => {
    if (!handle) return null;
    // Re-verify permission (may have been revoked)
    if (!await verifyPermission(handle)) {
      setConnected(false);
      return null;
    }
    return findFileInDirectory(handle, fileName, fileSize);
  }, [handle]);

  return { supported, connected, directoryName, connectDirectory, resolveFile };
}
