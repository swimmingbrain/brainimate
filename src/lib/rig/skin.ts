import type { Anchor, Bone, Item, Mat, PathData, PathItem, Skin, Vec } from '$lib/core/types';
import { applyPoint, applyVector, identity, invert, isIdentity, multiply, scaleFactor } from '$lib/core/mat';
import { split, type Cubic } from '$lib/core/bezier';
import { segmentDistance, type Rig } from './bones';

export type Weight = { bone: string; w: number };

// weights below this are left out, an anchor follows at most this many bones
const MIN_WEIGHT = 0.05;
const MAX_BONES = 4;

// a bone as a line with a reach around it, in the space the item is measured in
interface Capsule {
  id: string;
  a: Vec;
  b: Vec;
  r: number;
}

// the bones placed by matrices, their bind matrices when none are given
function capsules(bones: Bone[], matrices?: Map<string, Mat>): Capsule[] {
  return bones.map((bone) => {
    const m = matrices?.get(bone.id) ?? bone.bind;
    return {
      id: bone.id,
      a: applyPoint(m, { x: 0, y: 0 }),
      b: applyPoint(m, { x: bone.length, y: 0 }),
      r: Math.max(1e-6, bone.radius * scaleFactor(m))
    };
  });
}

// the weights for one anchor from its point and its handle points: (1 - d / r)^2 inside the reach,
// 1 / (d + 1)^3 for every bone when no reach gets there, then the small ones dropped and the rest summed to 1
function weightsFor(points: Vec[], caps: Capsule[]): Weight[] {
  const raw = caps.map((c) => {
    let w = 0;
    for (const p of points) w += Math.max(0, 1 - segmentDistance(p, c.a, c.b).d / c.r) ** 2;
    return w / points.length;
  });
  if (raw.every((w) => w <= 0)) {
    caps.forEach((c, i) => {
      let w = 0;
      for (const p of points) w += 1 / (segmentDistance(p, c.a, c.b).d + 1) ** 3;
      raw[i] = w / points.length;
    });
  }
  return normalize(caps.map((c, i) => ({ bone: c.id, w: raw[i] })));
}

// small weights go, the four largest stay and sum to 1
export function normalize(list: Weight[]): Weight[] {
  let total = list.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return [];
  let out = list.map((x) => ({ bone: x.bone, w: Math.max(0, x.w) / total })).filter((x) => x.w >= MIN_WEIGHT);
  if (out.length === 0) out = [list.reduce((a, b) => (b.w > a.w ? b : a))].map((x) => ({ bone: x.bone, w: 1 }));
  out.sort((a, b) => b.w - a.w);
  out = out.slice(0, MAX_BONES);
  total = out.reduce((s, x) => s + x.w, 0);
  return out.map((x) => ({ bone: x.bone, w: x.w / total }));
}

function handlePoints(a: Anchor, m: Mat): Vec[] {
  const out = [applyPoint(m, a)];
  if (a.ix !== 0 || a.iy !== 0) out.push(applyPoint(m, { x: a.x + a.ix, y: a.y + a.iy }));
  if (a.ox !== 0 || a.oy !== 0) out.push(applyPoint(m, { x: a.x + a.ox, y: a.y + a.oy }));
  return out;
}

// the outline first, then the subpaths, the order skin weights are kept in
export function anchorList(item: PathItem): Anchor[] {
  const out = [...item.path.anchors];
  for (const sub of item.subpaths) out.push(...sub.anchors);
  return out;
}

// one list of bone weights per anchor, world is the item's world matrix and matrices place the bones
// (their bind matrices when left out)
export function autoWeights(item: PathItem, world: Mat, bones: Bone[], matrices?: Map<string, Mat>): Weight[][] {
  const caps = capsules(bones, matrices);
  if (caps.length === 0) return [];
  return anchorList(item).map((a) => weightsFor(handlePoints(a, world), caps));
}

