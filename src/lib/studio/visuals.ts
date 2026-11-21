import type { Anchor, Item, PathData, Vec } from '$lib/core/types';
import { makeGroupItem, makePathItem, makeTextItem } from '$lib/core/items';
import { defaultStyle, solid } from '$lib/core/style';
import { ellipsePath, rectPath } from '$lib/core/shapes';
import { translate } from '$lib/core/mat';
import { shadeOf } from '$lib/character/model';

// things to show besides people: objects, vehicles, animals, buildings, landscapes, machines, the body,
// diagrams, maps, history, science and action. each one is a group of flat shapes with a dark outline in
// the comic style, about 200 pixels across, ready to move, turn, scale and animate on the timeline

export type VisualCategory = 'objects' | 'vehicles' | 'animals' | 'buildings' | 'nature' | 'machines' | 'body' | 'charts' | 'maps' | 'history' | 'science' | 'action';

export const CATEGORIES: { id: VisualCategory; label: string }[] = [
  { id: 'objects', label: 'Objects' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'animals', label: 'Animals' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'nature', label: 'Landscape & space' },
  { id: 'machines', label: 'Machines' },
  { id: 'body', label: 'Body & organs' },
  { id: 'charts', label: 'Charts' },
  { id: 'maps', label: 'Maps' },
  { id: 'history', label: 'History & fantasy' },
  { id: 'science', label: 'Science' },
  { id: 'action', label: 'Action & effects' }
];

const INK = '#1d1b19';
const C = {
  paper: '#ece8df',
  cream: '#e4d6b8',
  ochre: '#c4a15e',
  rust: '#b0714b',
  brick: '#97503f',
  red: '#a8433a',
  rose: '#c08b8a',
  plum: '#6b5066',
  sky: '#8fa9c4',
  slate: '#5b6b82',
  navy: '#2b3348',
  teal: '#4e6d6a',
  sage: '#8e9d88',
  green: '#5c7a4f',
  olive: '#6b6d45',
  grey: '#7d7a76',
  light: '#b5b2ac',
  char: '#3d3b39',
  brown: '#5e4433',
  skin: '#e2c4a6',
  yellow: '#e6c457',
  orange: '#d9853b',
  white: '#f7f4ee'
};

const line = 5;
const a = (x: number, y: number): Anchor => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' });
const poly = (pts: [number, number][], closed = true): PathData => ({ closed, anchors: pts.map(([x, y]) => a(x, y)) });
// a closed shape through points with soft corners
const blob = (pts: [number, number][], k = 0.2): PathData => {
  const n = pts.length;
  return {
    closed: true,
    anchors: pts.map(([x, y], i) => {
      const [px, py] = pts[(i - 1 + n) % n];
      const [nx, ny] = pts[(i + 1) % n];
      const tx = (nx - px) * k;
      const ty = (ny - py) * k;
      return { x, y, ix: -tx, iy: -ty, ox: tx, oy: ty, kind: 'smooth' as const };
    })
  };
};
const circlePts = (cx: number, cy: number, r: number, n: number, start = -Math.PI / 2, ry = r): [number, number][] =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos(start + (i / n) * Math.PI * 2) * r, cy + Math.sin(start + (i / n) * Math.PI * 2) * ry]);
const star = (cx: number, cy: number, r1: number, r2: number, n: number, start = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? r2 : r1;
    const t = start + (i / (n * 2)) * Math.PI * 2;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
  });

function shape(name: string, path: PathData, fill: string | null, width = line): Item {
  return makePathItem(name, path, defaultStyle(fill ? solid(fill) : null, width > 0 ? solid(INK) : null, width));
}
const R = (name: string, x: number, y: number, w: number, h: number, fill: string, r = 0) => shape(name, rectPath(x, y, w, h, r), fill);
const E = (name: string, x: number, y: number, rx: number, ry: number, fill: string | null, width = line) => shape(name, ellipsePath(x, y, rx, ry), fill, width);
const P = (name: string, pts: [number, number][], fill: string | null, width = line) => shape(name, poly(pts, fill !== null), fill, width);
const B = (name: string, pts: [number, number][], fill: string, k = 0.2) => shape(name, blob(pts, k), fill);
const L = (name: string, pts: [number, number][], width = line) => shape(name, poly(pts, false), null, width);
// a flat cel shadow on the right side of a box
const shade = (name: string, x: number, y: number, w: number, h: number, fill: string) => shape(name, rectPath(x + w * 0.7, y, w * 0.3, h, 0), shadeOf(fill), 0);

// a text on a visual, top left at x, y, wrapping at width
const Tx = (text: string, x: number, y: number, size: number, color: string, width: number, weight = 400, font = 'Inter', align: 'left' | 'center' | 'right' = 'left'): Item => {
  const t = makeTextItem(text, font, size, defaultStyle(solid(color), null, 0), [1, 0, 0, 1, x, y], width);
  t.weight = weight;
  t.align = align;
  t.lineHeight = 1.15;
  return t;
};
// a phone held upright, its screen content inside
const phone = (screen: Item[]): Item[] => [R('Body', -140, -240, 280, 480, '#1d1b19', 30), ...screen, R('Notch', -40, -232, 80, 14, '#1d1b19', 7), shape('Bezel', rectPath(-140, -240, 280, 480, 30), null)];

