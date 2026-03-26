import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import type { Project } from '../../shared/types';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';

interface Props {
  projects: Project[];
  loading: boolean;
  onOpen: (projectId: string) => void;
  onCreate: (name: string) => void;
  onDelete: (projectId: string) => void;
}

export const ProjectGrid: React.FC<Props> = ({ projects, loading, onOpen, onCreate, onDelete }) => {
  const [showCreate, setShowCreate] = useState(false);

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
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Project
        </button>
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
      ) : (
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
      )}
    </>
  );
};
