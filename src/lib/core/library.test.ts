import { describe, expect, it } from 'vitest';
import type { Doc, Item, Layer, Symbol } from './types';
import { makeInstance, makePathItem } from './items';
import { rectPath } from './shapes';
import { defaultStyle } from './style';
import { copySymbol, makesLoop, nextSymbolName, symbolUses } from './library';

function layer(keys: Item[][]): Layer {
  return {
    id: 'l' + Math.random(),
    name: 'Layer 1',
    type: 'normal',
    visible: true,
    locked: false,
    outline: false,
    color: '#5b7fc9',
    parent: null,
    keyframes: keys.map((items, i) => ({ frame: i * 5, items, pose: {}, tween: null, label: '' })),
    length: keys.length * 5,
    bones: []
  };
}

function symbol(id: string, name: string, items: Item[][]): Symbol {
  return { id, name, kind: 'graphic', layers: [layer(items)] };
}

describe('library', () => {
  it('names a new symbol after the highest number in use', () => {
    expect(nextSymbolName({})).toBe('Symbol 1');
    const symbols = {
      a: symbol('a', 'Symbol 1', [[]]),
      b: symbol('b', 'Symbol 4', [[]]),
      c: symbol('c', 'Head', [[]])
    };
    expect(nextSymbolName(symbols)).toBe('Symbol 5');
  });

  it('counts an instance held over keyframes once, nested ones too', () => {
    const one = makeInstance('a', 'a');
    const two = makeInstance('a', 'a');
    const doc = {
      layers: [layer([[one], [{ ...one }, two]])],
      symbols: { a: symbol('a', 'A', [[]]), b: symbol('b', 'B', [[makeInstance('a', 'a')]]) }
    } as unknown as Doc;
    expect(symbolUses(doc, 'a')).toBe(3);
    expect(symbolUses(doc, 'b')).toBe(0);
  });

  it('finds an instance that would end up inside itself', () => {
    const symbols = {
      a: symbol('a', 'A', [[]]),
      b: symbol('b', 'B', [[makeInstance('a', 'a')]]),
      c: symbol('c', 'C', [[makeInstance('b', 'b')]])
    };
    expect(makesLoop(symbols, 'a', 'a')).toBe(true);
    expect(makesLoop(symbols, 'c', 'a')).toBe(true);
    expect(makesLoop(symbols, 'a', 'c')).toBe(false);
  });

  it('copies a symbol with new ids that still match across keyframes', () => {
    const rect = makePathItem('Rectangle', rectPath(0, 0, 10, 10), defaultStyle());
    const source = symbol('a', 'A', [[rect], [{ ...rect }]]);
    const copy = copySymbol(source, 'A copy');
    expect(copy.id).not.toBe('a');
    expect(copy.name).toBe('A copy');
    const [k0, k1] = copy.layers[0].keyframes;
    expect(k0.items[0].id).not.toBe(rect.id);
    expect(k0.items[0].id).toBe(k1.items[0].id);
    expect(source.layers[0].keyframes[0].items[0].id).toBe(rect.id);
  });
});
