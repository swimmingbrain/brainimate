import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { TOOL_IDS, isToolId, type ToolId } from '$lib/tools/tool';

export type DockTab = 'properties' | 'color' | 'swatches' | 'library' | 'align' | 'transform' | 'rig';

export type PencilMode = 'smooth' | 'ink' | 'straighten';
export type BrushMode = 'normal' | 'behind';
export type EraserMode = 'normal' | 'fills' | 'strokes';
// how far apart the ends of an open path may be for the bucket to fill it as if closed
export type BucketGap = 'none' | 'small' | 'medium' | 'large';
// how binding picks between following one bone and bending with several
export type BindMode = 'auto' | 'smooth' | 'rigid';
// the three greys of the theme the pasteboard can take
export type PasteboardShade = 'deep' | 'surface' | 'elevated';

export const DOCK_TABS: DockTab[] = ['properties', 'color', 'swatches', 'library', 'align', 'transform', 'rig'];
export const SHADES: PasteboardShade[] = ['deep', 'surface', 'elevated'];

// a saved brush or pencil: size is the brush size or the pencil stroke width, mode is the tool's own
export interface PenPreset {
  id: string;
  name: string;
  size: number;
  smoothing: number;
  pressure: boolean;
  mode: string;
}

// a panel layout: which panels show, the tab in front of each dock group and the sizes
export interface WorkspacePreset {
  id: string;
  name: string;
  hidden: DockTab[];
  timeline: boolean;
  topTab: DockTab;
  bottomTab: DockTab;
  dockWidth: number;
  timelineHeight: number;
  toolbarSide: 'left' | 'right';
  rulers: boolean;
  showBones: boolean;
}

