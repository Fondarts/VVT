import { useState, useEffect, useCallback } from 'react';
import {
  isHelperAvailable,
  pickDirectoryViaHelper,
  findFileViaHelper,
  getServeFileUrl,
} from '../utils/helperFileAccess';

const STORAGE_KEY = 'kissd-helper-rootDir';

export interface UseHelperDirectoryReturn {
  /** Helper server is running */
  available: boolean;
  /** A root directory is connected */
  connected: boolean;
  /** Path of connected directory */
  directoryPath: string | null;
  /** Directory name (last segment) */
  directoryName: string | null;
  /** Prompt user to pick a directory */
  connectDirectory: () => Promise<void>;
  /** Find a file and return a streamable URL, or null */
  resolveFileUrl: (fileName: string) => Promise<string | null>;
}

export function useHelperDirectory(): UseHelperDirectoryReturn {
  const [available, setAvailable] = useState(false);
  const [directoryPath, setDirectoryPath] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    isHelperAvailable().then(setAvailable);
  }, []);

  const connected = available && !!directoryPath;
  const directoryName = directoryPath ? directoryPath.split(/[\\/]/).filter(Boolean).pop() ?? directoryPath : null;

  const connectDirectory = useCallback(async () => {
    const picked = await pickDirectoryViaHelper('Select your Drive folder');
    if (picked) {
      setDirectoryPath(picked);
      localStorage.setItem(STORAGE_KEY, picked);
    }
  }, []);

  const resolveFileUrl = useCallback(async (fileName: string): Promise<string | null> => {
    if (!directoryPath || !available) return null;
    const filePath = await findFileViaHelper(directoryPath, fileName);
    if (!filePath) return null;
    return getServeFileUrl(filePath);
  }, [directoryPath, available]);

  return { available, connected, directoryPath, directoryName, connectDirectory, resolveFileUrl };
}
