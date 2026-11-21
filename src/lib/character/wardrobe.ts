import type { CharacterColors } from '$lib/core/types';
import type { HairStyle } from './model';

// who a character is to look at: its body, its face, what it wears. everything here is drawn from every
// side by views.ts. a character keeps it in its model, it never changes unless someone changes it

export type BodyType = 'male' | 'female' | 'custom';
export type FaceShape = 'oval' | 'round' | 'square' | 'long' | 'heart';
export type Beard = 'none' | 'stubble' | 'mustache' | 'goatee' | 'short' | 'full';
export type TopKind = 'tshirt' | 'longsleeve' | 'hoodie' | 'sweatshirt' | 'shirt' | 'sweater' | 'jacket' | 'blouse' | 'top';
export type BottomKind = 'jeans' | 'trousers' | 'joggers' | 'shorts' | 'skirt' | 'dress';
export type ShoeKind = 'sneakers' | 'boots' | 'sport' | 'elegant' | 'ankleboots' | 'sandals';
export type Bag = 'none' | 'shoulder' | 'backpack';
export type Jewelry = 'none' | 'earrings' | 'necklace' | 'both';

export interface Identity {
  type: BodyType;
  // 0.8 to 1.25 around 1: how wide the shoulders, the waist and the hips are, how long the legs
  shoulders: number;
  waist: number;
  hips: number;
  legs: number;
  // 0 flat to 1, a stylized chest seen from the side and a soft line from the front
  bust: number;
  faceShape: FaceShape;
  // 'ink' draws the classic dark eyes, a color draws an iris round a dark pupil
  eyeColor: string;
  freckles: boolean;
  beard: Beard;
  lipstick: boolean;
  blush: boolean;
  lipColor: string;
  top: TopKind;
  // a second color of the top: a collar, cuffs, the shirt under a jacket, a hood lining
  accent: string;
  bottom: BottomKind;
  shoes: ShoeKind;
  sole: string;
  watch: boolean;
  bag: Bag;
  jewelry: Jewelry;
  // the color of the watch, the bag and the jewelry, and of a hat
  extra: string;
  hatColor: string;
}

// what a character made before identities looks like: the p4b body in a t-shirt and trousers
export const PLAIN: Identity = {
  type: 'custom',
  shoulders: 1,
  waist: 1,
  hips: 1,
  legs: 1,
  bust: 0,
  faceShape: 'oval',
  eyeColor: 'ink',
  freckles: false,
  beard: 'none',
  lipstick: false,
  blush: false,
  lipColor: '#a4504a',
  top: 'tshirt',
  accent: '#e9e2d2',
  bottom: 'trousers',
  shoes: 'sneakers',
  sole: '#e9e2d2',
  watch: false,
  bag: 'none',
  jewelry: 'none',
  extra: '#c4a15e',
  hatColor: '#3e475e'
};

export const BODY_PRESETS: Record<BodyType, Pick<Identity, 'shoulders' | 'waist' | 'hips' | 'legs' | 'bust'> & { headSize: number; height: number }> = {
  male: { shoulders: 1.1, waist: 0.98, hips: 0.95, legs: 1, bust: 0, headSize: 1, height: 1 },
  female: { shoulders: 0.9, waist: 0.82, hips: 1.12, legs: 1.03, bust: 0.55, headSize: 1.05, height: 0.94 },
  custom: { shoulders: 1, waist: 0.92, hips: 1.02, legs: 1, bust: 0.2, headSize: 1, height: 0.97 }
};

export const BODY_TYPES: { id: BodyType; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'custom', label: 'Individual' }
];

export const HAIR_COLORS: { name: string; color: string }[] = [
  { name: 'Black', color: '#1f1c1b' },
  { name: 'Dark brown', color: '#3b2a22' },
  { name: 'Brown', color: '#5c3d2b' },
  { name: 'Light brown', color: '#86613f' },
  { name: 'Dark blond', color: '#a5854f' },
  { name: 'Blond', color: '#d6b878' },
  { name: 'Red', color: '#9e3b25' },
  { name: 'Copper', color: '#b4612f' },
  { name: 'Grey', color: '#8d8a86' },
  { name: 'White', color: '#e4e0d8' }
];

