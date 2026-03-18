import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { AnnotationStroke, AnnotationPoint } from '../shared/types';

export interface AnnotationCanvasProps {
  targetEl: HTMLElement;
  color: string;
  lineWidth: number;
  tool: 'draw' | 'text' | 'eraser';
  strokes: AnnotationStroke[];
  onStrokesChange: (strokes: AnnotationStroke[]) => void;
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: AnnotationStroke[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  for (const s of strokes) {
    if ((s.type === 'path' || s.type === 'eraser') && s.points && s.points.length > 1) {
      ctx.save();
      if (s.type === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.strokeStyle = s.type === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
      ctx.lineWidth = s.lineWidth ?? 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
      ctx.stroke();
      ctx.restore();
    } else if (s.type === 'text' && s.text && s.x !== undefined && s.y !== undefined) {
      const fs = Math.round((s.fontSize ?? 0.028) * h);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = s.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(s.text, s.x * w, s.y * h);
      ctx.shadowBlur = 0;
    }
  }
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  targetEl, color, lineWidth, tool, strokes, onStrokesChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectRef = useRef<DOMRect>(targetEl.getBoundingClientRect());
  const [, forceUpdate] = useState(0);
  const [textInput, setTextInput] = useState<{ sx: number; sy: number; nx: number; ny: number } | null>(null);
  const [textValue, setTextValue] = useState('');

  const drawingRef = useRef(false);
  const pathRef = useRef<AnnotationPoint[]>([]);
  const colorRef = useRef(color);
  const lwRef = useRef(lineWidth);
  const toolRef = useRef(tool);
  const strokesRef = useRef(strokes);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { lwRef.current = lineWidth; }, [lineWidth]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  useEffect(() => {
    const update = () => {
      rectRef.current = targetEl.getBoundingClientRect();
      forceUpdate(n => n + 1);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [targetEl]);

  // Re-render strokes onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = rectRef.current;
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (ctx) drawStrokes(ctx, strokes, w, h);
  }, [strokes]);

  const norm = (cx: number, cy: number): AnnotationPoint => {
    const r = rectRef.current;
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
  };

  const commitText = useCallback(() => {
    setTextInput(prev => {
      if (!prev) return null;
      const val = textValue.trim();
      if (val) {
        const s: AnnotationStroke = { type: 'text', color: colorRef.current, text: val, x: prev.nx, y: prev.ny, fontSize: 0.028 };
        onStrokesChange([...strokesRef.current, s]);
      }
      return null;
    });
    setTextValue('');
  }, [textValue, onStrokesChange]);

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (toolRef.current === 'text') {
      const n = norm(e.clientX, e.clientY);
      setTextInput({ sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y });
      return;
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pathRef.current = [norm(e.clientX, e.clientY)];
  }, []);

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    pathRef.current.push(norm(e.clientX, e.clientY));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    drawStrokes(ctx, strokesRef.current, w, h);
    const pts = pathRef.current;
    if (pts.length > 1) {
      ctx.save();
      const isEraser = toolRef.current === 'eraser';
      if (isEraser) ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : colorRef.current;
      ctx.lineWidth = lwRef.current;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  const onUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (pathRef.current.length > 1) {
      const isEraser = toolRef.current === 'eraser';
      const s: AnnotationStroke = {
        type: isEraser ? 'eraser' : 'path',
        color: isEraser ? 'rgba(0,0,0,1)' : colorRef.current,
        lineWidth: lwRef.current,
        points: [...pathRef.current],
      };
      onStrokesChange([...strokesRef.current, s]);
    }
    pathRef.current = [];
  }, [onStrokesChange]);

  const r = rectRef.current;

  return createPortal(
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        style={{
          position: 'fixed',
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair',
          touchAction: 'none',
          zIndex: 50,
          pointerEvents: 'all',
        }}
      />
      {textInput && (
        <input
          autoFocus
          value={textValue}
          onChange={e => setTextValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitText(); }
            if (e.key === 'Escape') { setTextInput(null); setTextValue(''); }
          }}
          onBlur={commitText}
          placeholder="Type text…"
          style={{
            position: 'fixed', left: textInput.sx, top: textInput.sy,
            transform: 'translateY(-100%)',
            background: 'rgba(0,0,0,0.6)', border: 'none',
            borderBottom: `2px solid ${color}`, color,
            fontSize: '18px', outline: 'none', zIndex: 10001,
            minWidth: '120px', fontFamily: 'sans-serif', fontWeight: 'bold', padding: '2px 4px',
          }}
        />
      )}
    </>,
    document.body
  );
};
