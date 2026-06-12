import type { Anchor, PathData } from './types';
import { copyAnchor, kindOf, pathArea, reversePath } from './path';

export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude';

// a shape is one or more anchor lists in the same space, filled together
export type Shape = PathData[];

type Scope = paper.PaperScope;
type PaperItem = paper.PathItem;

// below this a piece is dust left over from the operation
const MIN_AREA = 1e-3;

let loading: Promise<Scope> | null = null;

// paper is large, it loads the first time a boolean runs and keeps one scope that never draws
export function loadPaper(): Promise<Scope> {
  if (!loading) {
    loading = import('paper/dist/paper-core').then((mod) => {
      const lib = ((mod as { default?: unknown }).default ?? mod) as Scope;
      const scope = new lib.PaperScope();
      scope.setup(new scope.Size(1, 1));
      scope.settings.insertItems = false;
      return scope;
    });
  }
  return loading;
}

function toPaperPath(scope: Scope, path: PathData): paper.Path {
  const p = new scope.Path({ insert: false });
  for (const a of path.anchors) {
    p.add(new scope.Segment(new scope.Point(a.x, a.y), new scope.Point(a.ix, a.iy), new scope.Point(a.ox, a.oy)));
  }
  // booleans work on areas, an open path is filled as if it were closed
  p.closed = true;
  return p;
}

function toPaper(scope: Scope, shape: Shape): PaperItem {
  const paths = shape.filter((p) => p.anchors.length > 1).map((p) => toPaperPath(scope, p));
  if (paths.length === 1) return paths[0];
  return new scope.CompoundPath({ children: paths, insert: false, fillRule: 'nonzero' });
}

function fromPaperPath(p: paper.Path): PathData {
  const anchors: Anchor[] = p.segments.map((s) => {
    const a: Anchor = {
      x: s.point.x,
      y: s.point.y,
      ix: s.handleIn.x,
      iy: s.handleIn.y,
      ox: s.handleOut.x,
      oy: s.handleOut.y,
      kind: 'corner'
    };
    a.kind = kindOf(a);
    return a;
  });
  return { anchors, closed: p.closed };
}

function children(item: PaperItem): paper.Path[] {
  if (item.className === 'CompoundPath') return item.children as paper.Path[];
  return [item as paper.Path];
}

function nearestPair(outer: PathData, hole: PathData): [number, number] {
  let best = Infinity;
  let pair: [number, number] = [0, 0];
  outer.anchors.forEach((o, i) => {
    hole.anchors.forEach((h, j) => {
      const d = (o.x - h.x) ** 2 + (o.y - h.y) ** 2;
      if (d < best) {
        best = d;
        pair = [i, j];
      }
    });
  });
  return pair;
}

// our paths have one anchor list, so a hole is joined to its outline with a bridge there and back.
// the hole runs the other way round, so the nonzero fill leaves it empty
export function bridgeHole(outer: PathData, hole: PathData): PathData {
  const ring = { anchors: hole.anchors.map(copyAnchor), closed: true };
  if (Math.sign(pathArea(ring)) === Math.sign(pathArea(outer))) reversePath(ring);
  const [i, j] = nearestPair(outer, ring);
  const o = outer.anchors;
  const h = ring.anchors;
  const out: Anchor[] = o.slice(0, i).map(copyAnchor);
  out.push({ ...o[i], ox: 0, oy: 0, kind: 'corner' });
  out.push({ ...h[j], ix: 0, iy: 0, kind: 'corner' });
  for (let k = 1; k < h.length; k++) out.push(copyAnchor(h[(j + k) % h.length]));
  out.push({ ...h[j], ox: 0, oy: 0, kind: 'corner' });
  out.push({ ...o[i], ix: 0, iy: 0, kind: 'corner' });
  for (let k = i + 1; k < o.length; k++) out.push(copyAnchor(o[k]));
  return { anchors: out, closed: true };
}

function near(a: Anchor, b: Anchor): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

