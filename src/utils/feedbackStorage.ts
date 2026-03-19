import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { FeedbackComment, AnnotationStroke } from '../shared/types';

const COL = 'comments';

export function fileKey(fileName: string, fileSize: number): string {
  return `${fileName}_${fileSize}`;
}

/** Real-time subscription — returns unsubscribe function */
export function subscribeComments(
  fKey: string,
  callback: (comments: FeedbackComment[]) => void,
): () => void {
  const q = query(collection(db, COL), where('fileKey', '==', fKey));
  return onSnapshot(q, (snap) => {
    const comments: FeedbackComment[] = snap.docs.map(d => ({
      ...d.data(),
      id: d.id,
    } as FeedbackComment));
    // Sort by timecode
    comments.sort((a, b) => a.timecode - b.timecode);
    callback(comments);
  });
}

export async function addComment(
  fKey: string,
  data: Pick<FeedbackComment, 'timecode' | 'timecodeEnd' | 'author' | 'text' | 'annotationStrokes'> & {
    authorPhoto?: string;
  },
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    fileKey: fKey,
    timecode: data.timecode,
    timecodeEnd: data.timecodeEnd ?? null,
    author: data.author,
    authorPhoto: data.authorPhoto ?? null,
    text: data.text,
    annotationStrokes: data.annotationStrokes ?? [],
    createdAt: new Date().toISOString(),
    resolved: false,
  });
  return ref.id;
}

/** Update only the timecode (preserves timecodeEnd) */
export async function updateCommentTimecode(id: string, timecode: number): Promise<void> {
  await updateDoc(doc(db, COL, id), { timecode });
}

/** Update only timecodeEnd (preserves timecode) */
export async function updateCommentRange(id: string, timecodeEnd: number): Promise<void> {
  await updateDoc(doc(db, COL, id), { timecodeEnd });
}

/** Update both timecode and timecodeEnd */
export async function updateCommentTimecodes(
  id: string,
  timecode: number,
  timecodeEnd: number,
): Promise<void> {
  await updateDoc(doc(db, COL, id), { timecode, timecodeEnd });
}

export async function deleteComment(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function toggleResolved(id: string, currentlyResolved: boolean): Promise<void> {
  await updateDoc(doc(db, COL, id), { resolved: !currentlyResolved });
}

export async function updateComment(
  id: string,
  data: { text: string; annotationStrokes?: AnnotationStroke[] },
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    text: data.text,
    annotationStrokes: data.annotationStrokes ?? [],
  });
}
