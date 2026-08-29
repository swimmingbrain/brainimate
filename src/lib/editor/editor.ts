import { get, writable } from 'svelte/store';
import { produceWithPatches } from 'immer';
import type { Bone, Doc, GroupItem, Item, Layer, Mat } from '$lib/core/types';
import { History, type HistoryState } from './history';
import { newId } from '$lib/core/ids';
import { identity, multiply } from '$lib/core/mat';
import { cloneItem, contourOf, findItem, itemBounds, parentMatrix, type Found } from '$lib/core/items';
import { emptyBox, union, type Box } from '$lib/core/bbox';
import { itemsAt, keyframeAt, layersLength, setLibrary, setOffsetSource, tweenAt } from '$lib/render/frame';
import { isLayerLocked, isLayerShown, keyframeForEdit } from '$lib/anim/timeline';
import { rebaseEdit } from '$lib/anim/tween';
import { registerAssetFonts } from '$lib/core/fonts';
import { PALETTE } from '$lib/core/palette';
import { skinRepairs } from '$lib/rig/repair';
import { rigFor, type PoseOverride, type Rig } from '$lib/rig/bones';
import { posed, posedList, skinDelta } from '$lib/rig/skin';
import {
  activeLayer,
  anchorSelection,
  boneSelection,
  dirty,
  docName,
  frame,
  frameSelection,
  selection,
  stageSize
} from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';

// outline and highlight colors, a new layer takes the next one
export const LAYER_COLORS = PALETTE;

