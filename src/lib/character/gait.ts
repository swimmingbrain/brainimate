import type { Vec } from '$lib/core/types';
import { worldMatrices } from '$lib/rig/bones';
import type { BoneName } from './model';
import type { Body, PoseValues } from './anim';

// walking and running with feet that stay where they step. every leg is solved with two bone ik for
// where its ankle has to be: on the ground and still while it carries the body, in an arc forward
// while it swings. the hip drops as far as the stride needs and bobs, the arms swing against the legs a
// little late, so the move has weight. all of it worked out at rest, in the space of the hip, before a
// turn mirrors the character

interface Leg {
  // the hip joint, the knee and the ankle at rest, from the middle of the hip
  hip: Vec;
  ankle: Vec;
  thigh: number;
  shin: number;
  // world angles at rest
  upper0: number;
  lower0: number;
  foot0: number;
  footLength: number;
}

export interface LegRig {
  R: Leg;
  L: Leg;
  // the height of the hip above the ankles at rest
  height: number;
}

const angle = (m: readonly number[]) => Math.atan2(m[1], m[0]);

export function legRig(body: Body): LegRig | null {
  const hipId = body.id('Hip');
  if (!hipId) return null;
  const world = worldMatrices(body.bones, {});
  const hip = world.get(hipId)!;
  const leg = (side: 'L' | 'R'): Leg | null => {
    const ids = [body.id(`Upper leg ${side}` as BoneName), body.id(`Lower leg ${side}` as BoneName), body.id(`Foot ${side}` as BoneName)];
    if (ids.some((i) => !i)) return null;
    const [u, l, f] = ids.map((i) => world.get(i!)!);
    const bone = (i: string) => body.bones.find((b) => b.id === i)!;
    return {
      hip: { x: u[4] - hip[4], y: u[5] - hip[5] },
      ankle: { x: f[4] - hip[4], y: f[5] - hip[5] },
      thigh: Math.hypot(l[4] - u[4], l[5] - u[5]),
      shin: Math.hypot(f[4] - l[4], f[5] - l[5]),
      upper0: angle(u),
      lower0: angle(l),
      foot0: angle(f),
      footLength: bone(ids[2]!).length
    };
  };
  const R = leg('R');
  const L = leg('L');
  if (!R || !L) return null;
  return { R, L, height: (R.ankle.y + L.ankle.y) / 2 };
}

// the rotations of a leg that put its ankle on target, the knee bent toward front, the foot at a world
// angle. a target out of reach stretches the leg toward it
export function solveLeg(leg: Leg, target: Vec, front: number, footAngle: number): { upper: number; lower: number; foot: number } {
  const dx = target.x - leg.hip.x;
  const dy = target.y - leg.hip.y;
  const a = leg.thigh;
  const b = leg.shin;
  const d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, Math.hypot(dx, dy)));
  const toward = Math.atan2(dy, dx);
  const bend = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  // of the two ways the knee can bend, the one in front
  const k1 = toward + bend;
  const k2 = toward - bend;
  const upper = Math.cos(k1) * front > Math.cos(k2) * front ? k1 : k2;
  const knee = { x: leg.hip.x + Math.cos(upper) * a, y: leg.hip.y + Math.sin(upper) * a };
  const lower = Math.atan2(target.y - knee.y, target.x - knee.x);
  return {
    upper: wrap(upper - leg.upper0),
    lower: wrap(lower - upper - (leg.lower0 - leg.upper0)),
    foot: wrap(footAngle - lower - (leg.foot0 - leg.lower0))
  };
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export interface GaitOptions {
  run: boolean;
  // how far the body goes each cycle at rest, in the hip's own x: the sign is the way it travels.
  // 0 walks on the spot
  travel: number;
  // 1 the character looks right at rest, -1 left
  facing: number;
}

// where a foot is in its step at phase 0 to 1: 0 it touches down in front, then it carries the body
// back, then it swings forward in an arc. x along the way it travels, lift up from the ground
export function footAt(phase: number, stride: number, stance: number, lift: number, run: boolean): { x: number; lift: number; planted: boolean; t: number } {
  const p = ((phase % 1) + 1) % 1;
  if (p < stance) {
    const t = p / stance;
    return { x: stride * (0.5 - t), lift: 0, planted: true, t };
  }
  const t = (p - stance) / (1 - stance);
  // a run pulls the heel up early, a walk lifts in the middle
  const arc = run ? Math.sin(Math.PI * Math.pow(t, 0.7)) : Math.sin(Math.PI * t);
  return { x: stride * (smooth(t) - 0.5), lift: lift * arc, planted: false, t };
}

