<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../Dialog.svelte';
  import Tabs from '../Tabs.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import Slider from '../Slider.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import ColorField from '../ColorField.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { TOOL_INFO } from '$lib/tools';
  import { TOOL_IDS, type ToolId } from '$lib/tools/tool';
  import { addToast, setWorkspace, WORKSPACES, type PreferencesCategory } from '$lib/stores/app';
  import { preferences, resetPreferences, setGroup, type Workspace } from '$lib/stores/preferences';

  let { category = 'general', onclose }: { category?: PreferencesCategory; onclose: () => void } = $props();

  let tab = $state<PreferencesCategory>(untrack(() => category));

  const tabs: { id: PreferencesCategory; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'toolbar', label: 'Toolbar' },
    { id: 'stage', label: 'Stage' },
    { id: 'drawing', label: 'Drawing' },
    { id: 'timeline', label: 'Timeline' }
  ];

  const workspaceOptions = WORKSPACES.map((ws) => ({ value: ws.id, label: ws.label }));

  function toggleTool(id: ToolId, on: boolean) {
    const visible = $preferences.toolbar.tools;
    // the default order decides where a tool comes back
    const next = on ? TOOL_IDS.filter((t) => t === id || visible.includes(t)) : visible.filter((t) => t !== id);
    setGroup('toolbar', { tools: next });
  }

  function reset() {
    resetPreferences();
    setWorkspace('essentials');
  }

  function notYet() {
    addToast('The color picker is not there yet');
  }
</script>

