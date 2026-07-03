<script lang="ts">
  // nine dots on a box like illustrator, the picked one is where the position is read and the box turns
  let { value, onchange }: { value: { x: number; y: number }; onchange: (value: { x: number; y: number }) => void } =
    $props();

  const STEPS = [0, 0.5, 1];
  const NAMES = ['top left', 'top', 'top right', 'left', 'middle', 'right', 'bottom left', 'bottom', 'bottom right'];
</script>

<div class="ref" role="radiogroup" aria-label="Reference point">
  {#each STEPS as y, row (y)}
    {#each STEPS as x, col (x)}
      <button
        class="dot"
        class:on={value.x === x && value.y === y}
        role="radio"
        aria-checked={value.x === x && value.y === y}
        aria-label={NAMES[row * 3 + col]}
        title={NAMES[row * 3 + col]}
        onclick={() => onchange({ x, y })}><span></span></button>
    {/each}
  {/each}
</div>

<style>
  .ref {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 14px);
    grid-template-rows: repeat(3, 14px);
    width: 42px;
    height: 42px;
    flex-shrink: 0;
  }

  /* the box the dots sit on */
  .ref::before {
    content: '';
    position: absolute;
    inset: 6px;
    border: 1px solid var(--border);
    pointer-events: none;
  }

  .dot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dot span {
    width: 6px;
    height: 6px;
    background: var(--bg-surface);
    border: 1px solid var(--text-muted);
  }

  .dot:hover span {
    border-color: var(--text-primary);
  }

  .dot.on span {
    background: var(--accent);
    border-color: var(--accent);
  }
</style>
