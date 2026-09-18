import { describe, expect, it } from 'vitest';
import { comboFromEvent, keyLabel, normalizeCombo, parseCombo, sameCombo, toTinykeys } from './keys';

function press(key: string, code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) {
  return {
    key,
    code,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift
  };
}

describe('key combos', () => {
  it('reads combos in any order and case and writes them one way', () => {
    expect(normalizeCombo('shift+ctrl+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeCombo('Cmd+Alt+c')).toBe('Ctrl+Alt+C');
    expect(normalizeCombo('esc')).toBe('Escape');
    expect(normalizeCombo('ArrowUp')).toBe('Up');
    expect(normalizeCombo('ctrl+arrowdown')).toBe('Ctrl+Down');
    expect(normalizeCombo('Shift+,')).toBe('Shift+,');
    expect(normalizeCombo('f6')).toBe('F6');
    expect(normalizeCombo('ctrl++')).toBe('Ctrl++');
    expect(normalizeCombo(' ')).toBeNull();
    expect(normalizeCombo('Hyper+K')).toBeNull();
    expect(normalizeCombo('Ctrl+Banana')).toBeNull();
  });

  it('keeps the parts apart', () => {
    expect(parseCombo('Ctrl+Shift+S')).toEqual({ ctrl: true, alt: false, shift: true, key: 'S' });
    expect(parseCombo('Alt+Space')).toEqual({ ctrl: false, alt: true, shift: false, key: 'Space' });
  });

  it('turns a key press into a combo', () => {
    expect(comboFromEvent(press('r', 'KeyR', { shift: false }))).toBe('R');
    expect(comboFromEvent(press('R', 'KeyR', { shift: true }))).toBe('Shift+R');
    expect(comboFromEvent(press('s', 'KeyS', { ctrl: true }))).toBe('Ctrl+S');
    expect(comboFromEvent(press('s', 'KeyS', { meta: true }))).toBe('Ctrl+S');
    // alt on a mac types another character, the place of the key still names it
    expect(comboFromEvent(press('ø', 'KeyO', { alt: true, shift: true }))).toBe('Alt+Shift+O');
    expect(comboFromEvent(press('<', 'Comma', { shift: true }))).toBe('Shift+,');
    expect(comboFromEvent(press('?', 'Slash', { shift: true }))).toBe('Shift+/');
    expect(comboFromEvent(press('!', 'Digit1', { shift: true }))).toBe('Shift+1');
    expect(comboFromEvent(press('ArrowLeft', 'ArrowLeft', { ctrl: true }))).toBe('Ctrl+Left');
    expect(comboFromEvent(press(' ', 'Space'))).toBe('Space');
    expect(comboFromEvent(press('F7', 'F7'))).toBe('F7');
    expect(comboFromEvent(press('+', 'NumpadAdd', { ctrl: true }))).toBe('Ctrl+NumpadAdd');
    // a layout that puts a on the q key keeps its letters
    expect(comboFromEvent(press('a', 'KeyQ'))).toBe('A');
    expect(comboFromEvent(press('Shift', 'ShiftLeft', { shift: true }))).toBeNull();
    expect(comboFromEvent(press('Control', 'ControlLeft', { ctrl: true }))).toBeNull();
  });

  it('spells combos for tinykeys', () => {
    expect(toTinykeys('Ctrl+Shift+Z')).toBe('$mod+Shift+z');
    expect(toTinykeys('V')).toBe('v');
    expect(toTinykeys('Shift+,')).toBe('Shift+Comma');
    expect(toTinykeys(',')).toBe(',');
    expect(toTinykeys('Ctrl+=')).toBe('$mod+=');
    expect(toTinykeys('Ctrl+Shift+=')).toBe('$mod+Shift+Equal');
    expect(toTinykeys('Alt+Shift+O')).toBe('Alt+Shift+KeyO');
    expect(toTinykeys('Ctrl+Alt+C')).toBe('$mod+Alt+KeyC');
    expect(toTinykeys('Shift+/')).toBe('Shift+Slash');
    expect(toTinykeys('Ctrl+Up')).toBe('$mod+ArrowUp');
    expect(toTinykeys('Shift+1')).toBe('Shift+Digit1');
    expect(toTinykeys('Ctrl+1')).toBe('$mod+1');
    expect(toTinykeys('Space')).toBe('Space');
    expect(toTinykeys('nonsense+x')).toBeNull();
  });

  it('reads well in menus and compares combos however they are written', () => {
    expect(keyLabel('Shift+/')).toBe('?');
    expect(keyLabel('ctrl+shift+s')).toBe('Ctrl+Shift+S');
    expect(sameCombo('shift+ctrl+z', 'Ctrl+Shift+Z')).toBe(true);
    expect(sameCombo('Ctrl+Z', 'Ctrl+Shift+Z')).toBe(false);
    expect(sameCombo('nonsense', 'nonsense')).toBe(false);
  });
});
