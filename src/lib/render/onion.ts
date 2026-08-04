import type { Layer } from '$lib/core/types';
import type { Ctx2D } from '$lib/core/style';
import { hasFrames, isLayerShown } from '$lib/anim/timeline';
import { context, surface, type Surface } from './surface';

export interface OnionOptions {
  // the ghost frames, nearest to the playhead first
  before: number[];
  after: number[];
  beforeColor: string;
  afterColor: string;
  // strokes only, in the tint color
  outline: boolean;
}

// the frames next to the playhead, or with keyframes only the keyframes of the visible layers
export function onionFrames(
  layers: Layer[],
  frame: number,
  before: number,
  after: number,
  keyframesOnly: boolean,
  length: number
): { before: number[]; after: number[] } {
  if (!keyframesOnly) {
    const back: number[] = [];
    const ahead: number[] = [];
    for (let i = 1; i <= before && frame - i >= 0; i++) back.push(frame - i);
    for (let i = 1; i <= after && frame + i < length; i++) ahead.push(frame + i);
    return { before: back, after: ahead };
  }
  const keys = new Set<number>();
  for (const layer of layers) {
    if (!hasFrames(layer) || !isLayerShown(layers, layer)) continue;
    for (const k of layer.keyframes) if (k.frame < layer.length) keys.add(k.frame);
  }
  const sorted = [...keys].sort((a, b) => a - b);
  return {
    before: sorted.filter((f) => f < frame).reverse().slice(0, before),
    after: sorted.filter((f) => f > frame).slice(0, after)
  };
}

// 0.5 right next to the playhead, 0.15 less for every step further away
export function onionAlpha(distance: number): number {
  return Math.max(0.05, 0.5 - 0.15 * (distance - 1));
}

// one ghost layer per frame is drawn into scratch, tinted and laid onto the composite. the
// composite is kept until the document, the frame, the view or the settings change, so tool
// drags and hover redraws only pay for one drawImage
let scratch: Surface | null = null;
let composite: Surface | null = null;
let builtFor: { layers: Layer[]; key: string } | null = null;

export function drawOnion(
  ctx: Ctx2D,
  layers: Layer[],
  key: string,
  opts: OnionOptions,
  render: (target: Ctx2D, frame: number, outline: boolean) => void
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w === 0 || h === 0) return;
  if (!composite || composite.width !== w || composite.height !== h) {
    composite = surface(w, h);
    scratch = surface(w, h);
    builtFor = null;
  }
  if (!builtFor || builtFor.layers !== layers || builtFor.key !== key) {
    const out = context(composite);
    const tmp = context(scratch!);
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.clearRect(0, 0, w, h);
    const ghosts = [
      ...opts.before.map((f, i) => ({ frame: f, distance: i + 1, color: opts.beforeColor })),
      ...opts.after.map((f, i) => ({ frame: f, distance: i + 1, color: opts.afterColor }))
    ];
    // the far ones first, so the ghosts closest to the playhead sit on top
    ghosts.sort((a, b) => b.distance - a.distance);
    for (const g of ghosts) {
      tmp.setTransform(1, 0, 0, 1, 0, 0);
      tmp.globalAlpha = 1;
      tmp.globalCompositeOperation = 'source-over';
      tmp.clearRect(0, 0, w, h);
      render(tmp, g.frame, opts.outline);
      tmp.setTransform(1, 0, 0, 1, 0, 0);
      tmp.globalCompositeOperation = 'source-atop';
      // a little of the artwork shows through the tint, filled ghosts are not just flat shapes
      tmp.globalAlpha = opts.outline ? 1 : 0.8;
      tmp.fillStyle = g.color;
      tmp.fillRect(0, 0, w, h);
      tmp.globalCompositeOperation = 'source-over';
      tmp.globalAlpha = 1;
      out.globalAlpha = onionAlpha(g.distance);
      out.drawImage(scratch!, 0, 0);
    }
    out.globalAlpha = 1;
    builtFor = { layers, key };
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(composite, 0, 0);
  ctx.restore();
}
