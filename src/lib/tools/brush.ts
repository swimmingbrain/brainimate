import { get } from 'svelte/store';
import type { Paint, Vec } from '$lib/core/types';
import { clonePaint, defaultStyle, solid } from '$lib/core/style';
import { makePathItem } from '$lib/core/items';
import { outlineToPath, strokeOutline, type FreehandOptions, type InkPoint } from '$lib/core/freehand';
import { editor } from '$lib/editor/editor';
import { selection, activeLayer, fillPaint, strokePaint, strokeWidth, view } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { drawingLayer, polylinePath, previewColor } from './draw';
import { toolBase, type Tool, type ToolEvent } from './tool';
import BrushOptions from './options/BrushOptions.svelte';

// screen pixels between kept points, perfect-freehand smooths the rest
const MIN_STEP = 1;

let points: InkPoint[] = [];
let last: { sx: number; sy: number } | null = null;
let layerId: string | null = null;
let pointer: ToolEvent | null = null;
let pen = false;
let outline: Vec[] = [];

// the brush paints with the fill, or with the stroke color when there is no fill
function brushPaint(): Paint {
  return clonePaint(get(fillPaint)) ?? clonePaint(get(strokePaint)) ?? solid('#000000');
}

// the size is in document units, a stroke is as wide on the page at any zoom
function options(done: boolean): FreehandOptions {
  const d = get(preferences).drawing;
  const s = d.brushSmoothing / 100;
  return {
    size: d.brushSize,
    thinning: d.brushPressure ? 0.6 : 0,
    smoothing: 0.2 + s * 0.6,
    streamline: 0.1 + s * 0.7,
    simulatePressure: d.brushPressure && !pen,
    last: done
  };
}

// with shift the stroke runs straight from the first point to the pointer
function strokePoints(): InkPoint[] {
  if (!pointer?.shift || points.length < 2) return points;
  const a = points[0];
  const b = points[points.length - 1];
  const out: InkPoint[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pressure: 0.5 });
  }
  return out;
}

function reset() {
  points = [];
  last = null;
  layerId = null;
  outline = [];
  editor.markOverlay();
}

// behind puts the new shape under everything else on the layer
function insertBehind(target: string, item: ReturnType<typeof makePathItem>) {
  editor.commit('Paint with brush', (draft) => {
    editor.draftItems(draft, target)?.unshift(item);
  });
  activeLayer.set(target);
  selection.set(new Set([item.id]));
}

export const brushTool: Tool = {
  ...toolBase('brush'),

  down(e) {
    const layer = drawingLayer();
    if (!layer) return;
    layerId = layer.id;
    pen = e.pointerType === 'pen';
    points = [{ x: e.x, y: e.y, pressure: e.pressure }];
    last = { sx: e.sx, sy: e.sy };
    pointer = e;
    outline = strokeOutline(points, options(false));
    editor.markOverlay();
  },

  move(e) {
    pointer = e;
    if (!last) {
      editor.markOverlay();
      return;
    }
    if (Math.hypot(e.sx - last.sx, e.sy - last.sy) < MIN_STEP) return;
    points.push({ x: e.x, y: e.y, pressure: e.pressure });
    last = { sx: e.sx, sy: e.sy };
    outline = strokeOutline(strokePoints(), options(false));
    editor.markOverlay();
  },

  up(e) {
    if (!last || !layerId) return;
    pointer = e;
    const stroke = strokePoints();
    const final = strokeOutline(stroke, options(true));
    const s = get(preferences).drawing.brushSmoothing / 100;
    // the fit is in document units too, so the same stroke comes out the same at any zoom
    const path = outlineToPath(final, stroke, options(true).size, 0.4 + s * 1.2);
    const target = layerId;
    reset();
    if (path.anchors.length < 3) return;
    const item = makePathItem('Brush', path, defaultStyle(brushPaint(), null, get(strokeWidth)));
    if (get(preferences).drawing.brushMode === 'behind') insertBehind(target, item);
    else editor.insertItem(target, item, 'Paint with brush');
  },

  key(e) {
    if (e.key === 'Escape' && last) {
      e.preventDefault();
      reset();
    }
  },

  // the outline as a plain polygon while painting, a circle of the brush size while hovering
  drawOverlay(ctx) {
    const z = get(view).zoom;
    if (last && outline.length > 2) {
      ctx.fillStyle = previewColor(brushPaint());
      polylinePath(ctx, outline, true);
      ctx.fill();
      return;
    }
    if (!pointer) return;
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.9)';
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, get(preferences).drawing.brushSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  },

  deactivate() {
    reset();
    pointer = null;
  },

  options: BrushOptions
};
