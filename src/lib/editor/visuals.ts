import { get } from 'svelte/store';
import type { Item, Layer, Mat } from '$lib/core/types';
import { itemBounds } from '$lib/core/items';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { multiply, rotate, scale, translate } from '$lib/core/mat';
import { insertKeyframe } from '$lib/anim/timeline';
import { resolveItems } from '$lib/render/frame';
import { activeLayer, addToast, selection } from '$lib/stores/app';
import { editor } from './editor';
import { makeChart, makeVisual } from '$lib/studio/visuals';

// visuals in the editor: put one on the stage, animate what is picked with a ready move. every move is
// keyframes on the layer of the item, so it can be changed on the timeline afterwards

export type Move = 'pop' | 'fade' | 'slide' | 'drive' | 'spin' | 'pulse' | 'shake' | 'float' | 'explode' | 'grow' | 'out';

export const MOVES: { id: Move; label: string; seconds: number }[] = [
  { id: 'pop', label: 'Pop in', seconds: 0.4 },
  { id: 'fade', label: 'Fade in', seconds: 0.4 },
  { id: 'slide', label: 'Slide in', seconds: 0.5 },
  { id: 'drive', label: 'Drive across', seconds: 2.5 },
  { id: 'spin', label: 'Spin', seconds: 1.5 },
  { id: 'pulse', label: 'Pulse', seconds: 1.5 },
  { id: 'shake', label: 'Shake', seconds: 0.6 },
  { id: 'float', label: 'Float', seconds: 2 },
  { id: 'explode', label: 'Burst', seconds: 0.7 },
  { id: 'grow', label: 'Grow bars', seconds: 1.2 },
  { id: 'out', label: 'Fade out', seconds: 0.4 }
];

// the layer new things go on: the active one if it takes drawings, else the top drawing layer
function targetLayer(): Layer | null {
  const layers = editor.currentLayers();
  const active = editor.activeLayer();
  if (active && active.type === 'normal' && !active.locked) return active;
  return [...layers].reverse().find((l) => l.type === 'normal' && !l.locked && !l.parent) ?? null;
}

function place(item: Item): string | null {
  const layer = targetLayer();
  if (!layer) {
    addToast('Pick a layer to draw on first', 'info');
    return null;
  }
  const at = editor.frame;
  const id = layer.id;
  editor.commit(`Add ${item.name}`, (draft) => {
    const l = editor.draftLayers(draft).find((x) => x.id === id);
    if (!l) return;
    const k = insertKeyframe(l, at);
    k.items.push(item);
  });
  activeLayer.set(id);
  selection.set(new Set([item.id]));
  return item.id;
}

export function insertVisual(id: string): string | null {
  const doc = editor.doc;
  const item = makeVisual(id, { x: doc.width / 2, y: doc.height * 0.45 }, doc.width / 1080);
  return item ? place(item) : null;
}

export function insertChart(kind: 'bars' | 'pie', values: number[], labels: string[]): string | null {
  const doc = editor.doc;
  return place(makeChart(kind, values, labels, { x: doc.width / 2, y: doc.height * 0.42 }, (doc.width / 1080) * 1.4));
}

// a transform turned and scaled about a point of its parent space
function about(m: Mat, c: { x: number; y: number }, s: number, r = 0, dx = 0, dy = 0): Mat {
  return multiply(translate(c.x + dx, c.y + dy), multiply(rotate(r), multiply(scale(s), multiply(translate(-c.x, -c.y), m))));
}

interface Step {
  at: number;
  ease: string | null;
  set: (item: Item) => Item;
}

