import { describe, expect, it } from 'vitest';
import { hexToHsv, hexToRgb, hsvToHex, hsvToRgb, mixHex, parseHex, rgbToHex, rgbToHsv } from './color';

describe('color', () => {
  it('reads short and long hex with or without the hash', () => {
    expect(parseHex('#FFAA00')).toBe('#ffaa00');
    expect(parseHex('fa0')).toBe('#ffaa00');
    expect(parseHex(' #123456 ')).toBe('#123456');
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('zzzzzz')).toBeNull();
  });

  it('turns hex into rgb and back', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000');
    expect(rgbToHex({ r: 300, g: -4, b: 12.6 })).toBe('#ff000d');
  });

  it('turns rgb into hsv', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(120);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBeCloseTo(240);
    expect(rgbToHsv({ r: 255, g: 0, b: 255 }).h).toBeCloseTo(300);
    const gray = rgbToHsv({ r: 128, g: 128, b: 128 });
    expect(gray.s).toBe(0);
    expect(gray.v).toBeCloseTo(128 / 255);
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('turns hsv into rgb', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe('#ffff00');
    expect(hsvToHex({ h: 180, s: 0.5, v: 1 })).toBe('#80ffff');
    expect(hsvToHex({ h: 720, s: 0, v: 0.5 })).toBe('#808080');
  });

  it('survives a round trip through hsv', () => {
    for (const hex of ['#000000', '#ffffff', '#d19a66', '#3060c0', '#7e6bb0', '#010203', '#fe00fe']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('mixes two colors', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });
});
