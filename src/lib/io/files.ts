import { get } from 'svelte/store';
import { fileOpen, fileSave } from 'browser-fs-access';
import type { Doc } from '$lib/core/types';
import { editor } from '$lib/editor/editor';
import { addToast, dialog, dirty } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { nameFromFile, parse, PROJECT_EXT, PROJECT_MIME, projectFileName, serialize } from './project';
import { addRecent, loadRecent, removeRecent, type RecentFile } from './recent';
import { autosaveOffer, clearAutosave, findAutosave, type Snapshot } from './autosave';
import { thumbnail } from './render';

const OPEN_TYPES = { extensions: [PROJECT_EXT, '.json'], mimeTypes: [PROJECT_MIME, 'application/json'] };

// the file the document was opened from or saved to, saves go straight back into it
let handle: FileSystemFileHandle | null = null;

export function currentHandle(): FileSystemFileHandle | null {
  return handle;
}

function aborted(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function message(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function isProjectFile(file: { name: string }): boolean {
  return file.name.toLowerCase().endsWith(PROJECT_EXT);
}

// runs action right away, or after a yes when the document has changes that are not saved
export function confirmDiscard(action: () => void, what = 'Continue') {
  if (!get(dirty)) {
    action();
    return;
  }
  dialog.set({
    kind: 'confirm',
    title: 'Unsaved changes',
    message: `${editor.doc.name} has changes that are not saved. ${what} without saving them?`,
    confirm: 'Discard changes',
    danger: true,
    onconfirm: action
  });
}

async function remember(doc: Doc, name: string, fileHandle: FileSystemFileHandle | null) {
  const thumb = await thumbnail(doc).catch(() => '');
  const entry: RecentFile = { name, time: Date.now(), thumbnail: thumb };
  if (fileHandle) entry.handle = fileHandle;
  await addRecent(entry).catch(() => {});
}

// ctrl+s writes into the file the document came from, the first time it asks where
export function save(): Promise<boolean> {
  return write(false);
}

export function saveAs(): Promise<boolean> {
  return write(true);
}

async function write(ask: boolean): Promise<boolean> {
  const doc = editor.doc;
  let blob: Blob;
  try {
    blob = serialize(doc);
  } catch (e) {
    addToast(`Could not save: ${message(e, 'the document could not be packed')}`, 'error', 6000);
    return false;
  }
  let picked: FileSystemFileHandle | null;
  try {
    picked = await fileSave(
      blob,
      {
        fileName: projectFileName(doc.name),
        extensions: [PROJECT_EXT],
        mimeTypes: [PROJECT_MIME],
        description: 'brainIMATE document',
        id: 'brainimate-project'
      },
      ask ? null : handle
    );
  } catch (e) {
    if (aborted(e)) return false;
    addToast(`Could not save: ${message(e, 'the file could not be written')}`, 'error', 6000);
    return false;
  }
  // without the file system access api the browser downloaded it, there is no file to go back to
  handle = picked;
  const changed = editor.doc !== doc;
  if (picked) editor.setName(nameFromFile(picked.name));
  // an edit made while the file was written keeps the document dirty
  if (!changed) dirty.set(false);
  await clearAutosave();
  addToast(`Saved ${editor.doc.name}`, 'success', 2000);
  await remember(editor.doc, picked?.name ?? projectFileName(editor.doc.name), picked);
  return true;
}

// a document read from a file takes over the editor
export async function openFile(file: File, fileHandle: FileSystemFileHandle | null = null): Promise<boolean> {
  let parsed;
  try {
    parsed = await parse(file);
  } catch (e) {
    addToast(`Could not open ${file.name}: ${message(e, 'the file could not be read')}`, 'error', 6000);
    return false;
  }
  const doc = parsed.doc;
  if (doc.name === 'Untitled') doc.name = nameFromFile(file.name);
  editor.loadDoc(doc);
  // a json file is written back as a zip only after a save as
  handle = isProjectFile(file) ? fileHandle : null;
  if (get(dialog)?.kind === 'welcome') dialog.set(null);
  if (parsed.newer) addToast('A newer version of brainIMATE made this file, some parts may not show', 'warning', 6000);
  else addToast(`Opened ${doc.name}`, 'success', 2000);
  await remember(doc, file.name, handle);
  return true;
}

async function pickAndOpen() {
  try {
    const file = await fileOpen({ ...OPEN_TYPES, description: 'brainIMATE document', id: 'brainimate-project' });
    await openFile(file, file.handle ?? null);
  } catch (e) {
    if (!aborted(e)) addToast(`Could not open the file: ${message(e, 'it could not be read')}`, 'error', 6000);
  }
}

export function openDocument() {
  confirmDiscard(() => void pickAndOpen(), 'Open another file');
}

// a project file dropped on the window
export function openDropped(file: File) {
  confirmDiscard(() => void openFile(file), `Open ${file.name}`);
}

// the browser asks once more for the file, it keeps the right to it only while the tab is open
async function allowed(h: FileSystemFileHandle): Promise<boolean> {
  const mode: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  if (!h.queryPermission || (await h.queryPermission(mode)) === 'granted') return true;
  return (await h.requestPermission?.(mode)) === 'granted';
}

async function reopen(entry: RecentFile) {
  if (!entry.handle) {
    addToast('This browser cannot open the file again by itself, pick it with Open', 'info', 5000);
    await pickAndOpen();
    return;
  }
  try {
    if (!(await allowed(entry.handle))) {
      addToast(`No permission to open ${entry.name}`, 'warning', 5000);
      return;
    }
    await openFile(await entry.handle.getFile(), entry.handle);
  } catch {
    addToast(`${entry.name} is not there anymore`, 'warning', 5000);
    await removeRecent(entry);
  }
}

export function openRecent(entry: RecentFile) {
  confirmDiscard(() => void reopen(entry), `Open ${entry.name}`);
}

// a fresh document, the file it came from is forgotten
export function createDocument(width: number, height: number, fps: number, bg = '#ffffff') {
  editor.newDoc(width, height, fps, bg);
  handle = null;
  dialog.set(null);
}

export function newDocument() {
  dialog.set({ kind: 'new-doc' });
}

// back to the welcome dialog with an empty document behind it
export function closeDocument() {
  confirmDiscard(() => {
    editor.newDoc(1920, 1080, get(preferences).timeline.fps);
    handle = null;
    void showWelcome();
  }, 'Close');
}

// the copy from the autosave takes over, it still has to be saved
export async function restoreAutosave(snap: Snapshot): Promise<boolean> {
  let parsed;
  try {
    parsed = await parse(snap.blob);
  } catch (e) {
    addToast(`Could not restore: ${message(e, 'the copy is damaged')}`, 'error', 6000);
    return false;
  }
  editor.loadDoc(parsed.doc);
  handle = null;
  dirty.set(true);
  autosaveOffer.set(null);
  if (get(dialog)?.kind === 'welcome') dialog.set(null);
  addToast(`Restored ${parsed.doc.name}`, 'success', 2000);
  return true;
}

// the welcome dialog with the recent files and an autosave worth restoring
export async function showWelcome() {
  dialog.set({ kind: 'welcome' });
  await loadRecent().catch(() => []);
  autosaveOffer.set(await findAutosave().catch(() => null));
}

// the page asks before it closes on changes that are not saved
export function installUnloadGuard(): () => void {
  const onbeforeunload = (e: BeforeUnloadEvent) => {
    if (!get(dirty)) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onbeforeunload);
  return () => window.removeEventListener('beforeunload', onbeforeunload);
}
