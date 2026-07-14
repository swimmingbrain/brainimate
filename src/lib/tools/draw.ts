import { get } from 'svelte/store';
import type { Layer, Paint, Style, Vec } from '$lib/core/types';
import { clonePaint, defaultStyle, paintColor, paintAlpha, rgba, solid } from '$lib/core/style';
import { editor } from '$lib/editor/editor';
import { addToast, fillPaint, strokePaint, strokeWidth } from '$lib/stores/app';

// the accent, for previews of paths that have no stroke to show
export const PREVIEW_COLOR = '#d19a66';

// the active layer when the tools may draw on it, otherwise a short note says why not
export function drawingLayer(): Layer | null {
  const layer = editor.activeLayer();
  if (!layer || !editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return null;
  }
  return layer;
}

// the style new paths get from the fill and stroke chips
export function currentStyle(): Style {
  return defaultStyle(clonePaint(get(fillPaint)), clonePaint(get(strokePaint)), get(strokeWidth));
}

// a stroke for lines that have no inside, black when the stroke chip is empty
export function lineStyle(): Style {
  return defaultStyle(null, clonePaint(get(strokePaint)) ?? solid('#000000'), get(strokeWidth));
}

// one css color for a paint in a preview, gradients show their first stop
export function previewColor(p: Paint | null, fallback = PREVIEW_COLOR): string {
  const color = paintColor(p);
  return color ? rgba(color, paintAlpha(p)) : fallback;
}

// the rubber band and freehand previews use the stroke of the path they belong to
export function setPreviewStroke(ctx: CanvasRenderingContext2D, style: Style | null, zoom: number) {
  const visible = style?.stroke && style.width > 0;
  ctx.strokeStyle = visible ? previewColor(style.stroke) : PREVIEW_COLOR;
  ctx.lineWidth = visible ? style.width : 1 / zoom;
  ctx.lineCap = style?.cap ?? 'round';
  ctx.lineJoin = style?.join ?? 'round';
  ctx.setLineDash([]);
}

export function polylinePath(ctx: CanvasRenderingContext2D, points: Vec[], closed = false) {
  ctx.beginPath();
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (closed) ctx.closePath();
}
