import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileVideo,
  Image as ImageIcon,
  AlertCircle,
  FileText,
  ScanLine,
  Loader2,
  Download,
  Plus,
  X,
  Pencil,
  Trash2,
  RotateCcw,
  LogOut,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import type {
  ValidationCheck,
  ValidationReport,
  ContrastCheck,
} from './shared/types';
import { validationPresets } from './shared/presets';
import { generatePDF, generateJSON, preloadPdf } from './utils/pdfGenerator';
import { validateAgainstPreset } from './utils/validation';
import {
  captureFrameFromVideo,
} from './api/ffmpeg';
import { preloadWhisperWorker } from './api/whisper';
import { useBatch } from './hooks/useBatch';
import { BatchView } from './components/batch/BatchView';
import { BrandBackground } from './components/BrandBackground';
import { VideoPlayer } from './components/VideoPlayer';
import type { VideoPlayerHandle } from './components/VideoPlayer';
import { ImageViewer } from './components/ImageViewer';
import { CheckResults } from './components/CheckResults';
import { ContrastChecker } from './components/ContrastChecker';
import { ThumbnailGrid } from './components/ThumbnailGrid';
import { Waveform } from './components/Waveform';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { FeedbackPanel } from './components/FeedbackPanel';
import { ExportModal } from './components/ExportModal';
import type { TranscriptionResult, SubtitleStyle } from './shared/types';
import { DEFAULT_SUBTITLE_STYLE } from './components/SubtitleSettingsModal';
import { SlateCreatorCollapsible } from './components/SlateCreatorCollapsible';
import { RuleRow } from './components/RuleRow';
import { RULE_DEFS } from './shared/presetRules';
import { useCustomPresets } from './hooks/useCustomPresets';
import { useScan } from './hooks/useScan';
import { useTimeline } from './hooks/useTimeline';
import { useFeedback } from './hooks/useFeedback';
import { ToastProvider, useToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProjectDashboard } from './components/projects/ProjectDashboard';
import { HelperStatus } from './components/HelperStatus';
import { VersionBar } from './components/projects/VersionBar';
import { ShareViewer } from './components/projects/ShareViewer';
import { VersionCompare } from './components/projects/VersionCompare';
import { ProjectSidebar } from './components/projects/ProjectSidebar';
import { useProjects } from './hooks/useProjects';
import { downloadDriveFile } from './utils/driveApi';
import { getCachedFile } from './utils/fileCache';
import { fetchFiles, fetchFileById } from './utils/projectStorage';
import { groupByVersion } from './utils/versionDetection';
import type { ProjectFile } from './shared/types';

interface VersionContext {
  currentFile: ProjectFile;
  versions: ProjectFile[];
  getLocalFile: (pf: ProjectFile) => File | null;
}

export type ViewMode = 'full' | 'internal' | 'presentation';

