// a video production: what a video is about and how it is built, kept inside its document so it saves
// with the project file. the scenes and the script drive the timeline, the timeline stays the place where
// everything is animated

export type Status = 'idea' | 'script' | 'storyboard' | 'animation' | 'sound' | 'review' | 'done';

// how sure a statement is: a fact needs a source, an estimate says so, a hypothesis is never shown as a
// fact, the plot of an original work and an interpretation of it are kept apart
export type Certainty = 'fact' | 'estimate' | 'hypothesis' | 'plot' | 'interpretation' | 'fiction';

export interface Beat {
  id: string;
  name: string;
  // what belongs here, a hint for writing
  hint: string;
  // share of the video length, all beats together make 1
  share: number;
}

export interface ScriptLine {
  id: string;
  beat: string;
  // a speaker id: 'narrator', a character folder id or a free name
  speaker: string;
  text: string;
  // the scene it is heard in, null puts it into the scene of its beat
  scene: string | null;
  // the recording of the line, an audio clip id: its real length decides the timing
  clip?: string | null;
  certainty?: Certainty;
  // the source it rests on
  source?: string | null;
}

export type CameraMove =
  | 'still'
  | 'push'
  | 'pull'
  | 'pan'
  | 'shake'
  | 'closeup'
  // the shots of P6: first person ones see through the eyes of a character
  | 'pov-walk'
  | 'pov-run'
  | 'pov-look'
  | 'pov-interact'
  | 'over-shoulder'
  | 'wide'
  | 'low'
  | 'high'
  | 'tracking'
  | 'push-in'
  | 'handheld'
  | 'whip'
  | 'scare'
  | 'dramatic'
  | 'reveal';

// what the hands do in a first person shot
export type PovAction = 'none' | 'pickup' | 'door' | 'phone' | 'drive' | 'fight' | 'reach' | 'wave';
export type PovLook = 'ahead' | 'left' | 'right' | 'up' | 'down' | 'around';

export interface PovSettings {
  // whose eyes, a character folder id; it is not seen in the shot, only its hands
  actor: string;
  look: PovLook;
  action: PovAction;
  // when the action happens, a share of the scene
  at: number;
  // what is picked up or held: a visual id from the library
  item: string;
  hands: boolean;
}

// a move a character makes in a scene, an animation from the library
export interface SceneMove {
  actor: string;
  kind: string;
  // a share of the scene it starts at
  at: number;
}

export interface Scene {
  id: string;
  name: string;
  beat: string;
  // seconds
  duration: number;
  // a ready made place, '' keeps what the layers show
  place: string;
  // character folder ids that are in it
  cast: string[];
  action: string;
  camera: CameraMove;
  // a transition into this scene
  transition: 'cut' | 'fade' | 'crossfade' | 'zoom' | 'slide' | 'black';
  note: string;
  // the character the camera is about: a close-up, over its shoulder, tracking it
  subject?: string;
  // the other one in an over the shoulder shot
  partner?: string;
  pov?: PovSettings | null;
  moves?: SceneMove[];
  // moves in it play at half speed
  slow?: boolean;
  // the film language preset it was set up with
  mood?: string;
}

export interface Source {
  id: string;
  claim: string;
  certainty: Certainty;
  // a book, an article, a page, an episode: what the person entered, nothing is made up
  citation: string;
  url: string;
  note: string;
}

export interface Voice {
  // who speaks: 'narrator' or a character id or a name
  speaker: string;
  label: string;
  // for the device voice preview and a generator later
  pitch: number;
  rate: number;
  // how loud recordings of this speaker play, 1 as recorded
  volume?: number;
  // a few words for a generator: warm, young, calm
  style?: string;
  // an external generator and its voice id, empty until one is connected
  provider: string;
  voiceId: string;
}

export interface SubtitleStyle {
  size: 'small' | 'medium' | 'large';
  // up from the bottom of the safe zone, 0 to 1 of the free height
  position: number;
  highlight: string;
  box: boolean;
  animation: 'none' | 'pop' | 'words';
  // shown at all in the preview and the video
  shown: boolean;
}

export interface Cue {
  id: string;
  // frames
  start: number;
  end: number;
  text: string;
  speaker: string;
  certainty?: Certainty;
  // the script line it is a piece of
  line?: string;
}

export type TrackKind = 'narration' | 'dialogue' | 'music' | 'sfx';

export interface TrackMix {
  volume: number;
  muted: boolean;
}

export interface Production {
  version: 1;
  title: string;
  format: string;
  description: string;
  status: Status;
  // the length aimed at in seconds, 0 for free
  target: number;
  beats: Beat[];
  lines: ScriptLine[];
  scenes: Scene[];
  sources: Source[];
  voices: Voice[];
  subtitles: SubtitleStyle;
  cues: Cue[];
  tracks: Record<TrackKind, TrackMix>;
  // words a second the lines are spoken at, a pause after every line, extra time a scene gets for
  // reactions and camera moves, in seconds
  pace?: number;
  pause?: number;
  breathing?: number;
  // characters move their hands while they talk
  gestures?: boolean;
  // facts about the original a summary is about: work, season, episode, what the person checked
  original: { work: string; reference: string; checked: boolean };
}
