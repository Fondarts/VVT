import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileVideo,
  FolderOpen,
  AlertCircle,
  FileText,
  ScanLine,
  Loader2,
  Download,
  Plus,
  X,
} from 'lucide-react';
import type {
  ScanResult,
  ValidationCheck,
  ValidationPreset,
  OverlayPreset,
  ValidationReport,
  ContrastCheck,
} from '../shared/types';
import { validationPresets, overlayPresets } from '../shared/presets';
import { generatePDF, generateJSON } from './utils/pdfGenerator';
import { validateAgainstPreset } from './utils/validation';
import { VideoPlayer } from './components/VideoPlayer';
import type { VideoPlayerHandle } from './components/VideoPlayer';
import { CheckResults } from './components/CheckResults';
import { DetailTables } from './components/DetailTables';
import { ContrastChecker } from './components/ContrastChecker';
import { ReportHeader } from './components/ReportHeader';
import { ThumbnailGrid } from './components/ThumbnailGrid';
import { Waveform } from './components/Waveform';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import type { TranscriptionResult } from '../shared/types';

interface CustomPresetForm {
  name: string;
  // Container
  containerFormats: string;
  requireFastStart: boolean;
  maxFileSizeMb: string;
  // Video
  videoCodecs: string;
  resolutions: string;
  aspectRatios: string;
  frameRates: string;
  chromaSubsampling: string;
  requireProgressive: boolean;
  maxBitrateMbps: string;
  minBitrateMbps: string;
  bitrateMode: 'cbr' | 'vbr' | 'any';
  // Audio
  audioCodecs: string;
  minAudioKbps: string;
  audioBitDepth: string;
  audioSampleRate: string;
  audioChannels: string;
  loudnessTarget: string;
  loudnessTolerance: string;
  truePeakMax: string;
}

const defaultForm: CustomPresetForm = {
  name: '',
  containerFormats: 'mp4, mov',
  requireFastStart: false,
  maxFileSizeMb: '',
  videoCodecs: 'h264, hevc',
  resolutions: '1920x1080, 1280x720',
  aspectRatios: '16:9',
  frameRates: '23.976, 24, 25, 29.97, 30, 50, 59.94, 60',
  chromaSubsampling: '4:2:0',
  requireProgressive: true,
  maxBitrateMbps: '',
  minBitrateMbps: '',
  bitrateMode: 'any',
  audioCodecs: '',
  minAudioKbps: '',
  audioBitDepth: '',
  audioSampleRate: '',
  audioChannels: '',
  loudnessTarget: '-14',
  loudnessTolerance: '1',
  truePeakMax: '-1',
};

