<script lang="ts">
  import Dialog from '../Dialog.svelte';

  // a yes or no question, the dialog store hands in the words and what yes does
  let {
    title,
    message,
    confirm,
    danger = false,
    onconfirm,
    onclose
  }: {
    title: string;
    message: string;
    confirm: string;
    danger?: boolean;
    onconfirm: () => void;
    onclose: () => void;
  } = $props();

  // the dialog closes first, so what yes does may open another one
  function yes() {
    const run = onconfirm;
    onclose();
    run();
  }
</script>

<Dialog {title} width={380} {onclose}>
  <p class="message">{message}</p>
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
    <button
      class="dialog-btn primary"
      class:danger
      onclick={yes}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          yes();
        }
      }}>{confirm}</button>
  {/snippet}
</Dialog>

<style>
  .message {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-secondary);
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

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover {
    background: var(--accent-hover);
  }

  .dialog-btn.danger {
    background: var(--error);
    border-color: var(--error);
    color: #111;
  }

  .dialog-btn.danger:hover {
    background: var(--error);
    filter: brightness(1.1);
  }
</style>
