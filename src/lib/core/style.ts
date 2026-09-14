import type { Paint, Style } from './types';
import type { Box } from './bbox';
import { fitGradient, isFitted, isGradient } from './gradient';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
] as const;

export function solid(color: string, alpha = 1): Paint {
  return { type: 'solid', color, alpha };
}

export function defaultStyle(
  fill: Paint | null = solid('#ffffff'),
  stroke: Paint | null = solid('#000000'),
  width = 1.5
): Style {
  return { fill, stroke, width, cap: 'round', join: 'round', dash: [], scaleStroke: false };
}

export function clonePaint(p: Paint | null): Paint | null {
  if (!p) return null;
  if (p.type === 'solid') return { ...p };
  return { ...p, stops: p.stops.map((s) => ({ ...s })) };
}

export function cloneStyle(s: Style): Style {
  return { ...s, fill: clonePaint(s.fill), stroke: clonePaint(s.stroke), dash: [...s.dash] };
}

// the color a chip or a swatch shows, the first stop for a gradient
export function paintColor(p: Paint | null): string | null {
  if (!p) return null;
  if (p.type === 'solid') return p.color;
  return p.stops[0]?.color ?? '#000000';
}

export function paintAlpha(p: Paint | null): number {
  if (!p) return 1;
  if (p.type === 'solid') return p.alpha;
  return p.stops[0]?.alpha ?? 1;
}

const rgbaCache = new Map<string, string>();

// '#rrggbb' plus alpha as a css color, opaque colors stay as they are
export function rgba(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  const key = color + alpha;
  let out = rgbaCache.get(key);
  if (!out) {
    const n = parseInt(color.slice(1), 16);
    out = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, alpha)})`;
    if (rgbaCache.size > 500) rgbaCache.clear();
    rgbaCache.set(key, out);
  }
  return out;
}

// one canvas gradient per paint object, an edit makes a new paint so a stale one is never read
const gradients = new WeakMap<Paint, { key: string; gradient: CanvasGradient }>();
// the css string of a solid paint, read on every draw of every item
const solids = new WeakMap<Paint, string>();

// a gradient nobody placed yet spans the box of its item
export function needsBox(p: Paint | null): boolean {
  return isGradient(p) && !isFitted(p);
}

// gradients are in item local space, so the context must already hold the item transform
export function canvasPaint(ctx: Ctx2D, p: Paint, box: Box | null = null): string | CanvasGradient {
  if (p.type === 'solid') {
    let css = solids.get(p);
    if (css === undefined) {
      css = rgba(p.color, p.alpha);
      solids.set(p, css);
    }
    return css;
  }
  const fit = box !== null && !isFitted(p);
  const key = fit ? `${box.minX},${box.minY},${box.maxX},${box.maxY}` : '';
  const cached = gradients.get(p);
  if (cached && cached.key === key) return cached.gradient;
  const q = fit ? fitGradient(p, box) : p;
  const g =
    q.type === 'linear'
      ? ctx.createLinearGradient(q.x1, q.y1, q.x2, q.y2)
      : ctx.createRadialGradient(q.fx, q.fy, 0, q.cx, q.cy, Math.max(0, q.r));
  for (const s of q.stops) g.addColorStop(Math.max(0, Math.min(1, s.t)), rgba(s.color, s.alpha));
  gradients.set(p, { key, gradient: g });
  return g;
}

export function compositeOp(blend: string): GlobalCompositeOperation {
  return blend === 'normal' || !blend ? 'source-over' : (blend as GlobalCompositeOperation);
}
