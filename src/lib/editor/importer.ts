import type { Item, TextItem, Vec } from '$lib/core/types';
import { applyPoint, invert, multiply, scale, translate } from '$lib/core/mat';
import { cloneItem, itemBounds, makeImageItem } from '$lib/core/items';
import { boxCenter, boxHeight, boxWidth, isEmpty } from '$lib/core/bbox';
import { readSvgText, type SvgImport } from '$lib/io/svgin';
import { makeAsset } from '$lib/core/assets';
import { loadFont, readFontFile, registerAssetFonts } from '$lib/core/fonts';
import { walkItems } from '$lib/core/library';
import { activeLayer, addToast, selection } from '$lib/stores/app';
import { isProjectFile, openDropped } from '$lib/io/files';
import { editor } from './editor';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;
const FONT_FILE = /\.(ttf|otf|woff)$/i;
const SVG_FILE = /\.svg$/i;

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif';
export const FONT_ACCEPT = '.ttf,.otf,.woff';
export const SVG_ACCEPT = '.svg,image/svg+xml';
export const IMPORT_ACCEPT = `${IMAGE_ACCEPT},${FONT_ACCEPT},.svg`;

// the hidden file input the app keeps, the menus and the image properties open it
let input: HTMLInputElement | null = null;
let waiting: ((files: File[]) => void) | null = null;

export function setImportInput(el: HTMLInputElement | null) {
  input = el;
}

// the input calls this with what was picked, or nothing when the picker was closed. files nobody
// waits for are imported
export function filesPicked(files: File[]) {
  const done = waiting;
  waiting = null;
  if (done) done(files);
  else if (files.length > 0) void importFiles(files);
}

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  if (!input) return Promise.resolve([]);
  filesPicked([]);
  input.accept = accept;
  input.multiple = multiple;
  input.value = '';
  const picked = new Promise<File[]>((resolve) => (waiting = resolve));
  input.click();
  return picked;
}

