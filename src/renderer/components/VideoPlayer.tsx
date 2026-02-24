import React, { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
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
  Video,
  Subtitles,
} from 'lucide-react';
import { overlayPresets } from '../../shared/presets';
import type { TranscriptionSegment } from '../../shared/types';

interface VideoPlayerProps {
  filePath: string;
  videoWidth: number;
  videoHeight: number;
  frameRate: number;
  subtitles?: TranscriptionSegment[];
  onSnapshot?: (time: number) => void;
  onTimeUpdate?: (time: number) => void;
}

export interface VideoPlayerHandle {
  seekTo: (ms: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  filePath,
  videoWidth,
  videoHeight,
  frameRate,
  subtitles,
  onSnapshot,
  onTimeUpdate,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedOverlay, setSelectedOverlay] = useState<string>('');
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [safezoneDir, setSafezoneDir] = useState<string>('');

  useImperativeHandle(ref, () => ({
    seekTo(ms: number) {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = ms / 1000;
      setCurrentTime(ms / 1000);
    },
  }));

  useEffect(() => {
    window.electronAPI.app.getSafezoneDir().then(setSafezoneDir);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [onTimeUpdate]);

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

    const videoAspect = videoWidth / videoHeight;
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

    if (overlay.imagePath && safezoneDir) {
      // Image-based safe zone overlay
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
      img.src = `file://${safezoneDir}/${overlay.imagePath}`;
    } else {
      // Programmatic safe zone guide
      ctx.strokeStyle = '#3b82f6';
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
  }, [selectedOverlay, showSafeAreas, showGrid, zoom, videoWidth, videoHeight, safezoneDir]);

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
      <div className="card-header" style={{ padding: '12px 16px' }}>
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>
          <Video size={14} style={{ marginRight: '8px', display: 'inline' }} />
          Video Preview
        </h3>
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'relative',
          background: '#000',
          width: '100%',
          maxHeight: '480px',
          aspectRatio: `${videoWidth}/${videoHeight}`,
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          src={`file://${filePath}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onClick={togglePlay}
        />
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
      <div style={{ padding: '8px 12px 0', borderTop: '1px solid var(--border-color)', background: 'var(--color-bg-primary)' }}>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={frameRate ? 1 / frameRate : 0.04}
          value={currentTime}
          onChange={e => {
            const t = parseFloat(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = t;
            setCurrentTime(t);
          }}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#3b82f6', height: '4px' }}
        />
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', minWidth: '80px' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
            <Maximize size={12} />
            <span>Zoom:</span>
            <input
              type="range"
              min="1"
              max="2"
              step="0.1"
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              style={{ width: '80px' }}
            />
          </label>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
