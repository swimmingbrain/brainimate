<script lang="ts">
  import SelectField from '$lib/ui/SelectField.svelte';
  import { toolCursor, toolOptions } from '$lib/stores/app';
  import { preferences, setGroup, type BucketGap } from '$lib/stores/preferences';
  import { BUCKET_CURSOR, INK_CURSOR } from '../cursors';

  const MODES = [
    { value: 'fill', label: 'Fill (K)' },
    { value: 'stroke', label: 'Ink bottle (S)' }
  ];
  const GAPS = [
    { value: 'none', label: 'No gaps' },
    { value: 'small', label: 'Small gaps' },
    { value: 'medium', label: 'Medium gaps' },
    { value: 'large', label: 'Large gaps' }
  ];

  function setMode(mode: string) {
    const bucketMode = mode === 'stroke' ? 'stroke' : 'fill';
    toolOptions.update((o) => ({ ...o, bucketMode }));
    toolCursor.set(bucketMode === 'stroke' ? INK_CURSOR : BUCKET_CURSOR);
  }
</script>

<div class="opt">
  <span>Paint</span>
  <span class="select">
    <SelectField value={$toolOptions.bucketMode} options={MODES} label="Bucket mode" onchange={setMode} />
  </span>
</div>
<div class="opt">
  <span>Close</span>
  <span class="select">
    <SelectField
      value={$preferences.drawing.bucketGap}
      options={GAPS}
      label="Close gaps"
      onchange={(v) => setGroup('drawing', { bucketGap: v as BucketGap })} />
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
