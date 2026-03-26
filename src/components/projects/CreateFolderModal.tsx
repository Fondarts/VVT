import React, { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';

interface Props {
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export const CreateFolderModal: React.FC<Props> = ({ onConfirm, onClose }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onConfirm(name.trim());
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--color-bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '24px', width: '400px', maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <FolderPlus size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>New Folder</span>
          <button type="button" className="btn btn-icon btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>
        <input
          className="input"
          type="text"
          placeholder="Folder name"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          style={{ width: '100%', marginBottom: '16px' }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
};
