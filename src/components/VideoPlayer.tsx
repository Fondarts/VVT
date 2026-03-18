import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Camera,
  Grid3X3,
  Maximize,
  Subtitles,
  Loader2,
  X,
} from 'lucide-react';
import { overlayPresets } from '../shared/presets';
import type { TranscriptionSegment, AnnotationStroke } from '../shared/types';
import { AnnotationCanvas } from './AnnotationCanvas';


const AUTHOR_PALETTE = ['#FA4900', '#7C3AED', '#059669', '#2563EB', '#D97706', '#DB2777', '#0891B2', '#65A30D'];
function authorColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AUTHOR_PALETTE[Math.abs(h) % AUTHOR_PALETTE.length];
}
function authorInitial(name: string): string {
  return (name || '?').trim()[0].toUpperCase();
}

interface VideoPlayerProps {
  videoSrc: string;        // Blob URL — updated by parent when transcode is done
  videoCodec?: string;     // Used only for the spinner label
  isTranscoding?: boolean; // Controlled by parent
  transcodeProgress?: number; // 0–100
  transcodeError?: string | null;
  videoWidth: number;
  videoHeight: number;
  frameRate: number;
  subtitles?: TranscriptionSegment[];
  compact?: boolean;       // Reduces video max-height so overlay controls stay in view
  markers?: { time: number; id: string; author: string }[];
  markerRanges?: { start: number; end: number; id: string; author: string }[];
  onMarkerMove?: (id: string, newTime: number) => void;
  onMarkerRangeMove?: (id: string, newStart: number, newEnd: number) => void;
  onPlaceMarker?: (start: number, end: number, strokes: AnnotationStroke[]) => void;
  onMarkerSetRange?: (id: string, end: number) => void;
  annotationOverlay?: AnnotationStroke[] | null;
  onAnnotationDismiss?: () => void;
  onSnapshot?: (time: number) => void;
  onTimeUpdate?: (time: number) => void;
  onVideoReady?: (el: HTMLVideoElement) => void;
}