// undoes bridgeHole: the outline and each hole come back as their own paths
export function splitBridges(path: PathData): PathData[] {
  const a = path.anchors;
  const n = a.length;
  if (!path.closed || n < 6) return [path];
  for (let p = 0; p < n; p++) {
    for (let q = p + 4; q < n; q++) {
      if (!near(a[p], a[q]) || !near(a[p + 1], a[q - 1])) continue;
      const outer: Anchor[] = [...a.slice(0, p), { ...a[p], ox: a[q].ox, oy: a[q].oy }, ...a.slice(q + 1)];
      outer[p].kind = kindOf(outer[p]);
      const hole: Anchor[] = [{ ...a[p + 1], ix: a[q - 1].ix, iy: a[q - 1].iy }, ...a.slice(p + 2, q - 1)];
      hole[0].kind = kindOf(hole[0]);
      return [
        ...splitBridges({ anchors: outer.map(copyAnchor), closed: true }),
        ...splitBridges({ anchors: hole.map(copyAnchor), closed: true })
      ];
    }
  }
  return [path];
}

// every island of the result becomes one path, holes are bridged into the island around them
function fromPaper(item: PaperItem): PathData[] {
  const list = children(item).filter((c) => c.segments.length > 1 && Math.abs(c.area) > MIN_AREA);
  // a point on the outline itself, the middle of a ring can sit inside one of its holes
  const points = list.map((c) => c.curves[0].getPointAtTime(0.5));
  const depth = list.map((_, i) => list.filter((o, k) => k !== i && o.contains(points[i])).length);
  const out = new Map<number, PathData>();
  list.forEach((c, i) => {
    if (depth[i] % 2 === 0) out.set(i, fromPaperPath(c));
  });
  list.forEach((c, i) => {
    if (depth[i] % 2 === 0) return;
    // the island right around the hole is the container one level up
    const parent = list.findIndex((o, k) => k !== i && depth[k] === depth[i] - 1 && o.contains(points[i]));
    const base = out.get(parent);
    if (base) out.set(parent, bridgeHole(base, fromPaperPath(c)));
  });
  return [...out.values()];
}

function apply(op: BooleanOp, a: PaperItem, b: PaperItem): PaperItem {
  const options = { insert: false };
  if (op === 'unite') return a.unite(b, options);
  if (op === 'subtract') return a.subtract(b, options);
  if (op === 'intersect') return a.intersect(b, options);
  return a.exclude(b, options);
}

// bottom shape first, each next one is united, subtracted, intersected or excluded in turn
export async function combine(op: BooleanOp, shapes: Shape[]): Promise<PathData[]> {
  if (shapes.length === 0) return [];
  const scope = await loadPaper();
  let acc = toPaper(scope, shapes[0]);
  for (let i = 1; i < shapes.length; i++) acc = apply(op, acc, toPaper(scope, shapes[i]));
  return fromPaper(acc);
}

export function unite(a: Shape, b: Shape): Promise<PathData[]> {
  return combine('unite', [a, b]);
}

export function subtract(a: Shape, b: Shape): Promise<PathData[]> {
  return combine('subtract', [a, b]);
}

export function intersect(a: Shape, b: Shape): Promise<PathData[]> {
  return combine('intersect', [a, b]);
}

export function exclude(a: Shape, b: Shape): Promise<PathData[]> {
  return combine('exclude', [a, b]);
}

function isEmpty(item: PaperItem): boolean {
  // paths and compound paths both have an area, the shared type does not say so
  return item.isEmpty() || Math.abs((item as paper.Path).area) < MIN_AREA;
}

// cuts the shapes along the edges of each other, source is the shape whose style a piece keeps,
// where shapes overlap the upper one wins like divide in illustrator
export async function divide(shapes: Shape[]): Promise<{ path: PathData; source: number }[]> {
  if (shapes.length === 0) return [];
  const scope = await loadPaper();
  let pieces: { item: PaperItem; source: number }[] = [{ item: toPaper(scope, shapes[0]), source: 0 }];
  for (let k = 1; k < shapes.length; k++) {
    const next = toPaper(scope, shapes[k]);
    let rest: PaperItem = next;
    const out: { item: PaperItem; source: number }[] = [];
    for (const piece of pieces) {
      const inside = piece.item.intersect(next, { insert: false });
      const outside = piece.item.subtract(next, { insert: false });
      if (!isEmpty(inside)) out.push({ item: inside, source: k });
      if (!isEmpty(outside)) out.push({ item: outside, source: piece.source });
      rest = rest.subtract(piece.item, { insert: false });
    }
    if (!isEmpty(rest)) out.push({ item: rest, source: k });
    pieces = out;
  }
  return pieces.flatMap((p) => fromPaper(p.item).map((path) => ({ path, source: p.source })));
}
