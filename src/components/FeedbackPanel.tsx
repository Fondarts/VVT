import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Check, Trash2, Clock, Pencil, ChevronRight, Type, Eraser, Minus, Plus, Undo2 } from 'lucide-react';

const DRAW_COLORS = ['#FA4900', '#E1FF1C', '#FF3B30', '#FF9F0A', '#34C759', '#0A84FF', '#FFFFFF', '#000000'];
import type { FeedbackComment, AnnotationStroke } from '../shared/types';
import {
  fileKey,
  subscribeComments,
  addComment,
  deleteComment,
  toggleResolved,
  updateComment,
} from '../utils/feedbackStorage';

interface Props {
  fileName: string;
  fileSize: number;
  currentTime: number;      // seconds
  frameRate: number;
  videoEl: HTMLVideoElement | null;
  authorName: string;
  authorPhoto?: string;
  onSeek?: (seconds: number) => void;
  onCommentsChange?: (count: number) => void;
  onMarkersChange?: (markers: { time: number; id: string; author: string }[]) => void;
  onMarkerRangesChange?: (ranges: { start: number; end: number; id: string; author: string }[]) => void;
  onAnnotationChange?: (strokes: AnnotationStroke[] | null) => void;
  onStartDraw?: (color: string, tool: 'draw' | 'text' | 'eraser') => void;
  onCaptureDrawStrokes?: () => AnnotationStroke[];
  onSetLineWidth?: (w: number) => void;
  onUndoLastStroke?: () => void;
  onInitializeDrawStrokes?: (strokes: AnnotationStroke[]) => void;
  refreshKey?: number;
  stagedTimecode?: { start: number; end: number; strokes?: AnnotationStroke[] };
  onStagedTimecodeConsumed?: () => void;
}


function formatTimecode(seconds: number, fps: number): string {
  const f = fps || 25;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const fr = Math.floor((seconds % 1) * f);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
}

