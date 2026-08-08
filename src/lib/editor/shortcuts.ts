import { get } from 'svelte/store';
import { createKeybindingsHandler, type KeybindingsMap } from 'tinykeys';
import { anchorSelection, contextMenu, dialog, frameSelection, toolCursor, toolOptions } from '$lib/stores/app';
import { BUCKET_CURSOR, INK_CURSOR } from '$lib/tools/cursors';
import { TOOL_IDS, TOOL_INFO } from '$lib/tools/tool';
import { keyDown, selectTool } from '$lib/tools';
import {
  arrangeSelection,
  breakApart,
  clearColor,
  clearKeyframes,
  copySelectedFrames,
  firstFrame,
  groupSelection,
  insertBlankKeyframes,
  insertFrames,
  insertKeyframes,
  joinSelectedPaths,
  lastFrame,
  pasteSelectedFrames,
  removeFrames,
  ungroupSelection,
  redo,
  resetColors,
  stepFrame,
  swapColors,
  toggleColorTarget,
  toggleGrid,
  toggleGuides,
  toggleOnion,
  toggleRulers,
  toggleSmartGuides,
  togglePlay,
  undo
} from './commands';
import { copy, cut, duplicate, paste, pasteInPlace } from './clipboard';
import { clearSelection, deleteSelection, nudge, selectAll } from './selection';
import { zoomActual, zoomFit, zoomIn, zoomOut } from './view';
import { leaveSymbol, openConvertDialog } from './symbols';

// fields keep their keys, menus and dialogs handle their own
function ignored(e: KeyboardEvent): boolean {
  const el = e.target instanceof HTMLElement ? e.target : null;
  if (!el) return false;
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return el.closest('[role="dialog"], [role="menu"]') !== null;
}

function run(fn: () => unknown) {
  return (e: KeyboardEvent) => {
    e.preventDefault();
    fn();
  };
}

function escape() {
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
  // with nothing selected escape leaves an open symbol
  if (leaveSymbol()) return;
  clearSelection();
}

function bucketMode(mode: 'fill' | 'stroke') {
  toolOptions.update((o) => ({ ...o, bucketMode: mode }));
  selectTool('bucket');
  toolCursor.set(mode === 'stroke' ? INK_CURSOR : BUCKET_CURSOR);
}

function bindings(): KeybindingsMap {
  const map: KeybindingsMap = {
    '$mod+z': run(undo),
    '$mod+Shift+z': run(redo),
    '$mod+y': run(redo),
    '$mod+c': run(copy),
    '$mod+x': run(cut),
    '$mod+v': run(paste),
    '$mod+Shift+v': run(pasteInPlace),
    '$mod+d': run(duplicate),
    '$mod+a': run(selectAll),
    '$mod+Shift+a': run(clearSelection),
    '$mod+g': run(groupSelection),
    '$mod+Shift+g': run(ungroupSelection),
    '$mod+b': run(breakApart),
    '$mod+j': run(joinSelectedPaths),
    '$mod+ArrowUp': run(() => arrangeSelection('forward')),
    '$mod+ArrowDown': run(() => arrangeSelection('backward')),
    '$mod+Shift+ArrowUp': run(() => arrangeSelection('front')),
    '$mod+Shift+ArrowDown': run(() => arrangeSelection('back')),
    Delete: run(deleteSelection),
    Backspace: run(deleteSelection),
    Escape: run(escape),

    ArrowLeft: run(() => nudge(-1, 0)),
    ArrowRight: run(() => nudge(1, 0)),
    ArrowUp: run(() => nudge(0, -1)),
    ArrowDown: run(() => nudge(0, 1)),
    'Shift+ArrowLeft': run(() => nudge(-10, 0)),
    'Shift+ArrowRight': run(() => nudge(10, 0)),
    'Shift+ArrowUp': run(() => nudge(0, -10)),
    'Shift+ArrowDown': run(() => nudge(0, 10)),

    '$mod+=': run(zoomIn),
    '$mod+[Shift]++': run(zoomIn),
    '$mod+NumpadAdd': run(zoomIn),
    '$mod+-': run(zoomOut),
    '$mod+NumpadSubtract': run(zoomOut),
    '$mod+1': run(zoomActual),
    '$mod+0': run(zoomFit),
    "$mod+'": run(toggleGrid),
    '$mod+;': run(toggleGuides),
    // the browser would reload, the rulers win
    '$mod+r': run(toggleRulers),
    '$mod+u': run(toggleSmartGuides),
    // the browser would reload on F5 and may still take F6, the timeline has buttons for both
    F5: run(insertFrames),
    'Shift+F5': run(removeFrames),
    F6: run(insertKeyframes),
    'Shift+F6': run(clearKeyframes),
    F7: run(insertBlankKeyframes),
    F8: run(openConvertDialog),
    Enter: run(togglePlay),
    'Alt+Shift+KeyO': run(toggleOnion),
    '$mod+Alt+KeyC': run(copySelectedFrames),
    '$mod+Alt+KeyV': run(pasteSelectedFrames),

    x: run(toggleColorTarget),
    'Shift+x': run(swapColors),
    d: run(resetColors),
    '/': run(clearColor),

    ',': run(() => stepFrame(-1)),
    '.': run(() => stepFrame(1)),
    'Shift+Comma': run(firstFrame),
    'Shift+Period': run(lastFrame),

    '[Shift]+?': run(() => dialog.set({ kind: 'shortcuts' })),
    '$mod+,': run(() => dialog.set({ kind: 'preferences' })),
    '$mod+k': run(() => dialog.set({ kind: 'preferences' }))
  };

  for (const id of TOOL_IDS) {
    const key = TOOL_INFO[id].shortcut;
    if (key) map[key.replace(/[A-Z]$/, (c) => c.toLowerCase())] = run(() => selectTool(id));
  }
  // k is the bucket for fills, s the same tool as an ink bottle for strokes
  map.k = run(() => bucketMode('fill'));
  map.s = run(() => bucketMode('stroke'));
  return map;
}

// the active tool sees each key first and keeps it by calling preventDefault
export function installShortcuts(): () => void {
  const handler = createKeybindingsHandler(bindings(), { ignore: () => false });
  const onkeydown = (e: KeyboardEvent) => {
    if (ignored(e)) return;
    keyDown(e);
    if (e.defaultPrevented) return;
    handler(e);
  };
  window.addEventListener('keydown', onkeydown);
  return () => window.removeEventListener('keydown', onkeydown);
}
