<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import { editor } from '$lib/editor/editor';
  import { convertToSymbol, type Registration } from '$lib/editor/symbols';
  import { nextSymbolName } from '$lib/core/library';

  let { onclose }: { onclose: () => void } = $props();

  const CHOICES: { value: Registration; label: string }[] = [
    { value: 'center', label: 'Center' },
    { value: 'topleft', label: 'Top left' }
  ];

  let name = $state(nextSymbolName(editor.doc.symbols));
  let registration = $state<Registration>('center');

  function apply() {
    if (!name.trim()) return;
    onclose();
    convertToSymbol(name, registration);
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

<Dialog title="Convert to symbol" description="The selection becomes a symbol you can place again." width={380} {onclose}>
  <label class="row">
    <span class="label">Name</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="text"
      bind:value={name}
      spellcheck="false"
      aria-label="Symbol name"
      autofocus
      {onkeydown}
      onfocus={(e) => e.currentTarget.select()} />
  </label>
  <div class="row">
    <span class="label">Registration</span>
    <div class="choices" role="radiogroup" aria-label="Registration">
      {#each CHOICES as choice (choice.value)}
        <button
          class="choice"
          class:on={registration === choice.value}
          role="radio"
          aria-checked={registration === choice.value}
          onclick={() => (registration = choice.value)}>
          <span class="glyph" class:center={choice.value === 'center'}></span>
          {choice.label}
        </button>
      {/each}
    </div>
  </div>
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
    <button class="dialog-btn primary" onclick={apply} disabled={!name.trim()}>Convert</button>
  {/snippet}
</Dialog>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .label {
    flex: 0 0 90px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .text {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    font-family: var(--font-ui);
    font-size: 12.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    outline: none;
  }

  .text:focus {
    border-color: var(--accent);
  }

  .choices {
    display: flex;
    gap: 4px;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .choice:hover {
    color: var(--text-primary);
  }

  .choice.on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  /* a small square with the point marked where the origin goes */
  .glyph {
    position: relative;
    width: 12px;
    height: 12px;
    border: 1px solid currentColor;
  }

  .glyph::after {
    content: '';
    position: absolute;
    left: -2px;
    top: -2px;
    width: 4px;
    height: 4px;
    background: currentColor;
  }

  .glyph.center::after {
    left: 3px;
    top: 3px;
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
</style>
