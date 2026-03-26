/**
 * Unified time formatting utilities.
 *
 * Three formats used across the app:
 * - Timecode (HH:MM:SS:FF) — frame-accurate, for video playback & feedback
 * - Subtitle (H:MM:SS.cc or MM:SS.cc) — centisecond precision, for transcription/ASS
 * - Duration (HH:MM:SS.ss) — decimal seconds, for waveform & general display
 */

/** HH:MM:SS:FF — frame-accurate timecode from seconds */
export function formatTimecode(seconds: number, fps: number = 25): string {
  const f = fps || 25;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const fr = Math.floor((seconds % 1) * f);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
}

/** MM:SS.cc or H:MM:SS.cc — centisecond precision from milliseconds */
export function msToTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 10);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}

/** HH:MM:SS.ss — decimal seconds from seconds */
export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/** H:MM:SS.ss — ASS subtitle timestamp from milliseconds */
export function formatAssTime(ms: number): string {
  const totalSec = ms / 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}
