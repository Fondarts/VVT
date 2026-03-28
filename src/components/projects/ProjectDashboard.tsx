import React, { useEffect, useState } from 'react';
import type { Project, ProjectFile } from '../../shared/types';
import { useProjectNav } from '../../hooks/useProjectNav';
import { useProjects } from '../../hooks/useProjects';
import { ProjectGrid } from './ProjectGrid';
import { ProjectView } from './ProjectView';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { ErrorBoundary } from '../ErrorBoundary';

interface VersionContext {
  currentFile: ProjectFile;
  versions: ProjectFile[];
  getLocalFile: (pf: ProjectFile) => File | null;
}

interface Props {
  userId: string;
  userName?: string;
  userEmail?: string;
  driveToken?: string | null;
  onFileOpen: (source: File | string, ctx?: VersionContext) => void;
}

export const ProjectDashboard: React.FC<Props> = ({ userId, userName, userEmail, driveToken, onFileOpen }) => {
  const { nav, goToDashboard, goToProject, goToFolder, breadcrumbs } = useProjectNav();
  const { projects, loading, createProject, deleteProject, renameProject, addMember, removeMember, updateMemberRole } = useProjects(userId);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  // Navigate to project if requested from sidebar
  useEffect(() => {
    const target = sessionStorage.getItem('kissd_goto_project');
    if (target) {
      sessionStorage.removeItem('kissd_goto_project');
      goToProject(target);
    }
  }, [goToProject]);

  const currentProject = nav.view === 'project'
    ? projects.find(p => p.id === nav.projectId)
    : null;

  // Keep settingsProject in sync with live project data
  const liveSettingsProject = settingsProject ? projects.find(p => p.id === settingsProject.id) ?? settingsProject : null;

  return (
    <ErrorBoundary fallbackLabel="Projects dashboard crashed">
      {liveSettingsProject && (
        <ProjectSettingsModal
          project={liveSettingsProject}
          currentUserId={userId}
          onAddMember={async (email, role) => {
            // For now, add with a placeholder uid derived from email.
            // A proper implementation would look up the user via Firebase Auth or invite system.
            const placeholderUid = `pending_${email}`;
            await addMember(liveSettingsProject.id, placeholderUid, email, role);
          }}
          onRemoveMember={(uid, email) => removeMember(liveSettingsProject.id, uid, email)}
          onUpdateRole={(uid, role) => updateMemberRole(liveSettingsProject.id, uid, role)}
          onClose={() => setSettingsProject(null)}
        />
      )}
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {nav.view === 'dashboard' && (
          <ProjectGrid
            projects={projects}
            loading={loading}
            onOpen={goToProject}
            onCreate={async (name) => {
              const id = await createProject(name, userId, userName, userEmail);
              goToProject(id);
            }}
            onDelete={deleteProject}
            onRename={renameProject}
            onSettings={setSettingsProject}
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
