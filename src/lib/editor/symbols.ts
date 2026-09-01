import { get } from 'svelte/store';
import type { InstanceItem, Item, Symbol, Vec } from '$lib/core/types';
import { invert, multiply, translate } from '$lib/core/mat';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { makeInstance, parentMatrix, withNewIds } from '$lib/core/items';
import { newId } from '$lib/core/ids';
import { copySymbol, makesLoop, nextSymbolName, symbolUses } from '$lib/core/library';
import { addToast, dialog, selection } from '$lib/stores/app';
import { LAYER_COLORS, editor, makeLayer } from './editor';
import { replaceInDraft } from './commands';
import { dominantBone } from '$lib/rig/skin';
import { select } from './selection';

// where the symbol's origin sits on what it was made from
export type Registration = 'center' | 'topleft';

export function openConvertDialog() {
  if (editor.selectedItems(false).length === 0) {
    addToast('Select something to turn into a symbol');
    return;
  }
  dialog.set({ kind: 'symbol' });
}

// the selection moves into a new symbol, one layer and one keyframe, and an instance takes its place
// where the topmost selected item was. the items keep their look, re-based on the registration point
export function convertToSymbol(name: string, registration: Registration): string | null {
  const items = editor.selectedItems(false);
  if (items.length === 0) return null;
  const b = editor.selectionBounds();
  const top = items[items.length - 1];
  const at = editor.locate(top.id);
  if (!at) return null;
  const reg = isEmpty(b) ? { x: 0, y: 0 } : registration === 'center' ? boxCenter(b) : { x: b.minX, y: b.minY };
  const into = translate(-reg.x, -reg.y);
  const content = items.map((it) => {
    const c = withNewIds(it);
    c.transform = multiply(into, multiply(editor.parentMatrixOf(it.id), it.transform));
    return c;
  });
  const layer = makeLayer('Layer 1', LAYER_COLORS[0]);
  layer.keyframes[0].items = content;
  const symbol: Symbol = {
    id: newId(),
    name: name.trim() || nextSymbolName(editor.doc.symbols),
    kind: 'graphic',
    layers: [layer]
  };
  // inside a group the instance takes the group transforms off again
  const place = multiply(invert(parentMatrix(at.found.parents)), translate(reg.x, reg.y));
  const instance = makeInstance(symbol.id, symbol.name, place);
  // bound drawings make an instance that follows their main bone, the bones stay out of the symbol
  const bone = dominantBone(items);
  if (bone) instance.skin = { weights: [], rigid: bone };
  editor.commit('Convert to symbol', (draft) => {
    draft.symbols[symbol.id] = symbol;
    replaceInDraft(
      draft,
      items.map((it) => it.id),
      top.id,
      [instance]
    );
  });
  select([instance.id]);
  return symbol.id;
}

// the symbols open for editing, an instance of any of them inside the open one would hold itself
function loops(symbolId: string): boolean {
  return editor.editStack.some((level) => makesLoop(editor.doc.symbols, symbolId, level.symbolId));
}

// an instance with its origin on p, in the space of the timeline being edited
export function placeInstance(symbolId: string, p: Vec): string | null {
  const symbol = editor.doc.symbols[symbolId];
  const layer = editor.drawTarget();
  if (!symbol || !layer) return null;
  if (!editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return null;
  }
  if (loops(symbolId)) {
    addToast('A symbol cannot hold an instance of itself', 'warning');
    return null;
  }
  const instance = makeInstance(symbolId, symbol.name, translate(p.x, p.y));
  editor.insertItem(layer.id, instance, 'Place instance');
  return instance.id;
}

// the selected instances show another symbol, they keep everything else
export function swapSymbol(ids: string[], symbolId: string) {
  const symbol = editor.doc.symbols[symbolId];
  if (!symbol) return;
  if (loops(symbolId)) {
    addToast('A symbol cannot hold an instance of itself', 'warning');
    return;
  }
  editor.updateItems(
    ids,
    (item) => {
      if (item.type !== 'instance') return;
      item.symbol = symbolId;
      item.name = symbol.name;
    },
    'Swap symbol'
  );
}

