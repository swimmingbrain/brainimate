<script lang="ts">
  import SelectField from '$lib/ui/SelectField.svelte';
  import { strokeWidth } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';
  import { applyPreset, matchingPreset, type PenTool } from '../presets';

  // the saved presets of the brush or the pencil, custom shows while the settings match none
  let { tool }: { tool: PenTool } = $props();

  const match = $derived(matchingPreset($preferences, tool, $strokeWidth));
  const options = $derived([
    ...(match ? [] : [{ value: '', label: 'Custom' }]),
    ...$preferences.pens[tool].map((q) => ({ value: q.id, label: q.name }))
  ]);
</script>

<div class="opt">
  <span>Preset</span>
  <span class="select">
    <SelectField
      value={match?.id ?? ''}
      {options}
      label={tool === 'brush' ? 'Brush preset' : 'Pencil preset'}
      onchange={(id) => id && applyPreset(tool, id)} />
  </span>
</div>

<style>
  .opt {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .select {
    width: 112px;
  }
</style>
