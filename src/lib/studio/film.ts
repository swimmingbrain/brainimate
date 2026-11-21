import type { CameraMove, PovAction, PovLook, Scene } from './types';

// the film language of the storyboard: the camera templates by name and the presets that set a shot, a
// transition and the speed of a scene in one go. they only fill in fields of the scene, the person can
// change every one of them after

export const SHOTS: { value: CameraMove; label: string; group: string; hint: string }[] = [
  { value: 'pov-walk', label: 'First Person Walk', group: 'First person', hint: 'Through the eyes, walking, the view bobs' },
  { value: 'pov-run', label: 'First Person Run', group: 'First person', hint: 'Running, arms pumping, the view shakes' },
  { value: 'pov-look', label: 'First Person Look Around', group: 'First person', hint: 'Standing, looking left and right' },
  { value: 'pov-interact', label: 'First Person Interaction', group: 'First person', hint: 'The hands do something: pick up, door, phone' },
  { value: 'over-shoulder', label: 'Over the Shoulder', group: 'Characters', hint: 'Behind one character toward the other' },
  { value: 'closeup', label: 'Close Up', group: 'Characters', hint: 'Near the face of the subject' },
  { value: 'tracking', label: 'Tracking Shot', group: 'Characters', hint: 'Follows the subject sideways' },
  { value: 'dramatic', label: 'Dramatic Close Up', group: 'Characters', hint: 'A slow tilted push onto a face' },
  { value: 'reveal', label: 'Pan to Character', group: 'Characters', hint: 'Travels from the empty side to who comes in' },
  { value: 'wide', label: 'Wide Shot', group: 'Camera', hint: 'The whole place' },
  { value: 'low', label: 'Low Angle', group: 'Camera', hint: 'From below, the figure looks big' },
  { value: 'high', label: 'High Angle', group: 'Camera', hint: 'From above, the figure looks small' },
  { value: 'push-in', label: 'Cinematic Push In', group: 'Camera', hint: 'Slowly closer, toward something important' },
  { value: 'handheld', label: 'Handheld Camera', group: 'Camera', hint: 'A little unsteady, like filmed by hand' },
  { value: 'whip', label: 'Whip Pan', group: 'Camera', hint: 'A fast swing onto the subject' },
  { value: 'scare', label: 'Scare Zoom', group: 'Camera', hint: 'A jolt toward the face with a tremble' },
  { value: 'still', label: 'Still', group: 'Simple', hint: 'The camera stays' },
  { value: 'push', label: 'Push in (light)', group: 'Simple', hint: '' },
  { value: 'pull', label: 'Pull out', group: 'Simple', hint: '' },
  { value: 'pan', label: 'Pan', group: 'Simple', hint: '' },
  { value: 'shake', label: 'Shake', group: 'Simple', hint: '' }
];

export const POV_LOOKS: { value: PovLook; label: string }[] = [
  { value: 'ahead', label: 'Ahead' },
  { value: 'around', label: 'Look around' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' }
];

export const POV_ACTIONS: { value: PovAction; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'pickup', label: 'Pick up an object' },
  { value: 'door', label: 'Open a door' },
  { value: 'phone', label: 'Look at the phone' },
  { value: 'drive', label: 'Drive (steering wheel)' },
  { value: 'fight', label: 'Fight (fists)' },
  { value: 'reach', label: 'Reach out' },
  { value: 'wave', label: 'Wave' }
];

export const TRANSITION_KINDS: { value: Scene['transition']; label: string }[] = [
  { value: 'cut', label: 'Cut' },
  { value: 'black', label: 'Short dip to black' },
  { value: 'fade', label: 'Fade through color' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'slide', label: 'Slide' }
];

export interface FilmPreset {
  id: string;
  label: string;
  hint: string;
  scene: Partial<Pick<Scene, 'camera' | 'transition' | 'slow' | 'mood'>>;
}

export const FILM: FilmPreset[] = [
  { id: 'action', label: 'Action', hint: 'Hard cut, handheld camera', scene: { camera: 'handheld', transition: 'cut', slow: false, mood: 'action' } },
  { id: 'emotion', label: 'Emotion', hint: 'Slow crossfade, slow push onto the face', scene: { camera: 'dramatic', transition: 'crossfade', mood: 'emotion' } },
  { id: 'object', label: 'Important object', hint: 'Push in toward it', scene: { camera: 'push-in', transition: 'cut', mood: 'object' } },
  { id: 'surprise', label: 'Surprise', hint: 'Cut into a first person view', scene: { camera: 'pov-look', transition: 'cut', mood: 'surprise' } },
  { id: 'introduce', label: 'New character', hint: 'Pan to who comes in', scene: { camera: 'reveal', transition: 'cut', mood: 'introduce' } },
  { id: 'pause', label: 'Pause', hint: 'A short dip to black', scene: { transition: 'black', mood: 'pause' } },
  { id: 'slowmo', label: 'Slow motion', hint: 'The moves at half speed, a slow push', scene: { slow: true, camera: 'push-in', mood: 'slowmo' } },
  { id: 'scare', label: 'Scare', hint: 'A fast jolt of the camera', scene: { camera: 'scare', transition: 'cut', mood: 'scare' } },
  { id: 'closeup', label: 'Dramatic close-up', hint: 'Tilted, slowly closer', scene: { camera: 'dramatic', transition: 'cut', mood: 'closeup' } }
];

// a preset on a scene: a first person shot needs someone to see through, the subject of the scene or
// the first character of the cast
export function applyFilm(scene: Scene, preset: FilmPreset, fallbackActor: string | null): Scene {
  const out: Scene = { ...scene, ...preset.scene };
  if (out.camera.startsWith('pov-') && !out.pov) {
    const actor = scene.subject ?? scene.cast[0] ?? fallbackActor;
    if (actor) out.pov = { actor, look: 'around', action: 'none', at: 0.5, item: '', hands: true };
  }
  return out;
}

export function shotLabel(move: CameraMove): string {
  return SHOTS.find((s) => s.value === move)?.label ?? move;
}
