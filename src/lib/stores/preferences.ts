import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { TOOL_IDS, isToolId, type ToolId } from '$lib/tools/tool';

export type Workspace = 'essentials' | 'illustrate' | 'animate' | 'rig';
export type DockTab = 'properties' | 'color' | 'swatches' | 'library' | 'align' | 'transform' | 'rig';

export type PencilMode = 'smooth' | 'ink' | 'straighten';
export type EraserMode = 'normal' | 'fills' | 'strokes';
// how far apart the ends of an open path may be for the bucket to fill it as if closed
export type BucketGap = 'none' | 'small' | 'medium' | 'large';

export const WORKSPACE_IDS: Workspace[] = ['essentials', 'illustrate', 'animate', 'rig'];
export const DOCK_TABS: DockTab[] = ['properties', 'color', 'swatches', 'library', 'align', 'transform', 'rig'];

export interface Preferences {
  workspace: Workspace;
  // the visible tools in toolbar order, a tool left out is hidden
  toolbar: { tools: ToolId[]; side: 'left' | 'right'; size: 'small' | 'large' };
  grid: { show: boolean; size: number; color: string; snap: boolean };
  guides: { show: boolean; lock: boolean; color: string; snap: boolean };
  rulers: { show: boolean };
  snapping: { enabled: boolean; points: boolean; objects: boolean; pixels: boolean; smartGuides: boolean };
  stage: { pasteboard: boolean };
  drawing: {
    // 0 to 100, the pencil maps it to a fit tolerance
    pencilSmoothing: number;
    pencilMode: PencilMode;
    // ends closer than a few pixels make a closed path
    pencilClose: boolean;
    brushSize: number;
    brushPressure: boolean;
    brushSmoothing: number;
    brushMode: 'normal' | 'behind';
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
    // screen pixels
    handleSize: number;
    hitTolerance: number;
  };
  timeline: {
    fps: number;
    frameWidth: number;
    onion: boolean;
    onionBefore: number;
    onionAfter: number;
    onionBeforeColor: string;
    onionAfterColor: string;
    onionOutline: boolean;
    autoKey: boolean;
    loop: boolean;
  };
  panels: {
    dockWidth: number;
    // share of the dock height the upper panel group takes
    dockSplit: number;
    timelineHeight: number;
    topTab: DockTab;
    bottomTab: DockTab;
    hidden: DockTab[];
  };
  // action id to key combo, only the ones changed from the default
  shortcuts: Record<string, string>;
  // the colors picked last, newest first
  recentColors: string[];
}

const STORAGE_KEY = 'brainimate-preferences';

export const RECENT_COLORS = 10;

export const MIN_DOCK = 220;
export const MAX_DOCK = 520;
export const MIN_TIMELINE = 90;
export const MAX_TIMELINE = 600;

export function defaultPreferences(): Preferences {
  return {
    workspace: 'essentials',
    toolbar: { tools: [...TOOL_IDS], side: 'left', size: 'small' },
    grid: { show: false, size: 20, color: '#8a8a94', snap: false },
    guides: { show: true, lock: false, color: '#4fc3f7', snap: true },
    rulers: { show: true },
    snapping: { enabled: true, points: true, objects: true, pixels: false, smartGuides: true },
    stage: { pasteboard: true },
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
      strokeWidth: 1.5,
      handleSize: 7,
      hitTolerance: 6
    },
    timeline: {
      fps: 24,
      frameWidth: 10,
      onion: false,
      onionBefore: 2,
      onionAfter: 2,
      onionBeforeColor: '#e06c75',
      onionAfterColor: '#73c991',
      onionOutline: false,
      autoKey: true,
      loop: true
    },
    panels: {
      dockWidth: 280,
      dockSplit: 0.55,
      timelineHeight: 220,
      topTab: 'properties',
      bottomTab: 'color',
      hidden: []
    },
    shortcuts: {},
    recentColors: []
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

function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function mergePreferences(stored: unknown): Preferences {
  const defaults = defaultPreferences();
  const p = merge(defaults, stored);

  p.workspace = oneOf(p.workspace, WORKSPACE_IDS, defaults.workspace);
  p.toolbar.tools = p.toolbar.tools.filter((id, i, list) => isToolId(id) && list.indexOf(id) === i);
  p.toolbar.side = oneOf(p.toolbar.side, ['left', 'right'], 'left');
  p.toolbar.size = oneOf(p.toolbar.size, ['small', 'large'], 'small');
  p.grid.size = clamp(p.grid.size, 2, 500);
  if (!isHex(p.grid.color)) p.grid.color = defaults.grid.color;
  if (!isHex(p.guides.color)) p.guides.color = defaults.guides.color;

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
  d.handleSize = clamp(d.handleSize, 3, 20);
  d.hitTolerance = clamp(d.hitTolerance, 1, 30);
  if (!isHex(d.fill)) d.fill = defaults.drawing.fill;
  if (!isHex(d.stroke)) d.stroke = defaults.drawing.stroke;

  const t = p.timeline;
  t.fps = clamp(Math.round(t.fps), 1, 120);
  t.frameWidth = clamp(t.frameWidth, 4, 24);
  t.onionBefore = clamp(Math.round(t.onionBefore), 0, 10);
  t.onionAfter = clamp(Math.round(t.onionAfter), 0, 10);
  if (!isHex(t.onionBeforeColor)) t.onionBeforeColor = defaults.timeline.onionBeforeColor;
  if (!isHex(t.onionAfterColor)) t.onionAfterColor = defaults.timeline.onionAfterColor;

  const panels = p.panels;
  panels.dockWidth = clamp(panels.dockWidth, MIN_DOCK, MAX_DOCK);
  panels.dockSplit = clamp(panels.dockSplit, 0.15, 0.85);
  panels.timelineHeight = clamp(panels.timelineHeight, MIN_TIMELINE, MAX_TIMELINE);
  panels.topTab = oneOf(panels.topTab, DOCK_TABS, defaults.panels.topTab);
  panels.bottomTab = oneOf(panels.bottomTab, DOCK_TABS, defaults.panels.bottomTab);
  panels.hidden = panels.hidden.filter((tab) => DOCK_TABS.includes(tab));

  p.recentColors = p.recentColors.filter((c, i, list) => typeof c === 'string' && isHex(c) && list.indexOf(c) === i);
  p.recentColors = p.recentColors.slice(0, RECENT_COLORS);

  // the defaults hold no shortcuts, so the walk above cannot keep them
  p.shortcuts = {};
  const shortcuts = isObject(stored) ? stored.shortcuts : null;
  if (isObject(shortcuts)) {
    for (const [action, keys] of Object.entries(shortcuts)) {
      if (typeof keys === 'string') p.shortcuts[action] = keys;
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

// changes one group, like setGroup('grid', { show: true })
export function setGroup<K extends keyof Preferences>(key: K, patch: Partial<Preferences[K]>) {
  preferences.update((p) => ({ ...p, [key]: { ...(p[key] as object), ...patch } }));
}

export function resetPreferences() {
  preferences.set(defaultPreferences());
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