// muted skin tones from light to deep, they keep their cel shadow like every color
export const SKIN_TONES: { name: string; color: string }[] = [
  { name: 'Porcelain', color: '#f0d9c4' },
  { name: 'Light', color: '#e2c4a6' },
  { name: 'Warm light', color: '#dbb491' },
  { name: 'Medium', color: '#c99c7c' },
  { name: 'Olive', color: '#b58d64' },
  { name: 'Tan', color: '#a37a62' },
  { name: 'Brown', color: '#87604a' },
  { name: 'Deep', color: '#6a4838' },
  { name: 'Dark', color: '#4f3529' }
];

export const EYE_COLORS: { name: string; color: string }[] = [
  { name: 'Classic', color: 'ink' },
  { name: 'Dark brown', color: '#4a3020' },
  { name: 'Brown', color: '#6e4a2c' },
  { name: 'Hazel', color: '#7d6a3a' },
  { name: 'Green', color: '#4f6e45' },
  { name: 'Blue', color: '#4f6f95' },
  { name: 'Grey', color: '#7b8287' }
];

// cloth colors: muted like the comic palette, from white over denims to dark
export const CLOTH_COLORS: { name: string; color: string }[] = [
  { name: 'White', color: '#ece8df' },
  { name: 'Cream', color: '#e4d6b8' },
  { name: 'Beige', color: '#c9b18c' },
  { name: 'Camel', color: '#a8814f' },
  { name: 'Mustard', color: '#c49a3a' },
  { name: 'Red', color: '#a8433a' },
  { name: 'Wine', color: '#6e3138' },
  { name: 'Rose', color: '#c08b8a' },
  { name: 'Lilac', color: '#8f7ea3' },
  { name: 'Plum', color: '#6b5066' },
  { name: 'Sky', color: '#8fa9c4' },
  { name: 'Light denim', color: '#7f9bb8' },
  { name: 'Denim', color: '#4e6788' },
  { name: 'Dark denim', color: '#2f3f58' },
  { name: 'Navy', color: '#2b3348' },
  { name: 'Teal', color: '#4e6d6a' },
  { name: 'Sage', color: '#8e9d88' },
  { name: 'Green', color: '#5c7a4f' },
  { name: 'Olive', color: '#6b6d45' },
  { name: 'Light grey', color: '#b5b2ac' },
  { name: 'Grey', color: '#7d7a76' },
  { name: 'Charcoal', color: '#3d3b39' },
  { name: 'Black', color: '#222124' },
  { name: 'Brown', color: '#5e4433' }
];

export const TOPS: { id: TopKind; label: string; sleeves: 'none' | 'short' | 'long' }[] = [
  { id: 'tshirt', label: 'T-shirt', sleeves: 'short' },
  { id: 'longsleeve', label: 'Long sleeve', sleeves: 'long' },
  { id: 'hoodie', label: 'Hoodie', sleeves: 'long' },
  { id: 'sweatshirt', label: 'Sweatshirt', sleeves: 'long' },
  { id: 'shirt', label: 'Shirt', sleeves: 'long' },
  { id: 'sweater', label: 'Sweater', sleeves: 'long' },
  { id: 'jacket', label: 'Jacket', sleeves: 'long' },
  { id: 'blouse', label: 'Blouse', sleeves: 'short' },
  { id: 'top', label: 'Top', sleeves: 'none' }
];

export const BOTTOMS: { id: BottomKind; label: string }[] = [
  { id: 'jeans', label: 'Jeans' },
  { id: 'trousers', label: 'Trousers' },
  { id: 'joggers', label: 'Joggers' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'skirt', label: 'Skirt' },
  { id: 'dress', label: 'Dress' }
];

