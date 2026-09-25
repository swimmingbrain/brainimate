import { dialog, type MenuItem } from '$lib/stores/app';
import { setGroup, type Preferences } from '$lib/stores/preferences';
import { allWorkspaces, setWorkspace } from '$lib/stores/workspace';
import { alignToStage } from './align';
import { commandById, keysOf } from './actions';
import { keyLabel } from './keys';
import type { HistoryState } from './history';
import { clearRecent, type RecentFile } from '$lib/io/recent';
import { openRecent } from '$lib/io/files';
import { TEMPLATES } from '$lib/rig/templates';

export interface TopMenu {
  label: string;
  items: MenuItem[];
}

const SEP: MenuItem = { label: '', separator: true };

// what the menus need to know to grey out and tick entries
export interface MenuContext {
  history: HistoryState;
  hasSelection: boolean;
  alignToStage: boolean;
  recent: RecentFile[];
}

// a menu entry for a command with the key it answers to now, the label can read a little different
export function commandItem(id: string, shortcuts: Record<string, string>, extra: Partial<MenuItem> = {}): MenuItem {
  const cmd = commandById(id);
  if (!cmd) return { label: id, disabled: true };
  const key = keysOf(id, shortcuts)[0];
  return { label: cmd.label, shortcut: key ? keyLabel(key) : undefined, action: cmd.run, ...extra };
}

