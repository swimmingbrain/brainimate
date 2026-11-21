import type { Vec } from '$lib/core/types';
import type { View } from '$lib/stores/app';
import { clampZoom } from './view';

// fingers and the pencil on the stage of a tablet. the tracker knows nothing of the browser, the
// stage hands it the pointers with a time and carries out the actions it gives back. a mouse never
// comes here, it keeps the plain path

// css pixels a press may wander and still be a press, a tap or a long press
export const SLOP = 10;
// a finger in draw mode waits this long before the tool sees it, so a second finger landing a moment
// later makes a pinch instead of a stroke
export const HOLD_MS = 120;
// a press that keeps still this long opens the context menu
export const LONG_PRESS_MS = 500;
// two taps this close in time and space make a double tap
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_SLOP = 24;
// two or three fingers down and up again this fast, without moving, are a tap of the fingers
export const MULTI_TAP_MS = 350;

export type PointerKind = 'touch' | 'pen';

export interface GesturePoint<P> {
  id: number;
  kind: PointerKind;
  // css pixels, any origin as long as it stays the same
  x: number;
  y: number;
  // milliseconds
  t: number;
  // what the stage needs to replay the pointer to a tool, the event itself
  data: P;
}

export interface GestureOptions {
  // a finger draws like the pencil, or it only moves the view and taps
  fingers: 'draw' | 'navigate';
  // in navigate mode a tap of a finger reaches the tool as a click, so it can select
  tapToTool: boolean;
  // a still press opens the context menu, off for the tools that draw
  longPress: boolean;
}

export type GestureAction<P> =
  | { type: 'tool-down'; data: P }
  | { type: 'tool-move'; data: P }
  | { type: 'tool-up'; data: P }
  // what the tool started is dropped, data is the last event it saw
  | { type: 'tool-cancel'; data: P }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch-start' }
  // where the two fingers started and where they are now
  | { type: 'pinch'; a0: Vec; b0: Vec; a1: Vec; b1: Vec }
  | { type: 'pinch-end' }
  | { type: 'double-tap'; data: P }
  | { type: 'long-press'; data: P }
  | { type: 'multi-tap'; fingers: number };

type Mode = 'idle' | 'pending' | 'tool' | 'navigate' | 'pinch' | 'done';

