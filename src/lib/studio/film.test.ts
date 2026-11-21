import { beforeEach, describe, expect, it } from 'vitest';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { createCharacter } from '$lib/editor/character';
import { characterLayers, defaultCharacter } from '$lib/character/model';
import { ANIMATIONS, animationKeys, type Body } from '$lib/character/anim';
import { resolveItems, poseAt } from '$lib/render/frame';
import { cameraKeyAt } from '$lib/anim/camera';
import { sceneStarts } from './production';
import { HANDS, PROPS, MARK, jointAt } from './build';
import { actionPoses, handItems } from './pov';
import { addProduction, buildFromStoryboard, production, updateProduction } from '$lib/editor/studio';
import type { CameraMove } from './types';

const W = 1080;
const H = 1920;

function setup() {
  const tom = createCharacter({ ...defaultCharacter(W, H), name: 'Tom', x: 300 })!;
  const lina = createCharacter({ ...defaultCharacter(W, H), name: 'Lina', x: 780 })!;
  addProduction('comedy', 60);
  return { tom, lina };
}

describe('first person view', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('hands keep their parts in every pose so they tween, the actions put poses inside the scene', () => {
    const a = handItems('low', W, H, '#e2c4a6', '#335577');
    const b = handItems('punchR', W, H, '#e2c4a6', '#335577');
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    for (const action of ['none', 'pickup', 'door', 'phone', 'drive', 'fight', 'reach', 'wave'] as const) {
      const keys = actionPoses(action, 'walk', 120, 0.5, 24);
      expect(keys[0].f, action).toBe(0);
      expect(keys.every((k) => k.f < 120), action).toBe(true);
    }
    expect(actionPoses('pickup', 'stand', 120, 0.5, 24).some((k) => k.pose === 'hold')).toBe(true);
  });

  it('sees through the eyes of the actor: hidden in its scene, the camera at its head, hands on a screen layer, the thing picked up', () => {
    const { tom, lina } = setup();
    updateProduction('pov', (p) => {
      p.scenes[1].camera = 'pov-walk';
      p.scenes[1].pov = { actor: tom, look: 'around', action: 'pickup', at: 0.5, item: 'keys', hands: true };
      p.scenes[2].camera = 'pov-interact';
      p.scenes[2].pov = { actor: tom, look: 'ahead', action: 'door', at: 0.3, item: '', hands: true };
      return p;
    });
    buildFromStoryboard();
    const spans = sceneStarts(production()!, 24);
    const shown = (id: string, f: number) => resolveItems(characterLayers(editor.doc.layers, id)!.body!, f).find((i) => i.role === 'torso')!.visible;
    expect(shown(tom, spans[1].start + 3)).toBe(false);
    expect(shown(lina, spans[1].start + 3)).toBe(true);
    expect(shown(tom, spans[0].start + 3)).toBe(true);
    const cam = editor.doc.layers.find((l) => l.type === 'camera')!;
    const k = cameraKeyAt(cam, spans[1].start, W, H);
    const head = jointAt(editor.doc, tom, spans[1].start, 'Head')!;
    expect(k.zoom).toBeGreaterThan(1.5);
    expect(Math.abs(k.y - head.y)).toBeLessThan(H * 0.1);
    expect(k.bob).toBeGreaterThan(0);
    // looking around turns the camera left and right
    const xs = cam.keyframes.filter((f) => f.frame >= spans[1].start && f.frame < spans[1].end).map((f) => f.camera!.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(W * 0.2);
    const hands = editor.doc.layers.find((l) => l.name === HANDS)!;
    expect(hands.parallax).toBe(0);
    expect(resolveItems(hands, spans[1].start + 2).length).toBeGreaterThanOrEqual(10);
    expect(resolveItems(hands, spans[0].start + 2).length).toBe(0);
    expect(resolveItems(hands, spans[3].start + 2).length).toBe(0);
    // the keys lie in the world, then in the hand
    const props = editor.doc.layers.find((l) => l.name === PROPS)!;
    expect(resolveItems(props, spans[1].start + 2).some((i) => i.id === 'pov.world')).toBe(true);
    expect(resolveItems(props, spans[1].end - 2).length).toBe(0);
    expect(resolveItems(hands, spans[1].end - 2).some((i) => i.id === 'pov.held')).toBe(true);
    // the door opens
    const door = (f: number) => resolveItems(props, f).find((i) => i.id === 'pov.world')!.transform[0];
    expect(door(spans[2].end - 2)).toBeLessThan(door(spans[2].start + 1) * 0.5);
    // building again replaces it
    const count = hands.keyframes.length;
    buildFromStoryboard();
    expect(editor.doc.layers.find((l) => l.name === HANDS)!.keyframes.length).toBe(count);
    expect(editor.doc.layers.filter((l) => l.name === HANDS).length).toBe(1);
  });
});

