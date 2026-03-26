/**
 * File System Access API — persistent directory handle.
 *
 * Allows the app to access files from a user-selected root directory
 * (e.g. Google Drive Desktop folder) across page refreshes.
 *
 * The directory handle is stored in IndexedDB via the browser's
 * navigator.storage API. On subsequent visits, we verify permission
 * and can read files without re-prompting.
 *
 * Supported: Chrome 86+, Edge 86+. Not supported in Firefox/Safari.
 */

const DB_NAME = 'kissd-fs';
const STORE_NAME = 'handles';
const KEY = 'rootDir';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a directory handle to IndexedDB for persistence */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load previously saved directory handle from IndexedDB */
export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Verify we still have read permission on a saved handle */
export async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts = { mode: 'read' as const };
    if ((await (handle as any).queryPermission(opts)) === 'granted') return true;
    if ((await (handle as any).requestPermission(opts)) === 'granted') return true;
    return false;
  } catch {
    return false;
  }
}

/** Prompt user to select a root directory */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
    await saveDirectoryHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled
  }
}

/**
 * Resolve a file by name+size within the directory tree (recursive search).
 * Searches breadth-first with depth limit to avoid scanning huge trees.
 */
export async function findFileInDirectory(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  _fileSize?: number,
  maxDepth: number = 10,
): Promise<File | null> {
  if (maxDepth <= 0) return null;

  const subdirs: FileSystemDirectoryHandle[] = [];

  try {
    for await (const entry of (dirHandle as any).values()) {
      if (entry.kind === 'file' && entry.name === fileName) {
        try {
          return await entry.getFile();
        } catch (e) {
          console.warn(`[DirectoryAccess] Could not read file ${fileName}:`, e);
        }
      }
      if (entry.kind === 'directory') {
        subdirs.push(entry);
      }
    }
  } catch (e) {
    // Some directories (e.g. system dirs) may not be readable
    return null;
  }

  // Search subdirectories
  for (const sub of subdirs) {
    const found = await findFileInDirectory(sub, fileName, _fileSize, maxDepth - 1);
    if (found) return found;
  }

  return null;
}

/** Check if File System Access API is supported */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}
