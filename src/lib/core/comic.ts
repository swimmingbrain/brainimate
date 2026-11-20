// what a hand drawn graphic novel story for a vertical video needs: the format, the safe zones the
// app buttons cover, a muted palette and the layers a scene is built from

// the vertical video format, exactly this size in pixels
export const TIKTOK_WIDTH = 1080;
export const TIKTOK_HEIGHT = 1920;

// 9 by 16 at any size, a pixel of rounding is fine
export function isVertical916(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  return Math.abs(width * 16 - height * 9) <= 16;
}

export interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// what the app covers on a 1080 by 1920 video: the tabs on top, the caption and the sound at the
// bottom, the like, comment and share buttons on the right. approximate, the app moves them now and then
export const TIKTOK_SAFE: SafeZone = { top: 150, bottom: 480, left: 60, right: 140 };

// the margins for a stage of this size, scaled from 1080 by 1920, null when it is not 9 by 16
export function safeZoneFor(width: number, height: number): SafeZone | null {
  if (!isVertical916(width, height)) return null;
  const k = width / TIKTOK_WIDTH;
  return {
    top: TIKTOK_SAFE.top * k,
    bottom: TIKTOK_SAFE.bottom * k,
    left: TIKTOK_SAFE.left * k,
    right: TIKTOK_SAFE.right * k
  };
}

export interface NamedColor {
  name: string;
  color: string;
}

// muted, a little desaturated colors for flat cel shading: the ink and paper, skin in light and
// shadow, and the earthy and dusky tones of the backgrounds
export const COMIC_PALETTE: NamedColor[] = [
  { name: 'Ink', color: '#1d1b19' },
  { name: 'Charcoal', color: '#3a3734' },
  { name: 'Warm grey', color: '#6e6962' },
  { name: 'Fog', color: '#a9a49b' },
  { name: 'Old paper', color: '#e9e2d2' },
  { name: 'Skin light', color: '#e2c4a6' },
  { name: 'Skin', color: '#c99c7c' },
  { name: 'Skin shadow', color: '#a37a62' },
  { name: 'Skin deep', color: '#7a5646' },
  { name: 'Brick', color: '#97503f' },
  { name: 'Rust', color: '#b0714b' },
  { name: 'Ochre', color: '#c4a15e' },
  { name: 'Olive', color: '#7b7d54' },
  { name: 'Sage', color: '#8e9d88' },
  { name: 'Teal', color: '#4e6d6a' },
  { name: 'Slate', color: '#5b6b82' },
  { name: 'Dusk', color: '#3e475e' },
  { name: 'Plum', color: '#6b5066' },
  { name: 'Rose', color: '#b38784' },
  { name: 'Night', color: '#262a36' }
];

// the layers of a comic scene, bottom first. the speech bubbles stay on top of everything
export const COMIC_SCENE_LAYERS = ['Background', 'Midground', 'Characters', 'Foreground', 'Speech bubbles'];
