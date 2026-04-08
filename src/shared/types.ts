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
  creationDate?: string;
  formatProfile?: string;
}

export interface VideoMetadata {
  codec: string;
  format?: string;
  formatVersion?: string;
  codecId?: string;
  profile?: string;
  displayAspectRatio?: string;
  frameRateMode?: string;
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
  bitRate?: number;
  lufs: number;
  truePeak: number;
  compressionMode?: string;
}

export interface FastStartInfo {
  enabled: boolean;
  moovAt: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  aspectRatio: string;
}

export interface ScanResult {
  file: FileMetadata;
  video?: VideoMetadata;
  audio?: AudioMetadata;
  fastStart: FastStartInfo;
  image?: ImageMetadata;
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
  frameRates: number[];
  requireProgressive: boolean;
  chromaSubsampling: string;

  // Video
  allowedVideoCodecs?: string[];
  resolutions?: ResolutionPreset[];
  minDimensions?: { width: number; height: number };
  maxDimensions?: { width: number; height: number };
  bitDepth?: number;
  maxBitrateMbps?: number;
  minBitrateMbps?: number;
  chromaSubsamplings?: string[];
  allowedColorSpaces?: string[];
  aspectRatios?: string[];
  maxDurationSeconds?: number;
  minDurationSeconds?: number;
  requireFastStart?: boolean;
  allowedFileExtensions?: string[];
  maxFileSizeMb?: number;

  // Audio
  allowedAudioCodecs?: string[];
  allowedAudioSampleRates?: number[];
  allowedAudioChannels?: number[];
  audioSampleRate?: number;
  audioChannels?: number;
  loudnessTarget?: number;
  loudnessTolerance?: number;
  loudnessMin?: number;
  loudnessMax?: number;
  truePeakMax?: number;
  minAudioKbps?: number;
  audioBitDepth?: number;
  bitrateMode?: 'cbr' | 'vbr';

  /** @deprecated Use allowedVideoCodecs instead */
  videoCodecs?: string[];
  /** @deprecated Use allowedAudioCodecs instead */
  audioCodec?: string;
  /** @deprecated Use maxBitrateMbps instead (value in bps) */
  minBitrate?: number;
  /** @deprecated Use maxBitrateMbps instead (value in bps) */
  maxBitrate?: number;
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
  imagePath?: string;
  group?: string;
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

export interface SubtitleStyle {
  maxCharsPerLine: number;
  maxLines: number;            // 1, 2, 3
  position: 'top' | 'center' | 'bottom';
  fontFamily: string;
  fontSize: number;            // px relative to 1080p
  color: string;               // hex
  strokeColor: string;         // hex
  strokeWidth: number;         // px
  showBackground: boolean;
  backgroundColor: string;     // rgba string
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

// ── Batch Mode ───────────────────────────────────────────────────────────────

export type BatchItemStatus = 'pending' | 'scanning' | 'done' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  status: BatchItemStatus;
  progress: number;
  statusLabel: string;
  previewThumb: string | null;
  scanResult: ScanResult | null;
  checks: ValidationCheck[];
  validationResult: 'COMPLIANT' | 'NON-COMPLIANT' | 'WARNINGS' | null;
  thumbnails: string[];
  waveformData: number[];
  videoSrc: string | null;
  error: string | null;
  contrastChecks: ContrastCheck[];
  transcription: TranscriptionResult | null;
}

export interface AnnotationPoint {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
}

export interface AnnotationStroke {
  type: 'path' | 'text' | 'eraser';
  color: string;
  lineWidth?: number;         // pixels in draw tool units
  points?: AnnotationPoint[]; // for type 'path'
  text?: string;              // for type 'text'
  x?: number;                 // text position, normalized 0-1
  y?: number;
  fontSize?: number;          // normalized (fraction of height)
}

export interface FeedbackReply {
  author: string;
  authorPhoto?: string;
  text: string;
  createdAt: string;         // ISO date string
}

export interface FeedbackComment {
  id: string;
  fileKey: string;
  timecode: number;          // seconds (start)
  timecodeEnd?: number;      // seconds (end) — undefined means single frame
  author: string;
  text: string;
  createdAt: string;         // ISO date string
  resolved: boolean;
  annotationStrokes?: AnnotationStroke[];
  replies?: FeedbackReply[];
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

// ── Project Dashboard ────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface ProjectMember {
  uid: string;
  email: string;
  displayName: string;
  role: MemberRole;
}

export interface Project {
  id: string;
  name: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  members: Record<string, MemberRole>;   // uid → role
  memberUids: string[];                   // for Firestore array-contains query
  memberEmails: string[];                 // for invite lookup
}

export interface ProjectFolder {
  id: string;
  projectId: string;
  path: string;
  name: string;
  parentPath: string;
  createdAt: string;
  /** Google Drive folder ID — used for auto-sync of new files */
  driveFolderId?: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  parentPath: string;
  name: string;
  baseName: string;
  versionTag: string | null;
  versionNumber: number;
  type: 'video' | 'image' | 'audio';
  extension: string;
  sizeBytes: number;
  scanResult: ScanResult | null;
  addedBy: string;
  addedByName: string;
  addedAt: string;
  /** Google Drive file ID (set at drop time via Drive API search) */
  driveFileId?: string;
  /** Metadata from Google Drive */
  driveCreatedTime?: string;
  driveWidth?: number;
  driveHeight?: number;
  driveDurationMs?: number;
}

export interface VersionGroup {
  baseName: string;
  latest: ProjectFile;
  versions: ProjectFile[];
}

export type ProjectNavLocation =
  | { view: 'dashboard' }
  | { view: 'project'; projectId: string; path: string };

// ── Share Links ──────────────────────────────────────────────────────────────

export interface ShareLink {
  id: string;             // = the token (nanoid-style)
  projectId: string;
  fileId: string;         // projectFiles doc ID
  driveFileId: string;
  fileName: string;
  mode: 'presentation' | 'internal';
  createdBy: string;      // uid
  createdByName: string;
  createdAt: string;      // ISO
  expiresAt: string | null;
  disabled: boolean;
  accessCount: number;
}
