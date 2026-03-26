import React from 'react';
import { Folder, Trash2 } from 'lucide-react';
import type { Project } from '../../shared/types';

interface Props {
  project: Project;
  onClick: () => void;
  onDelete: () => void;
}

export const ProjectCard: React.FC<Props> = ({ project, onClick, onDelete }) => {
  const dateStr = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '10px', padding: '20px', cursor: 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Folder size={20} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.name}
        </span>
        <button
          className="btn btn-icon btn-sm"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete project"
          style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        {dateStr && `Updated ${dateStr}`}
      </span>
    </div>
  );
};
