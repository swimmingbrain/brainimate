import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { spriteJson, spriteLayout, spriteZip } from './spritesheet';
import { frameFileName } from './sequence';

describe('sprite sheets', () => {
  it('lays frames out in rows with padding around each', () => {
    const l = spriteLayout(5, 10, 20, 3, 2);
    expect(l.columns).toBe(3);
    expect(l.rows).toBe(2);
    expect(l.width).toBe(3 * 12 + 2);
    expect(l.height).toBe(2 * 22 + 2);
    expect(l.cells).toEqual([
      { x: 2, y: 2 },
      { x: 14, y: 2 },
      { x: 26, y: 2 },
      { x: 2, y: 24 },
      { x: 14, y: 24 }
    ]);
  });

  it('picks about a square sheet without a column count and never more columns than frames', () => {
    expect(spriteLayout(10, 8, 8, 0, 0).columns).toBe(4);
    expect(spriteLayout(2, 8, 8, 6, 0).columns).toBe(2);
    expect(spriteLayout(1, 8, 8, 0, 0)).toMatchObject({ columns: 1, rows: 1, width: 8, height: 8 });
  });

  it('writes a json hash with a frame per name and the sheet size, scale and rate', () => {
    const l = spriteLayout(5, 10, 20, 0, 1);
    const json = spriteJson('walk', l, 10, 20, 0.5, 12);
    expect(Object.keys(json.frames)).toEqual(['walk_0001', 'walk_0002', 'walk_0003', 'walk_0004', 'walk_0005']);
    expect(json.frames.walk_0004.frame).toEqual({ x: 1, y: 22, w: 10, h: 20 });
    expect(json.frames.walk_0001.duration).toBe(83);
    expect(json.meta).toMatchObject({ image: 'walk.png', size: { w: l.width, h: l.height }, scale: 0.5, fps: 12 });
  });

  it('names sequence frames from 1 with four digits', () => {
    expect(frameFileName('walk', 1)).toBe('walk_0001.png');
    expect(frameFileName('walk', 12, '')).toBe('walk_0012');
  });

  it('packs the sheet and its json into one zip', async () => {
    const zip = await spriteZip('walk', { png: new Blob([new Uint8Array([1, 2, 3])]), json: '{"a":1}' });
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['walk.json', 'walk.png']);
    expect(strFromU8(files['walk.json'])).toBe('{"a":1}');
  });
});
