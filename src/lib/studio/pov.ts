import type { Item, Vec } from '$lib/core/types';
import { makeGroupItem } from '$lib/core/items';
import { capsulePath, ellipsePath, part, shadeOf } from '$lib/character/model';
import { makeVisual } from './visuals';
import type { PovAction } from './types';

// the first person view: the camera sits in the eyes of a character, the character itself is hidden and
// only its arms and hands come into the picture from below, drawn on a layer that stays on the screen.
// every pose has the same parts with the same anchors, so the hands move from one pose to the next
// smoothly on the timeline

export type HandPose = 'low' | 'walk' | 'runL' | 'runR' | 'reach' | 'hold' | 'phone' | 'wheel' | 'wheelL' | 'wheelR' | 'guard' | 'punchL' | 'punchR' | 'push' | 'wave' | 'waveB';

interface ArmPose {
  // the shoulder below the picture, the elbow and the hand, in shares of width and height
  elbow: [number, number];
  hand: [number, number];
  // the hand grows as it comes nearer the eyes
  size: number;
  fist?: boolean;
}

const OFF = 1.12;
// where the arms are in each pose, the near (right) arm and the far (left) one, mirrored on the screen
const POSES: Record<HandPose, { L: ArmPose; R: ArmPose }> = {
  low: { L: { elbow: [0.1, 1.2], hand: [0.17, 1.06], size: 1 }, R: { elbow: [0.9, 1.2], hand: [0.83, 1.06], size: 1 } },
  walk: { L: { elbow: [0.1, 1.1], hand: [0.18, 0.97], size: 1 }, R: { elbow: [0.9, 1.1], hand: [0.82, 0.97], size: 1 } },
  runL: { L: { elbow: [0.12, 1.05], hand: [0.24, 0.86], size: 1.1, fist: true }, R: { elbow: [0.92, 1.2], hand: [0.86, 1.1], size: 1, fist: true } },
  runR: { L: { elbow: [0.08, 1.2], hand: [0.14, 1.1], size: 1, fist: true }, R: { elbow: [0.88, 1.05], hand: [0.76, 0.86], size: 1.1, fist: true } },
  reach: { L: { elbow: [0.1, 1.2], hand: [0.16, 1.12], size: 1 }, R: { elbow: [0.78, 0.98], hand: [0.6, 0.72], size: 1.25 } },
  hold: { L: { elbow: [0.1, 1.2], hand: [0.16, 1.12], size: 1 }, R: { elbow: [0.8, 1.05], hand: [0.62, 0.8], size: 1.3, fist: true } },
  phone: { L: { elbow: [0.24, 1.08], hand: [0.4, 0.86], size: 1.25 }, R: { elbow: [0.76, 1.08], hand: [0.6, 0.86], size: 1.25 } },
  wheel: { L: { elbow: [0.18, 1.06], hand: [0.3, 0.8], size: 1.15, fist: true }, R: { elbow: [0.82, 1.06], hand: [0.7, 0.8], size: 1.15, fist: true } },
  wheelL: { L: { elbow: [0.2, 1.04], hand: [0.34, 0.74], size: 1.15, fist: true }, R: { elbow: [0.8, 1.08], hand: [0.66, 0.86], size: 1.15, fist: true } },
  wheelR: { L: { elbow: [0.2, 1.08], hand: [0.34, 0.86], size: 1.15, fist: true }, R: { elbow: [0.8, 1.04], hand: [0.66, 0.74], size: 1.15, fist: true } },
  guard: { L: { elbow: [0.2, 1.05], hand: [0.36, 0.82], size: 1.3, fist: true }, R: { elbow: [0.8, 1.05], hand: [0.64, 0.82], size: 1.3, fist: true } },
  punchL: { L: { elbow: [0.32, 0.9], hand: [0.46, 0.6], size: 1.6, fist: true }, R: { elbow: [0.8, 1.05], hand: [0.66, 0.84], size: 1.3, fist: true } },
  punchR: { L: { elbow: [0.2, 1.05], hand: [0.34, 0.84], size: 1.3, fist: true }, R: { elbow: [0.68, 0.9], hand: [0.54, 0.6], size: 1.6, fist: true } },
  push: { L: { elbow: [0.1, 1.2], hand: [0.16, 1.12], size: 1 }, R: { elbow: [0.72, 0.92], hand: [0.56, 0.62], size: 1.55 } },
  wave: { L: { elbow: [0.1, 1.2], hand: [0.16, 1.12], size: 1 }, R: { elbow: [0.8, 0.9], hand: [0.74, 0.58], size: 1.3 } },
  waveB: { L: { elbow: [0.1, 1.2], hand: [0.16, 1.12], size: 1 }, R: { elbow: [0.82, 0.9], hand: [0.86, 0.6], size: 1.3 } }
};

