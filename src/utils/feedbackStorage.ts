import type { FeedbackComment, AnnotationStroke } from '../shared/types';

const PREFIX = 'vvt_fb_';
const AUTHOR_KEY = 'vvt_author';

export function fileKey(fileName: string, fileSize: number): string {
  return `${PREFIX}${fileName}_${fileSize}`;
}

export function getComments(key: string): FeedbackComment[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function saveComments(key: string, comments: FeedbackComment[]): void {
  localStorage.setItem(key, JSON.stringify(comments));
}

export function addComment(
  key: string,
  data: Pick<FeedbackComment, 'timecode' | 'timecodeEnd' | 'author' | 'text' | 'annotationStrokes'>
): FeedbackComment {
  const comment: FeedbackComment = {
    id: crypto.randomUUID(),
    fileKey: key,
    timecode: data.timecode,
    timecodeEnd: data.timecodeEnd,
    author: data.author,
    text: data.text,
    annotationStrokes: data.annotationStrokes,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  saveComments(key, [...getComments(key), comment]);
  return comment;
}

export function updateCommentTimecode(
  key: string,
  id: string,
  timecode: number,
  timecodeEnd?: number
): void {
  const updated = getComments(key).map(c =>
    c.id === id ? { ...c, timecode, timecodeEnd } : c
  );
  saveComments(key, updated);
}

export function deleteComment(key: string, id: string): FeedbackComment[] {
  const updated = getComments(key).filter(c => c.id !== id);
  saveComments(key, updated);
  return updated;
}

export function toggleResolved(key: string, id: string): FeedbackComment[] {
  const updated = getComments(key).map(c =>
    c.id === id ? { ...c, resolved: !c.resolved } : c
  );
  saveComments(key, updated);
  return updated;
}

export function updateComment(
  key: string,
  id: string,
  data: { text: string; annotationStrokes?: AnnotationStroke[] }
): FeedbackComment[] {
  const updated = getComments(key).map(c =>
    c.id === id ? { ...c, text: data.text, annotationStrokes: data.annotationStrokes } : c
  );
  saveComments(key, updated);
  return updated;
}

export function getAuthorName(): string {
  return localStorage.getItem(AUTHOR_KEY) || '';
}

export function setAuthorName(name: string): void {
  localStorage.setItem(AUTHOR_KEY, name);
}
