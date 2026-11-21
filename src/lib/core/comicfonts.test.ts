import { describe, expect, it } from 'vitest';
import { parse } from 'opentype.js';
import { familyOf } from './fonts';

// speech bubbles are lettered in german, every comic face needs these
const GERMAN = 'ÄÖÜäöüß„“‚‘–…!?';

// the bundled files as data urls, the way vite inlines them
const FILES = import.meta.glob('/static/fonts/*.woff', { query: '?inline', import: 'default', eager: true }) as Record<
  string,
  string
>;

function load(url: string) {
  const data = FILES[`/static${url}`];
  if (!data) throw new Error(`${url} is not in static/fonts`);
  const text = atob(data.slice(data.indexOf(',') + 1));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return parse(bytes.buffer);
}

describe('comic fonts', () => {
  for (const name of ['Comic Neue', 'Bangers', 'Patrick Hand']) {
    it(`${name} is bundled and covers the german letters`, () => {
      const family = familyOf(name);
      expect(family?.source).toBe('bundled');
      for (const face of family!.faces) {
        const font = load(face.url!);
        for (const ch of GERMAN) expect(font.charToGlyph(ch).index, `${name} ${face.weight} ${ch}`).toBeGreaterThan(0);
      }
    });
  }
});
