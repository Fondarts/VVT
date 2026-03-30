import React, { useEffect, useState } from 'react';
import { X, Link, Copy, Trash2, Plus, Check, Loader } from 'lucide-react';
import type { ProjectFile, ShareLink } from '../../shared/types';
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  getShareUrl,
} from '../../utils/shareLinks';
import { findDriveFile } from '../../utils/driveApi';
import { updateFileDriveId } from '../../utils/projectStorage';

interface Props {
  file: ProjectFile;
  userId: string;
  userName: string;
  driveToken: string;
  onClose: () => void;
}

type ExpiryOption = 'never' | '7d' | '30d';
type Mode = 'presentation' | 'internal';

function expiryLabel(opt: ExpiryOption) {
  if (opt === 'never') return 'No expiry';
  if (opt === '7d') return '7 days';
  return '30 days';
}

function expiryDate(opt: ExpiryOption): Date | null {
  if (opt === 'never') return null;
  const d = new Date();
  d.setDate(d.getDate() + (opt === '7d' ? 7 : 30));
  return d;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Sin vencimiento';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const ShareLinkModal: React.FC<Props> = ({ file, userId, userName, driveToken, onClose }) => {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [resolvedDriveFileId, setResolvedDriveFileId] = useState<string | undefined>(file.driveFileId);
  const [lookingUpDrive, setLookingUpDrive] = useState(false);

  // New link config
  const [mode, setMode] = useState<Mode>('presentation');
  const [expiry, setExpiry] = useState<ExpiryOption>('never');

  // If driveFileId is missing, try to find it in Drive automatically
  useEffect(() => {
    if (file.driveFileId) return;
    setLookingUpDrive(true);
    findDriveFile(driveToken, file.name)
      .then(driveFile => {
        if (driveFile) {
          setResolvedDriveFileId(driveFile.id);
          updateFileDriveId(file.id, driveFile.id).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLookingUpDrive(false));
  }, [file.id, file.name, file.driveFileId, driveToken]);

  // Load existing links
  useEffect(() => {
    listShareLinks(file.projectId, file.id)
      .then(ls => setLinks(ls.filter(l => !l.disabled)))
      .finally(() => setLoadingLinks(false));
  }, [file.projectId, file.id]);

  const handleCreate = async () => {
    if (!resolvedDriveFileId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await createShareLink({
        projectId: file.projectId,
        fileId: file.id,
        driveFileId: resolvedDriveFileId,
        fileName: file.name,
        mode,
        createdBy: userId,
        createdByName: userName,
        expiresAt: expiryDate(expiry),
        accessToken: driveToken,
      });
      const newLink: ShareLink = {
        id: token,
        projectId: file.projectId,
        fileId: file.id,
        driveFileId: resolvedDriveFileId,
        fileName: file.name,
        mode,
        createdBy: userId,
        createdByName: userName,
        createdAt: new Date().toISOString(),
        expiresAt: expiryDate(expiry)?.toISOString() ?? null,
        disabled: false,
        accessCount: 0,
      };
      setLinks(prev => [newLink, ...prev]);
      copyToClipboard(token);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear el link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    await revokeShareLink(token);
    setLinks(prev => prev.filter(l => l.id !== token));
  };

  const copyToClipboard = (token: string) => {
    navigator.clipboard.writeText(getShareUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        width: '520px', maxWidth: '95vw',
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <Link size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Share link</div>
            <div style={{
              fontSize: '0.72rem', color: 'var(--color-text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{file.name}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Create new link */}
          <div style={{
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px', padding: '16px',
            marginBottom: '20px',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-muted)' }}>
              NEW LINK
            </div>

            {/* Mode */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Mode</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['presentation', 'internal'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: mode === m ? 600 : 400,
                      border: mode === m ? '1px solid var(--color-accent)' : '1px solid var(--border-color)',
                      background: mode === m ? 'rgba(225,255,28,0.08)' : 'transparent',
                      color: mode === m ? 'var(--color-accent)' : 'var(--color-text-primary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {m === 'presentation' ? 'Presentation' : 'Internal review'}
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 400, marginTop: '2px' }}>
                      {m === 'presentation' ? 'Video + feedback only' : 'Full access'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Expiry</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['never', '7d', '30d'] as ExpiryOption[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setExpiry(opt)}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.75rem', fontWeight: expiry === opt ? 600 : 400,
                      border: expiry === opt ? '1px solid var(--color-accent)' : '1px solid var(--border-color)',
                      background: expiry === opt ? 'rgba(225,255,28,0.08)' : 'transparent',
                      color: expiry === opt ? 'var(--color-accent)' : 'var(--color-text-primary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {expiryLabel(opt)}
                  </button>
                ))}
              </div>
            </div>

            {createError && (
              <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '10px' }}>{createError}</div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating || !resolvedDriveFileId || lookingUpDrive}
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {creating
                ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Creating...</>
                : lookingUpDrive
                  ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Looking up Drive file...</>
                  : <><Plus size={13} /> Create link & copy</>
              }
            </button>

            {!lookingUpDrive && !resolvedDriveFileId && (
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '8px', textAlign: 'center' }}>
                File not found in Google Drive. Make sure it exists in your Drive.
              </div>
            )}
          </div>

          {/* Existing links */}
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '10px' }}>
            ACTIVE LINKS
          </div>

          {loadingLinks ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
              Loading...
            </div>
          ) : links.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
              No active links
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {links.map(link => (
                <div
                  key={link.id}
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '12px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '3px',
                        background: link.mode === 'presentation' ? 'rgba(99,102,241,0.2)' : 'rgba(225,255,28,0.12)',
                        color: link.mode === 'presentation' ? '#a5b4fc' : 'var(--color-accent)',
                      }}>
                        {link.mode === 'presentation' ? 'PRESENTATION' : 'INTERNAL'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        {formatDate(link.expiresAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getShareUrl(link.id).replace('https://', '')}
                    </div>
                  </div>

                  <button
                    onClick={() => copyToClipboard(link.id)}
                    title="Copiar link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: copiedToken === link.id ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                  >
                    {copiedToken === link.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>

                  <button
                    onClick={() => handleRevoke(link.id)}
                    title="Revocar link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
