import React from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  crumbs: { label: string; path: string | null }[];
  projectName?: string;
  onNavigate: (path: string) => void;
  onGoToDashboard: () => void;
}

export const ProjectBreadcrumb: React.FC<Props> = ({ crumbs, projectName, onNavigate, onGoToDashboard }) => {
  return (
    <nav aria-label="Breadcrumb" style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      fontSize: '0.8125rem', flexWrap: 'wrap',
    }}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const label = crumb.label === '__PROJECT__' && projectName ? projectName : crumb.label;

        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
            {isLast || !crumb.path ? (
              <span style={{ color: 'var(--color-text-primary)', fontWeight: isLast ? 600 : 400 }}>
                {label}
              </span>
            ) : (
              <button
                onClick={() => crumb.path === 'dashboard' ? onGoToDashboard() : onNavigate(crumb.path!)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--color-accent)', cursor: 'pointer',
                  fontSize: 'inherit',
                }}
              >
                {label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
