import { describe, expect, it } from 'vitest';
import { buildGrid, cellSize, queryGrid } from './grid';
import { emptyBox, fromRect } from './bbox';

describe('spatial grid', () => {
  const boxes = [fromRect(0, 0, 10, 10), fromRect(5, 5, 10, 10), fromRect(100, 100, 20, 20), fromRect(-50, -50, 5, 5)];

  it('finds the boxes under a point, the last one first', () => {
    const grid = buildGrid(boxes, 8);
    expect(queryGrid(grid, 7, 7)).toEqual([1, 0]);
    expect(queryGrid(grid, 2, 2)).toEqual([0]);
    expect(queryGrid(grid, 110, 110)).toEqual([2]);
    expect(queryGrid(grid, -48, -48)).toEqual([3]);
    expect(queryGrid(grid, 60, 60)).toEqual([]);
  });

  it('grows the boxes by the radius', () => {
    const grid = buildGrid(boxes, 8);
    expect(queryGrid(grid, 12, 1)).toEqual([]);
    expect(queryGrid(grid, 12, 1, 3)).toEqual([0]);
    expect(queryGrid(grid, 97, 97, 4)).toEqual([2]);
  });

  it('agrees with a plain search on many random boxes', () => {
    let seed = 5;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const many = Array.from({ length: 600 }, () => fromRect(rnd() * 2000, rnd() * 1000, 5 + rnd() * 80, 5 + rnd() * 80));
    const grid = buildGrid(many);
    for (let k = 0; k < 200; k++) {
      const x = rnd() * 2100;
      const y = rnd() * 1100;
      const r = rnd() * 10;
      const plain = many
        .map((b, i) => (x >= b.minX - r && x <= b.maxX + r && y >= b.minY - r && y <= b.maxY + r ? i : -1))
        .filter((i) => i >= 0)
        .reverse();
      expect(queryGrid(grid, x, y, r)).toEqual(plain);
    }
  });

  it('keeps huge boxes in a list every query sees and skips empty ones', () => {
    const grid = buildGrid([fromRect(0, 0, 1e6, 1e6), emptyBox(), fromRect(3, 3, 2, 2)], 4);
    expect(grid.big).toEqual([0]);
    expect(queryGrid(grid, 4, 4)).toEqual([2, 0]);
    expect(queryGrid(grid, 5000, 5000)).toEqual([0]);
  });

  it('picks a cell about the size of the boxes', () => {
    expect(cellSize([fromRect(0, 0, 20, 20), fromRect(50, 50, 20, 20)])).toBeCloseTo(30);
    expect(cellSize([])).toBe(64);
  });
});
