import { preferences } from '$lib/stores/preferences';
import { applyDefaultPresets } from '$lib/tools/presets';
import { editor } from './editor';

// the preferences that live outside the stores are handed over here whenever they change
export function installSettings(): () => void {
  // the brush and the pencil start with their default presets
  applyDefaultPresets();
  return preferences.subscribe((p) => {
    editor.history.setLimit(p.general.undoLimit);
  });
}