// the bone whose reach holds all the points, the one whose line runs closest to their middle when
// several do, null when none does
export function holdingBone(points: Vec[], bones: Bone[], matrices?: Map<string, Mat>): string | null {
  if (points.length === 0) return null;
  const mid = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length
  };
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of capsules(bones, matrices)) {
    if (!points.every((p) => segmentDistance(p, c.a, c.b).d <= c.r)) continue;
    const d = segmentDistance(mid, c.a, c.b).d;
    if (d < bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}

// the bone whose line runs closest to p
export function nearestBone(p: Vec, bones: Bone[], matrices?: Map<string, Mat>): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of capsules(bones, matrices)) {
    const d = segmentDistance(p, c.a, c.b).d;
    if (d < bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}

// sum w_i * world_i * inverse(bind_i), a bone the rig does not have is left out
export function blend(weights: Weight[], rig: Rig): Mat {
  const out: Mat = [0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const { bone, w } of weights) {
    const m = rig.skin.get(bone);
    if (!m) continue;
    for (let i = 0; i < 6; i++) out[i] += w * m[i];
    total += w;
  }
  if (total <= 0) return identity();
  if (Math.abs(total - 1) > 1e-9) for (let i = 0; i < 6; i++) out[i] /= total;
  return out;
}

// the anchor with its point and both handle points through one affine matrix
export function mapAnchor(a: Anchor, m: Mat): Anchor {
  const p = applyPoint(m, a);
  const i = applyVector(m, { x: a.ix, y: a.iy });
  const o = applyVector(m, { x: a.ox, y: a.oy });
  return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, kind: a.kind };
}

// the matrix a rigid skin puts on top of the item's world matrix
export function rigidDelta(skin: Skin, rig: Rig): Mat {
  return (skin.rigid && rig.skin.get(skin.rigid)) || identity();
}

// a contour with each anchor through its own matrix, first is where its weights start in the skin
function mapContour(path: PathData, first: number, matrixAt: (index: number) => Mat): PathData {
  return { closed: path.closed, anchors: path.anchors.map((a, i) => mapAnchor(a, matrixAt(first + i))) };
}

function contoursOf(item: PathItem): PathData[] {
  return [item.path, ...item.subpaths];
}

// each contour through matrixAt, the outline and then the subpaths
function mapContours(item: PathItem, matrixAt: (index: number) => Mat): { path: PathData; subpaths: PathData[] } {
  let first = 0;
  const out = contoursOf(item).map((c) => {
    const mapped = mapContour(c, first, matrixAt);
    first += c.anchors.length;
    return mapped;
  });
  return { path: out[0], subpaths: out.slice(1) };
}

// linear blend skinning: every anchor and its two handle points in world space through the blend of
// its bones, p' = sum w_i * world_i * inverse(bind_i) * p. a rigid skin moves it all with one bone
export function deform(item: PathItem, rig: Rig, world: Mat): { path: PathData; subpaths: PathData[] } {
  const skin = item.skin;
  if (!skin) return mapContours(item, () => world);
  if (skin.rigid) {
    const m = multiply(rigidDelta(skin, rig), world);
    return mapContours(item, () => m);
  }
  return mapContours(item, (i) => multiply(blend(skin.weights[i] ?? [], rig), world));
}

// the same blend seen from the item's own space: inverse(world) * blend * world, per anchor
export function localBlends(item: PathItem, rig: Rig, world: Mat): Mat[] {
  const n = anchorList(item).length;
  if (!item.skin || item.skin.rigid) return new Array(n).fill(identity());
  return skinBlends(item.skin, rig, world, n);
}

