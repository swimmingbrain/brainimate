import { get } from 'svelte/store';
import type { Mat, PathData, PathItem, Vec } from '$lib/core/types';
import { makePathItem } from '$lib/core/items';
import { defaultStyle, clonePaint, solid } from '$lib/core/style';
import { editor } from '$lib/editor/editor';
import { addToast, fillPaint, strokePaint, strokeWidth } from '$lib/stores/app';
import { toolBase, type Tool, type ToolEvent, type ToolId } from './tool';

// screen pixels a drag needs before it makes a shape, a plain click draws nothing
const MIN_SIZE = 2;

export interface ShapeBuild {
  path: PathData;
  transform: Mat;
  // a tool that draws more than one kind of shape names each one
  name?: string;
}

// a drag from start to the pointer, build turns the two points into a path around the local origin
export function shapeTool(
  id: ToolId,
  name: string,
  build: (start: Vec, e: ToolEvent) => ShapeBuild,
  filled = true
): Tool {
  let start: Vec | null = null;
  let layerId: string | null = null;
  let item: PathItem | null = null;
  let size = 0;

  function cancel() {
    start = null;
    item = null;
    editor.previewAdded = [];
    editor.markAll();
  }

  return {
    ...toolBase(id),

    down(e) {
      const layer = editor.activeLayer();
      if (!layer || !editor.isEditable(layer)) {
        addToast(layer ? `${layer.name} is locked or hidden` : 'There is no layer to draw on', 'warning');
        return;
      }
      start = { x: e.x, y: e.y };
      layerId = layer.id;
      item = null;
      size = 0;
    },

    move(e) {
      if (!start || !layerId) return;
      size = Math.max(size, Math.hypot(e.x - start.x, e.y - start.y) * e.zoom);
      const shape = build(start, e);
      if (!item) {
        // a line has no inside, so it takes the stroke color and falls back to black
        const stroke = clonePaint(get(strokePaint)) ?? (filled ? null : solid('#000000'));
        const style = defaultStyle(filled ? clonePaint(get(fillPaint)) : null, stroke, get(strokeWidth));
        item = makePathItem(shape.name ?? name, shape.path, style, shape.transform);
      } else {
        item = { ...item, name: shape.name ?? name, path: shape.path, transform: shape.transform };
      }
      editor.previewAdded = [{ layerId, item }];
      editor.markAll();
    },

    up() {
      if (start && layerId && item && size >= MIN_SIZE) {
        const done = item;
        editor.previewAdded = [];
        editor.insertItem(layerId, done, `Draw ${done.name.toLowerCase()}`);
      }
      cancel();
    },

    key(e) {
      if (e.key === 'Escape' && start) {
        e.preventDefault();
        cancel();
      }
    },

    deactivate() {
      cancel();
    }
  };
}

// the box a rect or an ellipse fills: shift makes it square, alt grows it from the start point
export function dragBox(start: Vec, e: ToolEvent): { x: number; y: number; w: number; h: number } {
  let dx = e.x - start.x;
  let dy = e.y - start.y;
  if (e.shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  if (e.alt) return { x: start.x - dx, y: start.y - dy, w: dx * 2, h: dy * 2 };
  return { x: start.x, y: start.y, w: dx, h: dy };
}
