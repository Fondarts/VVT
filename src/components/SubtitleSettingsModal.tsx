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