export interface Preferences {
  // the workspace used last, a built in one or a saved one
  workspace: string;
  // the workspaces saved by the user
  workspaces: WorkspacePreset[];
  general: {
    skipWelcome: boolean;
    // what opens instead of the welcome dialog
    startWith: 'last' | 'blank';
    autosave: boolean;
    // seconds after the last change
    autosaveDelay: number;
    undoLimit: number;
    tooltips: boolean;
    confirmDelete: boolean;
  };
  // every tool in toolbar order, the hidden ones keep their place and their key
  toolbar: { order: ToolId[]; hidden: ToolId[]; side: 'left' | 'right'; buttons: 'small' | 'normal' };
  grid: { show: boolean; size: number; subdivisions: number; color: string; opacity: number; snap: boolean };
  guides: { show: boolean; lock: boolean; color: string; snap: boolean };
  rulers: { show: boolean };
  snapping: {
    enabled: boolean;
    points: boolean;
    objects: boolean;
    pixels: boolean;
    smartGuides: boolean;
    smartColor: string;
  };
  stage: {
    pasteboard: boolean;
    shade: PasteboardShade;
    shadow: boolean;
    // the zoom a document opens at
    zoomOnOpen: 'fit' | 'actual';
    // zoom: the wheel zooms and ctrl+wheel scrolls, the other way around from scroll
    wheel: 'scroll' | 'zoom';
    // bigger hit areas for every pointer, not only for pens and fingers
    tablet: boolean;
  };
  drawing: {
    // 0 to 100, the pencil maps it to a fit tolerance
    pencilSmoothing: number;
    pencilMode: PencilMode;
    // ends closer than a few pixels make a closed path
    pencilClose: boolean;
    brushSize: number;
    brushPressure: boolean;
    brushSmoothing: number;
    brushMode: BrushMode;
    eraserSize: number;
    eraserMode: EraserMode;
    bucketGap: BucketGap;
    polygonSides: number;
    polygonStar: boolean;
    // inner radius of a star, percent of the outer one
    polygonInner: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
  // the pen and the path tools, sizes in screen pixels
  pen: { rubberBand: boolean; showAnchors: boolean; anchorSize: number; handleSize: number; hitTolerance: number };
  pens: { brush: PenPreset[]; pencil: PenPreset[]; brushDefault: string; pencilDefault: string };
  timeline: {
    fps: number;
    frameWidth: number;
    onion: boolean;
    onionBefore: number;
    onionAfter: number;
    onionBeforeColor: string;
    onionAfterColor: string;
    // alpha of the ghost next to the playhead and how much each step further takes off
    onionStart: number;
    onionStep: number;
    onionOutline: boolean;
    // the ghosts are the keyframes around the playhead instead of the frames next to it
    onionKeyframes: boolean;
    autoKey: boolean;
    loop: boolean;
  };
  rig: {
    // the bone tool binds what a finished chain reaches
    autoBind: boolean;
    bindMode: BindMode;
    // the reach of a new bone, percent of its length
    reach: number;
    // how many bones a dragged joint turns at most
    chainLimit: number;
    // the reach of each bone while the bone or bind tool is active
    showCapsules: boolean;
    // the bones on top of the stage while the selection tool is active
    showBones: boolean;
    // the ease a pose keyframe gets toward the next one
    ease: string;
    // a new keyframe on a rig layer tweens into it from the one before
    tweenPoses: boolean;
  };
  panels: {
    dockWidth: number;
    // share of the dock height the upper panel group takes
    dockSplit: number;
    timelineHeight: number;
    timeline: boolean;
    topTab: DockTab;
    bottomTab: DockTab;
    hidden: DockTab[];
  };
  // command id to key combo, only the ones changed from the default, an empty combo takes the key away
  shortcuts: Record<string, string>;
  // the colors picked last, newest first
  recentColors: string[];
  // the commands run from the palette, newest first
  recentCommands: string[];
}

const STORAGE_KEY = 'brainimate-preferences';

export const RECENT_COLORS = 10;
export const RECENT_COMMANDS = 8;

export const MIN_DOCK = 220;
export const MAX_DOCK = 520;
export const MIN_TIMELINE = 90;
export const MAX_TIMELINE = 600;

export function defaultPenPresets(): Preferences['pens'] {
  return {
    brush: [
      { id: 'brush-fine', name: 'Fine liner', size: 3, smoothing: 60, pressure: true, mode: 'normal' },
      { id: 'brush-round', name: 'Round', size: 8, smoothing: 50, pressure: true, mode: 'normal' },
      { id: 'brush-marker', name: 'Marker', size: 24, smoothing: 40, pressure: false, mode: 'normal' },
      { id: 'brush-under', name: 'Under paint', size: 40, smoothing: 30, pressure: false, mode: 'behind' }
    ],
    pencil: [
      { id: 'pencil-sketch', name: 'Sketch', size: 1, smoothing: 20, pressure: false, mode: 'smooth' },
      { id: 'pencil-clean', name: 'Clean line', size: 1.5, smoothing: 50, pressure: false, mode: 'smooth' },
      { id: 'pencil-ink', name: 'Ink', size: 2, smoothing: 0, pressure: false, mode: 'ink' },
      { id: 'pencil-shapes', name: 'Shapes', size: 2, smoothing: 50, pressure: false, mode: 'straighten' }
    ],
    brushDefault: 'brush-round',
    pencilDefault: 'pencil-clean'
  };
}

export function defaultPreferences(): Preferences {
  return {
    workspace: 'essentials',
    workspaces: [],
    general: {
      skipWelcome: false,
      startWith: 'blank',
      autosave: true,
      autosaveDelay: 2,
      undoLimit: 200,
      tooltips: true,
      confirmDelete: true
    },
    toolbar: { order: [...TOOL_IDS], hidden: [], side: 'left', buttons: 'normal' },
    grid: { show: false, size: 20, subdivisions: 1, color: '#8a8a94', opacity: 45, snap: false },
    guides: { show: true, lock: false, color: '#4fc3f7', snap: true },
    rulers: { show: true },
    snapping: { enabled: true, points: true, objects: true, pixels: false, smartGuides: true, smartColor: '#e06cd0' },
    stage: { pasteboard: true, shade: 'deep', shadow: true, zoomOnOpen: 'fit', wheel: 'scroll', tablet: false },
    drawing: {
      pencilSmoothing: 50,
      pencilMode: 'smooth',
      pencilClose: true,
      brushSize: 8,
      brushPressure: true,
      brushSmoothing: 50,
      brushMode: 'normal',
      eraserSize: 20,
      eraserMode: 'normal',
      bucketGap: 'small',
      polygonSides: 5,
      polygonStar: false,
      polygonInner: 50,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 1.5
    },
    pen: { rubberBand: true, showAnchors: true, anchorSize: 7, handleSize: 6, hitTolerance: 6 },
    pens: defaultPenPresets(),
    timeline: {
      fps: 24,
      frameWidth: 10,
      onion: false,
      onionBefore: 2,
      onionAfter: 2,
      onionBeforeColor: '#5b8fc9',
      onionAfterColor: '#5a8f5a',
      onionStart: 0.5,
      onionStep: 0.15,
      onionOutline: false,
      onionKeyframes: false,
      autoKey: true,
      loop: true
    },
    rig: {
      autoBind: true,
      bindMode: 'auto',
      reach: 35,
      chainLimit: 4,
      showCapsules: true,
      showBones: true,
      ease: 'linear',
      tweenPoses: true
    },
    panels: {
      dockWidth: 280,
      dockSplit: 0.55,
      timelineHeight: 220,
      timeline: true,
      topTab: 'properties',
      bottomTab: 'color',
      hidden: []
    },
    shortcuts: {},
    recentColors: [],
    recentCommands: []
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// walks the defaults, so a key added later gets its default and a stored value of the wrong type is dropped
function merge<T>(base: T, stored: unknown): T {
  if (isObject(base)) {
    if (!isObject(stored)) return base;
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(base)) out[key] = merge(base[key], stored[key]);
    return out as T;
  }
  if (Array.isArray(base)) return (Array.isArray(stored) ? stored : base) as T;
  return (typeof stored === typeof base && stored !== null ? stored : base) as T;
}

function oneOf<T extends string>(value: T, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function tabList(list: unknown): DockTab[] {
  if (!Array.isArray(list)) return [];
  return list.filter((tab, i) => DOCK_TABS.includes(tab) && list.indexOf(tab) === i);
}

// a stored preset with every field it needs, null when it is not one
function penPreset(value: unknown): PenPreset | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (typeof value.size !== 'number' || typeof value.smoothing !== 'number') return null;
  return {
    id: value.id,
    name: value.name.slice(0, 40),
    size: clamp(value.size, 0.1, 500),
    smoothing: clamp(value.smoothing, 0, 100),
    pressure: value.pressure === true,
    mode: typeof value.mode === 'string' ? value.mode : 'normal'
  };
}

function penList(list: unknown, modes: string[], fallback: PenPreset[]): PenPreset[] {
  if (!Array.isArray(list)) return fallback;
  const out: PenPreset[] = [];
  for (const value of list) {
    const p = penPreset(value);
    if (!p || out.some((o) => o.id === p.id)) continue;
    out.push({ ...p, mode: oneOf(p.mode, modes, modes[0]) });
  }
  return out;
}

export function workspacePreset(value: unknown): WorkspacePreset | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  const tab = (t: unknown, fallback: DockTab) => (DOCK_TABS.includes(t as DockTab) ? (t as DockTab) : fallback);
  return {
    id: value.id,
    name: value.name.slice(0, 40),
    hidden: tabList(value.hidden),
    timeline: value.timeline !== false,
    topTab: tab(value.topTab, 'properties'),
    bottomTab: tab(value.bottomTab, 'color'),
    dockWidth: clamp(Number(value.dockWidth), MIN_DOCK, MAX_DOCK),
    timelineHeight: clamp(Number(value.timelineHeight), MIN_TIMELINE, MAX_TIMELINE),
    toolbarSide: value.toolbarSide === 'right' ? 'right' : 'left',
    rulers: value.rulers !== false,
    showBones: value.showBones !== false
  };
}

// the order every tool has a place in, the default order fills in tools added later
function toolOrder(list: unknown): ToolId[] {
  const known = Array.isArray(list) ? list.filter((id, i) => isToolId(id) && list.indexOf(id) === i) : [];
  return [...known, ...TOOL_IDS.filter((id) => !known.includes(id))];
}

export function mergePreferences(stored: unknown): Preferences {
  const defaults = defaultPreferences();
  const p = merge(defaults, stored);
  const raw = isObject(stored) ? stored : {};

  p.workspace = typeof p.workspace === 'string' && p.workspace ? p.workspace : defaults.workspace;
  p.workspaces = Array.isArray(raw.workspaces)
    ? raw.workspaces.map(workspacePreset).filter((w): w is WorkspacePreset => w !== null)
    : [];

  const g = p.general;
  g.startWith = oneOf(g.startWith, ['last', 'blank'], 'blank');
  g.autosaveDelay = clamp(g.autosaveDelay, 1, 60);
  g.undoLimit = clamp(Math.round(g.undoLimit), 20, 1000);

  const tb = p.toolbar;
  // an older toolbar kept only the visible tools in their order
  const old = isObject(raw.toolbar) ? raw.toolbar.tools : undefined;
  if (Array.isArray(old) && !(isObject(raw.toolbar) && Array.isArray(raw.toolbar.order))) {
    tb.order = toolOrder(old);
    tb.hidden = TOOL_IDS.filter((id) => !old.includes(id));
  } else {
    tb.order = toolOrder(tb.order);
    tb.hidden = tb.hidden.filter((id, i, list) => isToolId(id) && list.indexOf(id) === i);
  }
  tb.side = oneOf(tb.side, ['left', 'right'], 'left');
  tb.buttons = oneOf(tb.buttons, ['small', 'normal'], 'normal');

  p.grid.size = clamp(p.grid.size, 2, 500);
  p.grid.subdivisions = clamp(Math.round(p.grid.subdivisions), 1, 10);
  p.grid.opacity = clamp(p.grid.opacity, 5, 100);
  if (!isHex(p.grid.color)) p.grid.color = defaults.grid.color;
  if (!isHex(p.guides.color)) p.guides.color = defaults.guides.color;
  if (!isHex(p.snapping.smartColor)) p.snapping.smartColor = defaults.snapping.smartColor;

  const st = p.stage;
  st.shade = oneOf(st.shade, SHADES, 'deep');
  st.zoomOnOpen = oneOf(st.zoomOnOpen, ['fit', 'actual'], 'fit');
  st.wheel = oneOf(st.wheel, ['scroll', 'zoom'], 'scroll');

  const d = p.drawing;
  d.pencilSmoothing = clamp(d.pencilSmoothing, 0, 100);
  d.pencilMode = oneOf(d.pencilMode, ['smooth', 'ink', 'straighten'], 'smooth');
  d.brushSize = clamp(d.brushSize, 1, 500);
  d.brushSmoothing = clamp(d.brushSmoothing, 0, 100);
  d.brushMode = oneOf(d.brushMode, ['normal', 'behind'], 'normal');
  d.eraserSize = clamp(d.eraserSize, 1, 500);
  d.eraserMode = oneOf(d.eraserMode, ['normal', 'fills', 'strokes'], 'normal');
  d.bucketGap = oneOf(d.bucketGap, ['none', 'small', 'medium', 'large'], 'small');
  d.polygonSides = clamp(Math.round(d.polygonSides), 3, 12);
  d.polygonInner = clamp(d.polygonInner, 5, 95);
  d.strokeWidth = clamp(d.strokeWidth, 0, 500);
  if (!isHex(d.fill)) d.fill = defaults.drawing.fill;
  if (!isHex(d.stroke)) d.stroke = defaults.drawing.stroke;

  const pen = p.pen;
  pen.anchorSize = clamp(Math.round(pen.anchorSize), 5, 9);
  pen.handleSize = clamp(Math.round(pen.handleSize), 4, 8);
  pen.hitTolerance = clamp(Math.round(pen.hitTolerance), 4, 10);

  const pens = isObject(raw.pens) ? raw.pens : {};
  p.pens.brush = penList(pens.brush, ['normal', 'behind'], defaults.pens.brush);
  p.pens.pencil = penList(pens.pencil, ['smooth', 'ink', 'straighten'], defaults.pens.pencil);

  const t = p.timeline;
  t.fps = clamp(Math.round(t.fps), 1, 120);
  t.frameWidth = clamp(t.frameWidth, 4, 24);
  t.onionBefore = clamp(Math.round(t.onionBefore), 0, 10);
  t.onionAfter = clamp(Math.round(t.onionAfter), 0, 10);
  t.onionStart = clamp(t.onionStart, 0.05, 1);
  t.onionStep = clamp(t.onionStep, 0, 0.5);
  if (!isHex(t.onionBeforeColor)) t.onionBeforeColor = defaults.timeline.onionBeforeColor;
  if (!isHex(t.onionAfterColor)) t.onionAfterColor = defaults.timeline.onionAfterColor;

  const r = p.rig;
  r.bindMode = oneOf(r.bindMode, ['auto', 'smooth', 'rigid'], 'auto');
  r.reach = clamp(r.reach, 5, 200);
  r.chainLimit = clamp(Math.round(r.chainLimit), 1, 12);

  const panels = p.panels;
  panels.dockWidth = clamp(panels.dockWidth, MIN_DOCK, MAX_DOCK);
  panels.dockSplit = clamp(panels.dockSplit, 0.15, 0.85);
  panels.timelineHeight = clamp(panels.timelineHeight, MIN_TIMELINE, MAX_TIMELINE);
  panels.topTab = oneOf(panels.topTab, DOCK_TABS, defaults.panels.topTab);
  panels.bottomTab = oneOf(panels.bottomTab, DOCK_TABS, defaults.panels.bottomTab);
  panels.hidden = tabList(panels.hidden);

  p.recentColors = p.recentColors.filter((c, i, list) => isHex(c) && list.indexOf(c) === i).slice(0, RECENT_COLORS);
  p.recentCommands = p.recentCommands
    .filter((c, i, list) => typeof c === 'string' && list.indexOf(c) === i)
    .slice(0, RECENT_COMMANDS);

  // the defaults hold no shortcuts, so the walk above cannot keep them
  p.shortcuts = {};
  if (isObject(raw.shortcuts)) {
    for (const [id, keys] of Object.entries(raw.shortcuts)) {
      if (typeof keys === 'string') p.shortcuts[id] = keys;
    }
  }
  return p;
}

function createPreferencesStore() {
  let initial = defaultPreferences();
  if (browser) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) initial = mergePreferences(JSON.parse(stored));
    } catch {}
  }

  const { subscribe, set, update } = writable<Preferences>(initial);

  function persist(value: Preferences) {
    if (!browser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {}
  }

  return {
    subscribe,
    set(value: Preferences) {
      set(value);
      persist(value);
    },
    update(fn: (prefs: Preferences) => Preferences) {
      update((current) => {
        const next = fn(current);
        persist(next);
        return next;
      });
    }
  };
}

