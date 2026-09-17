import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { defaultPreferences, preferences } from './preferences';
import {
  BUILTIN_WORKSPACES,
  currentLayout,
  deleteWorkspace,
  findWorkspace,
  renameWorkspace,
  resetWorkspace,
  saveWorkspace,
  setWorkspace,
  toggleLibrary,
  togglePanel,
  withWorkspace
} from './workspace';

describe('workspaces', () => {
  it('lays a preset over the panels, the toolbar side, the rulers and the bones', () => {
    const p = defaultPreferences();
    p.grid.show = true;
    const illustrate = BUILTIN_WORKSPACES.find((w) => w.id === 'illustrate')!;
    const next = withWorkspace(p, illustrate);
    expect(next.workspace).toBe('illustrate');
    expect(next.panels.timeline).toBe(false);
    expect(next.panels.hidden).toEqual(['library', 'rig']);
    expect(next.panels.bottomTab).toBe('swatches');
    expect(next.panels.dockWidth).toBe(300);
    expect(next.rig.showBones).toBe(false);
    // the rest stays
    expect(next.grid.show).toBe(true);
    expect(next.panels.dockSplit).toBe(p.panels.dockSplit);
  });

  it('gives back the layout it took from the preferences', () => {
    const p = withWorkspace(defaultPreferences(), BUILTIN_WORKSPACES.find((w) => w.id === 'rig')!);
    const saved = currentLayout(p, 'Copy', 'copy');
    expect(withWorkspace(defaultPreferences(), saved).panels).toEqual({ ...p.panels });
  });

  it('saves, renames, applies and deletes a workspace of the user', () => {
    preferences.set(defaultPreferences());
    togglePanel('align');
    const id = saveWorkspace('  No align  ');
    let p = get(preferences);
    expect(p.workspace).toBe(id);
    expect(findWorkspace(p, id)?.name).toBe('No align');
    expect(findWorkspace(p, id)?.hidden).toEqual(['align']);

    setWorkspace('animate');
    expect(get(preferences).panels.timelineHeight).toBe(300);
    setWorkspace(id);
    expect(get(preferences).panels.hidden).toEqual(['align']);

    renameWorkspace(id, 'Clean');
    expect(findWorkspace(get(preferences), id)?.name).toBe('Clean');
    renameWorkspace(id, '   ');
    expect(findWorkspace(get(preferences), id)?.name).toBe('Clean');

    deleteWorkspace(id);
    p = get(preferences);
    expect(p.workspaces).toEqual([]);
    expect(p.workspace).toBe('essentials');
  });

  it('brings the layout of the workspace in use back and ignores unknown ones', () => {
    preferences.set(defaultPreferences());
    setWorkspace('rig');
    togglePanel('rig');
    expect(get(preferences).panels.hidden).toContain('rig');
    resetWorkspace();
    expect(get(preferences).panels.hidden).not.toContain('rig');
    setWorkspace('nowhere');
    expect(get(preferences).workspace).toBe('rig');
  });

  it('shows the library in front or hides it', () => {
    preferences.set(defaultPreferences());
    toggleLibrary();
    expect(get(preferences).panels.bottomTab).toBe('library');
    toggleLibrary();
    expect(get(preferences).panels.hidden).toContain('library');
    toggleLibrary();
    expect(get(preferences).panels.hidden).not.toContain('library');
  });
});
