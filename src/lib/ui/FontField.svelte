<script lang="ts">
  import { canLoadSystemFonts, fontFamilies, loadSystemFonts, type FontSource } from '$lib/core/fonts';
  import { addToast } from '$lib/stores/app';

  // the font families grouped by where they come from, the system ones load on request
  let { value, onchange }: { value: string; onchange: (family: string) => void } = $props();

  const SYSTEM = '__system';
  const GROUPS: { source: FontSource; label: string }[] = [
    { source: 'bundled', label: 'Fonts' },
    { source: 'user', label: 'Document fonts' },
    { source: 'system', label: 'System fonts' }
  ];

  let select = $state<HTMLSelectElement | null>(null);
  let loading = $state(false);

  const groups = $derived(
    GROUPS.map((g) => ({ ...g, families: $fontFamilies.filter((f) => f.source === g.source) })).filter(
      (g) => g.families.length > 0
    )
  );
  const known = $derived($fontFamilies.some((f) => f.name === value));
  const offerSystem = $derived(canLoadSystemFonts() && !$fontFamilies.some((f) => f.source === 'system'));

  async function system() {
    loading = true;
    try {
      const count = await loadSystemFonts();
      addToast(count === 1 ? '1 system font family' : `${count} system font families`, 'success');
    } catch {
      addToast('The system fonts could not be read', 'error');
    } finally {
      loading = false;
    }
  }

  function pick(next: string) {
    if (next === SYSTEM) {
      // the field shows the font it had while the list loads
      if (select) select.value = value;
      void system();
      return;
    }
    onchange(next);
  }
</script>

<select class="select" bind:this={select} {value} aria-label="Font" onchange={(e) => pick(e.currentTarget.value)}>
  {#if !known}
    <option value={value}>{value}</option>
  {/if}
  {#each groups as group (group.source)}
    <optgroup label={group.label}>
      {#each group.families as family (family.name)}
        <option value={family.name}>{family.name}</option>
      {/each}
    </optgroup>
  {/each}
  {#if offerSystem}
    <option value={SYSTEM} disabled={loading}>{loading ? 'Loading system fonts' : 'Load system fonts...'}</option>
  {/if}
</select>

<style>
  .select {
    width: 100%;
    padding: 3px 20px 3px 6px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    border-radius: 0;
    outline: none;
    cursor: pointer;
    appearance: none;
    background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
      linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
    background-position: calc(100% - 10px) 10px, calc(100% - 6px) 10px;
    background-size: 4px 4px, 4px 4px;
    background-repeat: no-repeat;
  }

  .select:hover {
    border-bottom-color: var(--accent);
  }

  .select:focus {
    border-color: var(--accent);
  }

  .select option,
  .select optgroup {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }
</style>
