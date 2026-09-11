import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor, makeDoc } from '$lib/editor/editor';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { dialog, dirty, toasts } from '$lib/stores/app';
import { closeDocument, confirmDiscard, createDocument, isProjectFile, openFile, restoreAutosave } from './files';
import { serialize } from './project';

function edit() {
  editor.insertItem(editor.activeLayer()!.id, makePathItem('Rect', rectPath(0, 0, 10, 10), defaultStyle()));
}

function confirmNow() {
  const d = get(dialog);
  if (d?.kind !== 'confirm') throw new Error('no question was asked');
  dialog.set(null);
  d.onconfirm();
}

describe('document files', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    dialog.set(null);
    toasts.set([]);
  });

  it('tells project files by their extension', () => {
    expect(isProjectFile({ name: 'walk.BRAINIMATE' })).toBe(true);
    expect(isProjectFile({ name: 'walk.json' })).toBe(false);
  });

  it('runs at once on a clean document and asks first on a dirty one', () => {
    let runs = 0;
    confirmDiscard(() => runs++);
    expect(runs).toBe(1);
    edit();
    expect(get(dirty)).toBe(true);
    confirmDiscard(() => runs++, 'Open walk.brainimate');
    expect(runs).toBe(1);
    expect(get(dialog)).toMatchObject({ kind: 'confirm', confirm: 'Discard changes' });
    confirmNow();
    expect(runs).toBe(2);
  });

  it('creates a document from a preset and closes the dialog', () => {
    dialog.set({ kind: 'new-doc' });
    createDocument(1080, 1080, 30, '#000000');
    expect([editor.doc.width, editor.doc.height, editor.doc.fps, editor.doc.bg]).toEqual([1080, 1080, 30, '#000000']);
    expect(get(dialog)).toBeNull();
    expect(get(dirty)).toBe(false);
  });

  it('closes back to the welcome dialog after the question', () => {
    edit();
    closeDocument();
    confirmNow();
    expect(get(dialog)?.kind).toBe('welcome');
    expect(get(dirty)).toBe(false);
    expect(editor.layerItems(editor.doc.layers[0])).toHaveLength(0);
  });

  it('opens a file, names an untitled document after it and says when a newer version made it', async () => {
    const doc = makeDoc(320, 200, 12);
    doc.layers[0].keyframes[0].items.push(makePathItem('Rect', rectPath(0, 0, 5, 5), defaultStyle()));
    dialog.set({ kind: 'welcome' });
    expect(await openFile(new File([serialize(doc)], 'Bounce.brainimate'))).toBe(true);
    expect(editor.doc.name).toBe('Bounce');
    expect(editor.doc.width).toBe(320);
    expect(editor.layerItems(editor.doc.layers[0])).toHaveLength(1);
    expect(get(dialog)).toBeNull();
    expect(get(dirty)).toBe(false);

    const newer = new File([JSON.stringify({ ...doc, version: 2, name: 'Later' })], 'later.json');
    expect(await openFile(newer)).toBe(true);
    expect(editor.doc.name).toBe('Later');
    expect(get(toasts).some((t) => t.type === 'warning' && t.message.includes('newer version'))).toBe(true);
  });

  it('keeps the document when a file cannot be read', async () => {
    edit();
    const before = editor.doc;
    expect(await openFile(new File(['not a drawing'], 'notes.json'))).toBe(false);
    expect(editor.doc).toBe(before);
    expect(get(toasts).some((t) => t.type === 'error')).toBe(true);
  });

  it('restores an autosave as a document that still needs a save', async () => {
    const doc = makeDoc(640, 480, 24);
    doc.name = 'Lost work';
    expect(await restoreAutosave({ time: Date.now(), name: doc.name, blob: serialize(doc) })).toBe(true);
    expect(editor.doc.name).toBe('Lost work');
    expect(get(dirty)).toBe(true);
  });
});
