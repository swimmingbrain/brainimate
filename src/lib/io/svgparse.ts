import type { Mat } from '$lib/core/types';
import { identity, multiply, rotate, scale, translate } from '$lib/core/mat';
import { parseHex, rgbToHex } from '$lib/core/color';

// small readers for the text inside svg attributes: numbers, lengths, transforms, colors and css

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

// every number in a list like '1,2 3-4', the way svg writes them without separators
export function numbers(text: string | undefined): number[] {
  if (!text) return [];
  return (text.match(NUMBER) ?? []).map(Number);
}

const UNITS: Record<string, number> = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, ex: 8 };

// a length in pixels, a percentage of whole, fallback when there is none
export function parseLength(text: string | undefined, fallback = 0, whole = 0): number {
  if (text === undefined || text === null) return fallback;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(String(text));
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === '%') return (n / 100) * whole;
  return n * (UNITS[unit] ?? 1);
}

// the transform attribute as one matrix, the steps applied left to right like svg does
export function parseTransform(text: string | undefined): Mat {
  let m = identity();
  if (!text) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  for (const [, name, args] of text.matchAll(re)) {
    const n = numbers(args);
    let step: Mat;
    switch (name.toLowerCase()) {
      case 'matrix':
        if (n.length < 6) continue;
        step = [n[0], n[1], n[2], n[3], n[4], n[5]];
        break;
      case 'translate':
        step = translate(n[0] ?? 0, n[1] ?? 0);
        break;
      case 'scale':
        step = scale(n[0] ?? 1, n[1] ?? n[0] ?? 1);
        break;
      case 'rotate': {
        const r = rotate(((n[0] ?? 0) * Math.PI) / 180);
        step = n.length >= 3 ? multiply(translate(n[1], n[2]), multiply(r, translate(-n[1], -n[2]))) : r;
        break;
      }
      case 'skewx':
        step = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        step = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, step);
  }
  return m;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  purple: '#800080',
  teal: '#008080',
  navy: '#000080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gold: '#ffd700',
  indigo: '#4b0082',
  violet: '#ee82ee',
  coral: '#ff7f50',
  salmon: '#fa8072',
  tomato: '#ff6347',
  crimson: '#dc143c',
  khaki: '#f0e68c',
  beige: '#f5f5dc',
  tan: '#d2b48c',
  chocolate: '#d2691e',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkblue: '#00008b',
  darkgreen: '#006400',
  darkred: '#8b0000',
  skyblue: '#87ceeb',
  steelblue: '#4682b4',
  turquoise: '#40e0d0'
};

export interface Color {
  color: string;
  alpha: number;
}

function channel(text: string): number {
  const t = text.trim();
  return t.endsWith('%') ? (parseFloat(t) / 100) * 255 : parseFloat(t);
}

function alphaOf(text: string | undefined): number {
  if (text === undefined) return 1;
  const t = text.trim();
  const a = t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
}

// a css color as '#rrggbb' and an alpha, null when it is not one
export function parseColor(text: string | undefined): Color | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t.startsWith('#')) {
    const hex = t.slice(1);
    if (hex.length === 4 || hex.length === 8) {
      const full = hex.length === 4 ? [...hex].map((c) => c + c).join('') : hex;
      return { color: `#${full.slice(0, 6)}`, alpha: parseInt(full.slice(6, 8), 16) / 255 };
    }
    const color = parseHex(t);
    return color ? { color, alpha: 1 } : null;
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(t);
  if (fn) {
    const [rgb, a] = fn[1].split('/');
    const parts = rgb.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const color = rgbToHex({ r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]) });
    return { color, alpha: alphaOf(a ?? parts[3]) };
  }
  if (t === 'transparent') return { color: '#000000', alpha: 0 };
  const named = NAMED[t];
  return named ? { color: named, alpha: 1 } : null;
}

// 'a: b; c: d' as a map, the names lowercase
export function parseDeclarations(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (name && value) out[name] = value;
  }
  return out;
}

// one simple selector of a style sheet rule: an element name, classes and an id
export interface CssRule {
  tag: string | null;
  classes: string[];
  id: string | null;
  specificity: number;
  order: number;
  declarations: Record<string, string>;
}

const SIMPLE = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/;

// the rules of a <style> element. selectors other than element, class and id ones, like the ones
// with spaces or colons, are left out. illustrator writes .st0 and .cls-1 rules that this covers
export function parseStylesheet(text: string, first = 0): CssRule[] {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!\[CDATA\[|\]\]>/g, '');
  const rules: CssRule[] = [];
  let order = first;
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = parseDeclarations(body);
    for (const raw of selectors.split(',')) {
      const sel = raw.trim();
      if (sel.startsWith('@')) continue;
      const m = SIMPLE.exec(sel);
      if (!m || !sel) continue;
      const tag = m[1] && m[1] !== '*' ? m[1] : null;
      const parts = m[2].match(/[.#][\w-]+/g) ?? [];
      const classes = parts.filter((p) => p[0] === '.').map((p) => p.slice(1));
      const ids = parts.filter((p) => p[0] === '#').map((p) => p.slice(1));
      if (ids.length > 1) continue;
      const specificity = ids.length * 100 + classes.length * 10 + (tag ? 1 : 0);
      rules.push({ tag, classes, id: ids[0] ?? null, specificity, order: order++, declarations });
    }
  }
  return rules;
}

export function ruleMatches(rule: CssRule, tag: string, classes: string[], id: string | undefined): boolean {
  if (rule.tag && rule.tag !== tag) return false;
  if (rule.id && rule.id !== id) return false;
  return rule.classes.every((c) => classes.includes(c));
}
