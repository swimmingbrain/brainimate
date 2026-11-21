import { insertKeyframe, moveLayer } from '$lib/anim/timeline';
import { characterFolders, characterLayers } from '$lib/character/model';
import { activeLayer, addToast, collapsedFolders } from '$lib/stores/app';
import { editor, makeLayer } from './editor';
import { currentCharacter, reach } from './character';

// the cast of a scene: several characters at once, each moving on its own. the timeline stays readable
// when the ones not worked on fold away, characters that belong together go into a folder, and a group
// moves as one

// the character worked on: picked in the panel, its folder open in the timeline, the others folded
export function focusCharacter(id: string) {
  const list = characterFolders(editor.doc.layers);
  if (!list.some((f) => f.id === id)) return;
  currentCharacter.set(id);
  collapsedFolders.update((set) => {
    const next = new Set(set);
    for (const f of list) {
      if (f.id === id) next.delete(f.id);
      else next.add(f.id);
    }
    // the folders it sits in open too
    let parent = editor.doc.layers.find((l) => l.id === id)?.parent ?? null;
    while (parent) {
      next.delete(parent);
      parent = editor.doc.layers.find((l) => l.id === parent)?.parent ?? null;
    }
    return next;
  });
  const body = characterLayers(editor.doc.layers, id)?.body;
  if (body) activeLayer.set(body.id);
}

// every character folder open again
export function showAllCharacters() {
  const ids = new Set(characterFolders(editor.doc.layers).map((f) => f.id));
  collapsedFolders.update((set) => new Set([...set].filter((id) => !ids.has(id))));
}

// characters into one folder of their own, for a family, a team, the people of one shot
export function groupCharacters(ids: string[], name = 'Group'): string | null {
  const list = characterFolders(editor.doc.layers).filter((f) => ids.includes(f.id));
  if (list.length < 2) {
    addToast('Pick at least two characters to group', 'info');
    return null;
  }
  const folder = makeLayer(name, '#8f9d7c', 'folder');
  editor.commit('Group characters', (draft) => {
    const layers = draft.layers;
    // the group sits where the topmost of them was
    const top = Math.max(...list.map((f) => layers.findIndex((l) => l.id === f.id)));
    folder.parent = layers[top].parent;
    layers.splice(top + 1, 0, folder);
    for (const f of list) moveLayer(layers, f.id, folder.id, 'into');
  });
  return folder.id;
}

// the characters of a group, a folder that holds character folders
export function groupMembers(folderId: string): string[] {
  return characterFolders(editor.doc.layers)
    .filter((f) => f.parent === folderId)
    .map((f) => f.id);
}

export function characterGroups(): { id: string; name: string; members: string[] }[] {
  return editor.doc.layers
    .filter((l) => l.type === 'folder' && !l.character && groupMembers(l.id).length > 0)
    .map((l) => ({ id: l.id, name: l.name, members: groupMembers(l.id) }));
}

// characters moved together on the stage from the playhead on, by dx and dy, with a keyframe each
export function shiftCharacters(ids: string[], dx: number, dy = 0) {
  if (ids.length === 0 || editor.editStack.length > 0) return;
  const at = editor.frame;
  editor.commit('Move characters', (draft) => {
    for (const id of ids) {
      const rig = characterLayers(draft.layers, id)?.rig;
      const hip = rig?.bones.find((b) => b.name === 'Hip');
      if (!rig || !hip) continue;
      // every key from here on moves, so a walk after it goes from the new place
      insertKeyframe(rig, at);
      for (const k of rig.keyframes) {
        if (k.frame < at) continue;
        const p = k.pose[hip.id] ?? { rotation: 0, x: 0, y: 0, scale: 1 };
        k.pose[hip.id] = { ...p, x: p.x + dx, y: p.y + dy };
      }
      reach(draft, at);
    }
  });
}
