import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, X, Columns, Rows, Layers, Volume2 } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';

type ViewMode = 'side-by-side' | 'overlay-vertical' | 'overlay-horizontal';
type AudioSource = 'A' | 'B' | 'both' | 'none';

interface Props {
  fileA: { projectFile: ProjectFile; src: string };
  fileB: { projectFile: ProjectFile; src: string };
  onClose: () => void;
}

export const VersionCompare: React.FC<Props> = ({ fileA, fileB, onClose }) => {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [audioSource, setAudioSource] = useState<AudioSource>('A');
  const [sliderPos, setSliderPos] = useState(50); // percentage for overlay modes
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  // Sync audio muting based on audioSource
  useEffect(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (a) a.muted = audioSource === 'B' || audioSource === 'none';
    if (b) b.muted = audioSource === 'A' || audioSource === 'none';
  }, [audioSource]);

  const syncPlay = useCallback(() => {
    videoARef.current?.play().catch(() => {});
    videoBRef.current?.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const syncPause = useCallback(() => {
    videoARef.current?.pause();
    videoBRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const syncSeek = useCallback((time: number) => {
    if (videoARef.current) videoARef.current.currentTime = time;
    if (videoBRef.current) videoBRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) syncPause(); else syncPlay();
  }, [isPlaying, syncPlay, syncPause]);

  useEffect(() => {
    const a = videoARef.current;
    if (!a) return;
    const onMeta = () => setDuration(a.duration);
    const onTime = () => setCurrentTime(a.currentTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('timeupdate', onTime);
    return () => { a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('timeupdate', onTime); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, togglePlay]);

  // Slider drag for overlay modes
  const handleSliderMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (viewMode === 'overlay-vertical') {
      setSliderPos(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)));
    } else {
      setSliderPos(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)));
    }
  }, [viewMode]);

  useEffect(() => {
    if (!isDraggingSlider) return;
    const onMove = (e: MouseEvent) => handleSliderMove(e);
    const onUp = () => setIsDraggingSlider(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingSlider, handleSliderMove]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const labelA = fileA.projectFile.versionTag?.toUpperCase() || 'V-A';
  const labelB = fileB.projectFile.versionTag?.toUpperCase() || 'V-B';

  const videoStyleBase: React.CSSProperties = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#000' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '8px 16px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Compare</span>
        <span style={{ fontSize: '0.72rem', color: '#FA4900' }}>{labelA}: {fileA.projectFile.name}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>vs</span>
        <span style={{ fontSize: '0.72rem', color: '#0A84FF' }}>{labelB}: {fileB.projectFile.name}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              className={`btn btn-sm ${viewMode === 'side-by-side' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '3px 8px' }}
              onClick={() => setViewMode('side-by-side')}
              title="Side by side"
            ><Columns size={14} /></button>
            <button
              className={`btn btn-sm ${viewMode === 'overlay-vertical' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '3px 8px' }}
              onClick={() => { setViewMode('overlay-vertical'); setSliderPos(50); }}
              title="Overlay with vertical slider"
            ><Layers size={14} /></button>
            <button
              className={`btn btn-sm ${viewMode === 'overlay-horizontal' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '3px 8px' }}
              onClick={() => { setViewMode('overlay-horizontal'); setSliderPos(50); }}
              title="Overlay with horizontal slider"
            ><Rows size={14} /></button>
          </div>

          {/* Audio selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Volume2 size={14} style={{ color: 'var(--color-text-muted)' }} />
            <select
              value={audioSource}
              onChange={e => setAudioSource(e.target.value as AudioSource)}
              style={{
                background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.72rem', padding: '3px 6px',
              }}
            >
              <option value="A">Audio: {labelA}</option>
              <option value="B">Audio: {labelB}</option>
              <option value="both">Audio: Both</option>
              <option value="none">Audio: Mute</option>
            </select>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px' }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Video area */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: viewMode !== 'side-by-side' ? 'col-resize' : 'pointer' }}
        onClick={viewMode === 'side-by-side' ? togglePlay : undefined}
        onMouseDown={viewMode !== 'side-by-side' ? (e) => { setIsDraggingSlider(true); handleSliderMove(e); } : undefined}
      >
        {viewMode === 'side-by-side' && (
          <div style={{ display: 'flex', gap: '2px', height: '100%', alignItems: 'center', padding: '4px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: 0 }}>
              <div style={{ padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, color: '#FA4900', textTransform: 'uppercase', flexShrink: 0 }}>{labelA}</div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 }}>
                <video ref={videoARef} src={fileA.src} style={videoStyleBase} onClick={togglePlay} />
              </div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)', alignSelf: 'stretch', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: 0 }}>
              <div style={{ padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, color: '#0A84FF', textTransform: 'uppercase', flexShrink: 0 }}>{labelB}</div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 }}>
                <video ref={videoBRef} src={fileB.src} style={videoStyleBase} onClick={togglePlay} />
              </div>
            </div>
          </div>
        )}

        {viewMode === 'overlay-vertical' && (
          <>
            {/* Video B fills entire area */}
            <video ref={videoBRef} src={fileB.src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            {/* Video A clipped to left of slider */}
            <div style={{ position: 'absolute', inset: 0, width: `${sliderPos}%`, overflow: 'hidden' }}>
              <video ref={videoARef} src={fileA.src} style={{ width: `${100 / (sliderPos / 100)}%`, height: '100%', objectFit: 'contain' }} />
            </div>
            {/* Slider line */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: `${sliderPos}%`, width: '3px',
              background: 'var(--color-accent)', cursor: 'col-resize', transform: 'translateX(-1px)',
            }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-accent)', borderRadius: '10px', width: '20px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: '#000', fontWeight: 700 }}>↔</span>
              </div>
            </div>
            {/* Labels */}
            <div style={{ position: 'absolute', top: 8, left: 12, padding: '2px 8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#FA4900' }}>{labelA}</div>
            <div style={{ position: 'absolute', top: 8, right: 12, padding: '2px 8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#0A84FF' }}>{labelB}</div>
          </>
        )}

        {viewMode === 'overlay-horizontal' && (
          <>
            {/* Video B fills entire area */}
            <video ref={videoBRef} src={fileB.src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            {/* Video A clipped to top of slider */}
            <div style={{ position: 'absolute', inset: 0, height: `${sliderPos}%`, overflow: 'hidden' }}>
              <video ref={videoARef} src={fileA.src} style={{ width: '100%', height: `${100 / (sliderPos / 100)}%`, objectFit: 'contain' }} />
            </div>
            {/* Slider line */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: `${sliderPos}%`, height: '3px',
              background: 'var(--color-accent)', cursor: 'row-resize', transform: 'translateY(-1px)',
            }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-accent)', borderRadius: '10px', width: '40px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: '#000', fontWeight: 700 }}>↕</span>
              </div>
            </div>
            {/* Labels */}
            <div style={{ position: 'absolute', top: 8, left: 12, padding: '2px 8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#FA4900' }}>{labelA}</div>
            <div style={{ position: 'absolute', bottom: 8, left: 12, padding: '2px 8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#0A84FF' }}>{labelB}</div>
          </>
        )}
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '8px 16px', borderTop: '1px solid var(--border-color)',
      }}>
        <button className="btn btn-icon btn-sm" onClick={() => syncSeek(0)} title="Restart"><SkipBack size={16} /></button>
        <button className="btn btn-icon btn-sm" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input
          type="range" min={0} max={duration || 1} step={0.04} value={currentTime}
          onChange={e => syncSeek(parseFloat(e.target.value))}
          aria-label="Compare timeline"
          style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
};
