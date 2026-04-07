import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Loader2, Download, FileText } from 'lucide-react';
import type { BatchItem, ValidationPreset, ValidationReport } from '../../shared/types';
import type { VideoPlayerHandle } from '../VideoPlayer';
import { ReportHeader } from '../ReportHeader';
import { VideoPlayer } from '../VideoPlayer';
import { Waveform } from '../Waveform';
import { CheckResults } from '../CheckResults';
import { ThumbnailGrid } from '../ThumbnailGrid';
import { TranscriptionPanel } from '../TranscriptionPanel';
import { ContrastChecker } from '../ContrastChecker';
import { Tooltip } from '../Tooltip';
import { generatePDF, generateJSON } from '../../utils/pdfGenerator';

interface BatchDetailPanelProps {
  item: BatchItem;
  selectedPreset: string;
  allPresets: ValidationPreset[];
  onClose: () => void;
  onUpdateItem: (id: string, patch: Partial<BatchItem>) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const BatchDetailPanel: React.FC<BatchDetailPanelProps> = ({
  item,
  selectedPreset,
  allPresets,
  onClose,
  onUpdateItem,
  onToast,
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

  const buildReport = useCallback((): ValidationReport => ({
    timestamp: new Date().toISOString(),
    presetUsed: selectedPreset,
    result: item.validationResult || 'COMPLIANT',
    file: item.scanResult!.file,
    detected: item.scanResult!,
    checks: item.checks,
    contrastChecks: item.contrastChecks,
    thumbnails: item.thumbnails,
    audioWaveform: item.waveformData,
    outputFolder: '',
    transcription: item.transcription ?? undefined,
  }), [item, selectedPreset]);

  const handleExportPDF = useCallback(async () => {
    if (!item.scanResult) return;
    try {
      const name = item.scanResult.file.name.replace(/\.[^.]+$/, '');
      await generatePDF(buildReport(), `Kissd_VVT_Report_${name}.pdf`);
      onToast?.('PDF report exported', 'success');
    } catch (err) {
      onToast?.(`PDF export failed: ${err instanceof Error ? err.message : 'unknown'}`, 'error');
    }
  }, [item.scanResult, buildReport, onToast]);

  const handleExportJSON = useCallback(async () => {
    if (!item.scanResult) return;
    try {
      const name = item.scanResult.file.name.replace(/\.[^.]+$/, '');
      await generateJSON(buildReport(), `Kissd_VVT_Report_${name}.json`);
      onToast?.('JSON report exported', 'success');
    } catch (err) {
      onToast?.(`JSON export failed: ${err instanceof Error ? err.message : 'unknown'}`, 'error');
    }
  }, [item.scanResult, buildReport, onToast]);

  const handleSaveThumbnails = useCallback(() => {
    item.thumbnails.forEach((thumb, index) => {
      const a = document.createElement('a');
      a.href = thumb;
      a.download = `thumbnail_${index + 1}.jpg`;
      a.click();
    });
    onToast?.(`${item.thumbnails.length} thumbnails saved`, 'success');
  }, [item.thumbnails, onToast]);

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

          {/* Export buttons */}
          {item.scanResult && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              <Tooltip content="Download a full validation report as PDF" position="bottom">
                <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
                  <Download size={14} />
                  Export PDF
                </button>
              </Tooltip>
              <Tooltip content="Download raw scan data and checks as JSON" position="bottom">
                <button className="btn btn-secondary btn-sm" onClick={handleExportJSON}>
                  <FileText size={14} />
                  Export JSON
                </button>
              </Tooltip>
              {item.thumbnails.length > 0 && (
                <Tooltip content="Save extracted thumbnails as image files" position="bottom">
                  <button className="btn btn-secondary btn-sm" onClick={handleSaveThumbnails}>
                    <Download size={14} />
                    Save Thumbnails
                  </button>
                </Tooltip>
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
