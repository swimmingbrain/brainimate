import bezier from 'bezier-easing';

// the two inner points of a cubic bezier from (0, 0) to (1, 1), like css cubic-bezier()
export type Handles = [number, number, number, number];

export type EaseFn = (t: number) => number;

// the css curves for the four simple eases
export const SIMPLE_EASES: Record<string, Handles> = {
  linear: [0, 0, 1, 1],
  in: [0.42, 0, 1, 1],
  out: [0, 0, 0.58, 1],
  inout: [0.42, 0, 0.58, 1]
};

// named curves for the custom editor, the usual penner ones as cubic handles,
// back and elastic only overshoot once since one cubic cannot wobble
export const EASE_PRESETS: { id: string; label: string; handles: Handles }[] = [
  { id: 'quad-in', label: 'Quad in', handles: [0.55, 0.085, 0.68, 0.53] },
  { id: 'quad-out', label: 'Quad out', handles: [0.25, 0.46, 0.45, 0.94] },
  { id: 'quad-inout', label: 'Quad in out', handles: [0.455, 0.03, 0.515, 0.955] },
  { id: 'cubic-in', label: 'Cubic in', handles: [0.55, 0.055, 0.675, 0.19] },
  { id: 'cubic-out', label: 'Cubic out', handles: [0.215, 0.61, 0.355, 1] },
  { id: 'cubic-inout', label: 'Cubic in out', handles: [0.645, 0.045, 0.355, 1] },
  { id: 'back-in', label: 'Back in', handles: [0.6, -0.28, 0.735, 0.045] },
  { id: 'back-out', label: 'Back out', handles: [0.175, 0.885, 0.32, 1.275] },
  { id: 'back-inout', label: 'Back in out', handles: [0.68, -0.55, 0.265, 1.55] },
  { id: 'elastic-out', label: 'Elastic out', handles: [0.35, 1.7, 0.55, 0.85] },
  { id: 'elastic-in', label: 'Elastic in', handles: [0.45, 0.15, 0.65, -0.7] }
];

const CUBIC = /^cubic\(\s*([^,]+),([^,]+),([^,]+),([^)]+)\)$/;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// the handles behind an ease string, an unknown one is linear
export function easeHandles(ease: string): Handles {
  const simple = SIMPLE_EASES[ease];
  if (simple) return [...simple];
  const preset = EASE_PRESETS.find((p) => p.id === ease);
  if (preset) return [...preset.handles];
  const m = CUBIC.exec(ease.replace(/\s+/g, ''));
  if (m) {
    const n = m.slice(1).map(Number);
    if (n.every(Number.isFinite)) return [clamp01(n[0]), n[1], clamp01(n[2]), n[3]];
  }
  return [0, 0, 1, 1];
}

function short(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

// the ease string for a custom curve, x values kept inside 0..1 so the curve stays a function of time
export function cubicEase(x1: number, y1: number, x2: number, y2: number): string {
  return `cubic(${short(clamp01(x1))},${short(y1)},${short(clamp01(x2))},${short(y2)})`;
}

// what the dropdown shows: one of the four simple eases or custom
export function easeKind(ease: string): 'linear' | 'in' | 'out' | 'inout' | 'custom' {
  if (ease === 'linear' || ease === 'in' || ease === 'out' || ease === 'inout') return ease;
  return 'custom';
}

const cache = new Map<string, EaseFn>();

const linear: EaseFn = (t) => clamp01(t);

// t from 0 to 1 through the curve, built once per ease string
export function easeFn(ease: string): EaseFn {
  let fn = cache.get(ease);
  if (fn) return fn;
  const [x1, y1, x2, y2] = easeHandles(ease);
  fn = x1 === y1 && x2 === y2 ? linear : bezier(x1, y1, x2, y2);
  cache.set(ease, fn);
  return fn;
}

export function applyEase(ease: string, t: number): number {
  return easeFn(ease)(clamp01(t));
}

// the same curve played backwards, for reversed frames: in becomes out
export function reverseEase(ease: string): string {
  if (ease === 'in') return 'out';
  if (ease === 'out') return 'in';
  if (ease === 'linear' || ease === 'inout') return ease;
  const [x1, y1, x2, y2] = easeHandles(ease);
  return cubicEase(1 - x2, 1 - y2, 1 - x1, 1 - y1);
}
