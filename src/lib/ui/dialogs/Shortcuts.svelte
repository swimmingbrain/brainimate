<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import { TOOL_INFO } from '$lib/tools';
  import { TOOL_IDS } from '$lib/tools/tool';

  let { onclose }: { onclose: () => void } = $props();

  interface Shortcut {
    keys: string[];
    what: string;
  }

  const tools: Shortcut[] = TOOL_IDS.filter((id) => TOOL_INFO[id].shortcut).map((id) => ({
    keys: TOOL_INFO[id].shortcut.split('+'),
    what: TOOL_INFO[id].name
  }));

  const groups: { name: string; items: Shortcut[] }[] = [
    {
      name: 'Tools',
      items: [
        ...tools,
        { keys: ['S'], what: 'Ink bottle, the bucket for strokes' },
        { keys: ['Space'], what: 'Hand while held' },
        { keys: ['Shift', 'click'], what: 'Bucket inks the stroke' },
        { keys: ['Alt', 'click'], what: 'Eyedropper styles the selection' }
      ]
    },
    {
      name: 'Colors',
      items: [
        { keys: ['X'], what: 'Fill or stroke in front' },
        { keys: ['Shift', 'X'], what: 'Swap fill and stroke' },
        { keys: ['D'], what: 'Black stroke and white fill' },
        { keys: ['/'], what: 'No color for the chip in front' }
      ]
    },
    {
      name: 'Timeline',
      items: [
        { keys: ['Enter'], what: 'Play and pause' },
        { keys: [',/.'], what: 'One frame back and forward' },
        { keys: ['Shift', ',/.'], what: 'First and last frame' },
        { keys: ['F5'], what: 'Insert frame' },
        { keys: ['Shift', 'F5'], what: 'Remove frame' },
        { keys: ['F6'], what: 'Insert keyframe' },
        { keys: ['F7'], what: 'Insert blank keyframe' },
        { keys: ['Shift', 'F6'], what: 'Clear keyframe' },
        { keys: ['Ctrl', 'Alt', 'C/V'], what: 'Copy and paste frames' },
        { keys: ['Alt', 'Shift', 'O'], what: 'Onion skin' },
        { keys: ['Ctrl', 'Wheel'], what: 'Zoom the frames' }
      ]
    },
    {
      name: 'Edit',
      items: [
        { keys: ['Ctrl', 'Z'], what: 'Undo' },
        { keys: ['Ctrl', 'Shift', 'Z'], what: 'Redo' },
        { keys: ['Ctrl', 'C/X/V'], what: 'Copy, cut, paste' },
        { keys: ['Ctrl', 'Shift', 'V'], what: 'Paste in place' },
        { keys: ['Ctrl', 'D'], what: 'Duplicate' },
        { keys: ['Ctrl', 'A'], what: 'Select all' },
        { keys: ['Ctrl', 'G'], what: 'Group' },
        { keys: ['Ctrl', 'Shift', 'G'], what: 'Ungroup' },
        { keys: ['Ctrl', 'B'], what: 'Break apart' },
        { keys: ['Ctrl', 'J'], what: 'Join paths' },
        { keys: ['Ctrl', 'Up/Down'], what: 'Bring forward, send backward' },
        { keys: ['Ctrl', 'Shift', 'Up/Down'], what: 'Bring to front, send to back' },
        { keys: ['F8'], what: 'Convert to symbol' },
        { keys: ['Ctrl', 'Shift', 'O'], what: 'Create outlines from text' },
        { keys: ['Delete'], what: 'Delete the selection' },
        { keys: ['Arrows'], what: 'Nudge 1 px, with Shift 10 px' },
        { keys: ['Double click'], what: 'Edit a symbol in place or type into text' },
        { keys: ['Esc'], what: 'Deselect, leave a symbol, or end the path being drawn' },
        { keys: ['Enter'], what: 'End the path being drawn' },
        { keys: ['Backspace'], what: 'Remove the last anchor while drawing' }
      ]
    },
    {
      name: 'View',
      items: [
        { keys: ['Ctrl', '='], what: 'Zoom in' },
        { keys: ['Ctrl', '-'], what: 'Zoom out' },
        { keys: ['Ctrl', '1'], what: 'Actual size' },
        { keys: ['Ctrl', '0'], what: 'Fit the stage in the window' },
        { keys: ['Ctrl', 'wheel'], what: 'Zoom around the pointer' },
        { keys: ['Ctrl', "'"], what: 'Grid' },
        { keys: ['Ctrl', 'R'], what: 'Rulers' },
        { keys: ['Ctrl', ';'], what: 'Guides' },
        { keys: ['Ctrl', 'U'], what: 'Smart guides' },
        { keys: ['Ctrl', 'L'], what: 'Library' }
      ]
    },
    {
      name: 'File',
      items: [
        { keys: ['Ctrl', 'N'], what: 'New document' },
        { keys: ['Ctrl', 'O'], what: 'Open' },
        { keys: ['Ctrl', 'S'], what: 'Save' },
        { keys: ['Ctrl', 'Shift', 'S'], what: 'Save as' },
        { keys: ['Ctrl', 'Shift', 'E'], what: 'Export' },
        { keys: ['Ctrl', ','], what: 'Preferences' }
      ]
    }
  ];
</script>

<Dialog title="Keyboard shortcuts" description="The keys the editor listens to." width={760} {onclose}>
  <div class="columns">
    {#each groups as group (group.name)}
      <section class="group">
        <h3 class="group-name">{group.name}</h3>
        {#each group.items as item}
          <div class="row">
            <span class="keys">
              {#each item.keys as key, i}
                {#if i > 0}<span class="plus">+</span>{/if}<kbd>{key}</kbd>
              {/each}
            </span>
            <span class="what">{item.what}</span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
  {#snippet footer()}
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
    flex: 0 0 124px;
    flex-wrap: wrap;
  }

  .plus {
    font-size: 10px;
    color: var(--text-muted);
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