// bumped on every change to the document, panels re-read editor.doc when it moves
export const docVersion = writable(0);
export const historyState = writable<HistoryState>({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
// the item under the pointer, drawn with a highlight
export const hover = writable<string | null>(null);

// one level of editing a symbol in place
export interface EditLevel {
  symbolId: string;
  // the instance opened, null when the symbol is edited on its own
  instanceId: string | null;
  // the instance's world matrix when it was opened, from symbol space to the document
  base: Mat;
  // frame and active layer of the level below, given back on the way out
  frame: number;
  layer: string | null;
}

// the symbols being edited in place, the outermost first
export const editStack = writable<EditLevel[]>([]);

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
  // a pose being dragged on a rig layer, the stage shows it until the drag commits
  posePreview: PoseOverride | null = null;
  contentDirty = true;
  overlayDirty = true;
  frame = 0;
  editStack: EditLevel[] = [];
  // the assets the document's fonts were last read from
  private fontAssets: Doc['assets'] | null = null;
  // frames past their keyframe of the items on the stage, worked out once per frame and timeline
  private offsets: { layers: Layer[]; frame: number; map: Map<string, number> } | null = null;

  constructor() {
    this.doc = makeDoc(1920, 1080, get(preferences).timeline.fps);
    activeLayer.set(this.doc.layers[0].id);
    setOffsetSource((id) => this.offsetOf(id));
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
    this.setStack([]);
    this.history.clear();
    this.clearPreview();
    selection.set(new Set());
    frameSelection.set(null);
    hover.set(null);
    activeLayer.set(this.doc.layers[0].id);
    frame.set(0);
    this.changed();
    dirty.set(false);
  }

  // recipe changes a draft of the document, the whole change is one undo step
  commit(label: string, recipe: (draft: Doc) => void, key?: string) {
    let [next, patches, inverse] = produceWithPatches(this.doc, recipe);
    if (patches.length === 0) return;
    // skins left on bones that went or on anchors that changed are set right in the same step
    const repair = skinRepairs(this.doc, next);
    if (repair) {
      const [fixed, more, back] = produceWithPatches(next, repair);
      next = fixed;
      patches = [...patches, ...more];
      inverse = [...back, ...inverse];
    }
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

  // panels and the stage read everything again
  refresh() {
    this.changed();
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
    setLibrary(d.symbols);
    if (d.assets !== this.fontAssets) {
      this.fontAssets = d.assets;
      void registerAssetFonts(d.assets);
    }
    // an undo can take away a symbol that is open, editing it ends there
    const gone = this.editStack.findIndex((l) => !d.symbols[l.symbolId]);
    if (gone >= 0) this.setStack(this.editStack.slice(0, gone));
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
    const b = get(boneSelection);
    if (b && !this.findBone(b)) boneSelection.set(null);
    this.pruneAnchors();
  }

  // a bone of the timeline being edited and the rig layer that holds it
  findBone(id: string): { layer: Layer; bone: Bone } | null {
    for (const layer of this.currentLayers()) {
      if (layer.type !== 'rig') continue;
      const bone = layer.bones.find((x) => x.id === id);
      if (bone) return { layer, bone };
    }
    return null;
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
    if (this.preview.size === 0 && this.previewAdded.length === 0 && !this.posePreview) return;
    this.preview.clear();
    this.previewAdded = [];
    this.posePreview = null;
    this.markAll();
  }

  private setStack(stack: EditLevel[]) {
    this.editStack = stack;
    editStack.set(stack);
  }

  // the symbol open for editing in place, null on the main timeline
  editing(): EditLevel | null {
    return this.editStack[this.editStack.length - 1] ?? null;
  }

  // the layers of what is being edited, the main timeline or the open symbol
  currentLayers(): Layer[] {
    const top = this.editing();
    return (top && this.doc.symbols[top.symbolId]?.layers) || this.doc.layers;
  }

  // frames the timeline being edited runs for
  length(): number {
    return layersLength(this.currentLayers());
  }

  // maps the space of the timeline being edited to the document, identity on the main timeline
  base(): Mat {
    return this.editing()?.base ?? identity();
  }

  // opens a symbol for editing in place, base places its origin in the document
  enterSymbol(symbolId: string, instanceId: string | null, base: Mat) {
    const symbol = this.doc.symbols[symbolId];
    if (!symbol) return;
    this.clearPreview();
    const level: EditLevel = { symbolId, instanceId, base, frame: this.frame, layer: get(activeLayer) };
    this.setStack([...this.editStack, level]);
    selection.set(new Set());
    anchorSelection.set([]);
    frameSelection.set(null);
    hover.set(null);
    const layers = symbol.layers;
    const top = [...layers].reverse().find((l) => l.type === 'normal') ?? layers[layers.length - 1];
    activeLayer.set(top?.id ?? null);
    frame.set(Math.min(this.frame, layersLength(symbol.layers) - 1));
    this.changed();
  }

  // back to the level with depth symbols open, 0 is the main timeline, the instance left gets selected
  exitTo(depth: number) {
    if (depth < 0 || depth >= this.editStack.length) return;
    const back = this.editStack[depth];
    this.clearPreview();
    this.setStack(this.editStack.slice(0, depth));
    anchorSelection.set([]);
    frameSelection.set(null);
    hover.set(null);
    activeLayer.set(back.layer);
    frame.set(back.frame);
    selection.set(back.instanceId && this.locate(back.instanceId) ? new Set([back.instanceId]) : new Set());
    this.changed();
  }

  exitSymbol() {
    this.exitTo(this.editStack.length - 1);
  }

  // how many frames past its keyframe an item on the stage is, instances map their frame by it
  offsetOf(id: string): number {
    const layers = this.currentLayers();
    if (!this.offsets || this.offsets.layers !== layers || this.offsets.frame !== this.frame) {
      const map = new Map<string, number>();
      const walk = (items: Item[], offset: number) => {
        for (const item of items) {
          map.set(item.id, offset);
          if (item.type === 'group') walk(item.children, offset);
        }
      };
      for (const layer of layers) {
        const key = keyframeAt(layer, this.frame);
        if (key && key.frame < this.frame) walk(this.layerItems(layer), this.frame - key.frame);
      }
      this.offsets = { layers, frame: this.frame, map };
    }
    return this.offsets.map.get(id) ?? 0;
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

  // a layer the tools may pick from and change, a hidden or locked folder around it counts too
  isEditable(layer: Layer): boolean {
    if (layer.type === 'folder' || layer.type === 'rig') return false;
    const layers = this.currentLayers();
    return isLayerShown(layers, layer) && !isLayerLocked(layers, layer);
  }

  // why the tools cannot draw on a layer, for the note they show
  lockReason(layer: Layer | null): string {
    if (!layer) return 'There is no layer to draw on';
    if (layer.type === 'folder') return 'Pick a layer, a folder holds no drawings';
    if (layer.type === 'rig') return 'Pick a layer, a rig layer holds bones';
    return `${layer.name} is locked or hidden`;
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

  // the bounds of what shows, bent by the rig when the item is bound
  itemWorldBounds(id: string): Box {
    const item = this.shownItem(id);
    if (!item) return emptyBox();
    return itemBounds(item, this.shownWorld(id));
  }

  // the bones of the timeline being edited at the current frame, with the pose being dragged
  rig(): Rig | null {
    return rigFor(this.currentLayers(), this.frame, this.posePreview);
  }

  // the items of a layer as they show, the bound ones bent by the rig
  shownItems(layer: Layer): Item[] {
    return posedList(this.layerItems(layer), this.rig());
  }

  // the groups around an item as they show, a group bound to a bone moves with it
  shownParentMatrix(id: string): Mat {
    const loc = this.locate(id);
    const rig = this.rig();
    if (!loc || !rig) return this.parentMatrixOf(id);
    let m = identity();
    for (const g of loc.found.parents) {
      const group = (this.preview.get(g.id) as GroupItem | undefined) ?? g;
      m = multiply(m, group.skin?.rigid ? posed(group, m, rig).transform : group.transform);
    }
    return m;
  }

  // the item as it shows: a bound one bent by the rig, a copy a tool drags included
  shownItem(id: string): Item | null {
    const item = this.itemById(id);
    const rig = this.rig();
    if (!item || !rig) return item;
    // inside a group bound as a whole it only moves with the group
    if (this.locate(id)?.found.parents.some((g) => g.skin?.rigid)) return item;
    return posed(item, this.parentMatrixOf(id), rig, this.preview);
  }

  shownWorld(id: string): Mat {
    const item = this.shownItem(id);
    return item ? multiply(this.shownParentMatrix(id), item.transform) : identity();
  }

  // how the rig moves a bound item as a whole, a move of what shows goes through it to the rest shape
  skinDeltaOf(id: string): Mat {
    const item = this.itemById(id, false);
    return item ? skinDelta(item, this.parentMatrixOf(id), this.rig()) : identity();
  }

  selectionBounds(): Box {
    let b = emptyBox();
    for (const id of get(selection)) b = union(b, this.itemWorldBounds(id));
    return b;
  }

  private autoKey(): boolean {
    return get(preferences).timeline.autoKey;
  }

  // the layers of a draft that match currentLayers
  draftLayers(draft: Doc): Layer[] {
    const top = this.editing();
    return (top && draft.symbols[top.symbolId]?.layers) || draft.layers;
  }

  // the items list of a draft layer at the current frame, a keyframe is added first when needed
  draftItems(draft: Doc, layerId: string): Item[] | null {
    const layer = this.draftLayers(draft).find((l) => l.id === layerId);
    if (!layer) return null;
    return keyframeForEdit(layer, this.frame, this.autoKey()).items;
  }

  // the shown item when it is an in between state of a tween that an edit has to be carried
  // back from: auto key is off, so the edit lands on the keyframe the tween starts from
  private tweenedItem(id: string): Item | null {
    if (this.autoKey()) return null;
    const loc = this.locate(id);
    if (!loc || !tweenAt(loc.layer, this.frame)) return null;
    return loc.found.item;
  }

  // writes an edited copy of the shown item into the draft
  private writeEdit(draft: Doc, edited: Item) {
    const shown = this.tweenedItem(edited.id);
    const found = this.draftFind(draft, edited.id);
    if (!found) return;
    found.list[found.index] = shown ? rebaseEdit(found.item, shown, edited) : cloneItem(edited);
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
          const shown = this.tweenedItem(id);
          if (shown) {
            const edited = cloneItem(shown);
            fn(edited);
            this.writeEdit(draft, edited);
            continue;
          }
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
      for (const item of changed) this.writeEdit(draft, item);
      for (const { layerId, item } of added) this.draftItems(draft, layerId)?.push(cloneItem(item));
    });
    this.clearPreview();
  }
}

export const editor = new Editor();
