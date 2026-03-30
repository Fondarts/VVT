import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { setDriveFilePublicAccess } from './driveApi';
import type { ShareLink } from '../shared/types';

/** Cryptographically random URL-safe token */
function generateToken(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export interface CreateShareLinkParams {
  projectId: string;
  fileId: string;
  driveFileId: string;
  fileName: string;
  mode: 'presentation' | 'internal';
  createdBy: string;
  createdByName: string;
  expiresAt?: Date | null;
  accessToken: string;  // user's Google OAuth token for Drive API
}

/**
 * Creates a share link for a project file.
 * 1. Sets the Drive file to "anyone with link can view"
 * 2. Creates a Firestore doc in the shareLinks collection
 * Returns the share token.
 */
export async function createShareLink(params: CreateShareLinkParams): Promise<string> {
  await setDriveFilePublicAccess(params.accessToken, params.driveFileId);

  const token = generateToken();
  const linkData: Omit<ShareLink, 'id'> = {
    projectId: params.projectId,
    fileId: params.fileId,
    driveFileId: params.driveFileId,
    fileName: params.fileName,
    mode: params.mode,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    createdAt: new Date().toISOString(),
    expiresAt: params.expiresAt?.toISOString() ?? null,
    disabled: false,
    accessCount: 0,
  };

  await setDoc(doc(db, 'shareLinks', token), linkData);
  return token;
}

/** Reads a share link document. Returns null if not found or token invalid. */
export async function getShareLink(token: string): Promise<ShareLink | null> {
  const snap = await getDoc(doc(db, 'shareLinks', token));
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<ShareLink, 'id'>;

  if (data.disabled) return null;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) return null;

  return { id: token, ...data };
}

/** Lists all share links for a specific project file. */
export async function listShareLinks(projectId: string, fileId: string): Promise<ShareLink[]> {
  const q = query(
    collection(db, 'shareLinks'),
    where('projectId', '==', projectId),
    where('fileId', '==', fileId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ShareLink));
}

/** Disables a share link (soft delete). */
export async function revokeShareLink(token: string): Promise<void> {
  await updateDoc(doc(db, 'shareLinks', token), { disabled: true });
}

/** Builds the full share URL for a given token. */
export function getShareUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}?share=${token}`;
}
