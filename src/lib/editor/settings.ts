import { preferences } from '$lib/stores/preferences';
import { editor } from './editor';

// the preferences that live outside the stores are handed over here whenever they change
export function installSettings(): () => void {
  return preferences.subscribe((p) => {
    editor.history.setLimit(p.general.undoLimit);
  });
}
