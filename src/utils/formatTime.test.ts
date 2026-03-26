import { describe, it, expect } from 'vitest';
import { formatTimecode, msToTimecode, formatDuration, formatAssTime } from './formatTime';

describe('formatTimecode', () => {
  it('formats zero seconds', () => {
    expect(formatTimecode(0, 25)).toBe('00:00:00:00');
  });

  it('formats seconds with frames at 25fps', () => {
    expect(formatTimecode(1.5, 25)).toBe('00:00:01:12');
  });

  it('formats hours correctly', () => {
    expect(formatTimecode(3661.04, 25)).toBe('01:01:01:00');
  });

  it('defaults to 25fps', () => {
    expect(formatTimecode(1.5)).toBe('00:00:01:12');
  });
});

describe('msToTimecode', () => {
  it('formats zero ms', () => {
    expect(msToTimecode(0)).toBe('00:00.00');
  });

  it('formats under 1 hour without hour prefix', () => {
    expect(msToTimecode(65230)).toBe('01:05.23');
  });

  it('formats over 1 hour with hour prefix', () => {
    expect(msToTimecode(3723450)).toBe('1:02:03.45');
  });
});

describe('formatDuration', () => {
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('00:00:00.00');
  });

  it('formats fractional seconds', () => {
    expect(formatDuration(65.5)).toBe('00:01:05.50');
  });
});

describe('formatAssTime', () => {
  it('formats ASS timestamp', () => {
    expect(formatAssTime(3723450)).toBe('1:02:03.45');
  });

  it('formats zero', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
  });
});
