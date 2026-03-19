import React, { useState, useRef, useCallback } from 'react';
import { Trash2, Plus, Film, Loader2 } from 'lucide-react';

export interface TimelineBlock {
  id: string;
  type: 'slate' | 'video' | 'black';
  duration: number;         // seconds
  label: string;
  thumbnail?: string;       // data URL for slate preview
  slatePng?: Uint8Array;    // PNG bytes for export
}

export interface TimelinePreview {
  blockType: 'slate' | 'video' | 'black';
  videoOffset?: number;
  thumbnail?: string;
}

let _bid = 0;
export const blockId = () => `blk_${++_bid}`;

function formatTlTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const fr = Math.floor((s % 1) * 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(fr).padStart(2, '0')}`;
}

const BLOCK_COLORS: Record<TimelineBlock['type'], string> = {
  slate: '#7C3AED',
  video: '#2563EB',
  black: '#444444',
};

interface Props {
  blocks: TimelineBlock[];
  onChange: (blocks: TimelineBlock[]) => void;
  onExport: () => void;
  exporting: boolean;
  exportPct: number;
  exportLabel: string;
  videoDuration?: number;
  onPreview?: (preview: TimelinePreview | null) => void;
  globalTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

export const EditTimeline: React.FC<Props> = ({
  blocks,
  onChange,
  onExport,
  exporting,
  exportPct,
  exportLabel,
  globalTime,
  isPlaying,
  onPlayPause,
  onSeek,
}) => {
  const [newBlackDur, setNewBlackDur] = useState(3);
  const barRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const totalDuration = blocks.reduce((s, b) => s + b.duration, 0);
  const playheadPct = totalDuration > 0 ? Math.min(100, (globalTime / totalDuration) * 100) : 0;

  const removeBlock = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange(blocks.filter(b => b.id !== id));
  };

  const addBlack = () => {
    onChange([...blocks, { id: blockId(), type: 'black', duration: newBlackDur, label: 'Black' }]);
  };

  /* ── Scrub on timeline bar ── */
  const seekFromMouse = useCallback((clientX: number) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(pct * totalDuration);
  }, [totalDuration, onSeek]);

  const handleBarMouseDown = (e: React.MouseEvent) => {
    // Only seek if clicking directly on the bar background (not dragging a block)
    if ((e.target as HTMLElement).dataset.blockId) return;
    seekFromMouse(e.clientX);

    const handleMove = (ev: MouseEvent) => seekFromMouse(ev.clientX);
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  /* ── Drag-to-reorder blocks within the bar ── */
  const handleBlockDragStart = (e: React.DragEvent, blockId: string) => {
    setDragId(blockId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleBlockDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(idx);
  };

  const handleBlockDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (!dragId) return;
    const srcIdx = blocks.findIndex(b => b.id === dragId);
    if (srcIdx === -1 || srcIdx === targetIdx) { setDragId(null); setDropTarget(null); return; }
    const next = [...blocks];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setDragId(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => { setDragId(null); setDropTarget(null); };

  if (blocks.length === 0) return null;

  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      borderRadius: '6px',
      padding: '6px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    }}>
      {/* ── Timeline bar with draggable blocks ── */}
      <div
        ref={barRef}
        onMouseDown={handleBarMouseDown}
        style={{
          display: 'flex',
          height: '40px',
          borderRadius: '4px',
          overflow: 'visible',
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {blocks.map((b, i) => {
          const pct = totalDuration > 0 ? (b.duration / totalDuration) * 100 : 0;
          const isDragging = dragId === b.id;
          const isDropTarget = dropTarget === i && dragId !== b.id;
          return (
            <div
              key={b.id}
              data-block-id={b.id}
              draggable
              onDragStart={e => handleBlockDragStart(e, b.id)}
              onDragOver={e => handleBlockDragOver(e, i)}
              onDrop={e => handleBlockDrop(e, i)}
              onDragEnd={handleDragEnd}
              title={`${b.label} — ${b.duration.toFixed(1)}s\nDrag to reorder`}
              style={{
                width: `${pct}%`,
                minWidth: '4px',
                background: BLOCK_COLORS[b.type],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.6rem',
                color: '#fff',
                fontWeight: 600,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                padding: '0 6px',
                borderRight: i < blocks.length - 1 ? '1px solid rgba(0,0,0,0.3)' : 'none',
                opacity: isDragging ? 0.4 : 1,
                position: 'relative',
                cursor: 'grab',
                outline: isDropTarget ? '2px solid var(--color-accent)' : 'none',
                outlineOffset: '-2px',
                transition: 'opacity 0.15s',
              }}
            >
              {/* Block content */}
              <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                {b.thumbnail && pct > 5 && (
                  <img src={b.thumbnail} alt="" style={{ height: 20, borderRadius: 2, flexShrink: 0 }} />
                )}
                {pct > 6 && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>}
                {pct > 4 && <span style={{ opacity: 0.7 }}>{b.duration}s</span>}
              </span>

              {/* Delete button on non-video blocks (visible on hover via CSS would be ideal, but inline: show if wide enough) */}
              {b.type !== 'video' && pct > 6 && (
                <button
                  onClick={e => removeBlock(e, b.id)}
                  title="Remove"
                  style={{
                    position: 'absolute',
                    right: 2, top: 2,
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderRadius: '3px',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: '1px 3px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.6,
                    pointerEvents: 'auto',
                  }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <Trash2 size={9} />
                </button>
              )}
            </div>
          );
        })}

        {/* Playhead */}
        <div style={{
          position: 'absolute',
          left: `${playheadPct}%`,
          top: -2,
          bottom: -2,
          width: '2px',
          background: '#fff',
          zIndex: 5,
          pointerEvents: 'none',
          boxShadow: '0 0 6px rgba(0,0,0,0.6)',
        }}>
          {/* Playhead head */}
          <div style={{
            position: 'absolute',
            top: -4,
            left: -4,
            width: 10,
            height: 10,
            background: '#fff',
            borderRadius: '50%',
            boxShadow: '0 0 3px rgba(0,0,0,0.4)',
          }} />
        </div>
      </div>

      {/* ── Controls row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
        <button
          onClick={onPlayPause}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center',
            padding: '2px',
          }}
          title={isPlaying ? 'Pause' : 'Play timeline'}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          )}
        </button>

        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-text-primary)' }}>
          {formatTlTime(globalTime)} / {formatTlTime(totalDuration)}
        </span>

        <div style={{ flex: 1 }} />

        {/* Add black */}
        <button className="btn btn-secondary btn-sm" onClick={addBlack}
          style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', padding: '2px 8px' }}>
          <Plus size={9} /> Black
          <input
            className="input"
            type="number"
            min={1}
            max={60}
            value={newBlackDur}
            onClick={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); setNewBlackDur(parseInt(e.target.value) || 3); }}
            style={{ width: '30px', fontSize: '0.6rem', padding: '1px 2px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '0.6rem' }}>s</span>
        </button>

        {/* Export */}
        <button
          className="btn btn-primary btn-sm"
          onClick={onExport}
          disabled={exporting || blocks.length < 2}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', padding: '2px 10px' }}
        >
          {exporting ? <Loader2 size={11} className="spin" /> : <Film size={11} />}
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>

      {/* Export progress */}
      {exporting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{
            width: '100%', height: '4px', borderRadius: '2px',
            background: 'var(--color-bg-tertiary)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${exportPct}%`, height: '100%',
              background: 'var(--color-accent)',
              borderRadius: '2px',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {exportPct}% — {exportLabel}
          </span>
        </div>
      )}
    </div>
  );
};