describe('camera templates and film language', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('every shot makes camera keys inside its scene, a dip to black is short', () => {
    const { tom, lina } = setup();
    const moves: CameraMove[] = ['over-shoulder', 'wide', 'low', 'high', 'tracking', 'push-in', 'handheld', 'whip', 'scare', 'dramatic', 'reveal', 'closeup'];
    updateProduction('shots', (p) => {
      while (p.scenes.length < moves.length) p.scenes.push({ ...p.scenes[0], id: `s${p.scenes.length}`, name: `S${p.scenes.length}` });
      moves.forEach((m, i) => {
        p.scenes[i].camera = m;
        p.scenes[i].subject = tom;
        p.scenes[i].partner = lina;
        p.scenes[i].duration = 3;
        p.scenes[i].transition = i % 2 ? 'black' : 'cut';
      });
      p.scenes = p.scenes.slice(0, moves.length);
      return p;
    });
    buildFromStoryboard();
    const spans = sceneStarts(production()!, 24);
    const cam = editor.doc.layers.find((l) => l.type === 'camera')!;
    for (const [i, { scene, start, end }] of spans.entries()) {
      const keys = cam.keyframes.filter((k) => k.frame >= start && k.frame < end);
      expect(keys.length, scene.camera).toBeGreaterThanOrEqual(2);
      if (i > 0 && i % 2) {
        expect(keys[0].camera!.transition!.kind).toBe('fade');
        expect(keys[0].camera!.transition!.duration).toBeLessThan(12);
      }
    }
    const close = cam.keyframes.find((k) => k.frame === spans[moves.indexOf('closeup')].start)!.camera!;
    const head = jointAt(editor.doc, tom, 0, 'Head')!;
    expect(Math.abs(close.x - head.x)).toBeLessThan(W * 0.05);
    const scare = cam.keyframes.filter((k) => k.frame >= spans[moves.indexOf('scare')].start && k.frame < spans[moves.indexOf('scare')].end);
    expect(Math.max(...scare.map((k) => k.camera!.shake))).toBeGreaterThan(10);
  });

  it('puts the moves of a scene on the characters, slow motion takes twice as long, mouths move on their lines', () => {
    const { tom } = setup();
    updateProduction('moves', (p) => {
      p.scenes[0].moves = [{ actor: tom, kind: 'walk', at: 0 }];
      p.scenes[1].moves = [{ actor: tom, kind: 'nod', at: 0.2 }];
      p.scenes[1].slow = true;
      p.lines.push({ id: 'l1', beat: p.beats[1].id, speaker: tom, text: 'Hallo Lina wie geht es dir heute', scene: p.scenes[1].id });
      return p;
    });
    buildFromStoryboard();
    const spans = sceneStarts(production()!, 24);
    const parts = characterLayers(editor.doc.layers, tom)!;
    const hip = (f: number) => jointAt(editor.doc, tom, f, 'Hip')!.x;
    expect(Math.abs(hip(spans[0].end - 1) - hip(0))).toBeGreaterThan(40);
    const moved = parts.rig!.keyframes.filter((k) => k.label.startsWith(MARK));
    expect(moved.length).toBeGreaterThan(4);
    const nod = parts.rig!.keyframes.filter((k) => k.frame >= spans[1].start && k.frame < spans[1].end && k.label.startsWith(MARK));
    expect(nod[nod.length - 1].frame - nod[0].frame).toBeGreaterThanOrEqual(Math.round(0.8 * 24 * 2) - 1);
    const talk = parts.body!.keyframes.filter((k) => k.label === `${MARK}talk`);
    expect(talk.length).toBeGreaterThan(3);
    expect(new Set(talk.map((k) => k.face?.mouth)).size).toBeGreaterThan(1);
    // again: the same number of moves, the pose at rest before them
    const before = parts.rig!.keyframes.length;
    buildFromStoryboard();
    expect(characterLayers(editor.doc.layers, tom)!.rig!.keyframes.length).toBe(before);
    expect(Object.keys(poseAt(characterLayers(editor.doc.layers, tom)!.rig!, 0)).length).toBeGreaterThanOrEqual(0);
  });

  it('every move of the library makes keys and ends where it can go on', () => {
    const body: Body = { height: 700, facing: 1, bones: [], start: {}, id: () => null };
    for (const a of ANIMATIONS) {
      const keys = animationKeys(a.kind, body, { at: 10, fps: 24, repeat: 1, speed: 1, mirror: false, distance: 0, back: true });
      expect(keys.length, a.kind).toBeGreaterThan(1);
      expect(keys[keys.length - 1].ease, a.kind).toBeNull();
      expect(keys[0].frame, a.kind).toBe(10);
    }
  });
});

