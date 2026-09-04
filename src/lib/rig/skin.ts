import type { Anchor, Bone, Item, Mat, PathData, PathItem, Skin, Vec } from '$lib/core/types';
import { applyPoint, applyVector, identity, invert, isIdentity, multiply, scaleFactor } from '$lib/core/mat';
import { split, type Cubic } from '$lib/core/bezier';
import { corners, isEmpty } from '$lib/core/bbox';
import { itemBounds } from '$lib/core/items';
import { flattenPath, transformPath } from '$lib/core/path';
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
  return fade(caps.map((c, i) => ({ bone: c.id, w: raw[i] })));
}

// small weights go without a jump: summed to 1, every weight loses the cut off, the ones left over
// are summed to 1 again. a weight that sinks under the cut fades to nothing along an outline
function fade(list: Weight[]): Weight[] {
  const total = list.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return [];
  let kept = list.map((x) => ({ bone: x.bone, w: Math.max(0, x.w) / total - MIN_WEIGHT })).filter((x) => x.w > 0);
  if (kept.length === 0) kept = [{ bone: list.reduce((a, b) => (b.w > a.w ? b : a)).bone, w: 1 }];
  kept.sort((a, b) => b.w - a.w);
  kept = kept.slice(0, MAX_BONES);
  const sum = kept.reduce((s, x) => s + x.w, 0);
  return kept.map((x) => ({ bone: x.bone, w: x.w / sum }));
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

// the blend of each anchor in world space, the outline first and then the subpaths
function worldBlends(skin: Skin, rig: Rig, count: number): Mat[] {
  const out: Mat[] = [];
  for (let i = 0; i < count; i++) out.push(blend(skin.weights[i] ?? [], rig));
  return out;
}

// how fast what the blends do to the point p changes from anchor k to anchor l, per world unit of the
// outline between them. zero at the bind pose and where both anchors follow the same bones
function rate(blends: Mat[], k: number, l: number, p: Vec, length: number): Vec {
  if (length < 1e-9) return { x: 0, y: 0 };
  const a = applyPoint(blends[k], p);
  const b = applyPoint(blends[l], p);
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

// the speed of the blend along the outline at each anchor, for the in and the out handle. a smooth
// anchor takes the same one on both sides, so its handles stay in line
function rates(path: PathData, pts: Vec[], blends: Mat[]): { into: Vec; out: Vec }[] {
  const n = pts.length;
  const zero = { x: 0, y: 0 };
  return pts.map((p, j) => {
    const prev = j > 0 || path.closed ? (j - 1 + n) % n : -1;
    const next = j < n - 1 || path.closed ? (j + 1) % n : -1;
    const dp = prev >= 0 ? Math.hypot(p.x - pts[prev].x, p.y - pts[prev].y) : 0;
    const dn = next >= 0 ? Math.hypot(pts[next].x - p.x, pts[next].y - p.y) : 0;
    const back = prev >= 0 && prev !== j ? rate(blends, prev, j, p, dp) : null;
    const ahead = next >= 0 && next !== j ? rate(blends, j, next, p, dn) : null;
    if (path.anchors[j].kind === 'corner') return { into: back ?? zero, out: ahead ?? zero };
    const both = back && ahead ? rate(blends, prev, next, p, dp + dn) : (back ?? ahead ?? zero);
    return { into: both, out: both };
  });
}

// linear blend skinning of one contour in world space: each anchor through the blend of its bones,
// p' = sum w_i * world_i * inverse(bind_i) * p. a handle goes through the same blend and also follows
// how the blend changes along the outline, so the curve between anchors bends as smoothly as they do
function bendContour(path: PathData, world: Mat, blends: Mat[]): PathData {
  const pts = path.anchors.map((a) => applyPoint(world, a));
  const speed = rates(path, pts, blends);
  return {
    closed: path.closed,
    anchors: path.anchors.map((a, j) => {
      const b = blends[j];
      const q = applyPoint(b, pts[j]);
      const hi = applyVector(world, { x: a.ix, y: a.iy });
      const ho = applyVector(world, { x: a.ox, y: a.oy });
      const vi = applyVector(b, hi);
      const vo = applyVector(b, ho);
      const li = Math.hypot(hi.x, hi.y);
      const lo = Math.hypot(ho.x, ho.y);
      return {
        x: q.x,
        y: q.y,
        ix: vi.x - li * speed[j].into.x,
        iy: vi.y - li * speed[j].into.y,
        ox: vo.x + lo * speed[j].out.x,
        oy: vo.y + lo * speed[j].out.y,
        kind: a.kind
      };
    })
  };
}

// the other way: a contour bent the way it shows in world space taken back to the rest shape. the
// points go back through their blends, the handles are solved for a few rounds since how much the
// blend changes along a handle depends on its rest length
function unbendContour(shown: PathData, blends: Mat[], template: PathData): PathData {
  const inv = blends.map((b) => invert(b));
  const pts = shown.anchors.map((a, j) => applyPoint(inv[j], a));
  const kinds: PathData = { closed: shown.closed, anchors: template.anchors.map((a) => ({ ...a })) };
  const speed = rates(kinds, pts, blends);
  return {
    closed: shown.closed,
    anchors: shown.anchors.map((a, j) => {
      const solve = (h: Vec, sign: number, r: Vec): Vec => {
        let v = applyVector(inv[j], h);
        for (let k = 0; k < 6; k++) {
          const l = Math.hypot(v.x, v.y);
          v = applyVector(inv[j], { x: h.x - sign * l * r.x, y: h.y - sign * l * r.y });
        }
        return v;
      };
      const hi = a.ix === 0 && a.iy === 0 ? { x: 0, y: 0 } : solve({ x: a.ix, y: a.iy }, -1, speed[j].into);
      const ho = a.ox === 0 && a.oy === 0 ? { x: 0, y: 0 } : solve({ x: a.ox, y: a.oy }, 1, speed[j].out);
      return { x: pts[j].x, y: pts[j].y, ix: hi.x, iy: hi.y, ox: ho.x, oy: ho.y, kind: a.kind };
    })
  };
}

// a skinned path in world space: smooth skins bend every contour, a rigid one moves it all with one bone
export function deform(item: PathItem, rig: Rig, world: Mat): { path: PathData; subpaths: PathData[] } {
  const skin = item.skin;
  if (!skin) return mapContours(item, () => world);
  if (skin.rigid) {
    const m = multiply(rigidDelta(skin, rig), world);
    return mapContours(item, () => m);
  }
  const blends = worldBlends(skin, rig, anchorList(item).length);
  let first = 0;
  const out = contoursOf(item).map((c) => {
    const bent = bendContour(c, world, blends.slice(first, first + c.anchors.length));
    first += c.anchors.length;
    return bent;
  });
  return { path: out[0], subpaths: out.slice(1) };
}

// the bent shape seen from the item's own space, what it draws with under its own transform
function deformLocal(item: PathItem, rig: Rig, world: Mat): { path: PathData; subpaths: PathData[] } {
  const bent = deform(item, rig, world);
  const inv = invert(world);
  return { path: transformPath(bent.path, inv), subpaths: bent.subpaths.map((c) => transformPath(c, inv)) };
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
    out = { ...item, ...deformLocal(item, rig, multiply(parent, item.transform)) };
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

// how the rig moves a rigidly bound item in world space, a move of what shows is turned into a move
// of its rest place through it. a smooth skin bends each part its own way, there a move changes the
// rest place as it is and is exact on the bind pose
export function skinDelta(item: Item, rig: Rig | null): Mat {
  const skin = item.skin;
  if (!rig || !skin?.rigid) return identity();
  return rigidDelta(skin, rig);
}

// where contour sub starts in the skin's list of anchors
function firstAnchor(item: PathItem, sub: number): number {
  let first = 0;
  for (let s = 0; s < sub; s++) first += (s === 0 ? item.path : item.subpaths[s - 1]).anchors.length;
  return first;
}

// a contour edited the way it shows, carried back to the rest shape through the bones, so editing a
// bent arm keeps working. anchor i of the contour goes back through the weights at i
export function restContour(item: PathItem, parent: Mat, rig: Rig, sub: number, shown: PathData): PathData {
  const skin = item.skin;
  if (!skin || skin.rigid) return shown;
  const first = firstAnchor(item, sub);
  const blends = worldBlends(skin, rig, first + shown.anchors.length).slice(first);
  const world = multiply(parent, item.transform);
  const back = unbendContour(transformPath(shown, world), blends, shown);
  return transformPath(back, invert(world));
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
export function refinePath(path: PathData, world: Mat, step: number, maxPieces = 24): PathData {
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

// an eighth of the shortest bone, so a bend has a few anchors on each side of a joint
export function refineStep(bones: Bone[], matrices?: Map<string, Mat>): number {
  let shortest = Infinity;
  for (const b of bones) shortest = Math.min(shortest, b.length * scaleFactor(matrices?.get(b.id) ?? b.bind));
  return Number.isFinite(shortest) ? Math.max(6, shortest / 8) : Infinity;
}

export type BindMode = 'smooth' | 'rigid' | 'auto';

// the corners of the item's box in world space
function boxPoints(item: Item, world: Mat): Vec[] {
  const b = itemBounds(item, world);
  return isEmpty(b) ? [] : corners(b);
}

function centerOf(points: Vec[]): Vec {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length
  };
}

// the bone an item follows rigidly: the one whose reach holds it, else the closest one
function rigidBoneFor(item: Item, world: Mat, bones: Bone[], matrices?: Map<string, Mat>): string | null {
  const pts = boxPoints(item, world);
  return holdingBone(pts, bones, matrices) ?? nearestBone(centerOf(pts), bones, matrices);
}

function rigidBind(item: Item, parent: Mat, bone: string, rig: Rig, fresh: boolean): Item {
  const skin: Skin = { weights: [], rigid: bone };
  // an item bound now stays where it is, its rest place is taken back through the bone's move
  const d = rig.skin.get(bone);
  const transform = fresh && d ? rigidTransform(item.transform, parent, invert(d)) : item.transform;
  if (item.type === 'group') return { ...item, transform, skin, children: item.children.map(unbindItem) };
  return { ...item, transform, skin } as Item;
}

function smoothBind(item: PathItem, parent: Mat, bones: Bone[], rig: Rig, fresh: boolean): PathItem {
  const world = multiply(parent, item.transform);
  // an item bound now is measured against the bones as they show, one bound before against its bind
  const matrices = fresh ? rig.world : undefined;
  const step = refineStep(bones, matrices);
  const refined: PathItem = {
    ...item,
    path: refinePath(item.path, world, step),
    subpaths: item.subpaths.map((s) => refinePath(s, world, step))
  };
  const skin: Skin = { weights: autoWeights(refined, world, bones, matrices), rigid: null };
  const bound = { ...refined, skin };
  if (!fresh) return bound;
  // what shows now is taken back to where it would be at the bind pose
  return {
    ...bound,
    path: restContour(bound, parent, rig, 0, bound.path),
    subpaths: bound.subpaths.map((c, k) => restContour(bound, parent, rig, k + 1, c))
  };
}

// a copy of the item bound to some of the rig's bones. an item that was not bound stays where it shows
// with the bones as posed now. auto binds rigidly when the item fits in one bone's reach and smooth
// otherwise, a group that does not fit has its children bound one by one. text, pictures and instances
// only follow a bone rigidly. rigid picks the bone given, or the one that suits best
export function bindItem(item: Item, parent: Mat, bones: Bone[], rig: Rig, mode: BindMode, bone?: string): Item {
  if (bones.length === 0) return item;
  const fresh = !item.skin;
  const matrices = fresh ? rig.world : undefined;
  const world = multiply(parent, item.transform);
  if (mode === 'rigid') {
    const id = bone ?? rigidBoneFor(item, world, bones, matrices);
    return id ? rigidBind(item, parent, id, rig, fresh) : item;
  }
  const held = mode === 'auto' ? holdingBone(boxPoints(item, world), bones, matrices) : null;
  if (held) return rigidBind(item, parent, held, rig, fresh);
  if (item.type === 'group') {
    const children = item.children.map((c) => bindItem(c, world, bones, rig, mode));
    return { ...item, skin: null, children };
  }
  if (item.type === 'path') return smoothBind(item, parent, bones, rig, fresh);
  const id = rigidBoneFor(item, world, bones, matrices);
  return id ? rigidBind(item, parent, id, rig, fresh) : item;
}

// no skin anywhere in the item, it goes back to its rest shape
export function unbindItem<T extends Item>(item: T): T {
  if (item.type === 'group') return { ...item, skin: null, children: item.children.map(unbindItem) };
  return item.skin ? { ...item, skin: null } : item;
}

// the bones an item and the items inside it follow
export function boundBones(item: Item, out = new Set<string>()): Set<string> {
  if (item.skin?.rigid) out.add(item.skin.rigid);
  for (const list of item.skin?.weights ?? []) for (const w of list) out.add(w.bone);
  if (item.type === 'group') for (const c of item.children) boundBones(c, out);
  return out;
}

// points spread over what the item covers in world space: the outline of a path, the box of anything else
export function samplePoints(item: Item, world: Mat): Vec[] {
  if (item.type === 'path') {
    const out: Vec[] = [];
    for (const c of contoursOf(item)) for (const p of flattenPath(c, 2)) out.push(applyPoint(world, p));
    if (out.length > 0) return out;
  }
  if (item.type === 'group') return item.children.flatMap((c) => samplePoints(c, multiply(world, c.transform)));
  const pts = boxPoints(item, world);
  return pts.length > 0 ? [...pts, centerOf(pts)] : [];
}

// how much of the item lies within reach of the bones, 0 to 1, matrices place them as they show
export function reachShare(points: Vec[], bones: Bone[], matrices?: Map<string, Mat>): number {
  if (points.length === 0) return 0;
  const caps = capsules(bones, matrices);
  let inside = 0;
  for (const p of points) if (caps.some((c) => segmentDistance(p, c.a, c.b).d <= c.r)) inside++;
  return inside / points.length;
}

// the bones whose reach gets to at least one of the points
export function reachingBones(points: Vec[], bones: Bone[], matrices?: Map<string, Mat>): Bone[] {
  const caps = capsules(bones, matrices);
  return bones.filter((_, i) => points.some((p) => segmentDistance(p, caps[i].a, caps[i].b).d <= caps[i].r));
}

// the item with every skin taken off that follows a bone the set does not have, for pasting into
// another timeline. weights to missing bones go, an anchor left with none unbinds the whole path
export function keepSkins<T extends Item>(item: T, bones: Set<string>): T {
  let out: T = item;
  const skin = item.skin;
  if (skin) {
    const missing = skin.rigid
      ? !bones.has(skin.rigid)
      : skin.weights.some((list) => list.every((w) => !bones.has(w.bone)));
    if (missing) out = { ...out, skin: null };
    else if (!skin.rigid) {
      const weights = skin.weights.map((list) => normalize(list.filter((w) => bones.has(w.bone))));
      out = { ...out, skin: { weights, rigid: null } };
    }
  }
  if (out.type === 'group') out = { ...out, children: out.children.map((c) => keepSkins(c, bones)) };
  return out;
}

// the bone that moves most of the items, each item counting once, for an instance made from them
export function dominantBone(items: Item[]): string | null {
  const total = new Map<string, number>();
  const add = (bone: string, w: number) => total.set(bone, (total.get(bone) ?? 0) + w);
  const visit = (item: Item) => {
    const skin = item.skin;
    if (skin?.rigid) add(skin.rigid, 1);
    else if (skin && skin.weights.length > 0) {
      for (const list of skin.weights) for (const w of list) add(w.bone, w.w / skin.weights.length);
    }
    if (item.type === 'group') item.children.forEach(visit);
  };
  items.forEach(visit);
  let best: string | null = null;
  for (const [bone, w] of total) if (!best || w > total.get(best)!) best = bone;
  return best;
}
