import React, { useState, useEffect } from 'react';

interface HelperInfo {
  status: 'checking' | 'connected' | 'offline';
  version?: string;
  ffmpeg?: string;
}

const HELPER_URL = 'http://127.0.0.1:3777';

export const HelperStatus: React.FC = () => {
  const [info, setInfo] = useState<HelperInfo>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setInfo({ status: 'connected', version: data.version, ffmpeg: data.ffmpeg });
        } else {
          setInfo({ status: 'offline' });
        }
      } catch {
        if (!cancelled) setInfo({ status: 'offline' });
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const color = info.status === 'connected' ? 'var(--color-success)'
    : info.status === 'offline' ? 'var(--color-text-muted)'
    : 'var(--color-warning)';

  const label = info.status === 'connected' ? `Helper v${info.version}`
    : info.status === 'offline' ? 'Helper offline'
    : 'Checking...';

  return (
    <div
      title={info.status === 'connected'
        ? `KISSD Helper v${info.version}\nFFmpeg: ${info.ffmpeg || 'not found'}`
        : 'KISSD Export Helper is not running.\nRun helper/server.js or KissdHelper.exe for native exports.'
      }
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        fontSize: '0.65rem', color: 'var(--color-text-muted)',
        cursor: 'default',
      }}
    >
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: color, flexShrink: 0,
      }} />
      <span>{label}</span>
    </div>
  );
};
