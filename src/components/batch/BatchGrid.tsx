import React from 'react';
import type { BatchItem } from '../../shared/types';
import { BatchCard } from './BatchCard';

interface BatchGridProps {
  items: BatchItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export const BatchGrid: React.FC<BatchGridProps> = ({ items, selectedId, onSelect, onRemove }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '4px 0 8px',
  }}>
    {items.map(item => (
      <BatchCard
        key={item.id}
        item={item}
        isSelected={item.id === selectedId}
        onClick={() => onSelect(item.id)}
        onRemove={(e) => { e.stopPropagation(); onRemove(item.id); }}
      />
    ))}
  </div>
);
