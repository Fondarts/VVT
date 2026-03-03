import React from 'react';
import { FileVideo, CheckCircle, XCircle, AlertTriangle, Loader2, Clock } from 'lucide-react';
import type { BatchItem } from '../../shared/types';

interface BatchCardProps {
  item: BatchItem;
  isSelected: boolean;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

function ResultBadge({ result }: { result: BatchItem['validationResult'] }) {
  if (!result) return null;
  const map = {
    COMPLIANT:       { icon: <CheckCircle size={11} />,    color: 'var(--color-success, #22c55e)',  label: 'OK' },
    'NON-COMPLIANT': { icon: <XCircle size={11} />,        color: 'var(--color-error, #ef4444)',    label: 'FAIL' },
    WARNINGS:        { icon: <AlertTriangle size={11} />,  color: 'var(--color-warning, #f59e0b)',  label: 'WARN' },
  } as const;
  const { icon, color, label } = map[result];
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, color, fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }}>
      {icon} {label}
    </span>
  );
}

export const BatchCard: React.FC<BatchCardProps> = ({ item, isSelected, onClick, onRemove }) => {
  const isScanning = item.status === 'scanning';
  const isError    = item.status === 'error';
  const isPending  = item.status === 'pending';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 8px',
        borderRadius: 6,
        border: isSelected
          ? '1px solid var(--color-accent, #6366f1)'
          : '1px solid var(--border-color, #333)',
        background: isSelected
          ? 'color-mix(in srgb, var(--color-accent, #6366f1) 8%, var(--color-bg-secondary, #1a1a1a))'
          : 'var(--color-bg-secondary, #1a1a1a)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        minWidth: 0,
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 72,
        aspectRatio: '16/9',
        borderRadius: 4,
        background: 'var(--color-bg-tertiary, #111)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}>
        {item.previewThumb ? (
          <img
            src={item.previewThumb}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : isScanning ? (
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-accent, #6366f1)' }} />
        ) : isPending ? (
          <Clock size={16} style={{ color: 'var(--color-text-muted, #666)' }} />
        ) : (
          <FileVideo size={16} style={{ color: 'var(--color-text-muted, #666)' }} />
        )}

        {/* Progress bar overlay at bottom of thumbnail */}
        {isScanning && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: 'rgba(0,0,0,0.4)',
          }}>
            <div style={{
              height: '100%',
              width: `${item.progress}%`,
              background: 'var(--color-accent, #6366f1)',
              transition: 'width 0.3s',
            }} />
          </div>
        )}
      </div>

      {/* Filename + status */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <p style={{
          fontSize: '0.75rem',
          color: 'var(--color-text-primary, #fff)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          margin: 0,
        }} title={item.file.name}>
          {item.file.name}
        </p>

        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted, #888)' }}>
          {isScanning && `${item.statusLabel} ${item.progress}%`}
          {isPending  && 'Pending'}
          {isError    && <span style={{ color: 'var(--color-error, #ef4444)' }}>Error: {item.error?.slice(0, 50)}</span>}
          {item.status === 'done' && <ResultBadge result={item.validationResult} />}
        </span>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        title="Remove"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-muted, #666)',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
          borderRadius: 3,
        }}
      >
        ×
      </button>
    </div>
  );
};