function steps(move: Move, item: Item, fps: number, width: number, seconds: number): Step[] {
  const m = item.transform;
  const box = itemBounds(item, m);
  const c = isEmpty(box) ? { x: m[4], y: m[5] } : boxCenter(box);
  const f = (s: number) => Math.max(1, Math.round(s * fps));
  const T = (s: number, r = 0, dx = 0, dy = 0) => (i: Item): Item => ({ ...i, transform: about(m, c, s, r, dx, dy) });
  const O = (o: number, s = 1) => (i: Item): Item => ({ ...i, opacity: o, transform: about(m, c, s) });
  const total = f(seconds);
  switch (move) {
    case 'pop':
      return [
        { at: 0, ease: 'out', set: T(0.05) },
        { at: Math.round(total * 0.65), ease: 'inout', set: T(1.12) },
        { at: total, ease: null, set: T(1) }
      ];
    case 'fade':
      return [
        { at: 0, ease: 'inout', set: O(0) },
        { at: total, ease: null, set: O(1) }
      ];
    case 'out':
      return [
        { at: 0, ease: 'inout', set: O(1) },
        { at: total, ease: null, set: O(0) }
      ];
    case 'slide': {
      const off = (box.maxX - box.minX || 200) + c.x + 40;
      return [
        { at: 0, ease: 'out', set: T(1, 0, -off) },
        { at: total, ease: null, set: T(1) }
      ];
    }
    case 'drive': {
      const half = (box.maxX - box.minX || 200) / 2 + 40;
      return [
        { at: 0, ease: 'linear', set: T(1, 0, -half - c.x) },
        { at: total, ease: null, set: T(1, 0, width + half - c.x) }
      ];
    }
    case 'spin':
      return [0, 1, 2, 3, 4].map((i) => ({ at: Math.round((total * i) / 4), ease: i < 4 ? 'linear' : null, set: T(1, (i * Math.PI) / 2) }));
    case 'pulse': {
      const n = Math.max(2, Math.round(total / f(0.25)));
      return Array.from({ length: n + 1 }, (_, i) => ({ at: Math.round((total * i) / n), ease: i < n ? 'inout' : null, set: T(i % 2 ? 1.12 : 1) }));
    }
    case 'shake': {
      const n = Math.max(4, Math.round(total / 2));
      return Array.from({ length: n + 1 }, (_, i) => ({ at: Math.round((total * i) / n), ease: i < n ? 'linear' : null, set: T(1, 0, i === n ? 0 : (i % 2 ? 1 : -1) * 14) }));
    }
    case 'float': {
      const n = 4;
      return Array.from({ length: n + 1 }, (_, i) => ({ at: Math.round((total * i) / n), ease: i < n ? 'inout' : null, set: T(1, 0, 0, i % 2 ? -22 : 0) }));
    }
    case 'explode':
      return [
        { at: 0, ease: 'out', set: O(1, 0.2) },
        { at: Math.round(total * 0.4), ease: 'in', set: O(1, 1.25) },
        { at: total, ease: null, set: O(0, 1.6) }
      ];
    case 'grow': {
      // the bars of a chart grow out of the axis one after the other
      if (item.type !== 'group') return [];
      const bars = item.children.filter((ch) => ch.role === 'bar');
      if (bars.length === 0) return [];
      const base = Math.max(...bars.map((b) => itemBounds(b, b.transform).maxY));
      const grow = (b: Item, s: number): Item => ({ ...b, transform: multiply(translate(0, base * (1 - s)), multiply(scale(1, Math.max(0.001, s)), b.transform)) });
      const keys: Step[] = [];
      const each = Math.max(2, Math.round(total / (bars.length + 1)));
      for (let k = 0; k <= bars.length; k++) {
        keys.push({
          at: k * each,
          ease: k < bars.length ? 'out' : null,
          set: (it) => (it.type === 'group' ? { ...it, children: it.children.map((ch) => (ch.role === 'bar' ? grow(ch, bars.indexOf(ch) < k ? 1 : 0) : ch)) } : it)
        });
      }
      return keys;
    }
  }
}

// a move for the picked items from the playhead on
export function animateSelection(move: Move, seconds?: number): boolean {
  const ids = [...get(selection)];
  if (ids.length === 0) {
    addToast('Pick something on the stage first', 'info');
    return false;
  }
  const at = editor.frame;
  const fps = editor.doc.fps;
  const info = MOVES.find((x) => x.id === move)!;
  const layers = editor.currentLayers();
  let done = 0;
  editor.commit(`Move: ${info.label}`, (draft) => {
    const list = editor.draftLayers(draft);
    for (const id of ids) {
      const src = layers.find((l) => (l.type === 'normal' || l.type === 'guide') && resolveItems(l, at).some((i) => i.id === id));
      const layer = src ? list.find((l) => l.id === src.id) : undefined;
      if (!layer) continue;
      const item = resolveItems(src!, at).find((i) => i.id === id)!;
      const plan = steps(move, item, fps, draft.width, seconds ?? info.seconds);
      if (plan.length === 0) continue;
      for (const s of plan) {
        const k = insertKeyframe(layer, at + s.at);
        k.items = k.items.map((i) => (i.id === id ? s.set(item) : i));
        k.tween = s.ease ? { ease: s.ease } : null;
      }
      const end = at + plan[plan.length - 1].at;
      for (const l of list) if (l.type !== 'folder') l.length = Math.max(l.length, end + 1);
      done++;
    }
  });
  if (!done) addToast(move === 'grow' ? 'Grow works on a bar chart' : 'Nothing to move there', 'info');
  return done > 0;
}
