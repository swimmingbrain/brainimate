import { describe, expect, it } from 'vitest';
import { videoBitrate } from './video';

describe('video export', () => {
  it('maps the quality slider to a bitrate that grows with the size and rate', () => {
    const low = videoBitrate(1920, 1080, 24, 0);
    const high = videoBitrate(1920, 1080, 24, 1);
    expect(low).toBe(Math.round(1920 * 1080 * 24 * 0.02));
    expect(high).toBe(Math.round(1920 * 1080 * 24 * 0.2));
    expect(videoBitrate(1920, 1080, 24, 0.5)).toBeGreaterThan(low);
    expect(videoBitrate(960, 540, 24, 1)).toBeLessThan(high);
  });

  it('keeps the bitrate between sane ends', () => {
    expect(videoBitrate(16, 16, 1, 0)).toBe(200_000);
    expect(videoBitrate(8000, 8000, 60, 1)).toBe(40_000_000);
    expect(videoBitrate(100, 100, 24, 5)).toBe(videoBitrate(100, 100, 24, 1));
  });
});
