import { useState, useCallback, useMemo } from 'react';
import type { ProjectNavLocation } from '../shared/types';

export interface UseProjectNavReturn {
  nav: ProjectNavLocation;
  goToDashboard: () => void;
  goToProject: (projectId: string) => void;
  goToFolder: (path: string) => void;
  breadcrumbs: { label: string; path: string | null }[];
}

export function useProjectNav(): UseProjectNavReturn {
  const [nav, setNav] = useState<ProjectNavLocation>({ view: 'dashboard' });

  const goToDashboard = useCallback(() => {
    setNav({ view: 'dashboard' });
  }, []);

  const goToProject = useCallback((projectId: string) => {
    setNav({ view: 'project', projectId, path: '/' });
  }, []);

  const goToFolder = useCallback((path: string) => {
    setNav(prev => {
      if (prev.view !== 'project') return prev;
      return { ...prev, path };
    });
  }, []);

  const breadcrumbs = useMemo(() => {
    if (nav.view === 'dashboard') return [{ label: 'Projects', path: null }];

    const crumbs: { label: string; path: string | null }[] = [
      { label: 'Projects', path: 'dashboard' },
    ];

    // Add project root as a breadcrumb (clickable when inside a subfolder)
    const parts = nav.path.split('/').filter(Boolean);
    crumbs.push({ label: '__PROJECT__', path: parts.length > 0 ? '/' : null });

    let accumulated = '/';
    for (const part of parts) {
      accumulated = accumulated === '/' ? `/${part}` : `${accumulated}/${part}`;
      crumbs.push({ label: part, path: accumulated });
    }

    // Last breadcrumb is current location — not clickable
    crumbs[crumbs.length - 1].path = null;

    return crumbs;
  }, [nav]);

  return { nav, goToDashboard, goToProject, goToFolder, breadcrumbs };
}
