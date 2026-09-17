import { derived, get } from 'svelte/store';
import { newId } from '$lib/core/ids';
import { preferences, type DockTab, type Preferences, type WorkspacePreset } from './preferences';

// the four layouts that come with the app, saved ones sit next to them
export const BUILTIN_WORKSPACES: WorkspacePreset[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    hidden: [],
    timeline: true,
    topTab: 'properties',
    bottomTab: 'color',
    dockWidth: 280,
    timelineHeight: 220,
    toolbarSide: 'left',
    rulers: true,
    showBones: true
  },
  {
    id: 'illustrate',
    name: 'Illustrate',
    hidden: ['library', 'rig'],
    timeline: false,
    topTab: 'properties',
    bottomTab: 'swatches',
    dockWidth: 300,
    timelineHeight: 220,
    toolbarSide: 'left',
    rulers: true,
    showBones: false
  },
  {
    id: 'animate',
    name: 'Animate',
    hidden: ['align', 'swatches'],
    timeline: true,
    topTab: 'properties',
    bottomTab: 'library',
    dockWidth: 260,
    timelineHeight: 300,
    toolbarSide: 'left',
    rulers: false,
    showBones: true
  },
  {
    id: 'rig',
    name: 'Rig',
    hidden: ['align', 'swatches'],
    timeline: true,
    topTab: 'rig',
    bottomTab: 'library',
    dockWidth: 280,
    timelineHeight: 240,
    toolbarSide: 'left',
    rulers: false,
    showBones: true
  }
];

export function allWorkspaces(p: Preferences): WorkspacePreset[] {
  return [...BUILTIN_WORKSPACES, ...p.workspaces];
}

export function findWorkspace(p: Preferences, id: string): WorkspacePreset | null {
  return allWorkspaces(p).find((w) => w.id === id) ?? null;
}

export function isBuiltin(id: string): boolean {
  return BUILTIN_WORKSPACES.some((w) => w.id === id);
}

// the workspace used last, it stays marked in the top bar and the window menu
export const workspace = derived(preferences, (p) => p.workspace);

// the layout of a preset laid over the preferences, everything else stays as it is
export function withWorkspace(p: Preferences, w: WorkspacePreset): Preferences {
  return {
    ...p,
    workspace: w.id,
    panels: {
      ...p.panels,
      hidden: [...w.hidden],
      timeline: w.timeline,
      topTab: w.topTab,
      bottomTab: w.bottomTab,
      dockWidth: w.dockWidth,
      timelineHeight: w.timelineHeight
    },
    toolbar: { ...p.toolbar, side: w.toolbarSide },
    rulers: { ...p.rulers, show: w.rulers },
    rig: { ...p.rig, showBones: w.showBones }
  };
}

// the layout as it is now, as a preset with a name
export function currentLayout(p: Preferences, name: string, id = newId()): WorkspacePreset {
  return {
    id,
    name,
    hidden: [...p.panels.hidden],
    timeline: p.panels.timeline,
    topTab: p.panels.topTab,
    bottomTab: p.panels.bottomTab,
    dockWidth: p.panels.dockWidth,
    timelineHeight: p.panels.timelineHeight,
    toolbarSide: p.toolbar.side,
    rulers: p.rulers.show,
    showBones: p.rig.showBones
  };
}

export function setWorkspace(id: string) {
  const w = findWorkspace(get(preferences), id);
  if (w) preferences.update((p) => withWorkspace(p, w));
}

// the layout of the workspace in use comes back as it was saved
export function resetWorkspace() {
  setWorkspace(get(preferences).workspace);
}

export function saveWorkspace(name: string): string {
  const preset = currentLayout(get(preferences), name.trim() || 'My workspace');
  preferences.update((p) => ({ ...p, workspace: preset.id, workspaces: [...p.workspaces, preset] }));
  return preset.id;
}

export function renameWorkspace(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  preferences.update((p) => ({ ...p, workspaces: p.workspaces.map((w) => (w.id === id ? { ...w, name: clean } : w)) }));
}

// a saved workspace that goes away hands over to essentials when it was the one in use
export function deleteWorkspace(id: string) {
  preferences.update((p) => ({
    ...p,
    workspace: p.workspace === id ? 'essentials' : p.workspace,
    workspaces: p.workspaces.filter((w) => w.id !== id)
  }));
}

// the dock holds two panel groups, one above the other
export const DOCK_TOP: DockTab[] = ['properties', 'transform', 'align', 'rig'];
export const DOCK_BOTTOM: DockTab[] = ['color', 'swatches', 'library'];

export const PANEL_LABELS: Record<DockTab, string> = {
  properties: 'Properties',
  color: 'Color',
  swatches: 'Swatches',
  library: 'Library',
  align: 'Align',
  transform: 'Transform',
  rig: 'Rig'
};

function setPanels(patch: Partial<Preferences['panels']>) {
  preferences.update((p) => ({ ...p, panels: { ...p.panels, ...patch } }));
}

export function showDockTab(tab: DockTab) {
  const hidden = get(preferences).panels.hidden.filter((t) => t !== tab);
  if (DOCK_TOP.includes(tab)) setPanels({ topTab: tab, hidden });
  else setPanels({ bottomTab: tab, hidden });
}

export function togglePanel(tab: DockTab) {
  const hidden = get(preferences).panels.hidden;
  if (hidden.includes(tab)) showDockTab(tab);
  else setPanels({ hidden: [...hidden, tab] });
}

export function toggleTimeline() {
  setPanels({ timeline: !get(preferences).panels.timeline });
}

// the library tab comes to the front, or goes away when it already is there
export function toggleLibrary() {
  const p = get(preferences).panels;
  const front = p.bottomTab === 'library' && !p.hidden.includes('library');
  if (front) setPanels({ hidden: [...p.hidden, 'library'] });
  else showDockTab('library');
}
