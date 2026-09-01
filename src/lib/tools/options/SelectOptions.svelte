<script lang="ts">
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { docVersion, editStack, editor } from '$lib/editor/editor';

  // the toggle only matters once the timeline has bones
  const rigged = $derived.by(() => {
    void $docVersion;
    void $editStack;
    return editor.currentLayers().some((l) => l.type === 'rig' && l.bones.length > 0);
  });
</script>

{#if rigged}
  <div class="opt">
    <span>Bones</span>
    <ToggleField
      value={$preferences.rig.showBones}
      label="Show the bones, drag a joint to pose"
      onchange={(on) => setGroup('rig', { showBones: on })} />
  </div>
  {#if $preferences.rig.showBones}
    <span class="hint">Drag a joint to pose, alt turns one bone, double click pins</span>
  {/if}
{/if}

<style>
  .opt {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .hint {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
