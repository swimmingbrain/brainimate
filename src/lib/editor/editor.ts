import { get, writable } from 'svelte/store';
import { produceWithPatches } from 'immer';
import type { Doc, GroupItem, Item, Layer, Mat } from '$lib/core/types';
import { History, type HistoryState } from './history';
import { newId } from '$lib/core/ids';
import { identity, multiply } from '$lib/core/mat';
import { cloneItem, contourOf, findItem, itemBounds, parentMatrix, type Found } from '$lib/core/items';
import { emptyBox, union, type Box } from '$lib/core/bbox';
import { itemsAt } from '$lib/render/frame';
import { keyframeForEdit } from '$lib/anim/timeline';
import { activeLayer, anchorSelection, dirty, docName, frame, selection, stageSize } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';

// outline and highlight colors, a new layer takes the next one
export const LAYER_COLORS = ['#5b7fc9', '#4f9e8a', '#c47f8f', '#c9b45b', '#8f6bb8', '#6fae6f', '#c99a5b', '#b06b9e'];

// bumped on every change to the document, panels re-read editor.doc when it moves
export const docVersion = writable(0);
export const historyState = writable<HistoryState>({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
// the item under the pointer, drawn with a highlight
export const hover = writable<string | null>(null);

export function makeLayer(name: string, color: string, type: Layer['type'] = 'normal'): Layer {
  return {
    id: newId(),
    name,
    type,
    visible: true,
    locked: false,
    outline: false,
    color,
    parent: null,
    keyframes: [{ frame: 0, items: [], pose: {}, tween: null, label: '' }],
    length: 1,
    bones: []
  };
}

export function makeDoc(width: number, height: number, fps: number): Doc {
  return {
    version: 1,
    name: 'Untitled',
    width,
    height,
    fps,
    bg: '#ffffff',
    layers: [makeLayer('Layer 1', LAYER_COLORS[0])],
    symbols: {},
    assets: {},
    swatches: [],
    guides: { h: [], v: [] }
  };
}

export interface Located {
  layer: Layer;
  found: Found;
}

class Editor {
  doc: Doc;
  history = new History<Doc>(200);
  // tools draw changed copies of items here during a drag and commit once at the end
  preview = new Map<string, Item>();
  // new items a tool is still dragging out, drawn on top of their layer
  previewAdded: { layerId: string; item: Item }[] = [];
  contentDirty = true;
  overlayDirty = true;
  frame = 0;

  constructor() {
    this.doc = makeDoc(1920, 1080, get(preferences).timeline.fps);
    activeLayer.set(this.doc.layers[0].id);
    frame.subscribe((f) => {
      this.frame = f;
      this.pruneSelection();
      this.markAll();
    });
    selection.subscribe(() => {
      this.pruneAnchors();
      this.markOverlay();
    });
    hover.subscribe(() => this.markOverlay());
    this.sync();
  }

  markAll() {
    this.contentDirty = true;
    this.overlayDirty = true;
  }

  markOverlay() {
    this.overlayDirty = true;
  }

  newDoc(width: number, height: number, fps: number) {
    this.doc = makeDoc(width, height, fps);
    this.history.clear();
    this.clearPreview();
    selection.set(new Set());
    hover.set(null);
    activeLayer.set(this.doc.layers[0].id);
    frame.set(0);
    this.changed();
    dirty.set(false);
  }

  // recipe changes a draft of the document, the whole change is one undo step
  commit(label: string, recipe: (draft: Doc) => void, key?: string) {
    const [next, patches, inverse] = produceWithPatches(this.doc, recipe);
    if (patches.length === 0) return;
    this.history.push(label, patches, inverse, key ?? null);
    this.doc = next;
    this.changed();
    dirty.set(true);
  }

  undo(): string | null {
    const result = this.history.undo(this.doc);
    if (!result) return null;
    this.doc = result.state;
    this.clearPreview();
    this.changed();
    dirty.set(true);
    return result.label;
  }

  redo(): string | null {
    const result = this.history.redo(this.doc);
    if (!result) return null;
    this.doc = result.state;
    this.clearPreview();
    this.changed();
    dirty.set(true);
    return result.label;
  }

  private changed() {
    this.sync();
    this.pruneSelection();
    historyState.set(this.history.snapshot());
    docVersion.update((n) => n + 1);
    this.markAll();
  }

  // the stage size and the name live in stores too, for the parts that only read those
  private sync() {
    const size = get(stageSize);
    const d = this.doc;
    if (size.width !== d.width || size.height !== d.height || size.background !== d.bg) {
      stageSize.set({ width: d.width, height: d.height, background: d.bg });
    }
    if (get(docName) !== d.name) docName.set(d.name);
    const active = get(activeLayer);
    if (!active || !this.layerById(active)) activeLayer.set(d.layers[d.layers.length - 1]?.id ?? null);
  }

  // drops selected ids that are not on the stage at this frame anymore
  pruneSelection() {
    const sel = get(selection);
    if (sel.size > 0) {
      const kept = [...sel].filter((id) => this.locate(id) !== null);
      if (kept.length !== sel.size) selection.set(new Set(kept));
    }
    const h = get(hover);
    if (h && !this.locate(h)) hover.set(null);
    this.pruneAnchors();
  }

  // picked anchors only make sense on selected paths that still have them
  pruneAnchors() {
    const anchors = get(anchorSelection);
    if (anchors.length === 0) return;
    const sel = get(selection);
    const kept = anchors.filter((a) => {
      const item = this.locate(a.itemId)?.found.item;
      if (item?.type !== 'path' || !sel.has(a.itemId)) return false;
      const c = contourOf(item, a.sub);
      return c !== null && a.index < c.anchors.length;
    });
    if (kept.length !== anchors.length) anchorSelection.set(kept);
  }

  clearPreview() {
    if (this.preview.size === 0 && this.previewAdded.length === 0) return;
    this.preview.clear();
    this.previewAdded = [];
    this.markAll();
  }

  // the layers of what is being edited, a symbol's layers once editing in place exists
  currentLayers(): Layer[] {
    return this.doc.layers;
  }

  layerById(id: string): Layer | null {
    return this.currentLayers().find((l) => l.id === id) ?? null;
  }

  activeLayer(): Layer | null {
    const id = get(activeLayer);
    const layers = this.currentLayers();
    return (id ? this.layerById(id) : null) ?? layers[layers.length - 1] ?? null;
  }

  // the items a layer shows at the current frame
  layerItems(layer: Layer): Item[] {
    return itemsAt(layer, this.frame);
  }

  // a layer the tools may pick from and change
  isEditable(layer: Layer): boolean {
    return layer.visible && !layer.locked && layer.type !== 'folder';
  }

  locate(id: string): Located | null {
    for (const layer of this.currentLayers()) {
      const found = findItem(this.layerItems(layer), id);
      if (found) return { layer, found };
    }
    return null;
  }

  // the doc item, or the copy a tool is dragging when there is one
  itemById(id: string, withPreview = true): Item | null {
    if (withPreview) {
      const p = this.preview.get(id);
      if (p) return p;
    }
    return this.locate(id)?.found.item ?? null;
  }

  layerOfItem(id: string): Layer | null {
    return this.locate(id)?.layer ?? null;
  }

  // the groups around an item, with their preview copies if a tool moves them
  parentMatrixOf(id: string): Mat {
    const loc = this.locate(id);
    if (!loc) return identity();
    return parentMatrix(loc.found.parents.map((g) => (this.preview.get(g.id) as GroupItem | undefined) ?? g));
  }

  worldMatrixOf(id: string): Mat {
    const item = this.itemById(id);
    if (!item) return identity();
    return multiply(this.parentMatrixOf(id), item.transform);
  }

  // selected items bottom to top, the order copy and paste keep
  selectedItems(withPreview = true): Item[] {
    const sel = get(selection);
    if (sel.size === 0) return [];
    const out: Item[] = [];
    const walk = (items: Item[]) => {
      for (const item of items) {
        if (sel.has(item.id)) out.push(withPreview ? (this.preview.get(item.id) ?? item) : item);
        else if (item.type === 'group') walk(item.children);
      }
    };
    for (const layer of this.currentLayers()) walk(this.layerItems(layer));
    return out;
  }

  itemWorldBounds(id: string): Box {
    const item = this.itemById(id);
    if (!item) return emptyBox();
    return itemBounds(item, multiply(this.parentMatrixOf(id), item.transform));
  }

  selectionBounds(): Box {
    let b = emptyBox();
    for (const id of get(selection)) b = union(b, this.itemWorldBounds(id));
    return b;
  }

  private autoKey(): boolean {
    return get(preferences).timeline.autoKey;
  }

  // the items list of a draft layer at the current frame, a keyframe is added first when needed
  draftItems(draft: Doc, layerId: string): Item[] | null {
    const layer = draft.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    return keyframeForEdit(layer, this.frame, this.autoKey()).items;
  }

  // finds an item inside a draft by id, on the layer it lives on now
  draftFind(draft: Doc, id: string): Found | null {
    const layer = this.layerOfItem(id);
    if (!layer) return null;
    const items = this.draftItems(draft, layer.id);
    return items ? findItem(items, id) : null;
  }

  // adds items on top of a layer at the current frame and selects them
  insertItems(layerId: string, items: Item[], label: string) {
    if (items.length === 0) return;
    this.commit(label, (draft) => {
      this.draftItems(draft, layerId)?.push(...items.map((it) => cloneItem(it)));
    });
    activeLayer.set(layerId);
    selection.set(new Set(items.map((it) => it.id)));
  }

  insertItem(layerId: string, item: Item, label = `Add ${item.name.toLowerCase()}`) {
    this.insertItems(layerId, [item], label);
  }

  removeItems(ids: string[], label = 'Delete') {
    if (ids.length === 0) return;
    this.commit(label, (draft) => {
      for (const id of ids) {
        const found = this.draftFind(draft, id);
        if (found) found.list.splice(found.index, 1);
      }
    });
    const sel = get(selection);
    if (ids.some((id) => sel.has(id))) selection.set(new Set([...sel].filter((id) => !ids.includes(id))));
  }

  updateItems(ids: string[], fn: (item: Item) => void, label: string, key?: string) {
    if (ids.length === 0) return;
    this.commit(
      label,
      (draft) => {
        for (const id of ids) {
          const found = this.draftFind(draft, id);
          if (found) fn(found.item);
        }
      },
      key
    );
  }

  updateItem(id: string, fn: (item: Item) => void, label: string, key?: string) {
    this.updateItems([id], fn, label, key);
  }

  // writes what the preview holds into the document as one undo step
  commitPreview(label: string) {
    const changed = [...this.preview.values()];
    const added = this.previewAdded;
    if (changed.length === 0 && added.length === 0) return;
    this.commit(label, (draft) => {
      for (const item of changed) {
        const found = this.draftFind(draft, item.id);
        if (found) found.list[found.index] = cloneItem(item);
      }
      for (const { layerId, item } of added) this.draftItems(draft, layerId)?.push(cloneItem(item));
    });
    this.clearPreview();
  }
}

export const editor = new Editor();
