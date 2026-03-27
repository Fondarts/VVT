import React, { useEffect, useRef } from 'react';
import { ExternalLink, Copy, Share2, FolderOpen } from 'lucide-react';
import type { ProjectFile } from '../../shared/types';

const HELPER = 'http://127.0.0.1:3777';

interface Props {
  file: ProjectFile;
  x: number;
  y: number;
  onClose: () => void;
}

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ icon, label, disabled, onClick }) => {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 14px', cursor: disabled ? 'default' : 'pointer',
    fontSize: '0.8125rem', color: 'var(--color-text-primary)',
    background: 'transparent', border: 'none', width: '100%',
    textAlign: 'left', transition: 'background 0.1s',
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <button
      style={base}
      disabled={disabled}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={disabled ? undefined : onClick}
    >
      {icon}
      {label}
    </button>
  );
};

async function revealInDriveFolder(driveFileId: string, fileName: string) {
  try {
    await fetch(`${HELPER}/reveal-drive-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveFileId, fileName }),
    });
  } catch {
    alert('Helper not running. Start the Kissd Helper to use this feature.');
  }
}

export const FileContextMenu: React.FC<Props> = ({ file, x, y, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 10000,
    background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: '8px', padding: '4px 0', minWidth: '240px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };

  const driveFileId = file.driveFileId;
  const iconMuted = { color: 'var(--color-text-muted)' };

  return (
    <div ref={ref} style={menuStyle}>
      <MenuItem
        icon={<ExternalLink size={15} style={iconMuted} />}
        label="Open with Google Drive"
        disabled={!driveFileId}
        onClick={() => { window.open(`https://drive.google.com/file/d/${driveFileId}/view`, '_blank'); onClose(); }}
      />
      <MenuItem
        icon={<FolderOpen size={15} style={iconMuted} />}
        label="Reveal in Drive folder"
        disabled={!driveFileId}
        onClick={() => { revealInDriveFolder(driveFileId!, file.name); onClose(); }}
      />
      <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
      <MenuItem
        icon={<Copy size={15} style={iconMuted} />}
        label="Copy link to clipboard"
        disabled={!driveFileId}
        onClick={() => { navigator.clipboard.writeText(`https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`); onClose(); }}
      />
      <MenuItem
        icon={<Share2 size={15} style={iconMuted} />}
        label="Share with Google Drive"
        disabled={!driveFileId}
        onClick={() => { window.open(`https://drive.google.com/file/d/${driveFileId}/edit?usp=sharing`, '_blank'); onClose(); }}
      />
    </div>
  );
};

/* Hook for managing context menu state */
export function useFileContextMenu() {
  const [menu, setMenu] = React.useState<{ file: ProjectFile; x: number; y: number } | null>(null);

  const onContextMenu = (e: React.MouseEvent, file: ProjectFile) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ file, x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setMenu(null);

  return { menu, onContextMenu, closeMenu };
}
