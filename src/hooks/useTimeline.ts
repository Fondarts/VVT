import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { TimelineBlock, TimelinePreview } from '../components/EditTimeline';
import { blockId } from '../components/EditTimeline';
import { exportTimeline } from '../api/ffmpeg';
import type { ExportCodecConfig, SubtitleBurnIn } from '../api/ffmpeg';
import type { ExportSettings } from '../components/ExportModal';
import type { VideoPlayerHandle } from '../components/VideoPlayer';
import type { ScanResult, TranscriptionResult, SubtitleStyle } from '../shared/types';

export interface UseTimelineParams {
  videoEl: HTMLVideoElement | null;
  videoCurrentTime: number;
  scanResult: ScanResult | null;
  selectedFile: File | null;
  transcription: TranscriptionResult | undefined;
  subtitleStyle: SubtitleStyle;
  videoPlayerRef: React.RefObject<VideoPlayerHandle | null>;
}

export interface UseTimelineReturn {
  timelineBlocks: TimelineBlock[];
  setTimelineBlocks: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  tlExporting: boolean;
  tlExportPct: number;
  showExportModal: boolean;
  setShowExportModal: (v: boolean) => void;
  tlPreview: TimelinePreview | null;
  tlGlobalTime: number;
  tlIsPlaying: boolean;
  tlRanges: { ranges: (TimelineBlock & { start: number; end: number })[]; videoBlock: TimelineBlock & { start: number; end: number }; totalDuration: number } | null;
  tlCurrentBlock: (TimelineBlock & { start: number; end: number }) | null | undefined;
  handleAddSlateBlock: (block: TimelineBlock) => void;
  handleTimelineExport: (settings?: ExportSettings) => Promise<void>;
  handleTlPlayPause: () => void;
  handleTlSeek: (time: number) => void;
  handleTlAddBlack: (dur: number) => void;
  handleTlAddImage: () => void;
  handleTlAddBip: () => void;
}

