import {
  collection,
  query,
  where,
  // orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Project, ProjectFolder, ProjectFile, ScanResult, MemberRole } from '../shared/types';

// ── Projects ─────────────────────────────────────────────────────────────────

const PROJECTS = 'projects';

export function subscribeProjects(userId: string, callback: (projects: Project[]) => void): () => void {
  const q = query(collection(db, PROJECTS), where('memberUids', 'array-contains', userId));
  return onSnapshot(q, (snap) => {
    const projects: Project[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        createdBy: data.createdBy,
        createdByName: data.createdByName ?? '',
        createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
        updatedAt: (data.updatedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
        members: data.members ?? {},
        memberUids: data.memberUids ?? [],
        memberEmails: data.memberEmails ?? [],
      };
    });
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    callback(projects);
  }, (err: unknown) => {
    console.error('[Firestore] subscribeProjects error:', err);
    callback([]);
  });
}

export async function createProject(name: string, userId: string, userName?: string, userEmail?: string): Promise<string> {
  const ref = await addDoc(collection(db, PROJECTS), {
    name,
    createdBy: userId,
    createdByName: userName ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    members: { [userId]: 'owner' as MemberRole },
    memberUids: [userId],
    memberEmails: userEmail ? [userEmail] : [],
  });
  return ref.id;
}

export async function renameProject(projectId: string, newName: string): Promise<void> {
  await updateDoc(doc(db, PROJECTS, projectId), { name: newName, updatedAt: serverTimestamp() });
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, PROJECTS, projectId));
}

export async function touchProject(projectId: string): Promise<void> {
  await updateDoc(doc(db, PROJECTS, projectId), { updatedAt: serverTimestamp() });
}

// ── Members ─────────────────────────────────────────────────────────────────

import { arrayUnion, arrayRemove } from 'firebase/firestore';

export async function addProjectMember(
  projectId: string,
  uid: string,
  email: string,
  role: MemberRole,
): Promise<void> {
  await updateDoc(doc(db, PROJECTS, projectId), {
    [`members.${uid}`]: role,
    memberUids: arrayUnion(uid),
    memberEmails: arrayUnion(email.toLowerCase()),
    updatedAt: serverTimestamp(),
  });
}

export async function removeProjectMember(projectId: string, uid: string, email: string): Promise<void> {
  const snap = await getDoc(doc(db, PROJECTS, projectId));
  if (!snap.exists()) return;
  const data = snap.data();
  // Cannot remove the owner
  if (data.members?.[uid] === 'owner') return;
  const newMembers = { ...data.members };
  delete newMembers[uid];
  await updateDoc(doc(db, PROJECTS, projectId), {
    members: newMembers,
    memberUids: arrayRemove(uid),
    memberEmails: arrayRemove(email.toLowerCase()),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMemberRole(projectId: string, uid: string, role: MemberRole): Promise<void> {
  // Cannot change owner role via this function
  if (role === 'owner') return;
  await updateDoc(doc(db, PROJECTS, projectId), {
    [`members.${uid}`]: role,
    updatedAt: serverTimestamp(),
  });
}

/** Look up projects that include a given email as a member */
export async function findProjectByMemberEmail(email: string): Promise<Project[]> {
  const q = query(collection(db, PROJECTS), where('memberEmails', 'array-contains', email.toLowerCase()));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? '',
      createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
      updatedAt: (data.updatedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
      members: data.members ?? {},
      memberUids: data.memberUids ?? [],
      memberEmails: data.memberEmails ?? [],
    };
  });
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
        createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
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
        addedByName: data.addedByName ?? '',
        addedAt: (data.addedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
        driveFileId: data.driveFileId ?? undefined,
        driveCreatedTime: data.driveCreatedTime ?? undefined,
        driveWidth: data.driveWidth ?? undefined,
        driveHeight: data.driveHeight ?? undefined,
        driveDurationMs: data.driveDurationMs ?? undefined,
      };
    });
    callback(files);
  });
}

/** One-shot fetch of files in a folder (for building version context) */
export async function fetchFiles(projectId: string, parentPath: string): Promise<ProjectFile[]> {
  const q = query(
    collection(db, FILES),
    where('projectId', '==', projectId),
    where('parentPath', '==', parentPath),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
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
      addedByName: data.addedByName ?? '',
      addedAt: (data.addedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
      driveFileId: data.driveFileId ?? undefined,
      driveCreatedTime: data.driveCreatedTime ?? undefined,
      driveWidth: data.driveWidth ?? undefined,
      driveHeight: data.driveHeight ?? undefined,
      driveDurationMs: data.driveDurationMs ?? undefined,
    };
  });
}

/** Fetch a single file by document ID */
export async function fetchFileById(fileId: string): Promise<ProjectFile | null> {
  const snap = await getDoc(doc(db, FILES, fileId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
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
    addedByName: data.addedByName ?? '',
    addedAt: (data.addedAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
    driveFileId: data.driveFileId ?? undefined,
    driveCreatedTime: data.driveCreatedTime ?? undefined,
    driveWidth: data.driveWidth ?? undefined,
    driveHeight: data.driveHeight ?? undefined,
    driveDurationMs: data.driveDurationMs ?? undefined,
  };
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
    driveCreatedTime?: string;
    driveWidth?: number;
    driveHeight?: number;
    driveDurationMs?: number;
  },
  userId: string,
  userName?: string,
): Promise<string> {
  // Filter out undefined values — Firestore rejects them
  const data: Record<string, unknown> = { projectId, parentPath, ...fileData, addedBy: userId, addedByName: userName ?? '', addedAt: serverTimestamp() };
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
