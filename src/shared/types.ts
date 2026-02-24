export interface FileMetadata {
  name: string;
  path: string;
  extension: string;
  sizeBytes: number;
  sizeFormatted: string;
  duration: number;
  durationFormatted: string;
  container: string;
  format: string;
  mimeType?: string;
  hash?: string;
  width?: number;
  height?: number;
}

export interface VideoMetadata {
  codec: string;
  profile?: string;
  width: number;
  height: number;
  frameRate: number;
  frameRateFormatted: string;
  bitRate: number;
  bitRateFormatted: string;
  bitDepth?: number;
  colorSpace?: string;
  colorRange?: string;
  colorPrimaries?: string;
  colorTransfer?: string;
  chromaSubsampling: string;
  scanType: string;
}

export interface AudioMetadata {
  codec: string;
  sampleRate: number;
  channels: number;
  channelLayout: string;
  bitDepth?: number;
  lufs: number;
  truePeak: number;
}

export interface FastStartInfo {
  enabled: boolean;
  moovAt: number;
}

export interface ScanResult {
  file: FileMetadata;
  video: VideoMetadata;
  audio?: AudioMetadata;
  fastStart: FastStartInfo;
}

export interface ValidationCheck {
  id: string;
  name: string;
  category: 'container' | 'video' | 'audio';
  status: 'pass' | 'warn' | 'fail';
  message: string;
  detected: string;
  expected?: string;
}

export interface ContrastCheck {
  id: string;
  timestamp: number;
  textColor: string;
  backgroundColor: string;
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  thumbnailPath: string;
}

export interface ResolutionPreset {
  width: number;
  height: number;
  label: string;
}

export interface ValidationPreset {
  id: string;
  name: string;
  description: string;
  containerFormats: string[];
  allowedVideoCodecs?: string[];
  videoCodecs?: string[];
  allowedAudioCodecs?: string[];
  audioCodec?: string;
  resolutions?: ResolutionPreset[];
  minDimensions?: { width: number; height: number };
  maxDimensions?: { width: number; height: number };
  frameRates: number[];
  requireProgressive: boolean;
  chromaSubsampling: string;
  bitDepth?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  minBitrate?: number;
  maxBitrate?: number;
  maxBitrateMbps?: number;
  requireFastStart?: boolean;
  loudnessTarget?: number;
  loudnessTolerance?: number;
  truePeakMax?: number;
}

export interface OverlayPreset {
  id: string;
  name: string;
  aspectRatio: string;
  width?: number;
  height?: number;
  safeTitlePercent?: number;
  safeActionPercent?: number;
  ratioValue?: number;
  safeTitleMargin?: number;
  safeActionMargin?: number;
  description?: string;
  imagePath?: string;   // filename inside Safezones/ folder
  group?: string;       // for dropdown grouping
}

export interface TranscriptionSegment {
  from: number;  // ms
  to: number;    // ms
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  language?: string;
}

export interface ValidationReport {
  timestamp: string;
  presetUsed: string;
  result: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS';
  file: FileMetadata;
  detected: ScanResult;
  checks: ValidationCheck[];
  contrastChecks: ContrastCheck[];
  thumbnails: string[];
  audioWaveform: number[];
  outputFolder: string;
  transcription?: TranscriptionResult;
}

// FFprobe internal types
export interface FFprobeOutput {
  streams: Array<{
    index: number;
    codec_type: string;
    codec_name?: string;
    codec_tag_string?: string;
    profile?: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    coded_width?: number;
    coded_height?: number;
    display_aspect_ratio?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    time_base?: string;
    bits_per_raw_sample?: string;
    color_range?: string;
    color_space?: string;
    color_transfer?: string;
    color_primaries?: string;
    chroma_location?: string;
    field_order?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    sample_fmt?: string;
    bit_rate?: string;
  }>;
  format: {
    filename: string;
    nb_streams: number;
    nb_programs: number;
    format_name: string;
    format_long_name?: string;
    start_time?: string;
    duration?: string;
    size: string;
    bit_rate?: string;
    probe_score?: number;
    tags?: Record<string, string>;
  };
}

export interface AudioLoudness {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  output_i: number;
  output_tp: number;
  output_lra: number;
  output_thresh: number;
  target_offset: number;
}