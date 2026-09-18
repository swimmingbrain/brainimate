import { createKeybindingsHandler, type KeybindingsMap } from 'tinykeys';
import { preferences } from '$lib/stores/preferences';
import { keyDown } from '$lib/tools';
import { COMMANDS, keysOf, type Command } from './actions';
import { toTinykeys } from './keys';
import { copy, cut, pasteEvent, pasteFromSystem } from './clipboard';

// fields keep their keys, menus and dialogs handle their own
function ignored(e: Event): boolean {
  const el = e.target instanceof HTMLElement ? e.target : null;
  if (!el) return false;
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return el.closest('[role="dialog"], [role="menu"]') !== null;
}

// a key handler outside menus and dialogs, the ones that work from fields too run there as well
function insideMenu(e: Event): boolean {
  const el = e.target instanceof HTMLElement ? e.target : null;
  return !!el?.closest('[role="dialog"], [role="menu"]');
}

// a clipboard key waits for the browser's own event, which brings the system clipboard along. when
// none comes, the clipboard api and the copy kept in the app do the work
let expected: { kind: 'copy' | 'cut' | 'paste'; inPlace: boolean } | null = null;

function expectClipboard(kind: 'copy' | 'cut' | 'paste', inPlace = false) {
  const mine = { kind, inPlace };
  expected = mine;
  setTimeout(() => {
    if (expected !== mine) return;
    expected = null;
    if (kind === 'copy') copy();
    else if (kind === 'cut') cut();
    else void pasteFromSystem(inPlace);
  }, 80);
}

// text picked on the page copies as text
function pickedText(): boolean {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
}

function onclipboard(e: ClipboardEvent) {
  const wanted = expected;
  expected = null;
  if (ignored(e) || (e.type !== 'paste' && pickedText())) return;
  if (e.type === 'copy') copy(e);
  else if (e.type === 'cut') cut(e);
  else pasteEvent(e, wanted?.kind === 'paste' && wanted.inPlace);
}

function handlerFor(cmd: Command): (e: KeyboardEvent) => void {
  const clip = cmd.clipboard;
  // the browser fires its copy, cut and paste events after these keys, they do the work
  if (clip) return () => expectClipboard(clip === 'paste-in-place' ? 'paste' : clip, clip === 'paste-in-place');
  return (e) => {
    e.preventDefault();
    cmd.run();
  };
}

// every command on its keys, the overrides from the preferences in place of the defaults
export function bindingsFor(overrides: Record<string, string>, global = false): KeybindingsMap {
  const map: KeybindingsMap = {};
  for (const cmd of COMMANDS) {
    if (global && !cmd.global) continue;
    for (const combo of keysOf(cmd.id, overrides)) {
      const key = toTinykeys(combo);
      if (key && !map[key]) map[key] = handlerFor(cmd);
    }
  }
  return map;
}

// the active tool sees each key first and keeps it by calling preventDefault. the bindings are made
// again whenever the shortcuts in the preferences change
export function installShortcuts(): () => void {
  let handler: (e: KeyboardEvent) => void = () => {};
  let fromFields: (e: KeyboardEvent) => void = () => {};
  let current: Record<string, string> | null = null;
  const off = preferences.subscribe((p) => {
    if (p.shortcuts === current) return;
    current = p.shortcuts;
    handler = createKeybindingsHandler(bindingsFor(p.shortcuts), { ignore: () => false });
    fromFields = createKeybindingsHandler(bindingsFor(p.shortcuts, true), { ignore: () => false });
  });
  const onkeydown = (e: KeyboardEvent) => {
    if (ignored(e)) {
      // save, open and export work while typing in a panel field too, the browser would take them
      if (!insideMenu(e) && (e.ctrlKey || e.metaKey)) fromFields(e);
      return;
    }
    keyDown(e);
    if (e.defaultPrevented) return;
    handler(e);
  };
  window.addEventListener('keydown', onkeydown);
  for (const type of ['copy', 'cut', 'paste'] as const) window.addEventListener(type, onclipboard);
  return () => {
    off();
    window.removeEventListener('keydown', onkeydown);
    for (const type of ['copy', 'cut', 'paste'] as const) window.removeEventListener(type, onclipboard);
  };
}
