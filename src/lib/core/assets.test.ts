import { describe, expect, it } from 'vitest';
import type { Doc, ImageItem } from './types';
import { makeTextItem } from './items';
import { defaultStyle } from './style';
import { assetId, hashString, makeAsset, pruneAssets, usedAssets } from './assets';

function image(asset: string): ImageItem {
  return {
    id: 'i' + asset,
    name: 'Image',
    type: 'image',
    transform: [1, 0, 0, 1, 0, 0],
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    asset,
    width: 10,
    height: 10,
    skin: null
  };
}

function doc(items: Doc['layers'][0]['keyframes'][0]['items'], assets: Doc['assets']): Doc {
  return {
    layers: [{ id: 'l', keyframes: [{ frame: 0, items, pose: {}, tween: null, label: '' }] }],
    symbols: {},
    assets
  } as unknown as Doc;
}

describe('assets', () => {
  it('hashes the same data to the same id and other data to another', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(hashString(png)).toBe(hashString(png));
    expect(hashString(png)).not.toBe(hashString(png + 'A'));
    expect(hashString('')).toMatch(/^[0-9a-z]+$/);
    expect(assetId(png)).toBe(makeAsset('image', 'a.png', png).id);
    expect(assetId(png).startsWith('a')).toBe(true);
  });

  it('finds the images and fonts in use, symbols included', () => {
    const one = makeAsset('image', 'one.png', 'data:one');
    const two = makeAsset('image', 'two.png', 'data:two');
    const font = makeAsset('font', 'Fancy', 'data:font');
    const unusedFont = makeAsset('font', 'Plain', 'data:plain');
    const d = doc([image(one.id), makeTextItem('Hi', 'Fancy', 20, defaultStyle())], {
      [one.id]: one,
      [two.id]: two,
      [font.id]: font,
      [unusedFont.id]: unusedFont
    });
    d.symbols.s = { id: 's', name: 'S', kind: 'graphic', layers: doc([image(two.id)], {}).layers };
    expect(usedAssets(d)).toEqual(new Set([one.id, two.id, font.id]));
    const pruned = pruneAssets(d);
    expect(Object.keys(pruned.assets).sort()).toEqual([one.id, two.id, font.id].sort());
    expect(Object.keys(d.assets)).toHaveLength(4);
  });
});
