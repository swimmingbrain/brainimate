<script lang="ts">
  import Preferences from './dialogs/Preferences.svelte';
  import Shortcuts from './dialogs/Shortcuts.svelte';
  import About from './dialogs/About.svelte';
  import { addToast, dialog } from '$lib/stores/app';

  function close() {
    dialog.set(null);
  }

  // dialogs that come with later work say so instead of opening nothing
  $effect(() => {
    const d = $dialog;
    if (d && d.kind !== 'preferences' && d.kind !== 'shortcuts' && d.kind !== 'about') {
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
    {/if}
  {/key}
{/if}
