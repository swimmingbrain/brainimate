import { get, writable } from 'svelte/store';
import type { Asset, Item, Symbol, Vec } from '$lib/core/types';
import { cloneItem, cloneItems, withNewIds } from '$lib/core/items';
import { multiply, translate } from '$lib/core/mat';
import { eachItem, instancesIn, makesLoop, nestedSymbols, walkItems } from '$lib/core/library';
import { activeLayer, addToast, selection } from '$lib/stores/app';
import { editor } from './editor';
import { timelineBones } from '$lib/rig/bones';
import { keepSkins } from '$lib/rig/skin';
import { IMAGE_TYPES, importImage, stageCenter } from './importer';
import { placeText, textEditing } from './text';

// what goes onto the system clipboard as text: the items with the symbols and assets they need, so a
// paste in another tab or another document has everything
export interface Payload {
  brainimate: 1;
  items: Item[];
  symbols: Record<string, Symbol>;
  assets: Record<string, Asset>;
}

// the last copy also stays here, for when the system clipboard cannot be read
let clip: Payload | null = null;
// each paste lands a little further off, so stacked pastes stay visible
let pasteCount = 0;

const OFFSET = 10;

export const hasClipboard = writable(false);

// the symbols the items show, nested ones too, and the pictures and fonts all of it uses
function payloadFor(items: Item[]): Payload {
  const doc = editor.doc;
  const ids = new Set<string>();
  for (const inst of instancesIn(items)) {
    ids.add(inst.symbol);
    for (const id of nestedSymbols(doc.symbols, inst.symbol)) ids.add(id);
  }
  const symbols: Record<string, Symbol> = {};
  for (const id of ids) if (doc.symbols[id]) symbols[id] = doc.symbols[id];
  const images = new Set<string>();
  const families = new Set<string>();
  const visit = (item: Item) => {
    if (item.type === 'image') images.add(item.asset);
    else if (item.type === 'text') families.add(item.font);
  };
  walkItems(items, visit);
  for (const s of Object.values(symbols)) eachItem(s.layers, visit);
  const assets: Record<string, Asset> = {};
  for (const asset of Object.values(doc.assets)) {
    if (images.has(asset.id) || (asset.type === 'font' && families.has(asset.name))) assets[asset.id] = asset;
  }
  return JSON.parse(JSON.stringify({ brainimate: 1, items, symbols, assets })) as Payload;
}

// a brainimate payload from clipboard text, null for anything else
export function readPayload(text: string): Payload | null {
  if (!text || text[0] !== '{') return null;
  try {
    const data = JSON.parse(text) as Partial<Payload>;
    if (data.brainimate !== 1 || !Array.isArray(data.items)) return null;
    return { brainimate: 1, items: data.items, symbols: data.symbols ?? {}, assets: data.assets ?? {} };
  } catch {
    return null;
  }
}

// a child inside a group goes out with its group transforms baked in
function selectedCopies(): Item[] {
  return editor.selectedItems(false).map((item) => {
    const c = cloneItem(item);
    c.transform = multiply(editor.parentMatrixOf(item.id), item.transform);
    return c;
  });
}

