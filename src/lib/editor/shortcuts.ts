import { get } from 'svelte/store';
import { createKeybindingsHandler, type KeybindingsMap } from 'tinykeys';
import { anchorSelection, contextMenu, dialog, frame } from '$lib/stores/app';
import { TOOL_IDS, TOOL_INFO } from '$lib/tools/tool';
import { keyDown, selectTool } from '$lib/tools';
import { editor } from './editor';
import {
  clearColor,
  insertKeyframeHere,
  redo,
  resetColors,
  swapColors,
  toggleColorTarget,
  toggleGrid,
  toggleGuides,
  toggleRulers,
  undo
} from './commands';
import { copy, cut, duplicate, paste, pasteInPlace } from './clipboard';
import { clearSelection, deleteSelection, nudge, selectAll } from './selection';
import { zoomActual, zoomFit, zoomIn, zoomOut } from './view';

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
  clearSelection();
}

function lastFrame(): number {
  return Math.max(0, ...editor.doc.layers.map((l) => l.length - 1));
}

function step(by: number) {
  frame.update((f) => Math.max(0, f + by));
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
    F6: run(insertKeyframeHere),

    x: run(toggleColorTarget),
    'Shift+x': run(swapColors),
    d: run(resetColors),
    '/': run(clearColor),

    ',': run(() => step(-1)),
    '.': run(() => step(1)),
    'Shift+<': run(() => frame.set(0)),
    'Shift+>': run(() => frame.set(lastFrame())),

    '[Shift]+?': run(() => dialog.set({ kind: 'shortcuts' })),
    '$mod+,': run(() => dialog.set({ kind: 'preferences' })),
    '$mod+k': run(() => dialog.set({ kind: 'preferences' }))
  };

  for (const id of TOOL_IDS) {
    const key = TOOL_INFO[id].shortcut;
    if (key) map[key.replace(/[A-Z]$/, (c) => c.toLowerCase())] = run(() => selectTool(id));
  }
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
