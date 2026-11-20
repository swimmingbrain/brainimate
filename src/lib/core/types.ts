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
  // one entry per anchor, the outline first and then the subpaths, up to 4 bone weights that sum to 1
  weights: { bone: string; w: number }[][];
  // if set, the whole item follows this bone and weights is empty
  rigid: string | null;
}

interface ItemBase {
  id: string;
  name: string;
  // the part of a character it is, like 'head', 'upperArmL', 'mouth' or 'prop', what the character tools
  // look for. a plain drawing has none
  role?: string;
  transform: Mat;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: string;
}

export interface PathItem extends ItemBase {
  type: 'path';
  // the outline, for a compound path the outer ring
  path: PathData;
  // more closed contours filled together with path, holes run the other way round
  subpaths: PathData[];
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
  // a multiple of the size
  lineHeight: number;
  // letter spacing in pixels at the item's size
  spacing: number;
  // box text wraps its words at this width, point text has none
  width: number | null;
  style: Style;
  // text only follows a bone rigidly
  skin: Skin | null;
}

export interface ImageItem extends ItemBase {
  type: 'image';
  asset: string;
  width: number;
  height: number;
  // a picture only follows a bone rigidly
  skin: Skin | null;
}

export interface InstanceItem extends ItemBase {
  type: 'instance';
  symbol: string;
  mode: 'loop' | 'once' | 'single';
  // the symbol frame the instance starts on, 0 based
  first: number;
  skin: Skin | null;
  tint: string | null;
  // 0 shows the symbol as it is, 1 all in the tint color
  tintAmount: number;
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
  // how far the bone reaches out to the artwork around it when binding, in its own units
  radius: number;
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
  // a squash across the bone, -1 mirrors it: a character turns around on its root bone. 1 when missing
  sx?: number;
}

// how a new shot starts on a camera keyframe. cut jumps, fade goes through a color, crossfade lets
// the last picture of the shot before dissolve, zoom flies through it, slide pushes it aside and
// camera moves there instead of cutting
export type TransitionKind = 'cut' | 'fade' | 'crossfade' | 'zoom' | 'slide' | 'camera';

export interface Transition {
  kind: TransitionKind;
  // frames it takes
  duration: number;
  // the color a fade goes through
  color: string;
  // where the new shot comes from in a slide
  direction: 'left' | 'right' | 'up' | 'down';
}

// what the camera sees on a keyframe of the camera layer
export interface CameraKey {
  // the point of the stage in the middle of the picture
  x: number;
  y: number;
  // 1 shows the whole stage, 2 half as much of it twice as big
  zoom: number;
  // radians, the picture turns the other way
  rotation: number;
  // a handheld camera, how far it shakes in pixels of the video
  shake: number;
  // the bob of walking, in pixels of the video
  bob: number;
  // a new shot starts here, null for a plain keyframe
  transition: Transition | null;
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
  // camera layers only
  camera?: CameraKey;
  // the body layer of a character: the mood and the mouth its face shows from here on
  face?: { emotion: string; mouth: string };
}

export interface Layer {
  id: string;
  name: string;
  // a folder that holds a character: its rig layer and its body layer, see character/model.ts
  character?: CharacterInfo;
  // a camera layer holds what the video shows, there is one on the main timeline at most
  type: 'normal' | 'rig' | 'guide' | 'folder' | 'camera';
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
  // how far the layer follows the camera: 1 like the camera, less is further back and moves slower,
  // more is in front and moves faster, 0 stays put on the screen. a folder hands it to its layers
  parallax?: number;
}

// the colors of a generated character, a recolor goes over its parts by their roles
export interface CharacterColors {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  outline: string;
}

export interface CharacterInfo {
  // the same in every copy saved to the library or put into another scene
  id: string;
  name: string;
  colors: CharacterColors;
  // where the face sits at rest, the middle of the head, its radius and where it looks
  face: { x: number; y: number; r: number; facing: 1 | -1 };
}

// a sound on the timeline, from start on, the asset holds the file
export interface AudioClip {
  id: string;
  asset: string;
  name: string;
  // the frame it starts on, 0 based
  start: number;
  // 0 to 1
  volume: number;
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
  type: 'image' | 'font' | 'audio';
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
  // h holds the y of each horizontal guide, v the x of each vertical one
  guides: Guides;
  // sounds played with the timeline and put into the video
  audio?: AudioClip[];
}

export interface Guides {
  h: number[];
  v: number[];
}
