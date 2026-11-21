import type { Item, PathData, Point3, Turn, TurnRig, Vec } from '$lib/core/types';
import { makePathItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { project, SIDE } from '$lib/rig/turn';
import {
  DEFAULT_FACE,
  LOOKS,
  MOUTH_OPEN,
  MOUTH_SHAPE,
  PART_LABELS,
  anchor,
  browWidth,
  capsulePath,
  ellipsePath,
  limb,
  loop,
  part,
  seeded,
  type BoneName,
  type CharacterOptions,
  type Emotion,
  type FaceStyle,
  type HairStyle,
  type MouthShape
} from './model';

// a character that can be seen from every side. its body is laid out in the room once: the joints, the
// middle of the head, where the eyes, the nose and the mouth sit on the head. every view is that same
// body looked at from an angle, so the face, the hair, the clothes, the colors and the proportions match
// from every side. the parts keep their roles, ids and the number of their anchors at every angle, so a
// turn morphs from one view to the next

export type ViewId = 'front' | 'three' | 'side' | 'backthree' | 'back';
export type Sleeves = 'short' | 'long';
export type Glasses = 'none' | 'round' | 'square';
export type Hat = 'none' | 'cap' | 'beanie';

export const VIEW_ANGLES: Record<ViewId, number> = { front: 90, three: 50, side: SIDE, backthree: -50, back: -90 };

export const SLEEVES: { id: Sleeves; label: string }[] = [
  { id: 'short', label: 'Short sleeves' },
  { id: 'long', label: 'Long sleeves' }
];
export const GLASSES: { id: Glasses; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' }
];
export const HATS: { id: Hat; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'cap', label: 'Cap' },
  { id: 'beanie', label: 'Beanie' }
];

// what a view changes on top of the body, small amounts so the character stays itself
export interface ViewTweak {
  // the head, the face and the hair together
  headScale: number;
  // how wide the upper body and the hip are drawn
  bodyWidth: number;
  // the hair moved and sized, in head radii
  hairX: number;
  hairY: number;
  hairScale: number;
  // the face parts moved, x around the head and y up and down, in head radii
  eyeX: number;
  eyeY: number;
  noseX: number;
  noseY: number;
  mouthX: number;
  mouthY: number;
}

export const NO_TWEAK: ViewTweak = { headScale: 1, bodyWidth: 1, hairX: 0, hairY: 0, hairScale: 1, eyeX: 0, eyeY: 0, noseX: 0, noseY: 0, mouthX: 0, mouthY: 0 };

export interface CharacterModel extends Required<Omit<CharacterOptions, 'name' | 'view' | 'sleeves' | 'glasses' | 'hat'>> {
  sleeves: Sleeves;
  glasses: Glasses;
  hat: Hat;
  tweaks: Partial<Record<ViewId, Partial<ViewTweak>>>;
}

export function modelFrom(o: CharacterOptions, extra: Partial<Pick<CharacterModel, 'sleeves' | 'glasses' | 'hat' | 'tweaks'>> = {}): CharacterModel {
  const { name: _name, view: _view, sleeves: _s, glasses: _g, hat: _h, ...rest } = o;
  void _name;
  void _view;
  void _s;
  void _g;
  void _h;
  return { ...rest, face: { ...DEFAULT_FACE, ...(o.face ?? {}) }, sleeves: 'short', glasses: 'none', hat: 'none', tweaks: {}, ...extra };
}

// the model a character keeps, null for one made before characters could turn
export function modelOf(info: { model?: unknown } | null | undefined): CharacterModel | null {
  const m = info?.model as CharacterModel | undefined;
  if (!m || typeof m.height !== 'number') return null;
  return { ...m, face: { ...DEFAULT_FACE, ...(m.face ?? {}) }, tweaks: m.tweaks ?? {}, sleeves: m.sleeves ?? 'short', glasses: m.glasses ?? 'none', hat: m.hat ?? 'none' };
}

const ORDER: ViewId[] = ['back', 'backthree', 'side', 'three', 'front'];

