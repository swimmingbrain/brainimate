import type { Anchor, PathData } from './types';
import { kindOf, orientHoles, type Compound } from './path';

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

// every island of the result becomes one compound, its outline the path and its holes the subpaths,
// an island inside a hole is an island of its own
function fromPaper(item: PaperItem): Compound[] {
  const list = children(item).filter((c) => c.segments.length > 1 && Math.abs(c.area) > MIN_AREA);
  // a point on the outline itself, the middle of a ring can sit inside one of its holes
  const points = list.map((c) => c.curves[0].getPointAtTime(0.5));
  const depth = list.map((_, i) => list.filter((o, k) => k !== i && o.contains(points[i])).length);
  const out = new Map<number, Compound>();
  list.forEach((c, i) => {
    if (depth[i] % 2 === 0) out.set(i, { path: fromPaperPath(c), subpaths: [] });
  });
  list.forEach((c, i) => {
    if (depth[i] % 2 === 0) return;
    // the island right around the hole is the container one level up
    const parent = list.findIndex((o, k) => k !== i && depth[k] === depth[i] - 1 && o.contains(points[i]));
    out.get(parent)?.subpaths.push(fromPaperPath(c));
  });
  return [...out.values()].map(orientHoles);
}

function apply(op: BooleanOp, a: PaperItem, b: PaperItem): PaperItem {
  const options = { insert: false };
  if (op === 'unite') return a.unite(b, options);
  if (op === 'subtract') return a.subtract(b, options);
  if (op === 'intersect') return a.intersect(b, options);
  return a.exclude(b, options);
}

// bottom shape first, each next one is united, subtracted, intersected or excluded in turn
export async function combine(op: BooleanOp, shapes: Shape[]): Promise<Compound[]> {
  if (shapes.length === 0) return [];
  const scope = await loadPaper();
  let acc = toPaper(scope, shapes[0]);
  for (let i = 1; i < shapes.length; i++) acc = apply(op, acc, toPaper(scope, shapes[i]));
  return fromPaper(acc);
}

export function unite(a: Shape, b: Shape): Promise<Compound[]> {
  return combine('unite', [a, b]);
}

export function subtract(a: Shape, b: Shape): Promise<Compound[]> {
  return combine('subtract', [a, b]);
}

export function intersect(a: Shape, b: Shape): Promise<Compound[]> {
  return combine('intersect', [a, b]);
}

export function exclude(a: Shape, b: Shape): Promise<Compound[]> {
  return combine('exclude', [a, b]);
}

function isEmpty(item: PaperItem): boolean {
  // paths and compound paths both have an area, the shared type does not say so
  return item.isEmpty() || Math.abs((item as paper.Path).area) < MIN_AREA;
}

// cuts the shapes along the edges of each other, source is the shape whose style a piece keeps,
// where shapes overlap the upper one wins like divide in illustrator
export async function divide(shapes: Shape[]): Promise<{ shape: Compound; source: number }[]> {
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
  return pieces.flatMap((p) => fromPaper(p.item).map((shape) => ({ shape, source: p.source })));
}
