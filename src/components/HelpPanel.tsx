import React, { useState } from 'react';
import { X, ChevronDown, ChevronRight, Zap, ScanLine, Settings, MessageCircle, FolderOpen, Share2, Layers, Film, Subtitles, Keyboard, HardDrive, MonitorDown, BookOpen } from 'lucide-react';

interface HelpSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: HelpSection[] = [
  {
    id: 'quickstart',
    icon: <Zap size={15} />,
    title: 'Quick start',
    content: (
      <>
        <p>Kissd Review has three main modes:</p>
        <ul>
          <li><strong>Single</strong> — Analyze a single video or image file. Drag & drop or click "Select File", then hit "Scan File" to run a full analysis.</li>
          <li><strong>Batch</strong> — Drop multiple files to scan them all at once. Results are shown in a grid with a detail panel.</li>
          <li><strong>Projects</strong> — Organize files into projects with folder structures, version management, and team collaboration.</li>
        </ul>
        <p>All processing happens locally in your browser — files are never uploaded to any server. You can also connect Google Drive to stream files directly and sync projects with your team.</p>
      </>
    ),
  },
  {
    id: 'scanning',
    icon: <ScanLine size={15} />,
    title: 'File scanning',
    content: (
      <>
        <p>When you scan a file, Kissd analyzes:</p>
        <ul>
          <li><strong>Container</strong> — Format, duration, file size, fast-start (moov atom position)</li>
          <li><strong>Video</strong> — Codec, profile, resolution, frame rate, bit rate, color space, chroma subsampling, scan type</li>
          <li><strong>Audio</strong> — Codec, sample rate, channels, bit rate, integrated loudness (LUFS), true peak (dBTP)</li>
        </ul>
        <p>Scanning uses FFmpeg compiled to WebAssembly — it runs entirely in your browser.</p>
        <p><strong>Supported formats:</strong> MP4, MOV, MKV, WebM, AVI, MXF, M2TS, ProRes, DNxHD/HR, MPEG-2, H.264, H.265, and more.</p>
      </>
    ),
  },
  {
    id: 'presets',
    icon: <Settings size={15} />,
    title: 'Validation presets',
    content: (
      <>
        <p>Presets define technical specifications that your files should meet. After scanning, select a preset to check compliance.</p>
        <ul>
          <li><strong>Built-in presets</strong> — Pre-configured specs for platforms like Innovid, AudienceXpress, etc.</li>
          <li><strong>Custom presets</strong> — Create your own spec sets via "Add custom preset" in the preset dropdown.</li>
          <li><strong>Editing</strong> — You can modify built-in presets. Changes are saved as overrides and can be reset to defaults.</li>
        </ul>
        <p>Each check shows pass (green), warning (yellow), or fail (red) status with detected vs. expected values.</p>
      </>
    ),
  },
  {
    id: 'feedback',
    icon: <MessageCircle size={15} />,
    title: 'Feedback & annotations',
    content: (
      <>
        <p>The Feedback tab lets you leave time-stamped comments and draw annotations on video frames.</p>
        <ul>
          <li><strong>Comments</strong> — Click anywhere on the timeline or use the current timecode to pin a comment. You can also select a range.</li>
          <li><strong>Annotations</strong> — Use the draw tool (pencil icon) to mark up frames. Colors and line width are customizable.</li>
          <li><strong>Resolve</strong> — Mark comments as resolved when feedback has been addressed.</li>
          <li><strong>Replies</strong> — Thread replies under any comment for discussion.</li>
        </ul>
        <p>Feedback is stored per-file and synced in real-time for all collaborators.</p>
      </>
    ),
  },
  {
    id: 'projects',
    icon: <FolderOpen size={15} />,
    title: 'Projects',
    content: (
      <>
        <p>Projects let you organize files, manage versions, and collaborate with your team.</p>
        <ul>
          <li><strong>Create a project</strong> — Click "New Project" in the Projects dashboard.</li>
          <li><strong>Upload files</strong> — Drag & drop files or folders into a project. Recursive folder upload is supported.</li>
          <li><strong>Folders</strong> — Create subfolders to organize your files.</li>
          <li><strong>Versions</strong> — Files with version tags (e.g., V01, V02) are automatically grouped. You can also drag files to merge version groups.</li>
          <li><strong>Team</strong> — Add team members with owner, editor, or viewer roles via Project Settings.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing',
    icon: <Share2 size={15} />,
    title: 'Share links',
    content: (
      <>
        <p>Generate shareable links for files so external stakeholders can review without signing in.</p>
        <ul>
          <li><strong>Presentation mode</strong> — Clean player view for client review. Hides technical specs.</li>
          <li><strong>Internal mode</strong> — Full view including specs, feedback, and tools.</li>
          <li><strong>Expiration</strong> — Set an optional expiry date on share links.</li>
          <li><strong>Revoke</strong> — Disable any share link at any time.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'batch',
    icon: <Layers size={15} />,
    title: 'Batch processing',
    content: (
      <>
        <p>Batch mode lets you scan multiple files at once.</p>
        <ul>
          <li>Drop or select multiple video files</li>
          <li>Click "Scan All" to process them (up to 2 simultaneously)</li>
          <li>Click on any file card to see its full analysis in the detail panel</li>
          <li>Export individual PDF reports from the detail panel</li>
        </ul>
      </>
    ),
  },
  {
    id: 'timeline',
    icon: <Film size={15} />,
    title: 'Timeline editor',
    content: (
      <>
        <p>The timeline editor (in the Tools tab) lets you build a simple edit sequence:</p>
        <ul>
          <li><strong>Video blocks</strong> — Segments from the scanned file</li>
          <li><strong>Slate blocks</strong> — Custom slate images (create from template or upload)</li>
          <li><strong>Black blocks</strong> — Black frames of configurable duration</li>
          <li><strong>Bip blocks</strong> — Audio tone markers</li>
        </ul>
        <p>You can preview the full sequence and export it as a video file.</p>
      </>
    ),
  },
  {
    id: 'transcription',
    icon: <Subtitles size={15} />,
    title: 'Transcription',
    content: (
      <>
        <p>Kissd includes on-device speech-to-text powered by OpenAI Whisper.</p>
        <ul>
          <li>Transcription runs entirely in your browser (no external API calls)</li>
          <li>Click on any segment to seek to that point in the video</li>
          <li>Edit individual segments inline</li>
          <li>Customize subtitle appearance (font, size, position, background)</li>
          <li>Export as SRT file</li>
        </ul>
        <p>The first run downloads the model (~75 MB). It's cached for subsequent uses.</p>
      </>
    ),
  },
  {
    id: 'shortcuts',
    icon: <Keyboard size={15} />,
    title: 'Keyboard shortcuts',
    content: (
      <table style={{ width: '100%', fontSize: '0.78rem' }}>
        <tbody>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>Space</td><td>Play / Pause</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>Left / Right</td><td>Seek -5s / +5s</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>, / .</td><td>Previous / next frame</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>F</td><td>Toggle fullscreen</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>M</td><td>Toggle mute</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>P</td><td>Take screenshot</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>G</td><td>Toggle safe-zone grid</td></tr>
          <tr><td style={{ padding: '3px 8px', fontWeight: 600 }}>Home / End</td><td>Go to start / end</td></tr>
        </tbody>
      </table>
    ),
  },
  {
    id: 'drive',
    icon: <HardDrive size={15} />,
    title: 'Google Drive',
    content: (
      <>
        <p>Connect your Google Drive to stream files directly without downloading them first.</p>
        <ul>
          <li>Click the "Drive" button in the header to connect</li>
          <li>Files in projects linked to Drive folders sync automatically</li>
          <li>Video streaming uses a local proxy for range-request seeking</li>
          <li>Files are cached locally (OPFS) after first access for faster reopening</li>
        </ul>
      </>
    ),
  },
  {
    id: 'helper',
    icon: <MonitorDown size={15} />,
    title: 'Native helper app',
    content: (
      <>
        <p>Kissd Helper is a companion desktop app for native codec support.</p>
        <ul>
          <li>Required for exporting timeline sequences to ProRes or DNxHD</li>
          <li>Runs locally on port 3777</li>
          <li>Status is shown in the header (green dot = connected)</li>
        </ul>
        <p>The helper is not required for scanning, validation, or feedback — only for high-quality exports.</p>
      </>
    ),
  },
];

interface HelpPanelProps {
  onClose: () => void;
  onStartTour: () => void;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ onClose, onStartTour }) => {
  const [expanded, setExpanded] = useState<string[]>(['quickstart']);

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  return (
    <>
      {/* Backdrop */}
      <div className="help-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="help-panel">
        <div className="help-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Help</span>
          </div>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Close help">
            <X size={16} />
          </button>
        </div>

        <div className="help-content">
          {/* Tour shortcut */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { onClose(); onStartTour(); }}
            style={{ width: '100%', justifyContent: 'center', marginBottom: '12px' }}
          >
            <Zap size={14} /> Take the guided tour
          </button>

          {/* Accordion */}
          {SECTIONS.map(section => {
            const isOpen = expanded.includes(section.id);
            return (
              <div key={section.id} className="help-section">
                <button
                  className="help-section-header"
                  onClick={() => toggle(section.id)}
                  aria-expanded={isOpen}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {section.icon}
                    {section.title}
                  </span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className="help-section-body">
                    {section.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
