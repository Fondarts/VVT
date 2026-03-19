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
  Clapperboard,
  LogOut,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import type {
  ScanResult,
  ValidationCheck,
  ValidationPreset,
  ValidationReport,
  ContrastCheck,
  ResolutionPreset,
  AnnotationStroke,
} from './shared/types';
import { validationPresets } from './shared/presets';
import { generatePDF, generateJSON, preloadPdf } from './utils/pdfGenerator';
import { validateAgainstPreset } from './utils/validation';
import {
  runScan,
  captureFrameFromVideo,
  needsTranscodeCodec,
} from './api/ffmpeg';
import { preloadWhisperWorker } from './api/whisper';
import { useBatch } from './hooks/useBatch';
import { BatchView } from './components/batch/BatchView';
import { BrandBackground } from './components/BrandBackground';
import { VideoPlayer } from './components/VideoPlayer';
import type { VideoPlayerHandle } from './components/VideoPlayer';
import { ImageViewer } from './components/ImageViewer';
import { scanImageFile } from './utils/imageScanner';
import { CheckResults } from './components/CheckResults';
import { ContrastChecker } from './components/ContrastChecker';
import { ThumbnailGrid } from './components/ThumbnailGrid';
import { Waveform } from './components/Waveform';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { FeedbackPanel } from './components/FeedbackPanel';
import { SlateCreator } from './components/SlateCreator';
import { updateCommentTimecode, updateCommentRange, updateCommentTimecodes } from './utils/feedbackStorage';
import type { TranscriptionResult } from './shared/types';

// ── Rule-based custom preset form ───────────────────────────────────
interface RuleState { condition: string; value: string; }
type ConditionId = 'equals' | 'notEquals' | 'inList' | 'ignore' | 'lt' | 'lte' | 'gt' | 'gte';
const CONDITION_LABELS: Record<ConditionId, string> = {
  lt: 'Less than', lte: 'Less than or equal to',
  gt: 'Greater than', gte: 'Greater than or equal to',
  equals: 'Equals', notEquals: 'Not equal to',
  inList: 'In List', ignore: 'Ignore',
};
const DEFAULT_CONDITIONS: ConditionId[] = ['equals', 'notEquals', 'inList', 'ignore'];
const NUMERIC_CONDITIONS: ConditionId[] = ['lt', 'lte', 'gt', 'gte', 'equals', 'notEquals'];
interface RuleDef {
  id: string; label: string; category: 'File' | 'Video' | 'Audio';
  dc: ConditionId; dv: string; unit?: string; chips?: string[]; conditions?: ConditionId[];
}
const RULE_DEFS: RuleDef[] = [
  // File
  { id: 'fileFormat',    label: 'File Format',              category: 'File',  dc: 'inList',  dv: 'mp4, mov',                  unit: '',     chips: ['mp4','mov','mkv','webm','avi','mxf','m2ts'] },
  { id: 'fileExt',       label: 'File Extension',           category: 'File',  dc: 'inList',  dv: 'mp4, mov',                  unit: '',     chips: ['mp4','mov','mkv','webm','avi','mxf','m2ts','ts'] },
  { id: 'fileSize',      label: 'File Size',                category: 'File',  dc: 'lte',     dv: '',                          unit: 'MB',   conditions: NUMERIC_CONDITIONS },
  { id: 'moovAtom',      label: 'MOOV Atom Location',       category: 'File',  dc: 'equals',  dv: 'beginning',                 unit: '',     chips: ['beginning','middle','end'] },
  // Video
  { id: 'videoCodec',    label: 'Video Codec',              category: 'Video', dc: 'inList',  dv: 'h264, hevc',                unit: '',     chips: ['h264','hevc','prores','vp9','av1','dnxhd'] },
  { id: 'videoDims',     label: 'Video Dimensions',         category: 'Video', dc: 'inList',  dv: '1920x1080',                 unit: 'px',   chips: ['1920x1080','3840x2160','1280x720','720x576','720x486'] },
  { id: 'videoAR',       label: 'Video Aspect Ratio',       category: 'Video', dc: 'inList',  dv: '16:9',                      unit: '',     chips: ['16:9','4:3','1:1','9:16','21:9'] },
  { id: 'videoBitDepth', label: 'Video Bit Depth',          category: 'Video', dc: 'gte',     dv: '8',                         unit: 'bit',  chips: ['8','10','12'], conditions: NUMERIC_CONDITIONS },
  { id: 'videoBitRate',  label: 'Video Bit Rate',           category: 'Video', dc: 'lte',     dv: '',                          unit: 'Mbps', conditions: NUMERIC_CONDITIONS },
  { id: 'videoChroma',   label: 'Video Chroma Subsampling', category: 'Video', dc: 'inList',  dv: '4:2:0',                     unit: '',     chips: ['4:2:0','4:2:2','4:4:4'] },
  { id: 'videoColor',    label: 'Video Color Space',        category: 'Video', dc: 'inList',  dv: 'bt709',                     unit: '',     chips: ['bt709','bt2020','bt601','smpte240m'] },
  { id: 'videoDuration', label: 'Video Duration',           category: 'Video', dc: 'lte',     dv: '',                          unit: 's',    conditions: NUMERIC_CONDITIONS },
  { id: 'videoFPS',      label: 'Video Frame Rate',         category: 'Video', dc: 'equals',  dv: '25',                        unit: 'fps',  chips: ['23.976','24','25','29.97','30','50','59.94','60'], conditions: NUMERIC_CONDITIONS },
  { id: 'videoScan',     label: 'Video Scan Type',          category: 'Video', dc: 'equals',  dv: 'progressive',               unit: '',     chips: ['progressive','interlaced'] },
  // Audio
  { id: 'audioCodec',    label: 'Audio Codec',              category: 'Audio', dc: 'inList',  dv: 'aac',                       unit: '',     chips: ['aac','mp3','pcm_s16le','pcm_s24le','ac3','eac3'] },
  { id: 'audioChannels', label: 'Audio Channels',           category: 'Audio', dc: 'equals',  dv: '2',                         unit: '',     chips: ['1','2','6','8'],          conditions: NUMERIC_CONDITIONS },
  { id: 'audioSR',       label: 'Audio Sample Rate',        category: 'Audio', dc: 'equals',  dv: '48000',                     unit: 'Hz',   chips: ['44100','48000','96000'],  conditions: NUMERIC_CONDITIONS },
  { id: 'audioLoudness', label: 'Audio Loudness',           category: 'Audio', dc: 'lte',     dv: '-23',                       unit: 'LUFS', chips: ['-23','-24','-16','-18'], conditions: NUMERIC_CONDITIONS },
  { id: 'audioTP',       label: 'Audio True Peak',          category: 'Audio', dc: 'lte',     dv: '-1',                        unit: 'dBTP', chips: ['-1','-2','-3'],           conditions: NUMERIC_CONDITIONS },
  { id: 'audioBR',       label: 'Audio Bit Rate',           category: 'Audio', dc: 'gte',     dv: '128',                       unit: 'kbps', chips: ['128','192','256','320'],  conditions: NUMERIC_CONDITIONS },
];

