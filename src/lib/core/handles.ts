import type { Anchor, PathData, Vec } from './types';
import { reversePath } from './path';
import { snapAngle } from './vec';

// a pen drag pulls the out handle to the pointer and the in handle mirrors it, unless the pair is broken
export function pullHandles(a: Anchor, to: Vec, broken = false, shift = false) {
  const p = shift ? snapAngle(a, to) : to;
  a.ox = p.x - a.x;
  a.oy = p.y - a.y;
  if (!broken) {
    a.ix = -a.ox;
    a.iy = -a.oy;
  }
  const none = a.ox === 0 && a.oy === 0 && (broken ? true : a.ix === 0 && a.iy === 0);
  a.kind = broken || none ? 'corner' : 'symmetric';
}

// the next segment leaves this anchor straight
export function retractOut(a: Anchor) {
  a.ox = 0;
  a.oy = 0;
  a.kind = 'corner';
}

export function retractHandles(a: Anchor) {
  a.ix = a.iy = a.ox = a.oy = 0;
  a.kind = 'corner';
}

// drawing goes on from the end of an open path, the first anchor turns the path around first
export function continueFrom(path: PathData, index: number): number {
  if (index === 0 && path.anchors.length > 1) reversePath(path);
  return path.anchors.length - 1;
}

// the next anchor of a pen path, shift keeps it at 45 degree steps from the last one
export function nextPoint(last: Vec | null, p: Vec, shift: boolean): Vec {
  return shift && last ? snapAngle(last, p) : { x: p.x, y: p.y };
}
