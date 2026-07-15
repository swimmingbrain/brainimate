import { dialog, setWorkspace, togglePanel, WORKSPACES, type MenuItem } from '$lib/stores/app';
import { setGroup, type DockTab, type Preferences, type Workspace } from '$lib/stores/preferences';
import {
  arrangeSelection,
  booleanSelection,
  breakApart,
  closeSelectedPaths,
  flipSelection,
  groupSelection,
  joinSelectedPaths,
  outlineSelectedStrokes,
  simplifySelectedPaths,
  smoothSelectedPaths,
  ungroupSelection,
  insertKeyframes,
  notYet,
  redo,
  removeTransform,
  reverseSelectedPaths,
  rotateSelection,
  showDocumentSettings,
  toggleGrid,
  toggleGuides,
  toggleOnion,
  toggleOutline,
  togglePasteboard,
  toggleRulers,
  toggleSmartGuides,
  toggleSnapToGrid,
  toggleSnapToGuides,
  toggleSnapping,
  undo
} from './commands';
import { clearGuides, toggleGuideLock } from './guides';
import { zoomActual, zoomFit, zoomIn, zoomOut } from './view';
import { copy, cut, duplicate, paste, pasteInPlace } from './clipboard';
import { clearSelection, deleteSelection, selectAll } from './selection';
import { addLayer } from './layers';
import { alignSelection, alignToStage, distributeSelection } from './align';
import type { HistoryState } from './history';

export interface TopMenu {
  label: string;
  items: MenuItem[];
}

const SEP: MenuItem = { label: '', separator: true };

// a menu entry whose work comes in a later step
function soon(label: string, shortcut?: string): MenuItem {
  return { label, shortcut, action: () => notYet(label) };
}

const PANELS: { id: DockTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'color', label: 'Color' },
  { id: 'swatches', label: 'Swatches' },
  { id: 'library', label: 'Library' },
  { id: 'align', label: 'Align' },
  { id: 'transform', label: 'Transform' },
  { id: 'rig', label: 'Rig' }
];

// what the edit menu needs to know to grey out entries
export interface MenuContext {
  history: HistoryState;
  hasSelection: boolean;
  hasClipboard: boolean;
  alignToStage: boolean;
}

