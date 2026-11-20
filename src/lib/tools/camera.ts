import { get } from 'svelte/store';
import type { CameraKey, Mat, Vec } from '$lib/core/types';
import { applyPoint } from '$lib/core/mat';
import { pointerFactor } from '$lib/core/hit';
import { editor } from '$lib/editor/editor';
import { addCamera, cameraHere, cameraLayer, setCamera, showingCamera } from '$lib/editor/camera';
import { cameraFrame, cameraKnob } from '$lib/render/overlay';
import { addToast, view } from '$lib/stores/app';
import { toolBase, type Tool, type ToolEvent } from './tool';

// the camera tool: on the stage the camera frame moves when dragged, zooms at its corners and turns at
// the knob above it. in the camera view a drag moves the picture like a camera held in the hand. each
// drag is one keyframe change at the playhead and one undo step

type Mode = 'move' | 'zoom' | 'rotate' | 'film';

interface Drag {
  mode: Mode;
  start: CameraKey;
  // where it started, on the stage and on the screen
  x: number;
  y: number;
  sx: number;
  sy: number;
  // the middle of the camera frame on the stage
  mid: Vec;
  d0: number;
  a0: number;
}

let drag: Drag | null = null;
let count = 0;

// how close to a corner or the knob a press has to land, in screen pixels
const REACH = 16;

function screenOf(p: Vec): Vec {
  const v = get(view);
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

function near(a: Vec, b: Vec, reach: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= reach;
}

function modeAt(e: ToolEvent, frame: Mat): Mode {
  const doc = editor.doc;
  const reach = REACH * pointerFactor(e.pointerType);
  const at = { x: e.sx, y: e.sy };
  if (near(at, cameraKnob(frame, get(view)), reach)) return 'rotate';
  const corners = [
    { x: 0, y: 0 },
    { x: doc.width, y: 0 },
    { x: doc.width, y: doc.height },
    { x: 0, y: doc.height }
  ].map((p) => screenOf(applyPoint(frame, p)));
  if (corners.some((c) => near(at, c, reach))) return 'zoom';
  return 'move';
}

export const cameraTool: Tool = {
  ...toolBase('camera'),

  down(e) {
    if (editor.editStack.length > 0) {
      addToast('Leave the symbol first, the camera films the main timeline', 'info');
      return;
    }
    if (!cameraLayer()) addCamera();
    const start = cameraHere();
    const doc = editor.doc;
    const frame = cameraFrame();
    const mid = frame ? applyPoint(frame, { x: doc.width / 2, y: doc.height / 2 }) : { x: start.x, y: start.y };
    const mode: Mode = get(showingCamera) ? 'film' : frame ? modeAt(e, frame) : 'move';
    drag = {
      mode,
      start,
      x: e.x,
      y: e.y,
      sx: e.sx,
      sy: e.sy,
      mid,
      d0: Math.max(1, Math.hypot(e.x - mid.x, e.y - mid.y)),
      a0: Math.atan2(e.y - mid.y, e.x - mid.x)
    };
  },

  move(e) {
    const d = drag;
    if (!d) return;
    const key = `camera-drag-${count}`;
    const s = d.start;
    switch (d.mode) {
      case 'film': {
        // the picture follows the finger, the camera goes the other way, turned and zoomed as it is
        const v = get(view);
        const du = (e.sx - d.sx) / v.zoom;
        const dv = (e.sy - d.sy) / v.zoom;
        const c = Math.cos(s.rotation);
        const sn = Math.sin(s.rotation);
        setCamera({ x: s.x - (du * c - dv * sn) / s.zoom, y: s.y - (du * sn + dv * c) / s.zoom }, 'Move camera', key);
        break;
      }
      case 'move':
        setCamera({ x: s.x + (e.x - d.x), y: s.y + (e.y - d.y) }, 'Move camera', key);
        break;
      case 'zoom': {
        // a bigger frame films more of the stage, so it zooms out
        const dist = Math.max(1, Math.hypot(e.x - d.mid.x, e.y - d.mid.y));
        setCamera({ zoom: (s.zoom * d.d0) / dist }, 'Zoom camera', key);
        break;
      }
      case 'rotate': {
        const a = Math.atan2(e.y - d.mid.y, e.x - d.mid.x);
        let turn = s.rotation + (a - d.a0);
        // shift snaps to 15 degrees
        if (e.shift) turn = Math.round(turn / (Math.PI / 12)) * (Math.PI / 12);
        setCamera({ rotation: turn }, 'Turn camera', key);
        break;
      }
    }
    editor.markOverlay();
  },

  up() {
    drag = null;
    count++;
    editor.markOverlay();
  },

  key(e) {
    if (e.key === 'Escape' && drag) {
      e.preventDefault();
      // the drag goes back to where it started
      const s = drag.start;
      setCamera({ x: s.x, y: s.y, zoom: s.zoom, rotation: s.rotation }, 'Move camera', `camera-drag-${count}`);
      drag = null;
      count++;
    }
  },

  followsPointer() {
    return false;
  }
};
