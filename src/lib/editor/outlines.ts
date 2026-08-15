import type { GroupItem, Item, TextItem } from '$lib/core/types';
import { identity } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { cloneStyle } from '$lib/core/style';
import { itemLayout, loadFont } from '$lib/core/fonts';
import { glyphOutlines } from '$lib/core/text';
import { addToast, selection } from '$lib/stores/app';
import { editor } from './editor';
import { makeGroup } from './commands';

// a group of paths in the place of the text, one compound path per glyph with its holes as subpaths
function outlineGroup(text: TextItem): GroupItem | null {
  const layout = itemLayout(text);
  if (!layout) return null;
  const children: Item[] = [];
  glyphOutlines(layout).forEach((contours, i) => {
    if (contours.length === 0) return;
    const ch = layout.glyphs[i].ch;
    children.push(makePathItem(ch, contours[0], cloneStyle(text.style), identity(), contours.slice(1)));
  });
  const group = makeGroup(children, text.text.trim().slice(0, 24) || 'Text');
  group.transform = [...text.transform];
  group.opacity = text.opacity;
  group.blend = text.blend;
  return group;
}

// the selected text becomes paths that look the same, the font is no longer needed after
export function outlineSelectedText() {
  const texts = editor.selectedItems(false).filter((it): it is TextItem => it.type === 'text');
  if (texts.length === 0) {
    addToast('Select some text first');
    return;
  }
  const groups = new Map<string, GroupItem>();
  for (const t of texts) {
    const group = outlineGroup(t);
    if (!group) {
      void loadFont(t.font, t.weight, t.italic);
      addToast(`${t.font} is still loading, try again in a moment`, 'warning');
      return;
    }
    if (group.children.length > 0) groups.set(t.id, group);
  }
  if (groups.size === 0) {
    addToast('There are no letters to outline');
    return;
  }
  editor.commit('Create outlines', (draft) => {
    for (const [id, group] of groups) {
      const found = editor.draftFind(draft, id);
      if (found) found.list.splice(found.index, 1, group);
    }
  });
  selection.set(new Set([...groups.values()].map((g) => g.id)));
}
