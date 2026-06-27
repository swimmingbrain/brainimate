import type { Mat, Paint, Stop, Vec } from './types';
import { applyPoint, scaleFactor } from './mat';
import { boxCenter, boxHeight, boxWidth, isEmpty, type Box } from './bbox';
import { hexToRgb, mixHex } from './color';

export type Gradient = Extract<Paint, { type: 'linear' | 'radial' }>;
export type PaintType = Paint['type'];

export function isGradient(p: Paint | null | undefined): p is Gradient {
  return !!p && (p.type === 'linear' || p.type === 'radial');
}

// a gradient with all zero geometry spans the bounds of the item it lands on, until someone places it
export function isFitted(p: Gradient): boolean {
  if (p.type === 'linear') return p.x1 !== p.x2 || p.y1 !== p.y2;
  return p.r > 0;
}

export function sortStops(stops: Stop[]): Stop[] {
  return stops.map((s) => ({ ...s })).sort((a, b) => a.t - b.t);
}

export function makeGradient(type: 'linear' | 'radial', stops: Stop[]): Gradient {
  if (type === 'linear') return { type, stops: sortStops(stops), x1: 0, y1: 0, x2: 0, y2: 0 };
  return { type, stops: sortStops(stops), cx: 0, cy: 0, r: 0, fx: 0, fy: 0 };
}

// white fades to black, a color fades to black, black fades to white
function defaultStops(color: string, alpha: number): Stop[] {
  const end = color.toLowerCase() === '#000000' ? '#ffffff' : '#000000';
  return [
    { t: 0, color, alpha },
    { t: 1, color: end, alpha: 1 }
  ];
}

// the same colors as another kind of paint, a gradient made from a solid fades it to black
export function convertPaint(p: Paint | null, type: PaintType): Paint {
  if (type === 'solid') {
    if (!p) return { type: 'solid', color: '#ffffff', alpha: 1 };
    if (p.type === 'solid') return { ...p };
    const first = sortStops(p.stops)[0];
    return { type: 'solid', color: first?.color ?? '#000000', alpha: first?.alpha ?? 1 };
  }
  if (isGradient(p)) {
    if (p.type === type) return { ...p, stops: sortStops(p.stops) };
    return makeGradient(type, p.stops);
  }
  const color = p?.type === 'solid' ? p.color : '#ffffff';
  const alpha = p?.type === 'solid' ? p.alpha : 1;
  return makeGradient(type, defaultStops(color, alpha));
}

// the direction a linear gradient runs in degrees, 0 is left to right, y points down
export function gradientAngle(p: Gradient): number {
  if (p.type !== 'linear' || !isFitted(p)) return 0;
  return (Math.atan2(p.y2 - p.y1, p.x2 - p.x1) * 180) / Math.PI;
}

// spans the box: a linear one through the middle at the angle, a radial one from the middle to the far side
export function fitGradient(p: Gradient, box: Box, angle = gradientAngle(p)): Gradient {
  if (isEmpty(box)) return p;
  const c = boxCenter(box);
  const hw = boxWidth(box) / 2;
  const hh = boxHeight(box) / 2;
  if (p.type === 'radial') {
    const r = Math.max(hw, hh, 1e-3);
    return { ...p, stops: sortStops(p.stops), cx: c.x, cy: c.y, r, fx: c.x, fy: c.y };
  }
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const half = Math.max(hw * Math.abs(dx) + hh * Math.abs(dy), 1e-3);
  const stops = sortStops(p.stops);
  return { ...p, stops, x1: c.x - dx * half, y1: c.y - dy * half, x2: c.x + dx * half, y2: c.y + dy * half };
}

// turns a linear gradient around its middle, the length stays
export function withAngle(p: Gradient, angle: number): Gradient {
  if (p.type !== 'linear') return p;
  const mx = (p.x1 + p.x2) / 2;
  const my = (p.y1 + p.y2) / 2;
  const half = Math.hypot(p.x2 - p.x1, p.y2 - p.y1) / 2;
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a) * half;
  const dy = Math.sin(a) * half;
  return { ...p, x1: mx - dx, y1: my - dy, x2: mx + dx, y2: my + dy };
}

export function reverseGradient(p: Gradient): Gradient {
  return { ...p, stops: sortStops(p.stops.map((s) => ({ ...s, t: 1 - s.t }))) };
}

// the paint as it is in another space, for shapes whose local space changes
export function transformPaint(p: Paint | null, m: Mat): Paint | null {
  if (!p || p.type === 'solid') return p;
  if (p.type === 'linear') {
    const a = applyPoint(m, { x: p.x1, y: p.y1 });
    const b = applyPoint(m, { x: p.x2, y: p.y2 });
    return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  const c = applyPoint(m, { x: p.cx, y: p.cy });
  const f = applyPoint(m, { x: p.fx, y: p.fy });
  return { ...p, cx: c.x, cy: c.y, fx: f.x, fy: f.y, r: p.r * scaleFactor(m) };
}

// the color the gradient shows at t, between the stops around it
export function colorAt(p: Gradient, t: number): { color: string; alpha: number } {
  const stops = sortStops(p.stops);
  if (stops.length === 0) return { color: '#000000', alpha: 1 };
  if (t <= stops[0].t) return { color: stops[0].color, alpha: stops[0].alpha };
  const last = stops[stops.length - 1];
  if (t >= last.t) return { color: last.color, alpha: last.alpha };
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t < a.t || t > b.t) continue;
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    return { color: mixHex(a.color, b.color, k), alpha: a.alpha + (b.alpha - a.alpha) * k };
  }
  return { color: last.color, alpha: last.alpha };
}

// a new stop at t with the color the gradient already has there, the index is in the sorted stops
export function addStop(p: Gradient, t: number): { paint: Gradient; index: number } {
  const stop = { t, ...colorAt(p, t) };
  const stops = [...p.stops.map((s) => ({ ...s })), stop].sort((a, b) => a.t - b.t);
  return { paint: { ...p, stops }, index: stops.indexOf(stop) };
}

// the two ends a gradient runs between in local space, a radial one from its middle out to the right
export function gradientEnds(p: Gradient): [Vec, Vec] {
  if (p.type === 'linear') return [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
  return [{ x: p.cx, y: p.cy }, { x: p.cx + p.r, y: p.cy }];
}

function cssColor(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  const c = hexToRgb(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, alpha)})`;
}

// a css background for chips and swatches, null when there is no paint
export function cssPaint(p: Paint | null): string | null {
  if (!p) return null;
  if (p.type === 'solid') return cssColor(p.color, p.alpha);
  const stops = sortStops(p.stops)
    .map((s) => `${cssColor(s.color, s.alpha)} ${Math.round(s.t * 1000) / 10}%`)
    .join(', ');
  if (p.type === 'radial') return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${Math.round(gradientAngle(p)) + 90}deg, ${stops})`;
}