const App: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [outputFolder, setOutputFolder] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getTempDir().then(setOutputFolder);
  }, []);

  const [customPresets, setCustomPresets] = useState<ValidationPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('customPresets') || '[]'); }
    catch { return []; }
  });
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState<CustomPresetForm>(defaultForm);

  const allPresets = [...validationPresets, ...customPresets];

  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [validationResult, setValidationResult] = useState<'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS' | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [contrastChecks, setContrastChecks] = useState<ContrastCheck[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionResult | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const snapshotCounterRef = useRef(0);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  const handleSelectFile = async () => {
    const path = await window.electronAPI.dialog.openFile();
    if (path) {
      setFilePath(path);
      setScanResult(null);
      setChecks([]);
      setThumbnails([]);
      setWaveformData([]);
      setContrastChecks([]);
      setTranscription(undefined);
      setError(null);
      snapshotCounterRef.current = 0;
    }
  };

  // Re-run validation whenever scanResult or selectedPreset changes
  useEffect(() => {
    if (!scanResult) return;

    if (!selectedPreset) {
      setChecks([]);
      setValidationResult(null);
      return;
    }

    const preset = [...validationPresets, ...customPresets].find(p => p.id === selectedPreset);
    if (!preset) return;

    window.electronAPI.validation.run(scanResult, preset).then(validationChecks => {
      setChecks(validationChecks);
      const failCount = validationChecks.filter(c => c.status === 'fail').length;
      const warnCount = validationChecks.filter(c => c.status === 'warn').length;
      if (failCount > 0) setValidationResult('NON-COMPLIANT');
      else if (warnCount > 0) setValidationResult('WARNINGS');
      else setValidationResult('COMPLIANT');
    });
  }, [scanResult, selectedPreset, customPresets]);

  const handleScan = async () => {
    if (!filePath) return;

    setScanning(true);
    setScanProgress(0);
    setError(null);
    setChecks([]);
    setValidationResult(null);

    try {
      setScanProgress(10);

      const result = await window.electronAPI.video.scan(filePath);
      setScanResult(result);
      setScanProgress(40);

      const thumbs = await window.electronAPI.video.generateThumbnails(filePath, outputFolder);
      setThumbnails(thumbs);
      setScanProgress(75);

      if (result.audio) {
        const waveform = await window.electronAPI.video.getWaveform(filePath);
        setWaveformData(waveform);
      }
      setScanProgress(100);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
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
    outputFolder,
    transcription,
  });

  const handleExportPDF = async () => {
    if (!scanResult) return;
    const name = scanResult.file.name.replace(/\.[^.]+$/, '');
    await generatePDF(buildReport(), `Kissd_Report_${name}.pdf`);
  };

  const handleExportJSON = async () => {
    if (!scanResult) return;
    const name = scanResult.file.name.replace(/\.[^.]+$/, '');
    await generateJSON(buildReport(), `Kissd_Report_${name}.json`);
  };

  const handleSaveThumbnails = async () => {
    if (!thumbnails.length) return;
    const destFolder = await window.electronAPI.dialog.selectFolder();
    if (!destFolder) return;
    await window.electronAPI.file.copyFiles(thumbnails, destFolder);
    await window.electronAPI.shell.openPath(destFolder);
  };

  const handleContrastCheck = (newChecks: ContrastCheck[]) => {
    setContrastChecks(newChecks);
  };

  const handleSnapshot = async (time: number) => {
    if (!filePath) return;
    const baseName = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || 'video';
    snapshotCounterRef.current += 1;
    const counter = String(snapshotCounterRef.current).padStart(2, '0');
    const defaultName = `${baseName}_Snapshot${counter}.jpg`;
    const destPath = await window.electronAPI.dialog.saveFilePath(defaultName);
    if (!destPath) return;
    await window.electronAPI.video.extractFrame(filePath, time, destPath);
  };

  const handlePresetChange = (value: string) => {
    if (value === '__add_custom__') {
      setCustomForm(defaultForm);
      setShowCustomModal(true);
    } else {
      setSelectedPreset(value);
    }
  };

  const saveCustomPreset = () => {
    if (!customForm.name.trim()) return;

    // Parse resolutions like "1920x1080, 1280x720"
    const parsedResolutions = customForm.resolutions
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(s => { const [w, h] = s.split('x').map(Number); return w && h ? { width: w, height: h, label: `${w}x${h}` } : null; })
      .filter(Boolean) as { width: number; height: number; label: string }[];

    const newPreset: ValidationPreset = {
      id: `custom-${Date.now()}`,
      name: customForm.name.trim(),
      description: 'Custom preset',
      containerFormats: customForm.containerFormats.split(',').map(s => s.trim()).filter(Boolean),
      videoCodecs: customForm.videoCodecs.split(',').map(s => s.trim()).filter(Boolean),
      allowedVideoCodecs: customForm.videoCodecs.split(',').map(s => s.trim()).filter(Boolean),
      resolutions: parsedResolutions.length > 0 ? parsedResolutions : undefined,
      aspectRatios: customForm.aspectRatios.split(',').map(s => s.trim()).filter(Boolean),
      frameRates: customForm.frameRates.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
      requireProgressive: customForm.requireProgressive,
      chromaSubsampling: customForm.chromaSubsampling,
      requireFastStart: customForm.requireFastStart,
      maxBitrateMbps: customForm.maxBitrateMbps ? parseFloat(customForm.maxBitrateMbps) : undefined,
      minBitrateMbps: customForm.minBitrateMbps ? parseFloat(customForm.minBitrateMbps) : undefined,
      bitrateMode: customForm.bitrateMode !== 'any' ? customForm.bitrateMode : undefined,
      maxFileSizeMb: customForm.maxFileSizeMb ? parseFloat(customForm.maxFileSizeMb) : undefined,
      allowedAudioCodecs: customForm.audioCodecs.split(',').map(s => s.trim()).filter(Boolean),
      minAudioKbps: customForm.minAudioKbps ? parseFloat(customForm.minAudioKbps) : undefined,
      audioBitDepth: customForm.audioBitDepth ? parseInt(customForm.audioBitDepth) : undefined,
      audioSampleRate: customForm.audioSampleRate ? parseInt(customForm.audioSampleRate) : undefined,
      audioChannels: customForm.audioChannels ? parseInt(customForm.audioChannels) : undefined,
      loudnessTarget: parseFloat(customForm.loudnessTarget) || -14,
      loudnessTolerance: parseFloat(customForm.loudnessTolerance) || 1,
      truePeakMax: parseFloat(customForm.truePeakMax) || -1,
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem('customPresets', JSON.stringify(updated));
    setSelectedPreset(newPreset.id);
    setShowCustomModal(false);
  };

  const deleteCustomPreset = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    localStorage.setItem('customPresets', JSON.stringify(updated));
    if (selectedPreset === id) setSelectedPreset('social-media-standard');
  };

  const updateForm = (field: keyof CustomPresetForm, value: string | boolean) => {
    setCustomForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <ScanLine size={24} />
          <span>Kissd Video Validation Tool</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleSelectFile}>
            <FileVideo size={16} />
            Select Video
          </button>

          <select
            className="select"
            value={selectedPreset}
            onChange={e => handlePresetChange(e.target.value)}
          >
            <option value="">— Select standard —</option>
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

          <button
            className="btn btn-primary"
            onClick={handleScan}
            disabled={!filePath || scanning}
          >
            {scanning ? (
              <><Loader2 size={16} className="animate-spin" /> Scanning...</>
            ) : (
              <><ScanLine size={16} /> Scan File</>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {!filePath && (
          <div className="dropzone" onClick={handleSelectFile}>
            <FileVideo size={48} />
            <h3>Select a video file</h3>
            <p>Click here or drag and drop</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Supports: MP4, MOV, MKV, WEBM, AVI, MXF
            </p>
          </div>
        )}

        {scanning && (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <Loader2 size={48} className="animate-spin" style={{ marginBottom: '16px' }} />
            <p>Analyzing video...</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${scanProgress}%` }} />
            </div>
          </div>
        )}

        {scanResult && !scanning && (
          <div className="results-container">
            {/* Left column */}
            <div className="results-column">
              <ReportHeader
                file={scanResult.file}
                video={scanResult.video}
                result={validationResult || 'COMPLIANT'}
              />

              <VideoPlayer
                ref={videoPlayerRef}
                filePath={filePath!}
                videoWidth={scanResult.video.width}
                videoHeight={scanResult.video.height}
                frameRate={scanResult.video.frameRate}
                subtitles={transcription?.segments}
                onSnapshot={handleSnapshot}
                onTimeUpdate={setVideoCurrentTime}
              />

              {waveformData.length > 0 && (
                <Waveform
                  audioData={waveformData}
                  duration={scanResult.file.duration}
                  currentTime={videoCurrentTime}
                />
              )}

              <TranscriptionPanel
                filePath={filePath!}
                outputFolder={outputFolder}
                onTranscriptionDone={setTranscription}
                onSeek={ms => videoPlayerRef.current?.seekTo(ms)}
              />

              <DetailTables scanResult={scanResult} />

              {thumbnails.length > 0 && (
                <ThumbnailGrid thumbnails={thumbnails} />
              )}
            </div>

            {/* Right column */}
            <div className="results-column">
              <CheckResults checks={checks} noPreset={!selectedPreset} scanResult={scanResult} />

              <ContrastChecker
                filePath={filePath!}
                duration={scanResult.file.duration}
                outputFolder={outputFolder}
                onContrastCheck={handleContrastCheck}
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
                    <FolderOpen size={16} />
                    Save Thumbnails
                  </button>
                )}
              </div>

              {/* Custom preset delete buttons */}
              {customPresets.length > 0 && (
                <div className="card" style={{ padding: '12px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                    Custom presets
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {customPresets.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem' }}>{p.name}</span>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => deleteCustomPreset(p.id)}
                          title="Delete preset"
                          style={{ color: 'var(--color-error)' }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
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
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowCustomModal(false); }}
        >
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              width: '640px',
              maxWidth: 'calc(100vw - 48px)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
                <Plus size={16} style={{ marginRight: '8px', display: 'inline' }} />
                Add Custom Preset
              </h2>
              <button className="btn btn-icon btn-sm" onClick={() => setShowCustomModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Name */}
              <ModalField label="Preset Name *">
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. My Client Standard"
                  value={customForm.name}
                  onChange={e => updateForm('name', e.target.value)}
                  style={{ width: '100%' }}
                />
              </ModalField>

              {/* ── Container ── */}
              <ModalSection title="Container">
                <MultiSelectInput
                  label="Formats"
                  hint="click to pick"
                  value={customForm.containerFormats}
                  onChange={v => updateForm('containerFormats', v)}
                  options={[
                    { label: 'MP4', value: 'mp4' }, { label: 'MOV', value: 'mov' },
                    { label: 'MKV', value: 'mkv' }, { label: 'WebM', value: 'webm' },
                    { label: 'AVI', value: 'avi' }, { label: 'MXF', value: 'mxf' },
                    { label: 'TS', value: 'ts' },   { label: 'M2TS', value: 'm2ts' },
                  ]}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <ModalField label="Max file size" hint="MB">
                    <input className="input" type="number" min="0"
                      value={customForm.maxFileSizeMb}
                      onChange={e => updateForm('maxFileSizeMb', e.target.value)}
                      placeholder="e.g. 500"
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={customForm.requireFastStart}
                        onChange={e => updateForm('requireFastStart', e.target.checked)} />
                      Require fast start
                    </label>
                  </div>
                </div>
              </ModalSection>

              {/* ── Video ── */}
              <ModalSection title="Video">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <MultiSelectInput
                    label="Codecs"
                    value={customForm.videoCodecs}
                    onChange={v => updateForm('videoCodecs', v)}
                    options={[
                      { label: 'H.264', value: 'h264' }, { label: 'HEVC', value: 'hevc' },
                      { label: 'AV1', value: 'av1' },    { label: 'VP9', value: 'vp9' },
                      { label: 'ProRes', value: 'prores' }, { label: 'DNxHD', value: 'dnxhd' },
                      { label: 'MPEG-2', value: 'mpeg2video' }, { label: 'H.265', value: 'h265' },
                    ]}
                  />
                  <MultiSelectInput
                    label="Resolutions"
                    value={customForm.resolutions}
                    onChange={v => updateForm('resolutions', v)}
                    options={[
                      { label: '1920×1080', value: '1920x1080' }, { label: '3840×2160', value: '3840x2160' },
                      { label: '1280×720',  value: '1280x720'  }, { label: '2560×1440', value: '2560x1440' },
                      { label: '4096×2160', value: '4096x2160' }, { label: '720×576',   value: '720x576'   },
                      { label: '720×480',   value: '720x480'   }, { label: '1080×1920', value: '1080x1920' },
                    ]}
                  />
                  <MultiSelectInput
                    label="Aspect ratios"
                    value={customForm.aspectRatios}
                    onChange={v => updateForm('aspectRatios', v)}
                    options={[
                      { label: '16:9', value: '16:9' }, { label: '4:3', value: '4:3' },
                      { label: '1:1',  value: '1:1'  }, { label: '9:16', value: '9:16' },
                      { label: '21:9', value: '21:9' }, { label: '4:5', value: '4:5' },
                      { label: '2:3',  value: '2:3'  }, { label: '3:2', value: '3:2' },
                    ]}
                  />
                  <MultiSelectInput
                    label="Frame rates"
                    value={customForm.frameRates}
                    onChange={v => updateForm('frameRates', v)}
                    options={[
                      { label: '23.976', value: '23.976' }, { label: '24',     value: '24'    },
                      { label: '25',     value: '25'     }, { label: '29.97',  value: '29.97' },
                      { label: '30',     value: '30'     }, { label: '48',     value: '48'    },
                      { label: '50',     value: '50'     }, { label: '59.94',  value: '59.94' },
                      { label: '60',     value: '60'     },
                    ]}
                  />
                  <ModalField label="Chroma subsampling">
                    <select className="select"
                      value={customForm.chromaSubsampling}
                      onChange={e => updateForm('chromaSubsampling', e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="4:2:0">4:2:0</option>
                      <option value="4:2:2">4:2:2</option>
                      <option value="4:4:4">4:4:4</option>
                    </select>
                  </ModalField>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'flex-end', paddingBottom: '2px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={customForm.requireProgressive}
                        onChange={e => updateForm('requireProgressive', e.target.checked)} />
                      Require progressive
                    </label>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <ModalField label="Max bitrate" hint="Mbps">
                    <input className="input" type="number" min="0" step="0.5"
                      value={customForm.maxBitrateMbps}
                      onChange={e => updateForm('maxBitrateMbps', e.target.value)}
                      placeholder="e.g. 20"
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                  <ModalField label="Min bitrate" hint="Mbps">
                    <input className="input" type="number" min="0" step="0.5"
                      value={customForm.minBitrateMbps}
                      onChange={e => updateForm('minBitrateMbps', e.target.value)}
                      placeholder="e.g. 5"
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                  <ModalField label="Bitrate mode">
                    <select className="select"
                      value={customForm.bitrateMode}
                      onChange={e => updateForm('bitrateMode', e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="any">Any</option>
                      <option value="cbr">CBR (Constant)</option>
                      <option value="vbr">VBR (Variable)</option>
                    </select>
                  </ModalField>
                </div>
              </ModalSection>

              {/* ── Audio ── */}
              <ModalSection title="Audio">
                <MultiSelectInput
                  label="Codecs"
                  value={customForm.audioCodecs}
                  onChange={v => updateForm('audioCodecs', v)}
                  options={[
                    { label: 'AAC',    value: 'aac'   }, { label: 'MP3',  value: 'mp3'  },
                    { label: 'PCM',    value: 'pcm_s16le' }, { label: 'AC-3', value: 'ac3'  },
                    { label: 'E-AC-3', value: 'eac3'  }, { label: 'Opus', value: 'opus' },
                    { label: 'FLAC',   value: 'flac'  }, { label: 'ALAC', value: 'alac' },
                  ]}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 82px 96px 88px', gap: '12px' }}>
                  <ModalField label="Min kbps">
                    <input className="input" type="number" min="0"
                      value={customForm.minAudioKbps}
                      onChange={e => updateForm('minAudioKbps', e.target.value)}
                      placeholder="e.g. 128"
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                  <SmallSelect label="Bit depth"
                    value={customForm.audioBitDepth}
                    onChange={v => updateForm('audioBitDepth', v)}
                    options={[
                      { label: 'Any',   value: ''   },
                      { label: '16-bit', value: '16' },
                      { label: '24-bit', value: '24' },
                      { label: '32-bit', value: '32' },
                    ]}
                  />
                  <SmallSelect label="Sample rate"
                    value={customForm.audioSampleRate}
                    onChange={v => updateForm('audioSampleRate', v)}
                    options={[
                      { label: 'Any',     value: ''      },
                      { label: '44.1 kHz', value: '44100' },
                      { label: '48 kHz',  value: '48000' },
                      { label: '96 kHz',  value: '96000' },
                    ]}
                  />
                  <SmallSelect label="Channels"
                    value={customForm.audioChannels}
                    onChange={v => updateForm('audioChannels', v)}
                    options={[
                      { label: 'Any',    value: '' },
                      { label: 'Mono',   value: '1' },
                      { label: 'Stereo', value: '2' },
                      { label: '5.1',    value: '6' },
                      { label: '7.1',    value: '8' },
                    ]}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <ModalField label="Loudness target" hint="LUFS">
                    <input className="input" type="number"
                      value={customForm.loudnessTarget}
                      onChange={e => updateForm('loudnessTarget', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                  <ModalField label="Tolerance" hint="±LUFS">
                    <input className="input" type="number" step="0.5"
                      value={customForm.loudnessTolerance}
                      onChange={e => updateForm('loudnessTolerance', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                  <ModalField label="True peak max" hint="dBTP">
                    <input className="input" type="number"
                      value={customForm.truePeakMax}
                      onChange={e => updateForm('truePeakMax', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </ModalField>
                </div>
              </ModalSection>

            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCustomModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveCustomPreset}
                disabled={!customForm.name.trim()}
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Small helpers for modal form
const ModalField: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.75rem', color: '#ffffff', marginBottom: '4px' }}>
      {label}
      {hint && <span style={{ marginLeft: '6px', fontStyle: 'italic', opacity: 0.55, fontSize: '0.7rem' }}>({hint})</span>}
    </label>
    {children}
  </div>
);

const ModalSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div style={{
      fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: '#ffffff', marginBottom: '10px', paddingBottom: '6px',
      borderBottom: '1px solid var(--border-color)',
    }}>
      {title}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {children}
    </div>
  </div>
);

// Single-select custom dropdown — width stays within its grid column
const SmallSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
}> = ({ label, value, onChange, options }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', color: '#ffffff', marginBottom: '4px' }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--border-color)', borderRadius: 4,
          padding: '6px 8px', color: 'var(--color-text-primary)',
          fontSize: '0.8125rem', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label || 'Any'}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0,
          background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: 6, zIndex: 500, boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
          minWidth: '100%', overflow: 'hidden',
        }}>
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: 'block', width: '100%', padding: '6px 10px',
                background: opt.value === value ? 'var(--color-accent)' : 'transparent',
                color: opt.value === value ? '#fff' : 'var(--color-text-primary)',
                fontSize: '0.8125rem', cursor: 'pointer', textAlign: 'left',
                border: 'none', whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Multi-select field: click the label to open chip picker; text input always editable
interface MSOption { label: string; value: string }

const MultiSelectInput: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: MSOption[];
}> = ({ label, hint, value, onChange, options }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = value.split(',').map(s => s.trim()).filter(Boolean);

  const toggle = (val: string) => {
    const idx = selected.findIndex(s => s.toLowerCase() === val.toLowerCase());
    const updated = idx >= 0 ? selected.filter((_, i) => i !== idx) : [...selected, val];
    onChange(updated.join(', '));
  };

  const isSelected = (val: string) => selected.some(s => s.toLowerCase() === val.toLowerCase());

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', color: '#ffffff', marginBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: '#ffffff', fontSize: '0.75rem', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
          }}
        >
          {label}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
        {hint && <span style={{ marginLeft: '6px', fontStyle: 'italic', opacity: 0.55, fontWeight: 400, fontSize: '0.7rem' }}>({hint})</span>}
      </label>
      <input
        className="input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%' }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: 'var(--color-bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: 8, padding: '10px 10px 8px',
          zIndex: 400, boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              style={{
                padding: '3px 10px', borderRadius: 14, fontSize: '0.75rem', cursor: 'pointer',
                border: '1px solid',
                background: isSelected(opt.value) ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                borderColor: isSelected(opt.value) ? 'var(--color-accent)' : 'var(--border-color)',
                color: isSelected(opt.value) ? '#fff' : 'var(--color-text-primary)',
                fontWeight: isSelected(opt.value) ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
