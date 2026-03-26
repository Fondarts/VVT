/**
 * Persistent file cache using Origin Private File System (OPFS).
 * Stores dropped files so they survive page refreshes.
 * OPFS has no practical size limit (uses disk space like any file).
 * Supported in Chrome 86+, Edge 86+, Firefox 111+, Safari 15.2+.
 */

const DIR_NAME = 'kissd-file-cache';

async function getCacheDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

function safeName(name: string, size: number): string {
  // Use name_size as key to handle files with same name but different content
  return `${size}_${name}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Save a File to the persistent cache */
export async function cacheFile(file: File): Promise<void> {
  try {
    const dir = await getCacheDir();
    const handle = await dir.getFileHandle(safeName(file.name, file.size), { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(file);
    await writable.close();
  } catch (e) {
    console.warn('[fileCache] Failed to cache file:', e);
  }
}

/** Retrieve a File from the persistent cache */
export async function getCachedFile(name: string, size: number): Promise<File | null> {
  try {
    const dir = await getCacheDir();
    const handle = await dir.getFileHandle(safeName(name, size));
    const file = await handle.getFile();
    return new File([file], name, { type: file.type });
  } catch {
    return null; // not in cache
  }
}

/** Check if OPFS is supported */
export function isOPFSSupported(): boolean {
  return 'storage' in navigator && 'getDirectory' in navigator.storage;
}
