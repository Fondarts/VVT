import React from 'react';
import type { ProjectFile } from '../../shared/types';
import { useProjectNav } from '../../hooks/useProjectNav';
import { useProjects } from '../../hooks/useProjects';
import { ProjectGrid } from './ProjectGrid';
import { ProjectView } from './ProjectView';
import { ErrorBoundary } from '../ErrorBoundary';

interface VersionContext {
  currentFile: ProjectFile;
  versions: ProjectFile[];
  getLocalFile: (pf: ProjectFile) => File | null;
}

interface Props {
  userId: string;
  userName?: string;
  driveToken?: string | null;
  onFileOpen: (source: File | string, ctx?: VersionContext) => void;
}

export const ProjectDashboard: React.FC<Props> = ({ userId, userName, driveToken, onFileOpen }) => {
  const { nav, goToDashboard, goToProject, goToFolder, breadcrumbs } = useProjectNav();
  const { projects, loading, createProject, deleteProject, renameProject } = useProjects();

  const currentProject = nav.view === 'project'
    ? projects.find(p => p.id === nav.projectId)
    : null;

  return (
    <ErrorBoundary fallbackLabel="Projects dashboard crashed">
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {nav.view === 'dashboard' && (
          <ProjectGrid
            projects={projects}
            loading={loading}
            onOpen={goToProject}
            onCreate={async (name) => {
              const id = await createProject(name, userId, userName);
              goToProject(id);
            }}
            onDelete={deleteProject}
            onRename={renameProject}
          />
        )}

        {nav.view === 'project' && (
          <ProjectView
            projectId={nav.projectId}
            projectName={currentProject?.name ?? 'Project'}
            path={nav.path}
            breadcrumbs={breadcrumbs}
            userId={userId}
            userName={userName}
            driveToken={driveToken}
            onNavigate={goToFolder}
            onGoToDashboard={goToDashboard}
            onFileOpen={onFileOpen}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};
