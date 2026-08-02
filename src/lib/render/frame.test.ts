import { afterEach, describe, expect, it } from 'vitest';
import type { InstanceItem, Item, Keyframe, Layer, Symbol } from '$lib/core/types';
import { makeInstance } from '$lib/core/items';
import { instanceFrame, instanceSlices, instanceSymbolFrame, layerSlices, setLibrary } from './frame';

function layer(keys: [number, Item[]][], length: number): Layer {
  const keyframes: Keyframe[] = keys.map(([frame, items]) => ({ frame, items, pose: {}, tween: null, label: '' }));
  return {
    id: String(Math.random()),
    name: 'l',
    type: 'normal',
    visible: true,
    locked: false,
    outline: false,
    color: '#5b7fc9',
    parent: null,
    keyframes,
    length,
    bones: []
  };
}

function symbol(id: string, layers: Layer[]): Symbol {
  return { id, name: id, kind: 'graphic', layers };
}

function instance(symbolId: string, mode: InstanceItem['mode'], first = 0): InstanceItem {
  return { ...makeInstance(symbolId, symbolId), mode, first };
}

describe('instance frames', () => {
  afterEach(() => setLibrary({}));

  it('loops from the first frame and wraps at the symbol length', () => {
    const it = instance('a', 'loop', 2);
    expect([0, 1, 2, 3, 4, 5].map((o) => instanceFrame(it, o, 4))).toEqual([2, 3, 0, 1, 2, 3]);
  });

  it('plays once and holds the last frame', () => {
    const it = instance('a', 'once', 1);
    expect([0, 1, 2, 3, 9].map((o) => instanceFrame(it, o, 4))).toEqual([1, 2, 3, 3, 3]);
  });

  it('shows the first frame only in single mode, kept inside the symbol', () => {
    expect([0, 3, 7].map((o) => instanceFrame(instance('a', 'single', 2), o, 4))).toEqual([2, 2, 2]);
    expect(instanceFrame(instance('a', 'single', 9), 0, 4)).toBe(3);
  });

  it('reads the frame of the symbol the instance names', () => {
    setLibrary({ a: symbol('a', [layer([[0, []]], 5)]) });
    expect(instanceSymbolFrame(instance('a', 'loop'), 7)).toBe(2);
    expect(instanceSymbolFrame(instance('gone', 'loop'), 7)).toBeNull();
  });

  it('maps a nested instance against the keyframes of its own symbol', () => {
    // a runs 4 frames, b holds an instance of a that starts again at b's keyframe on frame 3
    const inner = instance('a', 'loop');
    const a = symbol('a', [layer([[0, []]], 4)]);
    const b = symbol('b', [layer([[0, [inner]], [3, [{ ...inner }]]], 6)]);
    setLibrary({ a, b });
    const outer = instance('b', 'loop');
    const frames = [0, 1, 2, 3, 4, 5, 6].map((f) => {
      const slice = instanceSlices(outer, f)[0];
      const nested = slice.items[0] as InstanceItem;
      return [instanceSymbolFrame(outer, f), instanceSymbolFrame(nested, slice.offset)];
    });
    expect(frames).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
      [4, 1],
      [5, 2],
      [0, 0]
    ]);
  });

  it('leaves out hidden layers and layers with nothing on the frame', () => {
    const shown = layer([[0, [instance('x', 'loop')]]], 3);
    const hidden = { ...layer([[0, [instance('y', 'loop')]]], 3), visible: false };
    const short = layer([[0, [instance('z', 'loop')]]], 1);
    const list = layerSlices([shown, hidden, short], 2);
    expect(list.map((s) => s.layer)).toEqual([shown]);
    expect(list[0].offset).toBe(2);
  });
});
