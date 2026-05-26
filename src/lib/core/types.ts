export type Vec = { x: number; y: number };
// a b c d e f, the order canvas setTransform takes
export type Mat = [number, number, number, number, number, number];

export interface Anchor {
  // anchor point, in item local space
  x: number;
  y: number;
  // in handle, offset from the anchor (0, 0 is none)
  ix: number;
  iy: number;
  // out handle, offset from the anchor
  ox: number;
  oy: number;
  kind: 'corner' | 'smooth' | 'symmetric';
}

export interface PathData {
  anchors: Anchor[];
  closed: boolean;
}

export type Paint =
  // color is '#rrggbb'
  | { type: 'solid'; color: string; alpha: number }
  | { type: 'linear'; stops: Stop[]; x1: number; y1: number; x2: number; y2: number }
  | { type: 'radial'; stops: Stop[]; cx: number; cy: number; r: number; fx: number; fy: number };

export interface Stop {
  t: number;
  color: string;
  alpha: number;
}

export interface Style {
  fill: Paint | null;
  stroke: Paint | null;
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  dash: number[];
  scaleStroke: boolean;
}

export interface Skin {
  // one entry per anchor, a list of bone weights (max 3) that sum to 1
  weights: { bone: string; w: number }[][];
  // if set, the whole item follows this bone and weights is empty
  rigid: string | null;
}

interface ItemBase {
  id: string;
  name: string;
  transform: Mat;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: string;
}

export interface PathItem extends ItemBase {
  type: 'path';
  path: PathData;
  style: Style;
  skin: Skin | null;
}

export interface GroupItem extends ItemBase {
  type: 'group';
  children: Item[];
  skin: Skin | null;
}

export interface TextItem extends ItemBase {
  type: 'text';
  text: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  spacing: number;
  style: Style;
}

export interface ImageItem extends ItemBase {
  type: 'image';
  asset: string;
  width: number;
  height: number;
}

export interface InstanceItem extends ItemBase {
  type: 'instance';
  symbol: string;
  mode: 'loop' | 'once' | 'single';
  first: number;
  skin: Skin | null;
  tint: string | null;
  alpha: number;
}

export type Item = PathItem | GroupItem | TextItem | ImageItem | InstanceItem;

export interface Bone {
  id: string;
  name: string;
  parent: string | null;
  // local origin relative to the parent origin, a root bone is in world space
  x: number;
  y: number;
  length: number;
  // local radians, rest pose
  rotation: number;
  // world matrix at bind time
  bind: Mat;
  pinned: boolean;
  color: string;
}

// deltas from the rest pose
export interface BonePose {
  rotation: number;
  x: number;
  y: number;
  scale: number;
}

export interface Keyframe {
  frame: number;
  // snapshot for normal layers
  items: Item[];
  // for rig layers
  pose: Record<string, BonePose>;
  // ease is 'linear', 'in', 'out', 'inout' or 'cubic(x1,y1,x2,y2)'
  tween: null | { ease: string };
  label: string;
}

export interface Layer {
  id: string;
  name: string;
  type: 'normal' | 'rig' | 'guide' | 'folder';
  visible: boolean;
  locked: boolean;
  outline: boolean;
  color: string;
  // folder id
  parent: string | null;
  // sorted by frame, the first one is always frame 0
  keyframes: Keyframe[];
  // last frame index + 1 that this layer occupies
  length: number;
  // rig layers only
  bones: Bone[];
}

export interface Symbol {
  id: string;
  name: string;
  kind: 'graphic' | 'clip';
  layers: Layer[];
}

// data is a data url
export interface Asset {
  id: string;
  type: 'image' | 'font';
  name: string;
  data: string;
}

export interface Doc {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  bg: string;
  // bottom layer first, the timeline lists them the other way round
  layers: Layer[];
  symbols: Record<string, Symbol>;
  assets: Record<string, Asset>;
  swatches: string[];
}
