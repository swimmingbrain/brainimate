import { get, writable } from 'svelte/store';
import type { ToolId } from '$lib/tools/tool';
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

// 0 based, the ui shows it 1 based
export const frame = writable(0);
export const playing = writable(false);

// item ids
export const selection = writable<Set<string>>(new Set());
export const activeLayer = writable<string | null>(null);

// the open document, until the editor owns it
export const docName = writable('Untitled');
export const dirty = writable(false);

// current fill and stroke, null is none
export const fillColor = writable<string | null>(get(preferences).drawing.fill);
export const strokeColor = writable<string | null>(get(preferences).drawing.stroke);

export const outlineMode = writable(false);

// screen = world * zoom + pan, in css pixels of the stage
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const view = writable<View>({ zoom: 1, panX: 0, panY: 0 });

export const WORKSPACES: { id: Workspace; label: string; shortcut: string }[] = [
  { id: 'essentials', label: 'Essentials', shortcut: 'Ctrl+1' },
  { id: 'illustrate', label: 'Illustrate', shortcut: 'Ctrl+2' },
  { id: 'animate', label: 'Animate', shortcut: 'Ctrl+3' },
  { id: 'rig', label: 'Rig', shortcut: 'Ctrl+4' }
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