export interface VideoPlayerHandle {
  seekTo: (ms: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
  startDraw: (color: string, tool: 'draw' | 'text' | 'eraser') => void;
  captureDrawStrokes: () => AnnotationStroke[];
  setLineWidth: (w: number) => void;
  undoLastStroke: () => void;
  initializeDrawStrokes: (strokes: AnnotationStroke[]) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  videoSrc,
  videoCodec,
  isTranscoding = false,
  transcodeProgress = 0,
  transcodeError = null,
  videoWidth,
  videoHeight,
  frameRate,
  subtitles,
  compact = false,
  markers,
  markerRanges,
  onMarkerMove,
  onMarkerRangeMove,
  onPlaceMarker,
  onMarkerSetRange,
  annotationOverlay,
  onAnnotationDismiss,
  onSnapshot,
  onTimeUpdate,
  onVideoReady,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineWrapRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const playheadRafRef = useRef<number>(0);
  const frameRateRef = useRef(frameRate);
  useEffect(() => { frameRateRef.current = frameRate; }, [frameRate]);
  const durationRef = useRef(0);
  const lastMarkerPointerDownRef = useRef(0);
  const activeDragRef = useRef<{ id: string; type: 'point' | 'range'; rangeOffset: number; rangeDuration: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragOverride, setDragOverride] = useState<{ id: string; time?: number; start?: number; end?: number } | null>(null);
  const [pendingMarker, setPendingMarker] = useState<{ start: number; end: number } | null>(null);
  const pendingDragSide = useRef<'start' | 'end' | null>(null);
  const [selectedBracket, setSelectedBracket] = useState<'start' | 'end' | null>(null);
  const [pendingRangeForId, setPendingRangeForId] = useState<string | null>(null);
  const pendingRangeForIdRef = useRef<string | null>(null);
  useEffect(() => { pendingRangeForIdRef.current = pendingRangeForId; }, [pendingRangeForId]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Keyboard control: arrow keys → frame step (global) or bracket nudge (when bracket selected)
  useEffect(() => {
    const frameDur = frameRate ? 1 / frameRate : 1 / 25;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      const frames = e.shiftKey ? 5 : 1;
      const delta = (e.key === 'ArrowRight' ? 1 : -1) * frameDur * frames;
      if (selectedBracket && pendingMarker) {
        setPendingMarker(prev => {
          if (!prev) return null;
          const dur = durationRef.current;
          if (selectedBracket === 'start') {
            const s = Math.max(0, Math.min(prev.end, prev.start + delta));
            if (videoRef.current) videoRef.current.currentTime = s;
            return { start: s, end: prev.end };
          } else {
            const en = Math.max(prev.start, Math.min(dur, prev.end + delta));
            if (videoRef.current) videoRef.current.currentTime = en;
            return { start: prev.start, end: en };
          }
        });
      } else {
        const video = videoRef.current;
        if (!video) return;
        if (!video.paused) { video.pause(); setIsPlaying(false); }
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBracket, frameRate, pendingMarker]);

  // Drawing state
  const [drawActive, setDrawActive] = useState(false);
  const [drawTool, setDrawTool] = useState<'draw' | 'text' | 'eraser'>('draw');
  const [drawColor, setDrawColor] = useState('#FA4900');
  const [drawLineWidth, setDrawLineWidth] = useState(3);
  const [drawStrokes, setDrawStrokes] = useState<AnnotationStroke[]>([]);
  const drawStrokesRef = useRef<AnnotationStroke[]>([]);
  useEffect(() => { drawStrokesRef.current = drawStrokes; }, [drawStrokes]);
  const [selectedOverlay, setSelectedOverlay] = useState<string>('');
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [zoom, setZoom] = useState(1);
  // Native dimensions from the <video> element — available before scan result arrives
  const [nativeWidth, setNativeWidth] = useState(0);
  const [nativeHeight, setNativeHeight] = useState(0);

  useImperativeHandle(ref, () => ({
    seekTo(ms: number) {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = ms / 1000;
      setCurrentTime(ms / 1000);
    },
    getVideoElement() {
      return videoRef.current;
    },
    startDraw(color: string, tool: 'draw' | 'text' | 'eraser') {
      // Pause so the drawing is anchored to the current frame
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      setDrawColor(color);
      setDrawTool(tool);
      setDrawActive(true);
    },
    captureDrawStrokes(): AnnotationStroke[] {
      const strokes = drawStrokesRef.current;
      setDrawStrokes([]);
      setDrawActive(false);
      return strokes;
    },
    setLineWidth(w: number) {
      setDrawLineWidth(Math.max(1, Math.min(40, w)));
    },
    undoLastStroke() {
      setDrawStrokes(s => s.slice(0, -1));
    },
    initializeDrawStrokes(strokes: AnnotationStroke[]) {
      setDrawStrokes(strokes);
    },
  }));


  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      durationRef.current = video.duration;
      setNativeWidth(video.videoWidth);
      setNativeHeight(video.videoHeight);
      onVideoReady?.(video);
    };

    const handlePlay = () => {
      // Stop drawing when playback resumes so strokes don't float over wrong frames
      setDrawActive(false);
      setDrawStrokes([]);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
    };
  }, [onTimeUpdate, onVideoReady]);