const makeDefaultRules = (): Record<string, RuleState> =>
  Object.fromEntries(RULE_DEFS.map(d => [d.id, { condition: 'ignore', value: d.dv }]));

interface CustomPresetForm { name: string; rules: Record<string, RuleState>; }
const defaultForm: CustomPresetForm = { name: '', rules: makeDefaultRules() };

const App: React.FC = () => {
  const { user, loading: authLoading, error: authError, signIn, signOut } = useAuth();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [customPresets, setCustomPresets] = useState<ValidationPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('customPresets') || '[]'); }
    catch { return []; }
  });
  // Keep localStorage in sync with every state change
  useEffect(() => {
    localStorage.setItem('customPresets', JSON.stringify(customPresets));
  }, [customPresets]);

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
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState<CustomPresetForm>(defaultForm);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<ValidationPreset | null>(null);

  // Custom presets can override built-ins by sharing the same ID
  const overriddenIds = new Set(customPresets.map(p => p.id));
  const allPresets = [
    ...validationPresets.filter(p => !overriddenIds.has(p.id)),
    ...customPresets,
  ];

  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const batch = useBatch(selectedPreset, allPresets);

  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [validationResult, setValidationResult] = useState<'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS' | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [contrastChecks, setContrastChecks] = useState<ContrastCheck[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionResult | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<'specs' | 'feedback' | 'tools'>('feedback');
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [feedbackMarkers, setFeedbackMarkers] = useState<{ time: number; id: string; author: string }[]>([]);
  const [feedbackMarkerRanges, setFeedbackMarkerRanges] = useState<{ start: number; end: number; id: string; author: string }[]>([]);
  const [stagedMarker, setStagedMarker] = useState<{ start: number; end: number; strokes?: AnnotationStroke[] } | null>(null);
  const [annotationOverlay, setAnnotationOverlay] = useState<AnnotationStroke[] | null>(null);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [transcodeError, setTranscodeError] = useState<string | null>(null);
  const [transcodedVideoSrc, setTranscodedVideoSrc] = useState<string | null>(null);
  const snapshotCounterRef = useRef(0);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

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

  const handleFileSelected = (file: File) => {
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    thumbnails.forEach(t => { if (t.startsWith('blob:')) URL.revokeObjectURL(t); });
    if (transcodedVideoSrc) URL.revokeObjectURL(transcodedVideoSrc);

    const fileIsImage = file.type.startsWith('image/');
    setIsImage(fileIsImage);
    setSelectedFile(file);
    setVideoSrc(URL.createObjectURL(file));
    setScanResult(null);
    setChecks([]);
    setThumbnails([]);
    setWaveformData([]);
    setContrastChecks([]);
    setTranscription(undefined);
    setError(null);
    setVideoEl(null);
    setActiveRightTab('feedback');
    setFeedbackCount(0);
    setFeedbackMarkers([]);
    setAnnotationOverlay(null);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodeError(null);
    setTranscodedVideoSrc(null);
    snapshotCounterRef.current = 0;

    if (fileIsImage) {
      handleImageScan(file);
    } else {
      handleScan(file);
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

  const handleImageScan = async (file: File) => {
    setScanning(true);
    setError(null);
    try {
      const result = await scanImageFile(file);
      setScanResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read image');
    } finally {
      setScanning(false);
    }
  };

  const handleScan = async (fileOverride?: File) => {
    const file = fileOverride ?? selectedFile;
    if (!file) return;

    setScanning(true);
    setScanProgress(0);
    setScanStatus('Loading FFmpeg…');
    setError(null);
    setChecks([]);
    setValidationResult(null);
    setScanResult(null);
    setThumbnails([]);
    setWaveformData([]);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodeError(null);
    setTranscodedVideoSrc(null);

    try {
      await runScan(file, {
        thumbnailCount: 10,
        onProgress: (pct, label) => { setScanProgress(pct); setScanStatus(label); },
        onScanReady: (scan) => {
          setScanResult(scan);
          // Pre-arm transcode spinner so it shows immediately in VideoPlayer
          if (scan.video && needsTranscodeCodec(scan.video.codec)) {
            setIsTranscoding(true);
            setTranscodeProgress(0);
          }
        },
        onLoudnessReady: (lufs, truePeak) => {
          setScanResult(prev =>
            prev?.audio ? { ...prev, audio: { ...prev.audio, lufs, truePeak } } : prev
          );
        },
        onTranscodeReady: (url) => {
          setVideoSrc(prev => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return url;
          });
          setTranscodedVideoSrc(url);
          setIsTranscoding(false);
        },
        onTranscodeError: (msg) => {
          setTranscodeError(msg);
          setIsTranscoding(false);
        },
        onWaveformReady: (wf) => { setWaveformData(wf); },
        onThumbnailsReady: (thumbs) => { setThumbnails(thumbs); },
      });
      setScanStatus('');

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

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
    const name = scanResult.file.name.replace(/\.[^.]+$/, '');
    await generatePDF(buildReport(), `Kissd_VVT_Report_${name}.pdf`);
  };

  const handleExportJSON = async () => {
    if (!scanResult) return;
    const name = scanResult.file.name.replace(/\.[^.]+$/, '');
    await generateJSON(buildReport(), `Kissd_VVT_Report_${name}.json`);
  };

  const handleSaveThumbnails = () => {
    thumbnails.forEach((thumb, index) => {
      const a = document.createElement('a');
      a.href = thumb;
      a.download = `thumbnail_${index + 1}.jpg`;
      a.click();
    });
  };

  const handleContrastCheck = (newChecks: ContrastCheck[]) => {
    setContrastChecks(newChecks);
  };

  const handlePlaceMarker = useCallback((start: number, end: number, strokes: AnnotationStroke[]) => {
    videoPlayerRef.current?.seekTo(start * 1000);
    setStagedMarker({ start, end, strokes: strokes.length > 0 ? strokes : undefined });
    setActiveRightTab('feedback');
  }, []);

  const handleImagePlaceMarker = useCallback((strokes: AnnotationStroke[]) => {
    setStagedMarker({ start: 0, end: 0, strokes: strokes.length > 0 ? strokes : undefined });
    setActiveRightTab('feedback');
  }, []);

  const handleMarkerMove = useCallback((id: string, newTime: number) => {
    if (!selectedFile) return;
    updateCommentTimecode(id, newTime);
    setFeedbackMarkers(prev => prev.map(m => m.id === id ? { ...m, time: newTime } : m));
  }, [selectedFile]);

  const handleMarkerRangeMove = useCallback((id: string, newStart: number, newEnd: number) => {
    if (!selectedFile) return;
    updateCommentTimecodes(id, newStart, newEnd);
    setFeedbackMarkerRanges(prev => prev.map(r => r.id === id ? { ...r, start: newStart, end: newEnd } : r));
  }, [selectedFile]);

  const handleMarkerSetRange = useCallback((id: string, end: number) => {
    if (!selectedFile) return;
    updateCommentRange(id, end);
  }, [selectedFile]);

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

  const handlePresetChange = (value: string) => {
    if (value === '__add_custom__') {
      setCustomForm({ name: '', rules: makeDefaultRules() });
      setEditingPresetId(null);
      setShowCustomModal(true);
    } else {
      setSelectedPreset(value);
    }
  };

  const buildPresetFromForm = (id: string): ValidationPreset => {
    const rs = customForm.rules;
    const on   = (rid: string) => (rs[rid]?.condition ?? 'ignore') !== 'ignore';
    const cond = (rid: string) => rs[rid]?.condition ?? 'ignore';
    const v    = (rid: string) => rs[rid]?.value ?? '';
    const lst  = (rid: string) => v(rid).split(',').map(s => s.trim()).filter(Boolean);
    const num  = (rid: string) => { const n = parseFloat(v(rid)); return isNaN(n) ? undefined : n; };
    const numLst = (rid: string) => lst(rid).map(Number).filter(n => !isNaN(n));

    const containerFormats = on('fileFormat') ? lst('fileFormat') : ['mp4', 'mov'];
    const allowedFileExtensions = on('fileExt') ? lst('fileExt') : undefined;
    const c_fileSize = cond('fileSize');
    const maxFileSizeMb = on('fileSize') && ['lt','lte','equals','notEquals'].includes(c_fileSize) ? num('fileSize') : undefined;
    const requireFastStart = on('moovAtom')
      ? ((cond('moovAtom') === 'notEquals' && !v('moovAtom').toLowerCase().includes('beginning')) ||
         (cond('moovAtom') !== 'notEquals' && v('moovAtom').toLowerCase().includes('beginning')))
      : undefined;

    const allowedVideoCodecs = on('videoCodec') ? lst('videoCodec') : undefined;
    const resolutions: ResolutionPreset[] | undefined = on('videoDims')
      ? lst('videoDims').map(s => { const [w, h] = s.split('x').map(Number); return w && h ? { width: w, height: h, label: `${w}x${h}` } : null; }).filter(Boolean) as ResolutionPreset[]
      : undefined;
    const aspectRatios = on('videoAR') ? lst('videoAR') : undefined;
    const bitDepth = on('videoBitDepth') ? num('videoBitDepth') : undefined;
    const c_bitrate = cond('videoBitRate');
    const maxBitrateMbps = on('videoBitRate') && ['lt','lte','equals'].includes(c_bitrate) ? num('videoBitRate') : undefined;
    const minBitrateMbps = on('videoBitRate') && ['gt','gte'].includes(c_bitrate) ? num('videoBitRate') : undefined;
    const chromaSubsamplings = on('videoChroma') ? lst('videoChroma') : undefined;
    const chromaSubsampling = chromaSubsamplings?.[0] ?? '4:2:0';
    const allowedColorSpaces = on('videoColor') ? lst('videoColor') : undefined;
    const c_dur = cond('videoDuration');
    const maxDurationSeconds = on('videoDuration') && ['lt','lte','equals'].includes(c_dur) ? num('videoDuration') : undefined;
    const minDurationSeconds = on('videoDuration') && ['gt','gte'].includes(c_dur) ? num('videoDuration') : undefined;
    const frameRates = on('videoFPS') ? (cond('videoFPS') === 'inList' ? numLst('videoFPS') : [num('videoFPS')!].filter(n => !isNaN(n))) : [];
    const requireProgressive = on('videoScan') ? v('videoScan').toLowerCase().includes('progressive') : false;

    const allowedAudioCodecs = on('audioCodec') ? lst('audioCodec') : undefined;
    const audioChannelNum = on('audioChannels') ? num('audioChannels') : undefined;
    const audioChannels = audioChannelNum;
    const allowedAudioChannels = audioChannelNum !== undefined ? [audioChannelNum] : undefined;
    const audioSRNum = on('audioSR') ? num('audioSR') : undefined;
    const audioSampleRate = audioSRNum;
    const allowedAudioSampleRates = audioSRNum !== undefined ? [audioSRNum] : undefined;
    let loudnessTarget: number | undefined, loudnessTolerance: number | undefined;
    let loudnessMin: number | undefined, loudnessMax: number | undefined;
    if (on('audioLoudness')) {
      const c_loud = cond('audioLoudness');
      if (c_loud === 'gte' || c_loud === 'gt') { loudnessMin = num('audioLoudness'); }
      else if (c_loud === 'lte' || c_loud === 'lt') { loudnessMax = num('audioLoudness'); }
      else { loudnessTarget = num('audioLoudness'); loudnessTolerance = 1; }
    }
    const truePeakMax = on('audioTP') ? num('audioTP') : undefined;
    const c_abr = cond('audioBR');
    const minAudioKbps = on('audioBR') && ['gte','gt','equals'].includes(c_abr) ? num('audioBR') : undefined;

    return {
      id, name: customForm.name.trim(), description: 'Custom preset',
      containerFormats, allowedFileExtensions, requireFastStart, maxFileSizeMb,
      allowedVideoCodecs, videoCodecs: allowedVideoCodecs,
      resolutions: resolutions?.length ? resolutions : undefined,
      aspectRatios, bitDepth, maxBitrateMbps, minBitrateMbps,
      chromaSubsampling, chromaSubsamplings, allowedColorSpaces,
      maxDurationSeconds, minDurationSeconds, frameRates, requireProgressive,
      allowedAudioCodecs, audioChannels, allowedAudioChannels,
      audioSampleRate, allowedAudioSampleRates,
      loudnessTarget, loudnessTolerance, loudnessMin, loudnessMax,
      truePeakMax, minAudioKbps,
    };
  };

  const doSave = (presetId: string) => {
    const savedPreset = buildPresetFromForm(presetId);
    let updated: ValidationPreset[];
    // Replace if a custom preset with this ID already exists (edit or overwrite);
    // otherwise add (new preset, or first-time override of a built-in).
    if (customPresets.some(p => p.id === presetId)) {
      updated = customPresets.map(p => p.id === presetId ? savedPreset : p);
    } else {
      updated = [...customPresets, savedPreset];
    }
    setCustomPresets(updated);
    localStorage.setItem('customPresets', JSON.stringify(updated));
    setSelectedPreset(presetId);
    setEditingPresetId(null);
    setOverwriteTarget(null);
    setShowCustomModal(false);
  };

  const saveCustomPreset = () => {
    if (!customForm.name.trim()) return;
    const name = customForm.name.trim().toLowerCase();

    // Editing an existing preset → always confirm before overwriting
    if (editingPresetId) {
      const current = allPresets.find(p => p.id === editingPresetId);
      if (current) { setOverwriteTarget(current); return; }
    }

    // Creating new: check for a name conflict with a different preset
    const conflict = allPresets.find(p =>
      p.name.trim().toLowerCase() === name && p.id !== editingPresetId
    );
    if (conflict) { setOverwriteTarget(conflict); return; }

    doSave(`custom-${Date.now()}`);
  };

  const deleteCustomPreset = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    localStorage.setItem('customPresets', JSON.stringify(updated));
    if (selectedPreset === id) {
      setSelectedPreset(validationPresets.some(p => p.id === id) ? id : 'social-media-standard');
    }
  };

  const presetToRules = (preset: ValidationPreset): Record<string, RuleState> => {
    const r = makeDefaultRules();
    const set = (id: string, cond: string, val: string) => { r[id] = { condition: cond, value: val }; };
    if (preset.containerFormats?.length)       set('fileFormat',    'inList',  preset.containerFormats.join(', '));
    if (preset.allowedFileExtensions?.length)  set('fileExt',       'inList',  preset.allowedFileExtensions.join(', '));
    if (preset.maxFileSizeMb)                  set('fileSize',      'lte',    String(preset.maxFileSizeMb));
    if (preset.requireFastStart !== undefined)  set('moovAtom',      preset.requireFastStart ? 'equals' : 'notEquals', 'beginning');
    const vCodecs = preset.allowedVideoCodecs ?? preset.videoCodecs ?? [];
    if (vCodecs.length)                        set('videoCodec',    'inList',  vCodecs.join(', '));
    if (preset.resolutions?.length)            set('videoDims',     'inList',  preset.resolutions.map(res => `${res.width}x${res.height}`).join(', '));
    if (preset.aspectRatios?.length)           set('videoAR',       'inList',  preset.aspectRatios.join(', '));
    if (preset.bitDepth !== undefined)         set('videoBitDepth', 'gte',    String(preset.bitDepth));
    if (preset.maxBitrateMbps)                 set('videoBitRate',  'lte',    String(preset.maxBitrateMbps));
    else if (preset.minBitrateMbps)            set('videoBitRate',  'gte',    String(preset.minBitrateMbps));
    else if (preset.maxBitrate)                set('videoBitRate',  'lte',    String((preset.maxBitrate / 1_000_000).toFixed(1)));
    else if (preset.minBitrate)                set('videoBitRate',  'gte',    String((preset.minBitrate / 1_000_000).toFixed(1)));
    const chromaSubs = preset.chromaSubsamplings ?? (preset.chromaSubsampling ? [preset.chromaSubsampling] : []);
    if (chromaSubs.length)                     set('videoChroma',   'inList',  chromaSubs.join(', '));
    if (preset.allowedColorSpaces?.length)     set('videoColor',    'inList',  preset.allowedColorSpaces.join(', '));
    if (preset.maxDurationSeconds !== undefined) set('videoDuration', 'lte',   String(preset.maxDurationSeconds));
    else if (preset.minDurationSeconds !== undefined) set('videoDuration', 'gte', String(preset.minDurationSeconds));
    if (preset.frameRates?.length)             set('videoFPS',      preset.frameRates.length === 1 ? 'equals' : 'inList', preset.frameRates.join(', '));
    if (preset.requireProgressive)             set('videoScan',     'equals',  'progressive');
    const aCodes = preset.allowedAudioCodecs ?? (preset.audioCodec ? [preset.audioCodec] : []);
    if (aCodes.length)                         set('audioCodec',    'inList',  aCodes.join(', '));
    const aChans = preset.allowedAudioChannels ?? (preset.audioChannels ? [preset.audioChannels] : []);
    if (aChans.length)                         set('audioChannels', 'equals',  String(aChans[0]));
    const aSRs = preset.allowedAudioSampleRates ?? (preset.audioSampleRate ? [preset.audioSampleRate] : []);
    if (aSRs.length)                           set('audioSR',       'equals',  String(aSRs[0]));
    if (preset.loudnessMin !== undefined)      set('audioLoudness', 'gte',     String(preset.loudnessMin));
    else if (preset.loudnessMax !== undefined) set('audioLoudness', 'lte',     String(preset.loudnessMax));
    else if (preset.loudnessTarget !== undefined) set('audioLoudness', 'equals', String(preset.loudnessTarget));
    if (preset.truePeakMax !== undefined)      set('audioTP',       'lte',     String(preset.truePeakMax));
    if (preset.minAudioKbps)                   set('audioBR',       'gte',     String(preset.minAudioKbps));
    return r;
  };

  const openEditPreset = (presetId: string) => {
    const preset = allPresets.find(p => p.id === presetId);
    if (!preset) return;
    setCustomForm({ name: preset.name, rules: presetToRules(preset) });
    setEditingPresetId(presetId);
    setShowCustomModal(true);
  };

  const updateRule = (rId: string, state: RuleState) =>
    setCustomForm(prev => ({ ...prev, rules: { ...prev.rules, [rId]: state } }));

  return (
    <div className="app">
      <BrandBackground />
      <header className="app-header">
        <div className="logo">
          <img src="/icons/kissd-logo.svg" alt="KISSD" style={{ height: '22px', width: 'auto', display: 'block' }} />
          <span style={{ color: 'var(--color-text-primary)' }}>Review V03</span>
        </div>
        <div className="header-actions">
          {/* Mode toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
            <button
              className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, borderRight: '1px solid var(--border-color)' }}
              onClick={() => setMode('single')}
            >
              Single
            </button>
            <button
              className={`btn btn-sm ${mode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0 }}
              onClick={() => setMode('batch')}
            >
              Batch
            </button>
          </div>

          {/* Hidden file input (single mode only) */}
          {mode === 'single' && (
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*,.mp4,.mov,.mkv,.webm,.avi,.mxf,.m2ts,.ts,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.avif"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          )}
          {/* Preset selector — visible in both modes */}
          <select
            className="select"
            value={selectedPreset}
            onChange={e => handlePresetChange(e.target.value)}
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
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => openEditPreset(selectedPreset)}
              title="Edit preset"
              style={{ padding: '6px 10px' }}
            >
              <Pencil size={14} />
            </button>
          )}

          {selectedPreset && customPresets.some(p => p.id === selectedPreset) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => deleteCustomPreset(selectedPreset)}
              title="Delete preset"
              style={{ padding: '6px 10px', color: 'var(--color-error)' }}
            >
              <Trash2 size={14} />
            </button>
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

      <main className="app-main">
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

        {mode === 'single' && !selectedFile && (
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
          <div className="results-container">
            {/* Left column */}
            <div className="results-column" style={{ position: 'sticky', top: 0, height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
              {isImage ? (
                <ImageViewer
                  src={videoSrc}
                  width={scanResult?.image?.width ?? 0}
                  height={scanResult?.image?.height ?? 0}
                  annotationOverlay={annotationOverlay}
                  onAnnotationDismiss={() => setAnnotationOverlay(null)}
                  onPlaceMarker={handleImagePlaceMarker}
                />
              ) : (
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
                />
              )}

              {!isImage && scanResult && waveformData.length > 0 && (
                <Waveform
                  audioData={waveformData}
                  duration={scanResult.file.duration}
                  currentTime={videoCurrentTime}
                  videoEl={videoEl}
                  truePeakMax={allPresets.find(p => p.id === selectedPreset)?.truePeakMax}
                />
              )}
            </div>

            {/* Right column — always visible once a video is loaded */}
            <div className="results-column" style={{ height: 'calc(100vh - 130px)', overflowY: 'auto', position: 'sticky', top: 0 }}>
              {/* Tab nav */}
              <div className="tab-nav" style={{ flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
                <button
                  className={`tab-btn ${activeRightTab === 'feedback' ? 'active' : ''}`}
                  onClick={() => setActiveRightTab('feedback')}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  Feedback
                  {feedbackCount > 0 && (
                    <span style={{
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
                <button
                  className={`tab-btn ${activeRightTab === 'specs' ? 'active' : ''}`}
                  onClick={() => setActiveRightTab('specs')}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  Specs
                  {scanning && <Loader2 size={11} className="animate-spin" />}
                </button>
                <button
                  className={`tab-btn ${activeRightTab === 'tools' ? 'active' : ''}`}
                  onClick={() => setActiveRightTab('tools')}
                >
                  Tools
                </button>
              </div>

              {/* ── Specs tab ───────────────────────────────────────── */}
              {activeRightTab === 'specs' && (
                <>
                  {/* Slim progress bar while scanning */}
                  {scanning && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Loader2 size={12} className="animate-spin" />
                          {scanStatus}
                        </span>
                        <span>{scanProgress}%</span>
                      </div>
                      <div style={{ width: '100%', height: '2px', background: 'var(--color-bg-tertiary)', borderRadius: '1px' }}>
                        <div style={{ width: `${scanProgress}%`, height: '100%', background: 'var(--color-accent)', borderRadius: '1px', transition: 'width 0.3s' }} />
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
                </>
              )}

              {/* ── Feedback tab ─────────────────────────────────────── */}
              {activeRightTab === 'feedback' && selectedFile && (
                user ? (
                  <FeedbackPanel
                    fileName={selectedFile.name}
                    fileSize={selectedFile.size}
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
                )
              )}

              {/* ── Tools tab ────────────────────────────────────────── */}
              {activeRightTab === 'tools' && (
                <>
                  {scanResult ? (
                    <>
                      <ContrastChecker
                        videoEl={videoEl}
                        currentTime={videoCurrentTime}
                        onContrastCheck={handleContrastCheck}
                      />
                      <TranscriptionPanel
                        result={transcription}
                        onTranscriptionDone={setTranscription}
                        onSeek={ms => videoPlayerRef.current?.seekTo(ms)}
                        videoFile={selectedFile}
                        transcodedVideoSrc={transcodedVideoSrc ?? undefined}
                      />
                      {thumbnails.length > 0 && (
                        <ThumbnailGrid thumbnails={thumbnails} />
                      )}
                      <div className="card">
                        <div className="card-header">
                          <h3 className="card-title" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clapperboard size={14} style={{ color: 'var(--color-accent)' }} />
                            Slate Creator
                          </h3>
                        </div>
                        <div style={{ padding: '12px' }}>
                          <SlateCreator />
                        </div>
                      </div>
                    </>
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
                </>
              )}
            </div>
          </div>
        )}
      </main>

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

// ── RuleRow ───────────────────────────────────────────────────────
const RuleRow: React.FC<{ def: RuleDef; state: RuleState; onChange: (s: RuleState) => void }> = ({ def, state, onChange }) => {
  const [chipOpen, setChipOpen] = React.useState(false);
  const chipRef = React.useRef<HTMLDivElement>(null);
  const enabled = state.condition !== 'ignore';

  React.useEffect(() => {
    if (!chipOpen) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) setChipOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chipOpen]);

  const toggleChip = (chip: string) => {
    if (state.condition === 'inList') {
      const current = state.value.split(',').map(s => s.trim()).filter(Boolean);
      const idx = current.findIndex(s => s.toLowerCase() === chip.toLowerCase());
      const updated = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, chip];
      onChange({ ...state, value: updated.join(', ') });
    } else {
      onChange({ ...state, value: chip });
      setChipOpen(false);
    }
  };

  const isChipActive = (chip: string) =>
    state.condition === 'inList'
      ? state.value.split(',').map(s => s.trim().toLowerCase()).includes(chip.toLowerCase())
      : state.value.toLowerCase() === chip.toLowerCase();

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
    borderRadius: '4px', color: 'var(--color-text-primary)', fontSize: '0.78rem',
    padding: '3px 6px', minWidth: 0,
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 20px', minHeight: '36px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: enabled ? 'rgba(59,130,246,0.06)' : 'transparent',
        cursor: enabled ? 'default' : 'pointer',
      }}
      onClick={!enabled ? () => onChange({ ...state, condition: def.dc }) : undefined}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={e => onChange({ ...state, condition: e.target.checked ? def.dc : 'ignore' })}
        onClick={e => e.stopPropagation()}
        style={{ cursor: 'pointer', flexShrink: 0, accentColor: '#E1FF1C', width: '14px', height: '14px' }}
      />
      <span style={{ width: '196px', flexShrink: 0, fontSize: '0.8125rem', color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
        {def.label}
      </span>
      {enabled ? (
        <>
          <select
            value={state.condition}
            onChange={e => onChange({ ...state, condition: e.target.value })}
            style={{ ...inputStyle, width: '148px', flexShrink: 0 }}
          >
            {(def.conditions ?? DEFAULT_CONDITIONS).map(c => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
          <div ref={chipRef} style={{ position: 'relative', flex: 1, display: 'flex', gap: '4px', minWidth: 0 }}>
            <input
              type="text"
              value={state.value}
              onChange={e => onChange({ ...state, value: e.target.value })}
              placeholder={state.condition === 'inList' ? 'value1, value2…' : 'value'}
              style={{ ...inputStyle, flex: 1, width: '100%' }}
            />
            {def.chips && (
              <>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setChipOpen(o => !o); }}
                  style={{ ...inputStyle, flexShrink: 0, padding: '3px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Quick pick"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </button>
                {chipOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', padding: '8px', zIndex: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    display: 'flex', flexWrap: 'wrap', gap: '5px', minWidth: '180px',
                  }}>
                    {def.chips.map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleChip(chip)}
                        style={{
                          padding: '3px 10px', borderRadius: '14px', fontSize: '0.75rem',
                          cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap',
                          background: isChipActive(chip) ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                          borderColor: isChipActive(chip) ? 'var(--color-accent)' : 'var(--border-color)',
                          color: isChipActive(chip) ? '#fff' : 'var(--color-text-primary)',
                          fontWeight: isChipActive(chip) ? 600 : 400,
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {def.unit && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', flexShrink: 0, width: '36px', textAlign: 'left' }}>
              {def.unit}
            </span>
          )}
        </>
      ) : (
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          click to enable
        </span>
      )}
    </div>
  );
};

export default App;
