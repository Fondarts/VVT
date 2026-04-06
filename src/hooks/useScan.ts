import { useState, useCallback } from 'react';
import type { ScanResult } from '../shared/types';
import { runScan, needsTranscodeCodec } from '../api/ffmpeg';
import { scanImageFile } from '../utils/imageScanner';

export interface UseScanReturn {
  scanning: boolean;
  scanProgress: number;
  scanStatus: string;
  scanResult: ScanResult | null;
  setScanResult: React.Dispatch<React.SetStateAction<ScanResult | null>>;
  error: string | null;
  thumbnails: string[];
  setThumbnails: React.Dispatch<React.SetStateAction<string[]>>;
  waveformData: number[];
  setWaveformData: React.Dispatch<React.SetStateAction<number[]>>;
  isTranscoding: boolean;
  transcodeProgress: number;
  transcodeError: string | null;
  transcodedVideoSrc: string | null;
  handleScan: (file?: File) => Promise<void>;
  handleImageScan: (file: File) => Promise<void>;
  resetScanState: () => void;
}

export function useScan(
  selectedFileRef: React.RefObject<File | null>,
  onVideoSrcReplace: (url: string) => void,
): UseScanReturn {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [transcodeError, setTranscodeError] = useState<string | null>(null);
  const [transcodedVideoSrc, setTranscodedVideoSrc] = useState<string | null>(null);

  const resetScanState = useCallback(() => {
    setScanResult(null);
    setError(null);
    setThumbnails([]);
    setWaveformData([]);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodeError(null);
    setTranscodedVideoSrc(null);
  }, []);

  const handleImageScan = useCallback(async (file: File) => {
    setScanning(true);
    setError(null);
    try {
      const result = await scanImageFile(file);
      setScanResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read image');
    } finally {
      setScanning(false);
    }
  }, []);

  const handleScan = useCallback(async (fileOverride?: File) => {
    const file = fileOverride ?? selectedFileRef.current;
    if (!file) return;

    setScanning(true);
    setScanProgress(0);
    setScanStatus('Loading FFmpeg…');
    setError(null);
    setScanResult(null);
    setThumbnails([]);
    setWaveformData([]);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodeError(null);
    setTranscodedVideoSrc(null);

    try {
      await runScan(file, {
        thumbnailCount: 10,
        onProgress: (pct, label) => { setScanProgress(pct); setScanStatus(label); },
        onScanReady: (scan) => {
          setScanResult(scan);
          if (scan.video && needsTranscodeCodec(scan.video.codec)) {
            setIsTranscoding(true);
            setTranscodeProgress(0);
          }
        },
        onLoudnessReady: (lufs, truePeak) => {
          setScanResult(prev =>
            prev?.audio ? { ...prev, audio: { ...prev.audio, lufs, truePeak } } : prev
          );
        },
        onTranscodeReady: (url) => {
          onVideoSrcReplace(url);
          setTranscodedVideoSrc(url);
          setIsTranscoding(false);
        },
        onTranscodeError: (msg) => {
          setTranscodeError(msg);
          setIsTranscoding(false);
        },
        onWaveformReady: (wf) => { setWaveformData(wf); },
        onThumbnailsReady: (thumbs) => { setThumbnails(thumbs); },
      });
      setScanStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [selectedFileRef, onVideoSrcReplace]);

  return {
    scanning,
    scanProgress,
    scanStatus,
    scanResult,
    setScanResult,
    error,
    thumbnails,
    setThumbnails,
    waveformData,
    setWaveformData,
    isTranscoding,
    transcodeProgress,
    transcodeError,
    transcodedVideoSrc,
    handleScan,
    handleImageScan,
    resetScanState,
  };
}