// the tweak at an angle, blended between the two views around it, so a turn changes it gradually
export function tweakAt(m: Pick<CharacterModel, 'tweaks'>, angle: number): ViewTweak {
  const a = Math.max(-90, Math.min(90, angle > 90 ? 180 - angle : angle < -90 ? -180 - angle : angle));
  const full = (id: ViewId): ViewTweak => ({ ...NO_TWEAK, ...(m.tweaks[id] ?? {}) });
  for (let i = 0; i < ORDER.length - 1; i++) {
    const lo = VIEW_ANGLES[ORDER[i]];
    const hi = VIEW_ANGLES[ORDER[i + 1]];
    if (a >= lo && a <= hi) {
      const t = hi === lo ? 0 : (a - lo) / (hi - lo);
      const p = full(ORDER[i]);
      const q = full(ORDER[i + 1]);
      const out = { ...p };
      for (const k of Object.keys(p) as (keyof ViewTweak)[]) out[k] = p[k] + (q[k] - p[k]) * t;
      return out;
    }
  }
  return full('side');
}

// the joints in the room: forward, across to the near side, up from the floor
export function joints3d(m: Pick<CharacterModel, 'height' | 'build' | 'headSize'>): Record<string, Point3> {
  const u = m.height;
  const w = m.build === 'slim' ? 0.86 : m.build === 'broad' ? 1.18 : 1;
  const hs = Math.max(0.7, Math.min(1.4, m.headSize));
  const up = (t: number) => u * t;
  const out: Record<string, Point3> = {
    hip: [0, 0, up(0.47)],
    hipTop: [0, 0, up(0.52)],
    spine: [0, 0, up(0.6)],
    neckBase: [0.005 * u, 0, up(0.785)],
    neckTop: [0.01 * u, 0, up(0.825)],
    headTop: [0.012 * u, 0, up(0.825 + 0.19 * hs)],
    head: [0.015 * u, 0, up(0.825 + 0.098 * hs)]
  };
  for (const [side, s] of [
    ['R', 1],
    ['L', -1]
  ] as const) {
    out[`shoulder${side}`] = [0.005 * u, s * 0.1 * w * u, up(0.755)];
    out[`elbow${side}`] = [0.012 * u, s * 0.112 * w * u, up(0.61)];
    out[`wrist${side}`] = [0.02 * u, s * 0.112 * w * u, up(0.48)];
    out[`hand${side}`] = [0.025 * u, s * 0.112 * w * u, up(0.425)];
    out[`hip${side}`] = [0, s * 0.05 * w * u, up(0.46)];
    out[`knee${side}`] = [0.012 * u, s * 0.052 * w * u, up(0.245)];
    out[`ankle${side}`] = [0, s * 0.052 * w * u, up(0.055)];
    out[`toe${side}`] = [0.085 * u, s * 0.052 * w * u, up(0.025)];
  }
  return out;
}

const add = (a: Point3, b: Point3, k = 1): Point3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Point3) => Math.hypot(a[0], a[1], a[2]) || 1;
const norm = (a: Point3): Point3 => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

// the finger joints of a hand in the room: on from the hand along the arm, the index finger and the
// thumb toward the front
function fingers3d(j: Record<string, Point3>, side: 'L' | 'R', u: number, w: number) {
  const wrist = j[`wrist${side}`];
  const tip = j[`hand${side}`];
  const d = norm(sub(tip, wrist));
  // forward, made square to the hand
  const f0: Point3 = [1, 0, 0];
  const dot = f0[0] * d[0] + f0[1] * d[1] + f0[2] * d[2];
  const front = norm([f0[0] - d[0] * dot, f0[1] - d[1] * dot, f0[2] - d[2] * dot]);
  const at = (base: Point3, across: number, along: number): Point3 => add(add(base, front, across * u), d, along * u);
  const palm = at(wrist, 0, (len(sub(tip, wrist)) / u) * 0.55);
  return {
    palm,
    fingers: [at(tip, -0.005 * w, -0.008), at(tip, -0.006 * w, 0.034)] as [Point3, Point3],
    index: [at(tip, 0.012 * w, -0.008), at(tip, 0.015 * w, 0.036)] as [Point3, Point3],
    thumb: [at(palm, 0.018 * w, -0.004), at(palm, 0.036 * w, 0.02)] as [Point3, Point3]
  };
}