export function useTimeline({
  videoEl,
  videoCurrentTime,
  scanResult,
  selectedFile,
  transcription,
  subtitleStyle,
  videoPlayerRef,
}: UseTimelineParams): UseTimelineReturn {
  const [timelineBlocks, setTimelineBlocks] = useState<TimelineBlock[]>([]);
  const [tlExporting, setTlExporting] = useState(false);
  const [tlExportPct, setTlExportPct] = useState(0);
  const [, setTlExportLabel] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [tlPreview, setTlPreview] = useState<TimelinePreview | null>(null);
  const [tlGlobalTime, setTlGlobalTime] = useState(0);
  const [tlIsPlaying, setTlIsPlaying] = useState(false);
  const tlAnimRef = useRef(0);
  const tlLastFrameRef = useRef(0);

  // ── Auto-clear timeline if only video block remains ──
  useEffect(() => {
    if (timelineBlocks.length === 1 && timelineBlocks[0].type === 'video') {
      setTimelineBlocks([]);
      setTlGlobalTime(0);
      setTlIsPlaying(false);
      setTlPreview(null);
    }
  }, [timelineBlocks]);

  // ── Compute timeline block ranges (memoized) ──
  const tlRanges = useMemo(() => {
    if (timelineBlocks.length < 2) return null;
    let acc = 0;
    const ranges = timelineBlocks.map(b => {
      const start = acc;
      acc += b.duration;
      return { ...b, start, end: acc };
    });
    const videoBlock = ranges.find(r => r.type === 'video');
    if (!videoBlock) return null;
    return { ranges, videoBlock, totalDuration: acc };
  }, [timelineBlocks]);

  // ── Resolve which block is at a given global time ──
  const resolveBlockAt = useCallback((t: number) => {
    if (!tlRanges) return null;
    return tlRanges.ranges.find(r => t >= r.start && t < r.end) ?? tlRanges.ranges[tlRanges.ranges.length - 1];
  }, [tlRanges]);

  // ── Which block is the playhead in? ──
  const tlCurrentBlock = resolveBlockAt(tlGlobalTime);

  // ── Sync preview overlay based on current block ──
  useEffect(() => {
    if (!tlRanges || !tlCurrentBlock) { setTlPreview(null); return; }

    if (tlCurrentBlock.type === 'video') {
      setTlPreview(null);
    } else if (tlCurrentBlock.type === 'slate') {
      setTlPreview({ blockType: 'slate', thumbnail: tlCurrentBlock.thumbnail });
    } else if (tlCurrentBlock.type === 'bip') {
      setTlPreview({ blockType: 'bip' });
    } else {
      setTlPreview({ blockType: 'black' });
    }
  }, [tlCurrentBlock?.id, tlCurrentBlock?.type, tlRanges]);

  // ── Play beep tone when entering a bip block ──
  useEffect(() => {
    if (!tlIsPlaying || !tlCurrentBlock || tlCurrentBlock.type !== 'bip') return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    osc.type = 'sine';
    gain.gain.value = 0.5;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + tlCurrentBlock.duration);
    return () => { osc.disconnect(); gain.disconnect(); ctx.close(); };
  }, [tlIsPlaying, tlCurrentBlock?.id, tlCurrentBlock?.type]);

  // ── Playback engine ──
  // rAF loop — only runs during non-video blocks
  useEffect(() => {
    if (!tlIsPlaying || !tlRanges || !tlCurrentBlock) return;
    if (tlCurrentBlock.type === 'video') return;

    if (videoEl && !videoEl.paused) videoEl.pause();

    tlLastFrameRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - tlLastFrameRef.current) / 1000;
      tlLastFrameRef.current = now;

      setTlGlobalTime(prev => {
        const next = prev + dt;
        if (next >= tlRanges.totalDuration) {
          setTlIsPlaying(false);
          return tlRanges.totalDuration;
        }
        return next;
      });

      tlAnimRef.current = requestAnimationFrame(tick);
    };

    tlAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tlAnimRef.current);
  }, [tlIsPlaying, tlCurrentBlock?.id, tlCurrentBlock?.type, tlRanges, videoEl]);

  // Video block playback — start/stop video element
  useEffect(() => {
    if (!tlIsPlaying || !tlRanges || !tlCurrentBlock || !videoEl) return;
    if (tlCurrentBlock.type !== 'video') return;

    const videoOffset = tlGlobalTime - tlCurrentBlock.start;
    if (Math.abs(videoEl.currentTime - videoOffset) > 0.3) {
      videoEl.currentTime = videoOffset;
    }
    if (videoEl.paused) videoEl.play().catch(() => {});

    return () => {};
  }, [tlIsPlaying, tlCurrentBlock?.id, tlCurrentBlock?.type, tlRanges, videoEl]);

  // Video timeupdate → sync tlGlobalTime
  useEffect(() => {
    if (!tlIsPlaying || !tlCurrentBlock || tlCurrentBlock.type !== 'video') return;
    setTlGlobalTime(tlCurrentBlock.start + videoCurrentTime);
  }, [videoCurrentTime]);

  // Video ended → advance past video block so next block plays
  useEffect(() => {
    if (!videoEl || !tlIsPlaying || !tlCurrentBlock || tlCurrentBlock.type !== 'video') return;
    const blockEnd = tlCurrentBlock.end;
    const handleEnded = () => setTlGlobalTime(blockEnd);
    videoEl.addEventListener('ended', handleEnded);
    return () => videoEl.removeEventListener('ended', handleEnded);
  }, [videoEl, tlIsPlaying, tlCurrentBlock?.id, tlCurrentBlock?.type]);

  // ── Timeline play/pause/seek handlers ──
  const handleTlPlayPause = useCallback(() => {
    if (!tlRanges) return;
    if (tlIsPlaying) {
      setTlIsPlaying(false);
      if (videoEl && !videoEl.paused) videoEl.pause();
    } else {
      if (tlGlobalTime >= tlRanges.totalDuration - 0.1) {
        setTlGlobalTime(0);
      }
      setTlIsPlaying(true);
      const block = resolveBlockAt(tlGlobalTime);
      if (block?.type === 'video' && videoEl) {
        videoEl.currentTime = tlGlobalTime - block.start;
        videoEl.play().catch(() => {});
      }
    }
  }, [tlRanges, tlIsPlaying, tlGlobalTime, resolveBlockAt, videoEl]);

  const handleTlSeek = useCallback((time: number) => {
    if (!tlRanges) return;
    const clamped = Math.max(0, Math.min(time, tlRanges.totalDuration));
    setTlGlobalTime(clamped);
    const block = resolveBlockAt(clamped);
    if (block?.type === 'video' && videoEl) {
      videoEl.currentTime = clamped - block.start;
    }
  }, [tlRanges, resolveBlockAt, videoEl]);

  // ── Add block helpers ──
  const ensureVideoBlock = useCallback((addBlock: TimelineBlock): TimelineBlock[] => {
    const videoDur = scanResult?.file?.duration ?? 30;
    const videoBlock: TimelineBlock = {
      id: blockId(),
      type: 'video',
      duration: videoDur,
      label: selectedFile?.name ?? 'Video',
    };
    return [videoBlock, addBlock];
  }, [scanResult, selectedFile]);

  const handleAddSlateBlock = useCallback((block: TimelineBlock) => {
    setTimelineBlocks(prev => {
      if (prev.length === 0) {
        const videoDur = scanResult?.file?.duration ?? 30;
        const videoBlock: TimelineBlock = {
          id: blockId(),
          type: 'video',
          duration: videoDur,
          label: selectedFile?.name ?? 'Video',
        };
        return [block, videoBlock];
      }
      const videoIdx = prev.findIndex(b => b.type === 'video');
      const next = [...prev];
      next.splice(videoIdx >= 0 ? videoIdx : 0, 0, block);
      return next;
    });
  }, [scanResult, selectedFile]);

  const handleTlAddBlack = useCallback((dur: number) => {
    const newBlock: TimelineBlock = { id: blockId(), type: 'black', duration: dur, label: 'Black' };
    setTimelineBlocks(prev => prev.length < 2 ? ensureVideoBlock(newBlock) : [...prev, newBlock]);
  }, [ensureVideoBlock]);

  const handleTlAddImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          c.getContext('2d')!.drawImage(img, 0, 0);
          c.toBlob(blob => {
            if (!blob) return;
            blob.arrayBuffer().then(buf => {
              const newBlock: TimelineBlock = {
                id: blockId(),
                type: 'slate' as const,
                duration: 5,
                label: file.name.replace(/\.[^.]+$/, ''),
                thumbnail: dataUrl,
                slatePng: new Uint8Array(buf),
              };
              setTimelineBlocks(prev => prev.length < 2 ? ensureVideoBlock(newBlock) : [...prev, newBlock]);
            });
          }, 'image/png');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [ensureVideoBlock]);

  const handleTlAddBip = useCallback(() => {
    const fps = scanResult?.video?.frameRate || 25;
    const newBlock: TimelineBlock = { id: blockId(), type: 'bip', duration: 1 / fps, label: 'Bip' };
    setTimelineBlocks(prev => prev.length < 2 ? ensureVideoBlock(newBlock) : [...prev, newBlock]);
  }, [ensureVideoBlock, scanResult]);

  const handleTimelineExport = useCallback(async (settings?: ExportSettings) => {
    if (!selectedFile || tlExporting) return;
    setShowExportModal(false);
    setTlExporting(true);
    setTlExportPct(0);
    setTlExportLabel('Starting…');

    const codecCfg: ExportCodecConfig = settings
      ? { codec: settings.codec, quality: settings.quality, streamCopy: settings.streamCopy }
      : { codec: 'h264', quality: 'medium' };
    const ext = codecCfg.codec.startsWith('prores') ? 'mov'
      : (codecCfg.codec === 'xdcam' || codecCfg.codec === 'dnxhd' || codecCfg.codec === 'dnxhr') ? 'mxf'
      : 'mp4';

    const subsEnabled = videoPlayerRef.current?.areSubtitlesEnabled() ?? false;
    const subBurnIn: SubtitleBurnIn | undefined =
      subsEnabled && transcription?.segments?.length
        ? { segments: transcription.segments, style: subtitleStyle, maxCharsPerLine: subtitleStyle.maxCharsPerLine }
        : undefined;

    const hasTimeline = timelineBlocks.length >= 2;
    const effectiveBlocks = hasTimeline
      ? timelineBlocks.map(b => ({ type: b.type, duration: b.duration, slatePng: b.slatePng }))
      : [{ type: 'video' as const, duration: 0, slatePng: undefined }];

    try {
      if (settings?.useNative) {
        const { runNativeExport } = await import('../api/helperClient');
        const outputPath = await runNativeExport(
          selectedFile,
          effectiveBlocks,
          { codec: codecCfg.codec, quality: codecCfg.quality, streamCopy: codecCfg.streamCopy },
          (pct, label) => { setTlExportPct(pct); setTlExportLabel(label); },
          subBurnIn,
        );
        setTlExportLabel(`Saved to ${outputPath}`);
        return;
      }

      const url = await exportTimeline(selectedFile, effectiveBlocks, {
        onProgress: (pct, label) => { setTlExportPct(pct); setTlExportLabel(label); },
        codec: codecCfg,
        subtitleBurnIn: subBurnIn,
      });
      const a = document.createElement('a');
      a.download = `${selectedFile.name.replace(/\.[^.]+$/, '')}_edit.${ext}`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Timeline export failed:', err);
      setTlExportLabel(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setTlExporting(false);
    }
  }, [selectedFile, timelineBlocks, tlExporting, transcription, subtitleStyle, videoPlayerRef]);

  return {
    timelineBlocks,
    setTimelineBlocks,
    tlExporting,
    tlExportPct,
    showExportModal,
    setShowExportModal,
    tlPreview,
    tlGlobalTime,
    tlIsPlaying,
    tlRanges,
    tlCurrentBlock,
    handleAddSlateBlock,
    handleTimelineExport,
    handleTlPlayPause,
    handleTlSeek,
    handleTlAddBlack,
    handleTlAddImage,
    handleTlAddBip,
  };
}
