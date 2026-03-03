import React from 'react';
import { X, Loader2 } from 'lucide-react';
import type { BatchItem, ValidationPreset } from '../../shared/types';
import { ReportHeader } from '../ReportHeader';
import { VideoPlayer } from '../VideoPlayer';
import { Waveform } from '../Waveform';
import { CheckResults } from '../CheckResults';
import { ThumbnailGrid } from '../ThumbnailGrid';

interface BatchDetailPanelProps {
  item: BatchItem;
  selectedPreset: string;
  allPresets: ValidationPreset[];
  onClose: () => void;
}

export const BatchDetailPanel: React.FC<BatchDetailPanelProps> = ({
  item,
  selectedPreset,
  allPresets,
  onClose,
}) => {
  const preset = allPresets.find(p => p.id === selectedPreset);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      overflow: 'hidden',
      maxHeight: '100%',
    }}>
      {/* Header — full width, pinned */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          margin: 0,
        }} title={item.file.name}>
          {item.file.name}
        </p>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          style={{ padding: '4px 8px', flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 2-column body */}
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0, overflow: 'hidden' }}>

        {/* Center column: VideoPlayer + Waveform */}
        <div style={{ width: 600, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {item.videoSrc && (
            <div style={{ flexShrink: 0 }}>
              <VideoPlayer
                compact
                videoSrc={item.videoSrc}
                videoCodec={item.scanResult?.video.codec ?? ''}
                videoWidth={item.scanResult?.video.width ?? 0}
                videoHeight={item.scanResult?.video.height ?? 0}
                frameRate={item.scanResult?.video.frameRate ?? 0}
              />
            </div>
          )}
          {item.scanResult && item.waveformData.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <Waveform
                audioData={item.waveformData}
                duration={item.scanResult.file.duration}
                currentTime={0}
                truePeakMax={preset?.truePeakMax}
              />
            </div>
          )}
        </div>

        {/* Right column: specs / check results */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!item.scanResult ? (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
              {item.status === 'error' ? (
                <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>
                  Error: {item.error}
                </p>
              ) : (
                <>
                  <Loader2 size={28} className="animate-spin" />
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {item.statusLabel || 'Scanning…'} {item.progress > 0 && `${item.progress}%`}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <ReportHeader
                file={item.scanResult.file}
                video={item.scanResult.video}
                result={item.validationResult || 'COMPLIANT'}
              />
              <CheckResults
                checks={item.checks}
                noPreset={!selectedPreset}
                scanResult={item.scanResult}
                presetName={preset?.name}
              />
              {item.thumbnails.length > 0 && (
                <ThumbnailGrid thumbnails={item.thumbnails} />
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
};
