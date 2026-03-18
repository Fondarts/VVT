import type { ScanResult, FileMetadata, ImageMetadata } from '../shared/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function calcAspectRatio(w: number, h: number): string {
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

const FORMAT_MAP: Record<string, string> = {
  jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', webp: 'WebP',
  gif: 'GIF', bmp: 'BMP', tiff: 'TIFF', tif: 'TIFF',
  avif: 'AVIF', svg: 'SVG',
};

export async function scanImageFile(file: File): Promise<ScanResult> {
  const { width, height } = await getImageDimensions(file);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const format = FORMAT_MAP[ext] ?? ext.toUpperCase();

  const fileMetadata: FileMetadata = {
    name: file.name,
    path: file.name,
    extension: ext,
    sizeBytes: file.size,
    sizeFormatted: formatBytes(file.size),
    duration: 0,
    durationFormatted: '—',
    container: format,
    format: format,
    mimeType: file.type,
    creationDate: file.lastModified
      ? new Date(file.lastModified).toLocaleDateString()
      : undefined,
  };

  const imageMetadata: ImageMetadata = {
    width,
    height,
    format,
    aspectRatio: calcAspectRatio(width, height),
  };

  return {
    file: fileMetadata,
    image: imageMetadata,
    fastStart: { enabled: false, moovAt: 0 },
  };
}