export const SHOES: { id: ShoeKind; label: string }[] = [
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'sport', label: 'Sport shoes' },
  { id: 'boots', label: 'Boots' },
  { id: 'ankleboots', label: 'Ankle boots' },
  { id: 'elegant', label: 'Elegant' },
  { id: 'sandals', label: 'Sandals' }
];

export const FACE_SHAPES: { id: FaceShape; label: string }[] = [
  { id: 'oval', label: 'Oval' },
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'long', label: 'Long' },
  { id: 'heart', label: 'Heart' }
];

export const BEARDS: { id: Beard; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'stubble', label: 'Stubble' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'short', label: 'Short beard' },
  { id: 'full', label: 'Full beard' }
];

export const BAGS: { id: Bag; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'shoulder', label: 'Shoulder bag' },
  { id: 'backpack', label: 'Backpack' }
];

export const JEWELRY: { id: Jewelry; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'earrings', label: 'Earrings' },
  { id: 'necklace', label: 'Necklace' },
  { id: 'both', label: 'Both' }
];

export interface Outfit {
  label: string;
  // who it fits best, any fits everyone
  for: BodyType | 'any';
  top: TopKind;
  shirt: string;
  accent: string;
  bottom: BottomKind;
  pants: string;
  shoes: ShoeKind;
  shoeColor: string;
  sole: string;
}

const c = (name: string) => CLOTH_COLORS.find((x) => x.name === name)!.color;

