import { useState, useEffect, useCallback } from 'react';
import type { Project } from '../shared/types';
import { subscribeProjects, createProject as createProjectFn, deleteProject as deleteProjectFn, renameProject as renameProjectFn } from '../utils/projectStorage';

export interface UseProjectsReturn {
  projects: Project[];
  loading: boolean;
  createProject: (name: string, userId: string, userName?: string) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeProjects((p) => {
      setProjects(p);
      setLoading(false);
    });
    return unsub;
  }, []);

  const createProject = useCallback(async (name: string, userId: string, userName?: string) => {
    return createProjectFn(name, userId, userName);
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    return deleteProjectFn(projectId);
  }, []);

  const renameProject = useCallback(async (projectId: string, newName: string) => {
    return renameProjectFn(projectId, newName);
  }, []);

  return { projects, loading, createProject, deleteProject, renameProject };
}