// the event of ctrl+C gets the text right away, a menu click writes it through the clipboard api
export function copy(e?: ClipboardEvent): number {
  const items = selectedCopies();
  if (items.length === 0) return 0;
  clip = payloadFor(items);
  pasteCount = 0;
  hasClipboard.set(true);
  const text = JSON.stringify(clip);
  if (e?.clipboardData) {
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  return items.length;
}

export function cut(e?: ClipboardEvent) {
  const ids = editor.selectedItems(false).map((it) => it.id);
  if (copy(e) > 0) editor.removeItems(ids, 'Cut');
}

// the items with new ids on the active layer, the symbols and assets the document lacks come along,
// all in one undo step
function pastePayload(payload: Payload, offset: number, label: string) {
  const layer = editor.drawTarget();
  if (!layer) return;
  if (!editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return;
  }
  const doc = editor.doc;
  const symbols = { ...payload.symbols, ...doc.symbols };
  const inside = instancesIn(payload.items).some((inst) =>
    editor.editStack.some((level) => makesLoop(symbols, inst.symbol, level.symbolId))
  );
  if (inside) {
    addToast('A symbol cannot hold an instance of itself', 'warning');
    return;
  }
  // skins on bones this timeline does not have are left behind
  const bones = new Set(timelineBones(editor.currentLayers()).map((b) => b.id));
  const copies = cloneItems(payload.items).map((item) => {
    const c = keepSkins(withNewIds(item), bones);
    c.transform = multiply(translate(offset, offset), c.transform);
    return c;
  });
  editor.commit(label, (draft) => {
    for (const [id, symbol] of Object.entries(payload.symbols)) {
      if (!draft.symbols[id]) draft.symbols[id] = symbol;
    }
    for (const [id, asset] of Object.entries(payload.assets)) {
      if (!draft.assets[id]) draft.assets[id] = asset;
    }
    editor.draftItems(draft, layer.id)?.push(...copies);
  });
  activeLayer.set(layer.id);
  selection.set(new Set(copies.map((c) => c.id)));
}

export function paste() {
  if (!clip) return;
  pasteCount++;
  pastePayload(clip, OFFSET * pasteCount, 'Paste');
}

export function pasteInPlace() {
  if (clip) pastePayload(clip, 0, 'Paste in place');
}

// the same payload as the last copy pastes further off each time, another one where it was
function pasteText(text: string, inPlace: boolean, at: Vec): boolean {
  const payload = readPayload(text);
  if (payload) {
    const own = clip && JSON.stringify(clip) === text;
    if (!own) {
      clip = payload;
      pasteCount = 0;
      hasClipboard.set(true);
    }
    if (inPlace) pasteInPlace();
    else if (own) paste();
    else pastePayload(payload, 0, 'Paste');
    return true;
  }
  if (text.trim() === '') return false;
  placeText(text, at);
  return true;
}

// ctrl+V: our items, else a picture, else plain text as a text item, else the copy kept here
export function pasteEvent(e: ClipboardEvent, inPlace = false) {
  const data = e.clipboardData;
  if (!data) return;
  e.preventDefault();
  const at = stageCenter();
  const text = data.getData('text/plain');
  if (readPayload(text)) {
    pasteText(text, inPlace, at);
    return;
  }
  const file = [...data.files].find((f) => IMAGE_TYPES.includes(f.type));
  if (file) {
    void importImage(file, file.name || 'Pasted image', at);
    return;
  }
  if (get(textEditing)) return;
  if (pasteText(text, inPlace, at)) return;
  if (inPlace) pasteInPlace();
  else paste();
}

// the menu has no paste event, it reads the clipboard through the api and falls back to the copy here
export async function pasteFromSystem(inPlace = false) {
  const at = stageCenter();
  try {
    if (navigator.clipboard?.read) {
      const entries = await navigator.clipboard.read();
      for (const entry of entries) {
        if (entry.types.includes('text/plain')) {
          const text = await (await entry.getType('text/plain')).text();
          if (pasteText(text, inPlace, at)) return;
        }
        const type = entry.types.find((t) => IMAGE_TYPES.includes(t));
        if (type) {
          await importImage(await entry.getType(type), 'Pasted image', at);
          return;
        }
      }
    } else if (navigator.clipboard?.readText) {
      if (pasteText(await navigator.clipboard.readText(), inPlace, at)) return;
    }
  } catch {
    // no permission or nothing readable, the copy kept here still works
  }
  if (inPlace) pasteInPlace();
  else paste();
}

export function duplicate() {
  const items = selectedCopies();
  if (items.length > 0) pastePayload({ brainimate: 1, items, symbols: {}, assets: {} }, OFFSET, 'Duplicate');
}
