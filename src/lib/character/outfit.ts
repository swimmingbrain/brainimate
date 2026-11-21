import type { Item, PathData, Point3, Vec } from '$lib/core/types';
import { makePathItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { mixHex } from '$lib/core/color';
import { anchor, capsulePath, ellipsePath, farTone, limb, loop, part, shadeOf, wobble, type CharacterOptions } from './model';
import { TOPS, type Identity } from './wardrobe';

// the body under the clothes and the clothes on it, worked out in the room like the rest of a turnable
// character: the upper body and the hip are cross sections from the shoulders down, so a narrow waist, wide
// hips, broad shoulders or a chest show from every side. a collar, a pocket, a hood or a strap sits on the
// surface and shows when that side turns to the viewer

export interface Ctx {
  P: (p: Point3) => Vec & { z: number };
  j: Record<string, Point3>;
  u: number;
  w: number;
  id: Identity;
  colors: CharacterOptions['colors'];
  o: Pick<CharacterOptions, 'colors' | 'outline' | 'wobble'>;
  rnd: () => number;
  // the side shadows fall to on the screen and the sine of the body angle
  fs: number;
  sin: number;
  far: (z: number) => boolean;
  bodyWidth: number;
  put: (z: number, ...items: Item[]) => void;
  // the hand and its fingers of a side, drawn by the caller
  hand: (side: 'L' | 'R', z: number, far: boolean) => void;
}

// a level of a cross section: its height and how far it reaches across, to the front and to the back, in
// shares of the height
interface Level {
  y: number;
  w: number;
  f: number;
  b: number;
}

// the outline of a body seen at the angle of the context: every level's leftmost and rightmost point
function extents(c: Ctx, lv: Level, a0 = 0): { l: Vec; r: Vec; z: number } {
  let l: Vec = { x: Infinity, y: 0 };
  let r: Vec = { x: -Infinity, y: 0 };
  for (let i = 0; i < 24; i++) {
    const phi = (i / 24) * Math.PI * 2;
    const cs = Math.cos(phi);
    const a = (cs >= 0 ? lv.f : lv.b) * cs * c.u + a0;
    const s = lv.w * c.bodyWidth * c.u * Math.sin(phi);
    const p = c.P([a, s, lv.y * c.u]);
    if (p.x < l.x) l = { x: p.x, y: p.y };
    if (p.x > r.x) r = { x: p.x, y: p.y };
  }
  return { l, r, z: 0 };
}

function section(c: Ctx, levels: Level[], shadow = false, a0 = 0, smooth = 0.16): PathData {
  const ext = levels.map((lv) => extents(c, lv, a0));
  const right: Vec[] = [];
  const left: Vec[] = [];
  for (const e of ext) {
    if (!shadow) {
      right.push(e.r);
      left.push(e.l);
      continue;
    }
    // the cel shadow along the side the body turns its back to
    const width = e.r.x - e.l.x;
    if (c.fs > 0) {
      left.push(e.l);
      right.push({ x: e.l.x + width * 0.34, y: e.l.y });
    } else {
      right.push(e.r);
      left.push({ x: e.r.x - width * 0.34, y: e.r.y });
    }
  }
  return loop([...right, ...left.reverse()], smooth);
}

// a part drawn from a cross section: fill, cel shadow, outline
function body(c: Ctx, role: string, levels: Level[], color: string, a0 = 0): Item {
  // a band of two levels has straight sides
  const smooth = levels.length > 2 ? 0.16 : 0.02;
  return part(role, section(c, levels, false, a0, smooth), section(c, levels, true, a0, smooth), color, c.o, c.rnd, false);
}

// a flat piece on the surface of the body, drawn with a fill and an outline, shown when it faces the viewer
function patch(c: Ctx, role: string, pts: Point3[], color: string | null, closed = true, width = 0.6): Item {
  const p = pts.map((q) => c.P(q));
  const path: PathData = { closed, anchors: p.map((q) => anchor(q.x, q.y)) };
  const drawn = wobble(path, c.o.wobble * c.o.outline * 0.15, c.rnd);
  const item = makePathItem(role, drawn, defaultStyle(color ? solid(color) : null, solid(c.colors.outline), Math.max(1.5, c.o.outline * width)));
  item.role = role;
  const z = p.reduce((n, q) => n + q.z, 0) / p.length;
  item.visible = z > 0;
  return item;
}

const lerp3 = (a: Point3, b: Point3, t: number): Point3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// the length of the top over the hip, by its kind
const HEM: Record<Identity['top'], number> = { tshirt: 0.47, longsleeve: 0.47, hoodie: 0.455, sweatshirt: 0.46, shirt: 0.47, sweater: 0.46, jacket: 0.45, blouse: 0.485, top: 0.53 };

export function torsoLevels(id: Identity, hem: number): Level[] {
  const sh = id.shoulders;
  const bust = id.bust;
  const hipW = 0.093 * id.hips;
  const waistW = 0.085 * id.waist;
  // between the waist and the hip the side curves out
  const at = (y: number) => {
    if (y >= 0.6) return waistW;
    const t = Math.min(1, (0.6 - y) / 0.1);
    return waistW + (hipW - waistW) * Math.sin((t * Math.PI) / 2);
  };
  const loose = id.top === 'hoodie' || id.top === 'sweater' || id.top === 'sweatshirt' || id.top === 'jacket' ? 1.06 : 1;
  const neck = id.top === 'top' ? 0.06 : 0.045;
  return [
    { y: 0.79, w: neck, f: 0.03, b: 0.035 },
    { y: 0.765, w: 0.105 * sh * loose, f: 0.058, b: 0.066 },
    { y: 0.71, w: (0.1 * (0.75 * sh + 0.25) + 0.006 * bust) * loose, f: 0.07 + 0.042 * bust, b: 0.072 },
    { y: 0.655, w: 0.09 * (0.5 * sh + 0.5 * id.waist) * loose, f: 0.064 + 0.012 * bust, b: 0.066 },
    { y: 0.6, w: waistW * loose, f: 0.062, b: 0.063 },
    { y: hem, w: at(hem) * loose * 1.02, f: 0.066, b: 0.07 * id.hips }
  ];
}

// the body and what it wears, everything below the neck
export function dress(c: Ctx) {
  const { j, u, w, id, colors } = c;
  const top = TOPS.find((t) => t.id === id.top) ?? TOPS[0];
  const isDress = id.bottom === 'dress';
  const skirt = id.bottom === 'skirt' || isDress;
  const bareLegs = skirt || id.bottom === 'shorts';
  const topColor = isDress ? colors.pants : colors.shirt;
  const legColor = bareLegs ? colors.skin : colors.pants;
  const accent = id.accent;
  const hem = HEM[id.top] ?? 0.47;
  const ribbed = id.top === 'sweatshirt' || id.top === 'sweater' || id.top === 'hoodie';
  const slim = 0.9 + 0.1 * id.shoulders;

  // arms and legs, the near ones in front, from the front and the back beside the body
  const armBias = 0.03 * u * Math.abs(c.sin);
  const legBias = skirt ? -0.2 * u : -0.06 * u * Math.abs(c.sin);
  const arm = { ua: 0.037 * u * w * slim, ub: 0.031 * u * w * slim, la: 0.029 * u * w * slim, lb: 0.025 * u * w * slim };
  const leg = { ua: 0.052 * u * w * id.hips, ub: 0.041 * u * w, la: 0.04 * u * w, lb: 0.032 * u * w, foot: 0.03 * u * w };
  const upperArm = top.sleeves === 'none' ? colors.skin : topColor;
  const lowerArm = top.sleeves === 'long' ? topColor : colors.skin;
  const puff = id.top === 'blouse' ? 1.15 : 1;
  for (const side of ['L', 'R'] as const) {
    const S = (k: string) => j[`${k}${side}`];
    const zArm = c.P(lerp3(S('shoulder'), S('wrist'), 0.5)).z + armBias;
    const isFar = c.far(zArm - armBias);
    const items: Item[] = [
      limb(`upperArm${side}`, c.P(S('shoulder')), c.P(S('elbow')), arm.ua * puff, arm.ub * puff, upperArm, c.o, c.rnd, isFar, c.fs),
      limb(`lowerArm${side}`, c.P(S('elbow')), c.P(S('wrist')), arm.la, arm.lb, lowerArm, c.o, c.rnd, isFar, c.fs)
    ];
    // ribbed cuffs at the wrists of a sweatshirt, a sweater or a hoodie
    if (ribbed) items.push(limb(`cuff${side}`, c.P(lerp3(S('elbow'), S('wrist'), 0.86)), c.P(S('wrist')), arm.lb * 1.12, arm.lb * 1.1, id.top === 'sweater' ? shadeOf(topColor) : accent, c.o, c.rnd, isFar, c.fs));
    // a watch on the far wrist
    if (id.watch && side === 'L') {
      const p = c.P(lerp3(S('elbow'), S('wrist'), 0.9));
      items.push(part('watch', ellipsePath(p.x, p.y, arm.lb * 1.05, arm.lb * 0.55), null, id.extra, c.o, c.rnd, isFar));
    }
    c.put(zArm, ...items);
    c.hand(side, zArm, isFar);

    const zLeg = c.P(lerp3(S('hip'), S('ankle'), 0.5)).z + legBias;
    const legFar = c.far(zLeg - legBias);
    const legItems: Item[] = [
      limb(`upperLeg${side}`, c.P(S('hip')), c.P(S('knee')), leg.ua, leg.ub, legColor, c.o, c.rnd, legFar, c.fs),
      limb(`lowerLeg${side}`, c.P(S('knee')), c.P(S('ankle')), leg.la, leg.lb, legColor, c.o, c.rnd, legFar, c.fs)
    ];
    if (id.bottom === 'shorts') legItems.push(limb(`shorts${side}`, c.P(S('hip')), c.P(lerp3(S('hip'), S('knee'), 0.55)), leg.ua * 1.12, leg.ua * 1.02, colors.pants, c.o, c.rnd, legFar, c.fs));
    if (id.bottom === 'joggers') legItems.push(limb(`pantCuff${side}`, c.P(lerp3(S('knee'), S('ankle'), 0.86)), c.P(S('ankle')), leg.lb * 1.05, leg.lb * 1.05, shadeOf(colors.pants), c.o, c.rnd, legFar, c.fs));
    if (id.bottom === 'jeans') legItems.push(limb(`pantCuff${side}`, c.P(lerp3(S('knee'), S('ankle'), 0.9)), c.P(S('ankle')), leg.lb * 1.08, leg.lb * 1.08, mixHex(colors.pants, '#ffffff', 0.25), c.o, c.rnd, legFar, c.fs));
    legItems.push(...shoes(c, side, leg.foot, leg.lb, legFar));
    c.put(zLeg, ...legItems);
  }

  // the hip: trousers or shorts round it, a skirt or the skirt of a dress over the legs
  const hipLevels: Level[] = [
    { y: 0.6, w: 0.085 * id.waist, f: 0.062, b: 0.063 },
    { y: 0.5, w: 0.095 * id.hips, f: 0.066, b: 0.074 * id.hips },
    { y: 0.44, w: 0.078 * id.hips, f: 0.05, b: 0.056 }
  ];
  if (skirt) {
    const end = isDress ? 0.3 : 0.33;
    const flare = isDress ? 1.25 : 1.18;
    c.put(
      -0.004 * u,
      body(
        c,
        'skirt',
        [hipLevels[0], hipLevels[1], { y: end, w: 0.098 * id.hips * flare, f: 0.085 * flare, b: 0.09 * flare }],
        isDress ? colors.pants : colors.pants
      )
    );
  } else c.put(-0.005 * u, body(c, 'pelvis', hipLevels, colors.pants));

  // the upper body in the top
  const levels = torsoLevels(id, isDress ? 0.56 : hem);
  const torsoItems: Item[] = [body(c, 'torso', levels, topColor)];
  const front = (y: number, s: number, out = 0.004): Point3 => {
    // a point on the front of the upper body at a height, s across
    const lv = levels.reduce((best, l) => (Math.abs(l.y - y) < Math.abs(best.y - y) ? l : best), levels[0]);
    return [(lv.f + out) * u, s * u * c.bodyWidth, y * u];
  };
  const back = (y: number, s: number): Point3 => {
    const lv = levels.reduce((best, l) => (Math.abs(l.y - y) < Math.abs(best.y - y) ? l : best), levels[0]);
    return [-(lv.b + 0.004) * u, s * u * c.bodyWidth, y * u];
  };
  // a ribbed band at the hem
  if (ribbed && !isDress) {
    const band = levels[levels.length - 1];
    torsoItems.push(body(c, 'hemBand', [{ ...band, y: hem + 0.03, w: band.w * 0.99 }, { ...band, w: band.w * 1.01 }], id.top === 'sweater' ? shadeOf(topColor) : accent));
  }
  // the neckline: a round neck, a v for a blouse and a top, the collar of a shirt
  if (id.top === 'blouse' || id.top === 'top') torsoItems.push(patch(c, 'neckline', [front(0.79, -0.038), front(0.79, 0.038), front(0.735, 0, 0.006)], colors.skin));
  else if (id.top === 'shirt' || id.top === 'jacket') {
    torsoItems.push(patch(c, 'collarL', [front(0.792, -0.006), front(0.792, -0.045), front(0.75, -0.012)], id.top === 'shirt' ? topColor : accent));
    torsoItems.push(patch(c, 'collarR', [front(0.792, 0.006), front(0.792, 0.045), front(0.75, 0.012)], id.top === 'shirt' ? topColor : accent));
  } else torsoItems.push(patch(c, 'neckline', [front(0.79, -0.035), front(0.775, 0, 0.002), front(0.79, 0.035)], null, false, 0.5));
  // a shirt buttons down the middle, a jacket is open over the shirt under it
  if (id.top === 'shirt') torsoItems.push(patch(c, 'placket', [front(0.75, 0), front(hem + 0.01, 0)], null, false, 0.4));
  if (id.top === 'jacket') torsoItems.push(patch(c, 'jacketInner', [front(0.75, -0.03), front(0.75, 0.03), front(hem + 0.01, 0.026), front(hem + 0.01, -0.026)], accent));
  // a hoodie: the pocket in front and the strings
  if (id.top === 'hoodie') {
    torsoItems.push(patch(c, 'pocket', [front(0.565, -0.05), front(0.565, 0.05), front(0.5, 0.06), front(0.5, -0.06)], shadeOf(topColor), true, 0.5));
    torsoItems.push(patch(c, 'strings', [front(0.775, -0.015), front(0.715, -0.017)], null, false, 0.35));
  }
  // a soft line under the chest from the front, a stylized hint, not more
  if (id.bust > 0.3 && !isDress) torsoItems.push(patch(c, 'bustLine', [front(0.672, -0.06), front(0.66, -0.02, 0.012), front(0.672, 0.02)], null, false, 0.25));
  // a necklace round the neck
  if (id.jewelry === 'necklace' || id.jewelry === 'both') torsoItems.push(patch(c, 'necklace', [front(0.79, -0.04, 0.01), front(0.765, 0, 0.012), front(0.79, 0.04, 0.01)], null, false, 0.35));
  // a bag on a strap across the body
  if (id.bag === 'shoulder') {
    torsoItems.push(patch(c, 'bagStrap', [front(0.772, 0.08), front(0.64, 0, 0.012), front(0.5, -0.09)], null, false, 0.9));
    torsoItems.push(patch(c, 'bagStrapBack', [back(0.772, 0.08), back(0.64, 0), back(0.5, -0.09)], null, false, 0.9));
  }
  if (id.bag === 'backpack') {
    torsoItems.push(patch(c, 'packStrapL', [front(0.77, -0.055), front(0.62, -0.07)], null, false, 1.1));
    torsoItems.push(patch(c, 'packStrapR', [front(0.77, 0.055), front(0.62, 0.07)], null, false, 1.1));
  }
  c.put(0, ...torsoItems);

  // what hangs behind: the hood of a hoodie, a backpack; seen from behind in front of the back
  if (id.top === 'hoodie') {
    const center = c.P([-0.07 * u, 0, 0.79 * u]);
    const across = (0.075 * Math.abs(c.sin) + 0.04 * (1 - Math.abs(c.sin))) * u;
    // seen from behind it lies over the back but under hair that hangs down
    c.put(Math.min(center.z, 0.0012 * u), part('hood', ellipsePath(center.x, center.y, Math.max(0.035 * u, across), 0.05 * u), null, topColor, c.o, c.rnd, c.far(center.z)));
  }
  if (id.bag === 'shoulder') {
    const p = c.P([0.02 * u, -0.115 * id.hips * u, 0.5 * u]);
    c.put(p.z + 0.001 * u, part('bag', ellipsePath(p.x, p.y, 0.05 * u, 0.04 * u), null, id.extra, c.o, c.rnd, c.far(p.z)));
  }
  if (id.bag === 'backpack') {
    const p = c.P([-0.1 * u, 0, 0.65 * u]);
    const across = (Math.abs(c.sin) * 0.062 + (1 - Math.abs(c.sin)) * 0.035) * u;
    c.put(p.z, part('backpack', capsulePath({ x: p.x, y: p.y - 0.035 * u }, { x: p.x, y: p.y + 0.04 * u }, across, across), null, id.extra, c.o, c.rnd, c.far(p.z)));
  }
  c.put(0.001 * u, limb('neck', c.P(j.neckBase), c.P(j.neckTop), 0.026 * u * w * slim, 0.025 * u * w * slim, colors.skin, c.o, c.rnd, false, c.fs));
}

// shoes: a sole under sneakers, a shaft for boots, straps for sandals
function shoes(c: Ctx, side: 'L' | 'R', foot: number, shin: number, isFar: boolean): Item[] {
  const { j, u, id, colors } = c;
  const ankle = j[`ankle${side}`];
  const toe = j[`toe${side}`];
  const knee = j[`knee${side}`];
  const P = c.P;
  const out: Item[] = [];
  const shoe = colors.shoes;
  const kind = id.shoes;
  if (kind === 'boots' || kind === 'ankleboots') out.push(limb(`boot${side}`, P(ankle), P(lerp3(ankle, knee, kind === 'boots' ? 0.42 : 0.2)), shin * 1.18, shin * 1.12, shoe, c.o, c.rnd, isFar, c.fs));
  const elegant = kind === 'elegant';
  const tip: Point3 = elegant ? [toe[0] + 0.012 * u, toe[1], toe[2] - 0.004 * u] : toe;
  const r = elegant ? foot * 0.8 : kind === 'sandals' ? foot * 0.85 : foot;
  out.push(limb(`foot${side}`, P(ankle), P(tip), r, r * 0.85, kind === 'sandals' ? colors.skin : shoe, c.o, c.rnd, isFar, c.fs));
  if (kind === 'sneakers' || kind === 'sport' || kind === 'sandals' || kind === 'boots' || kind === 'ankleboots') {
    const back: Point3 = [ankle[0] - 0.012 * u, ankle[1], ankle[2] - 0.026 * u];
    const front: Point3 = [tip[0] + 0.006 * u, tip[1], tip[2] - 0.012 * u];
    out.push(limb(`sole${side}`, P(back), P(front), r * 0.4, r * 0.35, kind === 'sandals' ? shoe : id.sole, c.o, c.rnd, isFar, c.fs));
  }
  if (kind === 'sport') {
    const a = P(lerp3(ankle, tip, 0.25));
    const b = P(lerp3(ankle, tip, 0.75));
    const stripe = makePathItem('Stripe', { closed: false, anchors: [anchor(a.x, a.y + r * 0.1), anchor(b.x, b.y - r * 0.05)] }, defaultStyle(null, solid(isFar ? farTone(id.sole) : id.sole), Math.max(2, r * 0.35)));
    stripe.role = `stripe${side}`;
    out.push(stripe);
  }
  if (kind === 'sandals') {
    for (const [i, t] of [0.35, 0.7].entries()) {
      const p = P(lerp3(ankle, tip, t));
      const strap = makePathItem('Strap', { closed: false, anchors: [anchor(p.x - r * 0.7, p.y - r * 0.6), anchor(p.x + r * 0.7, p.y - r * 0.4)] }, defaultStyle(null, solid(shoe), Math.max(2, r * 0.3)));
      strap.role = `strap${i}${side}`;
      out.push(strap);
    }
  }
  return out;
}