// the parts of the arms and hands at a pose, for a screen of width by height. ids stay the same in every
// pose so a pose tweens into the next one
export function handItems(pose: HandPose, width: number, height: number, skin: string, sleeve: string, outline = 6, bob = 0): Item[] {
  const o = { colors: { skin, hair: skin, shirt: sleeve, pants: sleeve, shoes: sleeve, outline: '#1d1b19' }, outline, wobble: 0.3 };
  const rnd = () => 0.5;
  const out: Item[] = [];
  for (const side of ['L', 'R'] as const) {
    const a = POSES[pose][side];
    const P = ([x, y]: [number, number]): Vec => ({ x: x * width, y: y * height + bob });
    const shoulder = P([side === 'L' ? -0.02 : 1.02, OFF + 0.3]);
    const elbow = P(a.elbow);
    const hand = P(a.hand);
    const r = width * 0.06;
    const k = a.size;
    const arm = part(`povUpper${side}`, capsulePath(shoulder, elbow, r * 1.2, r * 1.05), null, sleeve, o, rnd, false);
    const fore = part(`povFore${side}`, capsulePath(elbow, hand, r * 1.05 * Math.sqrt(k), r * 0.9 * k), null, sleeve, o, rnd, false);
    // the hand: a palm and the fingers, closed to a fist or open
    const palm = part(`povHand${side}`, ellipsePath(hand.x, hand.y - r * 0.6 * k, r * 0.95 * k, r * 1.05 * k), null, skin, o, rnd, false);
    const reach = a.fist ? 0.45 : 1.15;
    const tip = { x: hand.x + (side === 'L' ? 0.25 : -0.25) * r * k, y: hand.y - r * (0.9 + reach) * k };
    const fingers = part(`povFingers${side}`, capsulePath({ x: hand.x, y: hand.y - r * 1.1 * k }, tip, r * 0.7 * k, r * 0.55 * k), null, skin, o, rnd, false);
    const thumbTip = { x: hand.x + (side === 'L' ? 1 : -1) * r * 1.3 * k, y: hand.y - r * (a.fist ? 0.9 : 1.4) * k };
    const thumb = part(`povThumb${side}`, capsulePath({ x: hand.x + (side === 'L' ? 0.6 : -0.6) * r * k, y: hand.y - r * 0.4 * k }, thumbTip, r * 0.38 * k, r * 0.32 * k), null, skin, o, rnd, false);
    out.push(arm, fore, fingers, palm, thumb);
  }
  for (const item of out) {
    item.id = `pov.${item.role}`;
    if (item.type === 'group') for (const c of item.children) c.id = `pov.${item.role}.${c.name}`;
  }
  return out;
}

// where the near hand holds things at a pose
export function heldAt(pose: HandPose, width: number, height: number): Vec {
  const a = POSES[pose].R;
  return { x: a.hand[0] * width - width * 0.02, y: a.hand[1] * height - width * 0.1 * a.size };
}

// a thing in a hand, a steering wheel, a phone: a visual on the hands layer with an id of its own
export function heldItem(kind: string, at: Vec, scale: number, id: string): Item | null {
  const item = makeVisual(kind, at, scale);
  if (!item) return null;
  item.id = id;
  if (item.type === 'group') item.children.forEach((c, i) => (c.id = `${id}.${i}`));
  return item;
}