// the right click menu of the stage, for what is selected
export function stageMenu(shortcuts: Record<string, string>, hasSelection: boolean, canBind: boolean): MenuItem[] {
  const none = !hasSelection;
  const c = (id: string, extra: Partial<MenuItem> = {}) => commandItem(id, shortcuts, extra);
  const s = (id: string, extra: Partial<MenuItem> = {}) => c(id, { disabled: none, ...extra });
  return [
    s('edit.cut'),
    s('edit.copy'),
    c('edit.paste'),
    c('edit.paste-in-place'),
    s('edit.duplicate'),
    s('edit.delete'),
    SEP,
    s('modify.group'),
    s('modify.ungroup'),
    {
      label: 'Arrange',
      disabled: none,
      children: [s('modify.front'), s('modify.forward'), s('modify.backward'), s('modify.back')]
    },
    SEP,
    s('modify.symbol', { label: 'Convert to symbol...' }),
    s('rig.bind', { disabled: none || !canBind }),
    s('rig.unbind'),
    SEP,
    c('edit.select-all'),
    s('edit.deselect')
  ];
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
  // an entry for a command with the key it answers to now, the label can read a little different
  const c = (id: string, extra: Partial<MenuItem> = {}): MenuItem => commandItem(id, p.shortcuts, extra);
  // the same for an entry that only makes sense with something selected
  const s = (id: string, extra: Partial<MenuItem> = {}): MenuItem => c(id, { disabled: none, ...extra });
  const tick = (id: string, checked: boolean, label?: string): MenuItem => c(id, { checked, ...(label ? { label } : {}) });

  return [
    {
      label: 'File',
      items: [
        c('file.new', { label: 'New...' }),
        c('file.open', { label: 'Open...' }),
        { label: 'Open recent', children: recentItems(ctx.recent) },
        SEP,
        c('file.save'),
        c('file.save-as', { label: 'Save as...' }),
        c('file.close', { label: 'Close' }),
        SEP,
        {
          ...c('file.import'),
          action: undefined,
          children: [
            c('file.import-svg', { label: 'SVG...' }),
            c('file.import-image', { label: 'Image...' }),
            c('file.import-font', { label: 'Font...' })
          ]
        },
        c('file.export', { label: 'Export...' }),
        SEP,
        c('file.settings', { label: 'Document settings...' })
      ]
    },
    {
      label: 'Edit',
      items: [
        c('edit.undo', {
          label: ctx.history.undoLabel ? `Undo ${ctx.history.undoLabel.toLowerCase()}` : 'Undo',
          disabled: !ctx.history.canUndo
        }),
        c('edit.redo', {
          label: ctx.history.redoLabel ? `Redo ${ctx.history.redoLabel.toLowerCase()}` : 'Redo',
          disabled: !ctx.history.canRedo
        }),
        SEP,
        s('edit.cut'),
        s('edit.copy'),
        c('edit.paste'),
        c('edit.paste-in-place'),
        s('edit.duplicate'),
        s('edit.delete'),
        SEP,
        c('edit.select-all'),
        s('edit.deselect'),
        SEP,
        c('edit.palette', { label: 'Command palette...' }),
        c('edit.preferences', { label: 'Preferences...' }),
        c('help.shortcuts')
      ]
    },
    {
      label: 'View',
      items: [
        c('view.zoom-in'),
        c('view.zoom-out'),
        c('view.actual'),
        c('view.fit'),
        SEP,
        tick('view.rulers', p.rulers.show),
        tick('view.grid', p.grid.show),
        tick('view.guides', p.guides.show),
        tick('view.lock-guides', p.guides.lock),
        c('view.clear-guides'),
        {
          label: 'Snapping',
          children: [
            tick('view.snapping', p.snapping.enabled),
            SEP,
            tick('view.snap-grid', p.grid.snap),
            tick('view.snap-guides', p.guides.snap),
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
            tick('view.smart-guides', p.snapping.smartGuides)
          ]
        },
        SEP,
        tick('view.outline', outline),
        tick('view.onion', p.timeline.onion),
        tick('view.pasteboard', p.stage.pasteboard)
      ]
    },
    {
      label: 'Insert',
      items: [
        c('insert.layer', { label: 'Layer' }),
        c('insert.folder', { label: 'Layer folder' }),
        c('insert.rig-layer', { label: 'Rig layer' }),
        SEP,
        c('timeline.insert-frame', { label: 'Frame' }),
        c('timeline.keyframe', { label: 'Keyframe' }),
        c('timeline.blank-keyframe', { label: 'Blank keyframe' }),
        SEP,
        c('insert.symbol'),
        c('tool.text', { label: 'Text' })
      ]
    },
    {
      label: 'Modify',
      items: [
        s('modify.group'),
        s('modify.ungroup'),
        s('modify.symbol', { label: 'Convert to symbol...' }),
        s('modify.break'),
        SEP,
        {
          label: 'Arrange',
          children: [s('modify.front'), s('modify.forward'), s('modify.backward'), s('modify.back')]
        },
        {
          label: 'Align',
          children: [
            s('align.left', { label: 'Left' }),
            s('align.hcenter', { label: 'Horizontal center' }),
            s('align.right', { label: 'Right' }),
            SEP,
            s('align.top', { label: 'Top' }),
            s('align.vcenter', { label: 'Vertical center' }),
            s('align.bottom', { label: 'Bottom' }),
            SEP,
            s('align.distribute-h'),
            s('align.distribute-v'),
            SEP,
            { label: 'To stage', checked: ctx.alignToStage, action: () => alignToStage.set(!ctx.alignToStage) }
          ]
        },
        {
          label: 'Transform',
          children: [
            s('modify.flip-h'),
            s('modify.flip-v'),
            SEP,
            s('modify.rotate-cw'),
            s('modify.rotate-ccw'),
            SEP,
            s('modify.reset-transform')
          ]
        },
        {
          label: 'Path',
          children: [
            s('path.join', { label: 'Join' }),
            s('path.close', { label: 'Close' }),
            s('path.reverse', { label: 'Reverse direction' }),
            s('path.simplify', { label: 'Simplify' }),
            s('path.smooth', { label: 'Smooth' }),
            s('path.outline-stroke'),
            SEP,
            s('path.unite'),
            s('path.subtract'),
            s('path.intersect'),
            s('path.exclude'),
            s('path.divide'),
            SEP,
            s('path.outlines')
          ]
        },
        {
          label: 'Rig',
          children: [
            s('rig.bind'),
            s('rig.unbind'),
            c('rig.reset-pose'),
            SEP,
            {
              label: 'Add template',
              children: TEMPLATES.map((t) => c(`rig.template-${t.id}`, { label: t.label }))
            }
          ]
        }
      ]
    },
    {
      label: 'Window',
      items: [
        tick('window.properties', !p.panels.hidden.includes('properties'), 'Properties'),
        tick('window.color', !p.panels.hidden.includes('color'), 'Color'),
        tick('window.swatches', !p.panels.hidden.includes('swatches'), 'Swatches'),
        tick('window.library', !p.panels.hidden.includes('library'), 'Library'),
        tick('window.align', !p.panels.hidden.includes('align'), 'Align'),
        tick('window.transform', !p.panels.hidden.includes('transform'), 'Transform'),
        tick('window.rig', !p.panels.hidden.includes('rig'), 'Rig'),
        tick('window.timeline', p.panels.timeline),
        SEP,
        ...allWorkspaces(p).map((ws) => ({
          label: `${ws.name} workspace`,
          checked: workspace === ws.id,
          action: () => setWorkspace(ws.id)
        })),
        SEP,
        c('window.reset-workspace'),
        {
          label: 'Workspaces...',
          action: () => dialog.set({ kind: 'preferences', category: 'workspace' })
        }
      ]
    },
    {
      label: 'Help',
      items: [
        c('help.shortcuts'),
        c('help.start', { label: 'Getting started' }),
        SEP,
        c('help.about'),
        c('help.report', { label: 'Report a problem...' })
      ]
    }
  ];
}
