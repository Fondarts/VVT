import React from 'react';
import { ScanLine, Trash2, Loader2, FileDown } from 'lucide-react';
import type { BatchItem } from '../../shared/types';

interface BatchToolbarProps {
  items: BatchItem[];
  onScanAll: () => void;
  onClear: () => void;
  isInitializing: boolean;
  selectedItem?: BatchItem | null;
  onExportPDF?: () => void;
}

export const BatchToolbar: React.FC<BatchToolbarProps> = ({ items, onScanAll, onClear, isInitializing, selectedItem, onExportPDF }) => {
  const pending  = items.filter(i => i.status === 'pending').length;
  const scanning = items.filter(i => i.status === 'scanning').length;
  const done     = items.filter(i => i.status === 'done' || i.status === 'error').length;
  const total    = items.length;

  const canScan = (pending > 0) && !isInitializing;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <button
        className="btn btn-primary"
        onClick={onScanAll}
        disabled={!canScan}
        style={{ minWidth: 140 }}
      >
        {isInitializing ? (
          <><Loader2 size={15} className="animate-spin" /> Loading engine…</>
        ) : (
          <><ScanLine size={15} /> Scan All ({pending} pending)</>
        )}
      </button>

      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #888)' }}>
        {done}/{total} complete
        {scanning > 0 && ` · ${scanning} scanning`}
      </span>

      {onExportPDF && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={onExportPDF}
          disabled={!selectedItem?.scanResult}
          title={selectedItem?.scanResult ? `Export PDF for ${selectedItem.file.name}` : 'Select a scanned item to export'}
          style={{ padding: '6px 10px' }}
        >
          <FileDown size={14} />
          <span style={{ marginLeft: 4, fontSize: '0.75rem' }}>Export PDF</span>
        </button>
      )}

      <button
        className="btn btn-secondary btn-sm"
        onClick={onClear}
        style={{ marginLeft: 'auto', padding: '6px 10px' }}
        title="Clear all"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};
