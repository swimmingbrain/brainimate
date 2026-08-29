import type { Bone, Mat, Vec } from '$lib/core/types';
import { applyPoint, scaleFactor } from '$lib/core/mat';
import { hexToRgb, mixHex } from '$lib/core/color';
import { childrenOf, originOf, tipOf } from '$lib/rig/bones';

// css pixels
export const JOINT_RADIUS = 4;
const TIP_RADIUS = 3;
const PIN_COLOR = '#e06c75';

export interface BoneView {
  // the bones to draw, from rig layers that show
  bones: Bone[];
  worlds: Map<string, Mat>;
  // world to css pixels
  m: Mat;
  selected: string | null;
  // the joint under the pointer
  hover: { bone: string; end: 'origin' | 'tip' } | null;
  // the reach of every bone, while the bone or bind tool is active
  capsules: boolean;
}

function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

// the reach around a bone: a line with round ends
function capsule(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, r: number) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.arc(a.x, a.y, r, angle + Math.PI / 2, angle + (Math.PI * 3) / 2);
  ctx.closePath();
}

// a long drop: round around the joint, narrowing to a point at the tip, like animate draws bones
function body(ctx: CanvasRenderingContext2D, o: Vec, t: Vec) {
  const l = Math.hypot(t.x - o.x, t.y - o.y);
  const w = Math.max(2.5, Math.min(7, l * 0.12));
  const a = Math.atan2(t.y - o.y, t.x - o.x);
  ctx.beginPath();
  ctx.moveTo(o.x - Math.sin(a) * w, o.y + Math.cos(a) * w);
  ctx.lineTo(t.x, t.y);
  ctx.lineTo(o.x + Math.sin(a) * w, o.y - Math.cos(a) * w);
  ctx.arc(o.x, o.y, w, a - Math.PI / 2, a - (Math.PI * 3) / 2, true);
  ctx.closePath();
}

// a small red pin standing on the joint
function pin(ctx: CanvasRenderingContext2D, p: Vec) {
  ctx.strokeStyle = PIN_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + 5, p.y - 8);
  ctx.stroke();
  ctx.fillStyle = PIN_COLOR;
  ctx.beginPath();
  ctx.arc(p.x + 6, p.y - 10, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x + 6, p.y - 10, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

function joint(ctx: CanvasRenderingContext2D, p: Vec, r: number, fill: string, edge: string) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// the bones over the artwork in css pixels: reaches first, then the bodies, the joints and the pins
export function drawBones(ctx: CanvasRenderingContext2D, v: BoneView) {
  const placed = v.bones.flatMap((bone) => {
    const w = v.worlds.get(bone.id);
    if (!w) return [];
    const o = applyPoint(v.m, originOf(w));
    const t = applyPoint(v.m, tipOf(w, bone));
    return [{ bone, o, t, scale: scaleFactor(w) * scaleFactor(v.m) }];
  });
  ctx.save();
  ctx.setLineDash([]);
  if (v.capsules) {
    for (const { bone, o, t, scale } of placed) {
      const selected = bone.id === v.selected;
      capsule(ctx, o, t, bone.radius * scale);
      ctx.fillStyle = rgba(bone.color, selected ? 0.18 : 0.12);
      ctx.fill();
      ctx.strokeStyle = rgba(bone.color, selected ? 0.9 : 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  for (const { bone, o, t } of placed) {
    const selected = bone.id === v.selected;
    body(ctx, o, t);
    ctx.fillStyle = rgba(selected ? mixHex(bone.color, '#ffffff', 0.4) : bone.color, 0.85);
    ctx.fill();
    ctx.strokeStyle = selected ? '#ffffff' : mixHex(bone.color, '#000000', 0.45);
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();
  }
  for (const { bone, o, t } of placed) {
    const selected = bone.id === v.selected;
    const fill = selected ? mixHex(bone.color, '#ffffff', 0.4) : bone.color;
    const edge = mixHex(bone.color, '#000000', 0.45);
    joint(ctx, o, JOINT_RADIUS, fill, edge);
    if (childrenOf(v.bones, bone.id).length === 0) joint(ctx, t, TIP_RADIUS, fill, edge);
    const h = v.hover;
    if (h && h.bone === bone.id) {
      const p = h.end === 'origin' ? o : t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, JOINT_RADIUS + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const { bone, o } of placed) if (bone.pinned) pin(ctx, o);
  ctx.restore();
}

// the tint of an anchor bound to several bones: their colors mixed by weight
export function weightColor(weights: { bone: string; w: number }[], colorOf: (id: string) => string | null): string | null {
  let out: string | null = null;
  let total = 0;
  for (const { bone, w } of weights) {
    const c = colorOf(bone);
    if (!c || w <= 0) continue;
    out = out ? mixHex(out, c, w / (total + w)) : c;
    total += w;
  }
  return out;
}
