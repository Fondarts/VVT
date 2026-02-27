import React, { useRef, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

interface WaveformProps {
  audioData: number[];
  duration: number;
  currentTime: number;
  videoEl?: HTMLVideoElement | null;
  truePeakMax?: number;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function dBToLinear(dB: number): number {
  return Math.pow(10, dB / 20);
}

const WAVEFORM_HEIGHT = 180;
const VU_WIDTH = 52;

export const Waveform: React.FC<WaveformProps> = ({ audioData, duration, currentTime, videoEl, truePeakMax }) => {
  const [vScale, setVScale] = useState(1);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const vuCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveImageRef = useRef<ImageData | null>(null);

  // Web Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedElRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number>(0);

  // Connect Web Audio API to video element
  useEffect(() => {
    if (!videoEl || videoEl === connectedElRef.current) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;

      // Disconnect previous source
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch { /* ignore */ }
        sourceRef.current = null;
      }

      const source = ctx.createMediaElementSource(videoEl);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      sourceRef.current = source;
      analyserRef.current = analyser;
      connectedElRef.current = videoEl;

      const resume = () => ctx.resume();
      videoEl.addEventListener('play', resume);

      return () => {
        videoEl.removeEventListener('play', resume);
      };
    } catch (e) {
      console.warn('Web Audio setup failed:', e);
    }
  }, [videoEl]);

  // VU meter animation loop
  useEffect(() => {
    const canvas = vuCanvasRef.current;
    if (!canvas) return;

    const dataArray = new Uint8Array(2048);
    let lastPeakDb = -96;
    let peakHoldTimestamp = 0;

    const draw = (timestamp: number) => {
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) { animFrameRef.current = requestAnimationFrame(draw); return; }

      const W = canvas.width;
      const H = canvas.height;

      // Compute RMS level
      let rmsDb = -96;
      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const s = (dataArray[i] - 128) / 128;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        rmsDb = rms > 1e-10 ? 20 * Math.log10(rms) : -96;
      }

      // Peak hold: hold for 2 seconds then decay
      if (rmsDb > lastPeakDb) {
        lastPeakDb = rmsDb;
        peakHoldTimestamp = timestamp;
      } else if (timestamp - peakHoldTimestamp > 2000) {
        lastPeakDb = Math.max(-96, lastPeakDb - 0.3);
      }

      // Draw background
      ctx2d.fillStyle = '#0a0a0a';
      ctx2d.fillRect(0, 0, W, H);

      const minDb = -60;
      const maxDb = 0;
      const range = maxDb - minDb;
      const labelW = 20; // right side for labels
      const barRight = W - labelW;
      const barLeft = 4;
      const barWidth = barRight - barLeft;

      const dbToY = (db: number) => {
        const clamped = Math.max(minDb, Math.min(maxDb, db));
        const normalized = (clamped - minDb) / range;
        return H - 4 - normalized * (H - 8);
      };

      const threshold = truePeakMax ?? -1;

      // Colored gradient bar
      const barY = dbToY(rmsDb);
      const barH = (H - 4) - barY;

      if (barH > 0) {
        const grad = ctx2d.createLinearGradient(0, H, 0, 0);
        const safeStop = Math.max(0, Math.min(1, (-18 - minDb) / range));
        const warnStop = Math.max(0, Math.min(1, (threshold - minDb) / range));
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(safeStop, '#22c55e');
        grad.addColorStop(Math.min(1, safeStop + 0.001), '#eab308');
        grad.addColorStop(warnStop, '#eab308');
        grad.addColorStop(Math.min(1, warnStop + 0.001), '#ef4444');
        grad.addColorStop(1, '#ef4444');

        ctx2d.fillStyle = grad;
        ctx2d.fillRect(barLeft, barY, barWidth, barH);
      }

      // Thin dark bar background (unlit part)
      ctx2d.fillStyle = 'rgba(255,255,255,0.05)';
      ctx2d.fillRect(barLeft, 4, barWidth, dbToY(rmsDb) - 4);

      // Peak hold line
      if (lastPeakDb > minDb) {
        const peakY = dbToY(lastPeakDb);
        ctx2d.fillStyle = lastPeakDb >= threshold ? '#ef4444' : 'rgba(255,255,255,0.8)';
        ctx2d.fillRect(barLeft, peakY - 1, barWidth, 2);
      }

      // Threshold dashed line
      const thresholdY = dbToY(threshold);
      ctx2d.strokeStyle = '#ef4444';
      ctx2d.lineWidth = 1;
      ctx2d.setLineDash([3, 3]);
      ctx2d.beginPath();
      ctx2d.moveTo(0, thresholdY);
      ctx2d.lineTo(W, thresholdY);
      ctx2d.stroke();
      ctx2d.setLineDash([]);

      // dB scale labels on right
      ctx2d.font = '8px monospace';
      ctx2d.textAlign = 'right';
      [-60, -30, -18, -12, -6, -3, 0].forEach(db => {
        const y = dbToY(db);
        ctx2d.fillStyle = db >= threshold ? '#ef4444' : '#555';
        ctx2d.fillText(db.toString(), W - 1, y + 3);
        // tick mark
        ctx2d.fillStyle = '#333';
        ctx2d.fillRect(barRight - 1, y, 4, 1);
      });

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, [truePeakMax]);

  // Draw static waveform + red peak markers
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || audioData.length === 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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

    const barW = W / audioData.length;
    const maxAmp = H / 2 - 4;

    // Threshold for red markers
    const threshold = truePeakMax !== undefined ? dBToLinear(truePeakMax) : null;

    // Waveform fill
    ctx.beginPath();
    for (let i = 0; i < audioData.length; i++) {
      const amp = Math.min(audioData[i] * vScale * maxAmp, maxAmp);
      if (i === 0) ctx.moveTo(0, cy - amp);
      else ctx.lineTo(i * barW, cy - amp);
    }
    ctx.lineTo(W, cy);
    for (let i = audioData.length - 1; i >= 0; i--) {
      const amp = Math.min(audioData[i] * vScale * maxAmp, maxAmp);
      ctx.lineTo(i * barW, cy + amp);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.fill();

    // Waveform stroke (top)
    ctx.beginPath();
    for (let i = 0; i < audioData.length; i++) {
      const amp = Math.min(audioData[i] * vScale * maxAmp, maxAmp);
      if (i === 0) ctx.moveTo(0, cy - amp);
      else ctx.lineTo(i * barW, cy - amp);
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Waveform stroke (bottom mirror)
    ctx.beginPath();
    for (let i = 0; i < audioData.length; i++) {
      const amp = Math.min(audioData[i] * vScale * maxAmp, maxAmp);
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

    // Red highlight where peaks exceed threshold
    if (threshold !== null) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      for (let i = 0; i < audioData.length; i++) {
        if (audioData[i] > threshold) {
          ctx.fillRect(Math.floor(i * barW), 0, Math.max(Math.ceil(barW), 1), H);
        }
      }
      // Red stroke over exceeded peaks
      let inRed = false;
      ctx.beginPath();
      for (let i = 0; i < audioData.length; i++) {
        const x = i * barW;
        const amp = Math.min(audioData[i] * vScale * maxAmp, maxAmp);
        if (audioData[i] > threshold) {
          if (!inRed) { ctx.moveTo(x, cy - amp); inRed = true; }
          else ctx.lineTo(x, cy - amp);
        } else {
          inRed = false;
        }
      }
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Cache for playhead overlay
    waveImageRef.current = ctx.getImageData(0, 0, W, H);
  }, [audioData, truePeakMax, vScale]);

  // Playhead overlay
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !waveImageRef.current || duration <= 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.putImageData(waveImageRef.current, 0, 0);

    const x = Math.round((currentTime / duration) * canvas.width);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(0, 0, x, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
            scale ×{vScale.toFixed(1)}
          </span>
          <input
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={vScale}
            onChange={e => setVScale(parseFloat(e.target.value))}
            style={{ width: '80px', cursor: 'pointer', accentColor: '#3b82f6' }}
            title="Vertical scale"
          />
        </div>
      </div>
      <div className="card-content" style={{ padding: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          {/* Waveform */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <canvas
              ref={waveCanvasRef}
              width={800}
              height={WAVEFORM_HEIGHT}
              style={{
                width: '100%',
                height: `${WAVEFORM_HEIGHT}px`,
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

          {/* VU Meter */}
          <div style={{ width: `${VU_WIDTH}px`, flexShrink: 0 }}>
            <canvas
              ref={vuCanvasRef}
              width={VU_WIDTH}
              height={WAVEFORM_HEIGHT}
              style={{
                width: `${VU_WIDTH}px`,
                height: `${WAVEFORM_HEIGHT}px`,
                background: '#0a0a0a',
                borderRadius: '4px',
                display: 'block',
              }}
            />
            <div style={{
              marginTop: '6px',
              fontSize: '0.6875rem',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
            }}>
              dBFS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
