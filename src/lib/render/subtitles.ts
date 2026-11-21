import type { Doc, Mat } from '$lib/core/types';
import type { Ctx2D } from '$lib/core/style';
import { safeZoneFor } from '$lib/core/comic';
import type { Cue } from '$lib/studio/types';

// the subtitles of a production burnt into the picture: big bold words in the safe zone of a vertical
// video, a dark box behind them, the word being said lit up. drawn over the camera picture, the same in
// the preview and in the video

const SIZES = { small: 0.042, medium: 0.054, large: 0.068 };

// a small label in front of what is not a plain fact, so a guess never reads like one
export const CERTAINTY_TAG: Record<string, string> = {
  estimate: 'Schätzung',
  hypothesis: 'Hypothese',
  interpretation: 'Deutung'
};

export function cueAt(cues: Cue[], frame: number): Cue | null {
  for (const c of cues) if (frame >= c.start && frame < c.end) return c;
  return null;
}

// the lines a text breaks into to fit a width
export function wrap(ctx: Ctx2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// base takes document units to the pixels drawn into
export function drawSubtitles(ctx: Ctx2D, doc: Doc, frame: number, base: Mat) {
  const p = doc.production;
  if (!p || !p.subtitles.shown || p.cues.length === 0) return;
  const cue = cueAt(p.cues, frame);
  if (!cue) return;
  const st = p.subtitles;
  const safe = safeZoneFor(doc.width, doc.height) ?? { top: doc.height * 0.08, bottom: doc.height * 0.2, left: doc.width * 0.06, right: doc.width * 0.1 };
  const size = doc.width * SIZES[st.size];
  const maxWidth = doc.width - safe.left - safe.right;
  ctx.save();
  ctx.setTransform(base[0], 0, 0, base[3], base[4], base[5]);
  ctx.font = `800 ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const lines = wrap(ctx, cue.text, maxWidth - size);
  const lineH = size * 1.22;
  const blockH = lines.length * lineH;
  const free = doc.height - safe.top - safe.bottom - blockH;
  const bottom = doc.height - safe.bottom - free * Math.max(0, Math.min(1, st.position));
  const top = bottom - blockH;
  const cx = safe.left + maxWidth / 2;
  // pop: the block grows in over the first frames
  const age = frame - cue.start;
  const pop = st.animation === 'pop' ? Math.min(1, 0.7 + age * 0.1) : 1;
  ctx.translate(cx, top + blockH / 2);
  ctx.scale(pop, pop);
  ctx.translate(-cx, -(top + blockH / 2));
  const tag = cue.certainty ? CERTAINTY_TAG[cue.certainty] : undefined;
  if (st.box) {
    const gapW = Math.max(ctx.measureText(' ').width, size * 0.32);
    const widest = Math.max(...lines.map((l) => l.split(' ').reduce((n, w) => n + ctx.measureText(w).width, 0) + gapW * (l.split(' ').length - 1)));
    ctx.fillStyle = 'rgba(20, 18, 17, 0.62)';
    roundRect(ctx, cx - widest / 2 - size * 0.45, top - size * 0.25, widest + size * 0.9, blockH + size * 0.5, size * 0.3);
    ctx.fill();
  }
  if (tag) {
    ctx.save();
    ctx.font = `700 ${size * 0.5}px Inter, Arial, sans-serif`;
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = '#f2c14e';
    roundRect(ctx, cx - tw / 2 - size * 0.25, top - size * 0.95, tw + size * 0.5, size * 0.62, size * 0.2);
    ctx.fill();
    ctx.fillStyle = '#1d1b19';
    ctx.textAlign = 'center';
    ctx.fillText(tag, cx, top - size * 0.64);
    ctx.restore();
  }
  // the word being said, evenly through the cue
  const all = cue.text.split(/\s+/).filter(Boolean);
  const said = Math.min(all.length - 1, Math.floor(((frame - cue.start) / Math.max(1, cue.end - cue.start)) * all.length));
  let index = 0;
  ctx.lineJoin = 'round';
  for (const [i, line] of lines.entries()) {
    const y = top + lineH * (i + 0.5);
    const ws = line.split(' ');
    // a clear gap between words, the lit one grows a little and must not touch its neighbours
    const gap = Math.max(ctx.measureText(' ').width, size * 0.32);
    const width = ws.reduce((n, w) => n + ctx.measureText(w).width, 0) + gap * (ws.length - 1);
    let x = cx - width / 2;
    for (const w of ws) {
      const lit = st.animation !== 'none' && index === said;
      const ww = ctx.measureText(w).width;
      ctx.save();
      if (lit && st.animation === 'words') {
        ctx.translate(x + ww / 2, y);
        ctx.scale(1.08, 1.08);
        ctx.translate(-(x + ww / 2), -y);
      }
      ctx.strokeStyle = '#1d1b19';
      ctx.lineWidth = size * 0.16;
      ctx.strokeText(w, x, y);
      ctx.fillStyle = lit ? st.highlight : '#ffffff';
      ctx.fillText(w, x, y);
      ctx.restore();
      x += ww + gap;
      index++;
    }
  }
  ctx.restore();
}
