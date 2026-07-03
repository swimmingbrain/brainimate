import { get, writable } from 'svelte/store';
import type { ToolId } from '$lib/tools/tool';
import type { Paint } from '$lib/core/types';
import { preferences, setGroup, type DockTab, type Workspace } from './preferences';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export const toasts = writable<Array<{ id: string; message: string; type: ToastType }>>([]);

let toastId = 0;
export function addToast(message: string, type: ToastType = 'info', duration = 3000) {
  const id = String(++toastId);
  toasts.update((t) => [...t, { id, message, type }]);
  if (duration > 0) {
    setTimeout(() => {
      toasts.update((t) => t.filter((toast) => toast.id !== id));
    }, duration);
  }
  return id;
}

export function dismissToast(id: string) {
  toasts.update((t) => t.filter((toast) => toast.id !== id));
}

export type PreferencesCategory = 'general' | 'toolbar' | 'stage' | 'drawing' | 'timeline';

export type Dialog =
  | { kind: 'preferences'; category?: PreferencesCategory }
  | { kind: 'shortcuts' }
  | { kind: 'about' }
  | { kind: 'export' }
  | { kind: 'new-doc' }
  | { kind: 'doc-settings' }
  | { kind: 'confirm'; title: string; message: string; confirm: string; danger?: boolean; onconfirm: () => void };

export const dialog = writable<Dialog | null>(null);

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  checked?: boolean;
  action?: () => void;
  children?: MenuItem[];
}

export const contextMenu = writable<{ x: number; y: number; items: MenuItem[] } | null>(null);

export const activeTool = writable<ToolId>('select');
// the tools change it while hovering, the stage shows it
export const toolCursor = writable('default');
// settings the stage bar shows for the drawing tools, the bucket paints fills or strokes like the ink bottle
export const toolOptions = writable<{ rectRadius: number; bucketMode: 'fill' | 'stroke' }>({
  rectRadius: 0,
  bucketMode: 'fill'
});

// 0 based, the ui shows it 1 based
export const frame = writable(0);
export const playing = writable(false);

// item ids
export const selection = writable<Set<string>>(new Set());
// an anchor of a path item, sub 0 is the outline and sub k the subpath k - 1
export interface AnchorRef {
  itemId: string;
  sub: number;
  index: number;
}

// anchors picked with the direct selection tool
export const anchorSelection = writable<AnchorRef[]>([]);
export const activeLayer = writable<string | null>(null);

// the open document, until the editor owns it
export const docName = writable('Untitled');
export const dirty = writable(false);

// current fill and stroke for new shapes, null is none
export const fillPaint = writable<Paint | null>({ type: 'solid', color: get(preferences).drawing.fill, alpha: 1 });
export const strokePaint = writable<Paint | null>({ type: 'solid', color: get(preferences).drawing.stroke, alpha: 1 });
export const strokeWidth = writable(get(preferences).drawing.strokeWidth);
// which of the two chips the color panel and the swatches change
export const colorTarget = writable<'fill' | 'stroke'>('fill');
// the gradient stop the color picker edits, the gradient tool picks it too
export const activeStop = writable(0);

export const outlineMode = writable(false);

// the point of the selection box the transform fields measure from and turn around, 0 to 1 on each axis
export const transformOrigin = writable<{ x: number; y: number }>({ x: 0, y: 0 });

// screen = world * zoom + pan, in css pixels of the stage
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const view = writable<View>({ zoom: 1, panX: 0, panY: 0 });

// size of the stage in document pixels, until the document model holds it
export const stageSize = writable({ width: 1920, height: 1080, background: '#ffffff' });

export const WORKSPACES: { id: Workspace; label: string }[] = [
  { id: 'essentials', label: 'Essentials' },
  { id: 'illustrate', label: 'Illustrate' },
  { id: 'animate', label: 'Animate' },
  { id: 'rig', label: 'Rig' }
];

export const workspace = writable<Workspace>(get(preferences).workspace);

// a workspace picks the panel tabs and how tall the timeline is, widths stay as they are
const WORKSPACE_PANELS: Record<Workspace, { topTab: DockTab; bottomTab: DockTab; timelineHeight: number }> = {
  essentials: { topTab: 'properties', bottomTab: 'color', timelineHeight: 220 },
  illustrate: { topTab: 'properties', bottomTab: 'swatches', timelineHeight: 120 },
  animate: { topTab: 'properties', bottomTab: 'library', timelineHeight: 300 },
  rig: { topTab: 'rig', bottomTab: 'library', timelineHeight: 240 }
};

export function setWorkspace(ws: Workspace) {
  const panels = WORKSPACE_PANELS[ws];
  preferences.update((p) => ({ ...p, workspace: ws, panels: { ...p.panels, ...panels, hidden: [] } }));
  workspace.set(ws);
}

// the dock holds two panel groups, one above the other
export const DOCK_TOP: DockTab[] = ['properties', 'transform', 'align', 'rig'];
export const DOCK_BOTTOM: DockTab[] = ['color', 'swatches', 'library'];

export function showDockTab(tab: DockTab) {
  const hidden = get(preferences).panels.hidden.filter((t) => t !== tab);
  if (DOCK_TOP.includes(tab)) setGroup('panels', { topTab: tab, hidden });
  else setGroup('panels', { bottomTab: tab, hidden });
}

export function togglePanel(tab: DockTab) {
  const hidden = get(preferences).panels.hidden;
  if (hidden.includes(tab)) showDockTab(tab);
  else setGroup('panels', { hidden: [...hidden, tab] });
}
