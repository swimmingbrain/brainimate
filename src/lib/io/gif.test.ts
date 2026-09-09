import { describe, expect, it } from 'vitest';
import { buildPalette, clearIndex, dither, encodeGif, gifDelay, mergeSamples, paletteFrames } from './gif';

// a w by h frame in one color
function frame(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) out.set([r, g, b, a], i);
  return out;
}

describe('gif export', () => {
  it('snaps the frame delay to hundredths of a second', () => {
    expect(gifDelay(24)).toBe(40);
    expect(gifDelay(10)).toBe(100);
    expect(gifDelay(60)).toBe(20);
    expect(gifDelay(100)).toBe(20);
  });

  it('builds the palette from every 4th frame and the last one', () => {
    expect(paletteFrames(10)).toEqual([0, 4, 8, 9]);
    expect(paletteFrames(4)).toEqual([0, 3]);
    expect(paletteFrames(1)).toEqual([0]);
    expect(paletteFrames(0)).toEqual([]);
  });

  it('merges sample frames and thins them out past the limit', () => {
    const a = frame(2, 2, 255, 0, 0);
    const b = frame(2, 2, 0, 0, 255);
    expect(mergeSamples([a, b])).toHaveLength(32);
    const thin = mergeSamples([a, b], 4);
    expect(thin).toHaveLength(16);
    expect([...thin.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...thin.slice(12, 16)]).toEqual([0, 0, 255, 255]);
  });

  it('keeps the colors of all sampled frames and a clear entry when see through', () => {
    const samples = mergeSamples([frame(4, 4, 255, 0, 0), frame(4, 4, 0, 0, 255)]);
    const palette = buildPalette(samples, false);
    expect(palette.some((c) => c[0] > 200 && c[2] < 50)).toBe(true);
    expect(palette.some((c) => c[2] > 200 && c[0] < 50)).toBe(true);
    const clear = buildPalette(samples, true);
    expect(clear[clearIndex(clear)][3]).toBe(0);
  });

  it('dithers the colors and leaves alpha alone', () => {
    const out = dither(frame(4, 4, 128, 128, 128, 77), 4, 4);
    expect(out[3]).toBe(77);
    expect(new Set([...out].filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(1);
  });

  it('writes a gif89a file with one frame per step', async () => {
    const colors = [frame(8, 8, 255, 0, 0), frame(8, 8, 0, 255, 0), frame(8, 8, 0, 0, 255)];
    const bytes = await encodeGif(3, (i) => colors[i], 8, 8, { fps: 12, loop: true, transparent: false, dither: false });
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a');
    // one image descriptor per frame
    expect([...bytes].filter((b, i) => b === 0x2c && bytes[i - 1] === 0)).toHaveLength(3);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    const clear = await encodeGif(1, () => frame(4, 4, 0, 0, 0, 0), 4, 4, {
      fps: 12,
      loop: false,
      transparent: true,
      dither: true
    });
    expect(new TextDecoder().decode(clear.slice(0, 6))).toBe('GIF89a');
  });
});