// every bone of the humanoid from where to where in the room
export function boneSpots(m: Pick<CharacterModel, 'height' | 'build' | 'headSize'>): Record<BoneName, { from: Point3; to: Point3 }> {
  const j = joints3d(m);
  const u = m.height;
  const w = m.build === 'slim' ? 0.86 : m.build === 'broad' ? 1.18 : 1;
  const out: Partial<Record<BoneName, { from: Point3; to: Point3 }>> = {
    Hip: { from: j.hip, to: j.hipTop },
    Spine: { from: j.hip, to: j.spine },
    Chest: { from: j.spine, to: j.neckBase },
    Neck: { from: j.neckBase, to: j.neckTop },
    Head: { from: j.neckTop, to: j.headTop }
  };
  for (const side of ['L', 'R'] as const) {
    const fg = fingers3d(j, side, u, w);
    out[`Upper arm ${side}`] = { from: j[`shoulder${side}`], to: j[`elbow${side}`] };
    out[`Lower arm ${side}`] = { from: j[`elbow${side}`], to: j[`wrist${side}`] };
    out[`Hand ${side}`] = { from: j[`wrist${side}`], to: j[`hand${side}`] };
    out[`Upper leg ${side}`] = { from: j[`hip${side}`], to: j[`knee${side}`] };
    out[`Lower leg ${side}`] = { from: j[`knee${side}`], to: j[`ankle${side}`] };
    out[`Foot ${side}`] = { from: j[`ankle${side}`], to: j[`toe${side}`] };
    out[`Fingers ${side}`] = { from: fg.fingers[0], to: fg.fingers[1] };
    out[`Index ${side}`] = { from: fg.index[0], to: fg.index[1] };
    out[`Thumb ${side}`] = { from: fg.thumb[0], to: fg.thumb[1] };
  }
  return out as Record<BoneName, { from: Point3; to: Point3 }>;
}

const RAD = Math.PI / 180;

