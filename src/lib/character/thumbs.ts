import type { Item, Layer } from '$lib/core/types';
import { makeLayer } from '$lib/editor/editor';
import { joints3d, buildView, type CharacterModel } from './views';

// small pictures of a turnable character from every side for the turnaround editor, drawn with the
// renderer of the stage. light: one canvas reused, a few thousand pixels each

let canvas: HTMLCanvasElement | null = null;

function unbound(items: Item[]): Item[] {
  return items.map((i) => ({ ...i, skin: null, ...(i.type === 'group' ? { children: unbound(i.children) } : {}) }) as Item);
}

export async function viewThumbs(m: CharacterModel, angles: number[], w = 64, h = 112): Promise<string[]> {
  if (typeof document === 'undefined') return angles.map(() => '');
  const { renderLayers } = await import('$lib/render/renderer');
  canvas ??= document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return angles.map(() => '');
  const top = m.ground - joints3d(m).headTop[2] - m.height * 0.06;
  const k = h / (m.ground - top + m.height * 0.03);
  const out: string[] = [];
  for (const a of angles) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const layer: Layer = makeLayer('Thumb', '#000');
    layer.keyframes[0].items = unbound(buildView(m, { body: a, head: a }, { emotion: 'neutral', mouth: 'closed', blink: false }, (r, c) => `t.${r}.${c ?? ''}`));
    renderLayers(ctx, [layer], [k, 0, 0, k, w / 2 - m.x * k, -top * k], { frame: 0, outline: false, assets: {} });
    out.push(canvas.toDataURL('image/png'));
  }
  return out;
}
