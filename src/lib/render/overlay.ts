import { get } from 'svelte/store';
import type { Item, Mat, PathItem, Vec } from '$lib/core/types';
import { applyPoint, identity, invert, multiply } from '$lib/core/mat';
import { corners, fromRect, isEmpty, transformBox, type Box } from '$lib/core/bbox';
import { contours, localBounds } from '$lib/core/items';
import { shapePath2D } from './pathcache';
import { editor, hover } from '$lib/editor/editor';
import { frameHandles, framePoint, selectionFrame } from '$lib/editor/selection';
import { snapState } from '$lib/editor/snap';
import { guideState } from '$lib/editor/guides';
import { preferences } from '$lib/stores/preferences';
import { activeTool, anchorSelection, boneSelection, playing, selection, type View } from '$lib/stores/app';
import { isLayerShown } from '$lib/anim/timeline';
import { drawBones, weightColor } from './bones';
import { safeZoneFor } from '$lib/core/comic';
import { cameraMatrix, cameraStateAt } from '$lib/anim/camera';
import { activeCamera } from './camera';
import { showingCamera } from '$lib/editor/camera';

export const HANDLE_SIZE = 7;
// screen pixels of the anchor glyphs and the handle dots, the preferences set them
export const marks = { anchor: 7, handleDot: 6, showAnchors: true };

// what the tools ask the overlay to show besides the selection
export const overlayState: {
  // world rect being dragged out
  marquee: Box | null;
  // hides the handle box while a tool does something where it would be in the way
  hideFrame: boolean;
  // the bone joint under the pointer
  joint: { bone: string; end: 'origin' | 'tip' } | null;
} = { marquee: null, hideFrame: false, joint: null };

export interface OverlayColors {
  accent: string;
}

// screen = view * base * world, in css pixels, the context already holds the dpr. base takes the
// space of an open symbol to the document
function screenMatrix(v: View, world: Mat): Mat {
  return multiply([v.zoom, 0, 0, v.zoom, v.panX, v.panY], multiply(editor.base(), world));
}

function toScreen(v: View, p: Vec): Vec {
  const q = applyPoint(editor.base(), p);
  return { x: q.x * v.zoom + v.panX, y: q.y * v.zoom + v.panY };
}