interface Tracked<P> {
  kind: PointerKind;
  start: GesturePoint<P>;
  last: GesturePoint<P>;
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class GestureTracker<P> {
  private mode: Mode = 'idle';
  private pointers = new Map<number, Tracked<P>>();
  // touches that landed while the pencil draws, a palm
  private ignored = new Set<number>();
  private first: GesturePoint<P> | null = null;
  private toolId: number | null = null;
  private toolKind: PointerKind | null = null;
  private lastData: P | null = null;
  private buffer: P[] = [];
  private moved = false;
  private opts: GestureOptions = { fingers: 'draw', tapToTool: true, longPress: true };
  private pinchIds: number[] = [];
  private pinchStart: Vec[] = [];
  private pinchAt = 0;
  private pinchOpen = false;
  private fingers = 0;
  private lastTap: { x: number; y: number; t: number } | null = null;

  // read at the start of every gesture, the tool may have changed since the last one
  constructor(private options: () => GestureOptions) {}

  // the stage shows the view in the middle of a pinch or a pan
  get active(): boolean {
    return this.mode === 'pinch' || (this.mode === 'navigate' && this.moved);
  }

  // when tick has something to do, null while nothing waits for time
  deadline(): number | null {
    if (!this.first || this.moved) return null;
    if (this.mode === 'pending') return this.first.t + HOLD_MS;
    if ((this.mode === 'tool' || this.mode === 'navigate') && this.opts.longPress) return this.first.t + LONG_PRESS_MS;
    return null;
  }

  down(p: GesturePoint<P>): GestureAction<P>[] {
    const out: GestureAction<P>[] = [];
    if (p.kind === 'pen') return this.penDown(p, out);
    // the hand resting on the screen while the pencil draws
    if (this.mode === 'tool' && this.toolKind === 'pen') {
      this.ignored.add(p.id);
      return out;
    }
    this.pointers.set(p.id, { kind: 'touch', start: p, last: p });
    const count = this.touchCount();
    if (count === 1 && this.mode === 'idle') {
      this.opts = this.options();
      this.first = p;
      this.moved = false;
      this.buffer = [];
      this.mode = this.opts.fingers === 'draw' ? 'pending' : 'navigate';
      return out;
    }
    if (this.mode === 'done') return out;
    if (this.mode === 'pinch') {
      this.fingers = Math.max(this.fingers, count);
      return out;
    }
    if (count >= 2) {
      if (this.mode === 'tool' && this.lastData !== null) out.push({ type: 'tool-cancel', data: this.lastData });
      this.startPinch(p.t, out);
    }
    return out;
  }

  move(p: GesturePoint<P>): GestureAction<P>[] {
    const out: GestureAction<P>[] = [];
    if (this.ignored.has(p.id)) return out;
    const tracked = this.pointers.get(p.id);
    if (!tracked) return out;
    const before = tracked.last;
    tracked.last = p;
    const far = dist(p, tracked.start) > SLOP;
    switch (this.mode) {
      case 'pending':
        if (far) {
          this.moved = true;
          this.flush(out);
          this.toTool(p, out, 'tool-move');
        } else {
          this.buffer.push(p.data);
        }
        break;
      case 'tool':
        if (p.id !== this.toolId) break;
        if (far) this.moved = true;
        this.toTool(p, out, 'tool-move');
        break;
      case 'navigate':
        if (far) this.moved = true;
        if (this.moved) out.push({ type: 'pan', dx: p.x - before.x, dy: p.y - before.y });
        break;
      case 'pinch': {
        if (!this.pinchOpen || !this.pinchIds.includes(p.id)) break;
        if (far) this.moved = true;
        const [a, b] = this.pinchIds.map((id) => this.pointers.get(id)!.last);
        out.push({ type: 'pinch', a0: this.pinchStart[0], b0: this.pinchStart[1], a1: a, b1: b });
        break;
      }
    }
    return out;
  }

  up(p: GesturePoint<P>): GestureAction<P>[] {
    return this.release(p, false);
  }

  // the browser took the pointer away, a scroll or the system: nothing it started is kept
  cancel(p: GesturePoint<P>): GestureAction<P>[] {
    return this.release(p, true);
  }

  tick(t: number): GestureAction<P>[] {
    const out: GestureAction<P>[] = [];
    const first = this.first;
    if (!first || this.moved) return out;
    if (this.mode === 'pending' && t - first.t >= HOLD_MS) {
      this.flush(out);
      this.mode = 'tool';
    }
    const still = this.mode === 'tool' || this.mode === 'navigate';
    if (still && this.opts.longPress && t - first.t >= LONG_PRESS_MS) {
      if (this.mode === 'tool' && this.lastData !== null) out.push({ type: 'tool-cancel', data: this.lastData });
      out.push({ type: 'long-press', data: first.data });
      this.mode = 'done';
      this.toolId = null;
      this.lastTap = null;
      if (this.pointers.size === 0) this.reset();
    }
    return out;
  }

  private penDown(p: GesturePoint<P>, out: GestureAction<P>[]): GestureAction<P>[] {
    // the pencil wins over whatever the fingers were doing
    if (this.mode === 'tool' && this.toolKind === 'touch' && this.lastData !== null) {
      out.push({ type: 'tool-cancel', data: this.lastData });
    }
    if (this.mode === 'pinch' && this.pinchOpen) out.push({ type: 'pinch-end' });
    if (this.mode === 'tool' && this.toolKind === 'pen') return out;
    for (const id of this.pointers.keys()) this.ignored.add(id);
    this.pointers.clear();
    this.pointers.set(p.id, { kind: 'pen', start: p, last: p });
    this.opts = this.options();
    this.first = p;
    this.moved = false;
    this.buffer = [];
    this.pinchOpen = false;
    this.mode = 'tool';
    this.toolId = p.id;
    this.toolKind = 'pen';
    this.lastData = p.data;
    out.push({ type: 'tool-down', data: p.data });
    return out;
  }

  private release(p: GesturePoint<P>, cancelled: boolean): GestureAction<P>[] {
    const out: GestureAction<P>[] = [];
    if (this.ignored.delete(p.id)) return out;
    const tracked = this.pointers.get(p.id);
    if (!tracked) return out;
    tracked.last = p;
    this.pointers.delete(p.id);
    const first = this.first;
    const quick = !!first && !this.moved && dist(p, tracked.start) <= SLOP && p.t - first.t < LONG_PRESS_MS;
    switch (this.mode) {
      case 'pending':
        if (!cancelled && first) {
          // a tap that never waited for the hold, the tool gets all of it at once
          this.flush(out);
          this.toTool(p, out, 'tool-up');
          if (quick) this.tapped(p, out);
        }
        this.reset();
        break;
      case 'tool':
        if (p.id !== this.toolId) break;
        if (cancelled) {
          out.push({ type: 'tool-cancel', data: this.lastData ?? p.data });
        } else {
          this.toTool(p, out, 'tool-up');
          if (quick) this.tapped(p, out);
        }
        this.reset();
        break;
      case 'navigate':
        if (!cancelled && quick && first) {
          if (this.opts.tapToTool) {
            out.push({ type: 'tool-down', data: first.data });
            out.push({ type: 'tool-up', data: p.data });
          }
          this.tapped(p, out);
        }
        this.reset();
        break;
      case 'pinch':
        if (this.pinchOpen && this.pinchIds.includes(p.id)) {
          this.pinchOpen = false;
          out.push({ type: 'pinch-end' });
        }
        if (this.touchCount() === 0) {
          if (!cancelled && !this.moved && p.t - this.pinchAt < MULTI_TAP_MS) {
            out.push({ type: 'multi-tap', fingers: this.fingers });
          }
          this.reset();
        }
        break;
      case 'done':
        if (this.pointers.size === 0) this.reset();
        break;
    }
    return out;
  }

  private startPinch(t: number, out: GestureAction<P>[]) {
    const touches = [...this.pointers.entries()].filter(([, v]) => v.kind === 'touch');
    this.pinchIds = touches.slice(0, 2).map(([id]) => id);
    this.pinchStart = this.pinchIds.map((id) => this.pointers.get(id)!.last);
    this.pinchAt = t;
    this.pinchOpen = true;
    this.fingers = touches.length;
    this.moved = false;
    this.mode = 'pinch';
    this.toolId = null;
    this.buffer = [];
    this.lastTap = null;
    out.push({ type: 'pinch-start' });
  }

  // the press the tool waited for, and every point since
  private flush(out: GestureAction<P>[]) {
    const first = this.first;
    if (!first) return;
    this.toolId = first.id;
    this.toolKind = 'touch';
    this.lastData = first.data;
    out.push({ type: 'tool-down', data: first.data });
    for (const data of this.buffer) {
      this.lastData = data;
      out.push({ type: 'tool-move', data });
    }
    this.buffer = [];
    this.mode = 'tool';
  }

  private toTool(p: GesturePoint<P>, out: GestureAction<P>[], type: 'tool-move' | 'tool-up') {
    this.lastData = p.data;
    out.push({ type, data: p.data });
  }

  private tapped(p: GesturePoint<P>, out: GestureAction<P>[]) {
    const last = this.lastTap;
    if (last && p.t - last.t <= DOUBLE_TAP_MS && dist(p, last) <= DOUBLE_TAP_SLOP) {
      out.push({ type: 'double-tap', data: p.data });
      this.lastTap = null;
    } else {
      this.lastTap = { x: p.x, y: p.y, t: p.t };
    }
  }

  private touchCount(): number {
    let n = 0;
    for (const v of this.pointers.values()) if (v.kind === 'touch') n++;
    return n;
  }

  private reset() {
    this.mode = 'idle';
    this.first = null;
    this.toolId = null;
    this.toolKind = null;
    this.lastData = null;
    this.buffer = [];
    this.moved = false;
    this.pinchIds = [];
    this.pinchStart = [];
    this.pinchOpen = false;
    this.fingers = 0;
  }
}

// the view after a pinch: it zooms by how far the fingers spread and the point under their middle
// follows the middle, so zoom and pan happen together
export function pinchView(start: View, a0: Vec, b0: Vec, a1: Vec, b1: Vec): View {
  const d0 = dist(a0, b0);
  const d1 = dist(a1, b1);
  const k = d0 > 1 && d1 > 1 ? d1 / d0 : 1;
  const zoom = clampZoom(start.zoom * k);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const wx = (m0.x - start.panX) / start.zoom;
  const wy = (m0.y - start.panY) / start.zoom;
  return { zoom, panX: m1.x - wx * zoom, panY: m1.y - wy * zoom };
}