function sameMat(a: Mat, b: Mat): boolean {
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

// a rigidly bound item's transform with the bone's move on top, seen from inside its groups
function rigidTransform(t: Mat, parent: Mat, delta: Mat): Mat {
  if (isIdentity(delta)) return t;
  if (isIdentity(parent)) return multiply(delta, t);
  return multiply(invert(parent), multiply(delta, multiply(parent, t)));
}

// per item and rig, a rig object stays the same until a rig layer or the frame changes, an edit makes
// a new item object, so nothing stale is ever read
const shapes = new WeakMap<Item, { rig: Rig; parent: Mat; out: Item }>();

// the item as the rig shows it: a skinned path with its anchors moved in its own space, a rigidly bound
// item with the bone's move on its transform. parent is the matrix of the groups around it, preview
// swaps in the copies a tool is dragging. what comes back draws, hits and measures like any item
export function posed(item: Item, parent: Mat, rig: Rig, preview?: Map<string, Item>): Item {
  if (item.type === 'group') return posedGroup(item, parent, rig, preview);
  const skin = item.skin;
  if (!skin) return item;
  const hit = shapes.get(item);
  if (hit && hit.rig === rig && sameMat(hit.parent, parent)) return hit.out;
  let out: Item = item;
  if (skin.rigid) {
    out = { ...item, transform: rigidTransform(item.transform, parent, rigidDelta(skin, rig)) };
  } else if (item.type === 'path') {
    const blends = localBlends(item, rig, multiply(parent, item.transform));
    out = { ...item, ...mapContours(item, (i) => blends[i]) };
  }
  shapes.set(item, { rig, parent, out });
  return out;
}

function posedGroup(group: Extract<Item, { type: 'group' }>, parent: Mat, rig: Rig, preview?: Map<string, Item>): Item {
  const world = multiply(parent, group.transform);
  let changed = false;
  const children = group.children.map((c) => {
    const src = preview?.get(c.id) ?? c;
    // a group bound as a whole takes its children along, they are not bound on their own
    const out = group.skin?.rigid ? src : posed(src, world, rig, preview);
    if (out !== c) changed = true;
    return out;
  });
  if (group.skin?.rigid) {
    return { ...group, children, transform: rigidTransform(group.transform, parent, rigidDelta(group.skin, rig)) };
  }
  return changed ? { ...group, children } : group;
}

// the items of a keyframe as the rig shows them
export function posedList(items: Item[], rig: Rig | null, preview?: Map<string, Item>): Item[] {
  if (!rig) return items;
  let changed = false;
  const out = items.map((item) => {
    const src = preview?.get(item.id) ?? item;
    const p = posed(src, identity(), rig, preview);
    if (p !== item) changed = true;
    return p;
  });
  return changed ? out : items;
}

// roughly how the rig moves the item as a whole in world space: the bone's move for a rigid skin,
// the average blend of the anchors for a smooth one. a move of what shows is turned into a move of
// the rest shape through it
export function skinDelta(item: Item, parent: Mat, rig: Rig | null): Mat {
  const skin = item.skin;
  if (!rig || !skin) return identity();
  if (skin.rigid) return rigidDelta(skin, rig);
  if (skin.weights.length === 0) return identity();
  const out: Mat = [0, 0, 0, 0, 0, 0];
  for (const w of skin.weights) {
    const b = blend(w, rig);
    for (let i = 0; i < 6; i++) out[i] += b[i] / skin.weights.length;
  }
  return out;
}

// the blends of the anchors as the skin has them, seen from the item's space
function skinBlends(skin: Skin, rig: Rig, world: Mat, count: number): Mat[] {
  const inv = invert(world);
  const out: Mat[] = [];
  for (let i = 0; i < count; i++) {
    const b = blend(skin.weights[i] ?? [], rig);
    out.push(isIdentity(b) ? identity() : multiply(inv, multiply(b, world)));
  }
  return out;
}

// where contour sub starts in the skin's list of anchors
function firstAnchor(item: PathItem, sub: number): number {
  let first = 0;
  for (let s = 0; s < sub; s++) first += (s === 0 ? item.path : item.subpaths[s - 1]).anchors.length;
  return first;
}

// a contour edited the way it shows, carried back to the rest shape through the blend of each anchor,
// so editing a bent arm keeps working. anchor i of the contour goes back through the weights at i
export function restContour(item: PathItem, parent: Mat, rig: Rig, sub: number, shown: PathData): PathData {
  const skin = item.skin;
  if (!skin || skin.rigid) return shown;
  const first = firstAnchor(item, sub);
  const blends = skinBlends(skin, rig, multiply(parent, item.transform), first + shown.anchors.length);
  return {
    closed: shown.closed,
    anchors: shown.anchors.map((a, i) => {
      const m = blends[first + i];
      return isIdentity(m) ? { ...a } : mapAnchor(a, invert(m));
    })
  };
}

// the skin with weights for an anchor put in on segment index of contour sub at t, mixed from its two
// neighbors, so the new anchor bends along with them
export function insertWeights(item: PathItem, sub: number, index: number, t: number): Skin | null {
  const skin = item.skin;
  if (!skin || skin.rigid) return skin;
  const contour = sub === 0 ? item.path : item.subpaths[sub - 1];
  if (!contour) return skin;
  const first = firstAnchor(item, sub);
  const a = skin.weights[first + index] ?? [];
  const b = skin.weights[first + ((index + 1) % contour.anchors.length)] ?? [];
  const mixed = new Map<string, number>();
  for (const x of a) mixed.set(x.bone, (mixed.get(x.bone) ?? 0) + x.w * (1 - t));
  for (const x of b) mixed.set(x.bone, (mixed.get(x.bone) ?? 0) + x.w * t);
  const weights = skin.weights.slice();
  weights.splice(first + index + 1, 0, normalize([...mixed].map(([bone, w]) => ({ bone, w }))));
  return { weights, rigid: null };
}

// a bend needs anchors to bend at: segments longer than step world units are split into equal pieces,
// at most maxPieces. a straight segment gets handles along its line, so the shape stays as it is at
// rest and turns into a smooth curve once the bones turn
export function refinePath(path: PathData, world: Mat, step: number, maxPieces = 12): PathData {
  const src = path.anchors;
  const n = src.length;
  const count = n < 2 ? 0 : path.closed ? n : n - 1;
  const out = src.map((a) => ({ ...a }));
  const added: Anchor[][] = src.map(() => []);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    const a = src[i];
    const b = src[j];
    const straight = a.ox === 0 && a.oy === 0 && b.ix === 0 && b.iy === 0;
    let c: Cubic = [
      { x: a.x, y: a.y },
      straight ? { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 } : { x: a.x + a.ox, y: a.y + a.oy },
      straight ? { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 } : { x: b.x + b.ix, y: b.y + b.iy },
      { x: b.x, y: b.y }
    ];
    const w = c.map((p) => applyPoint(world, p));
    const chord = Math.hypot(w[3].x - w[0].x, w[3].y - w[0].y);
    const net = Math.hypot(w[1].x - w[0].x, w[1].y - w[0].y) + Math.hypot(w[2].x - w[1].x, w[2].y - w[1].y);
    const length = (chord + net + Math.hypot(w[3].x - w[2].x, w[3].y - w[2].y)) / 2;
    const pieces = Math.min(maxPieces, Math.ceil(length / Math.max(step, 1e-6)));
    if (pieces <= 1) continue;
    const parts: Cubic[] = [];
    for (let k = pieces; k > 1; k--) {
      const [left, right] = split(c, 1 / k);
      parts.push(left);
      c = right;
    }
    parts.push(c);
    out[i].ox = parts[0][1].x - a.x;
    out[i].oy = parts[0][1].y - a.y;
    out[j].ix = parts[pieces - 1][2].x - b.x;
    out[j].iy = parts[pieces - 1][2].y - b.y;
    for (let k = 1; k < pieces; k++) {
      const p = parts[k - 1][3];
      added[i].push({
        x: p.x,
        y: p.y,
        ix: parts[k - 1][2].x - p.x,
        iy: parts[k - 1][2].y - p.y,
        ox: parts[k][1].x - p.x,
        oy: parts[k][1].y - p.y,
        kind: 'smooth'
      });
    }
  }
  const anchors: Anchor[] = [];
  out.forEach((a, i) => anchors.push(a, ...added[i]));
  return { anchors, closed: path.closed };
}

// a quarter of the shortest bone, so a bend has a few anchors on each side of a joint
export function refineStep(bones: Bone[], matrices?: Map<string, Mat>): number {
  let shortest = Infinity;
  for (const b of bones) shortest = Math.min(shortest, b.length * scaleFactor(matrices?.get(b.id) ?? b.bind));
  return Number.isFinite(shortest) ? Math.max(6, shortest / 4) : Infinity;
}