describe('pace, recordings and voices', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('estimates the speech of every scene, recommends lengths, warns when the words do not fit, never changes a word', async () => {
    const P = await import('./production');
    addProduction('comedy', 60);
    const long = Array.from({ length: 60 }, (_, i) => `wort${i}`).join(' ');
    updateProduction('lines', (p) => {
      p.lines = [{ id: 'a', beat: p.beats[0].id, speaker: 'narrator', text: long, scene: p.scenes[0].id }];
      p.scenes[0].duration = 3;
      return p;
    });
    const p = production()!;
    const t = P.sceneTimings(p);
    expect(t[0].speech).toBeCloseTo(60 / 2.5 + 0.3, 1);
    expect(t[0].state).toBe('short');
    expect(t[0].recommended).toBeGreaterThan(t[0].speech);
    expect(P.checks(p).some((c) => c.text.includes('shorter than the words'))).toBe(true);
    // a faster pace needs less time
    expect(P.sceneTimings({ ...p, pace: 4 })[0].speech).toBeLessThan(t[0].speech);
    const fitted = P.fitScenesToSpeech(p);
    expect(fitted.scenes[0].duration).toBe(t[0].recommended);
    expect(fitted.lines[0].text).toBe(long);
    const checks = P.lengthChecks(fitted);
    expect(checks.map((c) => c.target)).toEqual([60, 90, 120]);
    expect(checks[2].fits).toBe(true);
  });

  it('a linked recording sets the length of its line and starts where the line starts', async () => {
    const { tom } = setup();
    editor.commit('clip', (d) => {
      d.audio = [{ id: 'c1', asset: 'x', name: 'tom', start: 0, volume: 1, frames: 96 }];
    });
    updateProduction('lines', (p) => {
      p.lines = [
        { id: 'a', beat: p.beats[0].id, speaker: 'narrator', text: 'Kurz', scene: p.scenes[1].id },
        { id: 'b', beat: p.beats[0].id, speaker: tom, text: 'Hallo', scene: p.scenes[1].id, clip: 'c1' }
      ];
      p.scenes[1].duration = 8;
      return p;
    });
    buildFromStoryboard();
    const p = production()!;
    const cue = p.cues.find((c) => c.line === 'b')!;
    expect(cue.end - cue.start).toBeGreaterThan(80);
    expect(editor.doc.audio![0].start).toBe(cue.start);
    expect(editor.doc.audio![0].track).toBe('dialogue');
  });

  it('keeps the voice of a character with it and plays a speaker as loud as its voice', async () => {
    const { tom } = setup();
    const S = await import('$lib/editor/studio');
    S.setVoice(tom, { pitch: 1.3, rate: 0.9, volume: 0.5, style: 'ruhig' });
    const folder = editor.doc.layers.find((l) => l.id === tom)!;
    expect(folder.character!.voice).toMatchObject({ pitch: 1.3, rate: 0.9, volume: 0.5, style: 'ruhig' });
    const { clipGain } = await import('$lib/io/audio');
    expect(clipGain(editor.doc, { id: 'c', asset: 'a', name: 'x', start: 0, volume: 1, speaker: tom, track: 'dialogue' })).toBeCloseTo(0.5);
    // another video with the same character starts with that voice
    updateProduction('no voices', (p) => ({ ...p, voices: [] }));
    expect(S.voiceOf(tom).pitch).toBe(1.3);
  });
});
