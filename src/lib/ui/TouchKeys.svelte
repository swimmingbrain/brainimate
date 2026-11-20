<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import { commandById } from '$lib/editor/actions';
  import { toggleModifier, toolKey, touchCancel, touchDone, touchModifiers } from '$lib/editor/touch';
  import { selection } from '$lib/stores/app';

  // the keys a tool asks for, on the edge of the stage: shift, alt and ctrl stay on until tapped again,
  // done is enter, cancel is escape, delete takes the last anchor of a path or the selection
  const KEYS = [
    { key: 'shift', label: 'Shift', hint: 'Adds to the selection, keeps lines straight and shapes even' },
    { key: 'alt', label: 'Alt', hint: 'Copies on drag, draws from the center, turns one bone' },
    { key: 'ctrl', label: 'Ctrl', hint: 'Skews with free transform, picks inside groups' }
  ] as const;

  function remove() {
    // the pen and the direct selection take the last anchor or the picked ones first
    if (toolKey('Backspace')) return;
    if ($selection.size > 0) commandById('edit.delete')?.run();
  }
</script>

<div class="touch-keys" role="toolbar" aria-label="Keys" aria-orientation="vertical">
  {#each KEYS as k (k.key)}
    <button
      class="key"
      class:on={$touchModifiers[k.key]}
      title={k.hint}
      aria-label={k.label}
      aria-pressed={$touchModifiers[k.key]}
      onclick={() => toggleModifier(k.key)}>
      {k.label}
    </button>
  {/each}
  <span class="sep"></span>
  <button class="key icon" title="Done, like enter: ends a pen path, a bone chain or typed text" aria-label="Done" onclick={touchDone}>
    <Icon name="check" size={18} />
  </button>
  <button class="key icon" title="Cancel, like escape: drops what the tool does or deselects" aria-label="Cancel" onclick={touchCancel}>
    <Icon name="close" size={18} />
  </button>
  <button class="key icon" title="Delete the last anchor or the selection" aria-label="Delete" onclick={remove}>
    <Icon name="trash" size={18} />
  </button>
</div>

<style>
  .touch-keys {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px;
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .key {
    width: 44px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    border-radius: 6px;
  }

  .key:active {
    background: var(--bg-hover);
  }

  .key.on {
    color: #111;
    background: var(--accent);
  }

  .sep {
    height: 1px;
    margin: 2px 4px;
    background: var(--border);
  }
</style>