function screenPath(item: PathItem, m: Mat): Path2D {
  const p = new Path2D();
  p.addPath(shapePath2D(item.path, item.subpaths), { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
  return p;
}

// the shape of an item for highlights: its path, or the box of anything else
function outlineItem(ctx: CanvasRenderingContext2D, item: Item, m: Mat) {
  if (item.type === 'path') {
    if (item.path.anchors.length > 0) ctx.stroke(screenPath(item, m));
    return;
  }
  const b = localBounds(item);
  if (isEmpty(b)) return;
  const pts = corners(b).map((p) => applyPoint(m, p));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

function layerColor(id: string, fallback: string): string {
  return editor.layerOfItem(id)?.color ?? fallback;
}

function drawFrame(ctx: CanvasRenderingContext2D, v: View, accent: string) {
  const f = selectionFrame();
  if (!f) return;
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ].map((u) => toScreen(v, framePoint(f, u)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();

  const half = HANDLE_SIZE / 2;
  ctx.fillStyle = '#ffffff';
  for (const h of frameHandles(f)) {
    const p = toScreen(v, h);
    const x = Math.round(p.x - half) + 0.5;
    const y = Math.round(p.y - half) + 0.5;
    ctx.fillRect(x, y, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
    ctx.strokeRect(x, y, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
  }
}

function drawAnchors(ctx: CanvasRenderingContext2D, v: View, item: PathItem, world: Mat, color: string) {
  const m = screenMatrix(v, world);
  const refs = get(anchorSelection).filter((a) => a.itemId === item.id);
  const list = contours(item);
  const size = marks.anchor;
  const half = size / 2;
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;

  // handles of the picked anchors, under the anchor glyphs
  for (const ref of refs) {
    const a = list[ref.sub]?.anchors[ref.index];
    if (!a) continue;
    const p = applyPoint(m, a);
    for (const [hx, hy] of [
      [a.ix, a.iy],
      [a.ox, a.oy]
    ]) {
      if (hx === 0 && hy === 0) continue;
      const h = applyPoint(m, { x: a.x + hx, y: a.y + hy });
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, marks.handleDot / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  list.forEach((contour, sub) => {
    const picked = new Set(refs.filter((r) => r.sub === sub).map((r) => r.index));
    contour.anchors.forEach((a, i) => {
      const p = applyPoint(m, a);
      ctx.fillStyle = picked.has(i) ? color : '#ffffff';
      ctx.beginPath();
      if (a.kind === 'corner') {
        ctx.rect(Math.round(p.x - half) + 0.5, Math.round(p.y - half) + 0.5, size - 1, size - 1);
      } else {
        ctx.arc(p.x, p.y, half, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    });
  });
}

// with the bind tool: items bound rigidly get an outline in their bone's color, a selected item bound
// smooth shows its anchors tinted with the colors of the bones they follow
function drawBindings(ctx: CanvasRenderingContext2D, v: View) {
  const colors = new Map<string, string>();
  for (const l of editor.currentLayers()) for (const b of l.bones) colors.set(b.id, b.color);
  const walk = (items: Item[], parent: Mat) => {
    for (const item of items) {
      const world = multiply(parent, item.transform);
      const bone = item.skin?.rigid ? colors.get(item.skin.rigid) : null;
      if (bone) {
        ctx.strokeStyle = bone;
        ctx.lineWidth = 1.5;
        outlineItem(ctx, item, screenMatrix(v, world));
      } else if (item.type === 'group') {
        walk(item.children, world);
      }
    }
  };
  for (const layer of editor.currentLayers()) {
    if (editor.isEditable(layer)) walk(editor.shownItems(layer), identity());
  }
  for (const id of get(selection)) {
    const item = editor.shownItem(id);
    if (item?.type !== 'path' || !item.skin || item.skin.rigid) continue;
    const m = screenMatrix(v, editor.shownWorld(id));
    const weights = item.skin.weights;
    let i = 0;
    ctx.lineWidth = 1;
    for (const c of contours(item)) {
      for (const a of c.anchors) {
        const p = applyPoint(m, a);
        ctx.fillStyle = weightColor(weights[i++] ?? [], (b) => colors.get(b) ?? null) ?? '#ffffff';
        ctx.strokeStyle = '#111113';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

// the bones of the rig layers that show, over everything: for posing with the selection tool and
// always with the bone and bind tools, which also show each bone's reach
function drawRig(ctx: CanvasRenderingContext2D, v: View, tool: string) {
  const prefs = get(preferences).rig;
  const rigTool = tool === 'bone' || tool === 'bind';
  if (!rigTool && !((tool === 'select' || tool === 'transform') && prefs.showBones)) return;
  const layers = editor.currentLayers();
  const rig = editor.rig();
  if (!rig) return;
  if (tool === 'bind') drawBindings(ctx, v);
  const shown = new Set(layers.filter((l) => l.type === 'rig' && isLayerShown(layers, l)).flatMap((l) => l.bones.map((b) => b.id)));
  const bones = rig.bones.filter((b) => shown.has(b.id));
  if (bones.length === 0) return;
  drawBones(ctx, {
    bones,
    worlds: rig.world,
    m: screenMatrix(v, identity()),
    selected: get(boneSelection),
    hover: overlayState.joint,
    capsules: rigTool && prefs.showCapsules
  });
}

// a polygon of world points on the screen, the stage of the main timeline
function worldPolygon(ctx: CanvasRenderingContext2D, v: View, pts: Vec[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = p.x * v.zoom + v.panX;
    const y = p.y * v.zoom + v.panY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

// a rect of the video frame through frame, which takes video points to the stage
function frameRect(frame: Mat, x0: number, y0: number, x1: number, y1: number): Vec[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ].map((p) => applyPoint(frame, p));
}

// on a 9 by 16 stage the margins the video app covers with its buttons and captions are shaded, the
// line around the rest shows where text and faces stay readable. with a camera they sit in what it
// films. exports never show them
function drawSafeZones(ctx: CanvasRenderingContext2D, v: View, frame: Mat) {
  if (!get(preferences).stage.safeZones) return;
  const doc = editor.doc;
  const z = safeZoneFor(doc.width, doc.height);
  if (!z) return;
  const W = doc.width;
  const H = doc.height;
  ctx.fillStyle = 'rgba(20, 18, 24, 0.16)';
  const bands: [number, number, number, number][] = [
    [0, 0, W, z.top],
    [0, H - z.bottom, W, H],
    [0, z.top, z.left, H - z.bottom],
    [W - z.right, z.top, W, H - z.bottom]
  ];
  for (const b of bands) {
    worldPolygon(ctx, v, frameRect(frame, ...b));
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 64, 129, 0.75)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  worldPolygon(ctx, v, frameRect(frame, z.left, z.top, W - z.right, H - z.bottom));
  ctx.stroke();
  ctx.setLineDash([]);
  if (H * v.zoom < 160) return;
  const at = applyPoint(frame, { x: z.left, y: z.top });
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255, 64, 129, 0.9)';
  ctx.fillText('safe zone', at.x * v.zoom + v.panX + 4, at.y * v.zoom + v.panY + 4);
}

// where the camera looks at the playhead, video points to the stage, null without a camera
function cameraFrame(): Mat | null {
  if (editor.editStack.length > 0) return null;
  const doc = editor.doc;
  const cam = activeCamera(doc);
  if (!cam) return null;
  const state = cameraStateAt(cam, editor.frame, doc.fps, doc.width, doc.height);
  return invert(cameraMatrix(state, doc.width, doc.height));
}

// the frame the camera films, with its middle and the handles the camera tool turns and zooms with
export const CAMERA_FRAME_COLOR = '#e0b341';

function drawCameraFrame(ctx: CanvasRenderingContext2D, v: View, frame: Mat, handles: boolean) {
  const doc = editor.doc;
  const W = doc.width;
  const H = doc.height;
  const corners = frameRect(frame, 0, 0, W, H);
  ctx.strokeStyle = CAMERA_FRAME_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  worldPolygon(ctx, v, corners);
  ctx.stroke();
  ctx.setLineDash([]);
  const mid = applyPoint(frame, { x: W / 2, y: H / 2 });
  const mx = mid.x * v.zoom + v.panX;
  const my = mid.y * v.zoom + v.panY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx - 8, my);
  ctx.lineTo(mx + 8, my);
  ctx.moveTo(mx, my - 8);
  ctx.lineTo(mx, my + 8);
  ctx.stroke();
  const tl = corners[0];
  ctx.font = '11px "Inter", sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = CAMERA_FRAME_COLOR;
  ctx.fillText('Camera', tl.x * v.zoom + v.panX + 2, tl.y * v.zoom + v.panY - 4);
  if (!handles) return;
  ctx.fillStyle = CAMERA_FRAME_COLOR;
  for (const c of corners) {
    ctx.fillRect(c.x * v.zoom + v.panX - 7, c.y * v.zoom + v.panY - 7, 14, 14);
  }
  const top = applyPoint(frame, { x: W / 2, y: 0 });
  const knob = cameraKnob(frame, v);
  ctx.beginPath();
  ctx.moveTo(top.x * v.zoom + v.panX, top.y * v.zoom + v.panY);
  ctx.lineTo(knob.x, knob.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

// the knob above the camera frame that turns it, in screen pixels
export function cameraKnob(frame: Mat, v: View): Vec {
  const doc = editor.doc;
  const top = applyPoint(frame, { x: doc.width / 2, y: 0 });
  const mid = applyPoint(frame, { x: doc.width / 2, y: doc.height / 2 });
  const dx = top.x - mid.x;
  const dy = top.y - mid.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: top.x * v.zoom + v.panX + (dx / d) * 36, y: top.y * v.zoom + v.panY + (dy / d) * 36 };
}

export { cameraFrame };

// guides run across the whole view, the one being dragged follows the pointer
function drawGuides(ctx: CanvasRenderingContext2D, v: View, width: number, height: number) {
  const prefs = get(preferences);
  const drag = guideState.drag;
  if (!prefs.guides.show && !drag) return;
  const g = editor.doc.guides;
  const line = (axis: 'h' | 'v', value: number) => {
    if (axis === 'h') {
      const y = Math.round(value * v.zoom + v.panY) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    } else {
      const x = Math.round(value * v.zoom + v.panX) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
  };
  ctx.strokeStyle = prefs.guides.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (prefs.guides.show) {
    for (const axis of ['h', 'v'] as const) {
      g[axis].forEach((value, i) => {
        if (drag && drag.axis === axis && drag.index === i) return;
        line(axis, value);
      });
    }
  }
  ctx.stroke();
  if (!drag) return;
  // a guide about to be dropped on its ruler goes faint
  ctx.globalAlpha = drag.remove ? 0.35 : 1;
  ctx.beginPath();
  line(drag.axis, drag.value);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// the lines a drag snapped to, across the stage, with a small word next to the point
function drawSnap(ctx: CanvasRenderingContext2D, v: View) {
  const r = snapState.result;
  if (!r) return;
  const doc = editor.doc;
  // the lines run across the stage, inside an open symbol across the stage seen from its space
  const stage = transformBox(fromRect(0, 0, doc.width, doc.height), invert(editor.base()));
  // magenta unless the preferences pick another color
  const color = get(preferences).snapping.smartColor;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const line of r.lines) {
    const lo = { x: Math.min(stage.minX, r.x), y: Math.min(stage.minY, r.y) };
    const hi = { x: Math.max(stage.maxX, r.x), y: Math.max(stage.maxY, r.y) };
    const from = line.axis === 'x' ? { x: line.value, y: lo.y } : { x: lo.x, y: line.value };
    const to = line.axis === 'x' ? { x: line.value, y: hi.y } : { x: hi.x, y: line.value };
    const a = toScreen(v, from);
    const b = toScreen(v, to);
    // a straight line lands on the middle of a pixel to stay sharp
    if (Math.abs(a.x - b.x) < 1e-6) a.x = b.x = Math.round(a.x) + 0.5;
    if (Math.abs(a.y - b.y) < 1e-6) a.y = b.y = Math.round(a.y) + 0.5;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  if (!r.label) return;
  const p = toScreen(v, r);
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(r.label).width + 8;
  ctx.fillStyle = 'rgba(17, 17, 19, 0.85)';
  ctx.fillRect(p.x + 10, p.y - 20, w, 14);
  ctx.fillStyle = color;
  ctx.fillText(r.label, p.x + 14, p.y - 13);
}

// hover and selection outlines, the handle box, the marquee and anchors for the direct tool
export function drawOverlay(ctx: CanvasRenderingContext2D, v: View, dpr: number, colors: OverlayColors) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.setLineDash([]);
  const tool = get(activeTool);
  const sel = get(selection);
  const direct = tool === 'direct';
  // playback redraws every frame, so it leaves out the hover and the anchors
  const busy = get(playing);
  // the path tools show anchors too, so you can see where to add, remove or go on
  const anchors = !busy && (direct || ((tool === 'pen' || tool === 'curvature') && marks.showAnchors));
  // the camera view shows the video: the safe zones on it and nothing of the editing
  if (get(showingCamera)) {
    drawSafeZones(ctx, v, identity());
    ctx.restore();
    return;
  }
  const camFrame = cameraFrame();
  drawSafeZones(ctx, v, camFrame ?? identity());
  if (camFrame && !busy) drawCameraFrame(ctx, v, camFrame, tool === 'camera');
  drawGuides(ctx, v, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

  // outlines and anchors follow what shows, a bound item bent by the rig
  const h = busy ? null : get(hover);
  if (h && !sel.has(h)) {
    const item = editor.shownItem(h);
    if (item) {
      ctx.strokeStyle = layerColor(h, colors.accent);
      ctx.lineWidth = 2;
      outlineItem(ctx, item, screenMatrix(v, editor.shownWorld(h)));
    }
  }

  for (const id of sel) {
    const item = editor.shownItem(id);
    if (!item) continue;
    const color = layerColor(id, colors.accent);
    const world = editor.shownWorld(id);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    outlineItem(ctx, item, screenMatrix(v, world));
    if (anchors && item.type === 'path') drawAnchors(ctx, v, item, world, color);
  }

  if (!direct && !overlayState.hideFrame && sel.size > 0 && (tool === 'select' || tool === 'transform')) {
    drawFrame(ctx, v, colors.accent);
  }

  if (!busy) drawRig(ctx, v, tool);

  const mq = overlayState.marquee;
  if (mq && !isEmpty(mq)) {
    // corners one by one, inside a turned symbol the box is turned too
    const pts = corners(mq).map((p) => toScreen(v, p));
    const straight = Math.abs(pts[0].y - pts[1].y) < 1e-6;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = straight ? Math.round(p.x) + 0.5 : p.x;
      const y = straight ? Math.round(p.y) + 0.5 : p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(209, 154, 102, 0.08)';
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  drawSnap(ctx, v);
  ctx.restore();
}

// tool overlays draw in world space, so screen sizes are divided by the zoom
export function worldAnchor(
  ctx: CanvasRenderingContext2D,
  p: Vec,
  corner: boolean,
  filled: boolean,
  color: string,
  zoom: number
) {
  const half = marks.anchor / 2 / zoom;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = color;
  ctx.fillStyle = filled ? color : '#ffffff';
  ctx.beginPath();
  if (corner) ctx.rect(p.x - half, p.y - half, half * 2, half * 2);
  else ctx.arc(p.x, p.y, half, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function worldHandle(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, color: string, zoom: number) {
  if (from.x === to.x && from.y === to.y) return;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(to.x, to.y, marks.handleDot / 2 / zoom, 0, Math.PI * 2);
  ctx.fill();
}
