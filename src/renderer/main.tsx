import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import type {
  ScanResult,
  ValidationCheck,
  ValidationPreset,
  ValidationReport,
  TranscriptionResult,
} from '../shared/types';

declare global {
  interface Window {
    electronAPI: {
      dialog: {
        openFile: () => Promise<string | null>;
        selectFolder: () => Promise<string | null>;
        saveFilePath: (defaultName: string) => Promise<string | null>;
      };
      video: {
        scan: (filePath: string) => Promise<ScanResult>;
        generateThumbnails: (filePath: string, outputDir: string) => Promise<string[]>;
        extractFrame: (filePath: string, time: number, outputPath: string) => Promise<string>;
        getWaveform: (filePath: string) => Promise<number[]>;
      };
      validation: {
        run: (scanResult: ScanResult, preset: ValidationPreset) => Promise<ValidationCheck[]>;
      };
      report: {
        savePDF: (report: ValidationReport, outputPath: string) => Promise<string>;
      };
      ffmpeg: {
        check: () => Promise<{ ffmpeg: string; ffprobe: string; ffmpegFound: boolean; ffprobeFound: boolean }>;
        setPath: (ffmpegPath: string, ffprobePath: string) => Promise<boolean>;
      };
      whisper: {
        check: () => Promise<{ binaryFound: boolean; binary: string; model: string }>;
        getPath: () => Promise<{ binary: string; model: string }>;
        setPath: (binary: string, model: string) => Promise<boolean>;
        transcribe: (videoPath: string, workDir: string) => Promise<TranscriptionResult>;
      };
      shell: {
        openPath: (path: string) => Promise<void>;
      };
      app: {
        getTempDir: () => Promise<string>;
        getSafezoneDir: () => Promise<string>;
      };
      file: {
        copyFiles: (sources: string[], destDir: string) => Promise<string[]>;
        saveFile: (srcPath: string, destPath: string) => Promise<string>;
      };
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);