const App: React.FC = () => {
  const { addToast } = useToast();
  const { user, loading: authLoading, error: authError, signIn, signOut, driveToken, requestDriveAccess, requestDriveWriteAccess } = useAuth();
  const { projects: sidebarProjects } = useProjects(user?.uid);
  // Detect ?share=TOKEN (anonymous share link — bypasses auth)
  const [shareToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('share');
  });

  // Detect share link params ONCE at init
  const [shareParams] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fileId = params.get('file');
    const view = params.get('view');
    if (fileId) return { fileId, view: (view === 'internal' || view === 'presentation') ? view : 'internal' as const };
    return null;
  });
  const isShareLink = !!shareParams;
  const [shareLoading, setShareLoading] = useState(isShareLink);
  const [mode, setMode] = useState<'single' | 'batch' | 'projects'>(isShareLink ? 'single' : 'projects');
  const [viewMode] = useState<ViewMode>(() => {
    if (shareParams) return shareParams.view as ViewMode;
    return 'full';
  });
  const isPresentation = viewMode === 'presentation';
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [versionContext, setVersionContext] = useState<VersionContext | null>(null);
  const [compareState, setCompareState] = useState<{ fileA: { projectFile: ProjectFile; src: string }; fileB: { projectFile: ProjectFile; src: string } } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const presets = useCustomPresets();
  const {
    customPresets, allPresets, selectedPreset,
    showCustomModal, setShowCustomModal, customForm, setCustomForm,
    editingPresetId, setEditingPresetId, overwriteTarget, setOverwriteTarget,
    handlePresetChange, saveCustomPreset, doSave, deleteCustomPreset,
    openEditPreset, updateRule, presetToRules,
  } = presets;

  // Preload heavy deps in the background after the app is idle
  useEffect(() => {
    const run = () => {
      preloadPdf();
      preloadWhisperWorker();
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 5000 });
    } else {
      setTimeout(run, 3000);
    }
  }, []);

  const batch = useBatch(selectedPreset, allPresets);

  const selectedFileRef = useRef<File | null>(null);
  const onVideoSrcReplace = useCallback((url: string) => {
    setVideoSrc(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);
  const scan = useScan(selectedFileRef, onVideoSrcReplace);
  const {
    scanning, scanProgress, scanStatus, scanResult,
    error, thumbnails, waveformData,
    isTranscoding, transcodeProgress, transcodeError, transcodedVideoSrc,
    handleScan, handleImageScan, resetScanState,
  } = scan;

  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [validationResult, setValidationResult] = useState<'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS' | null>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [contrastChecks, setContrastChecks] = useState<ContrastCheck[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionResult | undefined>(undefined);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [activeRightTab, setActiveRightTab] = useState<'specs' | 'feedback' | 'tools'>('feedback');
  const [slateForceOpen, setSlateForceOpen] = useState(0);
  const snapshotCounterRef = useRef(0);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  // ── Edit timeline ──
  const timeline = useTimeline({
    videoEl, videoCurrentTime, scanResult, selectedFile,
    transcription, subtitleStyle, videoPlayerRef,
  });
  const {
    timelineBlocks, setTimelineBlocks, tlExporting, tlExportPct,
    showExportModal, setShowExportModal, tlPreview, tlGlobalTime, tlIsPlaying,
    tlRanges, handleAddSlateBlock, handleTimelineExport,
    handleTlPlayPause, handleTlSeek, handleTlAddBlack, handleTlAddImage, handleTlAddBip,
  } = timeline;
  const feedback = useFeedback(selectedFile, videoPlayerRef, setActiveRightTab);
  const {
    feedbackCount, setFeedbackCount, feedbackMarkers, setFeedbackMarkers,
    feedbackMarkerRanges, setFeedbackMarkerRanges,
    stagedMarker, setStagedMarker, annotationOverlay, setAnnotationOverlay,
    handlePlaceMarker, handleImagePlaceMarker, handleMarkerMove,
    handleMarkerRangeMove, handleMarkerSetRange, resetFeedback,
  } = feedback;

  // Refs so the unmount cleanup always sees the latest blob URLs (avoids stale closure)
  const videoSrcRef = useRef<string | null>(null);
  const thumbnailsRef = useRef<string[]>([]);
  const transcodedVideoSrcRef = useRef<string | null>(null);
  useEffect(() => { videoSrcRef.current = videoSrc; }, [videoSrc]);
  useEffect(() => { thumbnailsRef.current = thumbnails; }, [thumbnails]);
  useEffect(() => { transcodedVideoSrcRef.current = transcodedVideoSrc; }, [transcodedVideoSrc]);

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      if (videoSrcRef.current) URL.revokeObjectURL(videoSrcRef.current);
      thumbnailsRef.current.forEach(t => { if (t.startsWith('blob:')) URL.revokeObjectURL(t); });
      if (transcodedVideoSrcRef.current) URL.revokeObjectURL(transcodedVideoSrcRef.current);
    };
  }, []);

  // Auto-open file from share URL params
  const shareHandled = useRef(false);
  useEffect(() => {
    if (shareHandled.current || !shareParams || !driveToken) return;
    shareHandled.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    fetchFileById(shareParams.fileId).then(pf => {
      if (pf) {
        openDriveFile(pf, driveToken);
      } else {
        addToast('Shared file not found.', 'warning');
        setMode('projects');
      }
      setShareLoading(false);
    }).catch(() => {
      setShareLoading(false);
      setMode('projects');
    });
  }, [driveToken, shareParams]);

  const handleFileSelected = (file: File) => {
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    thumbnails.forEach(t => { if (t.startsWith('blob:')) URL.revokeObjectURL(t); });
    if (transcodedVideoSrc) URL.revokeObjectURL(transcodedVideoSrc);

    const fileIsImage = file.type.startsWith('image/');
    setIsImage(fileIsImage);
    setSelectedFile(file);
    selectedFileRef.current = file;
    setVideoSrc(URL.createObjectURL(file));
    resetScanState();
    setChecks([]);
    setContrastChecks([]);
    setTranscription(undefined);
    setVideoEl(null);
    setActiveRightTab('feedback');
    resetFeedback();
    snapshotCounterRef.current = 0;

    if (fileIsImage) {
      handleImageScan(file);
    } else {
      handleScan(file);
    }
  };

  /** Open a Drive file: try local cache first, then download from Drive.
      Always goes through handleFileSelected so audio, scan, and all components work. */
  const openDriveFile = async (pf: ProjectFile, token: string, ctx?: VersionContext | null) => {
    if (!pf.driveFileId) return;
    setMode('single');

    // Build version context if not provided
    if (!ctx) {
      try {
        const siblings = await fetchFiles(pf.projectId, pf.parentPath);
        const groups = groupByVersion(siblings);
        const group = groups.find(g => g.versions.some(v => v.id === pf.id));
        if (group && group.versions.length > 0) {
          ctx = {
            currentFile: pf,
            versions: group.versions,
            getLocalFile: () => null,
          };
        }
      } catch { /* proceed without context */ }
    }
    setVersionContext(ctx ?? null);

    // 1. Try OPFS cache (file was previously dropped from Drive Desktop)
    const cached = await getCachedFile(pf.name, pf.sizeBytes);
    if (cached) {
      handleFileSelected(cached);
      return;
    }

    // 2. Download from Drive API → full local File → handleFileSelected
    try {
      addToast('Downloading from Drive...', 'info');
      const file = await downloadDriveFile(token, pf.driveFileId, pf.name);
      handleFileSelected(file);
    } catch (err) {
      console.warn('Drive download failed:', err);
      addToast('Download failed. Try opening from the dashboard.', 'warning');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('image/'))) {
      handleFileSelected(file);
    }
  }, [videoSrc, thumbnails]);

  // Re-run validation whenever scanResult or selectedPreset changes
  useEffect(() => {
    if (!scanResult) return;

    if (!selectedPreset) {
      setChecks([]);
      setValidationResult(null);
      return;
    }

    const preset = allPresets.find(p => p.id === selectedPreset);
    if (!preset) return;

    const { checks: validationChecks, result } = validateAgainstPreset(scanResult, preset, contrastChecks);
    setChecks(validationChecks);
    setValidationResult(result);
  }, [scanResult, selectedPreset, customPresets, contrastChecks]);


  const buildReport = (): ValidationReport => ({
    timestamp: new Date().toISOString(),
    presetUsed: selectedPreset,
    result: validationResult || 'COMPLIANT',
    file: scanResult!.file,
    detected: scanResult!,
    checks,
    contrastChecks,
    thumbnails,
    audioWaveform: waveformData,
    outputFolder: '',
    transcription,
  });

  const handleExportPDF = async () => {
    if (!scanResult) return;
    try {
      const name = scanResult.file.name.replace(/\.[^.]+$/, '');
      await generatePDF(buildReport(), `Kissd_VVT_Report_${name}.pdf`);
      addToast('PDF report exported', 'success');
    } catch (err) {
      addToast(`PDF export failed: ${err instanceof Error ? err.message : 'unknown'}`, 'error');
    }
  };

  const handleExportJSON = async () => {
    if (!scanResult) return;
    try {
      const name = scanResult.file.name.replace(/\.[^.]+$/, '');
      await generateJSON(buildReport(), `Kissd_VVT_Report_${name}.json`);
      addToast('JSON report exported', 'success');
    } catch (err) {
      addToast(`JSON export failed: ${err instanceof Error ? err.message : 'unknown'}`, 'error');
    }
  };

  const handleSaveThumbnails = () => {
    thumbnails.forEach((thumb, index) => {
      const a = document.createElement('a');
      a.href = thumb;
      a.download = `thumbnail_${index + 1}.jpg`;
      a.click();
    });
    addToast(`${thumbnails.length} thumbnails saved`, 'success');
  };

  const handleContrastCheck = (newChecks: ContrastCheck[]) => {
    setContrastChecks(newChecks);
  };



  const handleSnapshot = useCallback(async (_time: number) => {
    const el = videoEl ?? videoPlayerRef.current?.getVideoElement();
    if (!el) return;
    const dataUrl = captureFrameFromVideo(el);
    if (!dataUrl) return;
    const baseName = selectedFile?.name.replace(/\.[^.]+$/, '') || 'video';
    snapshotCounterRef.current += 1;
    const counter = String(snapshotCounterRef.current).padStart(2, '0');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${baseName}_Snapshot${counter}.jpg`;
    a.click();
  }, [videoEl, selectedFile]);


  // Anonymous share link flow — render standalone viewer, bypass all auth
  if (shareToken) {
    return <ShareViewer token={shareToken} />;
  }

  return (
    <div className="app">
      <BrandBackground />
      {showExportModal && (
        <ExportModal
          onExport={handleTimelineExport}
          onClose={() => setShowExportModal(false)}
          inputCodec={scanResult?.video?.codec}
        />
      )}
      <header className="app-header" style={isPresentation ? { display: 'none' } : undefined}>
        <div className="logo">
          <img src="/icons/kissd-logo.svg" alt="KISSD" style={{ height: '22px', width: 'auto', display: 'block' }} />
          <span style={{ color: 'var(--color-text-primary)' }}>Review V03</span>
          <HelperStatus />
        </div>
        <div className="header-actions">
          {/* Mode toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }} role="group" aria-label="Mode selection">
            <button
              className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, borderRight: '1px solid var(--border-color)' }}
              onClick={() => setMode('single')}
              aria-pressed={mode === 'single'}
            >
              Single
            </button>
            <button
              className={`btn btn-sm ${mode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, borderRight: '1px solid var(--border-color)' }}
              onClick={() => setMode('batch')}
              aria-pressed={mode === 'batch'}
            >
              Batch
            </button>
            <button
              className={`btn btn-sm ${mode === 'projects' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0 }}
              onClick={() => setMode('projects')}
              aria-pressed={mode === 'projects'}
            >
              Projects
            </button>
          </div>

          {/* Hidden file input (single mode only) */}
          {mode === 'single' && (
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*,.mp4,.mov,.mkv,.webm,.avi,.mxf,.m2ts,.ts,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.avif"
            aria-label="Select a video or image file"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          )}

          {/* Single mode: file picker + scan button */}
          {mode === 'single' && (
            <>
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                {isImage ? <ImageIcon size={16} /> : <FileVideo size={16} />}
                {selectedFile ? selectedFile.name.slice(0, 30) + (selectedFile.name.length > 30 ? '…' : '') : 'Select File'}
              </button>
              {!isImage && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleScan()}
                  disabled={!selectedFile || scanning}
                >
                  {scanning ? (
                    <><Loader2 size={16} className="animate-spin" /> Scanning...</>
                  ) : (
                    <><ScanLine size={16} /> Scan File</>
                  )}
                </button>
              )}
              {isImage && scanning && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={14} className="animate-spin" /> Reading image…
                </span>
              )}
            </>
          )}

          {/* Auth button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {authLoading ? null : user ? (
              <>
                {user.photoURL && (
                  <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.displayName || user.email}
                </span>
                {!driveToken && (
                  <button className="btn btn-primary btn-sm" onClick={requestDriveAccess} title="Connect Google Drive for file streaming" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
                    Drive
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={signOut} title="Sign out" style={{ padding: '4px 6px' }}>
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={signIn} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Project sidebar — available everywhere when logged in */}
      {user && mode !== 'projects' && !isPresentation && (
        <ProjectSidebar
          projects={sidebarProjects}
          onFileClick={(pf) => {
            if (driveToken && pf.driveFileId) {
              openDriveFile(pf, driveToken);
            } else {
              addToast('File not available — connect Google Drive.', 'warning');
            }
          }}
        />
      )}

      <main className="app-main">
        {/* Loading share link */}
        {shareLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--color-text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid var(--border-color)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.875rem' }}>Loading shared file...</p>
            </div>
          </div>
        )}

        {/* Projects mode */}
        {!shareLoading && mode === 'projects' && user && (
          <ProjectDashboard
            userId={user.uid}
            userName={user.displayName ?? undefined}
            userEmail={user.email ?? undefined}
            driveToken={driveToken}
            onFileOpen={(source: File | string, ctx?: { currentFile: ProjectFile; versions: ProjectFile[]; getLocalFile: (pf: ProjectFile) => File | null }) => {
              if (typeof source === 'string' && ctx?.currentFile && driveToken && ctx.currentFile.driveFileId) {
                openDriveFile(ctx.currentFile, driveToken, ctx);
                return;
              } else if (typeof source === 'string') {
                setVideoSrc(source);
                setSelectedFile(null);
                setIsImage(false);
              } else {
                handleFileSelected(source);
              }
              setVersionContext(ctx ?? null);
              setMode('single');
            }}
          />
        )}
        {mode === 'projects' && !user && !authLoading && (
          <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--color-text-muted)' }}>
            <p style={{ marginBottom: '16px', fontSize: '0.875rem' }}>Sign in to access projects</p>
            <button className="btn btn-primary" onClick={signIn}>Sign in with Google</button>
          </div>
        )}

        {/* Batch mode */}
        {mode === 'batch' && (
          <BatchView
            batch={batch}
            selectedPreset={selectedPreset}
            allPresets={allPresets}
          />
        )}

        {/* Single mode */}
        {mode === 'single' && error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {mode === 'single' && !selectedFile && !videoSrc && (
          <div
            className={`dropzone${isDragOver ? ' drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <FileVideo size={48} />
              <ImageIcon size={48} />
            </div>
            <h3>Select a video or image file</h3>
            <p>Click here or drag and drop</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Video: MP4, MOV, MKV, WEBM, AVI, MXF · Image: JPG, PNG, WebP, GIF — processed locally, never uploaded
            </p>
          </div>
        )}


        {mode === 'single' && videoSrc && (
          <>
          <div className="results-container">
            {/* Left column */}
            <div className="results-column" style={{
              position: 'sticky', top: 0,
              height: 'calc(100vh - 130px)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Version bar when opened from project */}
              {!isPresentation && versionContext && versionContext.versions.length > 0 && (
                <VersionBar
                  currentFile={versionContext.currentFile}
                  versions={versionContext.versions}
                  onBack={() => { setMode('projects'); setVersionContext(null); }}
                  onSwitchVersion={(pf) => {
                    const localFile = versionContext.getLocalFile(pf);
                    if (localFile) {
                      handleFileSelected(localFile);
                      setVersionContext({ ...versionContext, currentFile: pf });
                    } else {
                      const input = document.createElement('input');
                      input.type = 'file'; input.accept = 'video/*,image/*,audio/*';
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (f) { handleFileSelected(f); setVersionContext({ ...versionContext, currentFile: pf }); }
                      };
                      input.click();
                    }
                  }}
                  onCompare={async (a, b) => {
                    const getSrc = async (pf: ProjectFile): Promise<string | null> => {
                      const local = versionContext.getLocalFile(pf);
                      if (local) return URL.createObjectURL(local);
                      const cached = await getCachedFile(pf.name, pf.sizeBytes);
                      if (cached) return URL.createObjectURL(cached);
                      if (driveToken && pf.driveFileId) {
                        try {
                          const file = await downloadDriveFile(driveToken, pf.driveFileId, pf.name);
                          return URL.createObjectURL(file);
                        } catch { return null; }
                      }
                      return null;
                    };
                    const [srcA, srcB] = await Promise.all([getSrc(a), getSrc(b)]);
                    if (srcA && srcB) {
                      setCompareState({
                        fileA: { projectFile: a, src: srcA },
                        fileB: { projectFile: b, src: srcB },
                      });
                    } else {
                      addToast(driveToken ? 'Files not available.' : 'Connect Drive to compare files.', 'warning');
                    }
                  }}
                  onShareLink={(_url, mode) => addToast(`${mode} link copied to clipboard`, 'success')}
                  userId={user?.uid}
                  userName={user?.displayName ?? undefined}
                  driveToken={driveToken ?? undefined}
                  onRequestDriveWriteAccess={requestDriveWriteAccess}
                />
              )}
              {isImage ? (
                <ErrorBoundary fallbackLabel="Image viewer crashed">
                <ImageViewer
                  src={videoSrc}
                  width={scanResult?.image?.width ?? 0}
                  height={scanResult?.image?.height ?? 0}
                  annotationOverlay={annotationOverlay}
                  onAnnotationDismiss={() => setAnnotationOverlay(null)}
                  onPlaceMarker={handleImagePlaceMarker}
                />
                </ErrorBoundary>
              ) : (
                <div style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}>
                <ErrorBoundary fallbackLabel="Video player crashed">
                <VideoPlayer
                  ref={videoPlayerRef}
                  videoSrc={videoSrc}
                  videoCodec={scanResult?.video?.codec ?? ''}
                  isTranscoding={isTranscoding}
                  transcodeProgress={transcodeProgress}
                  transcodeError={transcodeError}
                  videoWidth={scanResult?.video?.width ?? 0}
                  videoHeight={scanResult?.video?.height ?? 0}
                  frameRate={scanResult?.video?.frameRate ?? 0}
                  subtitles={transcription?.segments}
                  subtitleStyle={subtitleStyle}
                  markers={feedbackMarkers}
                  markerRanges={feedbackMarkerRanges}
                  onMarkerMove={handleMarkerMove}
                  onMarkerRangeMove={handleMarkerRangeMove}
                  onPlaceMarker={handlePlaceMarker}
                  onMarkerSetRange={handleMarkerSetRange}
                  annotationOverlay={annotationOverlay}
                  onAnnotationDismiss={() => setAnnotationOverlay(null)}
                  onSnapshot={handleSnapshot}
                  onTimeUpdate={setVideoCurrentTime}
                  onVideoReady={setVideoEl}
                  timelineOverlay={tlPreview && tlPreview.blockType !== 'video' ? { type: tlPreview.blockType, thumbnail: tlPreview.thumbnail } : null}
                  onAddBlack={isPresentation ? undefined : handleTlAddBlack}
                  onAddImage={isPresentation ? undefined : handleTlAddImage}
                  onAddBip={isPresentation ? undefined : handleTlAddBip}
                  onAddSlate={isPresentation ? undefined : () => { setActiveRightTab('tools'); setSlateForceOpen(n => n + 1); }}
                  onExportTimeline={isPresentation ? undefined : () => setShowExportModal(true)}
                  exportingTimeline={tlExporting}
                  exportTimelinePct={tlExportPct}
                  timeline={tlRanges ? {
                    blocks: timelineBlocks,
                    globalTime: tlGlobalTime,
                    totalDuration: tlRanges.totalDuration,
                    isPlaying: tlIsPlaying,
                    onPlayPause: handleTlPlayPause,
                    onSeek: handleTlSeek,
                    onReorder: (from: number, to: number) => {
                      setTimelineBlocks(prev => {
                        const next = [...prev];
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        return next;
                      });
                    },
                    onUpdateDuration: (id: string, dur: number) => {
                      setTimelineBlocks(prev => prev.map(b => b.id === id ? { ...b, duration: Math.max(0.5, dur) } : b));
                    },
                    onRemoveBlock: (id: string) => {
                      setTimelineBlocks(prev => prev.filter(b => b.id !== id));
                    },
                  } : undefined}
                />
                </ErrorBoundary>
                </div>
              )}


              {!isImage && scanResult && waveformData.length > 0 && (
                <div style={{ flex: '0 0 auto', marginTop: '8px' }}>
                <Waveform
                  audioData={waveformData}
                  duration={scanResult.file.duration}
                  currentTime={videoCurrentTime}
                  videoEl={videoEl}
                  truePeakMax={allPresets.find(p => p.id === selectedPreset)?.truePeakMax}
                />
                </div>
              )}
            </div>

            {/* Right column — always visible once a video is loaded */}
            <div className="results-column" style={{ height: 'calc(100vh - 130px)', overflowY: 'auto', position: 'sticky', top: 0 }}>
              {/* Tab nav */}
              <div className="tab-nav" role="tablist" aria-label="Content panels" style={{ flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
                <button
                  role="tab"
                  aria-selected={activeRightTab === 'feedback'}
                  aria-controls="panel-feedback"
                  id="tab-feedback"
                  className={`tab-btn ${activeRightTab === 'feedback' ? 'active' : ''}`}
                  onClick={() => setActiveRightTab('feedback')}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  Feedback
                  {feedbackCount > 0 && (
                    <span aria-label={`${feedbackCount} comments`} style={{
                      background: 'var(--color-accent)',
                      color: '#000',
                      borderRadius: '10px',
                      padding: '0 5px',
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      lineHeight: '16px',
                    }}>
                      {feedbackCount}
                    </span>
                  )}
                </button>
                {!isPresentation && (
                  <button
                    role="tab"
                    aria-selected={activeRightTab === 'specs'}
                    aria-controls="panel-specs"
                    id="tab-specs"
                    className={`tab-btn ${activeRightTab === 'specs' ? 'active' : ''}`}
                    onClick={() => setActiveRightTab('specs')}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    Specs
                    {scanning && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
                  </button>
                )}
                {!isPresentation && (
                  <button
                    role="tab"
                    aria-selected={activeRightTab === 'tools'}
                    aria-controls="panel-tools"
                    id="tab-tools"
                    className={`tab-btn ${activeRightTab === 'tools' ? 'active' : ''}`}
                    onClick={() => setActiveRightTab('tools')}
                  >
                    Tools
                  </button>
                )}
              </div>

              {/* ── Specs tab ───────────────────────────────────────── */}
              {activeRightTab === 'specs' && (
                <div id="panel-specs" role="tabpanel" aria-labelledby="tab-specs">
                  {/* Slim progress bar while scanning */}
                  {scanning && (
                    <div aria-live="polite" aria-atomic="true" style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                          {scanStatus}
                        </span>
                        <span>{scanProgress}%</span>
                      </div>
                      <div style={{ width: '100%', height: '2px', background: 'var(--color-bg-tertiary)', borderRadius: '1px' }}>
                        <div role="progressbar" aria-valuenow={scanProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Scan progress" style={{ width: `${scanProgress}%`, height: '100%', background: 'var(--color-accent)', borderRadius: '1px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}
                  {/* Scanning skeleton */}
                  {scanning && !scanResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(['Container', 'Video', 'Audio'] as const).map(section => (
                        <div key={section} className="card" style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', opacity: 0.6 }}>
                            <Loader2 size={12} className="animate-spin" />
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              {section}
                            </span>
                          </div>
                          {[70, 50, 85].map((w, i) => (
                            <div key={i} style={{
                              height: '12px',
                              borderRadius: '4px',
                              background: 'var(--color-bg-tertiary)',
                              marginBottom: '7px',
                              width: `${w}%`,
                              opacity: 0.5,
                            }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No file scanned yet */}
                  {!scanning && !scanResult && (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 16px',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.8125rem',
                    }}>
                      <ScanLine size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.25 }} />
                      Click "Scan File" to analyze this video
                    </div>
                  )}

                  {/* Results */}
                  {scanResult && (
                    <>
                      <CheckResults
                        checks={checks}
                        noPreset={!selectedPreset}
                        scanResult={scanResult}
                        presetName={allPresets.find(p => p.id === selectedPreset)?.name}
                        headerExtra={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                              className="select"
                              value={selectedPreset}
                              onChange={e => handlePresetChange(e.target.value)}
                              style={{ fontSize: '0.75rem', padding: '3px 6px' }}
                            >
                              <option value="">— Select specs —</option>
                              <optgroup label="Built-in Presets">
                                {validationPresets.map(preset => (
                                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                                ))}
                              </optgroup>
                              {customPresets.length > 0 && (
                                <optgroup label="Custom Presets">
                                  {customPresets.map(preset => (
                                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                                  ))}
                                </optgroup>
                              )}
                              <option value="__add_custom__">+ Add custom preset...</option>
                            </select>
                            {selectedPreset && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditPreset(selectedPreset)} title="Edit preset" style={{ padding: '3px 6px' }}>
                                <Pencil size={12} />
                              </button>
                            )}
                            {selectedPreset && customPresets.some(p => p.id === selectedPreset) && (
                              <button className="btn btn-secondary btn-sm" onClick={() => deleteCustomPreset(selectedPreset)} title="Delete preset" style={{ padding: '3px 6px', color: 'var(--color-error)' }}>
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        }
                      />

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={handleExportPDF}>
                          <Download size={16} />
                          Export PDF
                        </button>
                        <button className="btn btn-secondary" onClick={handleExportJSON}>
                          <FileText size={16} />
                          Export JSON
                        </button>
                        {thumbnails.length > 0 && (
                          <button className="btn btn-secondary" onClick={handleSaveThumbnails}>
                            <Download size={16} />
                            Save Thumbnails
                          </button>
                        )}
                      </div>

                      {/* Custom & overridden preset management */}
                      {customPresets.length > 0 && (
                        <div className="card" style={{ padding: '12px' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                            Your presets
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {customPresets.map(p => {
                              const isBuiltinOverride = validationPresets.some(b => b.id === p.id);
                              return (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                  <span style={{ fontSize: '0.75rem' }}>
                                    {p.name}
                                    {isBuiltinOverride && (
                                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', opacity: 0.6, fontStyle: 'italic' }}>modified</span>
                                    )}
                                  </span>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      className="btn btn-icon btn-sm"
                                      onClick={() => openEditPreset(p.id)}
                                      title="Edit preset"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      className="btn btn-icon btn-sm"
                                      onClick={() => deleteCustomPreset(p.id)}
                                      title={isBuiltinOverride ? 'Reset to default' : 'Delete preset'}
                                      style={{ color: isBuiltinOverride ? 'var(--color-text-muted)' : 'var(--color-error)' }}
                                    >
                                      {isBuiltinOverride ? <RotateCcw size={12} /> : <X size={12} />}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Feedback tab ─────────────────────────────────────── */}
              {activeRightTab === 'feedback' && selectedFile && (
                <div id="panel-feedback" role="tabpanel" aria-labelledby="tab-feedback">
                {user ? (
                  <ErrorBoundary fallbackLabel="Feedback panel crashed">
                  <FeedbackPanel
                    fileName={selectedFile.name}
                    fileSize={selectedFile.size}
                    fileKeyOverride={versionContext?.currentFile.id}
                    currentTime={videoCurrentTime}
                    frameRate={scanResult?.video?.frameRate ?? 0}
                    videoEl={videoEl}
                    authorName={user.displayName || user.email || 'Anonymous'}
                    authorPhoto={user.photoURL || undefined}
                    onSeek={s => videoPlayerRef.current?.seekTo(s * 1000)}
                    onCommentsChange={setFeedbackCount}
                    onMarkersChange={setFeedbackMarkers}
                    onMarkerRangesChange={setFeedbackMarkerRanges}
                    onAnnotationChange={setAnnotationOverlay}
                    onStartDraw={(color, tool) => videoPlayerRef.current?.startDraw(color, tool)}
                    onCaptureDrawStrokes={() => videoPlayerRef.current?.captureDrawStrokes() ?? []}
                    onSetLineWidth={w => videoPlayerRef.current?.setLineWidth(w)}
                    onUndoLastStroke={() => videoPlayerRef.current?.undoLastStroke()}
                    onInitializeDrawStrokes={s => videoPlayerRef.current?.initializeDrawStrokes(s)}
                    stagedTimecode={stagedMarker ?? undefined}
                    onStagedTimecodeConsumed={() => setStagedMarker(null)}
                  />
                  </ErrorBoundary>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-text-muted)' }}>
                    <MessageCircle size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.25 }} />
                    <p style={{ marginBottom: '16px', fontSize: '0.875rem' }}>Sign in to leave feedback</p>
                    <button className="btn btn-primary" onClick={signIn} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                      Sign in with Google
                    </button>
                    {authError && (
                      <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '8px' }}>{authError}</p>
                    )}
                  </div>
                )}
                </div>
              )}

              {/* ── Tools tab ────────────────────────────────────────── */}
              {activeRightTab === 'tools' && (
                <div id="panel-tools" role="tabpanel" aria-labelledby="tab-tools">
                  {scanResult ? (
                    <ErrorBoundary fallbackLabel="Tools panel crashed">
                      <TranscriptionPanel
                        result={transcription}
                        onTranscriptionDone={setTranscription}
                        onSeek={ms => videoPlayerRef.current?.seekTo(ms)}
                        videoFile={selectedFile}
                        transcodedVideoSrc={transcodedVideoSrc ?? undefined}
                        subtitleStyle={subtitleStyle}
                        onSubtitleStyleChange={setSubtitleStyle}
                      />
                      {thumbnails.length > 0 && (
                        <ThumbnailGrid thumbnails={thumbnails} />
                      )}
                      <SlateCreatorCollapsible videoFile={selectedFile} onAddSlateBlock={handleAddSlateBlock} forceOpen={slateForceOpen > 0 ? slateForceOpen : undefined} videoWidth={scanResult?.video?.width} videoHeight={scanResult?.video?.height} />
                      <ContrastChecker
                        videoEl={videoEl}
                        currentTime={videoCurrentTime}
                        onContrastCheck={handleContrastCheck}
                      />
                    </ErrorBoundary>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 16px',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.8125rem',
                    }}>
                      Scan a file to use tools
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </main>

      {/* Version compare overlay — rendered outside main for proper z-index */}
      {compareState && (
        <VersionCompare
          fileA={compareState.fileA}
          fileB={compareState.fileB}
          onClose={() => {
            if (compareState.fileA.src.startsWith('blob:')) URL.revokeObjectURL(compareState.fileA.src);
            if (compareState.fileB.src.startsWith('blob:')) URL.revokeObjectURL(compareState.fileB.src);
            setCompareState(null);
          }}
        />
      )}

      {/* Custom Preset Modal */}
      {showCustomModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowCustomModal(false); setEditingPresetId(null); } }}
        >
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              width: '780px',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {editingPresetId ? <Pencil size={15} style={{ color: 'var(--color-accent)' }} /> : <Plus size={15} style={{ color: 'var(--color-accent)' }} />}
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  {editingPresetId ? 'Edit Preset' : 'Add Custom Preset'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Reset to built-in defaults when a stale custom override exists */}
                {editingPresetId && validationPresets.some(p => p.id === editingPresetId) && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                    title="Reset to built-in defaults"
                    onClick={() => {
                      const builtin = validationPresets.find(p => p.id === editingPresetId)!;
                      setCustomForm({ name: builtin.name, rules: presetToRules(builtin) });
                    }}
                  >
                    Reset defaults
                  </button>
                )}
                <button className="btn btn-icon btn-sm" onClick={() => { setShowCustomModal(false); setEditingPresetId(null); }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Preset name */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <input
                className="input"
                type="text"
                placeholder="Preset name (required)"
                value={customForm.name}
                onChange={e => setCustomForm(prev => ({ ...prev, name: e.target.value }))}
                style={{ width: '100%', fontSize: '0.875rem' }}
                autoFocus
              />
            </div>

            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg-primary)' }}>
              <div style={{ width: '24px', flexShrink: 0 }} />
              <div style={{ width: '196px', flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Parameter</div>
              <div style={{ width: '148px', flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Condition</div>
              <div style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Value</div>
            </div>

            {/* Rules list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {(['File', 'Video', 'Audio'] as const).map(cat => (
                <div key={cat}>
                  <div style={{
                    padding: '6px 20px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--color-text-muted)',
                    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--color-border)',
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>
                    {cat}
                  </div>
                  {RULE_DEFS.filter(d => d.category === cat).map(def => (
                    <RuleRow
                      key={def.id}
                      def={def}
                      state={customForm.rules[def.id]}
                      onChange={s => updateRule(def.id, s)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              {overwriteTarget ? (
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', background: editingPresetId === overwriteTarget.id ? 'rgba(var(--color-accent-rgb,59,130,246),0.08)' : 'rgba(var(--color-warning-rgb,255,165,0),0.08)' }}>
                  <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                    {editingPresetId === overwriteTarget.id ? (
                      <>Save changes to <strong>"{overwriteTarget.name}"</strong>?</>
                    ) : (
                      <><span style={{ color: 'var(--color-warning)' }}>⚠</span>{' '}Preset <strong>"{overwriteTarget.name}"</strong> already exists. Overwrite it?</>
                    )}
                  </span>
                  <button className="btn btn-secondary" onClick={() => setOverwriteTarget(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    style={editingPresetId !== overwriteTarget.id ? { background: 'var(--color-warning)', borderColor: 'var(--color-warning)' } : {}}
                    onClick={() => doSave(overwriteTarget.id)}
                  >
                    {editingPresetId === overwriteTarget.id ? 'Save Changes' : 'Overwrite'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '14px 20px' }}>
                  <button className="btn btn-secondary" onClick={() => { setShowCustomModal(false); setEditingPresetId(null); setOverwriteTarget(null); }}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={saveCustomPreset}
                    disabled={!customForm.name.trim()}
                  >
                    {editingPresetId ? 'Save Changes' : 'Save Preset'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AppWithProviders: React.FC = () => (
  <ToastProvider>
    <App />
  </ToastProvider>
);

export default AppWithProviders;