export const FeedbackPanel: React.FC<Props> = ({
  fileName,
  fileSize,
  currentTime,
  frameRate,
  videoEl: _videoEl,
  authorName,
  authorPhoto,
  onSeek,
  onCommentsChange,
  onMarkersChange,
  onMarkerRangesChange,
  onAnnotationChange,
  onStartDraw,
  onCaptureDrawStrokes,
  onSetLineWidth,
  onUndoLastStroke,
  onInitializeDrawStrokes,
  refreshKey: _refreshKey,
  stagedTimecode,
  onStagedTimecodeConsumed,
}) => {
  const key = fileKey(fileName, fileSize);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const commentsRef = useRef<FeedbackComment[]>([]);
  const [text, setText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // Range mode state
  const [rangeMode, setRangeMode] = useState(false);
  const [timecodeEnd, setTimecodeEnd] = useState<number | null>(null);
  // Staged start from bracket marker (overrides currentTime in form)
  const [stagedStart, setStagedStart] = useState<number | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Strokes received from VideoPlayer when confirming a pending marker
  const [pendingStrokes, setPendingStrokes] = useState<AnnotationStroke[]>([]);
  const [drawLineWidth, setDrawLineWidthLocal] = useState(3);

  const emitMarkers = (list: FeedbackComment[]) => {
    onMarkersChange?.(list.filter(c => !c.timecodeEnd).map(c => ({ time: c.timecode, id: c.id, author: c.author })));
    onMarkerRangesChange?.(
      list
        .filter(c => c.timecodeEnd !== undefined && c.timecodeEnd !== null)
        .map(c => ({ start: c.timecode, end: c.timecodeEnd!, id: c.id, author: c.author }))
    );
  };

  // Real-time Firestore subscription
  useEffect(() => {
    const unsub = subscribeComments(key, (loaded) => {
      commentsRef.current = loaded;
      setComments(loaded);
      onCommentsChange?.(loaded.length);
      emitMarkers(loaded);
    });
    return unsub;
  }, [key]);

  // Open form when bracket marker is confirmed in player
  useEffect(() => {
    if (!stagedTimecode) return;
    const isRange = stagedTimecode.end - stagedTimecode.start > 0.02;
    setStagedStart(stagedTimecode.start);
    setRangeMode(isRange);
    setTimecodeEnd(isRange ? stagedTimecode.end : null);
    setPendingStrokes(stagedTimecode.strokes ?? []);
    setShowForm(true);
    onStagedTimecodeConsumed?.();
  }, [stagedTimecode]);

  // Auto-show/dismiss annotation based on current playback position
  useEffect(() => {
    const fps = frameRate || 25;
    const currentFrame = Math.round(currentTime * fps);

    const matching = comments.find(c => {
      if (!c.annotationStrokes?.length) return false;
      if (c.timecodeEnd !== undefined && c.timecodeEnd !== null) {
        return currentTime >= c.timecode && currentTime <= c.timecodeEnd;
      }
      return currentFrame === Math.round(c.timecode * fps);
    });

    if (matching) {
      if (matching.id !== activeAnnotationId) {
        setActiveAnnotationId(matching.id);
        onAnnotationChange?.(matching.annotationStrokes!);
      }
    } else if (activeAnnotationId) {
      setActiveAnnotationId(null);
      onAnnotationChange?.(null);
    }
  }, [currentTime, comments, frameRate]);

  const openForm = () => {
    setShowForm(true);
    setPendingStrokes([]);
    setRangeMode(false);
    setTimecodeEnd(null);
    setStagedStart(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setText('');
    setPendingStrokes([]);
    setRangeMode(false);
    setTimecodeEnd(null);
    setStagedStart(null);
    setActiveAnnotationId(prev => {
      if (!prev) onAnnotationChange?.(null);
      return prev;
    });
  };

  const handleAdd = async () => {
    if (!text.trim()) return;
    const captured = onCaptureDrawStrokes?.() ?? [];
    const strokes = captured.length > 0 ? captured : pendingStrokes;
    await addComment(key, {
      timecode: stagedStart ?? currentTime,
      timecodeEnd: rangeMode && timecodeEnd !== null ? timecodeEnd : undefined,
      author: authorName || 'Anonymous',
      text: text.trim(),
      annotationStrokes: strokes.length > 0 ? strokes : undefined,
      authorPhoto: authorPhoto,
    });
    // onSnapshot will update comments state automatically
    if (strokes.length > 0) {
      onAnnotationChange?.(strokes);
    } else {
      onAnnotationChange?.(null);
    }
    setShowForm(false);
    setText('');
    setPendingStrokes([]);
    setRangeMode(false);
    setTimecodeEnd(null);
    setStagedStart(null);
  };

  const handleDelete = async (id: string) => {
    await deleteComment(id);
  };

  const handleToggleResolved = async (id: string) => {
    const comment = comments.find(c => c.id === id);
    if (comment) await toggleResolved(id, comment.resolved);
  };

  const handleEditStart = (comment: FeedbackComment) => {
    setEditingId(comment.id);
    setEditText(comment.text);
    // Pre-load existing strokes so the eraser can affect them too
    onInitializeDrawStrokes?.(comment.annotationStrokes ?? []);
  };

  const handleEditSave = async (comment: FeedbackComment) => {
    if (!editText.trim()) return;
    // captureDrawStrokes returns the full canvas state (existing + new + erasures applied)
    const finalStrokes = onCaptureDrawStrokes?.();
    await updateComment(comment.id, {
      text: editText.trim(),
      annotationStrokes: finalStrokes && finalStrokes.length > 0 ? finalStrokes : comment.annotationStrokes,
    });
    setEditingId(null);
    setEditText('');
  };

  const handleEditCancel = () => {
    onInitializeDrawStrokes?.([]);
    setEditingId(null);
    setEditText('');
  };

  const handleSeekToComment = (comment: FeedbackComment) => {
    onSeek?.(comment.timecode);
    if (comment.annotationStrokes && comment.annotationStrokes.length > 0) {
      if (activeAnnotationId === comment.id) {
        setActiveAnnotationId(null);
        onAnnotationChange?.(null);
      } else {
        setActiveAnnotationId(comment.id);
        onAnnotationChange?.(comment.annotationStrokes);
      }
    } else {
      setActiveAnnotationId(null);
      onAnnotationChange?.(null);
    }
  };

  const changeLineWidth = (delta: number) => {
    const next = Math.max(1, Math.min(40, drawLineWidth + delta));
    setDrawLineWidthLocal(next);
    onSetLineWidth?.(next);
  };

  const drawToolsRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
      {DRAW_COLORS.map(c => (
        <button key={c} title={`Draw (${c})`} onClick={() => onStartDraw?.(c, 'draw')}
          style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '2px solid rgba(255,255,255,0.18)', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
      ))}
      <div style={{ width: '1px', height: '12px', background: 'var(--color-border)', flexShrink: 0 }} />
      <button className="btn btn-secondary btn-sm" onClick={() => onStartDraw?.('#FA4900', 'draw')} title="Pencil" style={{ padding: '2px 5px' }}><Pencil size={11} /></button>
      <button className="btn btn-secondary btn-sm" onClick={() => onStartDraw?.('#FA4900', 'text')} title="Text" style={{ padding: '2px 5px' }}><Type size={11} /></button>
      <button className="btn btn-secondary btn-sm" onClick={() => onStartDraw?.('#000', 'eraser')} title="Eraser" style={{ padding: '2px 5px' }}><Eraser size={11} /></button>
      <div style={{ width: '1px', height: '12px', background: 'var(--color-border)', flexShrink: 0 }} />
      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 4px' }} onClick={() => changeLineWidth(-1)}><Minus size={9} /></button>
      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: '12px', textAlign: 'center' }}>{drawLineWidth}</span>
      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 4px' }} onClick={() => changeLineWidth(1)}><Plus size={9} /></button>
      <div style={{ width: '1px', height: '12px', background: 'var(--color-border)', flexShrink: 0 }} />
      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 4px' }} onClick={() => onUndoLastStroke?.()} title="Undo"><Undo2 size={11} /></button>
    </div>
  );

  const sorted = [...comments].sort((a, b) => a.timecode - b.timecode);
  const unresolvedCount = comments.filter(c => !c.resolved).length;
  const tc = formatTimecode(currentTime, frameRate);

  const miniBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '22px', height: '22px', borderRadius: '4px', padding: 0,
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
    color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0,
  };

  return (
    <>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Quick comment row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="input"
            type="text"
            placeholder="Add a comment…"
            value={showForm ? '' : text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && text.trim()) handleAdd();
            }}
            style={{ flex: 1, fontSize: '0.8125rem' }}
            disabled={showForm}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => text.trim() ? handleAdd() : openForm()}
            title="Add comment at current timecode"
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <MessageCircle size={13} />
            {tc}
          </button>
        </div>

        {/* Drawing tools row */}
        {drawToolsRow}

        {/* Comment form */}
        {showForm && (
          <div className="card" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                {rangeMode ? 'Range:' : 'Frame:'}
              </span>
              <strong style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                {stagedStart !== null ? formatTimecode(stagedStart, frameRate) : tc}
              </strong>
              {rangeMode && (
                <>
                  <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  {timecodeEnd !== null ? (
                    <strong style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {formatTimecode(timecodeEnd, frameRate)}
                    </strong>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      no end set
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setTimecodeEnd(currentTime)}
                    style={{
                      ...miniBtn, width: 'auto', padding: '0 6px',
                      fontSize: '0.65rem', color: 'var(--color-text-primary)',
                    }}
                    title="Capture current time as range end"
                  >
                    Set end
                  </button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => { setRangeMode(r => !r); if (rangeMode) setTimecodeEnd(null); }}
                style={{
                  ...miniBtn, width: 'auto', padding: '0 6px', fontSize: '0.65rem',
                  background: rangeMode ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                  color: rangeMode ? '#000' : 'var(--color-text-muted)',
                  border: rangeMode ? 'none' : '1px solid var(--color-border)',
                }}
                title="Toggle range mode"
              >
                Range
              </button>
            </div>

            <textarea
              className="input"
              rows={3}
              placeholder="Leave a comment… (Ctrl+Enter to send)"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
              autoFocus
              style={{ resize: 'vertical', fontSize: '0.8125rem' }}
            />

            {/* Annotation indicator */}
            {pendingStrokes.length > 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pencil size={10} />
                Annotation included from player
              </div>
            )}

            {/* Bottom toolbar row: Cancel + Add */}
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={closeForm}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAdd}
                disabled={!text.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Summary line */}
        {comments.length > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', gap: '8px' }}>
            <span>{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
            {unresolvedCount > 0 && (
              <span style={{ color: 'var(--color-warning)' }}>· {unresolvedCount} open</span>
            )}
          </div>
        )}

        {/* Empty state */}
        {sorted.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: 'var(--color-text-muted)',
            fontSize: '0.8125rem',
          }}>
            <MessageCircle size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.25 }} />
            No comments yet.<br />
            <span style={{ opacity: 0.7 }}>Pause the video and click the timecode button.</span>
          </div>
        )}

        {/* Comments list */}
        {sorted.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sorted.map(comment => (
              <div
                key={comment.id}
                className="card"
                style={{
                  padding: '10px',
                  opacity: comment.resolved ? 0.55 : 1,
                  borderLeft: `2px solid ${comment.resolved ? 'var(--color-success)' : 'var(--color-accent)'}`,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                  <button
                    onClick={() => handleSeekToComment(comment)}
                    title={comment.annotationStrokes?.length ? (activeAnnotationId === comment.id ? 'Hide annotation' : 'Show annotation on player') : 'Jump to this timecode'}
                    style={{
                      background: activeAnnotationId === comment.id ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '0.68rem',
                      color: activeAnnotationId === comment.id ? '#000' : 'var(--color-accent)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      flexShrink: 0,
                    }}
                  >
                    <Clock size={9} />
                    {formatTimecode(comment.timecode, frameRate)}
                    {comment.timecodeEnd !== undefined && comment.timecodeEnd !== null && (
                      <>
                        <ChevronRight size={8} style={{ opacity: 0.6 }} />
                        {formatTimecode(comment.timecodeEnd, frameRate)}
                      </>
                    )}
                  </button>

                  <span style={{
                    fontSize: '0.78rem', fontWeight: 600, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {comment.author}
                  </span>

                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>

                  <button
                    onClick={() => handleToggleResolved(comment.id)}
                    title={comment.resolved ? 'Mark as open' : 'Mark as resolved'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: comment.resolved ? 'var(--color-success)' : 'var(--color-text-muted)',
                      padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}
                  >
                    <Check size={13} />
                  </button>

                  <button
                    onClick={() => editingId === comment.id ? handleEditCancel() : handleEditStart(comment)}
                    title={editingId === comment.id ? 'Cancel edit' : 'Edit comment'}
                    style={{
                      background: editingId === comment.id ? 'var(--color-accent)' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: editingId === comment.id ? '#000' : 'var(--color-text-muted)',
                      padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0,
                      borderRadius: '3px',
                    }}
                  >
                    <Pencil size={13} />
                  </button>

                  <button
                    onClick={() => handleDelete(comment.id)}
                    title="Delete comment"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                      padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Annotation indicator */}
                {comment.annotationStrokes?.length && activeAnnotationId !== comment.id && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '4px', opacity: 0.7 }}>
                    ↑ click timecode to show annotation
                  </div>
                )}

                {/* Text or edit form */}
                {editingId === comment.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    <textarea
                      className="input"
                      rows={3}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEditSave(comment);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      autoFocus
                      style={{ resize: 'vertical', fontSize: '0.8125rem' }}
                    />
                    {drawToolsRow}
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={handleEditCancel}>Cancel</button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleEditSave(comment)}
                        disabled={!editText.trim()}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {comment.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