interface Head {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

// the face parts on a head seen at an angle. a part sits at a longitude on the head, 0 the middle of the
// face, plus toward the near side; it shows when it turns toward the viewer and narrows as it turns away
export function turnedFace(
  h: Head,
  facing: number,
  angle: number,
  emotion: Emotion,
  mouth: MouthShape,
  blink: boolean,
  style: FaceStyle,
  tw: ViewTweak
): { paths: Record<string, PathData>; shown: Record<string, boolean> } {
  const look = LOOKS[emotion] ?? LOOKS.neutral;
  const r = h.rx;
  const t = angle * RAD;
  const across = (lon: number, k = 0.92) => h.x + facing * r * k * Math.cos(lon * RAD + t);
  const depth = (lon: number) => Math.sin(lon * RAD + t);
  const Y = (y: number) => h.y + y * r;
  const shape = style.eyes;
  const wide = shape === 'oval' ? 0.8 : shape === 'dot' ? 0.6 : shape === 'almond' ? 1.15 : 1;
  const tall = shape === 'oval' ? 1.35 : shape === 'almond' ? 0.72 : shape === 'sleepy' ? 0.5 : 1;
  const eyeH = blink ? 0.08 : look.eye;
  const eyeY = -0.02 + look.eyeUp + style.eyeY + tw.eyeY + (shape === 'sleepy' ? 0.02 : 0);
  const spread = 38 * style.eyeSpacing;
  const shift = tw.eyeX * 40;
  const eyes = { eyeR: spread + shift, eyeL: -spread + shift };
  const paths: Record<string, PathData> = {};
  const shown: Record<string, boolean> = {};
  for (const [role, lon] of Object.entries(eyes)) {
    const d = depth(lon);
    const rx = 0.11 * look.eyeSize * style.eyeSize * wide * r * Math.max(0.12, Math.min(1, d * 1.15));
    const ry = Math.max(0.006 * r, 0.11 * look.eyeSize * style.eyeSize * wide * r * 1.12 * eyeH * (tall / wide));
    const path = ellipsePath(across(lon), Y(eyeY), rx, ry);
    if (shape === 'almond') {
      for (const i of [0, 2]) {
        const a = path.anchors[i];
        path.anchors[i] = { ...a, ix: a.ix * 0.3, iy: a.iy * 0.3, ox: a.ox * 0.3, oy: a.oy * 0.3, kind: 'corner' };
      }
    }
    paths[role] = path;
    shown[role] = d > 0.08;
  }
  // the brows over the eyes, the inner end toward the nose
  const arch = style.brows === 'arched' ? 0.07 : style.brows === 'flat' ? 0 : 0.03;
  const browY = -0.24 + style.eyeY + tw.eyeY;
  for (const [role, eye, ends] of [
    ['browR', 'eyeR', look.browR],
    ['browL', 'eyeL', look.browL]
  ] as const) {
    const lon = eyes[eye];
    const inner = lon - Math.sign(lon || 1) * 13;
    const outer = lon + Math.sign(lon || 1) * 15;
    const a = { x: across(inner), y: Y(browY + ends[0]) };
    const c = { x: across(outer), y: Y(browY + ends[1]) };
    const b = { x: across(lon), y: Y(browY - 0.03 + (ends[0] + ends[1]) / 2 - arch) };
    paths[role] = {
      closed: false,
      anchors: [anchor(a.x, a.y), anchor(b.x, b.y, (a.x - c.x) * 0.25, (a.y - c.y) * 0.25, (c.x - a.x) * 0.25, (c.y - a.y) * 0.25), anchor(c.x, c.y)]
    };
    shown[role] = style.brows !== 'none' && depth(lon) > 0.12;
  }
  // the mouth: a lens of six anchors spread around the head
  const own = MOUTH_SHAPE[mouth];
  const open = own ? own.open : look.open + MOUTH_OPEN[mouth];
  const mw = (own ? own.mw : look.mouthW) * style.mouthWidth;
  const corners = own ? own.corners : look.corners;
  const tilt = own ? own.tilt : look.tilt;
  const mid = tw.mouthX * 40;
  const half = mw * 52;
  const my = 0.5 + style.mouthY + tw.mouthY;
  const lift = corners * 0.4;
  const pt = (lon: number, y: number) => anchor(across(lon, 0.95), Y(y));
  paths.mouth = {
    closed: true,
    anchors: [
      pt(mid - half, my - corners - tilt),
      pt(mid - half / 3, my - open * 0.3 - lift),
      pt(mid + half / 3, my - open * 0.3 - lift),
      pt(mid + half, my - corners + tilt),
      pt(mid + half / 3, my + open * 0.7 + 0.012 - lift),
      pt(mid - half / 3, my + open * 0.7 + 0.012 - lift)
    ]
  };
  shown.mouth = depth(mid) > 0.05;
  // the nose sticks out of the middle of the face: a hook from the side, a short stroke from the front
  const noseLon = tw.noseX * 40;
  const size = style.noseSize;
  const out = (k: number) => 1 + (k - 0.8) * size + style.noseX;
  const profile: Record<string, [number, number, number][]> = {
    hook: [
      [0.78, -0.04, 0],
      [0.86, 0.18, 0],
      [0.72, 0.22, 14]
    ],
    line: [
      [0.8, -0.02, 0],
      [0.82, 0.1, 0],
      [0.79, 0.2, 8]
    ],
    button: [
      [0.74, 0.12, -10],
      [0.85, 0.15, 0],
      [0.76, 0.22, 12]
    ],
    wedge: [
      [0.8, -0.06, 0],
      [0.91, 0.2, 0],
      [0.75, 0.2, 14]
    ]
  };
  const pts = profile[style.noseShape] ?? profile.hook;
  paths.nose = {
    closed: false,
    anchors: pts.map(([k, y, lon]) => anchor(across(noseLon + lon, out(k) * 0.92), Y(0.1 + (y - 0.1) * size + style.noseY + tw.noseY)))
  };
  shown.nose = style.nose && depth(noseLon) > -0.1;
  return { paths, shown };
}

// hair seen at an angle: the mass sits at the back of the head, it covers more of the head the more of
// its back shows, long hair hangs over the back seen from behind
export function turnedHair(h: Head, facing: number, angle: number, hair: HairStyle, tw: ViewTweak) {
  if (hair === 'bald') return { front: null, back: null, backInFront: false };
  const t = angle * RAD;
  const f = facing;
  const c = Math.cos(t);
  const back = Math.max(0, -Math.sin(t));
  const front = Math.max(0, Math.sin(t));
  const k = tw.hairScale;
  const hx = h.x + tw.hairX * h.rx;
  const hy = h.y + tw.hairY * h.rx;
  const rx = h.rx * k;
  const ry = h.ry * k;
  const off = -0.1 * rx * f * c;
  const bowl = ellipsePath(hx + off, hy - ry * (0.76 - 0.5 * back), rx * 1.06, ry * (0.42 + 0.55 * back));
  const bowlShadow = ellipsePath(hx + off * 4, hy - ry * (0.74 - 0.4 * back), rx * (0.52 + 0.2 * back), ry * (0.28 + 0.3 * back));
  const arc = (n: number, radius: (i: number) => number, cy: number) => {
    const pts: Vec[] = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      const q = radius(i);
      pts.push({ x: hx + off + Math.cos(a) * rx * q * (f || 1), y: cy + Math.sin(a) * ry * q * 0.75 });
    }
    return pts;
  };
  const top = hy - ry * 0.45 + back * ry * 0.25;
  const base = hy - ry * (0.3 - 0.75 * back);
  let out: { front: [PathData, PathData | null] | null; back: [PathData, PathData | null] | null } = { front: [bowl, bowlShadow], back: null };
  switch (hair) {
    case 'buzz':
      out = { front: [ellipsePath(hx + off * 0.5, hy - ry * (0.78 - 0.45 * back), rx, ry * (0.34 + 0.55 * back)), null], back: null };
      break;
    case 'sidepart':
      out = {
        front: [ellipsePath(hx + off * 0.2, hy - ry * (0.7 - 0.45 * back), rx * 1.08, ry * (0.46 + 0.5 * back), 0.22 * f * c), ellipsePath(hx + off * 4, hy - ry * (0.76 - 0.4 * back), rx * 0.5, ry * (0.26 + 0.25 * back), 0.22 * f * c)],
        back: null
      };
      break;
    case 'spiky': {
      const pts = arc(10, (i) => (i % 2 ? 1.42 : 1.08), top);
      pts.push({ x: hx + off + rx * 1.02 * f, y: base }, { x: hx + off - rx * 1.02 * f, y: base });
      out = { front: [loop(pts, 0), bowlShadow], back: null };
      break;
    }
    case 'curly': {
      const pts = arc(12, (i) => (i % 2 ? 1.22 : 1.1), top);
      pts.push({ x: hx + off + rx * 1.05 * f, y: base + ry * 0.05 }, { x: hx + off - rx * 1.08 * f, y: base + ry * 0.15 });
      out = { front: [loop(pts, 0.18), bowlShadow], back: null };
      break;
    }
    case 'afro':
      out = {
        front: [bowl, null],
        back: [ellipsePath(hx + off * 1.2, hy - ry * 0.45, rx * 1.6, ry * 1.22), ellipsePath(hx + off * 6, hy - ry * 0.35, rx * 0.7, ry * 0.8)]
      };
      break;
    case 'long': {
      // behind the head from the side, both sides of the face from the front, over the back from behind
      const a = { x: hx + off * 3, y: hy };
      const b = { x: hx + off * 3.8, y: hy + ry * 1.75 };
      const width = rx * (0.98 + 0.35 * front + 0.1 * back);
      out = { front: [bowl, bowlShadow], back: [capsulePath(a, b, width, width * 0.82), capsulePath({ x: a.x + off * 3, y: a.y }, { x: b.x + off * 3, y: b.y }, rx * 0.5, rx * 0.4)] };
      break;
    }
    case 'ponytail': {
      const a = { x: hx - 0.9 * rx * f * c, y: hy - ry * 0.35 };
      const b = { x: hx - 1.35 * rx * f * c, y: hy + ry * (0.9 - 0.2 * back) };
      out = { front: [bowl, bowlShadow], back: [capsulePath(a, b, rx * 0.32, rx * 0.18), null] };
      break;
    }
    case 'bun': {
      const p = { x: hx - 0.55 * rx * f * c, y: hy - ry * (1.0 - 0.25 * back) };
      out = { front: [bowl, bowlShadow], back: [ellipsePath(p.x, p.y, rx * 0.48, ry * 0.42), ellipsePath(p.x - 0.15 * rx * f, p.y + 0.08 * ry, rx * 0.26, ry * 0.22)] };
      break;
    }
  }
  return { ...out, backInFront: back > 0.45 };
}

