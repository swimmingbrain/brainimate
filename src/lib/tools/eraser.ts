import { get } from 'svelte/store';
import type { Item, Mat, PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, identity, invert, multiply } from '$lib/core/mat';
import { fromPoints, intersects } from '$lib/core/bbox';
import { cloneItem, contours, itemBounds } from '$lib/core/items';
import { newId } from '$lib/core/ids';
import { pathArea, transformPath, type Compound } from '$lib/core/path';
import { subtract } from '$lib/core/boolean';
import { cutPath } from '$lib/core/erase';
import { outlineToPath, strokeOutline, type FreehandOptions, type InkPoint } from '$lib/core/freehand';
import { editor } from '$lib/editor/editor';
import { addToast, view } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { drawingLayer, polylinePath } from './draw';
import { toolBase, type Tool, type ToolEvent } from './tool';
import EraserOptions from './options/EraserOptions.svelte';

const MIN_STEP = 1;
const TRAIL_COLOR = 'rgba(150, 150, 160, 0.45)';

let points: InkPoint[] = [];
let last: { sx: number; sy: number } | null = null;
let layerId: string | null = null;
let pointer: ToolEvent | null = null;
let zoom = 1;
let trail: Vec[] = [];
// the boolean work runs after the release, the next stroke waits for it
let busy = false;

// the size is in document units like the brush, the width stays even without pressure
function options(done: boolean): FreehandOptions {
  return {
    size: get(preferences).drawing.eraserSize,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.3,
    simulatePressure: false,
    last: done
  };
}

function reset() {
  points = [];
  last = null;
  layerId = null;
  trail = [];
  editor.markOverlay();
}

// the visible, unlocked paths of a layer with their world matrix, inside groups too
function paths(items: Item[], parent: Mat, out: { item: PathItem; world: Mat }[] = []) {
  for (const item of items) {
    if (!item.visible || item.locked) continue;
    const world = multiply(parent, item.transform);
    if (item.type === 'group') paths(item.children, world, out);
    else if (item.type === 'path') out.push({ item, world });
  }
  return out;
}

// the filled area, holes taken off
function shapeArea(list: PathData[]): number {
  return Math.abs(list.reduce((sum, p) => sum + pathArea(p), 0));
}

function totalArea(list: Compound[]): number {
  return list.reduce((sum, c) => sum + shapeArea([c.path, ...c.subpaths]), 0);
}

// filled paths lose the area under the trail, stroke only paths are cut where the trail crosses them,
// the fills are cut with the trail fitted to curves, so a notch gets a few smooth anchors
async function erase(target: string, polygon: Vec[], trailPath: PathData) {
  const layer = editor.layerById(target);
  if (!layer || polygon.length < 3) return;
  const mode = get(preferences).drawing.eraserMode;
  const box = fromPoints(polygon);
  const changes = new Map<string, Compound[]>();
  for (const { item, world } of paths(editor.layerItems(layer), identity())) {
    if (!intersects(itemBounds(item, world), box)) continue;
    const inv = invert(world);
    const local = polygon.map((p) => applyPoint(inv, p));
    if (item.style.fill) {
      if (mode === 'strokes') continue;
      const out = await subtract(contours(item), [transformPath(trailPath, inv)]);
      const before = shapeArea(contours(item));
      if (Math.abs(before - totalArea(out)) <= 1e-3 * Math.max(1, before)) continue;
      changes.set(item.id, out);
    } else if (item.style.stroke) {
      if (mode === 'fills') continue;
      // every contour is cut on its own, the pieces are open strokes
      const cut = contours(item).map((c) => cutPath(c, local));
      if (cut.every((c) => c === null)) continue;
      const pieces = cut.flatMap((c, i) => c ?? [contours(item)[i]]);
      changes.set(item.id, pieces.map((path) => ({ path, subpaths: [] })));
    }
  }
  if (changes.size === 0) return;
  editor.commit('Erase', (draft) => {
    for (const [id, list] of changes) {
      const found = editor.draftFind(draft, id);
      if (!found || found.item.type !== 'path') continue;
      // the first piece keeps the id, so a tween can still match it
      const base = cloneItem(found.item);
      const pieces = list.map((c, i) => ({
        ...cloneItem(base),
        id: i === 0 ? base.id : newId(),
        path: c.path,
        subpaths: c.subpaths
      }));
      found.list.splice(found.index, 1, ...pieces);
    }
  });
}

export const eraserTool: Tool = {
  ...toolBase('eraser'),

  down(e) {
    if (busy) return;
    const layer = drawingLayer();
    if (!layer) return;
    layerId = layer.id;
    zoom = e.zoom;
    points = [{ x: e.x, y: e.y, pressure: 0.5 }];
    last = { sx: e.sx, sy: e.sy };
    pointer = e;
    trail = strokeOutline(points, options(false));
    editor.markOverlay();
  },

  move(e) {
    pointer = e;
    if (!last) {
      editor.markOverlay();
      return;
    }
    if (Math.hypot(e.sx - last.sx, e.sy - last.sy) < MIN_STEP) return;
    points.push({ x: e.x, y: e.y, pressure: 0.5 });
    last = { sx: e.sx, sy: e.sy };
    trail = strokeOutline(points, options(false));
    editor.markOverlay();
  },

  up(e) {
    if (!last || !layerId) return;
    pointer = e;
    const o = options(true);
    const polygon = strokeOutline(points, o);
    const trailPath = outlineToPath(polygon, points, o.size, 0.5 / zoom);
    const target = layerId;
    busy = true;
    erase(target, polygon, trailPath)
      .catch(() => addToast('The eraser could not cut this shape', 'error'))
      .finally(() => {
        busy = false;
        reset();
      });
  },

  key(e) {
    if (e.key === 'Escape' && last && !busy) {
      e.preventDefault();
      reset();
    }
  },

  // the trail while erasing and a circle of the eraser size at the pointer
  drawOverlay(ctx) {
    const z = get(view).zoom;
    if (trail.length > 2) {
      ctx.fillStyle = TRAIL_COLOR;
      polylinePath(ctx, trail, true);
      ctx.fill();
    }
    if (!pointer) return;
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.9)';
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, get(preferences).drawing.eraserSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  },

  deactivate() {
    if (!busy) reset();
    pointer = null;
  },

  options: EraserOptions
};
