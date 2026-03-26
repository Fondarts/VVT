import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Project, ProjectFolder, ProjectFile, ScanResult } from '../shared/types';

// ── Projects ─────────────────────────────────────────────────────────────────

const PROJECTS = 'projects';

export function subscribeProjects(callback: (projects: Project[]) => void): () => void {
  const q = query(collection(db, PROJECTS), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const projects: Project[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        createdBy: data.createdBy,
        createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
        updatedAt: (data.updatedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
      };
    });
    callback(projects);
  });
}

export async function createProject(name: string, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, PROJECTS), {
    name,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, PROJECTS, projectId));
}

export async function touchProject(projectId: string): Promise<void> {
  await updateDoc(doc(db, PROJECTS, projectId), { updatedAt: serverTimestamp() });
}

// ── Folders ──────────────────────────────────────────────────────────────────

const FOLDERS = 'projectFolders';

export function subscribeFolders(
  projectId: string,
  parentPath: string,
  callback: (folders: ProjectFolder[]) => void,
): () => void {
  const q = query(
    collection(db, FOLDERS),
    where('projectId', '==', projectId),
    where('parentPath', '==', parentPath),
  );
  return onSnapshot(q, (snap) => {
    const folders: ProjectFolder[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        projectId: data.projectId,
        path: data.path,
        name: data.name,
        parentPath: data.parentPath,
      };
    });
    callback(folders.sort((a, b) => a.name.localeCompare(b.name)));
  });
}

export async function createFolder(
  projectId: string,
  parentPath: string,
  name: string,
  userId: string,
): Promise<string> {
  const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
  const ref = await addDoc(collection(db, FOLDERS), {
    projectId,
    path,
    name,
    parentPath,
    createdAt: serverTimestamp(),
    createdBy: userId,
  });
  await touchProject(projectId);
  return ref.id;
}

// ── Files ────────────────────────────────────────────────────────────────────

const FILES = 'projectFiles';

export function subscribeFiles(
  projectId: string,
  parentPath: string,
  callback: (files: ProjectFile[]) => void,
): () => void {
  const q = query(
    collection(db, FILES),
    where('projectId', '==', projectId),
    where('parentPath', '==', parentPath),
  );
  return onSnapshot(q, (snap) => {
    const files: ProjectFile[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        projectId: data.projectId,
        parentPath: data.parentPath,
        name: data.name,
        baseName: data.baseName,
        versionTag: data.versionTag ?? null,
        versionNumber: data.versionNumber ?? 0,
        type: data.type,
        extension: data.extension,
        sizeBytes: data.sizeBytes,
        scanResult: data.scanResult ?? null,
        addedBy: data.addedBy,
        addedAt: (data.addedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
        driveFileId: data.driveFileId ?? undefined,
      };
    });
    callback(files);
  });
}

export async function addProjectFile(
  projectId: string,
  parentPath: string,
  fileData: {
    name: string;
    baseName: string;
    versionTag: string | null;
    versionNumber: number;
    type: 'video' | 'image' | 'audio';
    extension: string;
    sizeBytes: number;
    scanResult: ScanResult | null;
    driveFileId?: string;
  },
  userId: string,
): Promise<string> {
  // Filter out undefined values — Firestore rejects them
  const data: Record<string, unknown> = { projectId, parentPath, ...fileData, addedBy: userId, addedAt: serverTimestamp() };
  for (const key of Object.keys(data)) { if (data[key] === undefined) delete data[key]; }
  const ref = await addDoc(collection(db, FILES), data);
  await touchProject(projectId);
  return ref.id;
}

export async function updateFileScanResult(fileId: string, scanResult: ScanResult): Promise<void> {
  await updateDoc(doc(db, FILES, fileId), { scanResult });
}

/** Move a file into a different version group by changing its baseName, versionTag, and versionNumber */
export async function updateFileVersionNumber(fileId: string, versionNumber: number): Promise<void> {
  await updateDoc(doc(db, FILES, fileId), { versionNumber });
}

export async function updateFileVersionGroup(
  fileId: string,
  newBaseName: string,
  versionTag: string | null,
  versionNumber: number,
): Promise<void> {
  await updateDoc(doc(db, FILES, fileId), { baseName: newBaseName, versionTag, versionNumber });
}

export async function deleteProjectFile(fileId: string): Promise<void> {
  await deleteDoc(doc(db, FILES, fileId));
}

/** Delete a folder and all its contents (subfolders + files) recursively */
export async function deleteFolder(projectId: string, folderPath: string, folderId: string): Promise<void> {
  // Delete all files whose parentPath starts with this folder's path
  const filesQ = query(collection(db, FILES), where('projectId', '==', projectId));
  const filesSnap = await getDocs(filesQ);
  for (const d of filesSnap.docs) {
    const pp = d.data().parentPath as string;
    if (pp === folderPath || pp.startsWith(folderPath + '/')) {
      await deleteDoc(d.ref);
    }
  }

  // Delete all subfolders whose path starts with this folder's path
  const foldersQ = query(collection(db, FOLDERS), where('projectId', '==', projectId));
  const foldersSnap = await getDocs(foldersQ);
  for (const d of foldersSnap.docs) {
    const fp = d.data().path as string;
    if (fp === folderPath || fp.startsWith(folderPath + '/')) {
      await deleteDoc(d.ref);
    }
  }

  // Delete the folder itself
  await deleteDoc(doc(db, FOLDERS, folderId));
}
