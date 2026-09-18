import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyScore } from './fuzzy';

describe('fuzzy search', () => {
  it('matches letters in order and nothing out of order', () => {
    expect(fuzzyScore('ikf', 'Insert keyframe')).not.toBeNull();
    expect(fuzzyScore('fki', 'Insert keyframe')).toBeNull();
    expect(fuzzyScore('', 'Anything')).toBe(0);
  });

  it('puts a word in one piece over letters spread around', () => {
    const names = ['Clear keyframe', 'Insert blank keyframe', 'Insert keyframe', 'Keyboard shortcuts'];
    expect(fuzzyFilter(names, 'insert key', (n) => n)[0]).toBe('Insert keyframe');
    expect(fuzzyFilter(names, 'key', (n) => n)[0]).toBe('Keyboard shortcuts');
    expect(fuzzyFilter(names, 'ibk', (n) => n)).toEqual(['Insert blank keyframe']);
  });

  it('prefers letters that start words', () => {
    const a = fuzzyScore('sg', 'Smart guides')!;
    const b = fuzzyScore('sg', 'Missing')!;
    expect(a).toBeGreaterThan(b);
  });

  it('keeps the order it got when nothing is typed', () => {
    expect(fuzzyFilter(['b', 'a', 'c'], '  ', (n) => n)).toEqual(['b', 'a', 'c']);
  });
});
