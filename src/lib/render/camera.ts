import type { Doc, Layer, Mat } from '$lib/core/types';
import { multiply, translate } from '$lib/core/mat';
import {
  cameraLayerOf,
  cameraMatrix,
  cameraStateAt,
  fadeAmount,
  layerParallax,
  slideOffsets,
  transitionAt,
  type ActiveTransition
} from '$lib/anim/camera';
import { applyEase } from '$lib/anim/easing';
import { renderLayers } from './renderer';
import type { Ctx2D } from '$lib/core/style';
import { context, sized, type Surface } from './surface';

// one frame of the video as the camera films it. the export, the thumbnails and the camera view of
// the stage all draw through here, so what plays on the ipad is what the video shows

export interface CameraFrameOptions {
  frame: number;
  // document units to device pixels, a scale and a move: the export scales to its size, the stage
  // puts it where the view has the stage
  base: Mat;
  // leaves the background out
  transparent: boolean;
  // the camera layer is left out, the stage as it is without it
  noCamera?: boolean;
}

// the camera is off when there is none or its layer is hidden
export function activeCamera(doc: Doc): Layer | null {
  const cam = cameraLayerOf(doc.layers);
  return cam && cam.visible ? cam : null;
}

// what each layer goes through at frame: the camera, as far as its parallax lets it follow
export function cameraLayerMatrix(doc: Doc, frame: number): ((layer: Layer) => Mat) | undefined {
  const cam = activeCamera(doc);
  if (!cam) return undefined;
  const state = cameraStateAt(cam, frame, doc.fps, doc.width, doc.height);
  const byDepth = new Map<number, Mat>();
  return (layer: Layer) => {
    const depth = layerParallax(doc.layers, layer);
    let m = byDepth.get(depth);
    if (!m) {
      m = cameraMatrix(state, doc.width, doc.height, depth);
      byDepth.set(depth, m);
    }
    return m;
  };
}

function setMatrix(ctx: Ctx2D, m: Mat) {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

// the shot at frame: background and layers through the camera
function drawShot(ctx: Ctx2D, doc: Doc, frame: number, base: Mat, transparent: boolean, noCamera: boolean) {
  ctx.save();
  if (!transparent) {
    setMatrix(ctx, base);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = doc.bg;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  const layerMatrix = noCamera ? undefined : cameraLayerMatrix(doc, frame);
  renderLayers(ctx, doc.layers, base, { frame, outline: false, assets: doc.assets, noGuides: true, layerMatrix });
  ctx.restore();
}

// the device pixels the stage covers, base is a scale and a move
function deviceRect(doc: Doc, base: Mat) {
  return { x: base[4], y: base[5], w: Math.max(1, Math.ceil(doc.width * base[0])), h: Math.max(1, Math.ceil(doc.height * base[3])) };
}

// the last picture of the shot before a crossfade, a zoom or a slide, drawn once and kept while the
// transition plays. one picture at most, it goes when another one is needed
let held: { layers: Layer[]; assets: Doc['assets']; frame: number; w: number; h: number; transparent: boolean; surface: Surface } | null = null;

function heldPicture(doc: Doc, frame: number, base: Mat, transparent: boolean): Surface {
  const r = deviceRect(doc, base);
  if (
    held &&
    held.layers === doc.layers &&
    held.assets === doc.assets &&
    held.frame === frame &&
    held.w === r.w &&
    held.h === r.h &&
    held.transparent === transparent
  ) {
    return held.surface;
  }
  const surface = sized(held?.surface ?? null, r.w, r.h);
  const ctx = context(surface);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, r.w, r.h);
  drawShot(ctx, doc, frame, [base[0], 0, 0, base[3], 0, 0], transparent, false);
  held = { layers: doc.layers, assets: doc.assets, frame, w: r.w, h: r.h, transparent, surface };
  return surface;
}

// lets go of the kept picture, a document closing or the memory running low
export function releaseCameraCache() {
  if (held) {
    held.surface.width = 0;
    held.surface.height = 0;
  }
  held = null;
}

function drawTransition(ctx: Ctx2D, doc: Doc, o: CameraFrameOptions, t: ActiveTransition) {
  const { frame, base, transparent } = o;
  const kind = t.transition.kind;
  if (kind === 'fade') {
    drawShot(ctx, doc, frame, base, transparent, false);
    ctx.save();
    setMatrix(ctx, base);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fadeAmount(t.p);
    ctx.fillStyle = t.transition.color;
    ctx.fillRect(0, 0, doc.width, doc.height);
    ctx.restore();
    return;
  }
  const picture = heldPicture(doc, t.at - 1, base, transparent);
  const r = deviceRect(doc, base);
  const e = applyEase('inout', t.p);
  ctx.save();
  if (kind === 'slide') {
    const s = slideOffsets(t.transition.direction, t.p);
    drawShot(ctx, doc, frame, multiply(translate(s.fresh.x * r.w, s.fresh.y * r.h), base), transparent, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(picture, r.x + s.old.x * r.w, r.y + s.old.y * r.h, r.w, r.h);
  } else if (kind === 'zoom') {
    // the old shot flies at the viewer and fades, the new one is there behind it
    drawShot(ctx, doc, frame, base, transparent, false);
    const k = 1 + 1.6 * e;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.setTransform(k, 0, 0, k, cx - k * cx, cy - k * cy);
    ctx.globalAlpha = 1 - e;
    ctx.drawImage(picture, r.x, r.y, r.w, r.h);
  } else {
    // crossfade: the new shot shows through the old one as it dissolves
    drawShot(ctx, doc, frame, base, transparent, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - e;
    ctx.drawImage(picture, r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

// the frame as the video shows it, the caller clips to the stage rect when it draws on a bigger canvas
export function renderCameraFrame(ctx: Ctx2D, doc: Doc, o: CameraFrameOptions) {
  const cam = o.noCamera ? null : activeCamera(doc);
  const t = cam ? transitionAt(cam, o.frame) : null;
  if (!t) {
    drawShot(ctx, doc, o.frame, o.base, o.transparent, !!o.noCamera);
    return;
  }
  drawTransition(ctx, doc, o, t);
}
