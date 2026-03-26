import type { ProjectFile, VersionGroup } from '../shared/types';

const VERSION_PATTERN = /[_\-\s.](?:v|V|rev|REV|r|R|edit|EDIT)(\d{1,3})$/;
const FINAL_PATTERN = /[_\-\s.](?:final|FINAL|Final)$/;

export function parseVersion(filename: string): { baseName: string; versionTag: string | null; versionNumber: number } {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

  const finalMatch = nameWithoutExt.match(FINAL_PATTERN);
  if (finalMatch) {
    return {
      baseName: nameWithoutExt.slice(0, finalMatch.index!),
      versionTag: 'final',
      versionNumber: 9999,
    };
  }

  const match = nameWithoutExt.match(VERSION_PATTERN);
  if (match) {
    return {
      baseName: nameWithoutExt.slice(0, match.index!),
      versionTag: match[0].slice(1),
      versionNumber: parseInt(match[1], 10),
    };
  }

  return { baseName: nameWithoutExt, versionTag: null, versionNumber: 0 };
}

export function detectFileType(filename: string): 'video' | 'image' | 'audio' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const videoExts = new Set(['mp4','mov','mkv','webm','avi','mxf','m2ts','ts','mts','mpg','mpeg','wmv','flv','3gp']);
  const imageExts = new Set(['jpg','jpeg','png','webp','gif','bmp','tiff','avif','svg']);
  const audioExts = new Set(['mp3','wav','aac','flac','ogg','m4a','wma','aiff']);
  if (videoExts.has(ext)) return 'video';
  if (imageExts.has(ext)) return 'image';
  if (audioExts.has(ext)) return 'audio';
  return 'video';
}

export function groupByVersion(files: ProjectFile[]): VersionGroup[] {
  const groups = new Map<string, ProjectFile[]>();
  for (const f of files) {
    const key = f.baseName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  return Array.from(groups.values()).map(versions => {
    versions.sort((a, b) => b.versionNumber - a.versionNumber);
    return { baseName: versions[0].baseName, latest: versions[0], versions };
  });
}
