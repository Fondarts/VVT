import React, { useState } from 'react';
import { Settings, X, UserPlus, Trash2, Crown, ChevronDown } from 'lucide-react';
import type { Project, MemberRole } from '../../shared/types';

interface Props {
  project: Project;
  currentUserId: string;
  onAddMember: (email: string, role: MemberRole) => Promise<void>;
  onRemoveMember: (uid: string, email: string) => void;
  onUpdateRole: (uid: string, role: MemberRole) => void;
  onClose: () => void;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: '#F59E0B',
  editor: '#3B82F6',
  viewer: '#6B7280',
};

export const ProjectSettingsModal: React.FC<Props> = ({
  project, currentUserId, onAddMember, onRemoveMember, onUpdateRole, onClose,
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('viewer');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const currentUserRole = project.members[currentUserId];
  const canManage = currentUserRole === 'owner' || currentUserRole === 'editor';

  const members = Object.entries(project.members).map(([uid, memberRole]) => ({
    uid,
    role: memberRole as MemberRole,
    email: project.memberEmails[project.memberUids.indexOf(uid)] ?? '',
    isOwner: memberRole === 'owner',
    isSelf: uid === currentUserId,
  }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (project.memberEmails.includes(trimmed)) {
      setError('This email is already a member');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await onAddMember(trimmed, role);
      setEmail('');
      setRole('viewer');
    } catch {
      setError('Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '24px', width: '480px', maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column',
        }}
        onClick={() => setOpenDropdown(null)}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Settings size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: '0.95rem', fontWeight: 600, flex: 1 }}>
            Project Settings — {project.name}
          </span>
          <button type="button" className="btn btn-icon btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Add member form */}
        {canManage && (
          <form onSubmit={handleAdd} style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px', display: 'block' }}>
              Add Member
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                style={{ flex: 1 }}
              />
              <select
                value={role}
                onChange={e => setRole(e.target.value as MemberRole)}
                style={{
                  background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
                  borderRadius: '6px', padding: '0 8px', color: 'var(--color-text-primary)',
                  fontSize: '0.8rem', cursor: 'pointer',
                }}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" className="btn btn-primary btn-sm" disabled={adding || !email.trim()}>
                <UserPlus size={14} />
              </button>
            </div>
            {error && (
              <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '6px' }}>{error}</div>
            )}
          </form>
        )}

        {/* Member list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px', display: 'block' }}>
            Members ({members.length})
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {members.map(m => (
              <div
                key={m.uid}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '6px',
                  background: m.isSelf ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
              >
                {/* Avatar placeholder */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: m.isOwner ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {m.isOwner ? (
                    <Crown size={13} style={{ color: '#F59E0B' }} />
                  ) : (
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                      {(m.email[0] || '?').toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Email */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.email || m.uid}
                    {m.isSelf && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}> (you)</span>}
                  </div>
                </div>

                {/* Role badge / dropdown */}
                {canManage && !m.isOwner ? (
                  <div style={{ position: 'relative' }}>
                    <button
                      className="btn btn-sm"
                      onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === m.uid ? null : m.uid); }}
                      style={{
                        fontSize: '0.72rem', padding: '2px 8px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                        borderRadius: '4px', color: ROLE_COLORS[m.role], cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {ROLE_LABELS[m.role]}
                      <ChevronDown size={10} />
                    </button>
                    {openDropdown === m.uid && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                        background: 'var(--color-bg-tertiary)', border: '1px solid var(--border-color)',
                        borderRadius: '6px', overflow: 'hidden', zIndex: 10,
                        minWidth: '100px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      }}>
                        {(['editor', 'viewer'] as MemberRole[]).map(r => (
                          <button
                            key={r}
                            onClick={e => { e.stopPropagation(); onUpdateRole(m.uid, r); setOpenDropdown(null); }}
                            style={{
                              display: 'block', width: '100%', padding: '6px 12px',
                              background: r === m.role ? 'rgba(255,255,255,0.05)' : 'transparent',
                              border: 'none', color: ROLE_COLORS[r], fontSize: '0.78rem',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = r === m.role ? 'rgba(255,255,255,0.05)' : 'transparent')}
                          >
                            {ROLE_LABELS[r]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{
                    fontSize: '0.72rem', padding: '2px 8px',
                    color: ROLE_COLORS[m.role], fontWeight: 600,
                  }}>
                    {ROLE_LABELS[m.role]}
                  </span>
                )}

                {/* Remove button */}
                {canManage && !m.isOwner && !m.isSelf && (
                  <button
                    className="btn btn-icon btn-sm"
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Remove ${m.email || m.uid} from project?`)) {
                        onRemoveMember(m.uid, m.email);
                      }
                    }}
                    title="Remove member"
                    style={{ color: 'var(--color-text-muted)', flexShrink: 0, padding: '2px' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        {!canManage && (
          <div style={{ marginTop: '16px', fontSize: '0.72rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Only owners and editors can manage members
          </div>
        )}
      </div>
    </div>
  );
};