<Dialog title="Preferences" width={520} {onclose}>
  <Tabs {tabs} active={tab} onchange={(id) => (tab = id as PreferencesCategory)} />
  <div class="page">
    {#if tab === 'general'}
      <Field label="Workspace">
        <SelectField
          value={$preferences.workspace}
          options={workspaceOptions}
          label="Workspace"
          onchange={(v) => setWorkspace(v as Workspace)} />
      </Field>
      <Field label="Pasteboard" hint="Show what lies outside the stage">
        <ToggleField
          value={$preferences.stage.pasteboard}
          label="Pasteboard"
          onchange={(v) => setGroup('stage', { pasteboard: v })} />
      </Field>
      <div class="actions">
        <button class="dialog-btn" onclick={reset}>Reset all preferences</button>
      </div>
    {:else if tab === 'toolbar'}
      <p class="hint">Hidden tools keep their keys.</p>
      <div class="tool-list">
        {#each TOOL_IDS as id (id)}
          <Field label={TOOL_INFO[id].name}>
            {#snippet before()}<Icon name={TOOL_INFO[id].icon} size={14} />{/snippet}
            <ToggleField
              value={$preferences.toolbar.tools.includes(id)}
              label={TOOL_INFO[id].name}
              onchange={(v) => toggleTool(id, v)} />
          </Field>
        {/each}
      </div>
    {:else if tab === 'stage'}
      <Field label="Show grid">
        <ToggleField value={$preferences.grid.show} label="Show grid" onchange={(v) => setGroup('grid', { show: v })} />
      </Field>
      <Field label="Grid size">
        <NumberField
          value={$preferences.grid.size}
          min={2}
          max={500}
          unit=" px"
          label="Grid size"
          onchange={(v) => setGroup('grid', { size: v })} />
      </Field>
      <Field label="Grid color">
        <ColorField value={$preferences.grid.color} label="Grid color" onclick={notYet} />
      </Field>
      <Field label="Snap to grid">
        <ToggleField value={$preferences.grid.snap} label="Snap to grid" onchange={(v) => setGroup('grid', { snap: v })} />
      </Field>
      <Field label="Rulers">
        <ToggleField value={$preferences.rulers.show} label="Rulers" onchange={(v) => setGroup('rulers', { show: v })} />
      </Field>
      <Field label="Guides">
        <ToggleField value={$preferences.guides.show} label="Guides" onchange={(v) => setGroup('guides', { show: v })} />
      </Field>
      <Field label="Snap to guides">
        <ToggleField
          value={$preferences.guides.snap}
          label="Snap to guides"
          onchange={(v) => setGroup('guides', { snap: v })} />
      </Field>
      <Field label="Lock guides">
        <ToggleField
          value={$preferences.guides.lock}
          label="Lock guides"
          onchange={(v) => setGroup('guides', { lock: v })} />
      </Field>
      <Field label="Smart guides">
        <ToggleField
          value={$preferences.snapping.smartGuides}
          label="Smart guides"
          onchange={(v) => setGroup('snapping', { smartGuides: v })} />
      </Field>
      <Field label="Snap to points">
        <ToggleField
          value={$preferences.snapping.points}
          label="Snap to points"
          onchange={(v) => setGroup('snapping', { points: v })} />
      </Field>
      <Field label="Snap to objects">
        <ToggleField
          value={$preferences.snapping.objects}
          label="Snap to objects"
          onchange={(v) => setGroup('snapping', { objects: v })} />
      </Field>
      <Field label="Snap to pixels">
        <ToggleField
          value={$preferences.snapping.pixels}
          label="Snap to pixels"
          onchange={(v) => setGroup('snapping', { pixels: v })} />
      </Field>
    {:else if tab === 'drawing'}
      <Field label="Pencil smoothing">
        <Slider
          value={$preferences.drawing.pencilSmoothing}
          min={0}
          max={100}
          precision={0}
          label="Pencil smoothing"
          onchange={(v) => setGroup('drawing', { pencilSmoothing: v })} />
      </Field>
      <Field label="Brush size">
        <NumberField
          value={$preferences.drawing.brushSize}
          min={1}
          max={500}
          unit=" px"
          label="Brush size"
          onchange={(v) => setGroup('drawing', { brushSize: v })} />
      </Field>
      <Field label="Brush pressure">
        <ToggleField
          value={$preferences.drawing.brushPressure}
          label="Brush pressure"
          onchange={(v) => setGroup('drawing', { brushPressure: v })} />
      </Field>
      <Field label="Stroke width">
        <NumberField
          value={$preferences.drawing.strokeWidth}
          min={0}
          max={500}
          step={0.5}
          precision={1}
          unit=" px"
          label="Stroke width"
          onchange={(v) => setGroup('drawing', { strokeWidth: v })} />
      </Field>
      <Field label="Default fill">
        <ColorField value={$preferences.drawing.fill} label="Default fill" onclick={notYet} />
      </Field>
      <Field label="Default stroke">
        <ColorField value={$preferences.drawing.stroke} label="Default stroke" onclick={notYet} />
      </Field>
      <Field label="Handle size">
        <NumberField
          value={$preferences.drawing.handleSize}
          min={3}
          max={20}
          unit=" px"
          label="Handle size"
          onchange={(v) => setGroup('drawing', { handleSize: v })} />
      </Field>
      <Field label="Hit tolerance">
        <NumberField
          value={$preferences.drawing.hitTolerance}
          min={1}
          max={30}
          unit=" px"
          label="Hit tolerance"
          onchange={(v) => setGroup('drawing', { hitTolerance: v })} />
      </Field>
    {:else}
      <Field label="Frame rate" hint="For new documents">
        <NumberField
          value={$preferences.timeline.fps}
          min={1}
          max={120}
          unit=" fps"
          label="Frame rate"
          onchange={(v) => setGroup('timeline', { fps: v })} />
      </Field>
      <Field label="Frame width">
        <Slider
          value={$preferences.timeline.frameWidth}
          min={4}
          max={24}
          precision={0}
          unit=" px"
          label="Frame width"
          onchange={(v) => setGroup('timeline', { frameWidth: v })} />
      </Field>
      <Field label="Onion before">
        <NumberField
          value={$preferences.timeline.onionBefore}
          min={0}
          max={10}
          label="Onion skin frames before"
          onchange={(v) => setGroup('timeline', { onionBefore: v })} />
      </Field>
      <Field label="Onion after">
        <NumberField
          value={$preferences.timeline.onionAfter}
          min={0}
          max={10}
          label="Onion skin frames after"
          onchange={(v) => setGroup('timeline', { onionAfter: v })} />
      </Field>
      <Field label="Onion outlines">
        <ToggleField
          value={$preferences.timeline.onionOutline}
          label="Onion skin as outlines"
          onchange={(v) => setGroup('timeline', { onionOutline: v })} />
      </Field>
      <Field label="Onion keyframes" hint="Ghost the keyframes around the playhead instead of the frames">
        <ToggleField
          value={$preferences.timeline.onionKeyframes}
          label="Onion skin on keyframes only"
          onchange={(v) => setGroup('timeline', { onionKeyframes: v })} />
      </Field>
      <Field label="Onion past">
        <ColorField value={$preferences.timeline.onionBeforeColor} label="Onion skin color before" onclick={notYet} />
      </Field>
      <Field label="Onion future">
        <ColorField value={$preferences.timeline.onionAfterColor} label="Onion skin color after" onclick={notYet} />
      </Field>
      <Field label="Auto key">
        <ToggleField
          value={$preferences.timeline.autoKey}
          label="Auto key"
          onchange={(v) => setGroup('timeline', { autoKey: v })} />
      </Field>
      <Field label="Loop playback">
        <ToggleField value={$preferences.timeline.loop} label="Loop playback" onchange={(v) => setGroup('timeline', { loop: v })} />
      </Field>
    {/if}
  </div>
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Close</button>
  {/snippet}
</Dialog>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 0 4px;
    min-height: 300px;
  }

  .tool-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .hint {
    font-size: 11.5px;
    color: var(--text-muted);
    padding: 0 8px 6px;
  }

  .actions {
    padding: 12px 8px 0;
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