// an empty symbol, opened right away with its origin on the middle of the stage
export function newSymbol() {
  const layer = makeLayer('Layer 1', LAYER_COLORS[0]);
  const symbol: Symbol = { id: newId(), name: nextSymbolName(editor.doc.symbols), kind: 'graphic', layers: [layer] };
  editor.commit('New symbol', (draft) => {
    draft.symbols[symbol.id] = symbol;
  });
  editSymbol(symbol.id);
}

export function duplicateSymbol(id: string): string | null {
  const symbol = editor.doc.symbols[id];
  if (!symbol) return null;
  const names = new Set(Object.values(editor.doc.symbols).map((s) => s.name));
  let name = `${symbol.name} copy`;
  for (let n = 2; names.has(name); n++) name = `${symbol.name} copy ${n}`;
  const copy = copySymbol(symbol, name);
  editor.commit('Duplicate symbol', (draft) => {
    draft.symbols[copy.id] = copy;
  });
  return copy.id;
}

export function renameSymbol(id: string, name: string) {
  const clean = name.trim();
  const symbol = editor.doc.symbols[id];
  if (!clean || !symbol || symbol.name === clean) return;
  editor.commit('Rename symbol', (draft) => {
    draft.symbols[id].name = clean;
  });
}

// a symbol with instances stays, the toast says how many hold it
export function deleteSymbol(id: string) {
  const symbol = editor.doc.symbols[id];
  if (!symbol) return;
  if (editor.editStack.some((level) => level.symbolId === id)) {
    addToast(`${symbol.name} is open, close it first`, 'warning');
    return;
  }
  const uses = symbolUses(editor.doc, id);
  if (uses > 0) {
    addToast(`${symbol.name} is used by ${uses} ${uses === 1 ? 'instance' : 'instances'}`, 'warning');
    return;
  }
  dialog.set({
    kind: 'confirm',
    title: 'Delete symbol',
    message: `${symbol.name} goes from the library. Undo brings it back.`,
    confirm: 'Delete',
    danger: true,
    onconfirm: () =>
      editor.commit('Delete symbol', (draft) => {
        delete draft.symbols[id];
      })
  });
}

// opens the instance in place, its world matrix becomes the space of the symbol
export function editInstance(id: string): boolean {
  const item = editor.itemById(id, false);
  if (item?.type !== 'instance' || !editor.doc.symbols[item.symbol]) return false;
  const base = multiply(editor.base(), editor.worldMatrixOf(id));
  editor.enterSymbol(item.symbol, id, base);
  return true;
}

// the first instance of the symbol on the stage, groups opened
function instanceOnStage(symbolId: string): InstanceItem | null {
  const walk = (items: Item[]): InstanceItem | null => {
    for (const item of items) {
      if (item.type === 'instance' && item.symbol === symbolId) return item;
      if (item.type === 'group') {
        const inner = walk(item.children);
        if (inner) return inner;
      }
    }
    return null;
  };
  for (const layer of editor.currentLayers()) {
    const found = walk(editor.layerItems(layer));
    if (found) return found;
  }
  return null;
}

// from the library: in place on an instance the stage shows, else on its own around the stage middle
export function editSymbol(id: string) {
  if (!editor.doc.symbols[id]) return;
  const open = editor.editing();
  if (open?.symbolId === id) return;
  const here = instanceOnStage(id);
  if (here && editInstance(here.id)) return;
  if (open) editor.exitTo(0);
  const there = instanceOnStage(id);
  if (there && editInstance(there.id)) return;
  const d = editor.doc;
  editor.enterSymbol(id, null, translate(d.width / 2, d.height / 2));
  selection.set(new Set());
}

// one level up, with nothing selected escape does this
export function leaveSymbol(): boolean {
  if (editor.editStack.length === 0 || get(selection).size > 0) return false;
  editor.exitSymbol();
  return true;
}
