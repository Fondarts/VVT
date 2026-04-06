import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckResults } from './CheckResults';
import type { ValidationCheck, ScanResult } from '../shared/types';

const baseScanResult: ScanResult = {
  file: {
    name: 'test.mp4', path: '', extension: 'mp4',
    sizeBytes: 10000000, sizeFormatted: '10 MB',
    duration: 30, durationFormatted: '00:00:30:00',
    container: 'MPEG-4', format: 'MPEG-4',
    width: 1920, height: 1080,
  },
  video: {
    codec: 'H.264', profile: 'High', width: 1920, height: 1080,
    frameRate: 29.97, frameRateFormatted: '29.97',
    bitRate: 8000000, bitRateFormatted: '8 Mbps',
    bitDepth: 8, chromaSubsampling: '4:2:0', scanType: 'Progressive',
  },
  audio: {
    codec: 'AAC', sampleRate: 48000, channels: 2,
    channelLayout: 'L R', lufs: -23, truePeak: -1,
  },
  fastStart: { enabled: true, moovAt: 36 },
};

const passCheck: ValidationCheck = {
  id: 'video-codec', name: 'Video Codec', category: 'video',
  status: 'pass', message: 'OK', detected: 'H.264', expected: 'H.264',
};

const failCheck: ValidationCheck = {
  id: 'frame-rate', name: 'Frame Rate', category: 'video',
  status: 'fail', message: 'Mismatch', detected: '29.97', expected: '25',
};

const warnCheck: ValidationCheck = {
  id: 'audio-lufs', name: 'Loudness', category: 'audio',
  status: 'warn', message: 'Close', detected: '-23 LUFS', expected: '-24 LUFS',
};

describe('CheckResults', () => {
  it('renders scan result metadata without preset', () => {
    render(<CheckResults checks={[]} noPreset scanResult={baseScanResult} />);
    expect(screen.getByText('Checks')).toBeDefined();
    expect(screen.getByText('MPEG-4')).toBeDefined();
    expect(screen.getByText('1920 × 1080')).toBeDefined();
    expect(screen.getByText('00:00:30:00')).toBeDefined();
  });

  it('shows empty state when no scanResult', () => {
    render(<CheckResults checks={[]} />);
    expect(screen.getByText(/Select a standard/)).toBeDefined();
  });

  it('renders pass/fail/warn icons with checks', () => {
    render(
      <CheckResults
        checks={[passCheck, failCheck, warnCheck]}
        scanResult={baseScanResult}
        presetName="Test Preset"
      />
    );
    // Should show pass count
    expect(screen.getByText(/1 \/ 3 passed/)).toBeDefined();
    // Should show preset name in column header
    expect(screen.getByText('Test Preset')).toBeDefined();
    // Status icons should be present via aria-label (multiple possible per status)
    expect(screen.getAllByLabelText('Passed').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Failed').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Warning').length).toBeGreaterThan(0);
  });

  it('renders headerExtra element', () => {
    render(
      <CheckResults
        checks={[]}
        noPreset
        scanResult={baseScanResult}
        headerExtra={<span data-testid="extra">Extra</span>}
      />
    );
    expect(screen.getByTestId('extra')).toBeDefined();
  });

  it('collapses and expands groups on click', async () => {
    const user = userEvent.setup();
    render(<CheckResults checks={[]} noPreset scanResult={baseScanResult} />);

    // Container group is expanded by default — should see format
    expect(screen.getByText('MPEG-4')).toBeDefined();

    // Click to collapse
    const containerBtn = screen.getByRole('button', { name: /Container/i });
    await user.click(containerBtn);

    // MPEG-4 should no longer be visible (group collapsed)
    expect(screen.queryByText('MPEG-4')).toBeNull();

    // Click to expand again
    await user.click(containerBtn);
    expect(screen.getByText('MPEG-4')).toBeDefined();
  });
});
