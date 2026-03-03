import React, { useState, useRef } from 'react';
import type { ValidationPreset } from '../../shared/types';
import type { UseBatchReturn } from '../../hooks/useBatch';
import { BatchDropZone } from './BatchDropZone';
import { BatchToolbar } from './BatchToolbar';
import { BatchGrid } from './BatchGrid';
import { BatchDetailPanel } from './BatchDetailPanel';

interface BatchViewProps {
  batch: UseBatchReturn;
  selectedPreset: string;
  allPresets: ValidationPreset[];
}

export const BatchView: React.FC<BatchViewProps> = ({ batch, selectedPreset, allPresets }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const hasInitialized = useRef(false);

  const selectedItem = batch.items.find(i => i.id === selectedId) ?? null;

  const handleScanAll = async () => {
    if (!hasInitialized.current) {
      setIsInitializing(true);
      hasInitialized.current = true;
    }
    await batch.scanAll();
    setIsInitializing(false);
  };

  const handleSelect = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
    // Load thumbnails on demand when opening the detail panel
    batch.loadThumbnails(id);
  };

  const handleRemove = (id: string) => {
    if (selectedId === id) setSelectedId(null);
    batch.removeItem(id);
  };

  return (
    <div style={{
      display: 'flex',
      gap: 16,
      height: '100%',
      minHeight: 0,
      alignItems: 'flex-start',
    }}>
      {/* Left: drop zone + grid */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: selectedItem ? 420 : '100%',
        flexShrink: 0,
        minWidth: 0,
        transition: 'width 0.2s',
      }}>
        <BatchDropZone onFiles={batch.addFiles} compact={batch.items.length > 0} />

        {batch.items.length > 0 && (
          <>
            <BatchToolbar
              items={batch.items}
              onScanAll={handleScanAll}
              onClear={batch.clear}
              isInitializing={isInitializing}
            />
            <BatchGrid
              items={batch.items}
              selectedId={selectedId}
              onSelect={handleSelect}
              onRemove={handleRemove}
            />
          </>
        )}
      </div>

      {/* Right: detail panel */}
      {selectedItem && (
        <BatchDetailPanel
          item={selectedItem}
          selectedPreset={selectedPreset}
          allPresets={allPresets}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
};
