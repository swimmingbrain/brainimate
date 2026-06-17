import { get } from 'svelte/store';
import type { GroupItem, Item, Paint } from '$lib/core/types';
import { clonePaint, solid } from '$lib/core/style';
import { around, compose, decompose, identity, invert, multiply, rotate, scale } from '$lib/core/mat';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { closePath, reversePath } from '$lib/core/path';
import { cloneItem, parentMatrix } from '$lib/core/items';
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
      if (item.type === 'path') reversePath(item.path);
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
    const target = editor.draftFind(draft, top.id);
    if (!target) return;
    const list = target.list;
    // the slot of the topmost item once the ones below it in the same list are gone
    let index = target.index;
    for (const it of items) {
      const found = editor.draftFind(draft, it.id);
      if (found && found.list === list && found.index < target.index) index--;
    }
    for (const it of items) {
      const found = editor.draftFind(draft, it.id);
      if (found) found.list.splice(found.index, 1);
    }
    list.splice(index, 0, group);
  });
  select([group.id]);
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
      const group = found.item;
      const kids = group.children.map((child) => {
        const k = cloneItem(child);
        k.transform = multiply(group.transform, child.transform);
        k.opacity = child.opacity * group.opacity;
        if (k.blend === 'normal') k.blend = group.blend;
        return k;
      });
      found.list.splice(found.index, 1, ...kids);
      ids.push(...kids.map((k) => k.id));
    }
  });
  selection.set(new Set(ids));
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
