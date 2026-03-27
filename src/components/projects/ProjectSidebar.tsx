import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileVideo, Image as ImageIcon, Music } from 'lucide-react';
import type { Project, ProjectFolder, ProjectFile, VersionGroup } from '../../shared/types';
import { subscribeFolders, subscribeFiles } from '../../utils/projectStorage';
import { groupByVersion } from '../../utils/versionDetection';
import { FileContextMenu, useFileContextMenu } from './FileContextMenu';

const TYPE_ICON: Record<string, React.ReactNode> = {
  video: <FileVideo size={13} style={{ color: '#FA4900' }} />,
  image: <ImageIcon size={13} style={{ color: '#34C759' }} />,
  audio: <Music size={13} style={{ color: '#0A84FF' }} />,
};

/* ── Generic sidebar row ─────────────────────────────────────────── */
const SidebarRow: React.FC<{
  depth: number;
  icon: React.ReactNode;
  chevron?: React.ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  muted?: boolean;
}> = ({ depth, icon, chevron, label, badge, onClick, onContextMenu, muted }) => (
  <button
    onClick={onClick}
    onContextMenu={onContextMenu}
    style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      width: '100%', padding: `6px 12px 6px ${depth * 16 + 12}px`,
      background: 'transparent', border: 'none',
      color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
      cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left',
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
  >
    {chevron || <span style={{ width: '11px', flexShrink: 0 }} />}
    {icon}
    <span title={label} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {label}
    </span>
    {badge && (
      <span style={{
        background: 'var(--color-accent)', color: '#000', borderRadius: '3px',
        padding: '0 4px', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
      }}>
        {badge}
      </span>
    )}
  </button>
);

/* ── Version group node (expandable to show older versions) ──────── */
const VersionGroupNode: React.FC<{
  group: VersionGroup;
  depth: number;
  onFileClick: (file: ProjectFile) => void;
  onContextMenu: (e: React.MouseEvent, file: ProjectFile) => void;
}> = ({ group, depth, onFileClick, onContextMenu }) => {
  const [expanded, setExpanded] = useState(false);
  const hasVersions = group.versions.length > 1;

  return (
    <>
      <SidebarRow
        depth={depth}
        icon={TYPE_ICON[group.latest.type] || TYPE_ICON.video}
        chevron={hasVersions
          ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
          : undefined
        }
        label={group.latest.name}
        badge={group.latest.versionTag?.toUpperCase()}
        onClick={() => {
          if (hasVersions) setExpanded(e => !e);
          else onFileClick(group.latest);
        }}
        onContextMenu={e => onContextMenu(e, group.latest)}
        muted
      />
      {expanded && group.versions.slice(1).map(v => (
        <SidebarRow
          key={v.id}
          depth={depth + 1}
          icon={TYPE_ICON[v.type] || TYPE_ICON.video}
          label={v.name}
          badge={v.versionTag?.toUpperCase()}
          onClick={() => onFileClick(v)}
          onContextMenu={e => onContextMenu(e, v)}
          muted
        />
      ))}
    </>
  );
};

/* ── File tree node for a folder ─────────────────────────────────── */
const FolderNode: React.FC<{
  projectId: string;
  path: string;
  name: string;
  depth: number;
  onFileClick: (file: ProjectFile) => void;
  onContextMenu: (e: React.MouseEvent, file: ProjectFile) => void;
}> = ({ projectId, path, name, depth, onFileClick, onContextMenu }) => {
  const [expanded, setExpanded] = useState(false);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);

  useEffect(() => {
    if (!expanded) return;
    const unsub1 = subscribeFolders(projectId, path, setFolders);
    const unsub2 = subscribeFiles(projectId, path, setFiles);
    return () => { unsub1(); unsub2(); };
  }, [expanded, projectId, path]);

  const versionGroups = useMemo(() => groupByVersion(files), [files]);

  return (
    <>
      <SidebarRow
        depth={depth}
        icon={expanded
          ? <FolderOpen size={14} style={{ color: 'var(--color-accent)' }} />
          : <Folder size={14} style={{ color: 'var(--color-accent)' }} />
        }
        chevron={expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        label={name}
        onClick={() => setExpanded(e => !e)}
      />
      {expanded && (
        <>
          {folders.map(f => (
            <FolderNode
              key={f.id}
              projectId={projectId}
              path={f.path}
              name={f.name}
              depth={depth + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
            />
          ))}
          {versionGroups.map(g => (
            <VersionGroupNode
              key={g.baseName}
              group={g}
              depth={depth + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
            />
          ))}
          {folders.length === 0 && versionGroups.length === 0 && (
            <div style={{ paddingLeft: `${(depth + 1) * 16 + 12}px`, fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '4px 0' }}>
              Empty
            </div>
          )}
        </>
      )}
    </>
  );
};

/* ── Main sidebar ────────────────────────────────────────────────── */
interface Props {
  projects: Project[];
  onFileClick: (file: ProjectFile) => void;
}

export const ProjectSidebar: React.FC<Props> = ({ projects, onFileClick }) => {
  const [open, setOpen] = useState(false);
  const { menu, onContextMenu, closeMenu } = useFileContextMenu();

  const handleFileClick = useCallback((file: ProjectFile) => {
    onFileClick(file);
    setOpen(false);
  }, [onFileClick]);

  return (
    <>
      {/* Hover trigger zone */}
      <div
        onMouseEnter={() => setOpen(true)}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0,
          width: '24px', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '4px', height: '48px', borderRadius: '0 4px 4px 0',
          background: open ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)',
          transition: 'background 0.2s',
        }} />
      </div>

      {/* Backdrop */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 998 }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        onMouseLeave={() => setOpen(false)}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0,
          width: '350px', zIndex: 999,
          background: 'var(--color-bg-secondary)',
          borderRight: '1px solid var(--border-color)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
          fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <Folder size={16} style={{ color: 'var(--color-accent)' }} />
          Projects
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {projects.map(p => (
            <FolderNode
              key={p.id}
              projectId={p.id}
              path="/"
              name={p.name}
              depth={0}
              onFileClick={handleFileClick}
              onContextMenu={onContextMenu}
            />
          ))}
          {projects.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
              No projects yet
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {menu && <FileContextMenu file={menu.file} x={menu.x} y={menu.y} onClose={closeMenu} />}
    </>
  );
};