export const preferences = createPreferencesStore();

type Group = {
  [K in keyof Preferences]: Preferences[K] extends unknown[] ? never : Preferences[K] extends object ? K : never;
}[keyof Preferences];

// changes one group, like setGroup('grid', { show: true })
export function setGroup<K extends Group>(key: K, patch: Partial<Preferences[K]>) {
  preferences.update((p) => ({ ...p, [key]: { ...(p[key] as object), ...patch } }));
}

export function resetPreferences() {
  preferences.set(defaultPreferences());
}

// puts the given parts back to their defaults, the rest stays
export function resetParts(keys: (keyof Preferences)[]) {
  const defaults = defaultPreferences();
  preferences.update((p) => {
    const next = { ...p } as Record<string, unknown>;
    for (const key of keys) next[key] = defaults[key];
    return next as unknown as Preferences;
  });
}

// a color goes to the front of the recent row, an older copy of it leaves
export function rememberColor(color: string) {
  const c = color.toLowerCase();
  if (!isHex(c)) return;
  preferences.update((p) => {
    if (p.recentColors[0] === c) return p;
    return { ...p, recentColors: [c, ...p.recentColors.filter((r) => r !== c)].slice(0, RECENT_COLORS) };
  });
}

export function rememberCommand(id: string) {
  preferences.update((p) => {
    if (p.recentCommands[0] === id) return p;
    return { ...p, recentCommands: [id, ...p.recentCommands.filter((r) => r !== id)].slice(0, RECENT_COMMANDS) };
  });
}

// the tools the toolbar shows, in its order
export function visibleTools(p: Preferences): ToolId[] {
  return p.toolbar.order.filter((id) => !p.toolbar.hidden.includes(id));
}
