import React, { useState, useRef, useEffect } from 'react';
import { Folder, Trash2, Pencil, User } from 'lucide-react';
import type { Project } from '../../shared/types';

interface Props {
  project: Project;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}

export const ProjectCard: React.FC<Props> = ({ project, onClick, onDelete, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== project.name) onRename(trimmed);
    else setDraft(project.name);
  };

  const dateStr = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div
      onClick={editing ? undefined : onClick}
      style={{
        background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '10px', padding: '20px', cursor: editing ? 'default' : 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Folder size={20} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(project.name); setEditing(false); } }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, fontWeight: 600, fontSize: '0.9rem',
              background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent)',
              borderRadius: '4px', padding: '2px 6px', color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        ) : (
          <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </span>
        )}
        <button
          className="btn btn-icon btn-sm"
          onClick={e => { e.stopPropagation(); setDraft(project.name); setEditing(true); }}
          title="Rename project"
          style={{ color: 'var(--color-text-muted)', flexShrink: 0, padding: '2px' }}
        >
          <Pencil size={12} />
        </button>
        <button
          className="btn btn-icon btn-sm"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete project"
          style={{ color: 'var(--color-text-muted)', flexShrink: 0, padding: '2px' }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        {dateStr && <span>Updated {dateStr}</span>}
        {project.createdByName && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <User size={10} /> {project.createdByName}
          </span>
        )}
      </div>
    </div>
  );
};
