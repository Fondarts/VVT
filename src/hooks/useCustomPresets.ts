import { useState, useEffect } from 'react';
import type { ValidationPreset, ResolutionPreset } from '../shared/types';
import { validationPresets } from '../shared/presets';
import { makeDefaultRules, defaultForm } from '../shared/presetRules';
import type { RuleState, CustomPresetForm } from '../shared/presetRules';

export interface UseCustomPresetsReturn {
  customPresets: ValidationPreset[];
  allPresets: ValidationPreset[];
  selectedPreset: string;
  setSelectedPreset: (id: string) => void;
  showCustomModal: boolean;
  setShowCustomModal: (v: boolean) => void;
  customForm: CustomPresetForm;
  setCustomForm: React.Dispatch<React.SetStateAction<CustomPresetForm>>;
  editingPresetId: string | null;
  setEditingPresetId: (id: string | null) => void;
  overwriteTarget: ValidationPreset | null;
  setOverwriteTarget: (v: ValidationPreset | null) => void;
  handlePresetChange: (value: string) => void;
  saveCustomPreset: () => void;
  doSave: (presetId: string) => void;
  deleteCustomPreset: (id: string) => void;
  openEditPreset: (id: string) => void;
  updateRule: (rId: string, state: RuleState) => void;
  presetToRules: (preset: ValidationPreset) => Record<string, RuleState>;
}

export function useCustomPresets(): UseCustomPresetsReturn {
  const [customPresets, setCustomPresets] = useState<ValidationPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('customPresets') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('customPresets', JSON.stringify(customPresets));
    } catch (e) {
      console.warn('Failed to save presets to localStorage:', e);
    }
  }, [customPresets]);

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState<CustomPresetForm>(defaultForm);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<ValidationPreset | null>(null);

  const overriddenIds = new Set(customPresets.map(p => p.id));
  const allPresets = [
    ...validationPresets.filter(p => !overriddenIds.has(p.id)),
    ...customPresets,
  ];

  const [selectedPreset, setSelectedPreset] = useState<string>('');

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

    if (editingPresetId) {
      const current = allPresets.find(p => p.id === editingPresetId);
      if (current) { setOverwriteTarget(current); return; }
    }

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

  return {
    customPresets,
    allPresets,
    selectedPreset,
    setSelectedPreset,
    showCustomModal,
    setShowCustomModal,
    customForm,
    setCustomForm,
    editingPresetId,
    setEditingPresetId,
    overwriteTarget,
    setOverwriteTarget,
    handlePresetChange,
    saveCustomPreset,
    doSave,
    deleteCustomPreset,
    openEditPreset,
    updateRule,
    presetToRules,
  };
}
