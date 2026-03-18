import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Undo2, Pencil, Type, Grid3X3 } from 'lucide-react';
import { AnnotationCanvas } from './AnnotationCanvas';
import { overlayPresets } from '../shared/presets';
import type { AnnotationStroke } from '../shared/types';

const DRAW_COLORS = ['#FA4900', '#E1FF1C', '#FF3B30', '#FF9F0A', '#34C759', '#0A84FF', '#FFFFFF', '#000000'];

interface ImageViewerProps {
  src: string;
  width: number;
  height: number;
  annotationOverlay?: AnnotationStroke[] | null;
  onAnnotationDismiss?: () => void;
  onPlaceMarker?: (strokes: AnnotationStroke[]) => void;
  onImageReady?: (el: HTMLImageElement) => void;
}

export interface ImageViewerHandle {
  getImageEl: () => HTMLImageElement | null;
}

function drawGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + (w / 3) * i, y); ctx.lineTo(x + (w / 3) * i, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + (h / 3) * i); ctx.lineTo(x + w, y + (h / 3) * i); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
}

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(({
  src, width, height, annotationOverlay, onAnnotationDismiss, onPlaceMarker, onImageReady,
}, ref) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [drawActive, setDrawActive] = useState(false);
  const [drawColor, setDrawColor] = useState('#FA4900');
  const [drawTool, setDrawTool] = useState<'draw' | 'text'>('draw');
  const [drawStrokes, setDrawStrokes] = useState<AnnotationStroke[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState('');
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [showGrid, setShowGrid] = useState(false);

  useImperativeHandle(ref, () => ({ getImageEl: () => imgRef.current }));

  const aspectRatio = height > 0 ? width / height : 16 / 9;

  // Draw overlay on canvas
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

    // Always draw grid if enabled (even without an overlay preset)
    const imageAspect = width && height ? width / height : aspectRatio;
    const containerAspect = rect.width / rect.height;
    let drawW = rect.width, drawH = rect.height, offX = 0, offY = 0;
    if (imageAspect > containerAspect) {
      drawH = rect.width / imageAspect;
      offY = (rect.height - drawH) / 2;
    } else {
      drawW = rect.height * imageAspect;
      offX = (rect.width - drawW) / 2;
    }

    if (showGrid && !selectedOverlay) {
      drawGrid(ctx, offX, offY, drawW, drawH);
    }

    if (!selectedOverlay) return;

    const overlay = overlayPresets.find(o => o.id === selectedOverlay);
    if (!overlay) return;

    const overlayAspect = overlay.ratioValue ?? (overlay.width && overlay.height ? overlay.width / overlay.height : imageAspect);
    let overlayW = drawW, overlayH = drawH, overlayX = offX, overlayY = offY;
    if (overlayAspect > imageAspect) {
      overlayH = overlayW / overlayAspect;
      overlayY = offY + (drawH - overlayH) / 2;
    } else {
      overlayW = overlayH * overlayAspect;
      overlayX = offX + (drawW - overlayW) / 2;
    }

    ctx.save();

    if (overlay.imagePath) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.drawImage(img, overlayX, overlayY, overlayW, overlayH);
        if (showGrid) drawGrid(ctx, overlayX, overlayY, overlayW, overlayH);
        ctx.restore();
      };
      img.src = `/safezones/${overlay.imagePath}`;
    } else {
      ctx.strokeStyle = '#FA4900';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(overlayX, overlayY, overlayW, overlayH);

      if (showSafeAreas) {
        const titleRatio = overlay.safeTitlePercent != null ? overlay.safeTitlePercent / 100 : overlay.safeTitleMargin ?? 0.9;
        const tMW = overlayW * (1 - titleRatio) / 2, tMH = overlayH * (1 - titleRatio) / 2;
        ctx.strokeStyle = 'rgba(59,130,246,0.6)';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(overlayX + tMW, overlayY + tMH, overlayW - tMW * 2, overlayH - tMH * 2);

        const actionRatio = overlay.safeActionPercent != null ? overlay.safeActionPercent / 100 : overlay.safeActionMargin ?? 0.8;
        const aMW = overlayW * (1 - actionRatio) / 2, aMH = overlayH * (1 - actionRatio) / 2;
        ctx.strokeStyle = 'rgba(34,197,94,0.6)';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(overlayX + aMW, overlayY + aMH, overlayW - aMW * 2, overlayH - aMH * 2);
      }

      if (showGrid) { ctx.setLineDash([]); drawGrid(ctx, overlayX, overlayY, overlayW, overlayH); }
    }

    ctx.restore();
  }, [selectedOverlay, showSafeAreas, showGrid, width, height, aspectRatio, imgEl]);

  const guidePresets = overlayPresets.filter(o => o.group === 'guides');
  const safezonePresets = overlayPresets.filter(o => o.group === 'safezones');
  const isImageOverlay = !!overlayPresets.find(o => o.id === selectedOverlay)?.imagePath;

  const handleConfirm = () => { onPlaceMarker?.(drawStrokes); setDrawStrokes([]); setDrawActive(false); };
  const handleDiscard = () => { setDrawStrokes([]); setDrawActive(false); };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Image area */}
      <div ref={containerRef} style={{ position: 'relative', background: '#111', lineHeight: 0 }}>
        <img
          ref={imgRef}
          src={src}
          onLoad={e => { const el = e.currentTarget; setImgEl(el); onImageReady?.(el); }}
          style={{ width: '100%', aspectRatio: `${aspectRatio}`, objectFit: 'contain', display: 'block', maxHeight: '60vh' }}
          draggable={false}
        />

        {/* Overlay canvas */}
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />

        {/* Read-only annotation overlay */}
        {annotationOverlay && annotationOverlay.length > 0 && imgEl && !drawActive && (
          <AnnotationCanvas targetEl={imgEl} color="#FA4900" lineWidth={3} tool="draw" strokes={annotationOverlay} onStrokesChange={() => {}} />
        )}

        {/* Active drawing canvas */}
        {drawActive && imgEl && (
          <AnnotationCanvas targetEl={imgEl} color={drawColor} lineWidth={3} tool={drawTool} strokes={drawStrokes} onStrokesChange={setDrawStrokes} />
        )}

        {/* Dismiss annotation button */}
        {annotationOverlay && annotationOverlay.length > 0 && !drawActive && onAnnotationDismiss && (
          <button onClick={onAnnotationDismiss} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '4px', color: '#fff', padding: '4px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
            ✕ dismiss
          </button>
        )}
      </div>

      {/* Toolbar row 1 — draw tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderTop: '1px solid var(--border-color)', background: 'var(--color-bg-secondary)', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => { setDrawTool('draw'); setDrawActive(true); }} title="Draw"
          style={{ padding: '2px 6px', background: drawActive && drawTool === 'draw' ? 'var(--color-accent)' : undefined, color: drawActive && drawTool === 'draw' ? '#000' : undefined }}>
          <Pencil size={11} />
        </button>
        <button className="btn btn-sm" onClick={() => { setDrawTool('text'); setDrawActive(true); }} title="Text"
          style={{ padding: '2px 6px', background: drawActive && drawTool === 'text' ? 'var(--color-accent)' : undefined, color: drawActive && drawTool === 'text' ? '#000' : undefined }}>
          <Type size={11} />
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />

        {DRAW_COLORS.map(c => (
          <button key={c} onClick={() => { setDrawColor(c); setDrawActive(true); }} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: drawActive && drawColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', flexShrink: 0, padding: 0 }} />
        ))}

        {drawActive && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border-color)' }} />
            {drawStrokes.length > 0 && (
              <button className="btn btn-sm" onClick={() => setDrawStrokes(s => s.slice(0, -1))} title="Undo" style={{ padding: '2px 6px' }}><Undo2 size={10} /></button>
            )}
            <button className="btn btn-sm" onClick={handleConfirm} style={{ background: '#FA4900', color: '#000', fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px' }}>Add Comment</button>
            <button className="btn btn-sm btn-secondary" onClick={handleDiscard} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Cancel</button>
          </>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{width} × {height}</div>
      </div>

      {/* Toolbar row 2 — overlays */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 10px', borderTop: '1px solid var(--border-color)', background: 'var(--color-bg-secondary)', flexWrap: 'wrap' }}>
        <select
          value={selectedOverlay}
          onChange={e => setSelectedOverlay(e.target.value)}
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', minWidth: '200px' }}
        >
          <option value="">— No overlay —</option>
          <optgroup label="Aspect Ratio Guides">
            {guidePresets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </optgroup>
          <optgroup label="Safe Zone Images">
            {safezonePresets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </optgroup>
        </select>

        {!isImageOverlay && (
          <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
            <input type="checkbox" className="toggle-checkbox" checked={showSafeAreas} onChange={e => setShowSafeAreas(e.target.checked)} disabled={!selectedOverlay} />
            <span className="toggle-slider" style={{ opacity: selectedOverlay ? 1 : 0.5 }} />
            <span>Safe Areas</span>
          </label>
        )}

        <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
          <input type="checkbox" className="toggle-checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
          <span className="toggle-slider" />
          <Grid3X3 size={12} style={{ display: 'inline' }} />
          <span>Grid</span>
        </label>
      </div>
    </div>
  );
});
