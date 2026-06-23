import { get } from 'svelte/store';
import type { Doc, GroupItem, Item, Paint, PathData, PathItem } from '$lib/core/types';
import { clonePaint, cloneStyle, solid } from '$lib/core/style';
import { around, compose, decompose, identity, invert, multiply, rotate, scale, scaleFactor } from '$lib/core/mat';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { closePath, copyPath, reversePath, transformPath, type Compound } from '$lib/core/path';
import { cloneItem, contours, makePathItem, parentMatrix } from '$lib/core/items';
import { combine, divide, type BooleanOp, type Shape } from '$lib/core/boolean';
import { joinTwo, simplifyPath, strokePieces } from '$lib/core/pathops';
import { smoothPath } from '$lib/core/smooth';
import { newId } from '$lib/core/ids';
import { insertKeyframe } from '$lib/anim/timeline';
import { addToast, colorTarget, fillPaint, outlineMode, selection, showDockTab, strokePaint } from '$lib/stores/app';
import { preferences, setGroup } from '$lib/stores/preferences';
import { editor } from './editor';
import { clearSelection, select, transformSelection } from './selection';

// menu entries whose work comes later say so instead of doing nothing
export function notYet(what = 'This') {
  addToast(`${what} is not there yet`);
}

export function undo() {
  if (editor.undo() === null) addToast('Nothing to undo');
}

export function redo() {
  if (editor.redo() === null) addToast('Nothing to redo');
}

export function toggleGrid() {
  setGroup('grid', { show: !get(preferences).grid.show });
}

export function toggleRulers() {
  setGroup('rulers', { show: !get(preferences).rulers.show });
}

export function toggleGuides() {
  setGroup('guides', { show: !get(preferences).guides.show });
}

export function toggleSnapping() {
  setGroup('snapping', { enabled: !get(preferences).snapping.enabled });
}

export function toggleOnion() {
  setGroup('timeline', { onion: !get(preferences).timeline.onion });
}

export function togglePasteboard() {
  setGroup('stage', { pasteboard: !get(preferences).stage.pasteboard });
}

export function toggleOutline() {
  outlineMode.update((on) => !on);
}

export function swapColors() {
  const fill = get(fillPaint);
  fillPaint.set(get(strokePaint));
  strokePaint.set(fill);
}

// black stroke and white fill, like the other drawing apps
export function resetColors() {
  fillPaint.set(solid('#ffffff'));
  strokePaint.set(solid('#000000'));
}

// the active chip gets no color
export function clearColor() {
  setPaint(get(colorTarget), null);
}

export function toggleColorTarget() {
  colorTarget.update((t) => (t === 'fill' ? 'stroke' : 'fill'));
}

// sets the current color and gives it to the selected shapes too, like illustrator
export function setPaint(target: 'fill' | 'stroke', paint: Paint | null) {
  (target === 'fill' ? fillPaint : strokePaint).set(clonePaint(paint));
  const ids = editor
    .selectedItems(false)
    .filter((it) => it.type === 'path' || it.type === 'text')
    .map((it) => it.id);
  if (ids.length === 0) return;
  editor.updateItems(
    ids,
    (item) => {
      if (item.type === 'path' || item.type === 'text') item.style[target] = clonePaint(paint);
    },
    target === 'fill' ? 'Fill color' : 'Stroke color',
    `paint-${target}`
  );
}

function selectedPathIds(): string[] {
  return editor
    .selectedItems(false)
    .filter((it) => it.type === 'path')
    .map((it) => it.id);
}

// around the middle of the selection, like the transform submenus of the other apps
export function flipSelection(horizontal: boolean) {
  const b = editor.selectionBounds();
  if (isEmpty(b)) return;
  const m = around(scale(horizontal ? -1 : 1, horizontal ? 1 : -1), boxCenter(b));
  transformSelection(m, horizontal ? 'Flip horizontal' : 'Flip vertical');
}

export function rotateSelection(degrees: number) {
  const b = editor.selectionBounds();
  if (isEmpty(b)) return;
  transformSelection(around(rotate((degrees * Math.PI) / 180), boxCenter(b)), 'Rotate');
}

