import { contextBridge, ipcRenderer } from 'electron';
import type { ScanResult, ValidationCheck, ValidationPreset, ValidationReport, TranscriptionResult } from '../shared/types';

const electronAPI = {
  dialog: {
    openFile: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openFile'),
    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectFolder'),
    saveFilePath: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveFilePath', defaultName),
  },
  
  video: {
    scan: (filePath: string): Promise<ScanResult> =>
      ipcRenderer.invoke('video:scan', filePath),
    generateThumbnails: (filePath: string, outputDir: string): Promise<string[]> =>
      ipcRenderer.invoke('video:generateThumbnails', filePath, outputDir),
    extractFrame: (filePath: string, time: number, outputPath: string): Promise<string> =>
      ipcRenderer.invoke('video:extractFrame', filePath, time, outputPath),
    getWaveform: (filePath: string): Promise<number[]> =>
      ipcRenderer.invoke('video:getWaveform', filePath),
    transcodePreview: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('video:transcodePreview', filePath),
  },
  
  validation: {
    run: (scanResult: ScanResult, preset: ValidationPreset): Promise<ValidationCheck[]> => 
      ipcRenderer.invoke('validation:run', scanResult, preset),
  },
  
  report: {
    savePDF: (report: ValidationReport, outputPath: string): Promise<string> => 
      ipcRenderer.invoke('report:savePDF', report, outputPath),
  },
  
  ffmpeg: {
    check: (): Promise<{ ffmpeg: string; ffprobe: string; ffmpegFound: boolean; ffprobeFound: boolean }> =>
      ipcRenderer.invoke('ffmpeg:check'),
    setPath: (ffmpegPath: string, ffprobePath: string): Promise<boolean> =>
      ipcRenderer.invoke('ffmpeg:setPath', ffmpegPath, ffprobePath),
  },

  whisper: {
    check: (): Promise<{ binaryFound: boolean; binary: string; model: string }> =>
      ipcRenderer.invoke('whisper:check'),
    getPath: (): Promise<{ binary: string; model: string }> =>
      ipcRenderer.invoke('whisper:getPath'),
    setPath: (binary: string, model: string): Promise<boolean> =>
      ipcRenderer.invoke('whisper:setPath', binary, model),
    transcribe: (videoPath: string, workDir: string, language?: string): Promise<TranscriptionResult> =>
      ipcRenderer.invoke('whisper:transcribe', videoPath, workDir, language),
    saveSRT: (segments: TranscriptionResult['segments'], outputPath: string): Promise<string> =>
      ipcRenderer.invoke('whisper:saveSRT', segments, outputPath),
  },

  whisperx: {
    check: (): Promise<{ available: boolean }> =>
      ipcRenderer.invoke('whisperx:check'),
    install: (): Promise<void> =>
      ipcRenderer.invoke('whisperx:install'),
    installTorch: (): Promise<void> =>
      ipcRenderer.invoke('whisperx:installTorch'),
    getConfig: (): Promise<{ model: string; computeType: string; device: string }> =>
      ipcRenderer.invoke('whisperx:getConfig'),
    setConfig: (cfg: { model?: string; computeType?: string; device?: string }): Promise<boolean> =>
      ipcRenderer.invoke('whisperx:setConfig', cfg),
    transcribe: (
      videoPath: string,
      workDir: string,
      opts: { model: string; language: string; computeType: string; device: string }
    ): Promise<TranscriptionResult> =>
      ipcRenderer.invoke('whisperx:transcribe', videoPath, workDir, opts),
    onInstallProgress: (cb: (line: string) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, line: string) => cb(line);
      ipcRenderer.on('whisperx:install-progress', handler);
      return () => ipcRenderer.removeListener('whisperx:install-progress', handler);
    },
  },
  
  shell: {
    openPath: (path: string): Promise<void> =>
      ipcRenderer.invoke('shell:openPath', path),
  },

  app: {
    getTempDir: (): Promise<string> =>
      ipcRenderer.invoke('app:getTempDir'),
    getSafezoneDir: (): Promise<string> =>
      ipcRenderer.invoke('app:getSafezoneDir'),
  },

  file: {
    copyFiles: (sources: string[], destDir: string): Promise<string[]> =>
      ipcRenderer.invoke('file:copyFiles', sources, destDir),
    saveFile: (srcPath: string, destPath: string): Promise<string> =>
      ipcRenderer.invoke('file:saveFile', srcPath, destPath),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;