export interface BuildState {
  emotion: Emotion;
  mouth: MouthShape;
  blink: boolean;
}

// the ids a part and its children keep in every keyframe
export type IdFor = (role: string, child?: string) => string;

interface Placed {
  items: Item[];
  z: number;
}

// the body parts of a character at a turn, already in drawing order, bound by role later
export function buildView(m: CharacterModel, turn: Turn, state: BuildState, idFor: IdFor): Item[] {
  const rig: Pick<TurnRig, 'x' | 'ground' | 'facing'> = { x: m.x, ground: m.ground, facing: m.facing };
  const j = joints3d(m);
  const u = m.height;
  const w = m.build === 'slim' ? 0.86 : m.build === 'broad' ? 1.18 : 1;
  const hs = Math.max(0.7, Math.min(1.4, m.headSize));
  const tb = turn.body;
  const th = turn.head;
  const tw = tweakAt(m, th);
  const twBody = tweakAt(m, tb);
  const P = (p: Point3) => project(p, tb, rig);
  const rnd = seeded(m.seed);
  const c = m.colors;
  const o = { colors: c, outline: m.outline, wobble: m.wobble };
  const t = tb * RAD;
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  // the side the shadows fall to on the screen
  const fs = m.facing * (cos >= -0.05 ? 1 : -1);
  const far = (z: number) => z < -0.03 * u;
  const placed: Placed[] = [];
  const put = (z: number, ...items: Item[]) => placed.push({ items, z });
  const z3 = (p: Point3) => P(p).z;
  const mid = (a: Point3, b: Point3): Point3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

  // arms and legs, the near ones in front, from the front and the back beside the body
  const armBias = 0.03 * u * Math.abs(sin);
  const legBias = -0.06 * u * Math.abs(sin);
  const arm = { ua: 0.037 * u * w, ub: 0.031 * u * w, la: 0.029 * u * w, lb: 0.025 * u * w };
  const leg = { ua: 0.052 * u * w, ub: 0.041 * u * w, la: 0.04 * u * w, lb: 0.032 * u * w, foot: 0.03 * u * w };
  const lowerArmColor = m.sleeves === 'long' ? c.shirt : c.skin;
  for (const side of ['L', 'R'] as const) {
    const zArm = z3(mid(j[`shoulder${side}`], j[`wrist${side}`])) + armBias;
    const isFar = far(zArm - armBias);
    const fg = fingers3d(j, side, u, w);
    const r = 0.0105 * u * w;
    const palm = P(fg.palm);
    put(
      zArm,
      limb(`upperArm${side}`, P(j[`shoulder${side}`]), P(j[`elbow${side}`]), arm.ua, arm.ub, c.shirt, o, rnd, isFar, fs),
      limb(`lowerArm${side}`, P(j[`elbow${side}`]), P(j[`wrist${side}`]), arm.la, arm.lb, lowerArmColor, o, rnd, isFar, fs),
      limb(`fingers${side}`, P(fg.fingers[0]), P(fg.fingers[1]), r * 1.45, r * 1.2, c.skin, o, rnd, isFar, fs),
      limb(`index${side}`, P(fg.index[0]), P(fg.index[1]), r * 0.85, r * 0.75, c.skin, o, rnd, isFar, fs),
      part(`hand${side}`, ellipsePath(palm.x, palm.y, 0.03 * u * w, 0.032 * u * w), null, c.skin, o, rnd, isFar),
      limb(`thumb${side}`, P(fg.thumb[0]), P(fg.thumb[1]), r * 0.9, r * 0.75, c.skin, o, rnd, isFar, fs)
    );
    const zLeg = z3(mid(j[`hip${side}`], j[`ankle${side}`])) + legBias;
    const legFar = far(zLeg - legBias);
    put(
      zLeg,
      limb(`upperLeg${side}`, P(j[`hip${side}`]), P(j[`knee${side}`]), leg.ua, leg.ub, c.pants, o, rnd, legFar, fs),
      limb(`lowerLeg${side}`, P(j[`knee${side}`]), P(j[`ankle${side}`]), leg.la, leg.lb, c.pants, o, rnd, legFar, fs),
      limb(`foot${side}`, P(j[`ankle${side}`]), P(j[`toe${side}`]), leg.foot, leg.foot * 0.85, c.shoes, o, rnd, legFar, fs)
    );
  }
  // the body is an oval seen from the side or wide from the front
  const across = (depth: number, width: number) => Math.sqrt((depth * cos) ** 2 + (width * sin) ** 2) * twBody.bodyWidth;
  const hip = P(j.hip);
  put(-0.005 * u, part('pelvis', ellipsePath(hip.x, hip.y + 0.01 * u, across(0.088, 0.1) * u * w, 0.056 * u), null, c.pants, o, rnd, false));
  const chestTop = P(add(j.neckBase, [0, 0, -0.035 * u]));
  const waist = P(add(j.hip, [0, 0, 0.02 * u]));
  put(0, limb('torso', chestTop, waist, across(0.098, 0.118) * u * w, across(0.08, 0.1) * u * w, c.shirt, o, rnd, false, fs));
  put(0.001 * u, limb('neck', P(j.neckBase), P(j.neckTop), 0.026 * u * w, 0.025 * u * w, c.skin, o, rnd, false, fs));

  // the head with its face and hair, all at the angle of the head
  const hc = P(j.head);
  const head: Head = { x: hc.x, y: hc.y, rx: 0.088 * u * hs * tw.headScale, ry: 0.098 * u * hs * tw.headScale };
  const th3 = th * RAD;
  const hfs = m.facing * (Math.cos(th3) >= -0.05 ? 1 : -1);
  const headItems: Item[] = [];
  // under a hat the hair on top lies flat, only what hangs below shows
  const flat: HairStyle = m.hat !== 'none' && ['spiky', 'curly', 'sidepart'].includes(m.hair) ? 'short' : m.hair;
  const hair = turnedHair(head, m.facing, th, flat, tw);
  const hairPart = (role: string, shapes: [PathData, PathData | null]) => part(role, shapes[0], shapes[1], c.hair, o, rnd, false);
  const hairBack = hair.back ? hairPart('hairBack', hair.back) : null;
  if (hairBack && !hair.backInFront) put(-1e6, hairBack);
  headItems.push(part('head', ellipsePath(head.x, head.y, head.rx, head.ry), ellipsePath(head.x - 0.45 * head.rx * hfs, head.y + 0.1 * head.ry, head.rx * 0.45, head.ry * 0.75), c.skin, o, rnd, false));
  if (hairBack && hair.backInFront) headItems.push(hairBack);
  if (hair.front) headItems.push(hairPart('hair', hair.front));
  // the face over the hair, a brow never hides under a fringe
  const face = turnedFace(head, m.facing, th, state.emotion, state.mouth, state.blink, m.face, tw);
  const ink = c.outline;
  for (const role of ['eyeL', 'eyeR', 'browL', 'browR', 'nose', 'mouth']) {
    const filled = role.startsWith('eye') || role === 'mouth';
    const width = role.startsWith('brow') ? browWidth(m.face, m.outline) : Math.max(2, m.outline * 0.8);
    const s = filled ? defaultStyle(solid(ink), solid(ink), Math.max(1.5, m.outline * 0.35)) : defaultStyle(null, solid(ink), width);
    const item = makePathItem(PART_LABELS[role], face.paths[role], s);
    item.role = role;
    item.visible = face.shown[role];
    headItems.push(item);
  }
  // glasses round the eyes
  if (m.glasses !== 'none') {
    const frame = (role: 'glassL' | 'glassR', eye: 'eyeL' | 'eyeR') => {
      const e = face.paths[eye].anchors;
      const cx = (e[1].x + e[3].x) / 2;
      const cy = (e[0].y + e[2].y) / 2;
      const half = Math.max(2, Math.abs(e[1].x - e[3].x) / 2 + 0.1 * head.rx);
      const ry = 0.19 * head.rx;
      const path =
        m.glasses === 'round'
          ? ellipsePath(cx, cy, half, ry)
          : { closed: true, anchors: [anchor(cx - half, cy - ry), anchor(cx + half, cy - ry), anchor(cx + half, cy + ry), anchor(cx - half, cy + ry)] };
      const item = makePathItem(role === 'glassL' ? 'Glasses, far' : 'Glasses, near', path, defaultStyle(null, solid(ink), Math.max(2, m.outline * 0.55)));
      item.role = role;
      item.visible = face.shown[eye];
      return { item, cx, half };
    };
    const l = frame('glassL', 'eyeL');
    const r = frame('glassR', 'eyeR');
    const y = (face.paths.eyeL.anchors[0].y + face.paths.eyeL.anchors[2].y) / 2;
    const left = l.cx < r.cx ? l : r;
    const right = left === l ? r : l;
    const bridge = makePathItem('Glasses bridge', { closed: false, anchors: [anchor(left.cx + left.half, y), anchor(right.cx - right.half, y)] }, defaultStyle(null, solid(ink), Math.max(2, m.outline * 0.55)));
    bridge.role = 'glassBridge';
    bridge.visible = face.shown.eyeL && face.shown.eyeR;
    headItems.push(l.item, r.item, bridge);
  }
  // a hat over the hair, the brim of a cap toward where the face looks
  if (m.hat !== 'none') {
    const cth = Math.cos(th3);
    const dome = m.hat === 'cap' ? ellipsePath(head.x - 0.05 * head.rx * m.facing * cth, head.y - head.ry * 0.62, head.rx * 1.1, head.ry * 0.5) : ellipsePath(head.x, head.y - head.ry * 0.6, head.rx * 1.08, head.ry * 0.62);
    const domeItem = part('hat', dome, null, c.pants, o, rnd, false);
    let brimItem: Item;
    if (m.hat === 'cap') {
      const a = { x: head.x + m.facing * head.rx * 0.3 * cth, y: head.y - head.ry * 0.42 };
      const b = { x: head.x + m.facing * head.rx * (0.3 + 1.15 * cth), y: head.y - head.ry * 0.4 };
      const thick = head.ry * 0.09;
      brimItem = part('hatBrim', capsulePath(a, { x: b.x + (Math.abs(b.x - a.x) < 1 ? 1 : 0), y: b.y }, thick, thick * 0.8), null, c.pants, o, rnd, false);
      if (Math.sin(th3) < 0) headItems.push(brimItem, domeItem);
      else headItems.push(domeItem, brimItem);
    } else {
      const y = head.y - head.ry * 0.3;
      brimItem = part('hatBrim', capsulePath({ x: head.x - head.rx * 1.08, y }, { x: head.x + head.rx * 1.08, y }, head.ry * 0.12, head.ry * 0.12), null, c.shirt, o, rnd, false);
      headItems.push(domeItem, brimItem);
    }
  }
  put(0.002 * u, ...headItems);

  const items = placed.sort((a, b) => a.z - b.z).flatMap((p) => p.items);
  // ids that stay the same in every keyframe, so the parts morph from one angle to the next
  for (const item of items) {
    const role = item.role ?? item.name;
    item.id = idFor(role);
    if (item.type === 'group') for (const child of item.children) child.id = idFor(role, child.name);
  }
  return items;
}

// where the face of a turned character sits at rest, for what needs a face frame
export function headOf(m: CharacterModel, angle = SIDE): Head {
  const p = project(joints3d(m).head, angle, { x: m.x, ground: m.ground, facing: m.facing });
  const hs = Math.max(0.7, Math.min(1.4, m.headSize));
  return { x: p.x, y: p.y, rx: 0.088 * m.height * hs, ry: 0.098 * m.height * hs };
}
