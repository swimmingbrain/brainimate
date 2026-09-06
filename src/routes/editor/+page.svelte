<script lang="ts">
  import App from '$lib/ui/App.svelte';
  import { docName } from '$lib/stores/app';
</script>

<svelte:head>
  <title>{$docName} - brainIMATE</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<App />
