import type {
  ScanResult,
  ValidationCheck,
  ValidationPreset,
  ContrastCheck,
} from '../shared/types';

export const validateAgainstPreset = (
  scanResult: ScanResult,
  preset: ValidationPreset,
  contrastChecks: ContrastCheck[]
): { checks: ValidationCheck[], result: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS' } => {
  const checks: ValidationCheck[] = [];

  // ── Container ─────────────────────────────────────────────────────
  checks.push({
    id: 'container-format',
    name: 'Container Format',
    category: 'container',
    status: preset.containerFormats.includes(scanResult.file.container.toLowerCase()) ? 'pass' : 'warn',
    message: `Container: ${scanResult.file.container.toUpperCase()}`,
    expected: preset.containerFormats.join(', ').toUpperCase(),
    detected: scanResult.file.container.toUpperCase(),
  });

  if (preset.allowedFileExtensions?.length) {
    const ext = scanResult.file.extension.toLowerCase().replace(/^\./, '');
    checks.push({
      id: 'file-extension',
      name: 'File Extension',
      category: 'container',
      status: preset.allowedFileExtensions.map(e => e.toLowerCase().replace(/^\./, '')).includes(ext) ? 'pass' : 'warn',
      message: `.${ext}`,
      expected: preset.allowedFileExtensions.join(', '),
      detected: `.${ext}`,
    });
  }

  if (preset.requireFastStart !== undefined) {
    checks.push({
      id: 'fast-start',
      name: 'Fast Start (Moov Atom)',
      category: 'container',
      status: preset.requireFastStart
        ? (scanResult.fastStart.enabled ? 'pass' : 'fail')
        : 'pass',
      message: scanResult.fastStart.enabled
        ? 'Moov atom optimized for streaming'
        : 'Moov atom not at beginning of file',
      expected: preset.requireFastStart ? 'Enabled' : 'Any',
      detected: scanResult.fastStart.enabled ? 'Enabled' : 'Disabled',
    });
  }

  if (preset.maxFileSizeMb) {
    const sizeMb = scanResult.file.sizeBytes / (1024 * 1024);
    checks.push({
      id: 'file-size',
      name: 'File Size',
      category: 'container',
      status: sizeMb <= preset.maxFileSizeMb ? 'pass' : 'fail',
      message: `${sizeMb.toFixed(1)} MB`,
      expected: `≤ ${preset.maxFileSizeMb} MB`,
      detected: `${sizeMb.toFixed(1)} MB`,
    });
  }

  // ── Video ──────────────────────────────────────────────────────────
  const allowedCodecs = preset.allowedVideoCodecs ?? preset.videoCodecs ?? [];
  if (allowedCodecs.length > 0) {
    checks.push({
      id: 'video-codec',
      name: 'Video Codec',
      category: 'video',
      status: allowedCodecs.includes(scanResult.video.codec.toLowerCase()) ? 'pass' : 'warn',
      message: `Codec: ${scanResult.video.codec.toUpperCase()}`,
      expected: allowedCodecs.map(c => c.toUpperCase()).join(', '),
      detected: scanResult.video.codec.toUpperCase(),
    });
  }

  if (preset.resolutions && preset.resolutions.length > 0) {
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
  } else if (preset.minDimensions || preset.maxDimensions) {
    const { width, height } = scanResult.video;
    const minOk = !preset.minDimensions || (width >= preset.minDimensions.width && height >= preset.minDimensions.height);
    const maxOk = !preset.maxDimensions || (width <= preset.maxDimensions.width && height <= preset.maxDimensions.height);
    checks.push({
      id: 'resolution',
      name: 'Resolution',
      category: 'video',
      status: minOk && maxOk ? 'pass' : 'warn',
      message: `${width}x${height}`,
      expected: [
        preset.minDimensions ? `min ${preset.minDimensions.width}x${preset.minDimensions.height}` : '',
        preset.maxDimensions ? `max ${preset.maxDimensions.width}x${preset.maxDimensions.height}` : '',
      ].filter(Boolean).join(', '),
      detected: `${width}x${height}`,
    });
  }

  if (preset.aspectRatios?.length) {
    const w = scanResult.video.width, h = scanResult.video.height;
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const g = gcd(w, h);
    const detected = `${w / g}:${h / g}`;
    const pass = preset.aspectRatios.some(ar => {
      const [aw, ah] = ar.split(':').map(Number);
      return aw && ah && Math.abs(w / h - aw / ah) < 0.02;
    });
    checks.push({
      id: 'aspect-ratio',
      name: 'Aspect Ratio',
      category: 'video',
      status: pass ? 'pass' : 'warn',
      message: `${w}x${h} (${detected})`,
      expected: preset.aspectRatios.join(', '),
      detected,
    });
  }

  if (preset.frameRates.length > 0) {
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
  }

  if (preset.requireProgressive) {
    checks.push({
      id: 'scan-type',
      name: 'Scan Type',
      category: 'video',
      status: scanResult.video.scanType === 'Progressive' ? 'pass' : 'fail',
      message: scanResult.video.scanType,
      expected: 'Progressive',
      detected: scanResult.video.scanType,
    });
  }

  const chromaList = preset.chromaSubsamplings ?? (preset.chromaSubsampling ? [preset.chromaSubsampling] : []);
  if (chromaList.length) {
    const detected = scanResult.video.chromaSubsampling;
    checks.push({
      id: 'chroma-subsampling',
      name: 'Chroma Subsampling',
      category: 'video',
      status: chromaList.includes(detected) ? 'pass' : 'warn',
      message: detected,
      expected: chromaList.join(', '),
      detected,
    });
  }

  if (preset.bitDepth !== undefined && scanResult.video.bitDepth !== undefined) {
    checks.push({
      id: 'bit-depth',
      name: 'Video Bit Depth',
      category: 'video',
      status: scanResult.video.bitDepth >= preset.bitDepth ? 'pass' : 'warn',
      message: `${scanResult.video.bitDepth}-bit`,
      expected: `≥ ${preset.bitDepth}-bit`,
      detected: `${scanResult.video.bitDepth}-bit`,
    });
  }

  if (preset.allowedColorSpaces?.length && scanResult.video.colorSpace) {
    const detected = scanResult.video.colorSpace;
    checks.push({
      id: 'color-space',
      name: 'Video Color Space',
      category: 'video',
      status: preset.allowedColorSpaces.map(s => s.toLowerCase()).includes(detected.toLowerCase()) ? 'pass' : 'warn',
      message: detected,
      expected: preset.allowedColorSpaces.join(', '),
      detected,
    });
  }

  const duration = scanResult.file.duration;
  if (preset.minDurationSeconds !== undefined || preset.maxDurationSeconds !== undefined) {
    const minOk = preset.minDurationSeconds === undefined || duration >= preset.minDurationSeconds;
    const maxOk = preset.maxDurationSeconds === undefined || duration <= preset.maxDurationSeconds;
    const expParts: string[] = [];
    if (preset.minDurationSeconds !== undefined) expParts.push(`≥ ${preset.minDurationSeconds}s`);
    if (preset.maxDurationSeconds !== undefined) expParts.push(`≤ ${preset.maxDurationSeconds}s`);
    checks.push({
      id: 'duration',
      name: 'Video Duration',
      category: 'video',
      status: minOk && maxOk ? 'pass' : 'warn',
      message: `${duration.toFixed(1)}s`,
      expected: expParts.join(', '),
      detected: `${duration.toFixed(1)}s`,
    });
  }

  const bitrateMbps = scanResult.video.bitRate / 1_000_000;
  if (preset.maxBitrateMbps || preset.maxBitrate) {
    const maxMbps = preset.maxBitrateMbps ?? (preset.maxBitrate ? preset.maxBitrate / 1_000_000 : undefined);
    if (maxMbps) {
      checks.push({
        id: 'max-bitrate',
        name: 'Max Bitrate',
        category: 'video',
        status: bitrateMbps <= maxMbps ? 'pass' : 'fail',
        message: `${bitrateMbps.toFixed(2)} Mbps`,
        expected: `≤ ${maxMbps} Mbps`,
        detected: `${bitrateMbps.toFixed(2)} Mbps`,
      });
    }
  }
  if (preset.minBitrateMbps || preset.minBitrate) {
    const minMbps = preset.minBitrateMbps ?? (preset.minBitrate ? preset.minBitrate / 1_000_000 : undefined);
    if (minMbps) {
      checks.push({
        id: 'min-bitrate',
        name: 'Min Bitrate',
        category: 'video',
        status: bitrateMbps >= minMbps ? 'pass' : 'warn',
        message: `${bitrateMbps.toFixed(2)} Mbps`,
        expected: `≥ ${minMbps} Mbps`,
        detected: `${bitrateMbps.toFixed(2)} Mbps`,
      });
    }
  }

  // ── Audio ──────────────────────────────────────────────────────────
  if (scanResult.audio) {
    const audio = scanResult.audio;

    if (preset.loudnessMin !== undefined || preset.loudnessMax !== undefined) {
      const minOk = preset.loudnessMin === undefined || audio.lufs >= preset.loudnessMin;
      const maxOk = preset.loudnessMax === undefined || audio.lufs <= preset.loudnessMax;
      const expParts: string[] = [];
      if (preset.loudnessMin !== undefined) expParts.push(`≥ ${preset.loudnessMin}`);
      if (preset.loudnessMax !== undefined) expParts.push(`≤ ${preset.loudnessMax}`);
      checks.push({
        id: 'audio-lufs',
        name: 'Loudness (LUFS)',
        category: 'audio',
        status: minOk && maxOk ? 'pass' : 'warn',
        message: `${audio.lufs.toFixed(1)} LUFS`,
        expected: expParts.join(', ') + ' LUFS',
        detected: `${audio.lufs.toFixed(1)} LUFS`,
      });
    } else if (preset.loudnessTarget !== undefined) {
      const tolerance = preset.loudnessTolerance ?? 1;
      const lufsInRange = Math.abs(audio.lufs - preset.loudnessTarget) <= tolerance;
      checks.push({
        id: 'audio-lufs',
        name: 'Loudness (LUFS)',
        category: 'audio',
        status: lufsInRange ? 'pass' : 'warn',
        message: `${audio.lufs.toFixed(1)} LUFS`,
        expected: `${preset.loudnessTarget} ±${tolerance} LUFS`,
        detected: `${audio.lufs.toFixed(1)} LUFS`,
      });
    }

    if (preset.truePeakMax !== undefined) {
      checks.push({
        id: 'audio-truepeak',
        name: 'True Peak',
        category: 'audio',
        status: audio.truePeak <= preset.truePeakMax ? 'pass' : 'fail',
        message: `${audio.truePeak.toFixed(1)} dBTP`,
        expected: `≤ ${preset.truePeakMax} dBTP`,
        detected: `${audio.truePeak.toFixed(1)} dBTP`,
      });
    }

    const allowedAudio = preset.allowedAudioCodecs ?? (preset.audioCodec ? [preset.audioCodec] : []);
    if (allowedAudio.length > 0) {
      checks.push({
        id: 'audio-codec',
        name: 'Audio Codec',
        category: 'audio',
        status: allowedAudio.includes(audio.codec.toLowerCase()) ? 'pass' : 'warn',
        message: audio.codec.toUpperCase(),
        expected: allowedAudio.map(c => c.toUpperCase()).join(', '),
        detected: audio.codec.toUpperCase(),
      });
    }

    const srList = preset.allowedAudioSampleRates ?? (preset.audioSampleRate ? [preset.audioSampleRate] : []);
    if (srList.length) {
      checks.push({
        id: 'audio-sample-rate',
        name: 'Sample Rate',
        category: 'audio',
        status: srList.includes(audio.sampleRate) ? 'pass' : 'warn',
        message: `${audio.sampleRate} Hz`,
        expected: srList.map(r => `${r} Hz`).join(', '),
        detected: `${audio.sampleRate} Hz`,
      });
    }

    const chanList = preset.allowedAudioChannels ?? (preset.audioChannels ? [preset.audioChannels] : []);
    if (chanList.length) {
      checks.push({
        id: 'audio-channels',
        name: 'Audio Channels',
        category: 'audio',
        status: chanList.includes(audio.channels) ? 'pass' : 'warn',
        message: `${audio.channels} (${audio.channelLayout})`,
        expected: chanList.join(', '),
        detected: `${audio.channels}`,
      });
    }

    if (preset.minAudioKbps && audio.bitRate !== undefined) {
      const kbps = audio.bitRate / 1000;
      checks.push({
        id: 'audio-bitrate',
        name: 'Audio Bit Rate',
        category: 'audio',
        status: kbps >= preset.minAudioKbps ? 'pass' : 'warn',
        message: `${kbps.toFixed(0)} kbps`,
        expected: `≥ ${preset.minAudioKbps} kbps`,
        detected: `${kbps.toFixed(0)} kbps`,
      });
    }
  }

  // ── Contrast ───────────────────────────────────────────────────────
  if (contrastChecks.length > 0) {
    const failingContrast = contrastChecks.filter(c => !c.aaNormal);
    checks.push({
      id: 'contrast-wcag',
      name: 'Contrast (WCAG AA)',
      category: 'video',
      status: failingContrast.length === 0 ? 'pass' : 'warn',
      message: `${contrastChecks.length - failingContrast.length}/${contrastChecks.length} checks passed`,
      expected: 'Ratio ≥ 4.5:1',
      detected: `${contrastChecks.length - failingContrast.length}/${contrastChecks.length} pass`,
    });
  }

  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  let result: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS';
  if (failCount > 0) result = 'NON-COMPLIANT';
  else if (warnCount > 0) result = 'WARNINGS';
  else result = 'COMPLIANT';

  return { checks, result };
};
