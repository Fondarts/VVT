import type { 
  ScanResult, 
  ValidationCheck, 
  ValidationPreset,
  ContrastCheck,
} from '../../shared/types';

export const validateAgainstPreset = (
  scanResult: ScanResult,
  preset: ValidationPreset,
  contrastChecks: ContrastCheck[]
): { checks: ValidationCheck[], result: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS' } => {
  const checks: ValidationCheck[] = [];

  // Container checks
  checks.push({
    id: 'container-format',
    name: 'Container Format',
    category: 'container',
    status: preset.containerFormats.includes(scanResult.file.container.toLowerCase()) ? 'pass' : 'warn',
    message: `Container: ${scanResult.file.container.toUpperCase()}`,
    expected: preset.containerFormats.join(', ').toUpperCase(),
    detected: scanResult.file.container.toUpperCase(),
  });

  checks.push({
    id: 'fast-start',
    name: 'Fast Start (Moov Atom)',
    category: 'container',
    status: scanResult.fastStart.enabled ? 'pass' : 'fail',
    message: scanResult.fastStart.enabled 
      ? 'Moov atom optimized for streaming' 
      : 'Moov atom not at beginning of file',
    expected: 'Enabled',
    detected: scanResult.fastStart.enabled ? 'Enabled' : 'Disabled',
  });

  // Video checks
  checks.push({
    id: 'video-codec',
    name: 'Video Codec',
    category: 'video',
    status: preset.allowedVideoCodecs?.includes(scanResult.video.codec.toLowerCase()) ? 'pass' : 'warn',
    message: `Codec: ${scanResult.video.codec.toUpperCase()}`,
    expected: preset.allowedVideoCodecs?.map(c => c.toUpperCase()).join(', '),
    detected: scanResult.video.codec.toUpperCase(),
  });

  const isResolutionValid = preset.resolutions.some(r => 
    r.width === scanResult.video.width && r.height === scanResult.video.height
  );
  checks.push({
    id: 'resolution',
    name: 'Resolution',
    category: 'video',
    status: isResolutionValid ? 'pass' : 'warn',
    message: `${scanResult.video.width}x${scanResult.video.height}`,
    expected: preset.resolutions.map(r => `${r.width}x${r.height}`).join(', '),
    detected: `${scanResult.video.width}x${scanResult.video.height}`,
  });

  const isFrameRateValid = preset.frameRates.some(fr => 
    Math.abs(fr - scanResult.video.frameRate) < 0.1
  );
  checks.push({
    id: 'frame-rate',
    name: 'Frame Rate',
    category: 'video',
    status: isFrameRateValid ? 'pass' : 'warn',
    message: `${scanResult.video.frameRate.toFixed(3)} fps`,
    expected: preset.frameRates.join(', ') + ' fps',
    detected: `${scanResult.video.frameRate.toFixed(3)} fps`,
  });

  checks.push({
    id: 'scan-type',
    name: 'Scan Type',
    category: 'video',
    status: preset.requireProgressive && scanResult.video.scanType !== 'Progressive' ? 'fail' : 'pass',
    message: scanResult.video.scanType,
    expected: 'Progressive',
    detected: scanResult.video.scanType,
  });

  checks.push({
    id: 'chroma-subsampling',
    name: 'Chroma Subsampling',
    category: 'video',
    status: scanResult.video.chromaSubsampling === preset.chromaSubsampling ? 'pass' : 'warn',
    message: scanResult.video.chromaSubsampling,
    expected: preset.chromaSubsampling,
    detected: scanResult.video.chromaSubsampling,
  });

  // Audio checks
  if (scanResult.audio) {
    const lufsInRange = scanResult.audio.lufs >= -16 && scanResult.audio.lufs <= -14;
    checks.push({
      id: 'audio-lufs',
      name: 'Loudness (LUFS)',
      category: 'audio',
      status: lufsInRange ? 'pass' : 'warn',
      message: `Integrated: ${scanResult.audio.lufs} LUFS`,
      expected: '-16 to -14 LUFS',
      detected: `${scanResult.audio.lufs} LUFS`,
    });

    const tpInRange = scanResult.audio.truePeak <= -1.0;
    checks.push({
      id: 'audio-truepeak',
      name: 'True Peak',
      category: 'audio',
      status: tpInRange ? 'pass' : 'fail',
      message: `${scanResult.audio.truePeak} dBTP`,
      expected: '<= -1.0 dBTP',
      detected: `${scanResult.audio.truePeak} dBTP`,
    });

    checks.push({
      id: 'audio-codec',
      name: 'Audio Codec',
      category: 'audio',
      status: preset.allowedAudioCodecs?.includes(scanResult.audio.codec.toLowerCase()) ? 'pass' : 'warn',
      message: scanResult.audio.codec.toUpperCase(),
      expected: preset.allowedAudioCodecs?.map(c => c.toUpperCase()).join(', '),
      detected: scanResult.audio.codec.toUpperCase(),
    });
  }

  // Determine overall result
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  let result: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS';
  if (failCount > 0) {
    result = 'NON-COMPLIANT';
  } else if (warnCount > 0) {
    result = 'WARNINGS';
  } else {
    result = 'COMPLIANT';
  }

  return { checks, result };
};