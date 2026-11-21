import { describe, expect, it } from 'vitest';
import type { CameraKey, Keyframe, Layer } from '$lib/core/types';
import { applyPoint } from '$lib/core/mat';
import { makeDoc, makeLayer } from '$lib/editor/editor';
import { migrateDoc } from '$lib/core/migrate';
import {
  cameraKeyAt,
  cameraMatrix,
  cameraStateAt,
  cleanCamera,
  fadeAmount,
  focusCamera,
  layerParallax,
  makeTransition,
  mixCamera,
  presetKeys,
  restCamera,
  slideOffsets,
  transitionAt
} from './camera';

const W = 1080;
const H = 1920;

function cam(patch: Partial<CameraKey> = {}): CameraKey {
  return { ...restCamera(W, H), ...patch };
}

function key(frame: number, camera: CameraKey, ease: string | null = null): Keyframe {
  return { frame, items: [], pose: {}, tween: ease ? { ease } : null, label: '', camera };
}

function cameraLayer(keys: Keyframe[], length = 200): Layer {
  const l = makeLayer('Camera', '#888888', 'camera');
  l.keyframes = keys;
  l.length = length;
  return l;
}

describe('camera keyframes', () => {
  it('show the whole stage without a camera layer', () => {
    expect(cameraKeyAt(null, 10, W, H)).toEqual(restCamera(W, H));
    const s = cameraStateAt(null, 10, 24, W, H);
    expect(cameraMatrix(s, W, H)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('hold without a tween and move with one, eased', () => {
    const near = cam({ x: 300, y: 600, zoom: 2 });
    const held = cameraLayer([key(0, cam()), key(48, near)]);
    expect(cameraKeyAt(held, 24, W, H)).toEqual(cam());
    expect(cameraKeyAt(held, 48, W, H)).toEqual(near);
    const linear = cameraLayer([key(0, cam(), 'linear'), key(48, near)]);
    const half = cameraKeyAt(linear, 24, W, H);
    expect(half.x).toBeCloseTo((540 + 300) / 2);
    expect(half.y).toBeCloseTo((960 + 600) / 2);
    // zoom blends by its ratio: half way from 1 to 2 is the square root of 2
    expect(half.zoom).toBeCloseTo(Math.SQRT2);
    // ease in starts slower than linear, ease out faster
    const easeIn = cameraKeyAt(cameraLayer([key(0, cam(), 'in'), key(48, near)]), 12, W, H);
    const easeOut = cameraKeyAt(cameraLayer([key(0, cam(), 'out'), key(48, near)]), 12, W, H);
    const lin = cameraKeyAt(linear, 12, W, H);
    expect(Math.abs(easeIn.x - 540)).toBeLessThan(Math.abs(lin.x - 540));
    expect(Math.abs(easeOut.x - 540)).toBeGreaterThan(Math.abs(lin.x - 540));
    // after the last keyframe it holds
    expect(cameraKeyAt(linear, 150, W, H)).toEqual(near);
  });

  it('follows the example of the story: wide, slow zoom on a person, left, on an object', () => {
    const fps = 24;
    const person = cam({ x: 700, y: 1100, zoom: 2.2 });
    const left = cam({ x: 400, y: 1100, zoom: 2.2 });
    const thing = cam({ x: 300, y: 1500, zoom: 3 });
    const l = cameraLayer([key(0, cam()), key(2 * fps, cam(), 'inout'), key(4 * fps, person, 'inout'), key(6 * fps, left, 'out'), key(7 * fps, thing)]);
    expect(cameraKeyAt(l, fps, W, H)).toEqual(cam());
    const zooming = cameraKeyAt(l, 3 * fps, W, H);
    expect(zooming.zoom).toBeGreaterThan(1);
    expect(zooming.zoom).toBeLessThan(2.2);
    expect(cameraKeyAt(l, 4 * fps, W, H)).toEqual(person);
    expect(cameraKeyAt(l, 5 * fps, W, H).x).toBeLessThan(700);
    expect(cameraKeyAt(l, 7 * fps, W, H)).toEqual(thing);
  });

  it('cut into a new shot instead of tweening, a camera move flies there over its frames', () => {
    const b = cam({ x: 200, zoom: 3 });
    const cut = cameraLayer([key(0, cam(), 'linear'), key(48, { ...b, transition: makeTransition('fade') })]);
    expect(cameraKeyAt(cut, 47, W, H).x).toBe(540);
    const move = { ...b, transition: { ...makeTransition('camera'), duration: 12 } };
    const flown = cameraLayer([key(0, cam()), key(48, move)]);
    expect(cameraKeyAt(flown, 35, W, H).x).toBe(540);
    const mid = cameraKeyAt(flown, 42, W, H);
    expect(mid.x).toBeLessThan(540);
    expect(mid.x).toBeGreaterThan(200);
    expect(cameraKeyAt(flown, 48, W, H).x).toBe(200);
  });

  it('mixes values and keeps the transition of where it starts', () => {
    const a = cam({ transition: makeTransition('cut') });
    expect(mixCamera(a, cam({ x: 0 }), 0)).toBe(a);
    expect(mixCamera(a, cam({ x: 0 }), 1).transition).toEqual(a.transition);
  });
});

describe('the camera matrix', () => {
  it('puts the point it looks at in the middle, zoomed and turned', () => {
    const m = cameraMatrix({ x: 300, y: 500, zoom: 2, rotation: 0 }, W, H);
    expect(applyPoint(m, { x: 300, y: 500 })).toEqual({ x: 540, y: 960 });
    // one stage pixel is two video pixels
    const p = applyPoint(m, { x: 310, y: 500 });
    expect(p.x).toBeCloseTo(560);
    const turned = cameraMatrix({ x: 540, y: 960, zoom: 1, rotation: Math.PI / 2 }, W, H);
    // the picture turns against the camera
    const q = applyPoint(turned, { x: 640, y: 960 });
    expect(q.x).toBeCloseTo(540);
    expect(q.y).toBeCloseTo(860);
  });

  it('moves layers by their parallax: further back slower, in front faster, 0 not at all', () => {
    const c = { x: 740, y: 960, zoom: 1.5, rotation: 0.1 };
    const shift = (depth: number) => applyPoint(cameraMatrix(c, W, H, depth), { x: 540, y: 960 }).x - 540;
    const back = shift(0.3);
    const normal = shift(1);
    const front = shift(1.6);
    expect(Math.abs(back)).toBeLessThan(Math.abs(normal));
    expect(Math.abs(front)).toBeGreaterThan(Math.abs(normal));
    expect(cameraMatrix(c, W, H, 0)).toEqual([1, 0, 0, 1, 0, 0]);
    // a layer further back zooms less
    const zoomOf = (m: number[]) => Math.hypot(m[0], m[1]);
    expect(zoomOf(cameraMatrix(c, W, H, 0.5))).toBeCloseTo(Math.pow(1.5, 0.5));
  });

  it('takes the parallax of a layer, or of its folder, or 1', () => {
    const doc = makeDoc(W, H, 24);
    const folder = makeLayer('Back', '#000000', 'folder');
    folder.parallax = 0.4;
    const inside = makeLayer('Hills', '#000000');
    inside.parent = folder.id;
    const own = makeLayer('Sky', '#000000');
    own.parent = folder.id;
    own.parallax = 0.1;
    const plain = makeLayer('Hero', '#000000');
    const wild = makeLayer('Bad', '#000000');
    wild.parallax = 99;
    doc.layers = [folder, inside, own, plain, wild];
    expect(layerParallax(doc.layers, inside)).toBe(0.4);
    expect(layerParallax(doc.layers, own)).toBe(0.1);
    expect(layerParallax(doc.layers, plain)).toBe(1);
    expect(layerParallax(doc.layers, wild)).toBe(4);
  });
});

describe('shake and bob', () => {
  it('are the same every time for a frame, so the export matches the preview', () => {
    const l = cameraLayer([key(0, cam({ shake: 12, bob: 16 }))]);
    const a = cameraStateAt(l, 37, 24, W, H);
    const b = cameraStateAt(l, 37, 24, W, H);
    expect(a).toEqual(b);
    // it does move, a little
    const moved = [10, 20, 30, 40].map((f) => cameraStateAt(l, f, 24, W, H));
    expect(new Set(moved.map((m) => m.y.toFixed(3))).size).toBeGreaterThan(1);
    for (const m of moved) {
      expect(Math.abs(m.x - 540)).toBeLessThan(40);
      expect(Math.abs(m.y - 960)).toBeLessThan(40);
      expect(Math.abs(m.rotation)).toBeLessThan(0.05);
    }
  });

  it('shake the same on the video close up, the stage offset shrinks with the zoom', () => {
    const wide = cameraLayer([key(0, cam({ shake: 10 }))]);
    const close = cameraLayer([key(0, cam({ shake: 10, zoom: 4 }))]);
    const dw = cameraStateAt(wide, 13, 24, W, H).x - 540;
    const dc = cameraStateAt(close, 13, 24, W, H).x - 540;
    expect(dc * 4).toBeCloseTo(dw);
  });
});

describe('transitions', () => {
  it('fade through the color around the keyframe, fully covered in the middle', () => {
    const fade = { ...makeTransition('fade'), duration: 12 };
    const l = cameraLayer([key(0, cam()), key(48, cam({ transition: fade }))]);
    expect(transitionAt(l, 40)).toBeNull();
    const before = transitionAt(l, 44)!;
    const after = transitionAt(l, 50)!;
    expect(before.at).toBe(48);
    expect(fadeAmount(before.p)).toBeGreaterThan(0.3);
    expect(fadeAmount(transitionAt(l, 47)!.p)).toBeGreaterThan(0.85);
    expect(fadeAmount(transitionAt(l, 48)!.p)).toBeGreaterThan(0.85);
    expect(fadeAmount(after.p)).toBeLessThan(fadeAmount(transitionAt(l, 48)!.p));
    expect(transitionAt(l, 54)).toBeNull();
  });

  it('fade in on the first frame', () => {
    const l = cameraLayer([key(0, cam({ transition: { ...makeTransition('fade'), duration: 10 } }))]);
    expect(fadeAmount(transitionAt(l, 0)!.p)).toBeGreaterThan(0.9);
    expect(fadeAmount(transitionAt(l, 9)!.p)).toBeLessThan(0.1);
    expect(transitionAt(l, 10)).toBeNull();
  });

  it('blend, zoom and slide over the frames after the keyframe, a cut and a move draw nothing', () => {
    for (const kind of ['crossfade', 'zoom', 'slide'] as const) {
      const l = cameraLayer([key(0, cam()), key(30, cam({ transition: { ...makeTransition(kind), duration: 10 } }))]);
      expect(transitionAt(l, 29)).toBeNull();
      expect(transitionAt(l, 30)!.p).toBeCloseTo(0.05);
      expect(transitionAt(l, 39)!.p).toBeCloseTo(0.95);
      expect(transitionAt(l, 40)).toBeNull();
    }
    for (const kind of ['cut', 'camera'] as const) {
      const l = cameraLayer([key(0, cam()), key(30, cam({ transition: makeTransition(kind) }))]);
      for (let f = 0; f < 60; f++) expect(transitionAt(l, f)).toBeNull();
    }
    // nothing came before the first frame to blend from
    expect(transitionAt(cameraLayer([key(0, cam({ transition: makeTransition('crossfade') }))]), 2)).toBeNull();
  });

  it('slide the old shot out and the new one in from the other side', () => {
    const start = slideOffsets('left', 0);
    const done = slideOffsets('left', 1);
    expect(start.old.x).toBeCloseTo(0);
    expect(start.fresh.x).toBeCloseTo(1);
    expect(done.old.x).toBeCloseTo(-1);
    expect(done.fresh.x).toBeCloseTo(0);
    expect(slideOffsets('up', 1).old.y).toBeCloseTo(-1);
  });
});

describe('presets', () => {
  const base = { at: 24, frames: 48, fps: 24, width: W, height: H, strength: 1 };

  it('put down keyframes from the camera as it is, with eases toward the next', () => {
    const from = cam({ x: 600, zoom: 1.2 });
    const push = presetKeys('push', from, { ...base, target: { x: 300, y: 700 } });
    expect(push.map((k) => k.frame)).toEqual([24, 72]);
    expect(push[0].camera).toEqual({ ...from, transition: null });
    expect(push[0].ease).toBe('inout');
    expect(push[1].camera.zoom).toBeCloseTo(1.5);
    expect(push[1].camera.x).toBeLessThan(600);
    const left = presetKeys('pan-left', from, base);
    const right = presetKeys('pan-right', from, base);
    expect(left[1].camera.x).toBeLessThan(600);
    expect(right[1].camera.x).toBeGreaterThan(600);
    // a stronger pan goes further, the ease can be picked
    expect(presetKeys('pan-right', from, { ...base, strength: 2, ease: 'linear' })[1].camera.x).toBeGreaterThan(right[1].camera.x);
    expect(presetKeys('pan-right', from, { ...base, ease: 'linear' })[0].ease).toBe('linear');
  });

  it('walk with the bob of the steps and settle, shake by hand, look both ways and come back', () => {
    const walk = presetKeys('walk', cam(), base);
    expect(walk[0].camera.bob).toBeGreaterThan(0);
    expect(walk[walk.length - 1].camera.bob).toBe(0);
    expect(walk[1].camera.zoom).toBeGreaterThan(1);
    const shake = presetKeys('handheld', cam(), base);
    expect(shake[0].camera.shake).toBeGreaterThan(0);
    expect(shake[shake.length - 1].camera.shake).toBe(0);
    const look = presetKeys('look', cam(), base);
    expect(look).toHaveLength(4);
    expect(look[1].camera.x).toBeLessThan(540);
    expect(look[2].camera.x).toBeGreaterThan(540);
    expect(look[3].camera).toEqual(look[0].camera);
  });

  it('pull focus onto a target and track one along its way', () => {
    const focus = presetKeys('focus', cam(), { ...base, target: { x: 200, y: 300, zoom: 4 } });
    expect(focus[1].camera).toMatchObject({ x: 200, y: 300, zoom: 4 });
    const track = presetKeys('track', cam(), {
      ...base,
      track: [
        { frame: 24, x: 100, y: 100 },
        { frame: 48, x: 200, y: 150 },
        { frame: 72, x: 300, y: 200 },
        { frame: 99, x: 999, y: 999 }
      ]
    });
    expect(track.map((k) => [k.frame, k.camera.x])).toEqual([
      [24, 100],
      [48, 200],
      [72, 300]
    ]);
    expect(track[2].ease).toBeNull();
  });

  it('fit the box of a target with air around it', () => {
    const f = focusCamera({ minX: 100, minY: 100, maxX: 300, maxY: 500 }, W, H, 0.25);
    expect(f.x).toBe(200);
    expect(f.y).toBe(300);
    expect(f.zoom).toBeCloseTo(Math.min(1080 / 250, 1920 / 500));
  });
});

describe('reading camera data', () => {
  it('cleans numbers and transitions and keeps one camera on the main timeline', () => {
    expect(cleanCamera(null, W, H)).toEqual(restCamera(W, H));
    const c = cleanCamera({ x: 'a', y: 5, zoom: 900, shake: -3, transition: { kind: 'wipe' } }, W, H);
    expect(c).toMatchObject({ x: 540, y: 5, zoom: 20, shake: 0, transition: null });
    const t = cleanCamera({ transition: { kind: 'slide', duration: 7.6, direction: 'sideways', color: 'red' } }, W, H).transition;
    expect(t).toEqual({ kind: 'slide', duration: 8, direction: 'left', color: '#000000' });

    const doc = makeDoc(W, H, 24);
    const one = makeLayer('Camera', '#888888', 'camera');
    one.keyframes[0].camera = { zoom: 'x' } as unknown as CameraKey;
    const two = makeLayer('Camera 2', '#888888', 'camera');
    const drawing = makeLayer('Art', '#888888');
    (drawing.keyframes[0] as Keyframe).camera = cam();
    drawing.parallax = NaN;
    doc.layers = [drawing, one, two];
    doc.symbols = { s: { id: 's', name: 'S', kind: 'graphic', layers: [makeLayer('Cam', '#000000', 'camera'), makeLayer('L', '#000000')] } };
    const out = migrateDoc(doc);
    expect(out.layers.map((l) => l.name)).toEqual(['Art', 'Camera']);
    expect(out.layers[1].keyframes[0].camera).toEqual(restCamera(W, H));
    expect(out.layers[0].keyframes[0].camera).toBeUndefined();
    expect(out.layers[0].parallax).toBeUndefined();
    expect(out.symbols.s.layers.map((l) => l.name)).toEqual(['L']);
  });
});