  // Format timecode — standalone so rAF loop can call it
  const fmtTC = (seconds: number) => {
    const fps = frameRateRef.current ?? 25;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * fps);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}:${f.toString().padStart(2,'0')}`;
  };

  // Smooth scrubber + timecode — rAF loop directly updates DOM while playing
  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const t = videoRef.current?.currentTime ?? 0;
      const dur = durationRef.current;
      if (rangeRef.current) rangeRef.current.value = String(t);
      if (timecodeRef.current) timecodeRef.current.textContent = `${fmtTC(t)} / ${fmtTC(dur)}`;
      playheadRafRef.current = requestAnimationFrame(tick);
    };
    playheadRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playheadRafRef.current);
  }, [isPlaying]);

  // Sync DOM when paused (seek buttons, frame step, scrub)
  useEffect(() => {
    if (isPlaying) return;
    if (rangeRef.current) rangeRef.current.value = String(currentTime);
    if (timecodeRef.current) timecodeRef.current.textContent = `${fmtTC(currentTime)} / ${fmtTC(duration)}`;
  }, [currentTime, duration, isPlaying]);

  // Render annotationOverlay strokes to canvas (handles eraser via destination-out)
  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width) || 1;
    const h = Math.round(rect.height) || 1;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!annotationOverlay || annotationOverlay.length === 0) return;
    for (const s of annotationOverlay) {
      if ((s.type === 'path' || s.type === 'eraser') && s.points && s.points.length > 1) {
        ctx.save();
        if (s.type === 'eraser') ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.strokeStyle = s.type === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
        ctx.lineWidth = s.lineWidth ?? 3;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
        ctx.stroke();
        ctx.restore();
      } else if (s.type === 'text' && s.text && s.x !== undefined && s.y !== undefined) {
        const fs = Math.round((s.fontSize ?? 0.028) * h);
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = s.color;
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.fillText(s.text, s.x * w, s.y * h);
        ctx.shadowBlur = 0;
      }
    }
  }, [annotationOverlay]);

  // Draw overlays on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!selectedOverlay) return;

    const overlay = overlayPresets.find(o => o.id === selectedOverlay);
    if (!overlay) return;

    const w = videoWidth || nativeWidth;
    const h = videoHeight || nativeHeight;
    if (!w || !h) return;
    const videoAspect = w / h;
    const containerAspect = rect.width / rect.height;

    let drawWidth = rect.width;
    let drawHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > containerAspect) {
      drawHeight = rect.width / videoAspect;
      offsetY = (rect.height - drawHeight) / 2;
    } else {
      drawWidth = rect.height * videoAspect;
      offsetX = (rect.width - drawWidth) / 2;
    }

    const zoomedWidth = drawWidth * zoom;
    const zoomedHeight = drawHeight * zoom;
    offsetX -= (zoomedWidth - drawWidth) / 2;
    offsetY -= (zoomedHeight - drawHeight) / 2;

    const overlayAspect = overlay.ratioValue ?? (overlay.width && overlay.height ? overlay.width / overlay.height : videoAspect);
    let overlayW = zoomedWidth;
    let overlayH = zoomedHeight;
    let overlayX = offsetX;
    let overlayY = offsetY;

    if (overlayAspect > videoAspect) {
      overlayH = overlayW / overlayAspect;
      overlayY = offsetY + (zoomedHeight - overlayH) / 2;
    } else {
      overlayW = overlayH * overlayAspect;
      overlayX = offsetX + (zoomedWidth - overlayW) / 2;
    }

    ctx.save();

    if (overlay.imagePath) {
      // Image-based safe zone overlay — served from /safezones/ static assets
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.drawImage(img, overlayX, overlayY, overlayW, overlayH);

        if (showGrid) {
          drawGrid(ctx, overlayX, overlayY, overlayW, overlayH);
        }
        ctx.restore();
      };
      img.src = `/safezones/${overlay.imagePath}`;
    } else {
      // Programmatic safe zone guide
      ctx.strokeStyle = '#FA4900';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);

      if (showSafeAreas) {
        const titleRatio = overlay.safeTitlePercent != null ? overlay.safeTitlePercent / 100 : overlay.safeTitleMargin ?? 0.9;
        const titleMarginW = overlayW * (1 - titleRatio) / 2;
        const titleMarginH = overlayH * (1 - titleRatio) / 2;

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
          overlayX + titleMarginW,
          overlayY + titleMarginH,
          overlayW - titleMarginW * 2,
          overlayH - titleMarginH * 2
        );

        const actionRatio = overlay.safeActionPercent != null ? overlay.safeActionPercent / 100 : overlay.safeActionMargin ?? 0.8;
        const actionMarginW = overlayW * (1 - actionRatio) / 2;
        const actionMarginH = overlayH * (1 - actionRatio) / 2;

        ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(
          overlayX + actionMarginW,
          overlayY + actionMarginH,
          overlayW - actionMarginW * 2,
          overlayH - actionMarginH * 2
        );
      }

      if (showGrid) {
        ctx.setLineDash([]);
        drawGrid(ctx, overlayX, overlayY, overlayW, overlayH);
      }
    }

    ctx.restore();
  }, [selectedOverlay, showSafeAreas, showGrid, zoom, videoWidth, videoHeight, nativeWidth, nativeHeight]);

  // ── Marker drag helpers ────────────────────────────────────────────
  const timeFromX = (clientX: number): number => {
    const el = timelineWrapRef.current;
    const dur = durationRef.current;
    if (!el || !dur) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - rect.left) / rect.width) * dur));
  };

  // Also expose timeFromX as getTimeFromX for inline JSX calls
  const getTimeFromX = timeFromX;

  const handleMarkerPointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'point' | 'range',
    rangeOffset = 0,
    rangeDuration = 0,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    lastMarkerPointerDownRef.current = Date.now();
    activeDragRef.current = { id, type, rangeOffset, rangeDuration };

    let hasMoved = false;
    const startX = e.clientX;

    const onMove = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag) return;
      // Require at least 4px movement to count as drag
      if (!hasMoved && Math.abs(ev.clientX - startX) < 4) return;
      hasMoved = true;
      const dur = durationRef.current;
      const t = timeFromX(ev.clientX);
      if (drag.type === 'point') {
        setDragOverride({ id: drag.id, time: t });
        if (videoRef.current) videoRef.current.currentTime = t;
      } else {
        const newStart = Math.max(0, t - drag.rangeOffset);
        const newEnd = Math.min(dur, newStart + drag.rangeDuration);
        const clampedStart = Math.max(0, newEnd - drag.rangeDuration);
        setDragOverride({ id: drag.id, start: clampedStart, end: newEnd });
        if (videoRef.current) videoRef.current.currentTime = clampedStart;
      }
    };

    const onUp = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      activeDragRef.current = null;
      setDragOverride(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!drag || !hasMoved) return;   // click sin drag → no guardar
      const dur = durationRef.current;
      const t = timeFromX(ev.clientX);
      if (drag.type === 'point') {
        onMarkerMove?.(drag.id, t);
        if (pendingRangeForIdRef.current === drag.id)
          setPendingMarker(prev => prev ? { ...prev, start: t } : null);
      } else {
        const newStart = Math.max(0, t - drag.rangeOffset);
        const newEnd = Math.min(dur, newStart + drag.rangeDuration);
        const clampedStart = Math.max(0, newEnd - drag.rangeDuration);
        onMarkerRangeMove?.(drag.id, clampedStart, newEnd);
        if (pendingRangeForIdRef.current === drag.id)
          setPendingMarker(prev => prev ? { ...prev, start: clampedStart } : null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const handleBracketPointerDown = (e: React.PointerEvent, side: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    pendingDragSide.current = side;
    setSelectedBracket(side);
    let finalTime = side === 'start' ? (pendingMarker?.start ?? 0) : (pendingMarker?.end ?? 0);
    const onMove = (ev: PointerEvent) => {
      const t = timeFromX(ev.clientX);
      setPendingMarker(prev => {
        if (!prev) return null;
        if (side === 'start') {
          finalTime = Math.min(t, prev.end);
          return { start: finalTime, end: prev.end };
        }
        finalTime = Math.max(t, prev.start);
        return { start: prev.start, end: finalTime };
      });
    };
    const onUp = () => {
      pendingDragSide.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const rangeId = pendingRangeForIdRef.current;
      if (rangeId) {
        onMarkerSetRange?.(rangeId, finalTime);
        setPendingRangeForId(null);
        setPendingMarker(null);
        setSelectedBracket(null);
      } else {
        setPendingMarker(prev => {
          if (!prev) return null;
          const seekTime = side === 'start' ? prev.start : prev.end;
          if (videoRef.current) videoRef.current.currentTime = seekTime;
          return prev;
        });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  // ──────────────────────────────────────────────────────────────────

  function drawGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    for (let i = 1; i < 3; i++) {
      const gx = x + (w / 3) * i;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
      ctx.stroke();

      const gy = y + (h / 3) * i;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + w, cy);
    ctx.stroke();
  }

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }, []);

  const stepFrame = useCallback((direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video || !frameRate) return;
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
    }
    const frameDuration = 1 / frameRate;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + direction * frameDuration));
  }, [frameRate]);

  const takeSnapshot = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    onSnapshot?.(video.currentTime);
  }, [onSnapshot]);

  const formatTime = (seconds: number) => {
    const fps = frameRate || 25;
    const h   = Math.floor(seconds / 3600);
    const m   = Math.floor((seconds % 3600) / 60);
    const s   = Math.floor(seconds % 60);
    const f   = Math.floor((seconds % 1) * fps);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  // Find the subtitle segment that matches the current playback time
  const currentTimeMs = currentTime * 1000;
  const currentSubtitle = subtitles?.find(
    seg => currentTimeMs >= seg.from && currentTimeMs <= seg.to
  )?.text ?? null;

  const guidePresets = overlayPresets.filter(o => o.group === 'guides');
  const safezoneImagePresets = overlayPresets.filter(o => o.group === 'safezones');
  const selectedOverlayObj = overlayPresets.find(o => o.id === selectedOverlay);
  const isImageOverlay = !!selectedOverlayObj?.imagePath;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Drawing canvas — interactive overlay on video element */}
      {drawActive && videoRef.current && (
        <AnnotationCanvas
          targetEl={videoRef.current}
          color={drawColor}
          lineWidth={drawLineWidth}
          tool={drawTool}
          strokes={drawStrokes}
          onStrokesChange={setDrawStrokes}
        />
      )}


      <div
        ref={containerRef}
        style={{
          position: 'relative',
          background: '#000',
          width: '100%',
          maxHeight: compact ? '300px' : 'calc(100vh - 440px)',
          aspectRatio: (videoWidth || nativeWidth) && (videoHeight || nativeHeight)
            ? `${videoWidth || nativeWidth}/${videoHeight || nativeHeight}`
            : '16/9',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          src={isTranscoding ? undefined : videoSrc}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onClick={togglePlay}
        />
        {isTranscoding && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', color: '#fff', gap: '12px',
          }}>
            <Loader2 size={32} className="animate-spin" />
            <span style={{ fontSize: '0.875rem' }}>Converting for preview…</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{videoCodec?.toUpperCase()} → H.264</span>
            {transcodeProgress > 0 && (
              <div style={{ width: '200px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }}>
                <div style={{ width: `${transcodeProgress}%`, height: '100%', background: 'var(--color-accent)', borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
            )}
          </div>
        )}
        {transcodeError && !isTranscoding && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', color: '#f87171', gap: '8px',
          }}>
            <span style={{ fontSize: '0.875rem' }}>Preview conversion failed</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, maxWidth: '80%', textAlign: 'center' }}>{transcodeError}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
        {/* Annotation overlay — vector SVG */}
        {annotationOverlay && annotationOverlay.length > 0 && !drawActive && (
          <>
            <canvas
              ref={annotationCanvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            />
            <button
              onClick={e => { e.stopPropagation(); onAnnotationDismiss?.(); }}
              title="Hide annotation"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 6,
                background: 'rgba(0,0,0,0.65)',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          </>
        )}

        {/* Subtitle overlay */}
        {showSubtitles && currentSubtitle && (
          <div
            style={{
              position: 'absolute',
              bottom: '8%',
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <span
              style={{
                background: 'rgba(0,0,0,0.78)',
                color: '#fff',
                padding: '4px 14px',
                borderRadius: '4px',
                fontSize: 'clamp(0.7rem, 1.8vw, 1rem)',
                maxWidth: '82%',
                textAlign: 'center',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
              }}
            >
              {currentSubtitle}
            </span>
          </div>
        )}
      </div>

      {/* Timeline scrubber */}
      <div style={{ padding: '10px 12px 0', borderTop: '1px solid var(--border-color)', background: 'var(--color-bg-primary)' }}>
        <div ref={timelineWrapRef} onDoubleClick={e => e.preventDefault()} style={{ position: 'relative', paddingBottom: '16px' }}>
          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={duration || 1}
            step={frameRate ? 1 / frameRate : 0.04}
            defaultValue={0}
            onChange={e => {
              const t = parseFloat(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = t;
              setCurrentTime(t);
            }}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#FA4900', height: '4px' }}
          />
          {/* Comment markers — point circle with author initial */}
          {duration > 0 && markers?.map((m) => {
            const isDragging = dragOverride?.id === m.id && dragOverride.time !== undefined;
            const t = isDragging ? dragOverride!.time! : m.time;
            const bgColor = isDragging ? '#ffffff' : authorColor(m.author);
            const textColor = isDragging ? '#000' : '#fff';
            return (
              <div
                key={m.id}
                title={`${m.author} — ${formatTime(t)}`}
                onPointerDown={e => handleMarkerPointerDown(e, m.id, 'point')}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const nudge = frameRateRef.current ? 1 / frameRateRef.current : 0.04;
                  setPendingMarker({ start: m.time, end: Math.min(durationRef.current, m.time + nudge) });
                  setPendingRangeForId(m.id);
                  setSelectedBracket('end');
                }}
                style={{
                  position: 'absolute',
                  left: `${(t / duration) * 100}%`,
                  top: '100%',
                  transform: 'translate(-50%, -12px)',
                  width: 20, height: 20,
                  borderRadius: '50%',
                  background: bgColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 700, color: textColor,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: 3,
                  touchAction: 'none',
                  userSelect: 'none',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  pointerEvents: 'all',
                }}
              >
                {authorInitial(m.author)}
              </div>
            );
          })}
          {/* Comment markers — range (circle + line) */}
          {duration > 0 && markerRanges?.map((r) => {
            const isEditingRange = pendingRangeForId === r.id;
            const isDragging = dragOverride?.id === r.id && dragOverride.start !== undefined;
            const start = isDragging ? dragOverride!.start! : r.start;
            const end   = isDragging ? dragOverride!.end!   : r.end;
            const bgColor = isDragging ? '#ffffff' : authorColor(r.author);
            const lineColor = isDragging ? '#ffffff' : authorColor(r.author);
            const textColor = isDragging ? '#000' : '#fff';
            const widthPct = Math.max(0.5, ((end - start) / duration) * 100);
            return (
              <div key={r.id} style={{ position: 'absolute', left: `${(start / duration) * 100}%`, width: `${widthPct}%`, top: '100%', transform: 'translateY(-12px)', zIndex: 3, pointerEvents: 'none' }}>
                {/* Circle */}
                <div
                  title={`${r.author} — ${formatTime(start)} – ${formatTime(end)}`}
                  onPointerDown={e => handleMarkerPointerDown(e, r.id, 'range', getTimeFromX(e.clientX) - r.start, r.end - r.start)}
                  onClick={e => {
                    e.stopPropagation();
                    if (!isDragging) {
                      setPendingMarker({ start: r.start, end: r.end });
                      setPendingRangeForId(r.id);
                      setSelectedBracket('end');
                    }
                  }}
                  onDoubleClick={e => { e.preventDefault(); e.stopPropagation(); }}
                  style={{
                    position: 'absolute', left: 0, top: 0,
                    width: 20, height: 20, borderRadius: '50%',
                    background: bgColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 700, color: textColor,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none', userSelect: 'none',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    pointerEvents: 'all', zIndex: 3,
                  }}
                >
                  {authorInitial(r.author)}
                </div>
                {/* Line from circle edge to end — hidden while re-editing */}
                {!isEditingRange && <div style={{
                  position: 'absolute',
                  left: '20px',
                  top: '9px',
                  right: 0,
                  height: '2px',
                  background: lineColor,
                  opacity: 0.6,
                  pointerEvents: 'none',
                }} />}
              </div>
            );
          })}
          {/* Pending marker brackets */}
          {duration > 0 && pendingMarker && (() => {
            const dragStart = pendingRangeForId && dragOverride?.id === pendingRangeForId && dragOverride.start !== undefined ? dragOverride.start : null;
            const ps = dragStart ?? pendingMarker.start;
            const pe = pendingMarker.end;
            const colorL = '#ffffff';
            const colorR = '#ffffff';
            const BracketL = () => (
              <div style={{ width: '10px', height: '20px', background: colorL, borderRadius: '50% 0 0 50%', pointerEvents: 'none' }} />
            );
            const BracketR = () => (
              <div style={{ width: '10px', height: '20px', background: colorR, borderRadius: pe >= ps ? '0 50% 50% 0' : '50% 0 0 50%', pointerEvents: 'none' }} />
            );
            return (
              <>
                {/* [ bracket — only when not extending an existing comment */}
                {!pendingRangeForId && (
                  <div
                    onPointerDown={e => handleBracketPointerDown(e, 'start')}
                    style={{
                      position: 'absolute',
                      left: `${(ps / duration) * 100}%`,
                      top: '100%',
                      transform: 'translate(-50%, -12px)',
                      cursor: 'ew-resize',
                      zIndex: 4,
                      padding: '0 4px',
                      touchAction: 'none',
                      userSelect: 'none',
                    }}
                  >
                    <BracketL />
                  </div>
                )}
                {/* Connecting line — behind markers, always left→right */}
                <div style={{
                  position: 'absolute',
                  left: `${(Math.min(ps, pe) / duration) * 100}%`,
                  width: `${(Math.abs(pe - ps) / duration) * 100}%`,
                  top: '100%',
                  transform: 'translateY(-2px)',
                  height: '2px',
                  background: colorR,
                  opacity: 0.7,
                  pointerEvents: 'none',
                  zIndex: 2,
                }} />
                {/* ] bracket — drag to move end */}
                <div
                  onPointerDown={e => handleBracketPointerDown(e, 'end')}
                  style={{
                    position: 'absolute',
                    left: `${(pe / duration) * 100}%`,
                    top: '100%',
                    transform: 'translate(-50%, -12px)',
                    cursor: 'ew-resize',
                    zIndex: 4,
                    padding: '0 4px',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  <BracketR />
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: '8px 16px 12px' }}>
        {/* Playback */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <button className="btn btn-icon btn-sm" onClick={() => seek(-10)} title="-10s">
            <SkipBack size={16} />
          </button>
          <button className="btn btn-icon btn-sm" onClick={() => stepFrame(-1)} title="Previous frame">
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn-icon" onClick={togglePlay}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button className="btn btn-icon btn-sm" onClick={() => stepFrame(1)} title="Next frame">
            <ChevronRight size={16} />
          </button>
          <button className="btn btn-icon btn-sm" onClick={() => seek(10)} title="+10s">
            <SkipForward size={16} />
          </button>
          <span ref={timecodeRef} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', minWidth: '80px' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          {/* Pending marker confirm/cancel — only for new markers, not range-extension */}
          {pendingMarker && !pendingRangeForId && (
            <>
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (pendingRangeForId) {
                    onMarkerSetRange?.(pendingRangeForId, pendingMarker.end);
                    setPendingRangeForId(null);
                  } else {
                    onPlaceMarker?.(pendingMarker.start, pendingMarker.end, drawStrokes);
                  }
                  setPendingMarker(null);
                  setSelectedBracket(null);
                  setDrawStrokes([]);
                  setDrawActive(false);
                }}
                title={pendingRangeForId ? 'Confirm range' : 'Confirm marker and add comment'}
                style={{ background: '#FA4900', color: '#000', fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {pendingRangeForId ? '✓ Set range' : '✓ Add comment'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setPendingMarker(null); setSelectedBracket(null); setPendingRangeForId(null); }}
                title="Cancel"
              >
                <X size={13} />
              </button>
            </>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={takeSnapshot}
            style={{ marginLeft: 'auto' }}
          >
            <Camera size={14} style={{ marginRight: '4px', display: 'inline' }} />
            Snapshot
          </button>
        </div>

        {/* Overlay controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={selectedOverlay}
            onChange={e => setSelectedOverlay(e.target.value)}
            style={{
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              minWidth: '220px',
            }}
          >
            <option value="">— No overlay —</option>
            <optgroup label="Aspect Ratio Guides">
              {guidePresets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </optgroup>
            <optgroup label="Safe Zone Images">
              {safezoneImagePresets.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </optgroup>
          </select>

          {!isImageOverlay && (
            <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>
              <input
                type="checkbox"
                className="toggle-checkbox"
                checked={showSafeAreas}
                onChange={e => setShowSafeAreas(e.target.checked)}
                disabled={!selectedOverlay}
              />
              <span className="toggle-slider" style={{ opacity: selectedOverlay ? 1 : 0.5 }}></span>
              <span>Safe Areas</span>
            </label>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>
              <input
                type="checkbox"
                className="toggle-checkbox"
                checked={showGrid}
                onChange={e => setShowGrid(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <Grid3X3 size={12} style={{ display: 'inline' }} />
              <span>Grid</span>
            </label>
            <Maximize size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              type="range"
              min="1"
              max="2"
              step="0.1"
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              style={{ width: '70px' }}
            />
          </div>

          {subtitles && subtitles.length > 0 && (
            <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.75rem' }}>
              <input
                type="checkbox"
                className="toggle-checkbox"
                checked={showSubtitles}
                onChange={e => setShowSubtitles(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <Subtitles size={12} style={{ display: 'inline' }} />
              <span>Subtitles</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
