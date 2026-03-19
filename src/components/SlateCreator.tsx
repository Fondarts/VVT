import React, { useState, useRef, useCallback } from 'react';
import { Plus, Trash2, Download, GripVertical } from 'lucide-react';

interface SlateField {
  id: string;
  label: string;
  value: string;
}

const DEFAULT_FIELDS: SlateField[] = [
  { id: '1', label: 'client', value: '' },
  { id: '2', label: 'campaign', value: '' },
  { id: '3', label: 'title', value: '' },
  { id: '4', label: 'trt', value: '' },
  { id: '5', label: 'ad-id', value: '' },
  { id: '6', label: 'audio', value: '' },
  { id: '7', label: 'date', value: '' },
  { id: '8', label: 'product', value: '' },
];

let _uid = 100;
const uid = () => String(++_uid);

type LogoCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Base design constants (in 1920x1080 viewBox units)
const VW = 1920;
const VH = 1080;
const LABEL_SIZE = 38;
const SEP_SIZE = 38;
const VALUE_SIZE = 42;
const LINE_H = 68;
const SEP_X = VW * 0.3;       // moved left from 0.42
const LOGO_H = 100;
const LOGO_PAD = 50;

export const SlateCreator: React.FC = () => {
  const [fields, setFields] = useState<SlateField[]>(DEFAULT_FIELDS);
  const [bgColor, setBgColor] = useState('#333333');
  const [sepColor, setSepColor] = useState('#999999');
  const [separator, setSeparator] = useState<'/' | ':'>('/');
  const [resolution, setResolution] = useState<'1920x1080' | '3840x2160'>('1920x1080');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoCorner, setLogoCorner] = useState<LogoCorner>('top-right');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleFieldChange = (id: string, key: 'label' | 'value', val: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f));
  };

  const addField = () => {
    setFields(prev => [...prev, { id: uid(), label: 'new field', value: '' }]);
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = URL.createObjectURL(file);
  };

  /* ── Drag-to-reorder ── */
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setFields(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  /* ── Logo position helper (canvas) ── */
  const logoPos = (W: number, H: number, logoW: number, logoH: number) => {
    const pad = LOGO_PAD * (W / VW);
    switch (logoCorner) {
      case 'top-left':     return { x: pad, y: pad };
      case 'top-right':    return { x: W - logoW - pad, y: pad };
      case 'bottom-left':  return { x: pad, y: H - logoH - pad };
      case 'bottom-right': return { x: W - logoW - pad, y: H - logoH - pad };
    }
  };

  /* ── Render to canvas & download ── */
  const renderSlate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [wStr, hStr] = resolution.split('x');
    const W = parseInt(wStr);
    const H = parseInt(hStr);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const s = W / VW; // scale

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Logo
    if (logoImg) {
      const aspect = logoImg.width / logoImg.height;
      const lH = LOGO_H * s;
      const lW = lH * aspect;
      const pos = logoPos(W, H, lW, lH);
      ctx.drawImage(logoImg, pos.x, pos.y, lW, lH);
    }

    // Fields
    const labelFont = `${LABEL_SIZE * s}px "Inter", "Segoe UI", sans-serif`;
    const valueFont = `bold ${VALUE_SIZE * s}px "Inter", "Segoe UI", sans-serif`;
    const sepFont = `${SEP_SIZE * s}px "Inter", "Segoe UI", sans-serif`;
    const totalFields = fields.length || 1;
    const fLineH = LINE_H * s;
    const blockH = totalFields * fLineH;
    const startY = (H - blockH) / 2 + fLineH / 2;
    const sepXc = SEP_X * s;

    fields.forEach((f, i) => {
      const y = startY + i * fLineH;

      ctx.font = labelFont;
      ctx.fillStyle = '#aaaaaa';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.label, sepXc - 24 * s, y);

      ctx.font = sepFont;
      ctx.fillStyle = sepColor;
      ctx.textAlign = 'center';
      ctx.fillText(separator, sepXc, y);

      ctx.font = valueFont;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(f.value || '—', sepXc + 24 * s, y);
    });
  }, [fields, bgColor, sepColor, separator, resolution, logoImg, logoCorner]);

  const handleDownload = () => {
    renderSlate();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'slate.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  /* ── Corner selector mini-grid ── */
  const cornerGrid = (
    <div style={{ display: 'inline-grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as LogoCorner[]).map(c => (
        <button
          key={c}
          onClick={() => setLogoCorner(c)}
          title={c}
          style={{
            width: 14, height: 10, border: '1px solid var(--color-border)',
            borderRadius: '2px', padding: 0, cursor: 'pointer',
            background: logoCorner === c ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
          }}
        />
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Settings row ── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
          BG
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
            style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{separator}</span>
          <input type="color" value={sepColor} onChange={e => setSepColor(e.target.value)}
            style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
        </label>

        <button className="btn btn-secondary btn-sm"
          onClick={() => setSeparator(s => s === '/' ? ':' : '/')}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '2px 10px' }}
        >
          {separator === '/' ? '/ → :' : ': → /'}
        </button>

        <select className="input" value={resolution} onChange={e => setResolution(e.target.value as typeof resolution)}
          style={{ fontSize: '0.72rem', padding: '2px 6px', width: 'auto' }}>
          <option value="1920x1080">1920×1080</option>
          <option value="3840x2160">3840×2160</option>
        </select>

        <button className="btn btn-secondary btn-sm" onClick={() => logoInputRef.current?.click()}
          style={{ fontSize: '0.72rem' }}>
          {logoImg ? 'Change logo' : 'Upload logo'}
        </button>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
        {logoImg && (
          <>
            {cornerGrid}
            <button className="btn btn-secondary btn-sm" onClick={() => setLogoImg(null)} style={{ fontSize: '0.72rem', padding: '2px 6px' }}>
              ✕
            </button>
          </>
        )}
      </div>

      {/* ── Fields editor ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {fields.map((f, i) => (
          <div
            key={f.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            style={{
              display: 'flex', gap: '6px', alignItems: 'center',
              opacity: dragIdx === i ? 0.5 : 1,
              background: 'var(--color-bg-secondary)',
              borderRadius: '4px',
              padding: '3px 6px',
            }}
          >
            <GripVertical size={12} style={{ color: 'var(--color-text-muted)', cursor: 'grab', flexShrink: 0 }} />
            <input
              className="input"
              value={f.label}
              onChange={e => handleFieldChange(f.id, 'label', e.target.value)}
              style={{ width: '100px', fontSize: '0.75rem', padding: '3px 6px', textAlign: 'right' }}
              placeholder="label"
            />
            <span style={{ color: sepColor, fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>{separator}</span>
            <input
              className="input"
              value={f.value}
              onChange={e => handleFieldChange(f.id, 'value', e.target.value)}
              style={{ flex: 1, fontSize: '0.75rem', padding: '3px 6px', fontWeight: 600 }}
              placeholder="value"
            />
            <button onClick={() => removeField(f.id)} title="Remove field"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px', display: 'flex', flexShrink: 0 }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        <button className="btn btn-secondary btn-sm" onClick={addField}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
          <Plus size={11} /> Add field
        </button>
      </div>

      {/* ── Preview ── */}
      <div style={{
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: '6px',
        overflow: 'hidden',
        background: bgColor,
        border: '1px solid var(--color-border)',
      }}>
        <SlatePreview
          fields={fields}
          bgColor={bgColor}
          sepColor={sepColor}
          separator={separator}
          logoImg={logoImg}
          logoCorner={logoCorner}
        />
      </div>

      {/* ── Download ── */}
      <button className="btn btn-primary btn-sm" onClick={handleDownload}
        style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Download size={13} /> Download PNG
      </button>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

/* ── Live SVG preview ── */
const SlatePreview: React.FC<{
  fields: SlateField[];
  bgColor: string;
  sepColor: string;
  separator: string;
  logoImg: HTMLImageElement | null;
  logoCorner: LogoCorner;
}> = ({ fields, bgColor, sepColor, separator, logoImg, logoCorner }) => {
  const totalFields = fields.length || 1;
  const blockH = totalFields * LINE_H;
  const startY = (VH - blockH) / 2 + LINE_H / 2;

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  React.useEffect(() => {
    if (!logoImg) { setLogoDataUrl(null); return; }
    const c = document.createElement('canvas');
    c.width = logoImg.width;
    c.height = logoImg.height;
    c.getContext('2d')!.drawImage(logoImg, 0, 0);
    setLogoDataUrl(c.toDataURL());
  }, [logoImg]);

  // Logo SVG position
  const logoSvgPos = () => {
    switch (logoCorner) {
      case 'top-left':     return { x: LOGO_PAD, y: LOGO_PAD, anchor: 'xMinYMin' };
      case 'top-right':    return { x: VW - LOGO_PAD, y: LOGO_PAD, anchor: 'xMaxYMin' };
      case 'bottom-left':  return { x: LOGO_PAD, y: VH - LOGO_PAD - LOGO_H, anchor: 'xMinYMin' };
      case 'bottom-right': return { x: VW - LOGO_PAD, y: VH - LOGO_PAD - LOGO_H, anchor: 'xMaxYMin' };
    }
  };

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width={VW} height={VH} fill={bgColor} />

      {logoDataUrl && (() => {
        const pos = logoSvgPos();
        const isRight = logoCorner.includes('right');
        return (
          <image
            href={logoDataUrl}
            x={isRight ? pos.x - 200 : pos.x}
            y={pos.y}
            height={LOGO_H}
            width={200}
            preserveAspectRatio={isRight ? 'xMaxYMid meet' : 'xMinYMid meet'}
          />
        );
      })()}

      {fields.map((f, i) => {
        const y = startY + i * LINE_H;
        return (
          <g key={f.id}>
            <text x={SEP_X - 24} y={y} fill="#aaaaaa" fontSize={LABEL_SIZE} fontFamily="Inter, Segoe UI, sans-serif" textAnchor="end" dominantBaseline="central">
              {f.label}
            </text>
            <text x={SEP_X} y={y} fill={sepColor} fontSize={SEP_SIZE} fontFamily="Inter, Segoe UI, sans-serif" textAnchor="middle" dominantBaseline="central">
              {separator}
            </text>
            <text x={SEP_X + 24} y={y} fill="#ffffff" fontSize={VALUE_SIZE} fontWeight="bold" fontFamily="Inter, Segoe UI, sans-serif" textAnchor="start" dominantBaseline="central">
              {f.value || '—'}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
