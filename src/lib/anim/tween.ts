import type { Anchor, BonePose, Item, Mat, Paint, PathData, Stop, Style } from '$lib/core/types';
import { decompose, equals, invert, multiply, type Decomposed } from '$lib/core/mat';
import { mixHex } from '$lib/core/color';
import { cloneItem } from '$lib/core/items';

// everything here returns the object from a when nothing changes, so cached Path2D and
// decompositions keep working and a held item costs nothing per frame

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const TAU = Math.PI * 2;

// the turn from a to b the short way round
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

// the same matrices come back every frame of a tween
const decomposed = new WeakMap<Mat, Decomposed>();

function parts(m: Mat): Decomposed {
  let d = decomposed.get(m);
  if (!d) {
    d = decompose(m);
    decomposed.set(m, d);
  }
  return d;
}

// translate, the short way round for the rotation, skew and scale, put back together like compose
export function tweenTransform(a: Mat, b: Mat, t: number): Mat {
  if (a === b || equals(a, b, 0)) return a;
  const p = parts(a);
  const q = parts(b);
  const r = p.rotation + angleDelta(p.rotation, q.rotation) * t;
  const k = Math.tan(lerp(p.skew, q.skew, t));
  const sx = lerp(p.scaleX, q.scaleX, t);
  const sy = lerp(p.scaleY, q.scaleY, t);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c * sx, s * sx, (c * k - s) * sy, (s * k + c) * sy, lerp(p.x, q.x, t), lerp(p.y, q.y, t)];
}

function sameAnchors(a: Anchor[], b: Anchor[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p.x !== q.x || p.y !== q.y || p.ix !== q.ix || p.iy !== q.iy || p.ox !== q.ox || p.oy !== q.oy) return false;
  }
  return true;
}

// keyframes copy their items, so two equal paths are usually two objects
const sameCache = new WeakMap<PathData, { other: PathData; same: boolean }>();

function samePath(a: PathData, b: PathData): boolean {
  const hit = sameCache.get(a);
  if (hit && hit.other === b) return hit.same;
  const same = a.closed === b.closed && sameAnchors(a.anchors, b.anchors);
  sameCache.set(a, { other: b, same });
  return same;
}

// anchor by anchor with their handles, a contour with another anchor count holds
export function tweenPath(a: PathData, b: PathData, t: number): PathData {
  if (a === b || a.anchors.length !== b.anchors.length || samePath(a, b)) return a;
  const anchors = a.anchors.map((p, i) => {
    const q = b.anchors[i];
    return {
      x: lerp(p.x, q.x, t),
      y: lerp(p.y, q.y, t),
      ix: lerp(p.ix, q.ix, t),
      iy: lerp(p.iy, q.iy, t),
      ox: lerp(p.ox, q.ox, t),
      oy: lerp(p.oy, q.oy, t),
      kind: p.kind
    };
  });
  return { anchors, closed: a.closed };
}

function tweenSubpaths(a: PathData[], b: PathData[], t: number): PathData[] {
  if (a === b || a.length === 0 || a.length !== b.length) return a;
  let changed = false;
  const out = a.map((c, i) => {
    const r = tweenPath(c, b[i], t);
    if (r !== c) changed = true;
    return r;
  });
  return changed ? out : a;
}

function sameStops(a: Stop[], b: Stop[]): boolean {
  return a.every((s, i) => s.t === b[i].t && s.color === b[i].color && s.alpha === b[i].alpha);
}

function tweenStops(a: Stop[], b: Stop[], t: number): Stop[] {
  return a.map((s, i) => ({
    t: lerp(s.t, b[i].t, t),
    color: mixHex(s.color, b[i].color, t),
    alpha: lerp(s.alpha, b[i].alpha, t)
  }));
}

// colors mix in rgb with their alpha, gradients only with the same kind and stop count
export function tweenPaint(a: Paint | null, b: Paint | null, t: number): Paint | null {
  if (a === b || !a || !b) return a;
  if (a.type === 'solid' && b.type === 'solid') {
    if (a.color === b.color && a.alpha === b.alpha) return a;
    return { type: 'solid', color: mixHex(a.color, b.color, t), alpha: lerp(a.alpha, b.alpha, t) };
  }
  if (a.type === 'linear' && b.type === 'linear' && a.stops.length === b.stops.length) {
    if (sameStops(a.stops, b.stops) && a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2) return a;
    return {
      type: 'linear',
      stops: tweenStops(a.stops, b.stops, t),
      x1: lerp(a.x1, b.x1, t),
      y1: lerp(a.y1, b.y1, t),
      x2: lerp(a.x2, b.x2, t),
      y2: lerp(a.y2, b.y2, t)
    };
  }
  if (a.type === 'radial' && b.type === 'radial' && a.stops.length === b.stops.length) {
    const sameGeometry = a.cx === b.cx && a.cy === b.cy && a.r === b.r && a.fx === b.fx && a.fy === b.fy;
    if (sameGeometry && sameStops(a.stops, b.stops)) return a;
    return {
      type: 'radial',
      stops: tweenStops(a.stops, b.stops, t),
      cx: lerp(a.cx, b.cx, t),
      cy: lerp(a.cy, b.cy, t),
      r: lerp(a.r, b.r, t),
      fx: lerp(a.fx, b.fx, t),
      fy: lerp(a.fy, b.fy, t)
    };
  }
  return a;
}

function sameNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export function tweenStyle(a: Style, b: Style, t: number): Style {
  if (a === b) return a;
  const fill = tweenPaint(a.fill, b.fill, t);
  const stroke = tweenPaint(a.stroke, b.stroke, t);
  const width = lerp(a.width, b.width, t);
  const blendDash = a.dash.length === b.dash.length && !sameNumbers(a.dash, b.dash);
  const dash = blendDash ? a.dash.map((d, i) => lerp(d, b.dash[i], t)) : a.dash;
  if (fill === a.fill && stroke === a.stroke && width === a.width && dash === a.dash) return a;
  return { ...a, fill, stroke, width, dash };
}

// b is the same item one keyframe later, anything the two do not share stays like a
export function tweenItem(a: Item, b: Item, t: number): Item {
  if (a === b || a.type !== b.type) return a;
  const transform = tweenTransform(a.transform, b.transform, t);
  const opacity = lerp(a.opacity, b.opacity, t);
  switch (a.type) {
    case 'path': {
      const q = b as typeof a;
      const path = tweenPath(a.path, q.path, t);
      const subpaths = tweenSubpaths(a.subpaths, q.subpaths, t);
      const style = tweenStyle(a.style, q.style, t);
      const same = path === a.path && subpaths === a.subpaths && style === a.style;
      if (same && transform === a.transform && opacity === a.opacity) return a;
      return { ...a, transform, opacity, path, subpaths, style };
    }
    case 'group': {
      const children = tweenItems(a.children, (b as typeof a).children, t);
      return { ...a, transform, opacity, children };
    }
    case 'text': {
      const q = b as typeof a;
      // box text keeps wrapping while the box changes, point text stays point text
      const width = a.width !== null && q.width !== null ? lerp(a.width, q.width, t) : a.width;
      return {
        ...a,
        transform,
        opacity,
        size: lerp(a.size, q.size, t),
        lineHeight: lerp(a.lineHeight, q.lineHeight, t),
        spacing: lerp(a.spacing, q.spacing, t),
        width,
        style: tweenStyle(a.style, q.style, t)
      };
    }
    case 'image': {
      const q = b as typeof a;
      return { ...a, transform, opacity, width: lerp(a.width, q.width, t), height: lerp(a.height, q.height, t) };
    }
    case 'instance': {
      const q = b as typeof a;
      // a tint that only one side has fades in or out by its amount
      const tint = a.tint && q.tint ? mixHex(a.tint, q.tint, t) : (a.tint ?? q.tint);
      const from = a.tint ? a.tintAmount : 0;
      const to = q.tint ? q.tintAmount : 0;
      return {
        ...a,
        transform,
        opacity,
        first: Math.round(lerp(a.first, q.first, t)),
        alpha: lerp(a.alpha, q.alpha, t),
        tint,
        tintAmount: lerp(from, to, t)
      };
    }
  }
}

const indexCache = new WeakMap<Item[], Map<string, Item>>();

function byId(items: Item[]): Map<string, Item> {
  let map = indexCache.get(items);
  if (!map) {
    map = new Map(items.map((it) => [it.id, it]));
    indexCache.set(items, map);
  }
  return map;
}

// items are matched by id, the ones the next keyframe lacks hold, the ones only it has wait for it
export function tweenItems(a: Item[], b: Item[], t: number): Item[] {
  if (a === b) return a;
  const next = byId(b);
  return a.map((item) => {
    const other = next.get(item.id);
    return other ? tweenItem(item, other, t) : item;
  });
}

const REST: BonePose = { rotation: 0, x: 0, y: 0, scale: 1 };

// a bone missing on one side is at rest there
export function tweenPose(
  a: Record<string, BonePose>,
  b: Record<string, BonePose>,
  t: number
): Record<string, BonePose> {
  const out: Record<string, BonePose> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[id] ?? REST;
    const q = b[id] ?? REST;
    out[id] = {
      rotation: p.rotation + angleDelta(p.rotation, q.rotation) * t,
      x: lerp(p.x, q.x, t),
      y: lerp(p.y, q.y, t),
      scale: lerp(p.scale, q.scale, t)
    };
  }
  return out;
}

const KEEP = new Set(['id', 'transform', 'children']);

// an edit made on the in between state a tween shows, carried over to the keyframe item:
// a move moves the keyframe item by as much, any other field that changed is taken as it is
export function rebaseEdit(key: Item, shown: Item, edited: Item): Item {
  const out = cloneItem(key) as unknown as Record<string, unknown>;
  if (!equals(shown.transform, edited.transform)) {
    out.transform = multiply(multiply(edited.transform, invert(shown.transform)), key.transform);
  }
  const before = shown as unknown as Record<string, unknown>;
  const after = edited as unknown as Record<string, unknown>;
  for (const field of Object.keys(after)) {
    if (KEEP.has(field)) continue;
    const value = JSON.stringify(after[field]);
    if (value !== JSON.stringify(before[field])) out[field] = value === undefined ? undefined : JSON.parse(value);
  }
  if (key.type === 'group' && shown.type === 'group' && edited.type === 'group') {
    const was = byId(shown.children);
    const own = byId(key.children);
    out.children = edited.children.map((child) => {
      const a = was.get(child.id);
      const k = own.get(child.id);
      return a && k ? rebaseEdit(k, a, child) : cloneItem(child);
    });
  }
  return out as unknown as Item;
}
