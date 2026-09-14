import type { Anchor, Item, Layer, PathData, PathItem } from '$lib/core/types';
import { makePathItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { activeLayer } from '$lib/stores/app';
import { LAYER_COLORS, editor, makeLayer } from './editor';

// a heavy document to measure the stage with, only the dev build offers it

const FILLS = ['#e06c75', '#d19a66', '#e5c07b', '#98c379', '#56b6c2', '#61afef', '#c678dd', '#be5046'];

// the same numbers every time, so two measurements see the same drawing
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a closed wobbly blob with smooth handles around cx, cy
function blob(rand: () => number, cx: number, cy: number, r: number): PathData {
  const n = 6 + Math.floor(rand() * 5);
  const anchors: Anchor[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = r * (0.7 + rand() * 0.6);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    // the handles run along the circle, a third of the way to the next anchor
    const h = (d * Math.PI * 2) / n / 3;
    const tx = -Math.sin(a) * h;
    const ty = Math.cos(a) * h;
    anchors.push({ x, y, ix: -tx, iy: -ty, ox: tx, oy: ty, kind: 'smooth' });
  }
  return { anchors, closed: true };
}

function moved(item: PathItem, dx: number, dy: number): PathItem {
  const t = item.transform;
  return { ...item, transform: [t[0], t[1], t[2], t[3], t[4] + dx, t[5] + dy] };
}

// count paths spread over layers, every other layer tweens to frame 24, the rest hold there
export function stressLayers(width: number, height: number, count = 600, layers = 6, seed = 7): Layer[] {
  const rand = random(seed);
  const out: Layer[] = [];
  const per = Math.ceil(count / layers);
  for (let l = 0; l < layers; l++) {
    const layer = makeLayer(`Stress ${l + 1}`, LAYER_COLORS[l % LAYER_COLORS.length]);
    const items: PathItem[] = [];
    for (let i = 0; i < per && l * per + i < count; i++) {
      const r = 12 + rand() * 40;
      const path = blob(rand, r + rand() * (width - 2 * r), r + rand() * (height - 2 * r), r);
      const fill = solid(FILLS[Math.floor(rand() * FILLS.length)], 0.6 + rand() * 0.4);
      const stroke = rand() < 0.4 ? solid('#1e1e22') : null;
      items.push(makePathItem('Blob', path, defaultStyle(fill, stroke, 1 + rand() * 3)));
    }
    const dx = (rand() - 0.5) * 200;
    const dy = (rand() - 0.5) * 120;
    const later: Item[] = items.map((it) => moved(it, dx, dy));
    const tween = l % 2 === 0;
    layer.keyframes = [
      { frame: 0, items, pose: {}, tween: tween ? { ease: 'linear' } : null, label: '' },
      { frame: 24, items: later, pose: {}, tween: null, label: '' }
    ];
    layer.length = 48;
    out.push(layer);
  }
  return out;
}

export function insertStressTest() {
  const doc = editor.doc;
  const added = stressLayers(doc.width, doc.height);
  editor.commit('Insert stress test', (draft) => {
    editor.draftLayers(draft).push(...added);
  });
  activeLayer.set(added[added.length - 1].id);
}