// a steering wheel and the top of a dashboard at the bottom of the screen
export function wheelItem(width: number, height: number, sleeve: string): Item {
  const o = { colors: { skin: sleeve, hair: sleeve, shirt: sleeve, pants: sleeve, shoes: sleeve, outline: '#1d1b19' }, outline: 6, wobble: 0.2 };
  const rnd = () => 0.5;
  const c = { x: width / 2, y: height * 1.0 };
  const dash = part('povDash', capsulePath({ x: -width * 0.2, y: height * 1.02 }, { x: width * 1.2, y: height * 1.02 }, height * 0.1, height * 0.1), null, '#3d3b39', o, rnd, false);
  const wheel = part('povWheel', ellipsePath(c.x, c.y, width * 0.42, height * 0.2), ellipsePath(c.x, c.y + height * 0.02, width * 0.33, height * 0.15), '#2b2a2c', o, rnd, false);
  const g = makeGroupItem('Steering wheel', [dash, wheel]);
  g.id = 'pov.wheel';
  g.role = 'povWheel';
  g.children.forEach((ch, i) => (ch.id = `pov.wheel.${i}`));
  return g;
}

// the poses of the hands over a scene for an action: [frame offset, pose] pairs from the scene start
export function actionPoses(action: PovAction, motion: 'stand' | 'walk' | 'run', frames: number, at: number, fps: number): { f: number; pose: HandPose }[] {
  const t = Math.round(frames * Math.max(0, Math.min(0.95, at)));
  const s = (sec: number) => Math.round(sec * fps);
  const base: HandPose = motion === 'run' ? 'runL' : motion === 'walk' ? 'walk' : 'low';
  const keys: { f: number; pose: HandPose }[] = [{ f: 0, pose: base }];
  // arms pump while running, swing a little while walking
  if (motion === 'run' && action === 'none') {
    for (let f = s(0.18), i = 1; f < frames; f += s(0.18), i++) keys.push({ f, pose: i % 2 ? 'runR' : 'runL' });
    return keys;
  }
  switch (action) {
    case 'pickup':
      keys.push({ f: Math.max(1, t - s(0.5)), pose: base }, { f: t, pose: 'reach' }, { f: t + s(0.45), pose: 'hold' });
      break;
    case 'door':
      keys.push({ f: Math.max(1, t - s(0.4)), pose: base }, { f: t, pose: 'push' }, { f: t + s(0.6), pose: 'push' }, { f: t + s(1), pose: base });
      break;
    case 'phone':
      keys.push({ f: Math.max(1, t - s(0.4)), pose: base }, { f: t, pose: 'phone' });
      break;
    case 'drive':
      keys[0] = { f: 0, pose: 'wheel' };
      for (let f = s(1.2), i = 0; f < frames; f += s(1.2), i++) keys.push({ f, pose: i % 3 === 0 ? 'wheelL' : i % 3 === 1 ? 'wheelR' : 'wheel' });
      break;
    case 'fight':
      keys.push({ f: Math.max(1, t - s(0.3)), pose: 'guard' });
      for (let f = t, i = 0; f < frames - s(0.2); f += s(0.35), i++) keys.push({ f, pose: i % 2 ? 'punchR' : 'punchL' }, { f: f + s(0.17), pose: 'guard' });
      break;
    case 'reach':
      keys.push({ f: Math.max(1, t - s(0.4)), pose: base }, { f: t, pose: 'reach' }, { f: t + s(0.8), pose: base });
      break;
    case 'wave':
      keys.push({ f: Math.max(1, t - s(0.3)), pose: base });
      for (let i = 0; i < 5; i++) keys.push({ f: t + i * s(0.2), pose: i % 2 ? 'waveB' : 'wave' });
      keys.push({ f: t + s(1.3), pose: base });
      break;
  }
  return keys.filter((k) => k.f < frames).sort((a, b) => a.f - b.f);
}

export { shadeOf };
