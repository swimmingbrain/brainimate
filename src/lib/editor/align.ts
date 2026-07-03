import { get, writable } from 'svelte/store';
import type { Vec } from '$lib/core/types';
import { boxCenter, boxHeight, boxWidth, emptyBox, fromRect, isEmpty, union, type Box } from '$lib/core/bbox';
import { addToast } from '$lib/stores/app';
import { editor } from './editor';
import { translateItems } from './selection';

export type AlignHow = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeHow = 'hcenters' | 'vcenters' | 'hspace' | 'vspace';

// line up with the stage instead of the box around the selection
export const alignToStage = writable(false);

const LABELS: Record<AlignHow | DistributeHow, string> = {
  left: 'Align left',
  hcenter: 'Align centers',
  right: 'Align right',
  top: 'Align top',
  vcenter: 'Align middles',
  bottom: 'Align bottom',
  hcenters: 'Distribute centers',
  vcenters: 'Distribute middles',
  hspace: 'Distribute spacing',
  vspace: 'Distribute spacing'
};

// how far each box moves to line up with the edge or middle of to
export function alignMoves(boxes: Box[], how: AlignHow, to: Box): Vec[] {
  const c = boxCenter(to);
  return boxes.map((b) => {
    const m = boxCenter(b);
    switch (how) {
      case 'left':
        return { x: to.minX - b.minX, y: 0 };
      case 'hcenter':
        return { x: c.x - m.x, y: 0 };
      case 'right':
        return { x: to.maxX - b.maxX, y: 0 };
      case 'top':
        return { x: 0, y: to.minY - b.minY };
      case 'vcenter':
        return { x: 0, y: c.y - m.y };
      default:
        return { x: 0, y: to.maxY - b.maxY };
    }
  });
}

// spreads the boxes over span: their middles evenly, or the gaps between them all the same,
// without a span the first and the last box stay where they are
export function distributeMoves(boxes: Box[], how: DistributeHow, span: Box | null = null): Vec[] {
  const horizontal = how === 'hcenters' || how === 'hspace';
  const lo = (b: Box) => (horizontal ? b.minX : b.minY);
  const size = (b: Box) => (horizontal ? boxWidth(b) : boxHeight(b));
  const mid = (b: Box) => lo(b) + size(b) / 2;
  const moves: Vec[] = boxes.map(() => ({ x: 0, y: 0 }));
  if (boxes.length < 2 || (boxes.length < 3 && !span)) return moves;
  const order = boxes.map((_, i) => i).sort((a, b) => mid(boxes[a]) - mid(boxes[b]));
  const set = (i: number, d: number) => (moves[i] = horizontal ? { x: d, y: 0 } : { x: 0, y: d });
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  if (how === 'hcenters' || how === 'vcenters') {
    const from = span ? lo(span) + size(first) / 2 : mid(first);
    const to = span ? lo(span) + size(span) - size(last) / 2 : mid(last);
    const step = (to - from) / (order.length - 1);
    order.forEach((i, k) => set(i, from + step * k - mid(boxes[i])));
    return moves;
  }
  const start = span ? lo(span) : lo(first);
  const end = span ? lo(span) + size(span) : lo(last) + size(last);
  const total = order.reduce((sum, i) => sum + size(boxes[i]), 0);
  const gap = (end - start - total) / (order.length - 1);
  let at = start;
  for (const i of order) {
    set(i, at - lo(boxes[i]));
    at += size(boxes[i]) + gap;
  }
  return moves;
}

function stageBox(): Box {
  return fromRect(0, 0, editor.doc.width, editor.doc.height);
}

function selectedBoxes(): { ids: string[]; boxes: Box[] } {
  const items = editor.selectedItems(false);
  const ids = items.map((it) => it.id);
  return { ids, boxes: ids.map((id) => editor.itemWorldBounds(id)) };
}

function apply(ids: string[], moves: Vec[], label: string) {
  const map = new Map<string, Vec>();
  ids.forEach((id, i) => {
    if (moves[i].x !== 0 || moves[i].y !== 0) map.set(id, moves[i]);
  });
  translateItems(map, label);
}

// a single item always lines up with the stage
export function alignSelection(how: AlignHow) {
  const { ids, boxes } = selectedBoxes();
  if (ids.length === 0) return;
  let to = emptyBox();
  for (const b of boxes) to = union(to, b);
  if (get(alignToStage) || ids.length === 1) to = stageBox();
  if (isEmpty(to)) return;
  apply(ids, alignMoves(boxes, how, to), LABELS[how]);
}

export function distributeSelection(how: DistributeHow) {
  const { ids, boxes } = selectedBoxes();
  const toStage = get(alignToStage);
  if (ids.length < (toStage ? 2 : 3)) {
    addToast(toStage ? 'Select two items or more' : 'Select three items or more');
    return;
  }
  apply(ids, distributeMoves(boxes, how, toStage ? stageBox() : null), LABELS[how]);
}