// rotation, scale and skew go, the position stays
export function removeTransform() {
  const ids = editor.selectedItems(false).map((it) => it.id);
  editor.updateItems(
    ids,
    (item) => {
      const d = decompose(item.transform);
      item.transform = compose({ x: d.x, y: d.y, rotation: 0, scaleX: 1, scaleY: 1, skew: 0 });
    },
    'Remove transform'
  );
}

export function reverseSelectedPaths() {
  editor.updateItems(
    selectedPathIds(),
    (item) => {
      if (item.type === 'path') for (const c of contours(item)) reversePath(c);
    },
    'Reverse path'
  );
}

export function closeSelectedPaths() {
  editor.updateItems(
    selectedPathIds(),
    (item) => {
      if (item.type === 'path') closePath(item.path);
    },
    'Close path'
  );
}

// a keyframe on the active layer at the current frame, the real frame tools come with the timeline work
export function insertKeyframeHere() {
  const layer = editor.activeLayer();
  if (!layer) return;
  const at = editor.frame;
  editor.commit('Insert keyframe', (draft) => {
    const target = draft.layers.find((l) => l.id === layer.id);
    if (target) insertKeyframe(target, at);
  });
}

// nothing selected shows the document in the properties panel
export function showDocumentSettings() {
  clearSelection();
  showDockTab('properties');
}

export function makeGroup(children: Item[], name = 'Group'): GroupItem {
  return {
    id: newId(),
    name,
    type: 'group',
    transform: identity(),
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    children,
    skin: null
  };
}

// the selected items go into one group where the topmost of them was, they keep their look
export function groupSelection() {
  const items = editor.selectedItems(false);
  if (items.length === 0) return;
  const top = items[items.length - 1];
  const at = editor.locate(top.id);
  if (!at) return;
  const into = invert(parentMatrix(at.found.parents));
  const children = items.map((it) => {
    const c = cloneItem(it);
    c.transform = multiply(into, multiply(editor.parentMatrixOf(it.id), it.transform));
    return c;
  });
  const group = makeGroup(children);
  editor.commit('Group', (draft) => {
    replaceInDraft(
      draft,
      items.map((it) => it.id),
      top.id,
      [group]
    );
  });
  select([group.id]);
}

// inside a commit: the items go and the new ones take the slot of slotId, which is one of them
function replaceInDraft(draft: Doc, ids: string[], slotId: string, added: Item[]) {
  const target = editor.draftFind(draft, slotId);
  if (!target) return;
  const list = target.list;
  // the slot moves down by every item below it in the same list that goes too
  let index = target.index;
  for (const id of ids) {
    const found = editor.draftFind(draft, id);
    if (found && found.list === list && found.index < target.index) index--;
  }
  for (const id of ids) {
    const found = editor.draftFind(draft, id);
    if (found) found.list.splice(found.index, 1);
  }
  list.splice(index, 0, ...added);
}

// the children take the group transform, opacity and blend so nothing moves
export function ungroupSelection() {
  const groups = editor.selectedItems(false).filter((it): it is GroupItem => it.type === 'group');
  if (groups.length === 0) return;
  const ids: string[] = [];
  editor.commit('Ungroup', (draft) => {
    for (const g of groups) {
      const found = editor.draftFind(draft, g.id);
      if (!found || found.item.type !== 'group') continue;
      ids.push(...ungroupInDraft(found.item, found.list, found.index));
    }
  });
  selection.set(new Set(ids));
}

function ungroupInDraft(group: GroupItem, list: Item[], index: number): string[] {
  const kids = group.children.map((child) => {
    const k = cloneItem(child);
    k.transform = multiply(group.transform, child.transform);
    k.opacity = child.opacity * group.opacity;
    if (k.blend === 'normal') k.blend = group.blend;
    return k;
  });
  list.splice(index, 1, ...kids);
  return kids.map((k) => k.id);
}

export type Arrange = 'front' | 'forward' | 'backward' | 'back';

// moves the picked items of one list, the others keep their order
export function reorder<T extends { id: string }>(list: T[], ids: Set<string>, how: Arrange) {
  if (how === 'front' || how === 'back') {
    const picked = list.filter((it) => ids.has(it.id));
    const rest = list.filter((it) => !ids.has(it.id));
    list.splice(0, list.length, ...(how === 'front' ? [...rest, ...picked] : [...picked, ...rest]));
    return;
  }
  const swap = (i: number) => list.splice(i, 2, list[i + 1], list[i]);
  if (how === 'forward') {
    for (let i = list.length - 2; i >= 0; i--) if (ids.has(list[i].id) && !ids.has(list[i + 1].id)) swap(i);
  } else {
    for (let i = 1; i < list.length; i++) if (ids.has(list[i].id) && !ids.has(list[i - 1].id)) swap(i - 1);
  }
}

