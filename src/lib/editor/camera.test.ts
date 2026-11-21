import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import {
  addCamera,
  applyPreset,
  cameraHere,
  cameraLayer,
  cameraShots,
  focusSelection,
  keyCamera,
  previewScaleFor,
  sceneDepth,
  setCamera,
  setCameraEase,
  setParallax,
  setTransition,
  showingCamera,
  cameraView
} from './camera';
import { comicSceneLayers } from './layers';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate, applyPoint } from '$lib/core/mat';
import { frame, playing, selection } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';
import { insertKeyframe, docLength } from '$lib/anim/timeline';
import { cameraLayerMatrix } from '$lib/render/camera';
import { packDoc, parseBytes } from '$lib/io/project';

function rect(x: number, y: number, size = 100) {
  return makePathItem('Box', rectPath(0, 0, size, size), defaultStyle(), translate(x, y));
}

describe('the camera in the editor', () => {
  beforeEach(() => {
    editor.newDoc(1080, 1920, 24);
    editor.doc.layers = comicSceneLayers();
    editor.loadDoc(editor.doc);
    setGroup('timeline', { autoKey: true });
    frame.set(0);
    selection.set(new Set());
    cameraView.set(false);
  });

  it('is added once, on top, looking at the whole stage, in one undo step', () => {
    expect(cameraLayer()).toBeNull();
    addCamera();
    const cam = cameraLayer()!;
    expect(cam.type).toBe('camera');
    expect(editor.doc.layers[editor.doc.layers.length - 1]).toBe(cam);
    expect(cam.keyframes[0].camera).toMatchObject({ x: 540, y: 960, zoom: 1 });
    addCamera();
    expect(editor.doc.layers.filter((l) => l.type === 'camera')).toHaveLength(1);
    editor.undo();
    expect(cameraLayer()).toBeNull();
  });

  it('keys a change at the playhead with auto key and holds before it', () => {
    addCamera();
    frame.set(48);
    setCamera({ zoom: 2, x: 300 });
    const cam = cameraLayer()!;
    expect(cam.keyframes.map((k) => k.frame)).toEqual([0, 48]);
    expect(cameraHere()).toMatchObject({ zoom: 2, x: 300 });
    frame.set(24);
    expect(cameraHere().zoom).toBe(1);
    // an ease on the keyframe before makes it a move
    setCameraEase('inout');
    expect(cameraLayer()!.keyframes[0].tween).toEqual({ ease: 'inout' });
    expect(cameraHere().zoom).toBeCloseTo(Math.SQRT2);
    setCameraEase(null);
    expect(cameraHere().zoom).toBe(1);
    // the steps of one drag make one undo step
    frame.set(48);
    setCamera({ x: 310 }, 'Move camera', 'drag-1');
    setCamera({ x: 320 }, 'Move camera', 'drag-1');
    editor.undo();
    expect(cameraHere().x).toBe(300);
  });

  it('copies where it looks into a keyframe made in the middle of a move', () => {
    addCamera();
    frame.set(48);
    setCamera({ zoom: 4 });
    frame.set(0);
    setCameraEase('linear');
    frame.set(24);
    keyCamera();
    const mid = cameraLayer()!.keyframes.find((k) => k.frame === 24)!;
    expect(mid.camera!.zoom).toBeCloseTo(2);
    expect(mid.camera!.transition).toBeNull();
    // the timeline keyframe keys on the camera layer do the same
    editor.commit('Key', (d) => {
      insertKeyframe(d.layers.find((l) => l.type === 'camera')!, 12);
    });
    expect(cameraLayer()!.keyframes.find((k) => k.frame === 12)!.camera!.zoom).toBeGreaterThan(1);
  });

  it('starts a shot with a transition and lists the shots', () => {
    addCamera();
    frame.set(60);
    setTransition('crossfade');
    setTransition('crossfade', { duration: 20 });
    const k = cameraLayer()!.keyframes.find((f) => f.frame === 60)!;
    expect(k.camera!.transition).toMatchObject({ kind: 'crossfade', duration: 20 });
    setTransition('fade', { color: '#ffffff' });
    expect(cameraLayer()!.keyframes.find((f) => f.frame === 60)!.camera!.transition).toMatchObject({ kind: 'fade', color: '#ffffff' });
    expect(cameraShots().map((s) => [s.frame, s.kind])).toEqual([
      [0, null],
      [60, 'fade']
    ]);
    setTransition(null);
    expect(cameraLayer()!.keyframes.find((f) => f.frame === 60)!.camera!.transition).toBeNull();
  });

  it('puts a preset down from the playhead and keeps the scene under the move', () => {
    const chars = editor.doc.layers.find((l) => l.name === 'Characters')!;
    editor.insertItem(chars.id, rect(100, 100));
    frame.set(12);
    expect(applyPreset({ kind: 'pan-right', seconds: 2, strength: 1, ease: '' })).toBe(true);
    const cam = cameraLayer()!;
    expect(cam.keyframes.map((k) => k.frame)).toEqual([0, 12, 60]);
    expect(cam.keyframes[1].tween).toEqual({ ease: 'inout' });
    expect(cam.keyframes[2].camera!.x).toBeGreaterThan(540);
    // every layer reaches the end of the move, so the drawing stays in view
    expect(docLength(editor.doc)).toBe(61);
    expect(editor.doc.layers.find((l) => l.name === 'Characters')!.length).toBe(61);
    // a focus pull needs something picked
    expect(applyPreset({ kind: 'focus', seconds: 1, strength: 1, ease: '' })).toBe(false);
    editor.undo();
    expect(cameraLayer()!.keyframes.map((k) => k.frame)).toEqual([0]);
  });

  it('tracks a picked object along its way and frames the selection', () => {
    const chars = editor.doc.layers.find((l) => l.name === 'Characters')!;
    const box = rect(100, 800);
    editor.insertItem(chars.id, box);
    // it moves to the right over two seconds: a keyframe at 48 with the box further right, tweened
    editor.commit('Move', (d) => {
      const layer = d.layers.find((l) => l.name === 'Characters')!;
      const k = insertKeyframe(layer, 48);
      k.items[0].transform = translate(700, 800);
      layer.keyframes[0].tween = { ease: 'linear' };
    });
    frame.set(0);
    selection.set(new Set([box.id]));
    expect(applyPreset({ kind: 'track', seconds: 2, strength: 1, ease: '' })).toBe(true);
    const keys = cameraLayer()!.keyframes;
    expect(keys.length).toBeGreaterThan(4);
    const xs = keys.map((k) => k.camera!.x);
    expect(xs[0]).toBeCloseTo(150);
    expect(xs[xs.length - 1]).toBeCloseTo(750);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    frame.set(0);
    focusSelection();
    expect(cameraHere()).toMatchObject({ x: 150, y: 850 });
    expect(cameraHere().zoom).toBeGreaterThan(5);
  });

  it('sets the depth of layers and of the comic scene, and films each through it', () => {
    addCamera();
    setCamera({ x: 740, zoom: 2 });
    sceneDepth();
    const byName = (n: string) => editor.doc.layers.find((l) => l.name === n)!;
    expect(byName('Background').parallax).toBe(0.3);
    expect(byName('Foreground').parallax).toBe(1.4);
    expect(byName('Speech bubbles').parallax).toBe(0);
    const m = cameraLayerMatrix(editor.doc, 0)!;
    const shift = (n: string) => applyPoint(m(byName(n)), { x: 540, y: 960 }).x - 540;
    expect(Math.abs(shift('Background'))).toBeLessThan(Math.abs(shift('Characters')));
    expect(Math.abs(shift('Foreground'))).toBeGreaterThan(Math.abs(shift('Characters')));
    expect(shift('Speech bubbles')).toBe(0);
    setParallax(byName('Background').id, 9);
    expect(byName('Background').parallax).toBe(4);
    setParallax(byName('Background').id, null);
    expect(byName('Background').parallax).toBeUndefined();
    // a hidden camera films nothing, the stage shows as it is
    editor.commit('Hide', (d) => {
      d.layers.find((l) => l.type === 'camera')!.visible = false;
    });
    expect(cameraLayerMatrix(editor.doc, 0)).toBeUndefined();
  });

  it('is kept by saving and opening the file', () => {
    addCamera();
    frame.set(30);
    setCamera({ zoom: 3, shake: 5 });
    setTransition('slide', { direction: 'up' });
    sceneDepth();
    const back = parseBytes(packDoc(editor.doc)).doc;
    const cam = back.layers.find((l) => l.type === 'camera')!;
    expect(cam.keyframes.find((k) => k.frame === 30)!.camera).toMatchObject({ zoom: 3, shake: 5, transition: { kind: 'slide', direction: 'up' } });
    expect(back.layers.find((l) => l.name === 'Background')!.parallax).toBe(0.3);
  });

  it('shows the camera view when asked or while playing, never inside a symbol', () => {
    expect(get(showingCamera)).toBe(false);
    addCamera();
    cameraView.set(true);
    expect(get(showingCamera)).toBe(true);
    cameraView.set(false);
    playing.set(true);
    expect(get(showingCamera)).toBe(true);
    playing.set(false);
    expect(get(showingCamera)).toBe(false);
  });

  it('draws the camera view at half the pixels only while playing on a tablet, or when asked', () => {
    expect(previewScaleFor('auto', true, true)).toBe(0.5);
    expect(previewScaleFor('auto', true, false)).toBe(1);
    expect(previewScaleFor('auto', false, true)).toBe(1);
    expect(previewScaleFor('full', true, true)).toBe(1);
    expect(previewScaleFor('half', false, false)).toBe(0.5);
  });
});
