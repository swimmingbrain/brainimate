import { get } from 'svelte/store';
import {
  anchorSelection,
  boneSelection,
  contextMenu,
  dialog,
  frameSelection,
  toolCursor,
  toolOptions
} from '$lib/stores/app';
import { preferences, type DockTab } from '$lib/stores/preferences';
import {
  BUILTIN_WORKSPACES,
  PANEL_LABELS,
  resetWorkspace,
  setWorkspace,
  toggleLibrary,
  togglePanel,
  toggleTimeline
} from '$lib/stores/workspace';
import { BUCKET_CURSOR, INK_CURSOR } from '$lib/tools/cursors';
import { TOOL_IDS, TOOL_INFO } from '$lib/tools/tool';
import { selectTool } from '$lib/tools';
import {
  addFolder,
  addLayer,
  addRigLayer,
  arrangeSelection,
  booleanSelection,
  breakApart,
  clearColor,
  clearKeyframes,
  closeSelectedPaths,
  copySelectedFrames,
  createTween,
  firstFrame,
  fitTimeline,
  flipSelection,
  groupSelection,
  insertBlankKeyframes,
  insertFrames,
  insertKeyframes,
  joinSelectedPaths,
  lastFrame,
  outlineSelectedStrokes,
  pasteSelectedFrames,
  redo,
  removeFrames,
  removeTransform,
  removeTween,
  resetColors,
  reverseSelectedFrames,
  reverseSelectedPaths,
  rotateSelection,
  selectAllFrames,
  showDocumentSettings,
  simplifySelectedPaths,
  smoothSelectedPaths,
  stepFrame,
  swapColors,
  toggleColorTarget,
  toggleGrid,
  toggleGuides,
  toggleOnion,
  toggleOutline,
  togglePasteboard,
  togglePlay,
  toggleRulers,
  toggleSmartGuides,
  toggleSnapToGrid,
  toggleSnapToGuides,
  toggleSnapping,
  undo,
  ungroupSelection
} from './commands';
import { copy, cut, duplicate, pasteFromSystem } from './clipboard';
import { clearSelection, nudge, selectAll } from './selection';
import { addRigTemplate, bindSelection, deletePicked, resetPose, unbindSelection } from './rig';
import { alignSelection, distributeSelection } from './align';
import { clearGuides, toggleGuideLock } from './guides';
import { zoomActual, zoomFit, zoomIn, zoomOut } from './view';
import { leaveSymbol, newSymbol, openConvertDialog } from './symbols';
import { outlineSelectedText } from './outlines';
import { FONT_ACCEPT, IMAGE_ACCEPT, SVG_ACCEPT, openImport } from './importer';
import { TEMPLATES } from '$lib/rig/templates';
import { closeDocument, newDocument, openDocument, save, saveAs } from '$lib/io/files';
import { keyLabel, normalizeCombo, sameCombo } from './keys';

export const REPO = 'https://github.com/swimmingbrain/brainimate';

// one thing the app can do, for the keys, the menus, the palette and the shortcuts editor
export interface Command {
  id: string;
  label: string;
  group: string;
  // the default combos, the first one is shown in menus
  keys: string[];
  run: () => void;
  // the browser would take these while a field has the focus, so they work from fields too
  global?: boolean;
  // the key waits for the browser's own copy, cut or paste event, the menu runs it right away
  clipboard?: 'copy' | 'cut' | 'paste' | 'paste-in-place';
  // only the palette of a dev build lists it
  dev?: boolean;
}

// escape lets go of one thing at a time: menus and dialogs, then what is picked, then an open symbol
export function escape() {
  if (get(contextMenu)) {
    contextMenu.set(null);
    return;
  }
  if (get(dialog)) {
    dialog.set(null);
    return;
  }
  anchorSelection.set([]);
  frameSelection.set(null);
  boneSelection.set(null);
  // with nothing selected escape leaves an open symbol
  if (leaveSymbol()) return;
  clearSelection();
}

