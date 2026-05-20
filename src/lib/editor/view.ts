import { get } from 'svelte/store';
import { stageSize, view, type View } from '$lib/stores/app';

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 64;

// the steps zoom in and zoom out walk through
const ZOOM_STEPS = [0.02, 0.05, 0.1, 0.125, 0.25, 1 / 3, 0.5, 2 / 3, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

// css size of the stage area, the stage reports it on every resize
const viewport = { width: 0, height: 0 };

let redraw: (() => void) | null = null;

export function setViewport(width: number, height: number) {
  viewport.width = width;
  viewport.height = height;
}

export function setRedraw(fn: (() => void) | null) {
  redraw = fn;
}

// for anything that draws on the stage and changed outside the stores it watches
export function requestRedraw() {
  redraw?.();
}

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

export function screenToWorld(v: View, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

export function worldToScreen(v: View, x: number, y: number): { x: number; y: number } {
  return { x: x * v.zoom + v.panX, y: y * v.zoom + v.panY };
}

// the world point under (sx, sy) stays where it is
export function zoomAround(v: View, zoom: number, sx: number, sy: number): View {
  const next = clampZoom(zoom);
  const w = screenToWorld(v, sx, sy);
  return { zoom: next, panX: sx - w.x * next, panY: sy - w.y * next };
}

export function fitView(width: number, height: number, docWidth: number, docHeight: number, margin = 48): View {
  const zoom = clampZoom(Math.min((width - margin * 2) / docWidth, (height - margin * 2) / docHeight));
  return { zoom, panX: (width - docWidth * zoom) / 2, panY: (height - docHeight * zoom) / 2 };
}

export function zoomTo(zoom: number) {
  view.update((v) => zoomAround(v, zoom, viewport.width / 2, viewport.height / 2));
}

export function zoomIn() {
  const z = get(view).zoom;
  zoomTo(ZOOM_STEPS.find((s) => s > z * 1.001) ?? ZOOM_MAX);
}

export function zoomOut() {
  const z = get(view).zoom;
  zoomTo([...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? ZOOM_MIN);
}

export function zoomActual() {
  zoomTo(1);
}

export function zoomFit() {
  if (viewport.width === 0 || viewport.height === 0) return;
  const size = get(stageSize);
  view.set(fitView(viewport.width, viewport.height, size.width, size.height));
}