export function buildMenus(p: Preferences, outline: boolean, workspace: Workspace, ctx: MenuContext): TopMenu[] {
  const none = !ctx.hasSelection;
  return [
    {
      label: 'File',
      items: [
        soon('New', 'Ctrl+N'),
        soon('Open...', 'Ctrl+O'),
        { label: 'Open recent', children: [{ label: 'No recent files', disabled: true }] },
        SEP,
        soon('Save', 'Ctrl+S'),
        soon('Save as...', 'Ctrl+Shift+S'),
        SEP,
        { label: 'Import', children: [soon('SVG...'), soon('Image...'), soon('Font...')] },
        { label: 'Export...', shortcut: 'Ctrl+Shift+E', action: () => dialog.set({ kind: 'export' }) },
        SEP,
        { label: 'Document settings...', action: showDocumentSettings }
      ]
    },
    {
      label: 'Edit',
      items: [
        {
          label: ctx.history.undoLabel ? `Undo ${ctx.history.undoLabel.toLowerCase()}` : 'Undo',
          shortcut: 'Ctrl+Z',
          disabled: !ctx.history.canUndo,
          action: undo
        },
        {
          label: ctx.history.redoLabel ? `Redo ${ctx.history.redoLabel.toLowerCase()}` : 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          disabled: !ctx.history.canRedo,
          action: redo
        },
        SEP,
        { label: 'Cut', shortcut: 'Ctrl+X', disabled: none, action: cut },
        { label: 'Copy', shortcut: 'Ctrl+C', disabled: none, action: copy },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !ctx.hasClipboard, action: paste },
        { label: 'Paste in place', shortcut: 'Ctrl+Shift+V', disabled: !ctx.hasClipboard, action: pasteInPlace },
        { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: none, action: duplicate },
        { label: 'Delete', shortcut: 'Delete', disabled: none, action: deleteSelection },
        SEP,
        { label: 'Select all', shortcut: 'Ctrl+A', action: selectAll },
        { label: 'Deselect', shortcut: 'Ctrl+Shift+A', disabled: none, action: clearSelection },
        SEP,
        { label: 'Preferences...', shortcut: 'Ctrl+,', action: () => dialog.set({ kind: 'preferences' }) },
        { label: 'Keyboard shortcuts', shortcut: '?', action: () => dialog.set({ kind: 'shortcuts' }) }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom in', shortcut: 'Ctrl+=', action: zoomIn },
        { label: 'Zoom out', shortcut: 'Ctrl+-', action: zoomOut },
        { label: 'Actual size', shortcut: 'Ctrl+1', action: zoomActual },
        { label: 'Fit in window', shortcut: 'Ctrl+0', action: zoomFit },
        SEP,
        { label: 'Rulers', shortcut: 'Ctrl+R', checked: p.rulers.show, action: toggleRulers },
        { label: 'Grid', shortcut: "Ctrl+'", checked: p.grid.show, action: toggleGrid },
        { label: 'Guides', shortcut: 'Ctrl+;', checked: p.guides.show, action: toggleGuides },
        { label: 'Lock guides', checked: p.guides.lock, action: toggleGuideLock },
        { label: 'Clear guides', action: clearGuides },
        {
          label: 'Snapping',
          children: [
            { label: 'Snapping', checked: p.snapping.enabled, action: toggleSnapping },
            SEP,
            { label: 'Snap to grid', checked: p.grid.snap, action: toggleSnapToGrid },
            { label: 'Snap to guides', checked: p.guides.snap, action: toggleSnapToGuides },
            {
              label: 'Snap to points',
              checked: p.snapping.points,
              action: () => setGroup('snapping', { points: !p.snapping.points })
            },
            {
              label: 'Snap to objects',
              checked: p.snapping.objects,
              action: () => setGroup('snapping', { objects: !p.snapping.objects })
            },
            {
              label: 'Snap to pixels',
              checked: p.snapping.pixels,
              action: () => setGroup('snapping', { pixels: !p.snapping.pixels })
            },
            { label: 'Smart guides', shortcut: 'Ctrl+U', checked: p.snapping.smartGuides, action: toggleSmartGuides }
          ]
        },
        SEP,
        { label: 'Outline mode', checked: outline, action: toggleOutline },
        { label: 'Onion skin', shortcut: 'Alt+O', checked: p.timeline.onion, action: toggleOnion },
        { label: 'Pasteboard', checked: p.stage.pasteboard, action: togglePasteboard }
      ]
    },
    {
      label: 'Insert',
      items: [
        { label: 'Layer', action: addLayer },
        soon('Layer folder'),
        soon('Rig layer'),
        SEP,
        soon('Frame', 'F5'),
        { label: 'Keyframe', shortcut: 'F6', action: insertKeyframes },
        soon('Blank keyframe', 'F7'),
        SEP,
        soon('Symbol...', 'Ctrl+F8'),
        soon('Text')
      ]
    },
    {
      label: 'Modify',
      items: [
        { label: 'Group', shortcut: 'Ctrl+G', disabled: none, action: groupSelection },
        { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', disabled: none, action: ungroupSelection },
        soon('Convert to symbol...', 'F8'),
        { label: 'Break apart', shortcut: 'Ctrl+B', disabled: none, action: breakApart },
        SEP,
        {
          label: 'Arrange',
          children: [
            {
              label: 'Bring to front',
              shortcut: 'Ctrl+Shift+Up',
              disabled: none,
              action: () => arrangeSelection('front')
            },
            {
              label: 'Bring forward',
              shortcut: 'Ctrl+Up',
              disabled: none,
              action: () => arrangeSelection('forward')
            },
            {
              label: 'Send backward',
              shortcut: 'Ctrl+Down',
              disabled: none,
              action: () => arrangeSelection('backward')
            },
            {
              label: 'Send to back',
              shortcut: 'Ctrl+Shift+Down',
              disabled: none,
              action: () => arrangeSelection('back')
            }
          ]
        },
        {
          label: 'Align',
          children: [
            { label: 'Left', disabled: none, action: () => alignSelection('left') },
            { label: 'Horizontal center', disabled: none, action: () => alignSelection('hcenter') },
            { label: 'Right', disabled: none, action: () => alignSelection('right') },
            SEP,
            { label: 'Top', disabled: none, action: () => alignSelection('top') },
            { label: 'Vertical center', disabled: none, action: () => alignSelection('vcenter') },
            { label: 'Bottom', disabled: none, action: () => alignSelection('bottom') },
            SEP,
            { label: 'Distribute horizontal centers', disabled: none, action: () => distributeSelection('hcenters') },
            { label: 'Distribute vertical centers', disabled: none, action: () => distributeSelection('vcenters') },
            { label: 'Same horizontal spacing', disabled: none, action: () => distributeSelection('hspace') },
            { label: 'Same vertical spacing', disabled: none, action: () => distributeSelection('vspace') },
            SEP,
            { label: 'To stage', checked: ctx.alignToStage, action: () => alignToStage.set(!ctx.alignToStage) }
          ]
        },
        {
          label: 'Transform',
          children: [
            { label: 'Flip horizontal', disabled: none, action: () => flipSelection(true) },
            { label: 'Flip vertical', disabled: none, action: () => flipSelection(false) },
            SEP,
            { label: 'Rotate 90° clockwise', disabled: none, action: () => rotateSelection(90) },
            { label: 'Rotate 90° counterclockwise', disabled: none, action: () => rotateSelection(-90) },
            SEP,
            { label: 'Remove transform', disabled: none, action: removeTransform }
          ]
        },
        {
          label: 'Path',
          children: [
            { label: 'Join', shortcut: 'Ctrl+J', disabled: none, action: joinSelectedPaths },
            { label: 'Close', disabled: none, action: closeSelectedPaths },
            { label: 'Reverse direction', disabled: none, action: reverseSelectedPaths },
            { label: 'Simplify', disabled: none, action: simplifySelectedPaths },
            { label: 'Smooth', disabled: none, action: smoothSelectedPaths },
            { label: 'Outline stroke', disabled: none, action: outlineSelectedStrokes },
            SEP,
            { label: 'Unite', disabled: none, action: () => booleanSelection('unite') },
            { label: 'Subtract', disabled: none, action: () => booleanSelection('subtract') },
            { label: 'Intersect', disabled: none, action: () => booleanSelection('intersect') },
            { label: 'Exclude', disabled: none, action: () => booleanSelection('exclude') },
            { label: 'Divide', disabled: none, action: () => booleanSelection('divide') },
            SEP,
            soon('Create outlines', 'Ctrl+Shift+O')
          ]
        },
        {
          label: 'Rig',
          children: [soon('Bind to bone'), soon('Unbind'), soon('Reset pose'), SEP, soon('Add template')]
        }
      ]
    },
    {
      label: 'Window',
      items: [
        ...PANELS.map((panel) => ({
          label: panel.label,
          checked: !p.panels.hidden.includes(panel.id),
          action: () => togglePanel(panel.id)
        })),
        SEP,
        ...WORKSPACES.map((ws) => ({
          label: `${ws.label} workspace`,
          checked: workspace === ws.id,
          action: () => setWorkspace(ws.id)
        })),
        SEP,
        { label: 'Reset workspace', action: () => setWorkspace(workspace) }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard shortcuts', shortcut: '?', action: () => dialog.set({ kind: 'shortcuts' }) },
        SEP,
        { label: 'About brainIMATE', action: () => dialog.set({ kind: 'about' }) }
      ]
    }
  ];
}
