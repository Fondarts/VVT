import React, { useState, useRef, useEffect } from 'react';
import type { ValidationPreset, ValidationReport } from '../../shared/types';
import type { UseBatchReturn } from '../../hooks/useBatch';
import { generatePDF } from '../../utils/pdfGenerator';
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

  // Auto-select first item whenever nothing is selected but items exist
  useEffect(() => {
    if (selectedId === null && batch.items.length > 0) {
      const firstId = batch.items[0].id;
      setSelectedId(firstId);
      batch.loadThumbnails(firstId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.items.length, selectedId]);

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

  const handleExportPDF = async () => {
    if (!selectedItem?.scanResult) return;
    const report: ValidationReport = {
      timestamp: new Date().toISOString(),
      presetUsed: selectedPreset,
      result: selectedItem.validationResult || 'COMPLIANT',
      file: selectedItem.scanResult.file,
      detected: selectedItem.scanResult,
      checks: selectedItem.checks,
      contrastChecks: selectedItem.contrastChecks,
      thumbnails: selectedItem.thumbnails,
      audioWaveform: selectedItem.waveformData,
      outputFolder: '',
      transcription: selectedItem.transcription ?? undefined,
    };
    const name = selectedItem.scanResult.file.name.replace(/\.[^.]+$/, '');
    await generatePDF(report, `Kissd_VVT_Report_${name}.pdf`);
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
              selectedItem={selectedItem}
              onExportPDF={handleExportPDF}
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
          onUpdateItem={batch.updateItem}
        />
      )}
    </div>
  );
};
