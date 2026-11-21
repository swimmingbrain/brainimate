import type { Item, Layer, PathData, Vec } from '$lib/core/types';
import { makeGroupItem, makePathItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { ellipsePath, rectPath } from '$lib/core/shapes';
import { COMIC_SCENE_LAYERS } from '$lib/core/comic';
import { makeLayer, LAYER_COLORS } from '$lib/editor/editor';
import { seeded, shadeOf, wobble } from '$lib/character/model';

// ready made places to start a story in, drawn like the characters: flat muted fills, a darker cel
// shadow, bold dark lines that wobble a little. each one is the comic layers with the room on the
// background and the furniture on the midground, every piece its own object to move, recolor or take
// in a hand. drawn for a 1080 by 1920 stage and scaled to the stage of the document

export type StarterId = 'living' | 'office' | 'kitchen' | 'shop' | 'street' | 'bedroom' | 'storage';

export const STARTERS: { id: StarterId; label: string }[] = [
  { id: 'living', label: 'Living room' },
  { id: 'office', label: 'Office' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'shop', label: 'Shop' },
  { id: 'street', label: 'Street' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'storage', label: 'Storage room' }
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
class Kit {
  private rnd: () => number;
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

const DRAW: Record<StarterId, (k: Kit) => { back: Item[]; mid: Item[] }> = { living, office, kitchen, shop, street, bedroom, storage };

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
