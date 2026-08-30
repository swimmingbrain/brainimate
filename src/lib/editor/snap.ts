import { get } from 'svelte/store';
import type { Item, Mat, Vec } from '$lib/core/types';
import { applyPoint, identity, invert, multiply } from '$lib/core/mat';
import { boxCenter, isEmpty, type Box } from '$lib/core/bbox';
import { contours, itemBounds } from '$lib/core/items';
import { preferences, type Preferences } from '$lib/stores/preferences';
import { playing } from '$lib/stores/app';
import { docVersion, editor } from './editor';

// screen pixels, doubled for fingers and pens like the hit tolerances
export const SNAP_TOLERANCE = 6;
// past this many anchors only the bounds of the items are used
const MAX_ANCHORS = 4000;

export type SnapKind = 'grid' | 'guide' | 'stage' | 'anchor' | 'center' | 'edge';

export interface SnapTarget {
  value: number;
  kind: SnapKind;
}

// xs are vertical lines at an x, ys horizontal lines at a y
export interface SnapCandidates {
  xs: SnapTarget[];
  ys: SnapTarget[];
  // the grid spacing when snapping to the grid is on
  grid: number | null;
}

export interface SnapLine {
  axis: 'x' | 'y';
  value: number;
  kind: SnapKind;
}

export interface SnapResult {
  x: number;
  y: number;
  lines: SnapLine[];
  // the word shown next to the pointer, like anchor or center
  label: string | null;
}

export interface SnapOptions {
  zoom: number;
  // items that are being dragged, nothing snaps to them
  exclude?: Iterable<string>;
  // a box that moves with the point, its edges and middle snap instead of the point
  box?: Box | null;
  // 2 for touch and pen
  factor?: number;
  // a guide only moves along one axis
  axis?: 'x' | 'y';
  // the overlay shows the lines of this snap until clearSnap
  show?: boolean;
  // a guide being moved does not snap to the guides, it would stick to where it was
  guides?: boolean;
}

// what the overlay draws while a drag snaps
export const snapState: { result: SnapResult | null } = { result: null };

// probes are the coordinates that may snap: the point, or the two edges and the middle of the box
function nearest(probes: number[], targets: SnapTarget[], grid: number | null, tolerance: number) {
  let best: { value: number; kind: SnapKind; shift: number; d: number } | null = null;
  for (const at of probes) {
    for (const t of targets) {
      const d = Math.abs(t.value - at);
      if (d <= tolerance && (!best || d < best.d)) best = { value: t.value, kind: t.kind, shift: t.value - at, d };
    }
    if (grid && grid > 0) {
      const g = Math.round(at / grid) * grid;
      // a line or an anchor at the same distance wins over the grid
      const d = Math.abs(g - at) + 1e-6;
      if (d <= tolerance && (!best || d < best.d)) best = { value: g, kind: 'grid', shift: g - at, d };
    }
  }
  return best;
}

const LABELS: Record<SnapKind, string | null> = {
  grid: null,
  guide: 'guide',
  stage: 'edge',
  anchor: 'anchor',
  center: 'center',
  edge: 'edge'
};

// the pure part: moves p so the point, or the box with it, lands on the closest candidate on each axis
export function snapToCandidates(
  p: Vec,
  c: SnapCandidates,
  tolerance: number,
  box: Box | null = null,
  axis: 'x' | 'y' | null = null
): SnapResult {
  const probesX = box ? [box.minX, (box.minX + box.maxX) / 2, box.maxX] : [p.x];
  const probesY = box ? [box.minY, (box.minY + box.maxY) / 2, box.maxY] : [p.y];
  const bx = axis === 'y' ? null : nearest(probesX, c.xs, c.grid, tolerance);
  const by = axis === 'x' ? null : nearest(probesY, c.ys, c.grid, tolerance);
  const lines: SnapLine[] = [];
  if (bx) lines.push({ axis: 'x', value: bx.value, kind: bx.kind });
  if (by) lines.push({ axis: 'y', value: by.value, kind: by.kind });
  let label: string | null = null;
  if (bx && by && bx.kind === 'anchor' && by.kind === 'anchor') label = 'anchor';
  else label = (bx && LABELS[bx.kind]) ?? (by && LABELS[by.kind]) ?? null;
  return { x: p.x + (bx?.shift ?? 0), y: p.y + (by?.shift ?? 0), lines, label };
}

function addBox(c: SnapCandidates, b: Box) {
  if (isEmpty(b)) return;
  const mid = boxCenter(b);
  c.xs.push({ value: b.minX, kind: 'edge' }, { value: mid.x, kind: 'center' }, { value: b.maxX, kind: 'edge' });
  c.ys.push({ value: b.minY, kind: 'edge' }, { value: mid.y, kind: 'center' }, { value: b.maxY, kind: 'edge' });
}