const ARRANGE_LABELS: Record<Arrange, string> = {
  front: 'Bring to front',
  forward: 'Bring forward',
  backward: 'Send backward',
  back: 'Send to back'
};

// within each list that holds selected items, so a child stays inside its group
export function arrangeSelection(how: Arrange) {
  const ids = new Set(editor.selectedItems(false).map((it) => it.id));
  if (ids.size === 0) return;
  editor.commit(ARRANGE_LABELS[how], (draft) => {
    const lists = new Set<Item[]>();
    for (const id of ids) {
      const found = editor.draftFind(draft, id);
      if (found) lists.add(found.list);
    }
    for (const list of lists) reorder(list, ids, how);
  });
}

// breaks groups into their children and a path with holes into one path per contour
export function breakApart() {
  const items = editor.selectedItems(false);
  const ids: string[] = [];
  let changed = false;
  editor.commit('Break apart', (draft) => {
    for (const it of items) {
      const found = editor.draftFind(draft, it.id);
      if (!found) continue;
      if (found.item.type === 'group') {
        ids.push(...ungroupInDraft(found.item, found.list, found.index));
        changed = true;
        continue;
      }
      if (found.item.type !== 'path') continue;
      const parts = contours(found.item);
      if (parts.length < 2) {
        ids.push(it.id);
        continue;
      }
      const base = cloneItem(found.item);
      const pieces = parts.map((path, i) => ({
        ...cloneItem(base),
        id: i === 0 ? base.id : newId(),
        path: copyPath(path),
        subpaths: []
      }));
      found.list.splice(found.index, 1, ...pieces);
      ids.push(...pieces.map((p) => p.id));
      changed = true;
    }
  });
  if (!changed) addToast('There is nothing to break apart');
  else selection.set(new Set(ids));
}

function selectedPaths(): PathItem[] {
  return editor.selectedItems(false).filter((it): it is PathItem => it.type === 'path');
}

// the matrix from the local space of item to the one of base
function spaceOf(base: PathItem, item: PathItem) {
  return multiply(invert(editor.worldMatrixOf(base.id)), editor.worldMatrixOf(item.id));
}

// the path of item in the local space of base, so both can be combined there
function inSpaceOf(base: PathItem, item: PathItem): PathData {
  if (base.id === item.id) return copyPath(item.path);
  return transformPath(item.path, spaceOf(base, item));
}

// every contour of item in the local space of base
function shapeInSpaceOf(base: PathItem, item: PathItem): Shape {
  if (base.id === item.id) return contours(item).map(copyPath);
  const m = spaceOf(base, item);
  return contours(item).map((c) => transformPath(c, m));
}

// two open paths become one at their closest ends, a single open path is closed
export function joinSelectedPaths() {
  const paths = selectedPaths().filter((p) => !p.path.closed && p.path.anchors.length > 1);
  if (paths.length === 0) {
    addToast('Select one or two open paths');
    return;
  }
  const base = paths[0];
  if (paths.length === 1) {
    editor.updateItem(
      base.id,
      (item) => {
        if (item.type === 'path') closePath(item.path);
      },
      'Join'
    );
    return;
  }
  let joined = copyPath(base.path);
  for (const other of paths.slice(1)) joined = joinTwo(joined, inSpaceOf(base, other));
  editor.commit('Join', (draft) => {
    const found = editor.draftFind(draft, base.id);
    if (found && found.item.type === 'path') found.item.path = joined;
    for (const other of paths.slice(1)) {
      const gone = editor.draftFind(draft, other.id);
      if (gone) gone.list.splice(gone.index, 1);
    }
  });
  select([base.id]);
}

export function setSelectedPathsClosed(closed: boolean) {
  editor.updateItems(
    selectedPaths().map((p) => p.id),
    (item) => {
      if (item.type !== 'path') return;
      if (closed) closePath(item.path);
      else item.path.closed = false;
    },
    closed ? 'Close path' : 'Open path'
  );
}

