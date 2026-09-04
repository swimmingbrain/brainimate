import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Doc } from '$lib/core/types';
import { makeDoc } from '$lib/editor/editor';
import { makeImageItem, makePathItem, makeTextItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { makeAsset } from '$lib/core/assets';
import { translate } from '$lib/core/mat';
import { bytesDataUrl, dataUrlBytes, packDoc, parse, parseBytes, projectFileName, serialize } from './project';

// a 1 by 1 png
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FONT = 'data:font/ttf;base64,AAEAAAALAIAAAwAwT1MvMg==';

function sample(): Doc {
  const doc = makeDoc(640, 360, 12);
  doc.name = 'Bounce';
  doc.bg = '#202020';
  const image = makeAsset('image', 'ball.png', PNG);
  const font = makeAsset('font', 'Doodle', FONT);
  const unused = makeAsset('image', 'old.png', PNG + 'AA');
  doc.assets = { [image.id]: image, [font.id]: font, [unused.id]: unused };
  const text = makeTextItem('Hello\nworld', 'Doodle', 32, defaultStyle(), translate(10, 20));
  const pic = makeImageItem(image.id, 'ball.png', 50, 40, translate(100, 100));
  const rect = makePathItem('Rectangle', rectPath(0, 0, 30, 30), defaultStyle());
  doc.layers[0].keyframes[0].items.push(rect, pic, text);
  return doc;
}

describe('project files', () => {
  it('turns data urls into bytes and back', () => {
    const { mime, bytes } = dataUrlBytes(PNG);
    expect(mime).toBe('image/png');
    expect(bytes[1]).toBe(0x50);
    expect(bytesDataUrl(bytes, mime)).toBe(PNG);
    expect(strFromU8(dataUrlBytes('data:image/svg+xml,%3Csvg%2F%3E').bytes)).toBe('<svg/>');
  });

  it('stores document.json and each used asset as its own file', () => {
    const doc = sample();
    const files = unzipSync(packDoc(doc));
    const names = Object.keys(files).sort();
    const image = Object.values(doc.assets).find((a) => a.name === 'ball.png')!;
    const font = Object.values(doc.assets).find((a) => a.type === 'font')!;
    expect(names).toEqual(['assets/' + font.id + '.ttf', 'assets/' + image.id + '.png', 'document.json'].sort());
    const json = JSON.parse(strFromU8(files['document.json']));
    expect(json.assets[image.id].data).toBe(`assets/${image.id}.png`);
    expect(Object.keys(json.assets)).toHaveLength(2);
  });

  it('reads back what it wrote, an image asset and a text item included', async () => {
    const doc = sample();
    const parsed = await parse(serialize(doc));
    expect(parsed.newer).toBe(false);
    const back = parsed.doc;
    expect(back.name).toBe('Bounce');
    expect(back.width).toBe(640);
    expect(back.fps).toBe(12);
    expect(back.bg).toBe('#202020');
    expect(back.layers[0].keyframes[0].items).toEqual(doc.layers[0].keyframes[0].items);
    const kept = Object.values(doc.assets).filter((a) => a.name !== 'old.png');
    expect(Object.values(back.assets).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      kept.sort((a, b) => a.id.localeCompare(b.id))
    );
  });

  it('loads a plain json with data urls and keeps fields it does not know', () => {
    const doc = sample() as Doc & { extra: string };
    doc.extra = 'kept';
    const json = new TextEncoder().encode(JSON.stringify(doc));
    const back = parseBytes(json).doc as Doc & { extra: string };
    expect(back.extra).toBe('kept');
    expect(back.layers[0].keyframes[0].items).toHaveLength(3);
    expect(Object.keys(back.assets)).toHaveLength(3);
  });

  it('fills in what an older document lacks', () => {
    const old = { version: 1, name: 'Old', width: 100, height: 80, layers: [] } as unknown as Doc;
    const back = parseBytes(new TextEncoder().encode(JSON.stringify(old))).doc;
    expect(back.fps).toBe(24);
    expect(back.symbols).toEqual({});
    expect(back.guides).toEqual({ h: [], v: [] });
    expect(back.swatches).toEqual([]);
  });

  it('says when a newer version made the file', () => {
    const doc = { ...sample(), version: 3 };
    const parsed = parseBytes(new TextEncoder().encode(JSON.stringify(doc)));
    expect(parsed.newer).toBe(true);
    expect(parsed.doc.version).toBe(1);
  });

  it('refuses what is not a document', () => {
    expect(() => parseBytes(new TextEncoder().encode('{"hello":1}'))).toThrow(/not a brainIMATE/);
    expect(() => parseBytes(new TextEncoder().encode('nope'))).toThrow(/not a brainIMATE/);
  });

  it('makes file names the file system takes', () => {
    expect(projectFileName('My: walk/cycle')).toBe('My walk cycle.brainimate');
    expect(projectFileName('   ')).toBe('Untitled.brainimate');
    expect(projectFileName('a', '.png')).toBe('a.png');
  });
});
