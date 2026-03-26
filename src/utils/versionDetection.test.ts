import { describe, it, expect } from 'vitest';
import { parseVersion, detectFileType, groupByVersion } from './versionDetection';
import type { ProjectFile } from '../shared/types';

describe('parseVersion', () => {
  it('detects _V01 suffix', () => {
    const r = parseVersion('hero_V01.mp4');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBe('V01');
    expect(r.versionNumber).toBe(1);
  });

  it('detects _v2 suffix (lowercase, no padding)', () => {
    const r = parseVersion('hero_v2.mov');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBe('v2');
    expect(r.versionNumber).toBe(2);
  });

  it('detects _rev3 suffix', () => {
    const r = parseVersion('hero_rev3.mp4');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBe('rev3');
    expect(r.versionNumber).toBe(3);
  });

  it('detects _r01 suffix', () => {
    const r = parseVersion('spot_r01.mp4');
    expect(r.baseName).toBe('spot');
    expect(r.versionTag).toBe('r01');
    expect(r.versionNumber).toBe(1);
  });

  it('detects _edit2 suffix', () => {
    const r = parseVersion('spot_edit2.mp4');
    expect(r.baseName).toBe('spot');
    expect(r.versionTag).toBe('edit2');
    expect(r.versionNumber).toBe(2);
  });

  it('detects _final suffix', () => {
    const r = parseVersion('hero_final.mp4');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBe('final');
    expect(r.versionNumber).toBe(9999);
  });

  it('returns no version for plain filename', () => {
    const r = parseVersion('hero.mp4');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBeNull();
    expect(r.versionNumber).toBe(0);
  });

  it('does not false-positive on numbers without prefix', () => {
    const r = parseVersion('drive2.mp4');
    expect(r.baseName).toBe('drive2');
    expect(r.versionTag).toBeNull();
    expect(r.versionNumber).toBe(0);
  });

  it('handles dash separator', () => {
    const r = parseVersion('hero-V03.mp4');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBe('V03');
    expect(r.versionNumber).toBe(3);
  });

  it('handles dot separator', () => {
    const r = parseVersion('hero.v5.mp4');
    expect(r.baseName).toBe('hero');
    expect(r.versionTag).toBe('v5');
    expect(r.versionNumber).toBe(5);
  });

  it('detects version even with trailing suffixes', () => {
    const r = parseVersion('Honda_Fuel_the_Fire_02_v17_colored_VFX.mp4');
    expect(r.baseName).toBe('Honda_Fuel_the_Fire_02');
    expect(r.versionTag).toBe('v17');
    expect(r.versionNumber).toBe(17);
  });

  it('detects last version when multiple version-like patterns exist', () => {
    const r = parseVersion('Honda_Fuel_the_Fire_01_V02_exp.mp4');
    expect(r.baseName).toBe('Honda_Fuel_the_Fire_01');
    expect(r.versionTag).toBe('V02');
    expect(r.versionNumber).toBe(2);
  });

  it('detects version in complex names', () => {
    const r = parseVersion('Honda_Fuel_the_Fire_01_V02.mp4');
    expect(r.baseName).toBe('Honda_Fuel_the_Fire_01');
    expect(r.versionTag).toBe('V02');
    expect(r.versionNumber).toBe(2);
  });
});

describe('detectFileType', () => {
  it('detects video', () => { expect(detectFileType('hero.mp4')).toBe('video'); });
  it('detects image', () => { expect(detectFileType('thumb.jpg')).toBe('image'); });
  it('detects audio', () => { expect(detectFileType('music.wav')).toBe('audio'); });
  it('defaults to video', () => { expect(detectFileType('unknown.xyz')).toBe('video'); });
});

describe('groupByVersion', () => {
  const makeFile = (name: string, baseName: string, versionNumber: number, versionTag: string | null): ProjectFile => ({
    id: name,
    projectId: 'p1',
    parentPath: '/',
    name,
    baseName,
    versionTag,
    versionNumber,
    type: 'video',
    extension: 'mp4',
    sizeBytes: 1000,
    scanResult: null,
    addedBy: 'u1',
    addedAt: '2024-01-01',
  });

  it('groups files by baseName', () => {
    const files = [
      makeFile('hero_V01.mp4', 'hero', 1, 'V01'),
      makeFile('hero_V02.mp4', 'hero', 2, 'V02'),
      makeFile('other.mp4', 'other', 0, null),
    ];
    const groups = groupByVersion(files);
    expect(groups).toHaveLength(2);
  });

  it('latest is highest version number', () => {
    const files = [
      makeFile('hero_V01.mp4', 'hero', 1, 'V01'),
      makeFile('hero_V03.mp4', 'hero', 3, 'V03'),
      makeFile('hero_V02.mp4', 'hero', 2, 'V02'),
    ];
    const groups = groupByVersion(files);
    expect(groups[0].latest.name).toBe('hero_V03.mp4');
    expect(groups[0].versions).toHaveLength(3);
  });

  it('final sorts as latest', () => {
    const files = [
      makeFile('hero_V03.mp4', 'hero', 3, 'V03'),
      makeFile('hero_final.mp4', 'hero', 9999, 'final'),
    ];
    const groups = groupByVersion(files);
    expect(groups[0].latest.versionTag).toBe('final');
  });

  it('case-insensitive grouping', () => {
    const files = [
      makeFile('Hero_V01.mp4', 'Hero', 1, 'V01'),
      makeFile('hero_v02.mp4', 'hero', 2, 'v02'),
    ];
    const groups = groupByVersion(files);
    expect(groups).toHaveLength(1);
    expect(groups[0].versions).toHaveLength(2);
  });
});