// k is the bucket for fills, s the same tool as an ink bottle for strokes
function bucketMode(mode: 'fill' | 'stroke') {
  toolOptions.update((o) => ({ ...o, bucketMode: mode }));
  selectTool('bucket');
  toolCursor.set(mode === 'stroke' ? INK_CURSOR : BUCKET_CURSOR);
}

export function openShortcuts() {
  dialog.set({ kind: 'shortcuts' });
}

export function openPreferences() {
  dialog.set({ kind: 'preferences' });
}

export function openPalette() {
  dialog.set({ kind: 'palette' });
}

export function reportProblem() {
  window.open(`${REPO}/issues/new`, '_blank', 'noopener');
}

const PANELS: DockTab[] = ['properties', 'color', 'swatches', 'library', 'align', 'transform', 'rig'];

function toolCommands(): Command[] {
  return TOOL_IDS.map((id) => {
    const info = TOOL_INFO[id];
    const run = id === 'bucket' ? () => bucketMode('fill') : () => selectTool(id);
    return { id: `tool.${id}`, label: `${info.name} tool`, group: 'Tools', keys: info.shortcut ? [info.shortcut] : [], run };
  });
}

function build(): Command[] {
  const list: Command[] = [
    { id: 'file.new', label: 'New document', group: 'File', keys: [], run: newDocument },
    { id: 'file.open', label: 'Open', group: 'File', keys: ['Ctrl+O'], run: openDocument, global: true },
    { id: 'file.save', label: 'Save', group: 'File', keys: ['Ctrl+S'], run: () => void save(), global: true },
    { id: 'file.save-as', label: 'Save as', group: 'File', keys: ['Ctrl+Shift+S'], run: () => void saveAs(), global: true },
    { id: 'file.close', label: 'Close document', group: 'File', keys: [], run: closeDocument },
    { id: 'file.import', label: 'Import', group: 'File', keys: ['Ctrl+I'], run: () => openImport(), global: true },
    { id: 'file.import-svg', label: 'Import SVG', group: 'File', keys: [], run: () => openImport(SVG_ACCEPT) },
    { id: 'file.import-image', label: 'Import image', group: 'File', keys: [], run: () => openImport(IMAGE_ACCEPT) },
    { id: 'file.import-font', label: 'Import font', group: 'File', keys: [], run: () => openImport(FONT_ACCEPT) },
    {
      id: 'file.export',
      label: 'Export',
      group: 'File',
      keys: ['Ctrl+E'],
      run: () => dialog.set({ kind: 'export' }),
      global: true
    },
    { id: 'file.settings', label: 'Document settings', group: 'File', keys: [], run: showDocumentSettings },

    { id: 'edit.undo', label: 'Undo', group: 'Edit', keys: ['Ctrl+Z'], run: undo },
    { id: 'edit.redo', label: 'Redo', group: 'Edit', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], run: redo },
    { id: 'edit.cut', label: 'Cut', group: 'Edit', keys: ['Ctrl+X'], run: () => cut(), clipboard: 'cut' },
    { id: 'edit.copy', label: 'Copy', group: 'Edit', keys: ['Ctrl+C'], run: () => void copy(), clipboard: 'copy' },
    {
      id: 'edit.paste',
      label: 'Paste',
      group: 'Edit',
      keys: ['Ctrl+V'],
      run: () => void pasteFromSystem(),
      clipboard: 'paste'
    },
    {
      id: 'edit.paste-in-place',
      label: 'Paste in place',
      group: 'Edit',
      keys: ['Ctrl+Shift+V'],
      run: () => void pasteFromSystem(true),
      clipboard: 'paste-in-place'
    },
    { id: 'edit.duplicate', label: 'Duplicate', group: 'Edit', keys: ['Ctrl+D'], run: duplicate },
    { id: 'edit.delete', label: 'Delete', group: 'Edit', keys: ['Delete', 'Backspace'], run: deletePicked },
    { id: 'edit.select-all', label: 'Select all', group: 'Edit', keys: ['Ctrl+A'], run: selectAll },
    { id: 'edit.deselect', label: 'Deselect', group: 'Edit', keys: ['Ctrl+Shift+A'], run: clearSelection },
    { id: 'edit.escape', label: 'Deselect or leave the symbol', group: 'Edit', keys: ['Escape'], run: escape },
    { id: 'edit.nudge-left', label: 'Nudge left', group: 'Edit', keys: ['Left'], run: () => nudge(-1, 0) },
    { id: 'edit.nudge-right', label: 'Nudge right', group: 'Edit', keys: ['Right'], run: () => nudge(1, 0) },
    { id: 'edit.nudge-up', label: 'Nudge up', group: 'Edit', keys: ['Up'], run: () => nudge(0, -1) },
    { id: 'edit.nudge-down', label: 'Nudge down', group: 'Edit', keys: ['Down'], run: () => nudge(0, 1) },
    { id: 'edit.push-left', label: 'Nudge left 10 px', group: 'Edit', keys: ['Shift+Left'], run: () => nudge(-10, 0) },
    { id: 'edit.push-right', label: 'Nudge right 10 px', group: 'Edit', keys: ['Shift+Right'], run: () => nudge(10, 0) },
    { id: 'edit.push-up', label: 'Nudge up 10 px', group: 'Edit', keys: ['Shift+Up'], run: () => nudge(0, -10) },
    { id: 'edit.push-down', label: 'Nudge down 10 px', group: 'Edit', keys: ['Shift+Down'], run: () => nudge(0, 10) },
    { id: 'edit.preferences', label: 'Preferences', group: 'Edit', keys: ['Ctrl+K', 'Ctrl+,'], run: openPreferences },
    { id: 'edit.palette', label: 'Command palette', group: 'Edit', keys: ['Ctrl+Shift+P'], run: openPalette },

    { id: 'view.zoom-in', label: 'Zoom in', group: 'View', keys: ['Ctrl+=', 'Ctrl+Shift+=', 'Ctrl+NumpadAdd'], run: zoomIn },
    { id: 'view.zoom-out', label: 'Zoom out', group: 'View', keys: ['Ctrl+-', 'Ctrl+NumpadSubtract'], run: zoomOut },
    { id: 'view.actual', label: 'Actual size', group: 'View', keys: ['Ctrl+1'], run: zoomActual },
    { id: 'view.fit', label: 'Fit in window', group: 'View', keys: ['Ctrl+0'], run: zoomFit },
    { id: 'view.rulers', label: 'Rulers', group: 'View', keys: ['Ctrl+R'], run: toggleRulers },
    { id: 'view.grid', label: 'Grid', group: 'View', keys: ["Ctrl+'"], run: toggleGrid },
    { id: 'view.guides', label: 'Guides', group: 'View', keys: ['Ctrl+;'], run: toggleGuides },
    { id: 'view.lock-guides', label: 'Lock guides', group: 'View', keys: [], run: toggleGuideLock },
    { id: 'view.clear-guides', label: 'Clear guides', group: 'View', keys: [], run: clearGuides },
    { id: 'view.snapping', label: 'Snapping', group: 'View', keys: [], run: toggleSnapping },
    { id: 'view.snap-grid', label: 'Snap to grid', group: 'View', keys: [], run: toggleSnapToGrid },
    { id: 'view.snap-guides', label: 'Snap to guides', group: 'View', keys: [], run: toggleSnapToGuides },
    { id: 'view.smart-guides', label: 'Smart guides', group: 'View', keys: ['Ctrl+U'], run: toggleSmartGuides },
    { id: 'view.outline', label: 'Outline mode', group: 'View', keys: [], run: toggleOutline },
    { id: 'view.onion', label: 'Onion skin', group: 'View', keys: ['Alt+Shift+O'], run: toggleOnion },
    { id: 'view.pasteboard', label: 'Pasteboard', group: 'View', keys: [], run: togglePasteboard },

    ...toolCommands(),
    { id: 'tool.ink', label: 'Ink bottle', group: 'Tools', keys: ['S'], run: () => bucketMode('stroke') },

    { id: 'color.target', label: 'Fill or stroke in front', group: 'Colors', keys: ['X'], run: toggleColorTarget },
    { id: 'color.swap', label: 'Swap fill and stroke', group: 'Colors', keys: ['Shift+X'], run: swapColors },
    { id: 'color.default', label: 'Default colors', group: 'Colors', keys: ['D'], run: resetColors },
    { id: 'color.none', label: 'No color', group: 'Colors', keys: ['/'], run: clearColor },

    { id: 'timeline.play', label: 'Play or pause', group: 'Timeline', keys: ['Enter'], run: togglePlay },
    { id: 'timeline.previous', label: 'Previous frame', group: 'Timeline', keys: [','], run: () => stepFrame(-1) },
    { id: 'timeline.next', label: 'Next frame', group: 'Timeline', keys: ['.'], run: () => stepFrame(1) },
    { id: 'timeline.first', label: 'First frame', group: 'Timeline', keys: ['Shift+,'], run: firstFrame },
    { id: 'timeline.last', label: 'Last frame', group: 'Timeline', keys: ['Shift+.'], run: lastFrame },
    { id: 'timeline.insert-frame', label: 'Insert frame', group: 'Timeline', keys: ['F5'], run: insertFrames },
    { id: 'timeline.remove-frame', label: 'Remove frame', group: 'Timeline', keys: ['Shift+F5'], run: removeFrames },
    { id: 'timeline.keyframe', label: 'Insert keyframe', group: 'Timeline', keys: ['F6'], run: insertKeyframes },
    {
      id: 'timeline.blank-keyframe',
      label: 'Insert blank keyframe',
      group: 'Timeline',
      keys: ['F7'],
      run: insertBlankKeyframes
    },
    { id: 'timeline.clear-keyframe', label: 'Clear keyframe', group: 'Timeline', keys: ['Shift+F6'], run: clearKeyframes },
    { id: 'timeline.create-tween', label: 'Create tween', group: 'Timeline', keys: [], run: createTween },
    { id: 'timeline.remove-tween', label: 'Remove tween', group: 'Timeline', keys: [], run: removeTween },
    { id: 'timeline.copy-frames', label: 'Copy frames', group: 'Timeline', keys: ['Ctrl+Alt+C'], run: copySelectedFrames },
    { id: 'timeline.paste-frames', label: 'Paste frames', group: 'Timeline', keys: ['Ctrl+Alt+V'], run: pasteSelectedFrames },
    { id: 'timeline.reverse-frames', label: 'Reverse frames', group: 'Timeline', keys: [], run: reverseSelectedFrames },
    { id: 'timeline.select-frames', label: 'Select all frames', group: 'Timeline', keys: [], run: selectAllFrames },
    { id: 'timeline.fit', label: 'Fit the timeline', group: 'Timeline', keys: [], run: fitTimeline },

    { id: 'insert.layer', label: 'New layer', group: 'Insert', keys: [], run: addLayer },
    { id: 'insert.folder', label: 'New layer folder', group: 'Insert', keys: [], run: addFolder },
    { id: 'insert.rig-layer', label: 'New rig layer', group: 'Insert', keys: [], run: addRigLayer },
    { id: 'insert.symbol', label: 'New symbol', group: 'Insert', keys: [], run: newSymbol },
    {
      id: 'insert.stress',
      label: 'Insert stress test',
      group: 'Insert',
      keys: [],
      run: () => void import('./stress').then((m) => m.insertStressTest()),
      dev: true
    },

    { id: 'modify.group', label: 'Group', group: 'Modify', keys: ['Ctrl+G'], run: groupSelection },
    { id: 'modify.ungroup', label: 'Ungroup', group: 'Modify', keys: ['Ctrl+Shift+G'], run: ungroupSelection },
    { id: 'modify.symbol', label: 'Convert to symbol', group: 'Modify', keys: ['F8'], run: openConvertDialog },
    { id: 'modify.break', label: 'Break apart', group: 'Modify', keys: ['Ctrl+B'], run: breakApart },
    {
      id: 'modify.front',
      label: 'Bring to front',
      group: 'Modify',
      keys: ['Ctrl+Shift+Up'],
      run: () => arrangeSelection('front')
    },
    { id: 'modify.forward', label: 'Bring forward', group: 'Modify', keys: ['Ctrl+Up'], run: () => arrangeSelection('forward') },
    {
      id: 'modify.backward',
      label: 'Send backward',
      group: 'Modify',
      keys: ['Ctrl+Down'],
      run: () => arrangeSelection('backward')
    },
    {
      id: 'modify.back',
      label: 'Send to back',
      group: 'Modify',
      keys: ['Ctrl+Shift+Down'],
      run: () => arrangeSelection('back')
    },
    { id: 'modify.flip-h', label: 'Flip horizontal', group: 'Modify', keys: [], run: () => flipSelection(true) },
    { id: 'modify.flip-v', label: 'Flip vertical', group: 'Modify', keys: [], run: () => flipSelection(false) },
    { id: 'modify.rotate-cw', label: 'Rotate 90° clockwise', group: 'Modify', keys: [], run: () => rotateSelection(90) },
    {
      id: 'modify.rotate-ccw',
      label: 'Rotate 90° counterclockwise',
      group: 'Modify',
      keys: [],
      run: () => rotateSelection(-90)
    },
    { id: 'modify.reset-transform', label: 'Remove transform', group: 'Modify', keys: [], run: removeTransform },
    { id: 'align.left', label: 'Align left', group: 'Modify', keys: [], run: () => alignSelection('left') },
    { id: 'align.hcenter', label: 'Align horizontal centers', group: 'Modify', keys: [], run: () => alignSelection('hcenter') },
    { id: 'align.right', label: 'Align right', group: 'Modify', keys: [], run: () => alignSelection('right') },
    { id: 'align.top', label: 'Align top', group: 'Modify', keys: [], run: () => alignSelection('top') },
    { id: 'align.vcenter', label: 'Align vertical centers', group: 'Modify', keys: [], run: () => alignSelection('vcenter') },
    { id: 'align.bottom', label: 'Align bottom', group: 'Modify', keys: [], run: () => alignSelection('bottom') },
    {
      id: 'align.distribute-h',
      label: 'Distribute horizontal centers',
      group: 'Modify',
      keys: [],
      run: () => distributeSelection('hcenters')
    },
    {
      id: 'align.distribute-v',
      label: 'Distribute vertical centers',
      group: 'Modify',
      keys: [],
      run: () => distributeSelection('vcenters')
    },
    { id: 'path.join', label: 'Join paths', group: 'Path', keys: ['Ctrl+J'], run: joinSelectedPaths },
    { id: 'path.close', label: 'Close path', group: 'Path', keys: [], run: closeSelectedPaths },
    { id: 'path.reverse', label: 'Reverse path direction', group: 'Path', keys: [], run: reverseSelectedPaths },
    { id: 'path.simplify', label: 'Simplify path', group: 'Path', keys: [], run: simplifySelectedPaths },
    { id: 'path.smooth', label: 'Smooth path', group: 'Path', keys: [], run: smoothSelectedPaths },
    { id: 'path.outline-stroke', label: 'Outline stroke', group: 'Path', keys: [], run: () => void outlineSelectedStrokes() },
    { id: 'path.unite', label: 'Unite', group: 'Path', keys: [], run: () => void booleanSelection('unite') },
    { id: 'path.subtract', label: 'Subtract', group: 'Path', keys: [], run: () => void booleanSelection('subtract') },
    { id: 'path.intersect', label: 'Intersect', group: 'Path', keys: [], run: () => void booleanSelection('intersect') },
    { id: 'path.exclude', label: 'Exclude', group: 'Path', keys: [], run: () => void booleanSelection('exclude') },
    { id: 'path.divide', label: 'Divide', group: 'Path', keys: [], run: () => void booleanSelection('divide') },
    { id: 'path.outlines', label: 'Create outlines', group: 'Path', keys: ['Ctrl+Shift+O'], run: outlineSelectedText },

    { id: 'rig.bind', label: 'Bind to bones', group: 'Rig', keys: [], run: bindSelection },
    { id: 'rig.unbind', label: 'Unbind', group: 'Rig', keys: [], run: unbindSelection },
    { id: 'rig.reset-pose', label: 'Reset pose', group: 'Rig', keys: [], run: resetPose },
    ...TEMPLATES.map((t) => ({
      id: `rig.template-${t.id}`,
      label: `Add ${t.label.toLowerCase()} rig`,
      group: 'Rig',
      keys: [],
      run: () => addRigTemplate(t.id)
    })),

    { id: 'window.library', label: 'Library', group: 'Window', keys: ['Ctrl+L'], run: toggleLibrary },
    { id: 'window.timeline', label: 'Timeline', group: 'Window', keys: [], run: toggleTimeline },
    ...PANELS.filter((p) => p !== 'library').map((p) => ({
      id: `window.${p}`,
      label: `${PANEL_LABELS[p]} panel`,
      group: 'Window',
      keys: [],
      run: () => togglePanel(p)
    })),
    ...BUILTIN_WORKSPACES.map((w) => ({
      id: `window.workspace-${w.id}`,
      label: `${w.name} workspace`,
      group: 'Window',
      keys: [],
      run: () => setWorkspace(w.id)
    })),
    { id: 'window.reset-workspace', label: 'Reset workspace', group: 'Window', keys: [], run: resetWorkspace },

    { id: 'help.shortcuts', label: 'Keyboard shortcuts', group: 'Help', keys: ['Shift+/'], run: openShortcuts },
    {
      id: 'help.start',
      label: 'Getting started',
      group: 'Help',
      keys: [],
      run: () => dialog.set({ kind: 'getting-started' })
    },
    { id: 'help.about', label: 'About brainIMATE', group: 'Help', keys: [], run: () => dialog.set({ kind: 'about' }) },
    { id: 'help.report', label: 'Report a problem', group: 'Help', keys: [], run: reportProblem }
  ];
  return list;
}

