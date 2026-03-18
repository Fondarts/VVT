import React, { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { BatchItem, ValidationPreset } from '../../shared/types';
import type { VideoPlayerHandle } from '../VideoPlayer';
import { ReportHeader } from '../ReportHeader';
import { VideoPlayer } from '../VideoPlayer';
import { Waveform } from '../Waveform';
import { CheckResults } from '../CheckResults';
import { ThumbnailGrid } from '../ThumbnailGrid';
import { TranscriptionPanel } from '../TranscriptionPanel';
import { ContrastChecker } from '../ContrastChecker';

interface BatchDetailPanelProps {
  item: BatchItem;
  selectedPreset: string;
  allPresets: ValidationPreset[];
  onClose: () => void;
  onUpdateItem: (id: string, patch: Partial<BatchItem>) => void;
}

export const BatchDetailPanel: React.FC<BatchDetailPanelProps> = ({
  item,
  selectedPreset,
  allPresets,
  onClose,
  onUpdateItem,
}) => {
  const preset = allPresets.find(p => p.id === selectedPreset);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);

  // Reset video state when switching items
  useEffect(() => {
    setVideoEl(null);
    setVideoCurrentTime(0);
  }, [item.id]);

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

        {/* Center column: VideoPlayer (pinned) + scrollable tools below */}
        <div style={{ width: 600, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {item.videoSrc && (
            <div style={{ flexShrink: 0 }}>
              <VideoPlayer
                ref={playerRef}
                compact
                videoSrc={item.videoSrc}
                videoCodec={item.scanResult?.video?.codec ?? ''}
                videoWidth={item.scanResult?.video?.width ?? 0}
                videoHeight={item.scanResult?.video?.height ?? 0}
                frameRate={item.scanResult?.video?.frameRate ?? 0}
                subtitles={item.transcription?.segments}
                onVideoReady={setVideoEl}
                onTimeUpdate={setVideoCurrentTime}
              />
            </div>
          )}

          {/* Scrollable tools below the player */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {item.scanResult && item.waveformData.length > 0 && (
              <Waveform
                audioData={item.waveformData}
                duration={item.scanResult.file.duration}
                currentTime={videoCurrentTime}
                videoEl={videoEl}
                truePeakMax={preset?.truePeakMax}
              />
            )}
            <TranscriptionPanel
              result={item.transcription}
              onTranscriptionDone={(result) => onUpdateItem(item.id, { transcription: result })}
              onSeek={(ms) => playerRef.current?.seekTo(ms)}
              videoFile={item.file}
            />
          </div>
        </div>

        {/* Right column: specs / check results */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
          {/* ReportHeader — pinned, never scrolls away */}
          {item.scanResult ? (
            <div style={{ flexShrink: 0 }}>
              <ReportHeader
                file={item.scanResult.file}
                video={item.scanResult.video!}
                result={item.validationResult || 'COMPLIANT'}
              />
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, flexShrink: 0 }}>
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
          )}

          {/* Scrollable detail */}
          {item.scanResult && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CheckResults
                checks={item.checks}
                noPreset={!selectedPreset}
                scanResult={item.scanResult}
                presetName={preset?.name}
              />
              {item.thumbnails.length > 0 && (
                <ThumbnailGrid thumbnails={item.thumbnails} />
              )}
              <ContrastChecker
                videoEl={videoEl}
                currentTime={videoCurrentTime}
                onContrastCheck={(checks) => onUpdateItem(item.id, { contrastChecks: checks })}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
