import { get } from 'svelte/store';
import type { Item, Mat, PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, identity, invert, multiply } from '$lib/core/mat';
import { fromPoints, intersects } from '$lib/core/bbox';
import { cloneItem, itemBounds } from '$lib/core/items';
import { newId } from '$lib/core/ids';
import { pathArea, polylineToPath } from '$lib/core/path';
import { subtract } from '$lib/core/boolean';
import { cutPath } from '$lib/core/erase';
import { strokeOutline, type FreehandOptions, type InkPoint } from '$lib/core/freehand';
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

// the size is in screen pixels like the brush, the width stays even without pressure
function options(done: boolean): FreehandOptions {
  return {
    size: get(preferences).drawing.eraserSize / zoom,
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

function totalArea(list: PathData[]): number {
  return list.reduce((sum, p) => sum + Math.abs(pathArea(p)), 0);
}

// filled paths lose the area under the trail, stroke only paths are cut where the trail crosses them
async function erase(target: string, polygon: Vec[]) {
  const layer = editor.layerById(target);
  if (!layer || polygon.length < 3) return;
  const mode = get(preferences).drawing.eraserMode;
  const box = fromPoints(polygon);
  const changes = new Map<string, PathData[]>();
  for (const { item, world } of paths(editor.layerItems(layer), identity())) {
    if (!intersects(itemBounds(item, world), box)) continue;
    const inv = invert(world);
    const local = polygon.map((p) => applyPoint(inv, p));
    if (item.style.fill) {
      if (mode === 'strokes') continue;
      const out = await subtract([item.path], [polylineToPath(local, true)]);
      const before = Math.abs(pathArea(item.path));
      if (Math.abs(before - totalArea(out)) <= 1e-3 * Math.max(1, before)) continue;
      changes.set(item.id, out);
    } else if (item.style.stroke) {
      if (mode === 'fills') continue;
      const out = cutPath(item.path, local);
      if (out) changes.set(item.id, out);
    }
  }
  if (changes.size === 0) return;
  editor.commit('Erase', (draft) => {
    for (const [id, list] of changes) {
      const found = editor.draftFind(draft, id);
      if (!found || found.item.type !== 'path') continue;
      // the first piece keeps the id, so a tween can still match it
      const base = cloneItem(found.item);
      const pieces = list.map((path, i) => ({ ...cloneItem(base), id: i === 0 ? base.id : newId(), path }));
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
    const polygon = strokeOutline(points, options(true));
    const target = layerId;
    busy = true;
    erase(target, polygon)
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
    ctx.arc(pointer.x, pointer.y, get(preferences).drawing.eraserSize / 2 / z, 0, Math.PI * 2);
    ctx.stroke();
  },

  deactivate() {
    if (!busy) reset();
    pointer = null;
  },

  options: EraserOptions
};
