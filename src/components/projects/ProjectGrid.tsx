import React, { useState } from 'react';
import { Plus, Loader2, LayoutGrid, List, Folder, Trash2, Calendar } from 'lucide-react';
import type { Project } from '../../shared/types';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';

type ViewMode = 'grid' | 'list';

interface Props {
  projects: Project[];
  loading: boolean;
  onOpen: (projectId: string) => void;
  onCreate: (name: string) => void;
  onDelete: (projectId: string) => void;
}

const ProjectListRow: React.FC<{ project: Project; onClick: () => void; onDelete: () => void }> = ({ project, onClick, onDelete }) => {
  const createdStr = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const updatedStr = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border-color)',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <Folder size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {project.name}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', minWidth: '120px' }}>
        <Calendar size={11} /> {createdStr}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', minWidth: '160px' }}>
        <Calendar size={11} /> {updatedStr}
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
  );
};

export const ProjectGrid: React.FC<Props> = ({ projects, loading, onOpen, onCreate, onDelete }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => (localStorage.getItem('projectViewMode') as ViewMode) || 'grid');
  const setViewMode = (m: ViewMode) => { setViewModeState(m); localStorage.setItem('projectViewMode', m); };

  return (
    <>
      {showCreate && (
        <CreateProjectModal
          onConfirm={name => { onCreate(name); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Projects</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '4px 8px' }}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              title="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, padding: '4px 8px' }}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: '12px' }}>No projects yet</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create your first project
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
        }}>
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => onOpen(p.id)}
              onDelete={() => {
                if (window.confirm(`Delete project "${p.name}"?`)) onDelete(p.id);
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{
          background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: '10px', overflow: 'hidden',
        }}>
          {/* List header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '8px 16px', borderBottom: '1px solid var(--border-color)',
            fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-muted)',
          }}>
            <span style={{ width: '18px', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Name</span>
            <span style={{ minWidth: '120px', flexShrink: 0 }}>Created</span>
            <span style={{ minWidth: '160px', flexShrink: 0 }}>Last Updated</span>
            <span style={{ width: '32px', flexShrink: 0 }} />
          </div>
          {projects.map(p => (
            <ProjectListRow
              key={p.id}
              project={p}
              onClick={() => onOpen(p.id)}
              onDelete={() => {
                if (window.confirm(`Delete project "${p.name}"?`)) onDelete(p.id);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
};
