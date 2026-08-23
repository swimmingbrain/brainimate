import { describe, expect, it } from 'vitest';
import { migrateDoc } from './migrate';
import type { Doc } from './types';

describe('migrate', () => {
  it('gives an old document guides and its paths an empty list of subpaths', () => {
    const path = { id: 'p', type: 'path', path: { anchors: [], closed: false } };
    const group = { id: 'g', type: 'group', children: [{ ...path, id: 'q' }] };
    const old = {
      version: 1,
      layers: [{ keyframes: [{ frame: 0, items: [path, group] }] }],
      symbols: {},
      swatches: ['#ff0000']
    } as unknown as Doc;
    const doc = migrateDoc(old);
    expect(doc.guides).toEqual({ h: [], v: [] });
    expect(doc.swatches).toEqual(['#ff0000']);
    const items = doc.layers[0].keyframes[0].items;
    expect(items[0].type === 'path' && items[0].subpaths).toEqual([]);
    const child = items[1].type === 'group' ? items[1].children[0] : null;
    expect(child?.type === 'path' && child.subpaths).toEqual([]);
  });

  it('keeps the guides a document has and drops broken values', () => {
    const doc = migrateDoc({ layers: [], symbols: {}, guides: { h: [10, NaN], v: [5] } } as unknown as Doc);
    expect(doc.guides).toEqual({ h: [10], v: [5] });
  });

  it('gives text a width and instances a tint amount', () => {
    const text = { id: 't', type: 'text', text: 'hi' };
    const instance = { id: 'i', type: 'instance', symbol: 's', tint: null };
    const doc = migrateDoc({
      layers: [],
      symbols: { s: { id: 's', layers: [{ keyframes: [{ frame: 0, items: [text, instance] }] }] } }
    } as unknown as Doc);
    const items = doc.symbols.s.layers[0].keyframes[0].items;
    expect(items[0].type === 'text' && items[0].width).toBeNull();
    expect(items[1].type === 'instance' && items[1].tintAmount).toBe(0);
  });

  it('gives bones a reach and items an empty skin', () => {
    const bone = { id: 'b', name: 'Bone', parent: null, x: 0, y: 0, length: 100, rotation: 0 };
    const image = { id: 'i', type: 'image', asset: 'a', width: 1, height: 1 };
    const doc = migrateDoc({
      layers: [{ type: 'rig', keyframes: [{ frame: 0, items: [image] }], bones: [bone] }],
      symbols: {}
    } as unknown as Doc);
    expect(doc.layers[0].bones[0].radius).toBeCloseTo(35);
    expect(doc.layers[0].keyframes[0].items[0].skin).toBeNull();
  });
});
