import type { Doc, Mat } from '$lib/core/types';
import { applyPoint, multiply, scale } from '$lib/core/mat';
import { editor } from './editor';

export interface DocPreset {
  label: string;
  width: number;
  height: number;
  fps: number;
}

// the sizes a new document starts from, custom fields cover the rest
export const DOC_PRESETS: DocPreset[] = [
  { label: 'Full HD video', width: 1920, height: 1080, fps: 24 },
  { label: 'Square post', width: 1080, height: 1080, fps: 30 },
  { label: 'HD video', width: 1280, height: 720, fps: 24 },
  { label: 'Print, A4 at 300 dpi', width: 2480, height: 3508, fps: 24 }
];

export const MAX_SIDE = 16000;

// fits the old stage into the new one in proportion, centered
export function fitMatrix(fromW: number, fromH: number, toW: number, toH: number): Mat {
  const k = Math.min(toW / fromW, toH / fromH);
  return [k, 0, 0, k, (toW - fromW * k) / 2, (toH - fromH * k) / 2];
}

// moves and scales everything on the main timeline by m, a uniform scale with a move. bones keep
// their bind so bound drawings follow them as before, symbols scale through their instances
export function scaleContent(doc: Doc, m: Mat) {
  const k = m[0];
  if (!(k > 0)) return;
  for (const layer of doc.layers) {
    for (const key of layer.keyframes) {
      for (const item of key.items) item.transform = multiply(m, item.transform);
      for (const pose of Object.values(key.pose)) {
        pose.x *= k;
        pose.y *= k;
      }
    }
    for (const bone of layer.bones) {
      if (bone.parent === null) {
        const p = applyPoint(m, bone);
        bone.x = p.x;
        bone.y = p.y;
      } else {
        bone.x *= k;
        bone.y *= k;
      }
      bone.length *= k;
      bone.radius *= k;
      bone.bind = multiply(multiply(m, bone.bind), scale(1 / k));
    }
  }
  doc.guides = { h: doc.guides.h.map((y) => y * k + m[5]), v: doc.guides.v.map((x) => x * k + m[4]) };
}

export interface DocSettings {
  name: string;
  width: number;
  height: number;
  fps: number;
  bg: string;
  // the drawings grow or shrink with the stage
  scaleContent: boolean;
}

function side(v: number): number {
  return Math.max(1, Math.min(MAX_SIDE, Math.round(v)));
}

// the document settings dialog as one undo step
export function applyDocSettings(s: DocSettings) {
  const width = side(s.width);
  const height = side(s.height);
  editor.commit('Document settings', (draft) => {
    if (s.scaleContent && (width !== draft.width || height !== draft.height)) {
      scaleContent(draft, fitMatrix(draft.width, draft.height, width, height));
    }
    draft.name = s.name.trim() || draft.name;
    draft.width = width;
    draft.height = height;
    draft.fps = Math.max(1, Math.min(120, Math.round(s.fps)));
    draft.bg = s.bg;
  });
}
