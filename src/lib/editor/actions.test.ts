import { describe, expect, it } from 'vitest';
import { COMMANDS, commandById, conflictsWith, keysOf, rebind, shortcutOf, takeCombo } from './actions';
import { normalizeCombo, sameCombo, toTinykeys } from './keys';

describe('commands', () => {
  it('have unique ids and default keys that parse', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMMANDS) {
      for (const k of c.keys) {
        expect(normalizeCombo(k), `${c.id} ${k}`).toBe(k);
        expect(toTinykeys(k), `${c.id} ${k}`).not.toBeNull();
      }
    }
  });

  it('never share a default key and never take the keys the browser keeps', () => {
    const seen = new Map<string, string>();
    for (const c of COMMANDS) {
      for (const k of c.keys) {
        expect(seen.get(k), `${k} on ${c.id} and ${seen.get(k)}`).toBeUndefined();
        seen.set(k, c.id);
      }
    }
    for (const k of ['Ctrl+N', 'Ctrl+T', 'Ctrl+W']) expect(seen.has(k)).toBe(false);
  });

  it('cover the keys of the spec and the file commands', () => {
    const want: Record<string, string> = {
      'tool.select': 'V',
      'tool.pen': 'P',
      'tool.curvature': 'Shift+P',
      'tool.bind': 'Shift+M',
      'tool.ink': 'S',
      'file.save': 'Ctrl+S',
      'file.save-as': 'Ctrl+Shift+S',
      'file.open': 'Ctrl+O',
      'file.export': 'Ctrl+E',
      'file.import': 'Ctrl+I',
      'edit.palette': 'Ctrl+Shift+P',
      'edit.preferences': 'Ctrl+K',
      'help.shortcuts': 'Shift+/',
      'timeline.keyframe': 'F6',
      'modify.symbol': 'F8',
      'window.library': 'Ctrl+L'
    };
    for (const [id, key] of Object.entries(want)) expect(shortcutOf(id, {})).toBe(key);
  });

  it('answer to their override, to none with an empty one, to the defaults without', () => {
    expect(keysOf('edit.redo', {})).toEqual(['Ctrl+Shift+Z', 'Ctrl+Y']);
    expect(keysOf('edit.redo', { 'edit.redo': 'Ctrl+R' })).toEqual(['Ctrl+R']);
    expect(keysOf('edit.redo', { 'edit.redo': '' })).toEqual([]);
    expect(keysOf('nothing', {})).toEqual([]);
  });

  it('find the other command that already has a combo', () => {
    expect(conflictsWith('shift+r', 'tool.rect', {}).map((c) => c.id)).toEqual([]);
    expect(conflictsWith('Ctrl+Z', 'tool.rect', {}).map((c) => c.id)).toEqual(['edit.undo']);
    expect(conflictsWith('Ctrl+Z', 'tool.rect', { 'edit.undo': 'Ctrl+Alt+Z' })).toEqual([]);
    expect(conflictsWith('Ctrl+Y', 'edit.undo', {}).map((c) => c.id)).toEqual(['edit.redo']);
  });

  it('rebind one command and go back to the default', () => {
    let o = rebind({}, 'tool.rect', 'shift+r');
    expect(o).toEqual({ 'tool.rect': 'Shift+R' });
    expect(keysOf('tool.rect', o)).toEqual(['Shift+R']);
    // the default again is no override at all
    o = rebind(o, 'tool.rect', 'R');
    expect(o).toEqual({});
    o = rebind({ 'tool.rect': 'Shift+R' }, 'tool.rect', null);
    expect(o).toEqual({});
    expect(rebind({}, 'tool.rect', 'Hyper+R')).toEqual({});
    expect(rebind({}, 'tool.rect', '')).toEqual({ 'tool.rect': '' });
  });

  it('take a combo away from the commands that had it', () => {
    const o = takeCombo({}, 'tool.rect', 'Ctrl+Y');
    expect(keysOf('tool.rect', o)).toEqual(['Ctrl+Y']);
    // redo keeps its other key
    expect(keysOf('edit.redo', o)).toEqual(['Ctrl+Shift+Z']);
    const p = takeCombo({}, 'tool.rect', 'V');
    expect(keysOf('tool.select', p)).toEqual([]);
    expect(conflictsWith('V', 'tool.rect', p)).toEqual([]);
    expect(sameCombo(keysOf('tool.rect', p)[0], 'v')).toBe(true);
  });

  it('keep the stress test to dev builds', () => {
    expect(commandById('insert.stress')?.dev).toBe(true);
  });
});
