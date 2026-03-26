import type { ProjectFile, VersionGroup } from '../shared/types';

// Match version suffixes anywhere in the name (not just at end)
// We find ALL matches and use the LAST one as the version
const VERSION_PATTERN_G = /[_\-\s.](?:v|V|rev|REV|r|R|edit|EDIT)(\d{1,3})/g;
const FINAL_PATTERN = /[_\-\s.](?:final|FINAL|Final)(?=[_\-\s.]|$)/;

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

  // Find the last version-like suffix in the name
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  VERSION_PATTERN_G.lastIndex = 0;
  while ((m = VERSION_PATTERN_G.exec(nameWithoutExt)) !== null) {
    lastMatch = m;
  }

  if (lastMatch) {
    return {
      baseName: nameWithoutExt.slice(0, lastMatch.index!),
      versionTag: lastMatch[0].slice(1),
      versionNumber: parseInt(lastMatch[1], 10),
    };
  }

  return { baseName: nameWithoutExt, versionTag: null, versionNumber: 0 };
}

const VIDEO_EXTS = new Set(['mp4','mov','mkv','webm','avi','mxf','m2ts','ts','mts','mpg','mpeg','wmv','flv','3gp']);
const IMAGE_EXTS = new Set(['jpg','jpeg','png','webp','gif','bmp','tiff','avif','svg']);
const AUDIO_EXTS = new Set(['mp3','wav','aac','flac','ogg','m4a','wma','aiff']);

export function detectFileType(filename: string): 'video' | 'image' | 'audio' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'video';
}

/** Returns true if the file is a supported media type (video/image/audio) */
export function isSupportedMedia(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTS.has(ext) || IMAGE_EXTS.has(ext) || AUDIO_EXTS.has(ext);
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