function addAnchors(c: SnapCandidates, item: Item, m: Mat, budget: { left: number }) {
  if (item.type === 'group') {
    for (const child of item.children) addAnchors(c, child, multiply(m, child.transform), budget);
    return;
  }
  if (item.type !== 'path') return;
  for (const contour of contours(item)) {
    for (const a of contour.anchors) {
      if (budget.left-- <= 0) return;
      const w = applyPoint(m, a);
      c.xs.push({ value: w.x, kind: 'anchor' });
      c.ys.push({ value: w.y, kind: 'anchor' });
    }
  }
}

// every line something can snap to under the current preferences, the dragged items left out
export function collectCandidates(prefs: Preferences, exclude: Set<string>, guides = true): SnapCandidates {
  const c: SnapCandidates = { xs: [], ys: [], grid: null };
  if (!prefs.snapping.enabled) return c;
  if (prefs.grid.snap) c.grid = prefs.grid.size;
  const doc = editor.doc;
  // guides and the stage are in the document, inside an open symbol they are seen from its space,
  // which only keeps them straight lines while the symbol is not turned
  const inv = invert(editor.base());
  const straight = Math.abs(inv[1]) < 1e-9 && Math.abs(inv[2]) < 1e-9;
  const x = (v: number) => inv[0] * v + inv[4];
  const y = (v: number) => inv[3] * v + inv[5];
  if (straight && guides && prefs.guides.snap && prefs.guides.show) {
    for (const v of doc.guides.v) c.xs.push({ value: x(v), kind: 'guide' });
    for (const v of doc.guides.h) c.ys.push({ value: y(v), kind: 'guide' });
  }
  if (!prefs.snapping.smartGuides) return c;
  // the stage edges and its middle
  if (straight) {
    c.xs.push({ value: x(0), kind: 'stage' }, { value: x(doc.width / 2), kind: 'center' });
    c.xs.push({ value: x(doc.width), kind: 'stage' });
    c.ys.push({ value: y(0), kind: 'stage' }, { value: y(doc.height / 2), kind: 'center' });
    c.ys.push({ value: y(doc.height), kind: 'stage' });
  }
  const budget = { left: MAX_ANCHORS };
  for (const layer of editor.currentLayers()) {
    if (!editor.isEditable(layer)) continue;
    // bound items snap where they show
    for (const item of editor.shownItems(layer)) {
      if (!item.visible || exclude.has(item.id)) continue;
      if (prefs.snapping.objects) addBox(c, itemBounds(item, item.transform));
      if (prefs.snapping.points) addAnchors(c, item, multiply(identity(), item.transform), budget);
    }
  }
  return c;
}

let cache: { key: string; candidates: SnapCandidates } | null = null;

// the candidates only change with the document, the frame, the preferences and what is excluded
function candidates(exclude: Set<string>, guides: boolean): SnapCandidates {
  const prefs = get(preferences);
  const key = [
    get(docVersion),
    editor.frame,
    editor.editStack.length,
    guides,
    [...exclude].sort().join(','),
    JSON.stringify([prefs.snapping, prefs.grid.snap, prefs.grid.size, prefs.guides.snap, prefs.guides.show])
  ].join('|');
  // while playing the frame moves on every tick, the last targets do until it stops
  if (cache && get(playing)) return cache.candidates;
  if (cache?.key !== key) cache = { key, candidates: collectCandidates(prefs, exclude, guides) };
  return cache.candidates;
}

// the one snap every tool uses, p and the box are in world units
export function snapPoint(p: Vec, opts: SnapOptions): SnapResult {
  const prefs = get(preferences);
  const exclude = new Set(opts.exclude ?? []);
  const tolerance = (SNAP_TOLERANCE * (opts.factor ?? 1)) / opts.zoom;
  const c = candidates(exclude, opts.guides ?? true);
  const result = snapToCandidates(p, c, tolerance, opts.box ?? null, opts.axis ?? null);
  // whole pixels when nothing else caught the point
  if (prefs.snapping.enabled && prefs.snapping.pixels) {
    if (!result.lines.some((l) => l.axis === 'x') && opts.axis !== 'y') result.x = Math.round(result.x);
    if (!result.lines.some((l) => l.axis === 'y') && opts.axis !== 'x') result.y = Math.round(result.y);
  }
  if (opts.show) {
    snapState.result = result.lines.length > 0 ? result : null;
    editor.markOverlay();
  }
  return result;
}

export function clearSnap() {
  if (!snapState.result) return;
  snapState.result = null;
  editor.markOverlay();
}

// a pointer event moved onto the snap, for the tools that place points
export function snapEvent<T extends Vec & { zoom: number; pointerType: string }>(
  e: T,
  opts: Partial<SnapOptions> = {}
): T {
  const factor = e.pointerType === 'touch' || e.pointerType === 'pen' ? 2 : 1;
  const r = snapPoint(e, { zoom: e.zoom, factor, ...opts });
  return { ...e, x: r.x, y: r.y };
}
