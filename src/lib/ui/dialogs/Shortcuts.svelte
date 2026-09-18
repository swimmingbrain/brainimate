<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import { COMMANDS, keysOf } from '$lib/editor/actions';
  import { keyLabel } from '$lib/editor/keys';
  import { dialog } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  let { onclose }: { onclose: () => void } = $props();

  interface Shortcut {
    keys: string[];
    what: string;
  }

  // what the pointer does with a key held, these have no command of their own
  const POINTER: Shortcut[] = [
    { keys: ['Space'], what: 'Hand while held' },
    { keys: ['Shift', 'drag'], what: 'Keep angles at 45 degrees and shapes square' },
    { keys: ['Alt', 'drag'], what: 'Drag a copy, or draw from the center' },
    { keys: ['Shift', 'click'], what: 'Add to the selection, the bucket inks the stroke' },
    { keys: ['Alt', 'click'], what: 'Eyedropper styles the selection' },
    { keys: ['Ctrl', 'drag'], what: 'Pull a corner out of a segment' },
    { keys: ['Ctrl', 'wheel'], what: 'Zoom around the pointer, the frames in the timeline' },
    { keys: ['Double click'], what: 'Enter a group or a symbol, type into text, pin a joint' },
    { keys: ['Alt', 'drag joint'], what: 'Turn only the bone a joint sits on' }
  ];

  // the commands that have a key, in the groups of the command list, the keys in use
  const groups = $derived.by(() => {
    const out: { name: string; items: Shortcut[] }[] = [];
    for (const cmd of COMMANDS) {
      if (cmd.dev && !import.meta.env.DEV) continue;
      const keys = keysOf(cmd.id, $preferences.shortcuts);
      if (keys.length === 0) continue;
      let group = out.find((g) => g.name === cmd.group);
      if (!group) {
        group = { name: cmd.group, items: [] };
        out.push(group);
      }
      group.items.push({ keys: keys.map(keyLabel), what: cmd.label });
    }
    out.push({ name: 'Pointer', items: POINTER });
    return out;
  });

  function edit() {
    dialog.set({ kind: 'preferences', category: 'shortcuts' });
  }
</script>

<Dialog title="Keyboard shortcuts" description="The keys the editor listens to, as they are set now." width={760} {onclose}>
  <div class="columns">
    {#each groups as group (group.name)}
      <section class="group">
        <h3 class="group-name">{group.name}</h3>
        {#each group.items as item, n (n)}
          <div class="row">
            <span class="keys">
              {#each item.keys as combo, k (k)}
                {#if k > 0}<span class="or">or</span>{/if}
                {#each combo.split(/\+(?=.)/) as key, i (i)}
                  {#if i > 0}<span class="plus">+</span>{/if}<kbd>{key}</kbd>
                {/each}
              {/each}
            </span>
            <span class="what">{item.what}</span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
  {#snippet footer()}
    <button class="dialog-btn" onclick={edit}>Change keys...</button>
    <button class="dialog-btn" onclick={onclose}>Close</button>
  {/snippet}
</Dialog>

<style>
  .columns {
    columns: 2;
    column-gap: 28px;
  }

  .group {
    break-inside: avoid;
    margin-bottom: 14px;
  }

  .group-name {
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 24px;
    padding: 2px 0;
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 150px;
    flex-wrap: wrap;
  }

  .plus,
  .or {
    font-size: 10px;
    color: var(--text-muted);
  }

  .or {
    margin: 0 3px;
  }

  .what {
    font-size: 11.5px;
    color: var(--text-secondary);
    line-height: 1.4;
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

  @media (max-width: 560px) {
    .columns {
      columns: 1;
    }
  }
</style>
