import { get, writable } from 'svelte/store';
import type { Font, Glyph } from 'opentype.js';
import type { Asset, TextItem } from './types';
import { cachedLayout, type FontLike, type TextLayout } from './text';

export type FontSource = 'bundled' | 'user' | 'system';

// a system font as queryLocalFonts hands it out
export interface LocalFont {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

export interface FaceInfo {
  weight: number;
  italic: boolean;
  // where the file comes from: static/fonts, a font asset of the document or the system
  url?: string;
  asset?: string;
  local?: LocalFont;
}

export interface FamilyInfo {
  name: string;
  source: FontSource;
  faces: FaceInfo[];
}

export const DEFAULT_FONT = 'Inter';

// family, file name in static/fonts and the faces each one has
const BUNDLED: [string, string, string[]][] = [
  ['Inter', 'inter', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['Instrument Serif', 'instrument-serif', ['400-normal', '400-italic']],
  ['JetBrains Mono', 'jetbrains-mono', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['Lora', 'lora', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['Poppins', 'poppins', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['Bebas Neue', 'bebas-neue', ['400-normal']]
];

function bundled(): FamilyInfo[] {
  return BUNDLED.map(([name, file, faces]) => ({
    name,
    source: 'bundled',
    faces: faces.map((f) => {
      const [weight, style] = f.split('-');
      return { weight: Number(weight), italic: style === 'italic', url: `/fonts/${file}-${f}.woff` };
    })
  }));
}

// every family the font field lists, bundled first, then the document's own, then the system's
export const fontFamilies = writable<FamilyInfo[]>(bundled());
// bumped whenever a face finished loading, text is laid out again then
export const fontVersion = writable(0);

const loaded = new Map<string, FontLike>();
const pending = new Map<string, Promise<FontLike | null>>();
const failed = new Set<string>();
let onLoad: (() => void) | null = null;

// the stage redraws when a font arrives
export function setFontLoaded(fn: (() => void) | null) {
  onLoad = fn;
}

function faceKey(family: string, face: FaceInfo): string {
  return `${family}|${face.weight}|${face.italic ? 1 : 0}`;
}

export function familyOf(name: string): FamilyInfo | null {
  return get(fontFamilies).find((f) => f.name === name) ?? null;
}

// the same slant if there is one, then the closest weight
export function pickFace(family: FamilyInfo, weight: number, italic: boolean): FaceInfo {
  const slanted = family.faces.filter((f) => f.italic === italic);
  const pool = slanted.length > 0 ? slanted : family.faces;
  let best = pool[0];
  for (const f of pool) if (Math.abs(f.weight - weight) < Math.abs(best.weight - weight)) best = f;
  return best;
}

// the css family the inline editor uses, the same file as the canvas draws with
export function cssFamily(name: string): string {
  return `"bi ${name}", "${name}", sans-serif`;
}

// glyphs and kerning pairs are looked up once per font
function wrap(font: Font): FontLike {
  const glyphs = new Map<string, Glyph>();
  const pairs = new Map<string, number>();
  const glyph = (ch: string): Glyph => {
    let g = glyphs.get(ch);
    if (!g) {
      g = font.charToGlyph(ch);
      glyphs.set(ch, g);
    }
    return g;
  };
  return {
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    advance: (ch) => glyph(ch).advanceWidth ?? 0,
    kerning: (a, b) => {
      const key = a + b;
      let k = pairs.get(key);
      if (k === undefined) {
        // indexes, opentype mistakes glyph 0 for a missing index otherwise
        k = font.getKerningValue(glyph(a).index, glyph(b).index) || 0;
        pairs.set(key, k);
      }
      return k;
    },
    outline: (ch, x, y, size) => glyph(ch).getPath(x, y, size).commands
  };
}

// opentype.js only loads with the first text
let parser: Promise<typeof import('opentype.js')> | null = null;

async function parse(buffer: ArrayBuffer): Promise<Font> {
  parser ??= import('opentype.js');
  const opentype = await parser;
  return opentype.parse(buffer);
}

async function faceBuffer(face: FaceInfo, assets: Record<string, Asset>): Promise<ArrayBuffer> {
  if (face.local) return (await face.local.blob()).arrayBuffer();
  const url = face.url ?? assets[face.asset ?? '']?.data;
  if (!url) throw new Error('no font file');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${res.status}`);
  return res.arrayBuffer();
}

// the inline editor types with the same file through the FontFace api
async function registerFace(family: string, face: FaceInfo, buffer: ArrayBuffer) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  const style = face.italic ? 'italic' : 'normal';
  const ff = new FontFace(`bi ${family}`, buffer, { weight: String(face.weight), style });
  await ff.load();
  document.fonts.add(ff);
}

let assetSource: Record<string, Asset> = {};

async function loadFace(family: FamilyInfo, face: FaceInfo): Promise<FontLike | null> {
  const key = faceKey(family.name, face);
  const done = loaded.get(key);
  if (done) return done;
  if (typeof window === 'undefined' || failed.has(key)) return null;
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      try {
        const buffer = await faceBuffer(face, assetSource);
        const font = wrap(await parse(buffer));
        loaded.set(key, font);
        await registerFace(family.name, face, buffer).catch(() => {});
        fontVersion.update((n) => n + 1);
        onLoad?.();
        return font;
      } catch {
        failed.add(key);
        return null;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, p);
  }
  return p;
}

// the font to lay text out with, null while it is still loading, which it starts
export function fontFor(name: string, weight: number, italic: boolean): FontLike | null {
  const family = familyOf(name);
  if (!family || family.faces.length === 0) return null;
  const face = pickFace(family, weight, italic);
  const font = loaded.get(faceKey(family.name, face));
  if (font) return font;
  void loadFace(family, face);
  return null;
}

export async function loadFont(name: string, weight = 400, italic = false): Promise<FontLike | null> {
  const family = familyOf(name);
  if (!family || family.faces.length === 0) return null;
  return loadFace(family, pickFace(family, weight, italic));
}

// the layout a text item draws with, null until its font is there
export function itemLayout(item: TextItem): TextLayout | null {
  const font = fontFor(item.font, item.weight, item.italic);
  return font ? cachedLayout(item.text, font, item) : null;
}

// regular, bold and the rest from the words of a style name
export function weightOf(style: string): number {
  const s = style.toLowerCase().replace(/[\s_-]/g, '');
  const words: [string, number][] = [
    ['thin', 100],
    ['hairline', 100],
    ['extralight', 200],
    ['ultralight', 200],
    ['semibold', 600],
    ['demibold', 600],
    ['extrabold', 800],
    ['ultrabold', 800],
    ['black', 900],
    ['heavy', 900],
    ['medium', 500],
    ['light', 300],
    ['bold', 700]
  ];
  for (const [word, weight] of words) if (s.includes(word)) return weight;
  return 400;
}

const ORDER: FontSource[] = ['bundled', 'user', 'system'];

// the families of one source are replaced, a name another source has already stays with that one
// bundled first, then the document's own, then the system's
function setFamilies(source: FontSource, list: FamilyInfo[]) {
  fontFamilies.update((all) => {
    const others = all.filter((f) => f.source !== source);
    const taken = new Set(others.map((f) => f.name));
    const own = list.filter((f) => !taken.has(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    return [...others, ...own].sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source));
  });
}

// what a font file says about itself
export interface FontFileInfo {
  family: string;
  weight: number;
  italic: boolean;
}

function describe(font: Font, fallback: string): FontFileInfo {
  const family = font.getEnglishName('preferredFamily') ?? font.getEnglishName('fontFamily') ?? fallback;
  const style = font.getEnglishName('preferredSubfamily') ?? font.getEnglishName('fontSubfamily') ?? '';
  const os2 = font.tables.os2;
  const weight = os2?.usWeightClass ?? weightOf(style);
  const italic = ((os2?.fsSelection ?? 0) & 1) === 1 || /italic|oblique/i.test(style);
  return { family, weight, italic };
}

// reads a font file, null when it is not one opentype understands
export async function readFontFile(buffer: ArrayBuffer, fallback: string): Promise<FontFileInfo | null> {
  try {
    return describe(await parse(buffer), fallback);
  } catch {
    return null;
  }
}

const userAssets = new Set<string>();

// the document's own fonts, from its font assets, join the list once
export async function registerAssetFonts(assets: Record<string, Asset>) {
  assetSource = assets;
  const fresh = Object.values(assets).filter((a) => a.type === 'font' && !userAssets.has(a.id));
  if (fresh.length === 0 || typeof window === 'undefined') return;
  const families = new Map<string, FamilyInfo>(
    get(fontFamilies)
      .filter((f) => f.source === 'user')
      .map((f) => [f.name, { ...f, faces: [...f.faces] }])
  );
  for (const asset of fresh) {
    userAssets.add(asset.id);
    try {
      const buffer = await (await fetch(asset.data)).arrayBuffer();
      const font = await parse(buffer);
      const info = describe(font, asset.name);
      const face: FaceInfo = { weight: info.weight, italic: info.italic, asset: asset.id };
      const family = families.get(info.family) ?? { name: info.family, source: 'user', faces: [] };
      if (!family.faces.some((f) => f.weight === face.weight && f.italic === face.italic)) family.faces.push(face);
      families.set(info.family, family);
      loaded.set(faceKey(info.family, face), wrap(font));
      await registerFace(info.family, face, buffer).catch(() => {});
    } catch {
      // a broken file stays out of the list
    }
  }
  setFamilies('user', [...families.values()]);
  fontVersion.update((n) => n + 1);
  onLoad?.();
}

export function canLoadSystemFonts(): boolean {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window;
}

// the fonts installed on this machine, chromium asks for permission first. the count of families
export async function loadSystemFonts(): Promise<number> {
  if (!canLoadSystemFonts()) throw new Error('This browser does not share its fonts');
  const query = (window as unknown as { queryLocalFonts: () => Promise<LocalFont[]> }).queryLocalFonts;
  const list = await query();
  const families = new Map<string, FamilyInfo>();
  for (const data of list) {
    const family = families.get(data.family) ?? { name: data.family, source: 'system', faces: [] };
    const face: FaceInfo = { weight: weightOf(data.style), italic: /italic|oblique/i.test(data.style), local: data };
    if (!family.faces.some((f) => f.weight === face.weight && f.italic === face.italic)) family.faces.push(face);
    families.set(data.family, family);
  }
  setFamilies('system', [...families.values()]);
  return families.size;
}