// a build for the web leaves the commands that only help to measure out
export const COMMANDS: Command[] = build().filter((c) => !c.dev || import.meta.env.DEV);

const byId = new Map(COMMANDS.map((c) => [c.id, c]));

export function commandById(id: string): Command | null {
  return byId.get(id) ?? null;
}

export function runCommand(id: string) {
  byId.get(id)?.run();
}

// the keys a command answers to: its own override, an empty one for none, or its defaults
export function keysOf(id: string, overrides: Record<string, string>): string[] {
  const cmd = byId.get(id);
  if (!cmd) return [];
  if (id in overrides) return overrides[id] ? [overrides[id]] : [];
  return cmd.keys;
}

// the combo menus and tooltips show for a command, empty when it has none
export function shortcutOf(id: string, overrides = get(preferences).shortcuts): string {
  return keysOf(id, overrides)[0] ?? '';
}

// a tooltip with the key a command answers to now, like Pen (P)
export function tip(name: string, id: string, overrides: Record<string, string>): string {
  const key = keysOf(id, overrides)[0];
  return key ? `${name} (${keyLabel(key)})` : name;
}

// the other commands that answer to a combo
export function conflictsWith(combo: string, id: string, overrides: Record<string, string>): Command[] {
  return COMMANDS.filter((c) => c.id !== id && keysOf(c.id, overrides).some((k) => sameCombo(k, combo)));
}

// the overrides with one command on a new combo, or back on its defaults when combo is null
export function rebind(overrides: Record<string, string>, id: string, combo: string | null): Record<string, string> {
  const next = { ...overrides };
  const cmd = byId.get(id);
  if (!cmd) return next;
  if (combo === null) {
    delete next[id];
    return next;
  }
  const clean = combo ? normalizeCombo(combo) : '';
  if (clean === null) return next;
  if (cmd.keys.length === 1 && sameCombo(cmd.keys[0], clean)) delete next[id];
  else next[id] = clean;
  return next;
}

// the other commands give up the combo, a command left with no key gets an empty override
export function takeCombo(overrides: Record<string, string>, id: string, combo: string): Record<string, string> {
  let next = rebind(overrides, id, combo);
  for (const other of conflictsWith(combo, id, next)) {
    const left = keysOf(other.id, next).filter((k) => !sameCombo(k, combo));
    next = { ...next, [other.id]: left[0] ?? '' };
  }
  return next;
}
