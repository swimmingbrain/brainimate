import { preferences } from '$lib/stores/preferences';
import { applyDefaultPresets } from '$lib/tools/presets';
import { hitSettings } from '$lib/core/hit';
import { marks } from '$lib/render/overlay';
import { editor } from './editor';

// the preferences that live outside the stores are handed over here whenever they change
export function installSettings(): () => void {
  // the brush and the pencil start with their default presets
  applyDefaultPresets();
  return preferences.subscribe((p) => {
    editor.history.setLimit(p.general.undoLimit);
    hitSettings.anchor = p.pen.hitTolerance;
    hitSettings.tablet = p.stage.tablet;
    marks.anchor = p.pen.anchorSize;
    marks.handleDot = p.pen.handleSize;
    marks.showAnchors = p.pen.showAnchors;
    editor.markOverlay();
  });
}
