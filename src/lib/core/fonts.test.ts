import { describe, expect, it } from 'vitest';
import { familyOf, pickFace, weightOf, type FamilyInfo } from './fonts';

describe('fonts', () => {
  it('knows the bundled families and their faces', () => {
    const inter = familyOf('Inter')!;
    expect(inter.source).toBe('bundled');
    expect(inter.faces.map((f) => [f.weight, f.italic])).toEqual([
      [400, false],
      [700, false],
      [400, true],
      [700, true]
    ]);
    expect(familyOf('Bebas Neue')?.faces[0].url).toBe('/fonts/bebas-neue-400-normal.woff');
    expect(familyOf('Comic Sans')).toBeNull();
  });

  it('picks the face with the same slant and the closest weight', () => {
    const family: FamilyInfo = {
      name: 'X',
      source: 'user',
      faces: [
        { weight: 400, italic: false },
        { weight: 700, italic: false },
        { weight: 300, italic: true }
      ]
    };
    expect(pickFace(family, 600, false).weight).toBe(700);
    expect(pickFace(family, 500, false).weight).toBe(400);
    expect(pickFace(family, 700, true)).toEqual({ weight: 300, italic: true });
    const upright = { ...family, faces: family.faces.slice(0, 1) };
    expect(pickFace(upright, 400, true).weight).toBe(400);
  });

  it('reads the weight from a style name', () => {
    expect(weightOf('Regular')).toBe(400);
    expect(weightOf('Bold Italic')).toBe(700);
    expect(weightOf('SemiBold')).toBe(600);
    expect(weightOf('Extra Light')).toBe(200);
    expect(weightOf('Black')).toBe(900);
  });
});
