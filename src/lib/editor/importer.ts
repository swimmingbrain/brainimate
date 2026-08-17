import type { Vec } from '$lib/core/types';
import { applyPoint, invert, translate } from '$lib/core/mat';
import { cloneItem, makeImageItem } from '$lib/core/items';
import { makeAsset } from '$lib/core/assets';
import { readFontFile, registerAssetFonts } from '$lib/core/fonts';
import { activeLayer, addToast, selection } from '$lib/stores/app';
import { editor } from './editor';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;
const FONT_FILE = /\.(ttf|otf|woff)$/i;
const SVG_FILE = /\.svg$/i;

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif';
export const FONT_ACCEPT = '.ttf,.otf,.woff';
export const IMPORT_ACCEPT = `${IMAGE_ACCEPT},${FONT_ACCEPT},.svg`;

// the hidden file input the app keeps, the menus and the image properties open it
let input: HTMLInputElement | null = null;
let waiting: ((files: File[]) => void) | null = null;

export function setImportInput(el: HTMLInputElement | null) {
  input = el;
}

// the input calls this with what was picked, or nothing when the picker was closed
export function filesPicked(files: File[]) {
  const done = waiting;
  waiting = null;
  done?.(files);
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
  const layer = editor.activeLayer();
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

function isImage(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || IMAGE_FILE.test(file.name);
}

// pictures and fonts from the import menu or dropped on the stage, at is in the space being edited
export async function importFiles(files: File[], at?: Vec) {
  for (const file of files) {
    if (file.type === 'image/svg+xml' || SVG_FILE.test(file.name)) addToast('SVG import comes later');
    else if (isImage(file)) await importImage(file, file.name, at);
    else if (FONT_FILE.test(file.name)) await importFont(file);
    else addToast(`${file.name} is not a picture or a font`, 'warning');
  }
}

export async function openImport(accept = IMPORT_ACCEPT) {
  const files = await pickFiles(accept);
  if (files.length > 0) await importFiles(files);
}
