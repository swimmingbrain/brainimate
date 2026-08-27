import type { Bone, Vec } from '$lib/core/types';
import { boxCenter, boxHeight, boxWidth, type Box } from '$lib/core/bbox';
import { PALETTE } from '$lib/core/palette';
import { addBone, rootsOf } from './bones';

export type TemplateKind = 'humanoid' | 'quadruped' | 'arm';

export const TEMPLATES: { id: TemplateKind; label: string }[] = [
  { id: 'humanoid', label: 'Humanoid' },
  { id: 'quadruped', label: 'Four legs' },
  { id: 'arm', label: 'Arm' }
];

// a bone of a template in units of its height, x from the middle and y down from the top. limb picks
// the color, each limb gets its own one
interface Spec {
  name: string;
  parent: string | null;
  from: [number, number];
  to: [number, number];
  limb: number;
}

// a standing figure seen from the front, L on the left of the stage
function humanoid(): Spec[] {
  const side = (s: 'L' | 'R', limb: number, k: number): Spec[] => [
    { name: `Upper arm ${s}`, parent: 'Chest', from: [k * 0.1, 0.25], to: [k * 0.17, 0.4], limb },
    { name: `Lower arm ${s}`, parent: `Upper arm ${s}`, from: [k * 0.17, 0.4], to: [k * 0.21, 0.54], limb },
    { name: `Hand ${s}`, parent: `Lower arm ${s}`, from: [k * 0.21, 0.54], to: [k * 0.22, 0.6], limb },
    { name: `Upper leg ${s}`, parent: 'Hip', from: [k * 0.06, 0.52], to: [k * 0.07, 0.72], limb: limb + 2 },
    { name: `Lower leg ${s}`, parent: `Upper leg ${s}`, from: [k * 0.07, 0.72], to: [k * 0.07, 0.92], limb: limb + 2 },
    { name: `Foot ${s}`, parent: `Lower leg ${s}`, from: [k * 0.07, 0.92], to: [k * 0.12, 0.97], limb: limb + 2 }
  ];
  return [
    { name: 'Hip', parent: null, from: [0, 0.52], to: [0, 0.47], limb: 0 },
    { name: 'Spine', parent: 'Hip', from: [0, 0.47], to: [0, 0.36], limb: 0 },
    { name: 'Chest', parent: 'Spine', from: [0, 0.36], to: [0, 0.24], limb: 0 },
    { name: 'Neck', parent: 'Chest', from: [0, 0.24], to: [0, 0.18], limb: 0 },
    { name: 'Head', parent: 'Neck', from: [0, 0.18], to: [0, 0.04], limb: 0 },
    ...side('L', 1, -1),
    ...side('R', 2, 1)
  ];
}

// an animal seen from the side, facing right, the legs on the far side a little further in
function quadruped(): Spec[] {
  const leg = (name: string, parent: string, x: number, limb: number, knee: number): Spec[] => [
    { name: `Upper ${name}`, parent, from: [x, 0.4], to: [x + knee, 0.62], limb },
    { name: `Lower ${name}`, parent: `Upper ${name}`, from: [x + knee, 0.62], to: [x, 0.86], limb },
    { name: `Foot ${name}`, parent: `Lower ${name}`, from: [x, 0.86], to: [x + 0.07, 0.9], limb }
  ];
  return [
    { name: 'Hip', parent: null, from: [-0.5, 0.36], to: [-0.18, 0.34], limb: 0 },
    { name: 'Spine', parent: 'Hip', from: [-0.18, 0.34], to: [0.18, 0.34], limb: 0 },
    { name: 'Chest', parent: 'Spine', from: [0.18, 0.34], to: [0.45, 0.31], limb: 0 },
    { name: 'Neck', parent: 'Chest', from: [0.45, 0.31], to: [0.6, 0.12], limb: 0 },
    { name: 'Head', parent: 'Neck', from: [0.6, 0.12], to: [0.82, 0.18], limb: 0 },
    { name: 'Tail', parent: 'Hip', from: [-0.5, 0.36], to: [-0.75, 0.2], limb: 0 },
    ...leg('front leg L', 'Chest', 0.38, 1, 0.03),
    ...leg('front leg R', 'Chest', 0.3, 2, 0.03),
    ...leg('back leg L', 'Hip', -0.42, 3, -0.04),
    ...leg('back leg R', 'Hip', -0.34, 4, -0.04)
  ];
}

// along x, one unit long
function arm(): Spec[] {
  return [
    { name: 'Upper arm', parent: null, from: [-0.5, 0], to: [-0.05, 0], limb: 0 },
    { name: 'Lower arm', parent: 'Upper arm', from: [-0.05, 0], to: [0.35, 0], limb: 0 },
    { name: 'Hand', parent: 'Lower arm', from: [0.35, 0], to: [0.5, 0], limb: 0 }
  ];
}

const SPECS: Record<TemplateKind, () => Spec[]> = { humanoid, quadruped, arm };

export interface TemplateBone {
  name: string;
  parent: string | null;
  from: Vec;
  to: Vec;
  limb: number;
}

function extent(specs: Spec[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = specs.flatMap((s) => [s.from[0], s.to[0]]);
  const ys = specs.flatMap((s) => [s.from[1], s.to[1]]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// the bones of a template fitted into box with their proportions kept and centered in it. an arm
// runs along the longer side of the box
export function templateBones(kind: TemplateKind, box: Box): TemplateBone[] {
  const specs = SPECS[kind]();
  const e = extent(specs);
  const w = Math.max(boxWidth(box), 1);
  const h = Math.max(boxHeight(box), 1);
  const c = boxCenter(box);
  const upright = kind === 'arm' && h > w;
  const sw = Math.max(e.maxX - e.minX, 1e-6);
  const sh = Math.max(e.maxY - e.minY, 1e-6);
  const s = kind === 'arm' ? Math.max(w, h) / sw : Math.min(h / sh, w / sw);
  const mx = (e.minX + e.maxX) / 2;
  const my = (e.minY + e.maxY) / 2;
  const place = ([x, y]: [number, number]): Vec => {
    const u = (x - mx) * s;
    const v = (y - my) * s;
    return upright ? { x: c.x - v, y: c.y + u } : { x: c.x + u, y: c.y + v };
  };
  return specs.map((sp) => ({ name: sp.name, parent: sp.parent, from: place(sp.from), to: place(sp.to), limb: sp.limb }));
}

// where a template goes with nothing selected: the middle of the stage, 60 percent of its height
export function stageBox(width: number, height: number): Box {
  const h = height * 0.6;
  return { minX: width / 2 - h / 2, minY: (height - h) / 2, maxX: width / 2 + h / 2, maxY: (height + h) / 2 };
}

// the template's bones added to a rig layer's bones at rest, bound where they stand. names already
// taken get a number
export function addTemplate(bones: Bone[], kind: TemplateKind, box: Box, reach: number): Bone[] {
  const first = rootsOf(bones).length;
  const ids = new Map<string, string>();
  const taken = new Set(bones.map((b) => b.name));
  const added: Bone[] = [];
  for (const t of templateBones(kind, box)) {
    let name = t.name;
    for (let n = 2; taken.has(name); n++) name = `${t.name} ${n}`;
    taken.add(name);
    const parent = t.parent ? (ids.get(t.parent) ?? null) : null;
    const color = PALETTE[(first + t.limb) % PALETTE.length];
    const bone = addBone(bones, parent, t.from, t.to, {}, { name, color, reach });
    ids.set(t.name, bone.id);
    added.push(bone);
  }
  return added;
}
