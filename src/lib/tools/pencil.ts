import { get } from 'svelte/store';
import type { Mat, PathData, Vec } from '$lib/core/types';
import { identity } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { fitPath } from '$lib/core/fit';
import { linePath } from '$lib/core/shapes';
import { polylineLength } from '$lib/core/polygon';
import { straightenStroke } from '$lib/core/recognize';
import { editor } from '$lib/editor/editor';
import { preferences } from '$lib/stores/preferences';
import { view } from '$lib/stores/app';
import { drawingLayer, lineStyle, polylinePath, setPreviewStroke } from './draw';
import { toolBase, type Tool, type ToolEvent } from './tool';
import PencilOptions from './options/PencilOptions.svelte';

// screen pixels, closer points add nothing but work for the fit
const MIN_STEP = 1.5;
// ends this close on screen make a closed path when the option is on
const CLOSE_GAP = 12;

let points: Vec[] = [];
let last: { sx: number; sy: number } | null = null;
let layerId: string | null = null;
let pointer: ToolEvent | null = null;

// smoothing 0 to 100 becomes 0.5 to 30 screen pixels of fit tolerance
export function smoothingTolerance(smoothing: number): number {
  return 0.5 + (Math.max(0, Math.min(100, smoothing)) / 100) * 29.5;
}

function reset() {
  points = [];
  last = null;
  layerId = null;
  editor.markOverlay();
}

function build(e: ToolEvent): { path: PathData; transform: Mat; name: string } | null {
  const d = get(preferences).drawing;
  const first = points[0];
  const end = points[points.length - 1];
  if (e.shift) return { path: linePath(first.x, first.y, end.x, end.y), transform: identity(), name: 'Line' };
  const gap = Math.hypot(end.x - first.x, end.y - first.y) * e.zoom;
  const closed = points.length > 2 && (e.alt || (d.pencilClose && gap <= CLOSE_GAP && polylineLength(points) * e.zoom > CLOSE_GAP * 3));
  if (d.pencilMode === 'straighten') {
    const eps = (2 + d.pencilSmoothing / 10) / e.zoom;
    return straightenStroke(points, eps, closed);
  }
  const tolerance = (d.pencilMode === 'ink' ? 0.5 : smoothingTolerance(d.pencilSmoothing)) / e.zoom;
  return { path: fitPath(points, tolerance, closed), transform: identity(), name: 'Pencil' };
}

export const pencilTool: Tool = {
  ...toolBase('pencil'),

  down(e) {
    const layer = drawingLayer();
    if (!layer) return;
    layerId = layer.id;
    points = [{ x: e.x, y: e.y }];
    last = { sx: e.sx, sy: e.sy };
    pointer = e;
  },

  move(e) {
    pointer = e;
    if (!last) return;
    if (Math.hypot(e.sx - last.sx, e.sy - last.sy) < MIN_STEP) return;
    points.push({ x: e.x, y: e.y });
    last = { sx: e.sx, sy: e.sy };
    editor.markOverlay();
  },

  up(e) {
    if (!last || !layerId) return;
    if (Math.hypot(e.sx - last.sx, e.sy - last.sy) > 0) points.push({ x: e.x, y: e.y });
    const length = polylineLength(points) * e.zoom;
    const shape = points.length > 1 && length >= 2 ? build(e) : null;
    const target = layerId;
    reset();
    if (!shape || shape.path.anchors.length < 2) return;
    const item = makePathItem(shape.name, shape.path, lineStyle(), shape.transform);
    editor.insertItem(target, item, 'Draw with pencil');
  },

  key(e) {
    if (e.key === 'Escape' && last) {
      e.preventDefault();
      reset();
    }
  },

  // the raw points while drawing, a straight line with shift
  drawOverlay(ctx) {
    if (!last || points.length === 0) return;
    const zoom = get(view).zoom;
    setPreviewStroke(ctx, lineStyle(), zoom);
    const line = pointer?.shift ? [points[0], points[points.length - 1]] : points;
    polylinePath(ctx, line);
    ctx.stroke();
  },

  deactivate() {
    reset();
    pointer = null;
  },

  options: PencilOptions
};
