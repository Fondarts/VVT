import React, { useRef, useEffect, useCallback } from 'react';
import { Activity } from 'lucide-react';

interface WaveformProps {
  audioData: number[];
  duration: number;
  currentTime: number;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export const Waveform: React.FC<WaveformProps> = ({ audioData, duration, currentTime }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveImageRef = useRef<ImageData | null>(null);

  // Draw the static waveform whenever audio data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || audioData.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cy = H / 2;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Waveform fill
    const barW = W / audioData.length;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    for (let i = 0; i < audioData.length; i++) {
      const amp = audioData[i] * (H / 2 - 8);
      if (i === 0) ctx.moveTo(0, cy - amp);
      else ctx.lineTo(i * barW, cy - amp);
    }
    ctx.lineTo(W, cy);
    for (let i = audioData.length - 1; i >= 0; i--) {
      const amp = audioData[i] * (H / 2 - 8);
      ctx.lineTo(i * barW, cy + amp);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.fill();

    // Waveform stroke
    ctx.beginPath();
    for (let i = 0; i < audioData.length; i++) {
      const amp = audioData[i] * (H / 2 - 8);
      if (i === 0) ctx.moveTo(0, cy - amp);
      else ctx.lineTo(i * barW, cy - amp);
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mirror bottom stroke
    ctx.beginPath();
    for (let i = 0; i < audioData.length; i++) {
      const amp = audioData[i] * (H / 2 - 8);
      if (i === 0) ctx.moveTo(0, cy + amp);
      else ctx.lineTo(i * barW, cy + amp);
    }
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.stroke();

    // Cache the waveform image
    waveImageRef.current = ctx.getImageData(0, 0, W, H);
  }, [audioData]);

  // Draw playhead on top whenever currentTime changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveImageRef.current || duration <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Restore static waveform
    ctx.putImageData(waveImageRef.current, 0, 0);

    // Playhead position
    const x = Math.round((currentTime / duration) * canvas.width);

    // Filled progress tint on the left
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(0, 0, x, canvas.height);

    // Playhead line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

    // Playhead handle dot
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Time label
    const label = formatTime(currentTime);
    ctx.font = 'bold 10px monospace';
    const textW = ctx.measureText(label).width;
    const labelX = Math.min(x + 6, canvas.width - textW - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(labelX - 2, 4, textW + 4, 14);
    ctx.fillStyle = 'white';
    ctx.fillText(label, labelX, 14);
  }, [currentTime, duration]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ fontSize: '0.875rem' }}>
          <Activity size={14} style={{ marginRight: '8px', display: 'inline' }} />
          Audio Waveform
        </h3>
      </div>
      <div className="card-content" style={{ padding: '12px' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={180}
          style={{
            width: '100%',
            height: '180px',
            background: '#0a0a0a',
            borderRadius: '4px',
            display: 'block',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontSize: '0.6875rem',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span>00:00:00.00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};
