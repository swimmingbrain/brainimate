import { describe, expect, it } from 'vitest';
import { formatTime, playFrame, takeFrames } from './playback';

describe('playback', () => {
  it('takes whole frames and carries the rest', () => {
    // 24 fps is a frame every 41.67 ms
    let r = takeFrames(0, 16, 24);
    expect(r.steps).toBe(0);
    r = takeFrames(r.acc, 16, 24);
    r = takeFrames(r.acc, 16, 24);
    expect(r.steps).toBe(1);
    expect(r.acc).toBeCloseTo(48 - 1000 / 24);
    expect(takeFrames(0, 100, 24).steps).toBe(2);
  });

  it('plays about fps frames in a second of ticks', () => {
    let acc = 0;
    let frames = 0;
    for (let i = 0; i < 60; i++) {
      const r = takeFrames(acc, 1000 / 60, 24);
      acc = r.acc;
      frames += r.steps;
    }
    expect(frames).toBeGreaterThanOrEqual(23);
    expect(frames).toBeLessThanOrEqual(24);
  });

  it('skips a long stall instead of racing', () => {
    expect(takeFrames(0, 5000, 24).steps).toBe(1);
  });

  it('loops or stops at the end', () => {
    expect(playFrame(3, 1, 10, true)).toEqual({ frame: 4, stop: false });
    expect(playFrame(9, 1, 10, true)).toEqual({ frame: 0, stop: false });
    expect(playFrame(8, 3, 10, true)).toEqual({ frame: 1, stop: false });
    expect(playFrame(9, 1, 10, false)).toEqual({ frame: 9, stop: true });
    expect(playFrame(25, 1, 10, true)).toEqual({ frame: 0, stop: false });
    expect(playFrame(0, 1, 1, true)).toEqual({ frame: 0, stop: false });
  });

  it('writes the time as minutes, seconds and frames', () => {
    expect(formatTime(0, 24)).toBe('00:00:00');
    expect(formatTime(23, 24)).toBe('00:00:23');
    expect(formatTime(24, 24)).toBe('00:01:00');
    expect(formatTime(24 * 75 + 5, 24)).toBe('01:15:05');
  });
});
