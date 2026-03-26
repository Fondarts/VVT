import { describe, it, expect } from 'vitest';
import { validateAgainstPreset } from './validation';
import type { ScanResult, ValidationPreset } from '../shared/types';

const baseScan: ScanResult = {
  file: {
    name: 'test.mp4',
    path: '/test.mp4',
    extension: '.mp4',
    sizeBytes: 50_000_000,
    sizeFormatted: '50 MB',
    duration: 30,
    durationFormatted: '00:00:30',
    container: 'mp4',
    format: 'MPEG-4',
  },
  video: {
    codec: 'h264',
    width: 1920,
    height: 1080,
    frameRate: 25,
    frameRateFormatted: '25.000',
    bitRate: 10_000_000,
    bitRateFormatted: '10 Mbps',
    bitDepth: 8,
    colorSpace: 'bt709',
    chromaSubsampling: '4:2:0',
    scanType: 'Progressive',
  },
  audio: {
    codec: 'aac',
    sampleRate: 48000,
    channels: 2,
    channelLayout: 'stereo',
    bitRate: 192000,
    lufs: -23,
    truePeak: -1.5,
  },
  fastStart: { enabled: true, moovAt: 0 },
};

const basePreset: ValidationPreset = {
  id: 'test',
  name: 'Test Preset',
  description: 'Test',
  containerFormats: ['mp4', 'mov'],
  frameRates: [25],
  requireProgressive: true,
  chromaSubsampling: '4:2:0',
};

describe('validateAgainstPreset', () => {
  it('returns COMPLIANT when all checks pass', () => {
    const { result, checks } = validateAgainstPreset(baseScan, basePreset, []);
    expect(result).toBe('COMPLIANT');
    expect(checks.every(c => c.status === 'pass')).toBe(true);
  });

  it('returns warnings when container format mismatches', () => {
    const preset: ValidationPreset = { ...basePreset, containerFormats: ['mkv'] };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const containerCheck = checks.find(c => c.id === 'container-format');
    expect(containerCheck?.status).toBe('warn');
  });

  it('validates file extension when specified', () => {
    const preset: ValidationPreset = { ...basePreset, allowedFileExtensions: ['mov'] };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const extCheck = checks.find(c => c.id === 'file-extension');
    expect(extCheck).toBeDefined();
    expect(extCheck?.status).toBe('warn');
  });

  it('validates frame rate mismatch', () => {
    const preset: ValidationPreset = { ...basePreset, frameRates: [30] };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const fpsCheck = checks.find(c => c.id === 'frame-rate');
    expect(fpsCheck?.status).toBe('warn');
  });

  it('validates video codec', () => {
    const preset: ValidationPreset = { ...basePreset, allowedVideoCodecs: ['hevc'] };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const codecCheck = checks.find(c => c.id === 'video-codec');
    expect(codecCheck).toBeDefined();
    expect(codecCheck?.status).toBe('warn');
  });

  it('passes when video codec matches', () => {
    const preset: ValidationPreset = { ...basePreset, allowedVideoCodecs: ['h264', 'hevc'] };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const codecCheck = checks.find(c => c.id === 'video-codec');
    expect(codecCheck?.status).toBe('pass');
  });

  it('validates audio sample rate', () => {
    const preset: ValidationPreset = { ...basePreset, audioSampleRate: 44100 };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const srCheck = checks.find(c => c.id === 'audio-sample-rate');
    expect(srCheck?.status).toBe('warn');
  });

  it('validates loudness target', () => {
    const preset: ValidationPreset = { ...basePreset, loudnessTarget: -24, loudnessTolerance: 1 };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const loudCheck = checks.find(c => c.id === 'audio-lufs');
    expect(loudCheck).toBeDefined();
  });

  it('validates true peak max', () => {
    const preset: ValidationPreset = { ...basePreset, truePeakMax: -2 };
    const { checks } = validateAgainstPreset(baseScan, preset, []);
    const tpCheck = checks.find(c => c.id === 'audio-truepeak');
    expect(tpCheck).toBeDefined();
    expect(tpCheck?.status).toBe('fail'); // -1.5 > -2, exceeds limit
  });

  it('handles scan without audio gracefully', () => {
    const scanNoAudio: ScanResult = { ...baseScan, audio: undefined };
    const { result } = validateAgainstPreset(scanNoAudio, basePreset, []);
    expect(result).toBeDefined();
  });

  it('handles scan without video gracefully', () => {
    const scanNoVideo: ScanResult = { ...baseScan, video: undefined };
    const { result } = validateAgainstPreset(scanNoVideo, basePreset, []);
    expect(result).toBeDefined();
  });

  it('validates fast start requirement', () => {
    const preset: ValidationPreset = { ...basePreset, requireFastStart: true };
    const scanNoFastStart: ScanResult = { ...baseScan, fastStart: { enabled: false, moovAt: 999 } };
    const { checks } = validateAgainstPreset(scanNoFastStart, preset, []);
    const fsCheck = checks.find(c => c.id === 'fast-start');
    expect(fsCheck?.status).toBe('fail');
  });

  it('validates scan type fail for interlaced', () => {
    const scanInterlaced: ScanResult = {
      ...baseScan,
      video: { ...baseScan.video!, scanType: 'Interlaced' },
    };
    const { result } = validateAgainstPreset(scanInterlaced, basePreset, []);
    expect(result).toBe('NON-COMPLIANT');
  });
});
