// r, g, b from 0 to 255
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// h in degrees from 0 to 360, s and v from 0 to 1
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// '#rgb', '#rrggbb' or the same without the hash, anything else is null
export function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const h = parseHex(hex) ?? '#000000';
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(c: Rgb): string {
  const part = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
}

export function rgbToHsv(c: Rgb): Hsv {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(c: Hsv): Rgb {
  const h = (((c.h % 360) + 360) % 360) / 60;
  const s = clamp(c.s, 0, 1);
  const v = clamp(c.v, 0, 1);
  const k = (n: number) => (n + h) % 6;
  const f = (n: number) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex));
}

export function hsvToHex(c: Hsv): string {
  return rgbToHex(hsvToRgb(c));
}

// straight mix of two colors, t from 0 to 1
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}
