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
  <span>Auto bind</span>
  <ToggleField
    value={r.autoBind}
    label="Bind the drawings a chain reaches"
    onchange={(on) => setGroup('rig', { autoBind: on })} />
</div>
<div class="opt">
  <span>Bind</span>
  <span class="select">
    <SelectField
      value={r.bindMode}
      options={MODES}
      label="How drawings follow the bones"
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
<span class="hint">Click joint after joint, Esc ends the chain</span>

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
