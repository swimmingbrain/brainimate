import { beforeEach, describe, expect, it } from 'vitest';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { createCharacter } from '$lib/editor/character';
import { walkTo } from '$lib/editor/interact';
import { characterFolders, characterLayers, defaultCharacter } from '$lib/character/model';
import { rigFor } from '$lib/rig/bones';
import { insertScene, insertStarter, openScene } from '$lib/editor/scenes';
import { STARTERS, starterLayers } from './starters';
import { isScenePackage, packScene, readSceneFile, unpackScene } from './library';

const W = 1080;
const H = 1920;

const hipX = (id: string, at: number) => {
  const rig = characterLayers(editor.doc.layers, id)!.rig!;
  const hip = rig.bones.find((b) => b.name === 'Hip')!;
  return rigFor(editor.doc.layers, at)!.world.get(hip.id)![4];
};

describe('ready made places', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('draw every place on the comic layers, the room behind, the furniture in front', () => {
    for (const s of STARTERS) {
      const layers = starterLayers(s.id, W, H);
      expect(layers.map((l) => l.name)).toEqual(['Background', 'Midground', 'Characters', 'Foreground', 'Speech bubbles']);
      expect(layers[0].keyframes[0].items.length, s.id).toBeGreaterThan(2);
      expect(layers[1].keyframes[0].items.length, s.id).toBeGreaterThan(1);
      expect(layers[0].parallax).toBeLessThan(layers[1].parallax!);
    }
    // the shop has products to take, one object each
    const shop = starterLayers('shop', W, H)[1].keyframes[0].items.filter((i) => i.name.startsWith('Product'));
    expect(shop.length).toBeGreaterThanOrEqual(10);
  });

  it('replace a fresh document and go under what a used one has', () => {
    insertStarter('kitchen');
    expect(editor.doc.layers.map((l) => l.name)).toEqual(['Background', 'Midground', 'Characters', 'Foreground', 'Speech bubbles']);
    const id = createCharacter(defaultCharacter(W, H))!;
    insertStarter('street');
    // the street goes to the bottom, the character stays on top
    expect(editor.doc.layers[0].name).toBe('Background');
    expect(editor.doc.layers.findIndex((l) => l.id === id)).toBeGreaterThan(4);
    expect(editor.doc.layers.slice(0, 5).every((l) => !l.parent && l.type === 'normal')).toBe(true);
    editor.undo();
    expect(editor.doc.layers).toHaveLength(8);
  });
});

describe('the scene library', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
  });

  it('keeps a whole scene and puts it into another project with fresh ids, moves included', () => {
    insertStarter('shop');
    const a = createCharacter({ ...defaultCharacter(W, H), name: 'Ann', x: 200 })!;
    walkTo(a, 700);
    const end = Math.max(...editor.doc.layers.map((l) => l.length)) - 1;
    const pkg = packScene(editor.doc, 'Shop with Ann');
    expect(isScenePackage(JSON.parse(JSON.stringify(pkg)))).toBe(true);
    expect(readSceneFile(JSON.stringify(pkg)).name).toBe('Shop with Ann');
    expect(() => readSceneFile('{"kind":"character"}')).toThrow();

    // another project with its own character
    editor.newDoc(W, H, 24);
    const ben = createCharacter({ ...defaultCharacter(W, H), name: 'Ben' })!;
    expect(insertScene(pkg)).toBe(true);
    const folks = characterFolders(editor.doc.layers);
    expect(folks).toHaveLength(2);
    const ann = folks.find((f) => f.id !== ben)!;
    expect(ann.id).not.toBe(a);
    expect(hipX(ann.id, end)).toBeCloseTo(700, -1);
    // ben stays in front of the inserted scene
    expect(editor.doc.layers.findIndex((l) => l.id === ben)).toBe(editor.doc.layers.length - 1);
  });

  it('opens a scene as a new project and fits a scene of another size', () => {
    insertStarter('office');
    const pkg = packScene(editor.doc, 'Office');
    editor.newDoc(1920, 1080, 30);
    openScene(pkg, true);
    expect(editor.doc.width).toBe(W);
    expect(editor.doc.fps).toBe(24);
    expect(editor.doc.name).toBe('Office');
    const half = unpackScene(pkg, W / 2, H / 2);
    expect(half.layers).toHaveLength(pkg.layers.length);
  });
});
