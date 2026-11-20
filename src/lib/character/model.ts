import type { Anchor, Bone, CharacterColors, CharacterInfo, Item, Layer, PathData, Vec } from '$lib/core/types';
import { makeGroupItem, makePathItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { mixHex } from '$lib/core/color';
import { newId } from '$lib/core/ids';
import { addBone } from '$lib/rig/bones';
import { makeLayer } from '$lib/editor/editor';

// a character is a folder with a rig layer for its skeleton and a body layer for its parts. each part is
// a group of a flat fill, a cel shadow and a hand drawn outline, bound rigidly to its bone. the limbs
// are capsules round at the joints, so a bent elbow or knee never opens a gap. the face sits on the
// head bone, its parts keep the same number of anchors in every expression, so a change of mood morphs

export type HairStyle = 'short' | 'long' | 'bun' | 'bald';
export type Build = 'slim' | 'regular' | 'broad';

export interface CharacterOptions {
  name: string;
  // the height in stage pixels, feet to the top of the head
  height: number;
  // where the feet stand
  x: number;
  ground: number;
  build: Build;
  // 0.85 to 1.3, the head against the body
  headSize: number;
  hair: HairStyle;
  // 1 looks right, -1 left
  facing: 1 | -1;
  colors: CharacterColors;
  // how thick the outline is and how much the lines wobble, 0 is clean
  outline: number;
  wobble: number;
  // the same seed draws the same wobble
  seed: number;
}

export const DEFAULT_COLORS: CharacterColors = {
  skin: '#e2c4a6',
  hair: '#3a3734',
  shirt: '#5b6b82',
  pants: '#3e475e',
  shoes: '#262a36',
  outline: '#1d1b19'
};

export function defaultCharacter(width: number, height: number): CharacterOptions {
  return {
    name: 'Character',
    height: Math.round(height * 0.5),
    x: width / 2,
    ground: Math.round(height * 0.86),
    build: 'regular',
    headSize: 1,
    hair: 'short',
    facing: 1,
    colors: { ...DEFAULT_COLORS },
    outline: 6,
    wobble: 0.6,
    seed: 7
  };
}

// the bones of a humanoid, the names the animations look for
export const BONES = [
  'Hip',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'Upper arm L',
  'Lower arm L',
  'Hand L',
  'Upper arm R',
  'Lower arm R',
  'Hand R',
  'Upper leg L',
  'Lower leg L',
  'Foot L',
  'Upper leg R',
  'Lower leg R',
  'Foot R'
] as const;
export type BoneName = (typeof BONES)[number];

// L is the far side, behind the body, R the near side. every role and the bone it follows
export const PART_BONE: Record<string, BoneName> = {
  hairBack: 'Head',
  upperArmL: 'Upper arm L',
  lowerArmL: 'Lower arm L',
  handL: 'Hand L',
  upperLegL: 'Upper leg L',
  lowerLegL: 'Lower leg L',
  footL: 'Foot L',
  pelvis: 'Hip',
  upperLegR: 'Upper leg R',
  lowerLegR: 'Lower leg R',
  footR: 'Foot R',
  torso: 'Chest',
  neck: 'Neck',
  head: 'Head',
  eyeL: 'Head',
  eyeR: 'Head',
  browL: 'Head',
  browR: 'Head',
  nose: 'Head',
  mouth: 'Head',
  hair: 'Head',
  upperArmR: 'Upper arm R',
  lowerArmR: 'Lower arm R',
  handR: 'Hand R'
};

export const PART_LABELS: Record<string, string> = {
  hairBack: 'Hair at the back',
  upperArmL: 'Upper arm, far',
  lowerArmL: 'Lower arm, far',
  handL: 'Hand, far',
  upperLegL: 'Upper leg, far',
  lowerLegL: 'Lower leg, far',
  footL: 'Foot, far',
  pelvis: 'Hip',
  upperLegR: 'Upper leg, near',
  lowerLegR: 'Lower leg, near',
  footR: 'Foot, near',
  torso: 'Upper body',
  neck: 'Neck',
  head: 'Head',
  eyeL: 'Eye, far',
  eyeR: 'Eye, near',
  browL: 'Brow, far',
  browR: 'Brow, near',
  nose: 'Nose',
  mouth: 'Mouth',
  hair: 'Hair',
  upperArmR: 'Upper arm, near',
  lowerArmR: 'Lower arm, near',
  handR: 'Hand, near'
};

export const FACE_ROLES = ['eyeL', 'eyeR', 'browL', 'browR', 'nose', 'mouth'];

// which color a part takes
const COLOR_OF: Record<string, keyof CharacterColors> = {
  head: 'skin',
  neck: 'skin',
  lowerArmL: 'skin',
  lowerArmR: 'skin',
  handL: 'skin',
  handR: 'skin',
  hair: 'hair',
  hairBack: 'hair',
  torso: 'shirt',
  upperArmL: 'shirt',
  upperArmR: 'shirt',
  pelvis: 'pants',
  upperLegL: 'pants',
  upperLegR: 'pants',
  lowerLegL: 'pants',
  lowerLegR: 'pants',
  footL: 'shoes',
  footR: 'shoes'
};

export function partColor(role: string, colors: CharacterColors): string | null {
  const key = COLOR_OF[role];
  return key ? colors[key] : null;
}

// the flat shadow of a color: darker, a little cooler and less saturated, like cel shading in print
export function shadeOf(color: string): string {
  return mixHex(color, '#3b3550', 0.32);
}

// the far side sits a little back in the shade
function farTone(color: string): string {
  return mixHex(color, '#3b3550', 0.12);
}

// a small fast random number generator, the same seed gives the same lines
export function seeded(seed: number): () => number {
  let a = Math.floor(seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const K = 0.5523;

function anchor(x: number, y: number, ix = 0, iy = 0, ox = 0, oy = 0): Anchor {
  return { x, y, ix, iy, ox, oy, kind: ix === 0 && iy === 0 && ox === 0 && oy === 0 ? 'corner' : 'smooth' };
}

// four anchors round an ellipse, turned by rot, starting on the right
export function ellipsePath(cx: number, cy: number, rx: number, ry: number, rot = 0): PathData {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const p = (x: number, y: number): Vec => ({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  const v = (x: number, y: number): Vec => ({ x: x * c - y * s, y: x * s + y * c });
  const pts: [Vec, Vec][] = [
    [p(rx, 0), v(0, ry * K)],
    [p(0, ry), v(-rx * K, 0)],
    [p(-rx, 0), v(0, -ry * K)],
    [p(0, -ry), v(rx * K, 0)]
  ];
  return {
    closed: true,
    anchors: pts.map(([q, t]) => ({ ...anchor(q.x, q.y, -t.x, -t.y, t.x, t.y), kind: 'symmetric' as const }))
  };
}

// a limb from a to b, round at both ends with radius ra and rb
export function capsulePath(a: Vec, b: Vec, ra: number, rb: number): PathData {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -d.y, y: d.x };
  const at = (o: Vec, u: Vec, r: number) => ({ x: o.x + u.x * r, y: o.y + u.y * r });
  const A1 = at(a, n, ra);
  const B1 = at(b, n, rb);
  const Bt = at(b, d, rb);
  const B2 = at(b, n, -rb);
  const A2 = at(a, n, -ra);
  const At = at(a, d, -ra);
  return {
    closed: true,
    anchors: [
      anchor(A1.x, A1.y, -d.x * ra * K, -d.y * ra * K, 0, 0),
      anchor(B1.x, B1.y, 0, 0, d.x * rb * K, d.y * rb * K),
      anchor(Bt.x, Bt.y, n.x * rb * K, n.y * rb * K, -n.x * rb * K, -n.y * rb * K),
      anchor(B2.x, B2.y, d.x * rb * K, d.y * rb * K, 0, 0),
      anchor(A2.x, A2.y, 0, 0, -d.x * ra * K, -d.y * ra * K),
      anchor(At.x, At.y, -n.x * ra * K, -n.y * ra * K, n.x * ra * K, n.y * ra * K)
    ]
  };
}

// a hand drawn look: every anchor moved a little and every handle a little longer or shorter
export function wobble(path: PathData, amount: number, rnd: () => number): PathData {
  if (amount <= 0) return path;
  return {
    closed: path.closed,
    anchors: path.anchors.map((p) => {
      const dx = (rnd() - 0.5) * 2 * amount;
      const dy = (rnd() - 0.5) * 2 * amount;
      const k = 1 + (rnd() - 0.5) * 0.18;
      return { ...p, x: p.x + dx, y: p.y + dy, ix: p.ix * k, iy: p.iy * k, ox: p.ox * k, oy: p.oy * k };
    })
  };
}

function move(path: PathData, dx: number, dy: number): PathData {
  return { closed: path.closed, anchors: path.anchors.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
}

// a part: fill, shadow and outline in one group. the shadow is the same shape made thinner and pushed to
// the back side, it stays inside the fill
function part(
  role: string,
  shape: PathData,
  shadow: PathData | null,
  color: string,
  o: CharacterOptions,
  rnd: () => number,
  far: boolean
): Item {
  const tone = far ? farTone(color) : color;
  const drawn = wobble(shape, o.wobble * o.outline * 0.35, rnd);
  const fill = makePathItem('Fill', drawn, defaultStyle(solid(tone), null, 0));
  const children: Item[] = [fill];
  if (shadow) children.push(makePathItem('Shadow', wobble(shadow, o.wobble * o.outline * 0.2, rnd), defaultStyle(solid(shadeOf(tone)), null, 0)));
  // the line wobbles in its width too, a little thicker on some parts than on others
  const width = o.outline * (0.88 + rnd() * 0.3);
  children.push(makePathItem('Outline', drawn, defaultStyle(null, solid(o.colors.outline), width)));
  const group = makeGroupItem(PART_LABELS[role] ?? role, children);
  group.role = role;
  return group;
}

// the joints of the body at rest, from the options
interface Skeleton {
  u: number;
  f: number;
  w: number;
  head: { x: number; y: number; rx: number; ry: number };
  joints: Record<string, Vec>;
}

function skeleton(o: CharacterOptions): Skeleton {
  const u = o.height;
  const f = o.facing;
  const w = o.build === 'slim' ? 0.86 : o.build === 'broad' ? 1.18 : 1;
  const y = (t: number) => o.ground - u * (1 - t);
  const x = (dx: number) => o.x + dx * u * f;
  const hs = Math.max(0.7, Math.min(1.4, o.headSize));
  const joints: Record<string, Vec> = {
    hip: { x: x(0), y: y(0.53) },
    spine: { x: x(0), y: y(0.4) },
    chest: { x: x(0.005), y: y(0.36) },
    neckBase: { x: x(0.005), y: y(0.215) },
    neckTop: { x: x(0.01), y: y(0.175) },
    headTop: { x: x(0.012), y: y(0.175 - 0.19 * hs) },
    shoulderR: { x: x(0.025 * w), y: y(0.245) },
    elbowR: { x: x(0.04 * w), y: y(0.39) },
    wristR: { x: x(0.05 * w), y: y(0.52) },
    handR: { x: x(0.055 * w), y: y(0.575) },
    shoulderL: { x: x(-0.04 * w), y: y(0.245) },
    elbowL: { x: x(-0.045 * w), y: y(0.39) },
    wristL: { x: x(-0.04 * w), y: y(0.52) },
    handL: { x: x(-0.038 * w), y: y(0.575) },
    hipR: { x: x(0.03 * w), y: y(0.54) },
    kneeR: { x: x(0.04 * w), y: y(0.755) },
    ankleR: { x: x(0.035 * w), y: y(0.945) },
    toeR: { x: x(0.035 * w + 0.085), y: y(0.975) },
    hipL: { x: x(-0.025 * w), y: y(0.54) },
    kneeL: { x: x(-0.03 * w), y: y(0.755) },
    ankleL: { x: x(-0.035 * w), y: y(0.945) },
    toeL: { x: x(-0.035 * w + 0.075), y: y(0.975) }
  };
  const rx = 0.088 * u * hs;
  const ry = 0.098 * u * hs;
  return { u, f, w, head: { x: x(0.015), y: y(0.175 - 0.098 * hs), rx, ry }, joints };
}

// the face in head units: origin the middle of the head, 1 is the head's radius, x toward where it looks
export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'scared' | 'confused';
export type MouthShape = 'closed' | 'slight' | 'wide';

export const EMOTIONS: { id: Emotion; label: string }[] = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'angry', label: 'Angry' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'scared', label: 'Scared' },
  { id: 'confused', label: 'Confused' }
];

export const MOUTHS: { id: MouthShape; label: string }[] = [
  { id: 'closed', label: 'Closed' },
  { id: 'slight', label: 'Slightly open' },
  { id: 'wide', label: 'Wide open' }
];

interface FaceLook {
  // eye height against its width, and how far up it moves
  eye: number;
  eyeUp: number;
  eyeSize: number;
  // brow inner and outer end, up is negative, for the far and the near side
  browL: [number, number];
  browR: [number, number];
  // mouth width, how far the corners go up, how open it is anyway
  mouthW: number;
  corners: number;
  open: number;
  // one corner higher than the other
  tilt: number;
}

const LOOKS: Record<Emotion, FaceLook> = {
  neutral: { eye: 1, eyeUp: 0, eyeSize: 1, browL: [0, 0], browR: [0, 0], mouthW: 0.42, corners: 0, open: 0, tilt: 0 },
  happy: { eye: 0.45, eyeUp: -0.04, eyeSize: 1, browL: [-0.05, -0.05], browR: [-0.05, -0.05], mouthW: 0.52, corners: 0.14, open: 0.04, tilt: 0 },
  sad: { eye: 0.8, eyeUp: 0.03, eyeSize: 0.95, browL: [-0.13, 0.06], browR: [-0.13, 0.06], mouthW: 0.36, corners: -0.12, open: 0, tilt: 0 },
  angry: { eye: 0.75, eyeUp: 0.02, eyeSize: 1, browL: [0.11, -0.07], browR: [0.11, -0.07], mouthW: 0.34, corners: -0.06, open: 0.02, tilt: 0 },
  surprised: { eye: 1.3, eyeUp: -0.03, eyeSize: 1.25, browL: [-0.18, -0.16], browR: [-0.18, -0.16], mouthW: 0.2, corners: 0, open: 0.22, tilt: 0 },
  scared: { eye: 1.2, eyeUp: -0.02, eyeSize: 1.15, browL: [-0.16, -0.04], browR: [-0.16, -0.04], mouthW: 0.38, corners: -0.08, open: 0.1, tilt: 0 },
  confused: { eye: 0.95, eyeUp: 0, eyeSize: 1, browL: [-0.14, -0.1], browR: [0.05, 0.03], mouthW: 0.3, corners: 0.02, open: 0, tilt: 0.08 }
};

const MOUTH_OPEN: Record<MouthShape, number> = { closed: 0, slight: 0.13, wide: 0.3 };

export interface FaceFrame {
  x: number;
  y: number;
  r: number;
  facing: 1 | -1;
}

// the path of every face part for a mood, a mouth and open or closed eyes, in stage pixels at rest
export function facePaths(frame: FaceFrame, emotion: Emotion, mouth: MouthShape, blink = false): Record<string, PathData> {
  const look = LOOKS[emotion] ?? LOOKS.neutral;
  const { r, facing: f } = frame;
  const P = (x: number, y: number): Vec => ({ x: frame.x + x * r * f, y: frame.y + y * r });
  const eyeH = blink ? 0.08 : look.eye;
  const eye = (cx: number, size: number) => {
    const c = P(cx, -0.02 + look.eyeUp);
    const rx = 0.11 * size * look.eyeSize * r;
    return ellipsePath(c.x, c.y, rx, Math.max(0.006 * r, rx * 1.12 * eyeH));
  };
  const brow = (inner: number, outer: number, end: [number, number], size: number) => {
    const a = P(inner, -0.3 + end[0]);
    const b = P((inner + outer) / 2, -0.33 + (end[0] + end[1]) / 2 - 0.03 * size);
    const c = P(outer, -0.3 + end[1]);
    return {
      closed: false,
      anchors: [anchor(a.x, a.y), anchor(b.x, b.y, (a.x - c.x) * 0.25, (a.y - c.y) * 0.25, (c.x - a.x) * 0.25, (c.y - a.y) * 0.25), anchor(c.x, c.y)]
    };
  };
  // the mouth is a closed lens of six anchors: corners, the top lip and the bottom lip
  const open = (blink ? 0 : 0) + look.open + MOUTH_OPEN[mouth];
  const mw = look.mouthW;
  const mx = 0.36;
  const my = 0.5;
  const left = P(mx - mw / 2, my - look.corners - look.tilt);
  const right = P(mx + mw / 2, my - look.corners + look.tilt);
  const lift = look.corners * 0.4;
  const top1 = P(mx - mw / 6, my - open * 0.3 - lift);
  const top2 = P(mx + mw / 6, my - open * 0.3 - lift);
  const bot2 = P(mx + mw / 6, my + open * 0.7 + 0.012 - lift);
  const bot1 = P(mx - mw / 6, my + open * 0.7 + 0.012 - lift);
  const mouthPath: PathData = {
    closed: true,
    anchors: [left, top1, top2, right, bot2, bot1].map((p) => anchor(p.x, p.y))
  };
  const n1 = P(0.78, -0.04);
  const n2 = P(0.86, 0.18);
  const n3 = P(0.72, 0.22);
  return {
    eyeL: eye(-0.05, 0.85),
    eyeR: eye(0.42, 1),
    browL: brow(-0.0, -0.22, look.browL, 0.85),
    browR: brow(0.3, 0.6, look.browR, 1),
    nose: { closed: false, anchors: [anchor(n1.x, n1.y), anchor(n2.x, n2.y), anchor(n3.x, n3.y)] },
    mouth: mouthPath
  };
}

function faceItems(frame: FaceFrame, o: CharacterOptions): Item[] {
  const paths = facePaths(frame, 'neutral', 'closed');
  const ink = o.colors.outline;
  const line = Math.max(2, o.outline * 0.8);
  const make = (role: string, filled: boolean) => {
    const style = filled ? defaultStyle(solid(ink), solid(ink), Math.max(1.5, o.outline * 0.35)) : defaultStyle(null, solid(ink), line);
    const item = makePathItem(PART_LABELS[role], paths[role], style);
    item.role = role;
    return item;
  };
  return [make('eyeL', true), make('eyeR', true), make('browL', false), make('browR', false), make('nose', false), make('mouth', true)];
}

function hairItems(s: Skeleton, o: CharacterOptions, rnd: () => number): { back: Item | null; front: Item | null } {
  const h = s.head;
  const f = s.f;
  const color = o.colors.hair;
  if (o.hair === 'bald') return { back: null, front: null };
  const bowl = ellipsePath(h.x - 0.08 * h.rx * f, h.y - h.ry * 0.42, h.rx * 1.08, h.ry * 0.7);
  const bowlShadow = ellipsePath(h.x - 0.32 * h.rx * f, h.y - h.ry * 0.5, h.rx * 0.62, h.ry * 0.46);
  const front = part('hair', bowl, bowlShadow, color, o, rnd, false);
  let back: Item | null = null;
  if (o.hair === 'long') {
    const a = { x: h.x - 0.3 * h.rx * f, y: h.y };
    const b = { x: h.x - 0.38 * h.rx * f, y: h.y + h.ry * 1.75 };
    back = part('hairBack', capsulePath(a, b, h.rx * 0.98, h.rx * 0.8), capsulePath({ x: a.x - 0.3 * h.rx * f, y: a.y }, { x: b.x - 0.3 * h.rx * f, y: b.y }, h.rx * 0.5, h.rx * 0.4), color, o, rnd, false);
  } else if (o.hair === 'bun') {
    const c = { x: h.x - 0.55 * h.rx * f, y: h.y - h.ry * 1.0 };
    back = part('hairBack', ellipsePath(c.x, c.y, h.rx * 0.48, h.ry * 0.42), ellipsePath(c.x - 0.15 * h.rx * f, c.y + 0.08 * h.ry, h.rx * 0.26, h.ry * 0.22), color, o, rnd, false);
  }
  return { back, front };
}

// a limb part from joint a to joint b, its shadow along the back side
function limb(role: string, a: Vec, b: Vec, ra: number, rb: number, color: string, o: CharacterOptions, rnd: () => number, far: boolean, f: number): Item {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  // the light comes from the front, the shadow lies on the side the character turns its back to
  const dir = n.x * f > 0 ? -0.42 : 0.42;
  const sa = { x: a.x + n.x * ra * dir, y: a.y + n.y * ra * dir };
  const sb = { x: b.x + n.x * rb * dir, y: b.y + n.y * rb * dir };
  return part(role, capsulePath(a, b, ra, rb), capsulePath(sa, sb, ra * 0.5, rb * 0.5), color, o, rnd, far);
}

export interface BuiltCharacter {
  layers: Layer[];
  info: CharacterInfo;
}

// a whole character: the folder, the rig with seventeen bones and the body with its parts bound
export function buildCharacter(o: CharacterOptions): BuiltCharacter {
  const s = skeleton(o);
  const j = s.joints;
  const u = s.u;
  const w = s.w;
  const f = s.f;
  const rnd = seeded(o.seed);
  const c = o.colors;
  const folderColor = '#c99c7c';

  const bones: Bone[] = [];
  const add = (name: BoneName, parent: BoneName | null, from: Vec, to: Vec) => {
    const p = parent ? bones.find((b) => b.name === parent)!.id : null;
    return addBone(bones, p, from, to, {}, { name, color: '#c99c7c', reach: 0.5 });
  };
  add('Hip', null, j.hip, { x: j.hip.x, y: j.hip.y - u * 0.05 });
  add('Spine', 'Hip', j.hip, j.spine);
  add('Chest', 'Spine', j.spine, j.neckBase);
  add('Neck', 'Chest', j.neckBase, j.neckTop);
  add('Head', 'Neck', j.neckTop, j.headTop);
  for (const side of ['L', 'R'] as const) {
    add(`Upper arm ${side}`, 'Chest', j[`shoulder${side}`], j[`elbow${side}`]);
    add(`Lower arm ${side}`, `Upper arm ${side}`, j[`elbow${side}`], j[`wrist${side}`]);
    add(`Hand ${side}`, `Lower arm ${side}`, j[`wrist${side}`], j[`hand${side}`]);
    add(`Upper leg ${side}`, 'Hip', j[`hip${side}`], j[`knee${side}`]);
    add(`Lower leg ${side}`, `Upper leg ${side}`, j[`knee${side}`], j[`ankle${side}`]);
    add(`Foot ${side}`, `Lower leg ${side}`, j[`ankle${side}`], j[`toe${side}`]);
  }
  const boneId = (name: BoneName) => bones.find((b) => b.name === name)!.id;

  const arm = { ua: 0.037 * u * w, ub: 0.031 * u * w, la: 0.029 * u * w, lb: 0.025 * u * w, hand: 0.034 * u * w };
  const leg = { ua: 0.052 * u * w, ub: 0.041 * u * w, la: 0.04 * u * w, lb: 0.032 * u * w, foot: 0.03 * u * w };
  const h = s.head;

  const parts: Item[] = [];
  const hair = hairItems(s, o, rnd);
  if (hair.back) parts.push(hair.back);
  // the far arm and leg behind the body
  parts.push(limb('upperArmL', j.shoulderL, j.elbowL, arm.ua, arm.ub, c.shirt, o, rnd, true, f));
  parts.push(limb('lowerArmL', j.elbowL, j.wristL, arm.la, arm.lb, c.skin, o, rnd, true, f));
  parts.push(part('handL', ellipsePath(j.handL.x, j.handL.y, arm.hand, arm.hand * 1.1), null, c.skin, o, rnd, true));
  parts.push(limb('upperLegL', j.hipL, j.kneeL, leg.ua, leg.ub, c.pants, o, rnd, true, f));
  parts.push(limb('lowerLegL', j.kneeL, j.ankleL, leg.la, leg.lb, c.pants, o, rnd, true, f));
  parts.push(limb('footL', j.ankleL, j.toeL, leg.foot, leg.foot * 0.85, c.shoes, o, rnd, true, f));
  parts.push(part('pelvis', ellipsePath(j.hip.x, j.hip.y + 0.01 * u, 0.088 * u * w, 0.056 * u), null, c.pants, o, rnd, false));
  parts.push(limb('upperLegR', j.hipR, j.kneeR, leg.ua, leg.ub, c.pants, o, rnd, false, f));
  parts.push(limb('lowerLegR', j.kneeR, j.ankleR, leg.la, leg.lb, c.pants, o, rnd, false, f));
  parts.push(limb('footR', j.ankleR, j.toeR, leg.foot, leg.foot * 0.85, c.shoes, o, rnd, false, f));
  const chestTop = { x: j.neckBase.x, y: j.neckBase.y + 0.035 * u };
  const waist = { x: j.hip.x, y: j.hip.y - 0.02 * u };
  parts.push(limb('torso', chestTop, waist, 0.098 * u * w, 0.08 * u * w, c.shirt, o, rnd, false, f));
  parts.push(limb('neck', j.neckBase, j.neckTop, 0.026 * u * w, 0.025 * u * w, c.skin, o, rnd, false, f));
  parts.push(part('head', ellipsePath(h.x, h.y, h.rx, h.ry), ellipsePath(h.x - 0.45 * h.rx * f, h.y + 0.1 * h.ry, h.rx * 0.45, h.ry * 0.75), c.skin, o, rnd, false));
  const face: FaceFrame = { x: h.x, y: h.y, r: h.rx, facing: o.facing };
  parts.push(...faceItems(face, o));
  if (hair.front) parts.push(hair.front);
  parts.push(limb('upperArmR', j.shoulderR, j.elbowR, arm.ua, arm.ub, c.shirt, o, rnd, false, f));
  parts.push(limb('lowerArmR', j.elbowR, j.wristR, arm.la, arm.lb, c.skin, o, rnd, false, f));
  parts.push(part('handR', ellipsePath(j.handR.x, j.handR.y, arm.hand, arm.hand * 1.1), null, c.skin, o, rnd, false));

  // every part follows its bone rigidly, it was drawn at the rest pose so nothing moves when bound
  for (const item of parts) {
    const bone = PART_BONE[item.role ?? ''];
    if (bone) item.skin = { weights: [], rigid: boneId(bone) };
  }

  const info: CharacterInfo = { id: newId(), name: o.name, colors: { ...c }, face };
  const folder = makeLayer(o.name, folderColor, 'folder');
  folder.character = info;
  const rig = makeLayer(`${o.name} skeleton`, folderColor, 'rig');
  rig.bones = bones;
  rig.parent = folder.id;
  const body = makeLayer(`${o.name} body`, folderColor);
  body.parent = folder.id;
  body.keyframes[0].items = parts;
  // bottom first: the body, the rig above it, the folder that holds both
  return { layers: [body, rig, folder], info };
}

// the colors of every part of a character changed by their roles, outlines and the face included
export function recolorItems(items: Item[], colors: CharacterColors): Item[] {
  return items.map((item) => {
    const role = item.role ?? '';
    if (FACE_ROLES.includes(role) && item.type === 'path') {
      const filled = item.style.fill !== null;
      return {
        ...item,
        style: { ...item.style, fill: filled ? solid(colors.outline) : null, stroke: item.style.stroke ? solid(colors.outline) : null }
      };
    }
    const color = partColor(role, colors);
    if (!color || item.type !== 'group') return item;
    const far = role.endsWith('L');
    const tone = far ? farTone(color) : color;
    return {
      ...item,
      children: item.children.map((child) => {
        if (child.type !== 'path') return child;
        if (child.name === 'Fill') return { ...child, style: { ...child.style, fill: solid(tone) } };
        if (child.name === 'Shadow') return { ...child, style: { ...child.style, fill: solid(shadeOf(tone)) } };
        if (child.name === 'Outline') return { ...child, style: { ...child.style, stroke: solid(colors.outline) } };
        return child;
      })
    };
  });
}

// the layers of a character: its folder and what is inside it
export function characterLayers(layers: Layer[], folderId: string): { folder: Layer; rig: Layer | null; body: Layer | null } | null {
  const folder = layers.find((l) => l.id === folderId && l.character);
  if (!folder) return null;
  const inside = layers.filter((l) => l.parent === folderId);
  return {
    folder,
    rig: inside.find((l) => l.type === 'rig') ?? null,
    body: inside.find((l) => l.type === 'normal') ?? null
  };
}

export function characterFolders(layers: Layer[]): Layer[] {
  return layers.filter((l) => l.type === 'folder' && !!l.character);
}

// a part of a character by its role in a list of items, with the group around it if there is one
export function findRole(items: Item[], role: string): Item | null {
  for (const item of items) {
    if (item.role === role) return item;
    if (item.type === 'group') {
      const inner = findRole(item.children, role);
      if (inner) return inner;
    }
  }
  return null;
}

export { move as movePath };
