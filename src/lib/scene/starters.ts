import type { Item, Layer, PathData, Vec } from '$lib/core/types';
import { makeGroupItem, makePathItem, makeTextItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { ellipsePath, rectPath } from '$lib/core/shapes';
import { COMIC_SCENE_LAYERS } from '$lib/core/comic';
import { makeLayer, LAYER_COLORS } from '$lib/editor/editor';
import { seeded, shadeOf, wobble } from '$lib/character/model';

// ready made places to start a story in, drawn like the characters: flat muted fills, a darker cel
// shadow, bold dark lines that wobble a little. each one is the comic layers with the room on the
// background and the furniture on the midground, every piece its own object to move, recolor or take
// in a hand. drawn for a 1080 by 1920 stage and scaled to the stage of the document

export type StarterId = 'living' | 'office' | 'kitchen' | 'shop' | 'street' | 'bedroom' | 'storage' | 'train' | 'trainwindow' | 'trainexterior' | 'trainaisle' | 'platform';

export const STARTERS: { id: StarterId; label: string }[] = [
  { id: 'living', label: 'Living room' },
  { id: 'office', label: 'Office' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'shop', label: 'Shop' },
  { id: 'street', label: 'Street' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'storage', label: 'Storage room' },
  { id: 'train', label: 'Night train, inside' },
  { id: 'trainwindow', label: 'Night train, window' },
  { id: 'trainexterior', label: 'Night train, outside in the rain' },
  { id: 'trainaisle', label: 'Night train, down the aisle' },
  { id: 'platform', label: 'Abandoned platform at night' }
];

const INK = '#1d1b19';
const C = {
  charcoal: '#3a3734',
  grey: '#6e6962',
  fog: '#a9a49b',
  paper: '#e9e2d2',
  brick: '#97503f',
  rust: '#b0714b',
  ochre: '#c4a15e',
  olive: '#7b7d54',
  sage: '#8e9d88',
  teal: '#4e6d6a',
  slate: '#5b6b82',
  dusk: '#3e475e',
  plum: '#6b5066',
  rose: '#b38784',
  night: '#262a36',
  sky: '#c9d3cf',
  wood: '#8a6248'
};

// the kit the places are drawn with
export class Kit {
  private rnd: () => number;
  get sxv(): number {
    return this.sx;
  }
  get syv(): number {
    return this.sy;
  }
  constructor(
    private sx: number,
    private sy: number,
    seed: number,
    private line = 6
  ) {
    this.rnd = seeded(seed);
  }
  private scale(p: PathData): PathData {
    return { closed: p.closed, anchors: p.anchors.map((a) => ({ ...a, x: a.x * this.sx, y: a.y * this.sy, ix: a.ix * this.sx, iy: a.iy * this.sy, ox: a.ox * this.sx, oy: a.oy * this.sy })) };
  }
  // a flat fill with a dark line, the line a little wobbly
  shape(name: string, path: PathData, fill: string | null, line = this.line): Item {
    const drawn = wobble(this.scale(path), line * 0.25, this.rnd);
    return makePathItem(name, drawn, defaultStyle(fill ? solid(fill) : null, line > 0 ? solid(INK) : null, line * Math.min(this.sx, this.sy)));
  }
  rect(name: string, x: number, y: number, w: number, h: number, fill: string | null, line = this.line, r = 0): Item {
    return this.shape(name, rectPath(x, y, w, h, r), fill, line);
  }
  ellipse(name: string, cx: number, cy: number, rx: number, ry: number, fill: string | null, line = this.line): Item {
    return this.shape(name, ellipsePath(cx, cy, rx, ry), fill, line);
  }
  poly(name: string, pts: Vec[], fill: string | null, line = this.line): Item {
    return this.shape(name, { closed: true, anchors: pts.map((p) => ({ x: p.x, y: p.y, ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' as const })) }, fill, line);
  }
  stroke(name: string, pts: Vec[], line = this.line * 0.7): Item {
    return this.shape(name, { closed: false, anchors: pts.map((p) => ({ x: p.x, y: p.y, ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' as const })) }, null, line);
  }
  // a box with its cel shadow on the right side
  box(name: string, x: number, y: number, w: number, h: number, fill: string, r = 0): Item {
    return makeGroupItem(name, [this.rect('Fill', x, y, w, h, fill, 0, r), this.rect('Shadow', x + w * 0.72, y, w * 0.28, h, shadeOf(fill), 0, 0), this.rect('Outline', x, y, w, h, null, this.line, r)]);
  }
  group(name: string, children: Item[]): Item {
    return makeGroupItem(name, children);
  }
}

// a wall, a floor and the line between them
function room(k: Kit, wall: string, floor: string, horizon = 1380): Item[] {
  return [
    k.rect('Wall', -40, -40, 1160, horizon + 40, wall, 0),
    k.rect('Wall shadow', -40, -40, 1160, 260, shadeOf(wall), 0),
    k.rect('Floor', -40, horizon, 1160, 2000 - horizon, floor, 0),
    k.rect('Baseboard', -40, horizon - 30, 1160, 34, shadeOf(floor), 6)
  ];
}

function windowOn(k: Kit, x: number, y: number, w: number, h: number, sky = C.sky): Item {
  return k.group('Window', [
    k.rect('Frame', x - 14, y - 14, w + 28, h + 28, C.paper),
    k.rect('Sky', x, y, w, h, sky, 4),
    k.ellipse('Cloud', x + w * 0.35, y + h * 0.3, w * 0.18, h * 0.06, '#e6ebe7', 0),
    k.stroke('Bar', [
      { x: x + w / 2, y },
      { x: x + w / 2, y: y + h }
    ]),
    k.stroke('Bar', [
      { x, y: y + h / 2 },
      { x: x + w, y: y + h / 2 }
    ]),
    k.rect('Sill', x - 30, y + h + 14, w + 60, 26, C.paper)
  ]);
}

function plant(k: Kit, x: number, ground: number): Item {
  return k.group('Plant', [
    k.ellipse('Leaf', x - 40, ground - 210, 46, 90, C.olive),
    k.ellipse('Leaf', x + 40, ground - 230, 46, 100, C.sage),
    k.ellipse('Leaf', x, ground - 280, 50, 110, C.olive),
    k.poly('Pot', [
      { x: x - 70, y: ground - 150 },
      { x: x + 70, y: ground - 150 },
      { x: x + 52, y: ground },
      { x: x - 52, y: ground }
    ], C.rust)
  ]);
}

function lamp(k: Kit, x: number, ground: number, color = C.ochre): Item {
  return k.group('Floor lamp', [
    k.stroke('Pole', [
      { x, y: ground - 560 },
      { x, y: ground - 10 }
    ], 10),
    k.ellipse('Foot', x, ground - 8, 70, 16, C.charcoal),
    k.poly('Shade', [
      { x: x - 60, y: ground - 690 },
      { x: x + 60, y: ground - 690 },
      { x: x + 100, y: ground - 560 },
      { x: x - 100, y: ground - 560 }
    ], color)
  ]);
}

function living(k: Kit): { back: Item[]; mid: Item[] } {
  return {
    back: [
      ...room(k, C.sage, C.wood),
      windowOn(k, 640, 420, 300, 420),
      k.group('Picture', [k.rect('Frame', 150, 470, 300, 220, C.ochre), k.rect('Picture', 175, 495, 250, 170, C.teal, 4), k.poly('Hill', [{ x: 175, y: 665 }, { x: 290, y: 560 }, { x: 425, y: 665 }], C.olive, 0)]),
      k.ellipse('Rug', 540, 1700, 470, 90, C.rose)
    ],
    mid: [
      k.group('Sofa', [
        k.box('Back', 90, 1080, 700, 260, C.slate, 30),
        k.box('Seat', 70, 1280, 740, 150, C.slate, 24),
        k.box('Arm', 40, 1200, 110, 250, shadeOf(C.slate), 30),
        k.box('Arm', 730, 1200, 110, 250, shadeOf(C.slate), 30),
        k.box('Cushion', 160, 1150, 200, 150, C.ochre, 30)
      ]),
      lamp(k, 950, 1440),
      plant(k, 980, 1880),
      k.group('Coffee table', [k.box('Top', 300, 1560, 420, 40, C.wood, 8), k.rect('Leg', 330, 1600, 24, 120, C.charcoal), k.rect('Leg', 666, 1600, 24, 120, C.charcoal)]),
      k.group('Mug', [k.box('Mug', 470, 1500, 56, 62, C.paper, 6), k.ellipse('Handle', 534, 1530, 16, 18, null, 5)])
    ]
  };
}

function office(k: Kit): { back: Item[]; mid: Item[] } {
  const blinds: Item[] = [];
  for (let i = 0; i < 8; i++) blinds.push(k.stroke('Blind', [{ x: 600, y: 360 + i * 50 }, { x: 960, y: 360 + i * 50 }], 4));
  return {
    back: [
      ...room(k, C.fog, C.grey),
      k.group('Window', [k.rect('Frame', 590, 340, 380, 420, C.sky), ...blinds]),
      k.group('Clock', [k.ellipse('Face', 300, 420, 70, 70, C.paper), k.stroke('Hand', [{ x: 300, y: 420 }, { x: 300, y: 370 }]), k.stroke('Hand', [{ x: 300, y: 420 }, { x: 335, y: 432 }])]),
      k.group('Shelf', [
        k.rect('Board', 80, 760, 380, 24, C.wood),
        k.box('Folder', 110, 640, 50, 120, C.brick),
        k.box('Folder', 165, 650, 50, 110, C.teal),
        k.box('Folder', 220, 630, 50, 130, C.ochre),
        k.box('Box', 320, 680, 110, 80, C.paper)
      ])
    ],
    mid: [
      k.group('Desk', [k.box('Top', 120, 1240, 840, 50, C.wood, 6), k.box('Drawers', 760, 1290, 180, 320, shadeOf(C.wood), 6), k.rect('Leg', 150, 1290, 30, 320, C.charcoal)]),
      k.group('Monitor', [k.box('Screen', 330, 960, 380, 240, C.night, 12), k.rect('Glow', 350, 980, 340, 200, C.slate, 0, 8), k.rect('Stand', 500, 1200, 40, 40, C.charcoal)]),
      k.group('Mug', [k.box('Mug', 800, 1180, 56, 62, C.brick, 6)]),
      k.group('Chair', [k.box('Back', 200, 1180, 220, 260, C.dusk, 30), k.box('Seat', 180, 1420, 260, 50, C.dusk, 14), k.stroke('Post', [{ x: 310, y: 1470 }, { x: 310, y: 1620 }], 12), k.stroke('Feet', [{ x: 210, y: 1640 }, { x: 410, y: 1640 }], 12)]),
      plant(k, 990, 1820)
    ]
  };
}

function kitchen(k: Kit): { back: Item[]; mid: Item[] } {
  const tiles: Item[] = [];
  for (let y = 880; y < 1180; y += 75) tiles.push(k.stroke('Tile line', [{ x: -40, y }, { x: 1120, y }], 3));
  for (let x = 0; x < 1120; x += 90) tiles.push(k.stroke('Tile line', [{ x, y: 880 }, { x, y: 1180 }], 3));
  return {
    back: [
      ...room(k, C.paper, C.grey),
      k.rect('Tiles', -40, 880, 1160, 300, C.sage, 0),
      ...tiles,
      windowOn(k, 380, 500, 300, 300),
      k.group('Upper cabinets', [k.box('Cabinet', 40, 340, 280, 360, C.teal, 8), k.box('Cabinet', 740, 340, 300, 360, C.teal, 8)])
    ],
    mid: [
      k.group('Counter', [k.box('Cabinets', -20, 1240, 820, 380, C.teal, 6), k.rect('Top', -40, 1190, 860, 56, C.ochre), k.stroke('Door', [{ x: 260, y: 1270 }, { x: 260, y: 1590 }], 4), k.stroke('Door', [{ x: 530, y: 1270 }, { x: 530, y: 1590 }], 4)]),
      k.group('Fridge', [k.box('Body', 830, 700, 260, 920, C.paper, 24), k.stroke('Split', [{ x: 830, y: 1020 }, { x: 1090, y: 1020 }], 5), k.rect('Handle', 860, 880, 18, 100, C.charcoal, 4)]),
      k.group('Pot', [k.box('Pot', 120, 1090, 180, 100, C.charcoal, 10), k.rect('Lid', 110, 1075, 200, 22, C.grey, 5, 8)]),
      k.group('Bottle', [k.box('Bottle', 520, 1060, 56, 130, C.olive, 12), k.rect('Cap', 532, 1036, 32, 28, C.brick, 4)])
    ]
  };
}

// the shop: two shelves full of products, each one an object to take
function shop(k: Kit): { back: Item[]; mid: Item[] } {
  const products: Item[] = [];
  const colors = [C.brick, C.teal, C.ochre, C.plum, C.olive, C.slate, C.rust, C.rose];
  let n = 0;
  for (const [y, h] of [
    [1000, 120],
    [1230, 110]
  ] as const) {
    for (let i = 0; i < 6; i++) {
      const x = 90 + i * 100;
      const c = colors[n % colors.length];
      n++;
      const bottle = i % 2 === 0;
      products.push(
        bottle
          ? k.group(`Product ${n}`, [k.box('Bottle', x, y - h, 60, h, c, 14), k.rect('Label', x + 6, y - h * 0.6, 48, h * 0.3, C.paper, 3), k.rect('Cap', x + 14, y - h - 22, 32, 24, C.charcoal, 4)])
          : k.group(`Product ${n}`, [k.box('Box', x - 6, y - h, 74, h, c, 4), k.rect('Label', x + 4, y - h * 0.7, 54, h * 0.3, C.paper, 3)])
      );
    }
  }
  return {
    back: [
      ...room(k, C.paper, C.fog),
      k.group('Sign', [k.box('Sign', 260, 300, 560, 150, C.brick, 16), k.rect('Stripe', 300, 400, 480, 14, C.ochre, 0)]),
      k.group('Awning stripes', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => k.rect('Stripe', i * 110 - 20, 160, 110, 60, i % 2 ? C.paper : C.teal, 4)))
    ],
    mid: [
      k.group('Shelf', [
        k.box('Back', 60, 760, 640, 600, C.wood, 6),
        k.rect('Board', 50, 1000, 660, 26, shadeOf(C.wood)),
        k.rect('Board', 50, 1230, 660, 26, shadeOf(C.wood)),
        k.rect('Board', 50, 760, 660, 26, shadeOf(C.wood))
      ]),
      ...products,
      k.group('Counter', [k.box('Counter', 760, 1180, 340, 440, C.teal, 8), k.rect('Top', 740, 1160, 380, 40, C.ochre), k.box('Register', 860, 1060, 160, 100, C.charcoal, 10)])
    ]
  };
}

function street(k: Kit): { back: Item[]; mid: Item[] } {
  const houses: Item[] = [];
  const hc = [C.brick, C.slate, C.ochre, C.teal, C.rust];
  let x = -60;
  let i = 0;
  while (x < 1100) {
    const w = 220 + ((i * 53) % 80);
    const h = 600 + ((i * 97) % 300);
    const win: Item[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) win.push(k.rect('Window', x + 40 + c * (w / 2 - 20), 1260 - h + 80 + r * 150, 60, 90, C.sky, 4));
    houses.push(k.group('House', [k.box('House', x, 1260 - h, w, h, hc[i % hc.length], 0), ...win]));
    x += w;
    i++;
  }
  return {
    back: [k.rect('Sky', -40, -40, 1160, 1400, C.sky, 0), k.ellipse('Cloud', 300, 300, 160, 50, '#e6ebe7', 0), k.ellipse('Cloud', 800, 200, 120, 40, '#e6ebe7', 0), ...houses],
    mid: [
      k.rect('Sidewalk', -40, 1260, 1160, 440, C.fog, 6),
      k.rect('Curb', -40, 1700, 1160, 30, C.grey, 6),
      k.rect('Road', -40, 1730, 1160, 300, C.charcoal, 0),
      k.group('Street lamp', [k.stroke('Pole', [{ x: 900, y: 1640 }, { x: 900, y: 860 }], 14), k.ellipse('Light', 900, 840, 50, 34, C.ochre)]),
      k.group('Bench', [k.box('Seat', 120, 1500, 320, 34, C.wood, 6), k.box('Back', 120, 1400, 320, 60, C.wood, 6), k.rect('Leg', 140, 1534, 20, 90, C.charcoal), k.rect('Leg', 400, 1534, 20, 90, C.charcoal)]),
      k.group('Tree', [k.rect('Trunk', 590, 1200, 50, 440, C.wood), k.ellipse('Crown', 615, 1050, 190, 220, C.olive), k.ellipse('Crown', 540, 1120, 110, 120, C.sage)])
    ]
  };
}

function bedroom(k: Kit): { back: Item[]; mid: Item[] } {
  return {
    back: [
      ...room(k, C.rose, C.wood),
      windowOn(k, 160, 420, 280, 380, C.dusk),
      k.ellipse('Moon', 360, 520, 34, 34, C.paper, 0),
      k.group('Poster', [k.rect('Poster', 640, 460, 240, 320, C.ochre), k.ellipse('Sun', 760, 580, 60, 60, C.brick, 4)]),
      k.ellipse('Rug', 520, 1760, 380, 80, C.sage)
    ],
    mid: [
      k.group('Bed', [k.box('Headboard', 360, 1020, 120, 520, C.wood, 20), k.box('Frame', 400, 1360, 680, 180, C.wood, 10), k.box('Blanket', 470, 1230, 610, 170, C.slate, 30), k.box('Pillow', 450, 1180, 180, 90, C.paper, 30)]),
      k.group('Night table', [k.box('Table', 120, 1300, 200, 240, shadeOf(C.wood), 8), k.box('Lamp base', 180, 1220, 80, 80, C.teal, 20), k.poly('Shade', [{ x: 160, y: 1110 }, { x: 280, y: 1110 }, { x: 310, y: 1220 }, { x: 130, y: 1220 }], C.ochre)]),
      k.group('Book', [k.box('Book', 160, 1280, 110, 22, C.brick, 3)])
    ]
  };
}

function storage(k: Kit): { back: Item[]; mid: Item[] } {
  const boxes: Item[] = [];
  const shelfBoxes = (x0: number, y: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const w = 110 + ((i * 37) % 40);
      const h = 90 + ((i * 23) % 40);
      boxes.push(k.group('Box', [k.box('Box', x0 + i * 140, y - h, w, h, C.ochre, 4), k.stroke('Tape', [{ x: x0 + i * 140 + w / 2, y: y - h }, { x: x0 + i * 140 + w / 2, y: y - h * 0.6 }], 4)]));
    }
  };
  shelfBoxes(80, 900, 4);
  shelfBoxes(80, 1180, 4);
  return {
    back: [
      ...room(k, C.grey, C.charcoal),
      k.group('Door', [k.box('Door', 720, 760, 280, 620, C.wood, 6), k.ellipse('Knob', 750, 1080, 14, 14, C.ochre, 4)]),
      k.group('Bulb', [k.stroke('Cord', [{ x: 540, y: -40 }, { x: 540, y: 300 }], 4), k.ellipse('Bulb', 540, 330, 40, 46, '#efe2b0')])
    ],
    mid: [
      k.group('Metal shelf', [
        k.stroke('Post', [{ x: 60, y: 620 }, { x: 60, y: 1440 }], 14),
        k.stroke('Post', [{ x: 660, y: 620 }, { x: 660, y: 1440 }], 14),
        k.rect('Board', 50, 900, 620, 22, C.fog),
        k.rect('Board', 50, 1180, 620, 22, C.fog),
        k.rect('Board', 50, 1420, 620, 22, C.fog)
      ]),
      ...boxes,
      k.group('Stacked boxes', [k.box('Box', 760, 1460, 240, 180, C.ochre, 4), k.box('Box', 790, 1300, 180, 160, shadeOf(C.ochre), 4)])
    ]
  };
}


// a regional train at night: cold dim light, rain on black windows, worn seats facing each other
const T = { wall: '#3c4447', wallLow: '#2d3436', ceiling: '#5d6260', light: '#d8d6bd', night: '#0f1319', rain: '#5d6f80', seat: '#34465a', seatDark: '#26333f', pole: '#b89a4a', floor: '#22272b', sign: '#141414', amber: '#f0a23a' };

function rainStreaks(k: Kit, x: number, y: number, w: number, h: number, seed: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < 14; i++) {
    const px = x + ((i * 97 + seed * 31) % w);
    const py = y + ((i * 53 + seed * 17) % (h - 120));
    const len = 50 + ((i * 29) % 70);
    out.push(k.stroke('Rain', [{ x: px, y: py }, { x: px - 10, y: py + len }], 2.2));
  }
  for (const it of out) {
    it.opacity = 0.55;
    if (it.type === 'path') it.style = { ...it.style, stroke: solid(T.rain) };
  }
  return out;
}

// the board over the door, its text an item of its own that a story can change
export function trainDisplay(k: Kit, text: string, x = 300, y = 210, w = 480, h = 92): Item {
  const label = makeTextItem(text, 'JetBrains Mono', 44 * k.sxv, defaultStyle(solid(T.amber), null, 0), [1, 0, 0, 1, (x + 24) * k.sxv, (y + 22) * k.syv], (w - 48) * k.sxv);
  label.name = 'Display text';
  label.weight = 700;
  label.align = 'center';
  return k.group('Display', [k.rect('Display case', x - 12, y - 12, w + 24, h + 24, '#2a2d2f'), k.rect('Display', x, y, w, h, T.sign, 0), label]);
}

function train(k: Kit): { back: Item[]; mid: Item[] } {
  const winTop = 470;
  const winBottom = 1060;
  const back: Item[] = [
    k.rect('Wall', -40, -40, 1160, 2040, T.wall, 0),
    k.rect('Ceiling', -40, -40, 1160, 330, T.ceiling, 0),
    k.rect('Light strip', 120, 120, 840, 34, T.light, 4),
    k.rect('Ceiling edge', -40, 290, 1160, 26, T.wallLow, 6),
    k.group('Loudspeaker', [k.ellipse('Speaker', 860, 205, 52, 30, '#4a4e4f'), k.stroke('Grille', [{ x: 828, y: 205 }, { x: 892, y: 205 }], 3), k.stroke('Grille', [{ x: 836, y: 192 }, { x: 884, y: 192 }], 3), k.stroke('Grille', [{ x: 836, y: 218 }, { x: 884, y: 218 }], 3)]),
    trainDisplay(k, '23:48'),
    k.rect('Window band', -40, winTop - 30, 1160, winBottom - winTop + 60, T.wallLow, 0)
  ];
  for (const [x0, x1] of [[-20, 330], [380, 700], [750, 1100]]) {
    back.push(k.group('Window', [k.rect('Glass', x0, winTop, x1 - x0, winBottom - winTop, T.night, 6, 26), ...rainStreaks(k, x0 + 20, winTop + 20, x1 - x0 - 40, winBottom - winTop - 40, x0), k.rect('Reflection', x0 + 30, winTop + 30, 40, winBottom - winTop - 60, '#2a3340', 0, 12)]));
  }
  back.push(k.rect('Lower wall', -40, winBottom + 30, 1160, 600, T.wallLow, 0), k.rect('Floor', -40, 1640, 1160, 400, T.floor, 0), k.stroke('Floor line', [{ x: -40, y: 1640 }, { x: 1120, y: 1640 }], 6));
  const seat = (x: number, w: number, flip: boolean): Item =>
    k.group('Seat', [
      k.rect('Backrest', x, 1080, w, 380, T.seat, 6, 28),
      k.rect('Backrest shadow', flip ? x : x + w * 0.7, 1090, w * 0.3, 360, T.seatDark, 0, 20),
      k.rect('Headrest', x + 20, 1060, w - 40, 70, '#9ea7a6', 5, 18),
      k.rect('Cushion', x - 20, 1420, w + 40, 90, T.seat, 6, 24),
      k.rect('Base', x + 20, 1500, w - 40, 140, T.seatDark, 5, 8)
    ]);
  const mid: Item[] = [
    seat(40, 420, false),
    seat(620, 420, true),
    k.group('Pole', [k.stroke('Pole', [{ x: 540, y: 300 }, { x: 540, y: 1640 }], 16), k.ellipse('Foot', 540, 1640, 40, 12, T.pole, 4)]),
    k.stroke('Handrail', [{ x: -40, y: 360 }, { x: 1120, y: 360 }], 10)
  ];
  return { back, mid };
}

// close at the window: the night outside fills the picture, a story puts fog and signs behind the glass
function trainwindow(k: Kit): { back: Item[]; mid: Item[] } {
  return {
    back: [
      k.rect('Night', -40, -40, 1160, 2040, T.night, 0),
      k.ellipse('Moon glow', 760, 420, 200, 200, '#1b2330', 0),
      k.poly('Far trees', [{ x: -40, y: 1300 }, { x: 80, y: 1180 }, { x: 160, y: 1250 }, { x: 260, y: 1120 }, { x: 380, y: 1240 }, { x: 520, y: 1150 }, { x: 640, y: 1260 }, { x: 780, y: 1160 }, { x: 900, y: 1240 }, { x: 1120, y: 1140 }, { x: 1120, y: 2000 }, { x: -40, y: 2000 }], '#0b0e12', 0)
    ],
    mid: [
      k.rect('Frame top', -40, -40, 1160, 260, T.wall, 0),
      k.rect('Frame bottom', -40, 1640, 1160, 400, T.wall, 0),
      k.rect('Frame left', -40, -40, 140, 2040, T.wallLow, 0),
      k.rect('Frame right', 980, -40, 140, 2040, T.wallLow, 0),
      k.rect('Glass edge', 100, 220, 880, 1420, null, 10, 40),
      ...rainStreaks(k, 130, 260, 820, 1340, 3),
      ...rainStreaks(k, 130, 900, 820, 700, 11),
      k.rect('Sill', 60, 1620, 960, 50, '#4b5254', 6, 6)
    ]
  };
}

// the train from outside: a dark forest in the rain, the lit windows of a regional train on the embankment
function trainexterior(k: Kit): { back: Item[]; mid: Item[] } {
  const back: Item[] = [k.rect('Sky', -40, -40, 1160, 2040, '#10151d', 0), k.ellipse('Cloud glow', 300, 300, 420, 160, '#18202b', 0), k.ellipse('Cloud glow', 850, 520, 380, 140, '#161d27', 0)];
  const trees = (y: number, h: number, fill: string, step: number, seed: number) => {
    const pts: Vec[] = [{ x: -40, y: y + 400 }];
    for (let x = -40, i = 0; x <= 1160; x += step, i++) {
      const tall = h * (0.7 + ((i * 37 + seed) % 10) / 20);
      pts.push({ x, y }, { x: x + step / 2, y: y - tall }, { x: x + step, y });
    }
    pts.push({ x: 1160, y: y + 400 });
    return k.poly('Forest', pts, fill, 0);
  };
  back.push(trees(1050, 260, '#0d1117', 120, 3), trees(1180, 300, '#0a0d12', 150, 7));
  back.push(...rainStreaks(k, 0, 0, 1080, 1900, 5), ...rainStreaks(k, 0, 600, 1080, 1300, 9));
  const cars: Item[] = [];
  for (let c = 0; c < 3; c++) {
    const x0 = -200 + c * 760;
    const wins: Item[] = [];
    for (let w = 0; w < 5; w++) wins.push(k.rect('Lit window', x0 + 50 + w * 140, 1265, 100, 80, '#e8d9a0', 4, 10));
    cars.push(k.group('Car', [k.rect('Body', x0, 1230, 740, 230, '#3b4a52', 6, 24), k.rect('Roof', x0 + 10, 1200, 720, 40, '#2a343a', 5, 14), ...wins, k.rect('Stripe', x0, 1380, 740, 22, '#8a2a2a', 0), k.ellipse('Wheel', x0 + 120, 1470, 34, 34, '#15181b', 5), k.ellipse('Wheel', x0 + 620, 1470, 34, 34, '#15181b', 5)]));
  }
  const mid: Item[] = [
    k.group('Train', cars),
    k.rect('Embankment', -40, 1500, 1160, 540, '#0c0f13', 0),
    k.stroke('Rail', [{ x: -40, y: 1505 }, { x: 1120, y: 1505 }], 8)
  ];
  return { back, mid };
}

// down the aisle of the carriage: seat rows in perspective, the heads of the other passengers, the glow
// of their phones on their faces
function trainaisle(k: Kit): { back: Item[]; mid: Item[] } {
  const vp = { x: 540, y: 820 };
  const back: Item[] = [
    k.rect('Wall', -40, -40, 1160, 2040, T.wall, 0),
    k.poly('Ceiling', [{ x: -40, y: -40 }, { x: 1120, y: -40 }, { x: 640, y: 740 }, { x: 440, y: 740 }], T.ceiling, 0),
    k.poly('Floor', [{ x: -40, y: 2000 }, { x: 1120, y: 2000 }, { x: 620, y: 900 }, { x: 460, y: 900 }], T.floor, 0),
    k.poly('Light', [{ x: 470, y: 80 }, { x: 610, y: 80 }, { x: 560, y: 600 }, { x: 520, y: 600 }], T.light, 0),
    k.rect('End door', 470, 700, 140, 200, '#2a3033', 6, 6),
    k.rect('Door window', 500, 720, 80, 90, T.night, 4, 4),
    k.poly('Window left', [{ x: -40, y: 380 }, { x: 430, y: 690 }, { x: 430, y: 840 }, { x: -40, y: 1050 }], T.night, 5),
    k.poly('Window right', [{ x: 1120, y: 380 }, { x: 650, y: 690 }, { x: 650, y: 840 }, { x: 1120, y: 1050 }], T.night, 5)
  ];
  const mid: Item[] = [];
  // rows from the back to the front, each row nearer and bigger
  const rows = [0.18, 0.3, 0.45, 0.63, 0.85];
  rows.forEach((t, r) => {
    const s = 0.25 + t * 1.2;
    for (const side of [-1, 1]) {
      const x = vp.x + side * (90 + t * 520);
      const y = vp.y + t * 760;
      const w = 200 * s;
      const h = 230 * s;
      const items: Item[] = [k.rect('Seat back', x - w / 2, y - h, w, h, T.seat, 5, 20 * s), k.rect('Headrest', x - w * 0.4, y - h - 10 * s, w * 0.8, 40 * s, '#9ea7a6', 4, 10 * s)];
      // someone sits here in most rows
      if ((r + (side > 0 ? 1 : 0)) % 3 !== 2) {
        const hx = x + side * -w * 0.05;
        const hy = y - h - 60 * s;
        items.push(k.ellipse('Passenger head', hx, hy, 46 * s, 54 * s, ['#3a3430', '#5a4636', '#2c2a28', '#7a6a5a'][(r + side + 4) % 4], 4));
        const glow = k.ellipse('Phone glow', hx, hy + 10 * s, 50 * s, 40 * s, '#9fd0ff', 0);
        glow.opacity = 0.35;
        items.push(glow);
      }
      mid.push(k.group(`Row ${r + 1}`, items));
    }
  });
  return { back, mid };
}

// the station that should not exist: a crumbling platform in the fog, one weak lamp, the rails
function platform(k: Kit): { back: Item[]; mid: Item[] } {
  return {
    back: [
      k.rect('Sky', -40, -40, 1160, 2040, '#151a20', 0),
      k.ellipse('Fog glow', 540, 900, 700, 300, '#232a31', 0),
      k.poly('Trees', [{ x: -40, y: 1000 }, { x: 120, y: 760 }, { x: 260, y: 960 }, { x: 420, y: 700 }, { x: 600, y: 980 }, { x: 760, y: 740 }, { x: 900, y: 960 }, { x: 1120, y: 780 }, { x: 1120, y: 1200 }, { x: -40, y: 1200 }], '#0d1014', 0),
      ...rainStreaks(k, 0, 0, 1080, 1800, 13)
    ],
    mid: [
      k.rect('Platform', -40, 1180, 1160, 260, '#4a4a46', 6, 0),
      k.rect('Platform edge', -40, 1180, 1160, 30, '#c9b25a', 5, 0),
      k.poly('Crack', [{ x: 300, y: 1210 }, { x: 340, y: 1300 }, { x: 320, y: 1440 }, { x: 310, y: 1440 }, { x: 328, y: 1300 }], '#2a2a28', 0),
      k.group('Lamp', [k.stroke('Lamp post', [{ x: 860, y: 600 }, { x: 860, y: 1185 }], 14), k.rect('Lamp head', 800, 570, 120, 40, '#2a2a28', 5, 8), Object.assign(k.ellipse('Lamp light', 860, 680, 170, 130, '#d9c98a', 0), { opacity: 0.35 })]),
      k.rect('Track bed', -40, 1440, 1160, 600, '#121418', 0),
      k.stroke('Rail', [{ x: -40, y: 1560 }, { x: 1120, y: 1560 }], 10),
      k.stroke('Rail', [{ x: -40, y: 1700 }, { x: 1120, y: 1700 }], 12)
    ]
  };
}

const DRAW: Record<StarterId, (k: Kit) => { back: Item[]; mid: Item[] }> = { living, office, kitchen, shop, street, bedroom, storage, train, trainwindow, trainexterior, trainaisle, platform };

// the layers of a place for a stage of width by height: the comic layers, the background a little
// further back for the camera
export function starterLayers(id: StarterId, width: number, height: number): Layer[] {
  const k = new Kit(width / 1080, height / 1920, id.length * 31 + 5);
  const drawn = DRAW[id](k);
  const layers = COMIC_SCENE_LAYERS.map((name, i) => makeLayer(name, LAYER_COLORS[i % LAYER_COLORS.length]));
  layers[0].keyframes[0].items = drawn.back;
  layers[0].parallax = 0.7;
  layers[1].keyframes[0].items = drawn.mid;
  layers[1].parallax = 0.9;
  return layers;
}
