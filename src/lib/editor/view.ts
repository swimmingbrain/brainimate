import { get } from 'svelte/store';
import { stageSize, view, type View } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 64;

// the steps zoom in and zoom out walk through
const ZOOM_STEPS = [0.02, 0.05, 0.1, 0.125, 0.25, 1 / 3, 0.5, 2 / 3, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

// css size of the stage area, the stage reports it on every resize
const viewport = { width: 0, height: 0 };

let redraw: (() => void) | null = null;

// the stage element, for points dropped onto it from elsewhere
let stageElement: HTMLElement | null = null;

export function setStageElement(el: HTMLElement | null) {
  stageElement = el;
}

// the document point under a pointer anywhere on the page, null when it is not over the stage
export function stagePoint(clientX: number, clientY: number): { x: number; y: number } | null {
  if (!stageElement) return null;
  const r = stageElement.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  return screenToWorld(get(view), clientX - r.left, clientY - r.top);
}

// the stage refits on every resize until someone zooms or pans by hand
let autoFit = true;

export function setViewport(width: number, height: number) {
  viewport.width = width;
  viewport.height = height;
}

export function setAutoFit(on: boolean) {
  autoFit = on;
}

export function isAutoFit(): boolean {
  return autoFit;
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
  // a small window keeps a smaller margin, or the stage would vanish
  const m = Math.min(margin, width * 0.08, height * 0.08);
  const zoom = clampZoom(Math.min((width - m * 2) / docWidth, (height - m * 2) / docHeight));
  return { zoom, panX: (width - docWidth * zoom) / 2, panY: (height - docHeight * zoom) / 2 };
}

export function zoomTo(zoom: number) {
  autoFit = false;
  view.update((v) => zoomAround(v, zoom, viewport.width / 2, viewport.height / 2));
}

function stepUp(z: number): number {
  return ZOOM_STEPS.find((s) => s > z * 1.001) ?? ZOOM_MAX;
}

function stepDown(z: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? ZOOM_MIN;
}

export function zoomIn() {
  zoomTo(stepUp(get(view).zoom));
}

export function zoomOut() {
  zoomTo(stepDown(get(view).zoom));
}

// the zoom tool, around the clicked point instead of the middle
export function zoomStepAt(sx: number, sy: number, out: boolean) {
  autoFit = false;
  view.update((v) => zoomAround(v, out ? stepDown(v.zoom) : stepUp(v.zoom), sx, sy));
}

// fits a world rect into the window
export function zoomToRect(minX: number, minY: number, maxX: number, maxY: number) {
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0 || viewport.width === 0) return;
  autoFit = false;
  view.set(fitView(viewport.width, viewport.height, w, h, 16));
  view.update((v) => ({ ...v, panX: v.panX - minX * v.zoom, panY: v.panY - minY * v.zoom }));
}

export function zoomActual() {
  zoomTo(1);
}

export function zoomFit() {
  if (viewport.width === 0 || viewport.height === 0) return;
  const size = get(stageSize);
  view.set(fitView(viewport.width, viewport.height, size.width, size.height));
  autoFit = true;
}

// the stage at 100 percent in the middle of the window
export function zoomCentered() {
  if (viewport.width === 0 || viewport.height === 0) return;
  const size = get(stageSize);
  autoFit = false;
  view.set({ zoom: 1, panX: (viewport.width - size.width) / 2, panY: (viewport.height - size.height) / 2 });
}

// a document that opens fits the window or shows at 100 percent, as the preferences say
export function zoomForOpen() {
  if (get(preferences).stage.zoomOnOpen === 'actual') zoomCentered();
  else zoomFit();
}
