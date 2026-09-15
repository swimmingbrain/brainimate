import type { Box } from './bbox';

// a uniform grid over item boxes, a point only asks the cells around it. boxes that would cover too
// many cells are kept in a short list that every query looks at
const MAX_CELLS = 64;
const OFFSET = 32768;

function key(cx: number, cy: number): number {
  return (cx + OFFSET) * 65536 + (cy + OFFSET);
}

export interface SpatialGrid {
  boxes: Box[];
  cell: number;
  cells: Map<number, number[]>;
  big: number[];
}

// a cell is about as big as the average box, so a box sits in a few cells and a cell holds a few boxes
export function cellSize(boxes: Box[]): number {
  let area = 0;
  let n = 0;
  for (const b of boxes) {
    if (b.minX > b.maxX || b.minY > b.maxY) continue;
    area += Math.max(1, b.maxX - b.minX) * Math.max(1, b.maxY - b.minY);
    n++;
  }
  if (n === 0) return 64;
  return Math.max(8, Math.min(4096, Math.sqrt(area / n) * 1.5));
}

export function buildGrid(boxes: Box[], cell = cellSize(boxes)): SpatialGrid {
  const cells = new Map<number, number[]>();
  const big: number[] = [];
  boxes.forEach((b, i) => {
    if (b.minX > b.maxX || b.minY > b.maxY) return;
    const x0 = Math.floor(b.minX / cell);
    const y0 = Math.floor(b.minY / cell);
    const x1 = Math.floor(b.maxX / cell);
    const y1 = Math.floor(b.maxY / cell);
    const outside = Math.abs(x0) >= OFFSET || Math.abs(y0) >= OFFSET || Math.abs(x1) >= OFFSET || Math.abs(y1) >= OFFSET;
    if (outside || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
      big.push(i);
      return;
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
    }
  });
  return { boxes, cell, cells, big };
}

// the boxes that come within r of the point, the last one first like a hit test wants them
export function queryGrid(grid: SpatialGrid, x: number, y: number, r = 0): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const take = (i: number) => {
    if (seen.has(i)) return;
    seen.add(i);
    const b = grid.boxes[i];
    if (x >= b.minX - r && x <= b.maxX + r && y >= b.minY - r && y <= b.maxY + r) out.push(i);
  };
  const c = grid.cell;
  const x0 = Math.floor((x - r) / c);
  const x1 = Math.floor((x + r) / c);
  const y0 = Math.floor((y - r) / c);
  const y1 = Math.floor((y + r) / c);
  // a huge radius would walk empty cells, every box is as quick then
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
    for (let i = 0; i < grid.boxes.length; i++) take(i);
  } else {
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = grid.cells.get(key(cx, cy));
        if (list) for (const i of list) take(i);
      }
    }
    for (const i of grid.big) take(i);
  }
  return out.sort((a, b) => b - a);
}
