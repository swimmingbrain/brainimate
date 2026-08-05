<script lang="ts">
  import Preferences from './dialogs/Preferences.svelte';
  import Shortcuts from './dialogs/Shortcuts.svelte';
  import About from './dialogs/About.svelte';
  import Confirm from './dialogs/Confirm.svelte';
  import ConvertSymbol from './dialogs/ConvertSymbol.svelte';
  import { addToast, dialog } from '$lib/stores/app';

  const READY = ['preferences', 'shortcuts', 'about', 'confirm', 'symbol'];

  function close() {
    dialog.set(null);
  }

  // dialogs that come with later work say so instead of opening nothing
  $effect(() => {
    const d = $dialog;
    if (d && !READY.includes(d.kind)) {
      addToast('Not there yet');
      dialog.set(null);
    }
  });
</script>

{#if $dialog}
  {#key $dialog}
    {#if $dialog.kind === 'preferences'}
      <Preferences category={$dialog.category} onclose={close} />
    {:else if $dialog.kind === 'shortcuts'}
      <Shortcuts onclose={close} />
    {:else if $dialog.kind === 'about'}
      <About onclose={close} />
    {:else if $dialog.kind === 'confirm'}
      <Confirm
        title={$dialog.title}
        message={$dialog.message}
        confirm={$dialog.confirm}
        danger={$dialog.danger}
        onconfirm={$dialog.onconfirm}
        onclose={close} />
    {:else if $dialog.kind === 'symbol'}
      <ConvertSymbol onclose={close} />
    {/if}
  {/key}
{/if}
