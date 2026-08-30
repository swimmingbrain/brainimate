<script lang="ts">
  import SelectField from '$lib/ui/SelectField.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import { preferences, setGroup, type BindMode } from '$lib/stores/preferences';

  const MODES = [
    { value: 'auto', label: 'Smooth or rigid' },
    { value: 'smooth', label: 'Smooth' },
    { value: 'rigid', label: 'Rigid' }
  ];

  const r = $derived($preferences.rig);
</script>

<div class="opt">
  <span>Bind</span>
  <span class="select">
    <SelectField
      value={r.bindMode}
      options={MODES}
      label="How a clicked drawing follows the bone"
      onchange={(v) => setGroup('rig', { bindMode: v as BindMode })} />
  </span>
</div>
<div class="opt">
  <span>Reach</span>
  <ToggleField
    value={r.showCapsules}
    label="Show the reach of each bone"
    onchange={(on) => setGroup('rig', { showCapsules: on })} />
</div>
<span class="hint">Click a bone, then the drawings it should move, drag the reach edge to resize</span>

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
    width: 124px;
  }

  .hint {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