// ready combinations, picked at random for a new character or by hand
export const OUTFITS: Outfit[] = [
  { label: 'White shirt, blue jeans', for: 'any', top: 'tshirt', shirt: c('White'), accent: c('Light grey'), bottom: 'jeans', pants: c('Denim'), shoes: 'sneakers', shoeColor: c('White'), sole: c('Light grey') },
  { label: 'Black hoodie, grey joggers', for: 'any', top: 'hoodie', shirt: c('Black'), accent: c('Charcoal'), bottom: 'joggers', pants: c('Grey'), shoes: 'sport', shoeColor: c('White'), sole: c('Charcoal') },
  { label: 'Red top, dark jeans', for: 'any', top: 'longsleeve', shirt: c('Red'), accent: c('Wine'), bottom: 'jeans', pants: c('Dark denim'), shoes: 'sneakers', shoeColor: c('Black'), sole: c('White') },
  { label: 'Beige sweater, black trousers', for: 'any', top: 'sweater', shirt: c('Beige'), accent: c('Camel'), bottom: 'trousers', pants: c('Black'), shoes: 'elegant', shoeColor: c('Brown'), sole: c('Brown') },
  { label: 'Green shirt, light jeans', for: 'any', top: 'tshirt', shirt: c('Green'), accent: c('Olive'), bottom: 'jeans', pants: c('Light denim'), shoes: 'sneakers', shoeColor: c('Cream'), sole: c('White') },
  { label: 'Navy shirt, beige trousers', for: 'male', top: 'shirt', shirt: c('Navy'), accent: c('White'), bottom: 'trousers', pants: c('Beige'), shoes: 'elegant', shoeColor: c('Brown'), sole: c('Brown') },
  { label: 'Denim jacket, white tee, black jeans', for: 'any', top: 'jacket', shirt: c('Denim'), accent: c('White'), bottom: 'jeans', pants: c('Black'), shoes: 'ankleboots', shoeColor: c('Brown'), sole: c('Charcoal') },
  { label: 'Grey sweatshirt, navy joggers', for: 'male', top: 'sweatshirt', shirt: c('Light grey'), accent: c('Grey'), bottom: 'joggers', pants: c('Navy'), shoes: 'sport', shoeColor: c('Charcoal'), sole: c('White') },
  { label: 'Teal hoodie, shorts', for: 'any', top: 'hoodie', shirt: c('Teal'), accent: c('Sage'), bottom: 'shorts', pants: c('Charcoal'), shoes: 'sneakers', shoeColor: c('White'), sole: c('Light grey') },
  { label: 'Olive jacket, dark trousers, boots', for: 'male', top: 'jacket', shirt: c('Olive'), accent: c('Cream'), bottom: 'trousers', pants: c('Charcoal'), shoes: 'boots', shoeColor: c('Brown'), sole: c('Black') },
  { label: 'Rose blouse, cream skirt', for: 'female', top: 'blouse', shirt: c('Rose'), accent: c('Cream'), bottom: 'skirt', pants: c('Cream'), shoes: 'elegant', shoeColor: c('Wine'), sole: c('Wine') },
  { label: 'Mustard dress, sandals', for: 'female', top: 'top', shirt: c('Mustard'), accent: c('Camel'), bottom: 'dress', pants: c('Mustard'), shoes: 'sandals', shoeColor: c('Brown'), sole: c('Camel') },
  { label: 'Lilac sweater, denim skirt', for: 'female', top: 'sweater', shirt: c('Lilac'), accent: c('Plum'), bottom: 'skirt', pants: c('Denim'), shoes: 'ankleboots', shoeColor: c('Black'), sole: c('Charcoal') },
  { label: 'White blouse, black trousers', for: 'female', top: 'blouse', shirt: c('White'), accent: c('Cream'), bottom: 'trousers', pants: c('Black'), shoes: 'elegant', shoeColor: c('Black'), sole: c('Black') },
  { label: 'Sky top, white jeans', for: 'female', top: 'top', shirt: c('Sky'), accent: c('White'), bottom: 'jeans', pants: c('White'), shoes: 'sandals', shoeColor: c('Camel'), sole: c('Brown') },
  { label: 'Wine dress, boots', for: 'female', top: 'longsleeve', shirt: c('Wine'), accent: c('Rose'), bottom: 'dress', pants: c('Wine'), shoes: 'boots', shoeColor: c('Black'), sole: c('Charcoal') },
  { label: 'Black tee, olive shorts', for: 'any', top: 'tshirt', shirt: c('Black'), accent: c('Charcoal'), bottom: 'shorts', pants: c('Olive'), shoes: 'sport', shoeColor: c('Grey'), sole: c('White') },
  { label: 'Camel sweatshirt, light jeans', for: 'any', top: 'sweatshirt', shirt: c('Camel'), accent: c('Cream'), bottom: 'jeans', pants: c('Light denim'), shoes: 'sneakers', shoeColor: c('White'), sole: c('Cream') },
  { label: 'Plum hoodie, black jeans', for: 'any', top: 'hoodie', shirt: c('Plum'), accent: c('Lilac'), bottom: 'jeans', pants: c('Black'), shoes: 'boots', shoeColor: c('Charcoal'), sole: c('Black') },
  { label: 'Sage shirt, navy trousers', for: 'any', top: 'shirt', shirt: c('Sage'), accent: c('Cream'), bottom: 'trousers', pants: c('Navy'), shoes: 'elegant', shoeColor: c('Brown'), sole: c('Brown') }
];

// hairstyles that suit a body type best when picked at random, any of them can be chosen by hand
const HAIR_FOR: Record<BodyType, HairStyle[]> = {
  male: ['short', 'buzz', 'sidepart', 'undercut', 'quiff', 'spiky', 'curly', 'afro', 'middlepart', 'wavy', 'bald'],
  female: ['long', 'longwavy', 'straight', 'ponytail', 'bun', 'bob', 'medium', 'wavy', 'curly', 'pixie', 'afro', 'middlepart'],
  custom: ['short', 'medium', 'bob', 'wavy', 'curly', 'undercut', 'pixie', 'long', 'ponytail', 'middlepart', 'quiff']
};

export interface Look {
  identity: Identity;
  colors: CharacterColors;
  hair: HairStyle;
  headSize: number;
  // a share of the height the body type gives
  heightShare: number;
}