// fewer anchors within one screen pixel at 100 percent
export function simplifySelectedPaths() {
  const paths = selectedPaths();
  const out = new Map<string, PathData[]>();
  for (const p of paths) {
    const tolerance = 1 / Math.max(scaleFactor(editor.worldMatrixOf(p.id)), 1e-6);
    out.set(p.id, contours(p).map((c) => simplifyPath(c, tolerance)));
  }
  editor.updateItems(
    paths.map((p) => p.id),
    (item) => {
      const list = out.get(item.id);
      if (item.type !== 'path' || !list) return;
      item.path = list[0];
      // a hole simplified down to nothing is dropped
      item.subpaths = list.slice(1).filter((c) => c.closed && c.anchors.length > 2);
    },
    'Simplify'
  );
}

export function smoothSelectedPaths() {
  editor.updateItems(
    selectedPaths().map((p) => p.id),
    (item) => {
      if (item.type === 'path') for (const c of contours(item)) smoothPath(c);
    },
    'Smooth'
  );
}

// the stroke becomes a filled shape in the stroke color, a fill stays underneath as its own path
export async function outlineSelectedStrokes() {
  const paths = selectedPaths().filter((p) => p.style.stroke && p.style.width > 0);
  if (paths.length === 0) {
    addToast('Select a path with a stroke');
    return;
  }
  const results = new Map<string, Compound[]>();
  try {
    for (const p of paths) {
      const world = editor.worldMatrixOf(p.id);
      const width = p.style.scaleStroke ? p.style.width : p.style.width / Math.max(scaleFactor(world), 1e-9);
      const pieces = contours(p).flatMap((c) => strokePieces(c, width, p.style.cap, p.style.join));
      if (pieces.length > 0) results.set(p.id, await combine('unite', pieces.map((q) => [q])));
    }
  } catch {
    addToast('The stroke could not be outlined', 'error');
    return;
  }
  const ids: string[] = [];
  editor.commit('Outline stroke', (draft) => {
    for (const [id, list] of results) {
      const found = editor.draftFind(draft, id);
      if (!found || found.item.type !== 'path') continue;
      const base = cloneItem(found.item);
      const style = { ...cloneStyle(base.style), fill: clonePaint(base.style.stroke), stroke: null };
      const shapes = list.map((c) => ({
        ...cloneItem(base),
        id: newId(),
        path: c.path,
        subpaths: c.subpaths,
        style: cloneStyle(style)
      }));
      if (base.style.fill) {
        found.item.style.stroke = null;
        found.list.splice(found.index + 1, 0, ...shapes);
      } else {
        found.list.splice(found.index, 1, ...shapes);
      }
      ids.push(...shapes.map((sh) => sh.id));
    }
  });
  selection.set(new Set(ids));
}

const BOOLEAN_LABELS: Record<BooleanOp | 'divide', string> = {
  unite: 'Unite',
  subtract: 'Subtract',
  intersect: 'Intersect',
  exclude: 'Exclude',
  divide: 'Divide'
};

// the selected paths, bottom first, become new paths in the place of the bottom one with its style,
// subtract takes everything above from the bottom path, divide keeps each piece in the style it came from
export async function booleanSelection(op: BooleanOp | 'divide') {
  const paths = selectedPaths();
  if (paths.length < 2) {
    addToast('Select two or more paths');
    return;
  }
  const base = paths[0];
  const shapes = paths.map((p) => shapeInSpaceOf(base, p));
  let pieces: { shape: Compound; source: number }[];
  try {
    if (op === 'divide') pieces = await divide(shapes);
    else pieces = (await combine(op, shapes)).map((shape) => ({ shape, source: 0 }));
  } catch {
    addToast('The paths could not be combined', 'error');
    return;
  }
  const added = pieces.map(({ shape, source }) => {
    const from = paths[source];
    const item = makePathItem(from.name, shape.path, cloneStyle(from.style), [...base.transform], shape.subpaths);
    return { ...item, opacity: from.opacity, blend: from.blend };
  });
  editor.commit(BOOLEAN_LABELS[op], (draft) => {
    replaceInDraft(
      draft,
      paths.map((p) => p.id),
      base.id,
      added
    );
  });
  selection.set(new Set(added.map((it) => it.id)));
  if (added.length === 0) addToast('Nothing is left of the shapes');
}