export function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decode(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

// a gif keeps its first frame only, as a png
function firstFrame(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// the middle of the stage, in the space of the timeline being edited
export function stageCenter(): Vec {
  const d = editor.doc;
  return applyPoint(invert(editor.base()), { x: d.width / 2, y: d.height / 2 });
}

export interface Picture {
  data: string;
  width: number;
  height: number;
}

// a picture file as a data url and its size
export async function readPicture(file: Blob): Promise<Picture> {
  let data = await readDataUrl(file);
  const img = await decode(data);
  if (file.type === 'image/gif') data = firstFrame(img);
  return { data, width: img.naturalWidth, height: img.naturalHeight };
}

// an image item centered on at, scaled down to fit the stage when it is larger, with its asset in the
// same undo step. a picture already in the document is used again
export function placePicture(pic: Picture, name: string, at: Vec = stageCenter()): string | null {
  const layer = editor.drawTarget();
  if (!layer || !editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return null;
  }
  const asset = makeAsset('image', name, pic.data);
  const d = editor.doc;
  const k = Math.min(1, d.width / pic.width, d.height / pic.height);
  const w = pic.width * k;
  const h = pic.height * k;
  const item = makeImageItem(asset.id, name, w, h, translate(at.x - w / 2, at.y - h / 2));
  editor.commit('Import image', (draft) => {
    if (!draft.assets[asset.id]) draft.assets[asset.id] = asset;
    editor.draftItems(draft, layer.id)?.push(cloneItem(item));
  });
  activeLayer.set(layer.id);
  selection.set(new Set([item.id]));
  return item.id;
}

export async function importImage(file: Blob, name: string, at?: Vec): Promise<string | null> {
  try {
    return placePicture(await readPicture(file), name, at);
  } catch {
    addToast(`${name} could not be read as a picture`, 'error');
    return null;
  }
}

// a font file becomes a font asset of the document and shows up in the font list
export async function importFont(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const info = await readFontFile(buffer, file.name.replace(/\.\w+$/, ''));
  if (!info) {
    addToast(`${file.name} is not a font this app can read`, 'error');
    return null;
  }
  const asset = makeAsset('font', info.family, await readDataUrl(file));
  if (!editor.doc.assets[asset.id]) {
    editor.commit('Import font', (draft) => {
      draft.assets[asset.id] = asset;
    });
  }
  await registerAssetFonts(editor.doc.assets);
  addToast(`${info.family} is in the font list`, 'success');
  return info.family;
}

// scaled down to fit the stage when it is larger, its middle on at
export function placeOnStage(item: Item, at: Vec) {
  const b = itemBounds(item, item.transform);
  if (isEmpty(b)) return;
  const d = editor.doc;
  const k = Math.min(1, d.width / Math.max(boxWidth(b), 1e-9), d.height / Math.max(boxHeight(b), 1e-9));
  const c = boxCenter(b);
  item.transform = multiply(translate(at.x, at.y), multiply(scale(k), multiply(translate(-c.x, -c.y), item.transform)));
}

// the drawing of an svg file as one group, or the only item it has, selected in one undo step
export function placeSvg(svg: SvgImport, at: Vec = stageCenter()): string | null {
  const item = svg.item;
  if (!item) {
    addToast('The svg has nothing this app can draw', 'warning');
    return null;
  }
  const layer = editor.drawTarget();
  if (!layer || !editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return null;
  }
  placeOnStage(item, at);
  editor.commit('Import SVG', (draft) => {
    for (const asset of svg.assets) if (!draft.assets[asset.id]) draft.assets[asset.id] = asset;
    editor.draftItems(draft, layer.id)?.push(cloneItem(item));
  });
  activeLayer.set(layer.id);
  selection.set(new Set([item.id]));
  if (svg.skipped > 0) {
    const what = svg.skipped === 1 ? 'clip path or mask was' : 'clip paths and masks were';
    addToast(`${svg.skipped} ${what} left out`, 'info', 4000);
  }
  if (svg.linked > 0) {
    const what = svg.linked === 1 ? 'picture the file links to was' : 'pictures the file links to were';
    addToast(`${svg.linked} ${what} left out, only pictures inside the file come along`, 'info', 5000);
  }
  return item.id;
}

export function importSvgText(text: string, name: string, at?: Vec): string | null {
  let svg: SvgImport;
  try {
    svg = readSvgText(text, name.replace(/\.svg$/i, '') || 'SVG');
  } catch {
    addToast(`${name} could not be read as an svg`, 'error');
    return null;
  }
  return placeSvg(svg, at);
}

// the fonts the texts of an svg ask for, loaded first so they land on their real baselines
async function svgFonts(text: string, name: string) {
  let svg: SvgImport;
  try {
    svg = readSvgText(text, name);
  } catch {
    return;
  }
  const texts: TextItem[] = [];
  if (!svg.item) return;
  walkItems([svg.item], (it) => {
    if (it.type === 'text') texts.push(it);
  });
  await Promise.all(texts.map((t) => loadFont(t.font, t.weight, t.italic)));
}

export async function importSvg(file: Blob, name: string, at?: Vec): Promise<string | null> {
  const text = await file.text();
  await svgFonts(text, name);
  return importSvgText(text, name, at);
}

function isImage(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || IMAGE_FILE.test(file.name);
}

// pictures, svg files and fonts from the import menu or dropped on the stage, at is in the space being edited.
// a project file among them opens instead
export async function importFiles(files: File[], at?: Vec) {
  const project = files.find(isProjectFile);
  if (project) {
    openDropped(project);
    return;
  }
  for (const file of files) {
    if (file.type === 'image/svg+xml' || SVG_FILE.test(file.name)) await importSvg(file, file.name, at);
    else if (isImage(file)) await importImage(file, file.name, at);
    else if (FONT_FILE.test(file.name)) await importFont(file);
    else addToast(`${file.name} is not a picture or a font`, 'warning');
  }
}

export async function openImport(accept = IMPORT_ACCEPT) {
  const files = await pickFiles(accept);
  if (files.length > 0) await importFiles(files);
}
