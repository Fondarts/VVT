import { useState, useCallback, useRef } from 'react';
import type { ScanResult } from '../shared/types';
import { runScan, needsTranscodeCodec } from '../api/ffmpeg';
import { scanImageFile } from '../utils/imageScanner';
import { logger } from '../utils/logger';

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

  // Scan deduplication: each scan gets a unique ID. If a new scan starts
  // while one is running, callbacks from the old scan are ignored.
  const scanIdRef = useRef(0);
  const scanningRef = useRef(false);

  const handleScan = useCallback(async (fileOverride?: File) => {
    const file = fileOverride ?? selectedFileRef.current;
    if (!file) return;

    // If a scan is already running, bump the ID so the old one's callbacks become stale
    if (scanningRef.current) {
      logger.warn('[useScan] Scan already in progress — superseding previous scan');
    }
    const thisId = ++scanIdRef.current;
    scanningRef.current = true;
    const isStale = () => scanIdRef.current !== thisId;

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
        onProgress: (pct, label) => { if (!isStale()) { setScanProgress(pct); setScanStatus(label); } },
        onScanReady: (scan) => {
          if (isStale()) return;
          setScanResult(scan);
          if (scan.video && needsTranscodeCodec(scan.video.codec)) {
            setIsTranscoding(true);
            setTranscodeProgress(0);
          }
        },
        onLoudnessReady: (lufs, truePeak) => {
          if (isStale()) return;
          setScanResult(prev =>
            prev?.audio ? { ...prev, audio: { ...prev.audio, lufs, truePeak } } : prev
          );
        },
        onTranscodeReady: (url) => {
          if (isStale()) { URL.revokeObjectURL(url); return; }
          onVideoSrcReplace(url);
          setTranscodedVideoSrc(url);
          setIsTranscoding(false);
        },
        onTranscodeError: (msg) => {
          if (isStale()) return;
          setTranscodeError(msg);
          setIsTranscoding(false);
        },
        onWaveformReady: (wf) => { if (!isStale()) setWaveformData(wf); },
        onThumbnailsReady: (thumbs) => { if (!isStale()) setThumbnails(thumbs); },
      });
      if (!isStale()) setScanStatus('');
    } catch (err) {
      if (!isStale()) setError(err instanceof Error ? err.message : String(err) || 'Scan failed');
    } finally {
      if (!isStale()) {
        setScanning(false);
        scanningRef.current = false;
      }
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