interface Def {
  id: string;
  label: string;
  category: VisualCategory;
  draw: () => Item[];
}

const DEFS: Def[] = [
  // objects
  { id: 'box', label: 'Box', category: 'objects', draw: () => [R('Box', -80, -60, 160, 120, C.ochre, 4), shade('Shadow', -80, -60, 160, 120, C.ochre), L('Tape', [[0, -60], [0, -20]], 4), R('Outline', -80, -60, 160, 120, 'transparent', 4)].slice(0, 3) },
  { id: 'phone', label: 'Phone', category: 'objects', draw: () => [R('Phone', -45, -85, 90, 170, C.char, 14), R('Screen', -36, -70, 72, 130, C.sky, 6), E('Button', 0, 72, 7, 7, C.light, 3)] },
  { id: 'door', label: 'Door', category: 'objects', draw: () => [R('Frame', -120, -270, 240, 540, C.brown), R('Door', -100, -250, 200, 500, C.rust, 4), R('Panel', -70, -210, 140, 170, shadeOf(C.rust), 4), R('Panel low', -70, 20, 140, 170, shadeOf(C.rust), 4), E('Knob', 66, 0, 13, 13, C.yellow, 4)] },
  { id: 'keys', label: 'Keys', category: 'objects', draw: () => [E('Ring', 0, -40, 34, 34, null, 8), R('Key', -12, -12, 24, 100, C.yellow, 6), R('Bit', 10, 56, 22, 14, C.yellow, 2), R('Tag', -70, -30, 44, 60, C.red, 8)] },
  { id: 'phone-map', label: 'Phone: map, no results', category: 'objects', draw: () => phone([R('Map', -125, -170, 250, 380, '#2b3138', 0), L('Road', [[-125, 40], [125, -60]], 10), L('Road', [[-40, -170], [10, 210]], 8), L('Road', [[-125, 150], [125, 120]], 6), R('Search', -110, -205, 220, 34, '#e9e6df', 10), Tx('Eichenfeld', -98, -200, 20, '#3a3734', 196), R('Panel', -110, 120, 220, 70, '#e9e6df', 10), Tx('Keine Ergebnisse', -100, 140, 20, '#97503f', 200, 700)]) },
  { id: 'phone-news', label: 'Phone: old newspaper article', category: 'objects', draw: () => phone([R('Page', -125, -210, 250, 420, '#e8e1cf', 0), Tx('ARCHIV · 1986', -110, -195, 15, '#7d7a76', 220, 700), Tx('Schweres Zugunglück bei Eichenfeld', -110, -168, 26, '#1d1b19', 220, 700, 'Lora'), R('Photo', -110, -60, 220, 110, '#5f5b55', 0), L('Track', [[-110, 40], [110, -20]], 6), Tx('Dorf wird aufgegeben, die Strecke stillgelegt.', -110, 62, 17, '#3a3734', 220, 400, 'Lora'), R('Line', -110, 130, 200, 6, '#b5b2ac', 0), R('Line', -110, 146, 210, 6, '#b5b2ac', 0), R('Line', -110, 162, 170, 6, '#b5b2ac', 0)]) },
  { id: 'phone-message', label: 'Phone: message from unknown', category: 'objects', draw: () => phone([R('Chat', -125, -210, 250, 420, '#15191f', 0), R('Header', -125, -210, 250, 56, '#232a33', 0), Tx('Unbekannt', -60, -196, 20, '#e9e6df', 150, 700), E('Avatar', -92, -182, 18, 18, '#5b6b82', 3), R('Bubble', -112, -110, 200, 170, '#e9e6df', 16), Tx('Tom, steig nicht aus. Lina ist nicht die, für die du sie hältst.', -100, -98, 21, '#1d1b19', 176, 400), Tx('00:16', 40, 66, 14, '#7d7a76', 50)]) },
  { id: 'station-sign', label: 'Old station sign', category: 'buildings', draw: () => [R('Post', -190, -40, 22, 260, '#3d3b39', 4), R('Post', 168, -40, 22, 260, '#3d3b39', 4), R('Board', -230, -110, 460, 120, '#d7c48e', 6), shape('Rust', blob([[-230, -60], [-170, -110], [-120, -90], [-150, -20], [-230, 10]], 0.3), '#8a5a3a', 0), shape('Rust', blob([[150, -110], [230, -110], [230, -30], [190, -50]], 0.3), '#8a5a3a', 0), shape('Edge', rectPath(-230, -110, 460, 120, 6), null), Tx('EICHENFELD', -210, -92, 64, '#1d1b19', 420, 400, 'Bebas Neue', 'center')] },
  { id: 'fog', label: 'Fog bank', category: 'nature', draw: () => [E('Fog', -160, 20, 260, 90, '#b9bfc2', 0), E('Fog', 120, -10, 280, 110, '#c6cbcd', 0), E('Fog', 0, 60, 320, 80, '#aeb4b7', 0)].map((f) => ({ ...f, opacity: 0.35 })) },
  { id: 'cup', label: 'Coffee cup', category: 'objects', draw: () => [P('Cup', [[-50, -50], [50, -50], [40, 60], [-40, 60]], C.paper), E('Handle', 62, 0, 22, 28, null, 7), E('Coffee', 0, -50, 50, 9, C.brown, 4), L('Steam', [[-10, -70], [-20, -95], [-8, -120]], 4)] },
  { id: 'book', label: 'Book', category: 'objects', draw: () => [R('Cover', -70, -90, 140, 180, C.red, 6), R('Pages', -60, -80, 120, 160, C.cream, 2), R('Spine', -70, -90, 18, 180, shadeOf(C.red), 4)] },
  { id: 'money', label: 'Money', category: 'objects', draw: () => [R('Note', -95, -50, 190, 100, C.sage, 6), E('Coin', 0, 0, 32, 32, C.green, 4), R('Note 2', -85, -40, 30, 18, C.green, 3)] },
  { id: 'bulb', label: 'Idea light bulb', category: 'objects', draw: () => [E('Glass', 0, -30, 60, 62, C.yellow), R('Base', -26, 30, 52, 40, C.light, 6), L('Ray', [[-90, -80], [-70, -65]], 6), L('Ray', [[90, -80], [70, -65]], 6), L('Ray', [[0, -120], [0, -100]], 6)] },
  { id: 'clock', label: 'Clock', category: 'objects', draw: () => [E('Face', 0, 0, 80, 80, C.paper), L('Hour', [[0, 0], [0, -45]], 7), L('Minute', [[0, 0], [38, 18]], 5), E('Middle', 0, 0, 6, 6, INK, 0)] },
  { id: 'gift', label: 'Gift', category: 'objects', draw: () => [R('Box', -70, -40, 140, 110, C.red, 4), R('Lid', -80, -65, 160, 30, shadeOf(C.red), 4), R('Ribbon', -12, -65, 24, 135, C.yellow, 2), E('Bow', -22, -78, 22, 14, C.yellow), E('Bow', 22, -78, 22, 14, C.yellow)] },
  { id: 'trophy', label: 'Trophy', category: 'objects', draw: () => [P('Cup', [[-60, -80], [60, -80], [40, 10], [-40, 10]], C.ochre), R('Stem', -12, 10, 24, 40, C.ochre), R('Base', -50, 50, 100, 30, C.brown, 4), E('Handle', -66, -45, 18, 28, null, 7), E('Handle', 66, -45, 18, 28, null, 7)] },
  // vehicles
  { id: 'car', label: 'Car', category: 'vehicles', draw: () => [B('Body', [[-120, 20], [-110, -20], [-60, -30], [-35, -70], [45, -70], [75, -30], [120, -20], [125, 25]], C.red, 0.08), P('Window', [[-28, -60], [10, -60], [10, -32], [-48, -32]], C.sky), P('Window', [[20, -60], [42, -60], [62, -32], [20, -32]], C.sky), E('Wheel', -70, 28, 26, 26, C.char), E('Wheel', 72, 28, 26, 26, C.char), E('Hub', -70, 28, 9, 9, C.light, 3), E('Hub', 72, 28, 9, 9, C.light, 3)] },
  { id: 'bus', label: 'Bus', category: 'vehicles', draw: () => [R('Body', -140, -80, 280, 120, C.yellow, 12), R('Window', -125, -65, 50, 40, C.sky, 4), R('Window', -65, -65, 50, 40, C.sky, 4), R('Window', -5, -65, 50, 40, C.sky, 4), R('Door', 60, -65, 40, 95, C.sky, 4), E('Wheel', -85, 42, 24, 24, C.char), E('Wheel', 85, 42, 24, 24, C.char)] },
  { id: 'bike', label: 'Bicycle', category: 'vehicles', draw: () => [E('Wheel', -70, 30, 45, 45, null, 7), E('Wheel', 70, 30, 45, 45, null, 7), L('Frame', [[-70, 30], [-10, -30], [40, -30], [70, 30], [10, 30], [-10, -30]], 7), L('Bar', [[40, -30], [50, -55], [70, -55]], 6), L('Seat', [[-20, -45], [5, -45]], 9)] },
  { id: 'rocket', label: 'Rocket', category: 'vehicles', draw: () => [B('Body', [[0, -130], [40, -60], [40, 60], [-40, 60], [-40, -60]], C.paper, 0.12), E('Window', 0, -40, 20, 20, C.sky), P('Fin', [[-40, 20], [-75, 75], [-40, 60]], C.red), P('Fin', [[40, 20], [75, 75], [40, 60]], C.red), P('Flame', [[-25, 60], [0, 125], [25, 60]], C.orange)] },
  { id: 'ufo', label: 'Spaceship', category: 'vehicles', draw: () => [E('Dome', 0, -25, 50, 40, C.sky), E('Saucer', 0, 10, 120, 32, C.light), E('Light', -60, 12, 10, 8, C.yellow, 3), E('Light', 0, 18, 10, 8, C.yellow, 3), E('Light', 60, 12, 10, 8, C.yellow, 3)] },
  { id: 'plane', label: 'Airplane', category: 'vehicles', draw: () => [B('Body', [[-130, 0], [-110, -18], [110, -18], [140, 0], [110, 18], [-110, 18]], C.paper, 0.1), P('Wing', [[-10, 0], [30, -80], [55, -80], [40, 0]], C.slate), P('Wing', [[-10, 5], [30, 70], [55, 70], [40, 5]], C.slate), P('Tail', [[-110, -10], [-130, -60], [-100, -60], [-80, -12]], C.red)] },
  // animals
  { id: 'cat', label: 'Cat', category: 'animals', draw: () => [E('Body', 0, 30, 70, 50, C.orange), E('Head', 50, -30, 42, 38, C.orange), P('Ear', [[22, -55], [30, -90], [48, -62]], C.orange), P('Ear', [[56, -62], [76, -88], [82, -50]], C.orange), E('Eye', 40, -32, 5, 7, INK, 0), E('Eye', 66, -32, 5, 7, INK, 0), L('Tail', [[-68, 30], [-100, -10], [-90, -50]], 9)] },
  { id: 'dog', label: 'Dog', category: 'animals', draw: () => [E('Body', 0, 30, 80, 48, C.cream), E('Head', 70, -25, 42, 38, C.cream), E('Ear', 52, -40, 14, 30, C.brown), E('Snout', 104, -15, 18, 14, C.cream), E('Nose', 118, -20, 7, 6, INK, 0), E('Eye', 80, -35, 5, 6, INK, 0), R('Leg', -55, 60, 20, 40, C.cream, 6), R('Leg', 35, 60, 20, 40, C.cream, 6)] },
  { id: 'bird', label: 'Bird', category: 'animals', draw: () => [E('Body', 0, 0, 55, 42, C.sky), P('Wing', [[-20, -5], [-60, -55], [20, -15]], C.slate), E('Eye', 30, -12, 5, 5, INK, 0), P('Beak', [[50, -5], [80, 2], [50, 10]], C.ochre)] },
  { id: 'fish', label: 'Fish', category: 'animals', draw: () => [E('Body', 0, 0, 80, 45, C.teal), P('Tail', [[-75, 0], [-120, -40], [-120, 40]], C.teal), E('Eye', 45, -10, 8, 8, C.white, 3), E('Pupil', 47, -10, 3, 3, INK, 0)] },
  // buildings
  { id: 'house', label: 'House', category: 'buildings', draw: () => [R('Wall', -90, -40, 180, 130, C.cream), P('Roof', [[-110, -40], [0, -130], [110, -40]], C.brick), R('Door', -20, 20, 40, 70, C.brown, 4), R('Window', -70, -15, 35, 35, C.sky, 3), R('Window', 35, -15, 35, 35, C.sky, 3)] },
  { id: 'tower', label: 'Skyscraper', category: 'buildings', draw: () => [R('Tower', -55, -180, 110, 300, C.slate), ...Array.from({ length: 6 }, (_, i) => R('Windows', -40, -160 + i * 45, 80, 25, C.sky, 2))] },
  { id: 'castle', label: 'Castle', category: 'buildings', draw: () => [R('Wall', -110, -40, 220, 120, C.light), R('Tower', -140, -110, 60, 190, C.light), R('Tower', 80, -110, 60, 190, C.light), P('Roof', [[-150, -110], [-110, -170], [-70, -110]], C.navy), P('Roof', [[70, -110], [110, -170], [150, -110]], C.navy), B('Gate', [[-25, 80], [-25, 20], [0, 0], [25, 20], [25, 80]], C.brown, 0.1)] },
  { id: 'temple', label: 'Temple', category: 'buildings', draw: () => [P('Roof', [[-130, -60], [0, -120], [130, -60]], C.cream), R('Beam', -120, -60, 240, 20, C.cream), ...[-95, -45, 5, 55].map((x) => R('Column', x, -40, 30, 120, C.paper)), R('Steps', -130, 80, 260, 20, C.light)] },
  // nature
  { id: 'mountain', label: 'Mountains', category: 'nature', draw: () => [P('Mountain', [[-160, 80], [-60, -80], [40, 80]], C.slate), P('Mountain', [[-20, 80], [70, -40], [160, 80]], C.teal), P('Snow', [[-60, -80], [-82, -45], [-38, -45]], C.white)] },
  { id: 'tree', label: 'Tree', category: 'nature', draw: () => [R('Trunk', -14, 0, 28, 110, C.brown), E('Crown', 0, -40, 80, 75, C.green), E('Crown', -35, -10, 45, 40, C.olive)] },
  { id: 'cloud', label: 'Cloud', category: 'nature', draw: () => [B('Cloud', [[-100, 30], [-110, -5], [-70, -30], [-40, -65], [20, -60], [50, -30], [100, -25], [115, 20], [80, 40]], C.white, 0.22)] },
  { id: 'sun', label: 'Sun', category: 'nature', draw: () => [P('Rays', star(0, 0, 110, 75, 12), C.orange), E('Sun', 0, 0, 65, 65, C.yellow)] },
  { id: 'moon', label: 'Moon', category: 'nature', draw: () => [E('Moon', 0, 0, 80, 80, C.cream), E('Crater', -20, -20, 14, 12, shadeOf(C.cream), 3), E('Crater', 25, 15, 18, 14, shadeOf(C.cream), 3)] },
  { id: 'planet', label: 'Planet', category: 'nature', draw: () => [E('Ring back', 0, 0, 140, 30, null, 6), E('Planet', 0, 0, 80, 80, C.rust), E('Band', 0, -10, 78, 12, shadeOf(C.rust), 0), P('Ring', [[-140, 0], [-80, 22], [80, 22], [140, 0]], null, 6)] },
  { id: 'earth', label: 'Earth', category: 'nature', draw: () => [E('Ocean', 0, 0, 90, 90, C.sky), B('Land', [[-50, -50], [-10, -60], [10, -30], [-20, 0], [-55, -10]], C.green, 0.25), B('Land', [[20, 10], [60, 0], [70, 40], [30, 60], [10, 35]], C.green, 0.25)] },
  { id: 'waves', label: 'Sea waves', category: 'nature', draw: () => [shape('Waves', { closed: true, anchors: [a(-160, 60), ...Array.from({ length: 9 }, (_, i) => ({ x: -160 + i * 40, y: i % 2 ? -10 : 10, ix: -12, iy: 0, ox: 12, oy: 0, kind: 'smooth' as const })), a(160, 60)] }, C.sky)] },
  // machines
  { id: 'gear', label: 'Gear', category: 'machines', draw: () => [P('Gear', star(0, 0, 90, 70, 10, 0), C.light), E('Hole', 0, 0, 28, 28, C.char)] },
  { id: 'robot', label: 'Robot', category: 'machines', draw: () => [R('Head', -50, -120, 100, 80, C.light, 12), E('Eye', -20, -82, 12, 12, C.sky, 3), E('Eye', 20, -82, 12, 12, C.sky, 3), L('Antenna', [[0, -120], [0, -150]], 5), E('Tip', 0, -155, 8, 8, C.red, 3), R('Body', -65, -35, 130, 120, C.slate, 10), R('Panel', -30, -5, 60, 40, C.yellow, 4)] },
  { id: 'computer', label: 'Computer', category: 'machines', draw: () => [R('Screen', -110, -100, 220, 140, C.char, 10), R('Display', -95, -85, 190, 110, C.sky, 4), R('Stand', -15, 40, 30, 35, C.light), R('Foot', -60, 75, 120, 14, C.light, 5)] },
  { id: 'satellite', label: 'Satellite', category: 'machines', draw: () => [R('Panel', -150, -25, 90, 50, C.navy, 2), R('Panel', 60, -25, 90, 50, C.navy, 2), R('Body', -40, -40, 80, 80, C.ochre, 6), L('Arm', [[-60, 0], [-40, 0]], 6), L('Arm', [[40, 0], [60, 0]], 6), E('Dish', 0, -60, 30, 12, C.light)] },
  // body
  { id: 'brain', label: 'Brain', category: 'body', draw: () => [B('Brain', [[-90, 20], [-100, -30], [-60, -75], [0, -85], [60, -75], [100, -30], [90, 20], [40, 45], [-40, 45]], C.rose, 0.18), L('Fold', [[0, -80], [5, -40], [-5, 0], [5, 40]], 4), L('Fold', [[-60, -40], [-30, -20], [-50, 10]], 4), L('Fold', [[60, -40], [30, -15], [55, 15]], 4)] },
  { id: 'heart', label: 'Heart', category: 'body', draw: () => [B('Heart', [[0, 90], [-90, 0], [-80, -60], [-35, -75], [0, -40], [35, -75], [80, -60], [90, 0]], C.red, 0.16), L('Vessel', [[-20, -55], [-25, -100]], 9), L('Vessel', [[15, -55], [25, -100]], 9)] },
  { id: 'lungs', label: 'Lungs', category: 'body', draw: () => [L('Windpipe', [[0, -110], [0, -40], [-30, -20]], 9), L('Windpipe', [[0, -40], [30, -20]], 9), B('Lung', [[-15, -40], [-25, 70], [-90, 60], [-95, -10], [-55, -60]], C.rose, 0.2), B('Lung', [[15, -40], [25, 70], [90, 60], [95, -10], [55, -60]], C.rose, 0.2)] },
  { id: 'eye', label: 'Eye', category: 'body', draw: () => [B('Eye', [[-110, 0], [0, -60], [110, 0], [0, 60]], C.white, 0.25), E('Iris', 0, 0, 42, 42, C.teal), E('Pupil', 0, 0, 18, 18, INK, 0)] },
  { id: 'neuron', label: 'Neuron', category: 'body', draw: () => [L('Axon', [[0, 0], [130, 30]], 7), ...[[-70, -60], [-90, 10], [-50, 70], [20, -80]].map(([x, y]) => L('Dendrite', [[0, 0], [x, y]], 6)), E('Cell', 0, 0, 38, 34, C.plum), E('Nucleus', 0, 0, 12, 12, C.rose, 3), E('End', 132, 30, 14, 14, C.plum)] },
  { id: 'skeleton', label: 'Bone', category: 'body', draw: () => [R('Shaft', -80, -14, 160, 28, C.paper, 6), E('End', -88, -16, 22, 18, C.paper), E('End', -88, 16, 22, 18, C.paper), E('End', 88, -16, 22, 18, C.paper), E('End', 88, 16, 22, 18, C.paper)] },
  // charts
  { id: 'bars', label: 'Bar chart', category: 'charts', draw: () => barChart([3, 5, 2, 7], ['A', 'B', 'C', 'D']) },
  { id: 'pie', label: 'Pie chart', category: 'charts', draw: () => pieChart([45, 30, 25]) },
  { id: 'arrow', label: 'Arrow', category: 'charts', draw: () => [P('Arrow', [[-120, -20], [40, -20], [40, -55], [120, 0], [40, 55], [40, 20], [-120, 20]], C.orange)] },
  { id: 'timeline', label: 'Timeline', category: 'charts', draw: () => [L('Line', [[-160, 0], [160, 0]], 8), ...[-120, -40, 40, 120].map((x, i) => E(`Step ${i + 1}`, x, 0, 18, 18, [C.teal, C.ochre, C.red, C.plum][i]))] },
  { id: 'thermo', label: 'Thermometer', category: 'charts', draw: () => [R('Tube', -18, -120, 36, 180, C.white, 18), R('Level', -9, -40, 18, 100, C.red, 9), E('Bulb', 0, 80, 32, 32, C.red)] },
  { id: 'percent', label: 'Big number', category: 'charts', draw: () => [E('Badge', 0, 0, 110, 110, C.yellow), P('Percent', [[-40, 50], [40, -50]], null, 12), E('Dot', -35, -30, 16, 16, INK, 0), E('Dot', 35, 30, 16, 16, INK, 0)] },
  // maps
  { id: 'map', label: 'World map', category: 'maps', draw: () => [R('Sea', -170, -100, 340, 200, C.sky, 10), B('America', [[-140, -70], [-90, -80], [-80, -20], [-110, 10], [-95, 70], [-120, 75], [-135, 20]], C.sage, 0.2), B('Europe Africa', [[-20, -75], [30, -80], [35, -30], [20, 60], [-5, 75], [-25, 10], [-35, -30]], C.sage, 0.2), B('Asia', [[40, -80], [140, -70], [150, -10], [90, 10], [50, -20]], C.sage, 0.2), B('Australia', [[100, 40], [150, 35], [145, 75], [105, 75]], C.sage, 0.2)] },
  { id: 'pin', label: 'Map pin', category: 'maps', draw: () => [B('Pin', [[0, 80], [-45, -10], [-40, -55], [0, -75], [40, -55], [45, -10]], C.red, 0.18), E('Hole', 0, -35, 16, 16, C.white, 3)] },
  { id: 'route', label: 'Route line', category: 'maps', draw: () => [shape('Route', { closed: false, anchors: [a(-150, 40), { x: -40, y: -50, ix: -40, iy: 0, ox: 40, oy: 0, kind: 'smooth' }, { x: 60, y: 40, ix: -40, iy: 0, ox: 40, oy: 0, kind: 'smooth' }, a(150, -40)] }, null, 7), E('Start', -150, 40, 12, 12, C.teal), E('End', 150, -40, 12, 12, C.red)] },
  // history and fantasy
  { id: 'pyramid', label: 'Pyramid', category: 'history', draw: () => [P('Pyramid', [[-150, 80], [0, -110], [150, 80]], C.ochre), P('Shade', [[0, -110], [150, 80], [40, 80]], shadeOf(C.ochre), 0)] },
  { id: 'column', label: 'Roman column', category: 'history', draw: () => [R('Top', -45, -130, 90, 22, C.paper, 3), R('Shaft', -30, -108, 60, 200, C.paper), ...[-15, 0, 15].map((x) => L('Flute', [[x, -100], [x, 85]], 3)), R('Base', -50, 92, 100, 25, C.paper, 3)] },
  { id: 'sword', label: 'Sword & shield', category: 'history', draw: () => [P('Blade', [[-6, -130], [6, -130], [10, 40], [0, 60], [-10, 40]], C.light), R('Guard', -40, 40, 80, 14, C.ochre, 4), R('Grip', -8, 54, 16, 50, C.brown, 4), B('Shield', [[60, -60], [150, -60], [150, 10], [105, 70], [60, 10]], C.red, 0.12)] },
  { id: 'scroll', label: 'Scroll', category: 'history', draw: () => [R('Paper', -90, -70, 180, 140, C.cream, 4), E('Roll', -95, 0, 16, 75, shadeOf(C.cream)), E('Roll', 95, 0, 16, 75, shadeOf(C.cream)), L('Text', [[-60, -35], [60, -35]], 4), L('Text', [[-60, 0], [50, 0]], 4), L('Text', [[-60, 35], [30, 35]], 4)] },
  { id: 'crystal', label: 'Magic crystal', category: 'history', draw: () => [P('Crystal', [[0, -120], [50, -30], [30, 90], [-30, 90], [-50, -30]], C.plum), L('Facet', [[0, -120], [0, 90]], 3), P('Glow', star(70, -80, 22, 8, 4), C.yellow, 3)] },
  { id: 'portal', label: 'Portal', category: 'history', draw: () => [E('Ring', 0, 0, 90, 120, C.plum), E('Swirl', 0, 0, 65, 92, C.teal), E('Center', 0, 0, 30, 45, C.sky)] },
  // science
  { id: 'atom', label: 'Atom', category: 'science', draw: () => [E('Orbit', 0, 0, 120, 40, null, 5), shape('Orbit', { closed: true, anchors: ellipsePath(0, 0, 120, 40).anchors.map((p) => rot(p, Math.PI / 3)) }, null, 5), shape('Orbit', { closed: true, anchors: ellipsePath(0, 0, 120, 40).anchors.map((p) => rot(p, -Math.PI / 3)) }, null, 5), E('Core', 0, 0, 22, 22, C.red)] },
  { id: 'dna', label: 'DNA', category: 'science', draw: () => [shape('Strand', { closed: false, anchors: Array.from({ length: 7 }, (_, i) => ({ x: Math.sin(i * 1.05) * 50, y: -150 + i * 50, ix: 0, iy: -18, ox: 0, oy: 18, kind: 'smooth' as const })) }, null, 7), shape('Strand', { closed: false, anchors: Array.from({ length: 7 }, (_, i) => ({ x: -Math.sin(i * 1.05) * 50, y: -150 + i * 50, ix: 0, iy: -18, ox: 0, oy: 18, kind: 'smooth' as const })) }, null, 7), ...Array.from({ length: 6 }, (_, i) => L('Rung', [[Math.sin((i + 0.5) * 1.05) * 46, -125 + i * 50], [-Math.sin((i + 0.5) * 1.05) * 46, -125 + i * 50]], 4))] },
  { id: 'blackhole', label: 'Black hole', category: 'science', draw: () => [E('Disk', 0, 0, 150, 45, C.orange), E('Glow', 0, 0, 110, 32, C.yellow, 0), E('Hole', 0, 0, 60, 60, '#0d0c10')] },
  { id: 'flask', label: 'Lab flask', category: 'science', draw: () => [P('Glass', [[-22, -110], [22, -110], [22, -40], [80, 80], [-80, 80], [-22, -40]], C.white), P('Liquid', [[-50, 20], [50, 20], [80, 80], [-80, 80]], C.green, 0), E('Bubble', -10, 45, 8, 8, C.white, 3), E('Bubble', 20, 30, 6, 6, C.white, 3)] },
  { id: 'magnifier', label: 'Magnifier', category: 'science', draw: () => [L('Handle', [[50, 50], [120, 120]], 18), E('Lens', 0, 0, 70, 70, C.sky)] },
  { id: 'solar', label: 'Solar system', category: 'science', draw: () => [E('Orbit', 0, 0, 160, 60, null, 3), E('Orbit', 0, 0, 100, 38, null, 3), E('Sun', 0, 0, 30, 30, C.yellow), E('Planet', 100, 0, 12, 12, C.teal), E('Planet', -140, 30, 16, 16, C.rust)] },
  // action
  { id: 'explosion', label: 'Explosion', category: 'action', draw: () => [P('Burst', star(0, 0, 140, 70, 11), C.orange), P('Core', star(0, 0, 85, 45, 9, 0.2), C.yellow), E('Smoke', -90, -70, 30, 26, C.light), E('Smoke', 95, 60, 26, 22, C.light)] },
  { id: 'impact', label: 'Impact star', category: 'action', draw: () => [P('Impact', star(0, 0, 110, 45, 8), C.yellow)] },
  { id: 'speed', label: 'Speed lines', category: 'action', draw: () => Array.from({ length: 7 }, (_, i) => L('Line', [[-160 + (i % 2) * 40, -90 + i * 30], [80 + (i % 3) * 30, -90 + i * 30]], 5)) },
  { id: 'smoke', label: 'Smoke puff', category: 'action', draw: () => [B('Smoke', [[-100, 20], [-90, -30], [-40, -60], [10, -50], [50, -70], [100, -20], [90, 30], [20, 50], [-50, 45]], C.light, 0.24)] },
  { id: 'lightning', label: 'Lightning', category: 'action', draw: () => [P('Bolt', [[20, -140], [-50, 10], [0, 10], [-30, 140], [60, -30], [10, -30], [40, -140]], C.yellow)] },
  { id: 'beam', label: 'Energy beam', category: 'action', draw: () => [R('Beam', -170, -30, 340, 60, C.sky, 30), R('Core', -170, -12, 340, 24, C.white, 12), E('Glow', 170, 0, 40, 50, C.sky)] },
  { id: 'clash', label: 'Clash', category: 'action', draw: () => [P('Clash', star(0, 0, 90, 30, 6), C.white), L('Slash', [[-130, -90], [130, 90]], 10), L('Slash', [[-130, 90], [130, -90]], 10)] },
  { id: 'shout', label: 'Shout bubble', category: 'action', draw: () => [P('Bubble', star(0, 0, 120, 85, 12), C.white), P('Mark', [[-10, -55], [10, -55], [6, 25], [-6, 25]], INK, 0), E('Dot', 0, 50, 9, 9, INK, 0)] },
  { id: 'question', label: 'Question marks', category: 'action', draw: () => [shape('Question', { closed: false, anchors: [a(-30, -40), { x: 0, y: -70, ix: -25, iy: 0, ox: 25, oy: 0, kind: 'smooth' }, { x: 30, y: -40, ix: 0, iy: -20, ox: 0, oy: 20, kind: 'smooth' }, a(0, 0), a(0, 25)] }, null, 12), E('Dot', 0, 55, 9, 9, INK, 0)] }
];

