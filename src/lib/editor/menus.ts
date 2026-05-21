import { dialog, setWorkspace, togglePanel, WORKSPACES, type MenuItem } from '$lib/stores/app';
import { setGroup, type DockTab, type Preferences, type Workspace } from '$lib/stores/preferences';
import {
  notYet,
  redo,
  toggleGrid,
  toggleGuides,
  toggleOnion,
  toggleOutline,
  togglePasteboard,
  toggleRulers,
  toggleSnapping,
  undo
} from './commands';
import { zoomActual, zoomFit, zoomIn, zoomOut } from './view';

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

export function buildMenus(p: Preferences, outline: boolean, workspace: Workspace): TopMenu[] {
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
        { label: 'Document settings...', shortcut: 'Ctrl+J', action: () => dialog.set({ kind: 'doc-settings' }) }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: undo },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: redo },
        SEP,
        soon('Cut', 'Ctrl+X'),
        soon('Copy', 'Ctrl+C'),
        soon('Paste', 'Ctrl+V'),
        soon('Paste in place', 'Ctrl+Shift+V'),
        soon('Duplicate', 'Ctrl+D'),
        SEP,
        soon('Select all', 'Ctrl+A'),
        soon('Deselect', 'Ctrl+Shift+A'),
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
        {
          label: 'Snapping',
          children: [
            { label: 'Snapping', checked: p.snapping.enabled, action: toggleSnapping },
            SEP,
            { label: 'Snap to grid', checked: p.grid.snap, action: () => setGroup('grid', { snap: !p.grid.snap }) },
            { label: 'Snap to guides', checked: p.guides.snap, action: () => setGroup('guides', { snap: !p.guides.snap }) },
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
            {
              label: 'Smart guides',
              checked: p.snapping.smartGuides,
              action: () => setGroup('snapping', { smartGuides: !p.snapping.smartGuides })
            }
          ]
        },
        SEP,
        { label: 'Outline mode', shortcut: 'Ctrl+Y', checked: outline, action: toggleOutline },
        { label: 'Onion skin', shortcut: 'Alt+O', checked: p.timeline.onion, action: toggleOnion },
        { label: 'Pasteboard', checked: p.stage.pasteboard, action: togglePasteboard }
      ]
    },
    {
      label: 'Insert',
      items: [
        soon('Layer'),
        soon('Layer folder'),
        soon('Rig layer'),
        SEP,
        soon('Frame', 'F5'),
        soon('Keyframe', 'F6'),
        soon('Blank keyframe', 'F7'),
        SEP,
        soon('Symbol...', 'Ctrl+F8'),
        soon('Text')
      ]
    },
    {
      label: 'Modify',
      items: [
        soon('Group', 'Ctrl+G'),
        soon('Ungroup', 'Ctrl+Shift+G'),
        soon('Convert to symbol...', 'F8'),
        soon('Break apart', 'Ctrl+B'),
        SEP,
        {
          label: 'Arrange',
          children: [
            soon('Bring to front', 'Ctrl+Shift+]'),
            soon('Bring forward', 'Ctrl+]'),
            soon('Send backward', 'Ctrl+['),
            soon('Send to back', 'Ctrl+Shift+[')
          ]
        },
        {
          label: 'Align',
          children: [
            soon('Left'),
            soon('Horizontal center'),
            soon('Right'),
            SEP,
            soon('Top'),
            soon('Vertical center'),
            soon('Bottom'),
            SEP,
            soon('Distribute widths'),
            soon('Distribute heights')
          ]
        },
        {
          label: 'Transform',
          children: [
            soon('Flip horizontal'),
            soon('Flip vertical'),
            SEP,
            soon('Rotate 90° clockwise', 'Ctrl+Shift+9'),
            soon('Rotate 90° counterclockwise', 'Ctrl+Shift+7'),
            SEP,
            soon('Remove transform')
          ]
        },
        {
          label: 'Path',
          children: [
            soon('Join'),
            soon('Close'),
            soon('Reverse direction'),
            soon('Simplify'),
            soon('Smooth'),
            soon('Outline stroke'),
            SEP,
            soon('Unite'),
            soon('Subtract'),
            soon('Intersect'),
            soon('Exclude'),
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
