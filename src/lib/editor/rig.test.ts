import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { Layer, PathItem } from '$lib/core/types';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { activeLayer, boneSelection, frame, selection } from '$lib/stores/app';
import { preferences, setGroup } from '$lib/stores/preferences';
import { editor } from './editor';
import { deleteLayer } from './layers';
import {
  addRigBone,
  addRigTemplate,
  autoBind,
  commitPose,
  deleteBone,
  resetPose,
  togglePin,
  unbindSelection
} from './rig';

function rigLayer(): Layer {
  return editor.doc.layers.find((l) => l.type === 'rig')!;
}

function arm(): PathItem {
  return editor.layerItems(editor.doc.layers[0])[0] as PathItem;
}

// an arm from 0 to 200 along y = 0 with two bones on it
function rigArm(): string[] {
  const item = makePathItem('arm', rectPath(0, -15, 200, 30, 10), defaultStyle(solid('#000000'), null));
  editor.insertItem(editor.doc.layers[0].id, item);
  const a = addRigBone(null, { x: 5, y: 0 }, { x: 100, y: 0 })!;
  const b = addRigBone(a.boneId, { x: 100, y: 0 }, { x: 195, y: 0 })!;
  autoBind([a.boneId, b.boneId]);
  return [a.boneId, b.boneId];
}

describe('rig commands', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
    setGroup('rig', { autoBind: true, bindMode: 'auto', reach: 35, chainLimit: 4 });
    frame.set(0);
  });

  it('makes a rig layer above the active one with the first bone and makes it active', () => {
    const first = addRigBone(null, { x: 0, y: 0 }, { x: 50, y: 0 })!;
    const layers = editor.doc.layers;
    expect(layers.map((l) => l.type)).toEqual(['normal', 'rig']);
    expect(layers[1].name).toBe('Rig');
    expect(get(activeLayer)).toBe(layers[1].id);
    const second = addRigBone(first.boneId, { x: 50, y: 0 }, { x: 50, y: 40 })!;
    expect(second.layerId).toBe(first.layerId);
    expect(rigLayer().bones.map((b) => b.parent)).toEqual([null, first.boneId]);
    expect(get(boneSelection)).toBe(second.boneId);
    // every bone is its own undo step
    editor.undo();
    expect(rigLayer().bones).toHaveLength(1);
  });

  it('binds what the chain reaches smooth, each anchor weighted', () => {
    rigArm();
    const item = arm();
    expect(item.skin?.rigid).toBeNull();
    expect(item.skin?.weights.length).toBe(item.path.anchors.length);
    expect(item.path.anchors.length).toBeGreaterThan(8);
  });

  it('keys a pose on a new frame and tweens into it', () => {
    const [a] = rigArm();
    frame.set(12);
    commitPose(rigLayer().id, { [a]: { rotation: 1, x: 0, y: 0, scale: 1 } });
    const keys = rigLayer().keyframes;
    expect(keys.map((k) => k.frame)).toEqual([0, 12]);
    expect(keys[0].tween?.ease).toBe(get(preferences).rig.ease);
    expect(editor.doc.layers[0].length).toBe(13);
    frame.set(6);
    expect(editor.rig()!.pose[a].rotation).toBeCloseTo(0.5);
  });

  it('edits the keyframe that holds the frame when auto key is off', () => {
    const [a] = rigArm();
    setGroup('timeline', { autoKey: false });
    frame.set(0);
    commitPose(rigLayer().id, { [a]: { rotation: 0.3, x: 0, y: 0, scale: 1 } });
    editor.commit('Long', (d) => {
      d.layers[1].length = 10;
    });
    frame.set(5);
    commitPose(rigLayer().id, { [a]: { rotation: 0.6, x: 0, y: 0, scale: 1 } });
    expect(rigLayer().keyframes.map((k) => k.frame)).toEqual([0]);
    expect(rigLayer().keyframes[0].pose[a].rotation).toBeCloseTo(0.6);
  });

  it('resets the pose of the frame', () => {
    const [a] = rigArm();
    commitPose(rigLayer().id, { [a]: { rotation: 1, x: 0, y: 0, scale: 1 } });
    resetPose();
    expect(editor.rig()!.pose[a]).toBeUndefined();
    // a second reset has nothing to do and leaves no undo step, one undo brings the pose back
    resetPose();
    editor.undo();
    expect(editor.rig()!.pose[a]?.rotation).toBe(1);
  });

  it('pins a joint and deletes a bone, its child stays where it was', () => {
    const [a, b] = rigArm();
    togglePin(b);
    expect(rigLayer().bones[1].pinned).toBe(true);
    deleteBone(a);
    expect(rigLayer().bones.map((x) => x.id)).toEqual([b]);
    expect(rigLayer().bones[0].x).toBeCloseTo(100);
    const weights = arm().skin!.weights;
    expect(weights.every((list) => list.length === 1 && list[0].bone === b)).toBe(true);
  });

  it('unbinds the selection, and every item when the rig layer goes', () => {
    rigArm();
    const id = arm().id;
    selection.set(new Set([id]));
    unbindSelection();
    expect(arm().skin).toBeNull();
    editor.undo();
    expect(arm().skin).not.toBeNull();
    deleteLayer(rigLayer().id, true);
    expect(arm().skin).toBeNull();
  });

  it('adds a template and binds with it in one undo step', () => {
    const item = makePathItem('body', rectPath(380, 150, 40, 300), defaultStyle(solid('#000000'), null));
    editor.insertItem(editor.doc.layers[0].id, item);
    selection.set(new Set());
    addRigTemplate('humanoid');
    expect(rigLayer().bones).toHaveLength(17);
    expect(arm().skin).not.toBeNull();
    editor.undo();
    expect(editor.doc.layers.some((l) => l.type === 'rig')).toBe(false);
    expect(arm().skin).toBeNull();
  });
});
