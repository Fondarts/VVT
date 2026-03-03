import { useState, useCallback, useRef, useEffect } from 'react';
import type { BatchItem, ValidationPreset } from '../shared/types';
import { initBatchPool, acquirePoolSlot, releasePoolSlot, runScanOnSlot, generateThumbnails } from '../api/ffmpeg';
import { validateAgainstPreset } from '../utils/validation';

export interface UseBatchReturn {
  items: BatchItem[];
  addFiles: (files: File[]) => void;
  scanAll: () => Promise<void>;
  clear: () => void;
  removeItem: (id: string) => void;
  loadThumbnails: (id: string) => Promise<void>;
}

export function useBatch(
  selectedPreset: string,
  allPresets: ValidationPreset[]
): UseBatchReturn {
  const [items, setItems] = useState<BatchItem[]>([]);
  const runningCountRef = useRef(0);
  // Keep a ref to latest items for use inside async callbacks
  const itemsRef = useRef<BatchItem[]>([]);
  // Pending IDs queue — dequeued synchronously to avoid race conditions
  const queueRef = useRef<string[]>([]);
  // Tracks IDs currently having thumbnails generated to prevent duplicate loads
  const loadingThumbsRef = useRef<Set<string>>(new Set());
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Re-validate all scanned items whenever the selected preset changes
  useEffect(() => {
    setItems(prev => prev.map(item => {
      if (!item.scanResult) return item;
      let checks: BatchItem['checks'] = [];
      let validationResult: BatchItem['validationResult'] = null;
      if (selectedPreset) {
        const preset = allPresets.find(p => p.id === selectedPreset);
        if (preset) {
          const v = validateAgainstPreset(item.scanResult, preset, []);
          checks = v.checks;
          validationResult = v.result;
        }
      }
      return { ...item, checks, validationResult };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset]);

  const updateItem = useCallback((id: string, patch: Partial<BatchItem> | ((prev: BatchItem) => Partial<BatchItem>)) => {
    setItems(prev => prev.map(item =>
      item.id !== id ? item : {
        ...item,
        ...(typeof patch === 'function' ? patch(item) : patch),
      }
    ));
  }, []);

  const dispatchNext = useCallback(async (
    presetId: string,
    presets: ValidationPreset[]
  ) => {
    if (runningCountRef.current >= 1) return;

    const slot = acquirePoolSlot();
    if (!slot) return;

    // Dequeue synchronously — avoids race when two dispatchers run before React re-renders
    const nextId = queueRef.current.shift();
    if (!nextId) {
      releasePoolSlot(slot);
      return;
    }
    const nextItem = itemsRef.current.find(i => i.id === nextId);
    if (!nextItem) {
      releasePoolSlot(slot);
      dispatchNext(presetId, presets);
      return;
    }

    runningCountRef.current += 1;
    updateItem(nextItem.id, { status: 'scanning', statusLabel: 'Starting…' });

    try {
      await runScanOnSlot(slot, nextItem.file, {
        onProgress: (pct, label) => updateItem(nextItem.id, { progress: pct, statusLabel: label }),
        onScanReady: (scan) => {
          // Run validation immediately when scan is ready
          let checks: BatchItem['checks'] = [];
          let validationResult: BatchItem['validationResult'] = null;
          if (presetId) {
            const preset = presets.find(p => p.id === presetId);
            if (preset) {
              const v = validateAgainstPreset(scan, preset, []);
              checks = v.checks;
              validationResult = v.result;
            }
          }
          updateItem(nextItem.id, { scanResult: scan, checks, validationResult });
        },
        onLoudnessReady: (lufs, truePeak) => {
          setItems(prev => prev.map(item => {
            if (item.id !== nextItem.id || !item.scanResult?.audio) return item;
            const updatedScan = {
              ...item.scanResult,
              audio: { ...item.scanResult.audio, lufs, truePeak },
            };
            // Re-run validation with updated loudness
            let checks = item.checks;
            let validationResult = item.validationResult;
            if (presetId) {
              const preset = presets.find(p => p.id === presetId);
              if (preset) {
                const v = validateAgainstPreset(updatedScan, preset, []);
                checks = v.checks;
                validationResult = v.result;
              }
            }
            return { ...item, scanResult: updatedScan, checks, validationResult };
          }));
        },
        onWaveformReady: (wf) => updateItem(nextItem.id, { waveformData: wf }),
      });
      updateItem(nextItem.id, { status: 'done', progress: 100, statusLabel: 'Done' });
    } catch (err) {
      updateItem(nextItem.id, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        statusLabel: 'Error',
      });
    } finally {
      releasePoolSlot(slot);
      runningCountRef.current -= 1;
      // Tail call: pick up next queued item
      dispatchNext(presetId, presets);
    }
  }, [updateItem]);

  const addFiles = useCallback((files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: 'pending',
      progress: 0,
      statusLabel: 'Pending',
      previewThumb: null,
      scanResult: null,
      checks: [],
      validationResult: null,
      thumbnails: [],
      waveformData: [],
      videoSrc: URL.createObjectURL(file),
      error: null,
    }));
    queueRef.current.push(...newItems.map(i => i.id));
    setItems(prev => [...prev, ...newItems]);
  }, []);

  const scanAll = useCallback(async () => {
    await initBatchPool();
    dispatchNext(selectedPreset, allPresets);
  }, [dispatchNext, selectedPreset, allPresets]);

  /** Generate thumbnails for an item on demand (called when the detail panel opens). */
  const loadThumbnails = useCallback(async (id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item || item.thumbnails.length > 0 || loadingThumbsRef.current.has(id)) return;

    loadingThumbsRef.current.add(id);
    try {
      const thumbs = await generateThumbnails(item.file, 6);
      updateItem(id, prev => ({
        thumbnails: thumbs,
        previewThumb: thumbs[0] ?? prev.previewThumb,
      }));
    } finally {
      loadingThumbsRef.current.delete(id);
    }
  }, [updateItem]);

  const revokeItem = (item: BatchItem) => {
    if (item.videoSrc) URL.revokeObjectURL(item.videoSrc);
    item.thumbnails.forEach(t => { if (t.startsWith('blob:')) URL.revokeObjectURL(t); });
  };

  const removeItem = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter(qid => qid !== id);
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) revokeItem(item);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    setItems(prev => {
      prev.forEach(revokeItem);
      return [];
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach(revokeItem);
    };
  }, []);

  return { items, addFiles, scanAll, clear, removeItem, loadThumbnails };
}