// the pose of a walk or run at phase 0 to 1 of a cycle, the near leg touching down at 0
export function gaitPose(body: Body, rig: LegRig, phase: number, o: GaitOptions): PoseValues {
  const u = body.height;
  const f = o.facing;
  const run = o.run;
  const stance = run ? 0.36 : 0.62;
  const reach = rig.R.thigh + rig.R.shin;
  // each foot is down while the body goes stance of the cycle, so it moves back that far under it
  const nominal = (run ? 0.62 : 0.34) * u;
  const dir = o.travel === 0 ? f : Math.sign(o.travel);
  const stride = Math.min(Math.abs(o.travel === 0 ? nominal / stance : o.travel) * stance, reach * (run ? 1.5 : 1.1));
  const lift = (run ? 0.16 : 0.055) * u;
  const feet = {
    R: footAt(phase, stride, stance, lift, run),
    L: footAt(phase + 0.5, stride, stance, lift, run)
  };
  // the hip low when both feet are down and the legs spread, high over a straight leg, a run highest in the air
  const bob = (run ? 0.022 : 0.012) * u;
  const wave = Math.cos(4 * Math.PI * (phase - stance / 2));
  let hipY = run ? bob * wave + 0.03 * u : (bob * (1 - wave)) / 2;
  // as low as a planted leg needs to reach its foot
  for (const side of ['R', 'L'] as const) {
    const leg = rig[side];
    const foot = feet[side];
    const dx = leg.ankle.x + foot.x * dir - leg.hip.x;
    const most = 0.985 * (leg.thigh + leg.shin);
    if (Math.abs(dx) < most) {
      const need = leg.ankle.y - foot.lift - leg.hip.y - Math.sqrt(most * most - dx * dx);
      hipY = Math.max(hipY, need);
    }
  }
  const out: PoseValues = { Hip: { y: hipY } };
  for (const side of ['R', 'L'] as const) {
    const leg = rig[side];
    const foot = feet[side];
    const target = { x: leg.ankle.x + foot.x * dir, y: leg.ankle.y - foot.lift - hipY };
    // flat on the ground, the toes down as it pushes off, up again to land on the heel
    let tilt = 0;
    if (foot.planted) tilt = foot.t > 0.75 ? (foot.t - 0.75) * 4 * 0.35 : 0;
    else tilt = 0.45 * Math.sin(Math.PI * Math.min(1, foot.t * 1.3)) * (1 - foot.t) - 0.12 * smooth(foot.t);
    const s = solveLeg(leg, target, f, leg.foot0 + tilt * f);
    out[`Upper leg ${side}` as BoneName] = { rotation: s.upper };
    out[`Lower leg ${side}` as BoneName] = { rotation: s.lower };
    out[`Foot ${side}` as BoneName] = { rotation: s.foot };
  }
  // the arms swing against the legs, a little after them
  const fwd = -f;
  const lag = 0.06;
  const swing = (side: 'R' | 'L') => {
    const other = side === 'R' ? 0.5 : 0;
    return Math.cos(2 * Math.PI * (phase + other - lag));
  };
  const armSwing = run ? 0.8 : 0.36;
  const elbow = run ? 1.3 : 0.25;
  for (const side of ['R', 'L'] as const) {
    const c = swing(side);
    out[`Upper arm ${side}` as BoneName] = { rotation: fwd * armSwing * c * dir * f };
    out[`Lower arm ${side}` as BoneName] = { rotation: fwd * (elbow + (run ? 0.15 : 0.18) * Math.max(0, c * dir * f)) };
    out[`Hand ${side}` as BoneName] = { rotation: fwd * 0.08 * c };
  }
  const lean = run ? 0.16 : 0.035;
  const twist = Math.sin(4 * Math.PI * phase);
  out.Spine = { rotation: -fwd * lean * dir * f + fwd * 0.012 * twist };
  out.Chest = { rotation: -fwd * lean * 0.3 * dir * f - fwd * 0.01 * twist };
  out.Head = { rotation: fwd * lean * 0.8 * dir * f };
  return out;
}

// standing: the weight moves from one leg to the other, the feet stay where they are
export function weightShift(body: Body, rig: LegRig, phase: number): PoseValues {
  const u = body.height;
  const f = body.facing;
  const fwd = -f;
  const s = Math.sin(2 * Math.PI * phase);
  const hip = { x: 0.012 * u * s, y: 0.004 * u * (1 - Math.cos(4 * Math.PI * phase)) * 0.5 + 0.002 * u };
  const out: PoseValues = { Hip: { x: hip.x, y: hip.y } };
  for (const side of ['R', 'L'] as const) {
    const leg = rig[side];
    const target = { x: leg.ankle.x - hip.x, y: leg.ankle.y - hip.y };
    const r = solveLeg(leg, target, f, leg.foot0);
    out[`Upper leg ${side}` as BoneName] = { rotation: r.upper };
    out[`Lower leg ${side}` as BoneName] = { rotation: r.lower };
    out[`Foot ${side}` as BoneName] = { rotation: r.foot };
  }
  out.Spine = { rotation: fwd * 0.02 * s };
  out.Chest = { rotation: -fwd * 0.012 * Math.sin(2 * Math.PI * phase + 0.6) };
  out.Head = { rotation: fwd * 0.02 * Math.sin(2 * Math.PI * phase + 1.2) };
  out['Upper arm R'] = { rotation: fwd * (0.04 + 0.02 * s) };
  out['Upper arm L'] = { rotation: -fwd * (0.03 + 0.02 * s) };
  out['Lower arm R'] = { rotation: fwd * 0.12 };
  out['Lower arm L'] = { rotation: fwd * 0.1 };
  return out;
}