// a whole new look for a body type from a random source: a body inside the type's range, a skin tone,
// a hair style and color, eyes, an outfit that fits, sometimes a beard, make-up, freckles or extras
export function randomLook(type: BodyType, source: () => number): Look {
  // the first values of nearby seeds lie close together: they are stirred into each other first
  let state = 0;
  for (let i = 0; i < 6; i++) state = (state * 31 + Math.floor(source() * 1e9)) % 2147483647;
  const rnd = () => {
    state = (state * 48271 + Math.floor(source() * 65536)) % 2147483647;
    return state / 2147483647;
  };
  const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length) % list.length];
  const near = (v: number, spread: number) => v + (rnd() * 2 - 1) * spread;
  const preset = BODY_PRESETS[type];
  const outfits = OUTFITS.filter((o) => o.for === 'any' || o.for === type || type === 'custom');
  const outfit = pick(outfits);
  const hairColor = pick(HAIR_COLORS.slice(0, rnd() < 0.12 ? 10 : 8)).color;
  const identity: Identity = {
    ...PLAIN,
    type,
    shoulders: near(preset.shoulders, 0.06),
    waist: near(preset.waist, 0.05),
    hips: near(preset.hips, 0.05),
    legs: near(preset.legs, 0.03),
    bust: type === 'male' ? 0 : Math.max(0, near(preset.bust, 0.15)),
    faceShape: pick(['oval', 'round', 'square', 'long', 'heart'] as FaceShape[]),
    eyeColor: pick(EYE_COLORS).color,
    freckles: rnd() < 0.18,
    beard: type === 'male' && rnd() < 0.45 ? pick(['stubble', 'mustache', 'goatee', 'short', 'full'] as Beard[]) : 'none',
    lipstick: type === 'female' && rnd() < 0.35,
    blush: type !== 'male' && rnd() < 0.3,
    lipColor: pick(['#a4504a', '#8e3b44', '#b36a63']),
    top: outfit.top,
    accent: outfit.accent,
    bottom: outfit.bottom,
    shoes: outfit.shoes,
    sole: outfit.sole,
    watch: rnd() < 0.25,
    bag: rnd() < 0.2 ? pick(['shoulder', 'backpack'] as Bag[]) : 'none',
    jewelry: type === 'female' && rnd() < 0.45 ? pick(['earrings', 'necklace', 'both'] as Jewelry[]) : rnd() < 0.08 ? 'necklace' : 'none',
    extra: pick(['#c4a15e', '#b5b2ac', '#5e4433', '#222124']),
    hatColor: pick(CLOTH_COLORS).color
  };
  // the same outfit comes in other colors now and then, the top never in the color of the bottom
  const shirt = rnd() < 0.45 ? pick(CLOTH_COLORS.filter((x) => x.color !== outfit.pants)).color : outfit.shirt;
  const colors: CharacterColors = {
    skin: pick(SKIN_TONES).color,
    hair: hairColor,
    shirt,
    pants: outfit.pants,
    shoes: outfit.shoeColor,
    outline: '#1d1b19'
  };
  return { identity, colors, hair: pick(HAIR_FOR[type]), headSize: near(preset.headSize, 0.04), heightShare: near(preset.height, 0.04) };
}

// an outfit put on: the kinds and the colors of top, bottom and shoes
export function wearOutfit(identity: Identity, colors: CharacterColors, o: Outfit): { identity: Identity; colors: CharacterColors } {
  return {
    identity: { ...identity, top: o.top, accent: o.accent, bottom: o.bottom, shoes: o.shoes, sole: o.sole },
    colors: { ...colors, shirt: o.shirt, pants: o.pants, shoes: o.shoeColor }
  };
}

export function identityOf(v: Partial<Identity> | undefined | null, sleeves?: 'short' | 'long'): Identity {
  const base = { ...PLAIN, ...(v ?? {}) };
  // a character from p4b with long sleeves wears a long sleeve shirt
  if (!v?.top && sleeves === 'long') base.top = 'longsleeve';
  return base;
}
