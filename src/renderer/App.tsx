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
  containerFormats: string;
  videoCodecs: string;
  chromaSubsampling: string;
  frameRates: string;
  requireProgressive: boolean;
  requireFastStart: boolean;
  loudnessTarget: string;
  loudnessTolerance: string;
  truePeakMax: string;
}

const defaultForm: CustomPresetForm = {
  name: '',
  containerFormats: 'mp4, mov',
  videoCodecs: 'h264, hevc',
  chromaSubsampling: '4:2:0',
  frameRates: '23.976, 24, 25, 29.97, 30, 50, 59.94, 60',
  requireProgressive: true,
  requireFastStart: false,
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

    const newPreset: ValidationPreset = {
      id: `custom-${Date.now()}`,
      name: customForm.name.trim(),
      description: 'Custom preset',
      containerFormats: customForm.containerFormats.split(',').map(s => s.trim()).filter(Boolean),
      videoCodecs: customForm.videoCodecs.split(',').map(s => s.trim()).filter(Boolean),
      frameRates: customForm.frameRates.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
      requireProgressive: customForm.requireProgressive,
      chromaSubsampling: customForm.chromaSubsampling,
      requireFastStart: customForm.requireFastStart,
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
                filePath={filePath!}
                videoWidth={scanResult.video.width}
                videoHeight={scanResult.video.height}
                frameRate={scanResult.video.frameRate}
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
                onSeek={_ms => {/* seek handled by VideoPlayer ref if needed */}}
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
              width: '480px',
              maxHeight: '80vh',
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

              <ModalField label="Container formats" hint="comma-separated: mp4, mov">
                <input
                  className="input"
                  type="text"
                  value={customForm.containerFormats}
                  onChange={e => updateForm('containerFormats', e.target.value)}
                  style={{ width: '100%' }}
                />
              </ModalField>

              <ModalField label="Video codecs" hint="comma-separated: h264, hevc">
                <input
                  className="input"
                  type="text"
                  value={customForm.videoCodecs}
                  onChange={e => updateForm('videoCodecs', e.target.value)}
                  style={{ width: '100%' }}
                />
              </ModalField>

              <ModalField label="Chroma subsampling">
                <select
                  className="select"
                  value={customForm.chromaSubsampling}
                  onChange={e => updateForm('chromaSubsampling', e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="4:2:0">4:2:0</option>
                  <option value="4:2:2">4:2:2</option>
                  <option value="4:4:4">4:4:4</option>
                </select>
              </ModalField>

              <ModalField label="Frame rates" hint="comma-separated: 24, 25, 29.97, 30">
                <input
                  className="input"
                  type="text"
                  value={customForm.frameRates}
                  onChange={e => updateForm('frameRates', e.target.value)}
                  style={{ width: '100%' }}
                />
              </ModalField>

              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={customForm.requireProgressive}
                    onChange={e => updateForm('requireProgressive', e.target.checked)}
                  />
                  Require progressive
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={customForm.requireFastStart}
                    onChange={e => updateForm('requireFastStart', e.target.checked)}
                  />
                  Require fast start
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <ModalField label="Loudness target" hint="LUFS">
                  <input
                    className="input"
                    type="number"
                    value={customForm.loudnessTarget}
                    onChange={e => updateForm('loudnessTarget', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </ModalField>
                <ModalField label="Tolerance" hint="±LUFS">
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    value={customForm.loudnessTolerance}
                    onChange={e => updateForm('loudnessTolerance', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </ModalField>
                <ModalField label="True peak max" hint="dBTP">
                  <input
                    className="input"
                    type="number"
                    value={customForm.truePeakMax}
                    onChange={e => updateForm('truePeakMax', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </ModalField>
              </div>
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

// Small helper for modal form fields
const ModalField: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
      {label}
      {hint && <span style={{ marginLeft: '6px', fontStyle: 'italic' }}>({hint})</span>}
    </label>
    {children}
  </div>
);

export default App;