function rot(p: Anchor, t: number): Anchor {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { ...p, x: p.x * c - p.y * s, y: p.x * s + p.y * c, ix: p.ix * c - p.iy * s, iy: p.ix * s + p.iy * c, ox: p.ox * c - p.oy * s, oy: p.ox * s + p.oy * c };
}

// a bar chart from values: one bar each, all out of the same base line, the tallest 200 high
export function barChart(values: number[], labels: string[] = [], colors = [C.teal, C.ochre, C.red, C.plum, C.green, C.slate]): Item[] {
  const n = Math.max(1, values.length);
  const max = Math.max(1e-9, ...values.map((v) => Math.abs(v)));
  const w = 280 / n;
  const out: Item[] = [L('Axis', [[-150, 100], [150, 100]], 6)];
  values.forEach((v, i) => {
    const h = (Math.abs(v) / max) * 200;
    const bar = R(labels[i] ? `Bar ${labels[i]}` : `Bar ${i + 1}`, -140 + i * w + w * 0.15, 100 - h, w * 0.7, h, colors[i % colors.length], 3);
    bar.role = 'bar';
    out.push(bar);
  });
  return out;
}

// a pie chart from shares, wedges as polygons round the middle
export function pieChart(values: number[], colors = [C.teal, C.ochre, C.red, C.plum, C.green, C.slate]): Item[] {
  const sum = values.reduce((n, v) => n + Math.max(0, v), 0) || 1;
  let t = -Math.PI / 2;
  return values.map((v, i) => {
    const span = (Math.max(0, v) / sum) * Math.PI * 2;
    const steps = Math.max(2, Math.ceil(span / 0.2));
    const pts: [number, number][] = [[0, 0]];
    for (let k = 0; k <= steps; k++) pts.push([Math.cos(t + (span * k) / steps) * 110, Math.sin(t + (span * k) / steps) * 110]);
    t += span;
    const wedge = P(`Slice ${i + 1}`, pts, colors[i % colors.length]);
    wedge.role = 'slice';
    return wedge;
  });
}

export const VISUALS = DEFS.map(({ id, label, category }) => ({ id, label, category }));

// a visual as one group at a point of the stage, scaled
export function makeVisual(id: string, at: Vec, scale = 1): Item | null {
  const def = DEFS.find((d) => d.id === id);
  if (!def) return null;
  const children = def.draw().filter((c) => !(c.type === 'path' && c.style.fill?.type === 'solid' && c.style.fill.color === 'transparent'));
  const g = makeGroupItem(def.label, children, [scale, 0, 0, scale, at.x, at.y]);
  g.role = 'visual';
  return g;
}

export function makeChart(kind: 'bars' | 'pie', values: number[], labels: string[], at: Vec, scale = 1.4): Item {
  const g = makeGroupItem(kind === 'bars' ? 'Bar chart' : 'Pie chart', kind === 'bars' ? barChart(values, labels) : pieChart(values), [scale, 0, 0, scale, at.x, at.y]);
  g.role = 'visual';
  return g;
}

export { translate };
