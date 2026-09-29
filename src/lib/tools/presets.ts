import { get } from 'svelte/store';
import { newId } from '$lib/core/ids';
import { preferences, type PenPreset, type Preferences } from '$lib/stores/preferences';

export type PenTool = 'brush' | 'pencil';

export const BRUSH_MODES = [
  { value: 'normal', label: 'Normal' },
  { value: 'behind', label: 'Paint behind' }
];

export const PENCIL_MODES = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'ink', label: 'Ink' },
  { value: 'straighten', label: 'Straighten' }
];

// the settings a preset holds, as the tool has them now. the pencil size is its stroke width
export function currentPen(p: Preferences, tool: PenTool): Omit<PenPreset, 'id' | 'name'> {
  const d = p.drawing;
  if (tool === 'brush') {
    return { size: d.brushSize, smoothing: d.brushSmoothing, pressure: d.brushPressure, mode: d.brushMode };
  }
  return { size: d.pencilWidth, smoothing: d.pencilSmoothing, pressure: false, mode: d.pencilMode };
}

// the preset that matches what the tool has now, null for settings of its own
export function matchingPreset(p: Preferences, tool: PenTool): PenPreset | null {
  const now = currentPen(p, tool);
  return (
    p.pens[tool].find(
      (q) =>
        Math.abs(q.size - now.size) < 1e-6 &&
        Math.abs(q.smoothing - now.smoothing) < 1e-6 &&
        q.mode === now.mode &&
        (tool === 'pencil' || q.pressure === now.pressure)
    ) ?? null
  );
}

// the preferences with the tool set to the preset
export function withPreset(p: Preferences, tool: PenTool, preset: PenPreset): Preferences {
  const d = p.drawing;
  if (tool === 'brush') {
    const mode = preset.mode === 'behind' ? 'behind' : 'normal';
    return {
      ...p,
      drawing: { ...d, brushSize: preset.size, brushSmoothing: preset.smoothing, brushPressure: preset.pressure, brushMode: mode }
    };
  }
  const mode = preset.mode === 'ink' || preset.mode === 'straighten' ? preset.mode : 'smooth';
  return { ...p, drawing: { ...d, pencilWidth: preset.size, pencilSmoothing: preset.smoothing, pencilMode: mode } };
}

export function applyPreset(tool: PenTool, id: string) {
  const preset = get(preferences).pens[tool].find((q) => q.id === id);
  if (!preset) return;
  preferences.update((p) => withPreset(p, tool, preset));
}

function setPresets(tool: PenTool, list: PenPreset[]) {
  preferences.update((p) => ({ ...p, pens: { ...p.pens, [tool]: list } }));
}

// a new preset from what the tool has now, named after the tool with the next free number
export function addPresetFromCurrent(tool: PenTool): string {
  const p = get(preferences);
  const list = p.pens[tool];
  const base = tool === 'brush' ? 'Brush' : 'Pencil';
  let n = list.length + 1;
  while (list.some((q) => q.name === `${base} ${n}`)) n++;
  const preset: PenPreset = { id: newId(), name: `${base} ${n}`, ...currentPen(p, tool) };
  setPresets(tool, [...list, preset]);
  return preset.id;
}

export function renamePreset(tool: PenTool, id: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  setPresets(
    tool,
    get(preferences).pens[tool].map((q) => (q.id === id ? { ...q, name: clean } : q))
  );
}

// the default goes over to the first one left when it is the one deleted
export function deletePreset(tool: PenTool, id: string) {
  preferences.update((p) => {
    const list = p.pens[tool].filter((q) => q.id !== id);
    const key = tool === 'brush' ? 'brushDefault' : 'pencilDefault';
    const def = p.pens[key] === id ? (list[0]?.id ?? '') : p.pens[key];
    return { ...p, pens: { ...p.pens, [tool]: list, [key]: def } };
  });
}

export function setDefaultPreset(tool: PenTool, id: string) {
  const key = tool === 'brush' ? 'brushDefault' : 'pencilDefault';
  preferences.update((p) => ({ ...p, pens: { ...p.pens, [key]: id } }));
}

// the brush and the pencil start with their default presets
export function applyDefaultPresets() {
  const pens = get(preferences).pens;
  if (pens.brushDefault) applyPreset('brush', pens.brushDefault);
  if (pens.pencilDefault) applyPreset('pencil', pens.pencilDefault);
}
