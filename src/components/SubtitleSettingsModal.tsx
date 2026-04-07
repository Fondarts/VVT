import type { SubtitleStyle } from '../shared/types';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  maxCharsPerLine: 42,
  maxLines: 2,
  position: 'bottom',
  fontFamily: 'Arial',
  fontSize: 48,
  color: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  showBackground: true,
  backgroundColor: 'rgba(0,0,0,0.78)',
};

// ── Built-in subtitle style presets ──────────────────────────────
export interface SubtitlePreset {
  id: string;
  name: string;
  style: SubtitleStyle;
  builtIn?: boolean;
}

export const BUILTIN_PRESETS: SubtitlePreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    builtIn: true,
    style: { ...DEFAULT_SUBTITLE_STYLE },
  },
  {
    id: 'netflix',
    name: 'Netflix',
    builtIn: true,
    style: {
      maxCharsPerLine: 42,
      maxLines: 2,
      position: 'bottom',
      fontFamily: 'Noto Sans',
      fontSize: 44,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 0,
      showBackground: true,
      backgroundColor: 'rgba(0,0,0,0.75)',
    },
  },
  {
    id: 'broadcast',
    name: 'Broadcast',
    builtIn: true,
    style: {
      maxCharsPerLine: 32,
      maxLines: 2,
      position: 'bottom',
      fontFamily: 'Courier New',
      fontSize: 42,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 3,
      showBackground: false,
      backgroundColor: 'rgba(0,0,0,0)',
    },
  },
  {
    id: 'social',
    name: 'Social Media',
    builtIn: true,
    style: {
      maxCharsPerLine: 30,
      maxLines: 2,
      position: 'center',
      fontFamily: 'Montserrat',
      fontSize: 56,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
      showBackground: false,
      backgroundColor: 'rgba(0,0,0,0)',
    },
  },
];

const STORAGE_KEY = 'kissd-subtitle-presets';

export function loadCustomPresets(): SubtitlePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCustomPresets(presets: SubtitlePreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function getAllPresets(): SubtitlePreset[] {
  return [...BUILTIN_PRESETS, ...loadCustomPresets()];
}

export const FONT_OPTIONS = [
  // Sans-serif classics
  'Arial', 'Helvetica', 'Inter', 'Roboto', 'Verdana',
  'Trebuchet MS', 'Tahoma', 'Segoe UI',
  // Subtitle industry standards
  'Noto Sans', 'Open Sans', 'Lato', 'Source Sans Pro',
  'Montserrat', 'Poppins', 'Nunito', 'Raleway',
  // Serif
  'Georgia', 'Times New Roman',
  // Monospace
  'Courier New',
  // Display
  'Impact',
];

export const CHECKERBOARD = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23444'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23444'/%3E%3Crect x='8' width='8' height='8' fill='%23333'/%3E%3Crect y='8' width='8' height='8' fill='%23333'/%3E%3C/svg%3E")`;
