import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'kissd_onboarding_completed';

export interface OnboardingStep {
  id: string;
  targetSelector?: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: string;
  /** Backdrop opacity 0–1 (default 0.7). Use lower values to let the background show through. */
  backdropOpacity?: number;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Kissd Review',
    description: 'A professional tool for video & image validation, feedback, and delivery. Everything runs locally in your browser — files are never uploaded to any server. You can also connect Google Drive to stream and sync files with your team.\n\nLet\'s load a demo video and walk through the key features.',
    action: 'preload-demo',
  },
  {
    id: 'player',
    title: 'Video player',
    description: 'Here\'s the video player with your demo file. Keyboard shortcuts: Space to play/pause, arrow keys to seek, comma/period for frame-by-frame, F for fullscreen. Safe-zone overlays and screenshot capture are built in.',
    targetSelector: '.results-column:first-child',
    position: 'right',
    action: 'show-player',
  },
  {
    id: 'projects',
    title: 'Project browser',
    description: 'Organize files into projects with nested folders. Files with version tags (V01, V02…) are grouped automatically. Add team members with different permission levels and share review links with external stakeholders.',
    targetSelector: '#project-browser',
    position: 'bottom',
    action: 'show-projects',
  },
  {
    id: 'feedback',
    title: 'Feedback & annotations',
    description: 'Leave time-stamped comments pinned to specific frames or ranges. Draw directly on the video with color-coded annotations. Resolve comments when feedback is addressed, and thread replies for discussion. All feedback syncs in real-time.',
    targetSelector: '#right-panel',
    position: 'left',
    action: 'show-feedback',
  },
  {
    id: 'specs',
    title: 'Specs & validation',
    description: 'After scanning, every technical detail is displayed: codec, resolution, frame rate, color space, loudness (LUFS), true peak, and fast-start status. Select a preset (Innovid, AudienceXpress, etc.) or create your own to validate compliance instantly.',
    targetSelector: '#right-panel',
    position: 'left',
    action: 'show-specs',
  },
  {
    id: 'tools',
    title: 'Timeline & tools',
    description: 'Build edit sequences by combining video segments, slate images, black frames, and audio bips. Transcribe speech with on-device Whisper AI. Extract thumbnails, check contrast, and create slate templates — all without leaving the browser.',
    targetSelector: '#right-panel',
    position: 'left',
    action: 'show-tools',
  },
  {
    id: 'helper',
    title: 'Kissd Helper',
    description: 'Kissd Helper is a companion desktop app needed to:\n\n• Export timeline sequences to ProRes, DNxHD, and other professional codecs\n• Decode ProRes files natively without browser transcoding\n• Stream Google Drive files via local proxy with range-request seeking\n\nIt runs locally on your machine. Click the status indicator in the header to download it.',
    targetSelector: '.logo',
    position: 'bottom',
    action: 'show-helper',
  },
  {
    id: 'export',
    title: 'Export reports',
    description: 'Generate detailed PDF validation reports, export raw scan data as JSON, save extracted thumbnails, or export subtitles as SRT. Everything you need for delivery and compliance documentation.',
    targetSelector: '#panel-specs',
    position: 'left',
    action: 'show-export',
  },
  {
    id: 'done',
    title: 'You\'re all set!',
    description: 'You can access help and documentation anytime by clicking the ? button in the header. You can also re-launch this tour from there.\n\nEnjoy using Kissd Review!',
    action: 'cleanup',
  },
];

// ── Module-level store ──────────────────────────────────
// Keeps onboarding state outside React so it survives any re-render storm.
let _active = false;
let _step = 0;
let _listeners: Array<() => void> = [];

function _notify() { _listeners.forEach(fn => fn()); }


// ─────────────────────────────────────────────────────────

export function useOnboarding() {
  // Force re-render when the module store changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  }, []);

  const isCompleted = localStorage.getItem(STORAGE_KEY) === '1';

  const start = useCallback(() => {
    _step = 0;
    _active = true;
    _notify();
  }, []);

  const next = useCallback(() => {
    if (_step >= ONBOARDING_STEPS.length - 1) {
      localStorage.setItem(STORAGE_KEY, '1');
      _active = false;
      _notify();
    } else {
      _step += 1;
      _notify();
    }
  }, []);

  const prev = useCallback(() => {
    _step = Math.max(0, _step - 1);
    _notify();
  }, []);

  const skip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    _active = false;
    _notify();
  }, []);

  const startIfNew = useCallback(() => {
    if (!isCompleted) {
      setTimeout(() => start(), 800);
    }
  }, [isCompleted, start]);

  return {
    active: _active,
    step: _step,
    currentStep: ONBOARDING_STEPS[_step] as OnboardingStep | undefined,
    totalSteps: ONBOARDING_STEPS.length,
    isCompleted,
    start,
    next,
    prev,
    skip,
    startIfNew,
  };
}
