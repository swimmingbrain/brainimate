// key combos as the app writes them: the modifiers in the order Ctrl, Alt, Shift and then the key,
// like 'Ctrl+Shift+Z', 'F6', 'Shift+,' or 'Up'. Ctrl is Cmd on a mac

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

// keys with a name, the arrows are short
const NAMED = [
  'Enter',
  'Escape',
  'Delete',
  'Backspace',
  'Tab',
  'Space',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'NumpadAdd',
  'NumpadSubtract',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)
];

// what people type for a named key
const ALIASES: Record<string, string> = {
  esc: 'Escape',
  del: 'Delete',
  return: 'Enter',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  ' ': 'Space',
  spacebar: 'Space',
  pgup: 'PageUp',
  pgdn: 'PageDown'
};

// the symbol keys by their place on the keyboard
const SYMBOLS: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Equal: '=',
  Minus: '-',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`'
};

const MODIFIERS = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS'];

function namedKey(text: string): string | null {
  const lower = text.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  return NAMED.find((n) => n.toLowerCase() === lower) ?? null;
}

export function parseCombo(text: string): Combo | null {
  const raw = text.trim();
  if (!raw) return null;
  // a plus at the end is the key itself
  const parts = raw.endsWith('++') ? [...raw.slice(0, -2).split('+'), '+'] : raw.split('+');
  const combo: Combo = { ctrl: false, alt: false, shift: false, key: '' };
  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i].trim().toLowerCase();
    if (mod === 'ctrl' || mod === 'control' || mod === 'cmd' || mod === 'meta' || mod === 'mod') combo.ctrl = true;
    else if (mod === 'alt' || mod === 'option') combo.alt = true;
    else if (mod === 'shift') combo.shift = true;
    else return null;
  }
  const last = parts[parts.length - 1];
  const key = last === ' ' ? 'Space' : last.trim();
  if (!key) return null;
  if (key.length === 1) {
    combo.key = /[a-z]/i.test(key) ? key.toUpperCase() : key;
    return combo;
  }
  const named = namedKey(key);
  if (!named) return null;
  combo.key = named;
  return combo;
}

export function formatCombo(c: Combo): string {
  const mods = [c.ctrl ? 'Ctrl' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : ''].filter(Boolean);
  return [...mods, c.key].join('+');
}

// the same combo written one way, null when it is not one
export function normalizeCombo(text: string): string | null {
  const c = parseCombo(text);
  return c ? formatCombo(c) : null;
}

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// the combo a key press makes, null while only modifiers are down
export function comboFromEvent(e: KeyLike): string | null {
  if (MODIFIERS.includes(e.key)) return null;
  let key: string | null = null;
  if (e.key.length === 1 && /[a-z]/i.test(e.key)) key = e.key.toUpperCase();
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (SYMBOLS[e.code]) key = SYMBOLS[e.code];
  else if (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract') key = e.code;
  else if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  else key = namedKey(e.key) ?? (e.key.length === 1 ? e.key : null);
  if (!key) return null;
  return formatCombo({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key });
}

const CODE_OF: Record<string, string> = Object.fromEntries(Object.entries(SYMBOLS).map(([code, ch]) => [ch, code]));

// the tinykeys spelling: letters by the character so other layouts keep their letters, digits and
// symbols by their place when shift or alt changes the character they type
export function toTinykeys(text: string): string | null {
  const c = parseCombo(text);
  if (!c) return null;
  const mods = [c.ctrl ? '$mod' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : ''].filter(Boolean);
  let key = c.key;
  const changed = c.shift || c.alt;
  if (/^[A-Z]$/.test(key)) key = c.alt ? `Key${key}` : key.toLowerCase();
  else if (/^\d$/.test(key)) key = changed ? `Digit${key}` : key;
  else if (CODE_OF[key]) key = changed ? CODE_OF[key] : key;
  else if (key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right') key = `Arrow${key}`;
  return [...mods, key].join('+');
}

// how a combo reads in menus and tooltips, a few shifted symbols read as what they type
export function keyLabel(text: string): string {
  const c = parseCombo(text);
  if (!c) return text;
  if (c.shift && !c.ctrl && !c.alt && c.key === '/') return '?';
  return formatCombo(c);
}

export function sameCombo(a: string, b: string): boolean {
  const x = normalizeCombo(a);
  return x !== null && x === normalizeCombo(b);
}
