import { dialog, type MenuItem } from '$lib/stores/app';
import { setGroup, type DockTab, type Preferences } from '$lib/stores/preferences';
import { allWorkspaces, resetWorkspace, setWorkspace, togglePanel } from '$lib/stores/workspace';
import {
  addFolder,
  addLayer,
  addRigLayer,
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
  insertBlankKeyframes,
  insertFrames,
  insertKeyframes,
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
import { copy, cut, duplicate, pasteFromSystem } from './clipboard';
import { clearSelection, deleteSelection, selectAll } from './selection';
import { alignSelection, alignToStage, distributeSelection } from './align';
import { newSymbol, openConvertDialog } from './symbols';
import { outlineSelectedText } from './outlines';
import { addRigTemplate, bindSelection, resetPose, unbindSelection } from './rig';
import { TEMPLATES } from '$lib/rig/templates';
import { FONT_ACCEPT, IMAGE_ACCEPT, SVG_ACCEPT, openImport } from './importer';
import { selectTool } from '$lib/tools';
import type { HistoryState } from './history';
import { clearRecent, type RecentFile } from '$lib/io/recent';
import { closeDocument, newDocument, openDocument, openRecent, save, saveAs } from '$lib/io/files';

export interface TopMenu {
  label: string;
  items: MenuItem[];
}

const SEP: MenuItem = { label: '', separator: true };

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
  alignToStage: boolean;
  recent: RecentFile[];
}

function recentItems(recent: RecentFile[]): MenuItem[] {
  if (recent.length === 0) return [{ label: 'No recent files', disabled: true }];
  return [
    ...recent.map((file) => ({ label: file.name, action: () => openRecent(file) })),
    SEP,
    { label: 'Clear the list', action: () => void clearRecent() }
  ];
}

export function buildMenus(p: Preferences, outline: boolean, workspace: string, ctx: MenuContext): TopMenu[] {
  const none = !ctx.hasSelection;
  return [
    {
      label: 'File',
      items: [
        { label: 'New...', action: newDocument },
        { label: 'Open...', shortcut: 'Ctrl+O', action: openDocument },
        { label: 'Open recent', children: recentItems(ctx.recent) },
        SEP,
        { label: 'Save', shortcut: 'Ctrl+S', action: () => void save() },
        { label: 'Save as...', shortcut: 'Ctrl+Shift+S', action: () => void saveAs() },
        { label: 'Close', action: closeDocument },
        SEP,
        {
          label: 'Import',
          shortcut: 'Ctrl+I',
          children: [
            { label: 'SVG...', action: () => openImport(SVG_ACCEPT) },
            { label: 'Image...', action: () => openImport(IMAGE_ACCEPT) },
            { label: 'Font...', action: () => openImport(FONT_ACCEPT) }
          ]
        },
        { label: 'Export...', shortcut: 'Ctrl+E', action: () => dialog.set({ kind: 'export' }) },
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
        { label: 'Cut', shortcut: 'Ctrl+X', disabled: none, action: () => cut() },
        { label: 'Copy', shortcut: 'Ctrl+C', disabled: none, action: () => copy() },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => pasteFromSystem() },
        { label: 'Paste in place', shortcut: 'Ctrl+Shift+V', action: () => pasteFromSystem(true) },
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
        { label: 'Onion skin', shortcut: 'Alt+Shift+O', checked: p.timeline.onion, action: toggleOnion },
        { label: 'Pasteboard', checked: p.stage.pasteboard, action: togglePasteboard }
      ]
    },
    {
      label: 'Insert',
      items: [
        { label: 'Layer', action: addLayer },
        { label: 'Layer folder', action: addFolder },
        { label: 'Rig layer', action: addRigLayer },
        SEP,
        { label: 'Frame', shortcut: 'F5', action: insertFrames },
        { label: 'Keyframe', shortcut: 'F6', action: insertKeyframes },
        { label: 'Blank keyframe', shortcut: 'F7', action: insertBlankKeyframes },
        SEP,
        { label: 'New symbol', action: newSymbol },
        { label: 'Text', shortcut: 'T', action: () => selectTool('text') }
      ]
    },
    {
      label: 'Modify',
      items: [
        { label: 'Group', shortcut: 'Ctrl+G', disabled: none, action: groupSelection },
        { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', disabled: none, action: ungroupSelection },
        { label: 'Convert to symbol...', shortcut: 'F8', disabled: none, action: openConvertDialog },
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
            { label: 'Create outlines', shortcut: 'Ctrl+Shift+O', disabled: none, action: outlineSelectedText }
          ]
        },
        {
          label: 'Rig',
          children: [
            { label: 'Bind to bones', disabled: none, action: bindSelection },
            { label: 'Unbind', disabled: none, action: unbindSelection },
            { label: 'Reset pose', action: resetPose },
            SEP,
            {
              label: 'Add template',
              children: TEMPLATES.map((t) => ({ label: t.label, action: () => addRigTemplate(t.id) }))
            }
          ]
        }
      ]
    },
    {
      label: 'Window',
      items: [
        ...PANELS.map((panel) => ({
          label: panel.label,
          shortcut: panel.id === 'library' ? 'Ctrl+L' : undefined,
          checked: !p.panels.hidden.includes(panel.id),
          action: () => togglePanel(panel.id)
        })),
        SEP,
        ...allWorkspaces(p).map((ws) => ({
          label: `${ws.name} workspace`,
          checked: workspace === ws.id,
          action: () => setWorkspace(ws.id)
        })),
        SEP,
        { label: 'Reset workspace', action: resetWorkspace }
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
