import { useState, useEffect, useCallback } from 'react';
import type { Project, MemberRole } from '../shared/types';
import {
  subscribeProjects,
  createProject as createProjectFn,
  deleteProject as deleteProjectFn,
  renameProject as renameProjectFn,
  addProjectMember,
  removeProjectMember,
  updateMemberRole as updateMemberRoleFn,
} from '../utils/projectStorage';

export interface UseProjectsReturn {
  projects: Project[];
  loading: boolean;
  createProject: (name: string, userId: string, userName?: string, userEmail?: string) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  addMember: (projectId: string, uid: string, email: string, role: MemberRole) => Promise<void>;
  removeMember: (projectId: string, uid: string, email: string) => Promise<void>;
  updateMemberRole: (projectId: string, uid: string, role: MemberRole) => Promise<void>;
}

export function useProjects(userId?: string | null): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeProjects(userId, (p) => {
      setProjects(p);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  const createProject = useCallback(async (name: string, userId: string, userName?: string, userEmail?: string) => {
    return createProjectFn(name, userId, userName, userEmail);
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    return deleteProjectFn(projectId);
  }, []);

  const renameProject = useCallback(async (projectId: string, newName: string) => {
    return renameProjectFn(projectId, newName);
  }, []);

  const addMember = useCallback(async (projectId: string, uid: string, email: string, role: MemberRole) => {
    return addProjectMember(projectId, uid, email, role);
  }, []);

  const removeMember = useCallback(async (projectId: string, uid: string, email: string) => {
    return removeProjectMember(projectId, uid, email);
  }, []);

  const updateMemberRole = useCallback(async (projectId: string, uid: string, role: MemberRole) => {
    return updateMemberRoleFn(projectId, uid, role);
  }, []);

  return { projects, loading, createProject, deleteProject, renameProject, addMember, removeMember, updateMemberRole };
}
