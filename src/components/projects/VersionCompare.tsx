import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, X } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';

interface Props {
  fileA: { projectFile: ProjectFile; src: string };
  fileB: { projectFile: ProjectFile; src: string };
  onClose: () => void;
}

export const VersionCompare: React.FC<Props> = ({ fileA, fileB, onClose }) => {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const syncPlay = useCallback(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;
    a.play().catch(() => {});
    b.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const syncPause = useCallback(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (a) a.pause();
    if (b) b.pause();
    setIsPlaying(false);
  }, []);

  const syncSeek = useCallback((time: number) => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (a) a.currentTime = time;
    if (b) b.currentTime = time;
    setCurrentTime(time);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) syncPause();
    else syncPlay();
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

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Compare Versions</span>
          <div style={{ display: 'flex', gap: '24px', fontSize: '0.75rem' }}>
            <span style={{ color: '#FA4900' }}>
              A: {fileA.projectFile.versionTag?.toUpperCase() || 'V0'} — {fileA.projectFile.name}
            </span>
            <span style={{ color: '#0A84FF' }}>
              B: {fileB.projectFile.versionTag?.toUpperCase() || 'V0'} — {fileB.projectFile.name}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}>
          <X size={16} /> Close
        </button>
      </div>

      {/* Videos side by side */}
      <div style={{ flex: 1, display: 'flex', gap: '4px', overflow: 'hidden', padding: '8px', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, height: '100%' }}>
          <div style={{
            padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700,
            color: '#FA4900', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
          }}>
            {fileA.projectFile.versionTag?.toUpperCase() || 'Version A'}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 }}>
            <video
              ref={videoARef}
              src={fileA.src}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#000', borderRadius: '6px' }}
              onClick={togglePlay}
            />
          </div>
        </div>
        <div style={{ width: '1px', background: 'var(--border-color)', alignSelf: 'stretch', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, height: '100%' }}>
          <div style={{
            padding: '4px 8px', fontSize: '0.68rem', fontWeight: 700,
            color: '#0A84FF', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
          }}>
            {fileB.projectFile.versionTag?.toUpperCase() || 'Version B'}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 }}>
            <video
              ref={videoBRef}
              src={fileB.src}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#000', borderRadius: '6px' }}
              onClick={togglePlay}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 20px', borderTop: '1px solid var(--border-color)',
      }}>
        <button className="btn btn-icon btn-sm" onClick={() => syncSeek(0)} title="Restart">
          <SkipBack size={16} />
        </button>
        <button className="btn btn-icon btn-sm" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.04}
          value={currentTime}
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
