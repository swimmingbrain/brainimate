<script lang="ts">
  import Field from '../Field.svelte';
  import Slider from '../Slider.svelte';
  import ToggleField from '../ToggleField.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { docVersion, editor } from '$lib/editor/editor';
  import { addToast } from '$lib/stores/app';
  import { BROW_STYLES, EYE_SHAPES, HAIR_STYLES, NOSE_SHAPES, seeded, type FaceStyle, type HairStyle } from '$lib/character/model';
  import { GLASSES, HATS } from '$lib/character/views';
  import type { CharacterModel } from '$lib/character/views';
  import {
    BAGS,
    BEARDS,
    BODY_TYPES,
    BOTTOMS,
    CLOTH_COLORS,
    EYE_COLORS,
    FACE_SHAPES,
    HAIR_COLORS,
    JEWELRY,
    OUTFITS,
    SHOES,
    SKIN_TONES,
    TOPS,
    randomLook,
    type Identity
  } from '$lib/character/wardrobe';
  import { applyLook, applyOutfit, lookLocked, modelHere, setBodyType, setIdentity, setLocked, setModel } from '$lib/editor/turn';
  import { duplicateCharacter, renameCharacter } from '$lib/editor/character';
  import { library, loadLibrary, saveCharacter, setMain } from '$lib/character/library';

  // the character creator: nine short pages, each a tap away, every change shows on the stage at once and
  // holds for every side the character is seen from

  let { id }: { id: string } = $props();

  type Page = 'body' | 'face' | 'hair' | 'top' | 'bottom' | 'shoes' | 'extras' | 'colors' | 'save';
  const PAGES: { id: Page; label: string }[] = [
    { id: 'body', label: '1 Body' },
    { id: 'face', label: '2 Face' },
    { id: 'hair', label: '3 Hair' },
    { id: 'top', label: '4 Tops' },
    { id: 'bottom', label: '5 Bottoms' },
    { id: 'shoes', label: '6 Shoes' },
    { id: 'extras', label: '7 Extras' },
    { id: 'colors', label: '8 Colors' },
    { id: 'save', label: '9 Save' }
  ];
  let page = $state<Page>('body');
  let busy = $state(false);
  let name = $state('');

  const model = $derived.by(() => {
    void $docVersion;
    return modelHere(id);
  });
  const ident = $derived(model?.identity ?? null);
  const locked = $derived.by(() => {
    void $docVersion;
    return lookLocked(id);
  });
  const info = $derived.by(() => {
    void $docVersion;
    return editor.doc.layers.find((l) => l.id === id)?.character ?? null;
  });
  const entry = $derived(info ? ($library.find((m) => m.character === info.id) ?? null) : null);

  function ident$(change: Partial<Identity>, key?: string) {
    setIdentity(id, change, key);
  }
  function face$(change: Partial<FaceStyle>, key?: string) {
    if (model) setModel(id, { face: { ...model.face, ...change } }, key ? `face-${id}-${key}` : undefined, 'Face');
  }
  function colors$(change: Partial<CharacterModel['colors']>) {
    if (model) setModel(id, { colors: { ...model.colors, ...change } }, undefined, 'Colors');
  }
  function surprise(kind: 'look' | 'outfit') {
    if (!ident || !model) return;
    const look = randomLook(ident.type, seeded(Math.floor(Math.random() * 1e6)));
    if (kind === 'look') applyLook(id, look);
    else setModel(id, { identity: { ...ident, top: look.identity.top, accent: look.identity.accent, bottom: look.identity.bottom, shoes: look.identity.shoes, sole: look.identity.sole }, colors: { ...model.colors, shirt: look.colors.shirt, pants: look.colors.pants, shoes: look.colors.shoes } }, undefined, 'Outfit');
  }

  async function keep(slot?: 1 | 2) {
    busy = true;
    try {
      const m = await saveCharacter(editor.doc, id);
      if (!m) return;
      if (slot) {
        await setMain(m.id, slot);
        // a main character keeps its look
        if (!locked) setLocked(id, true);
        await saveCharacter(editor.doc, id);
        await loadLibrary();
        addToast(`${m.name} is main character ${slot}, saved in the library with its look locked`, 'success', 3000);
      } else addToast(`${m.name} saved to the library`, 'success', 2000);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The character could not be saved', 'error');
    } finally {
      busy = false;
    }
  }

  const HAIR_GROUPS = [
    { label: 'Short', items: HAIR_STYLES.filter((h) => h.length === 'short') },
    { label: 'Medium', items: HAIR_STYLES.filter((h) => h.length === 'medium') },
    { label: 'Long', items: HAIR_STYLES.filter((h) => h.length === 'long') }
  ];
</script>

{#if model && ident}
  <div class="pages" role="tablist" aria-label="Creator pages">
    {#each PAGES as p (p.id)}
      <button class="page" class:on={page === p.id} role="tab" aria-selected={page === p.id} onclick={() => (page = p.id)}>{p.label}</button>
    {/each}
  </div>
  {#if locked && page !== 'save'}
    <p class="note warn">The look is locked, this is a main character. Unlock it under 9 Save to change it.</p>
  {/if}

  {#if page === 'body'}
    <div class="grid three">
      {#each BODY_TYPES as t (t.id)}
        <button class="pill" class:on={ident.type === t.id} onclick={() => setBodyType(id, t.id)}>{t.label}</button>
      {/each}
    </div>
    <Field label="Height">
      <Slider value={Math.round((model.height / editor.doc.height) * 100)} min={15} max={95} step={1} precision={0} unit="%" label="Body height" onchange={(v) => setModel(id, { height: Math.round((editor.doc.height * v) / 100) }, `h-${id}`, 'Height')} />
    </Field>
    <Field label="Head">
      <Slider value={model.headSize} min={0.8} max={1.35} step={0.01} precision={2} label="Head size" onchange={(v) => setModel(id, { headSize: v }, `hs-${id}`, 'Head size')} />
    </Field>
    <Field label="Shoulders">
      <Slider value={ident.shoulders} min={0.8} max={1.25} step={0.01} precision={2} label="Shoulder width" onchange={(v) => ident$({ shoulders: v }, 'sh')} />
    </Field>
    <Field label="Chest" hint="Stylized, from the side most">
      <Slider value={ident.bust} min={0} max={1} step={0.05} precision={2} label="Chest" onchange={(v) => ident$({ bust: v }, 'bust')} />
    </Field>
    <Field label="Waist">
      <Slider value={ident.waist} min={0.75} max={1.25} step={0.01} precision={2} label="Waist" onchange={(v) => ident$({ waist: v }, 'waist')} />
    </Field>
    <Field label="Hips">
      <Slider value={ident.hips} min={0.8} max={1.3} step={0.01} precision={2} label="Hips" onchange={(v) => ident$({ hips: v }, 'hips')} />
    </Field>
    <Field label="Legs">
      <Slider value={ident.legs} min={0.9} max={1.1} step={0.01} precision={2} label="Leg length" onchange={(v) => ident$({ legs: v }, 'legs')} />
    </Field>
    <div class="grid three">
      {#each ['slim', 'regular', 'broad'] as b (b)}
        <button class="pill" class:on={model.build === b} onclick={() => setModel(id, { build: b as CharacterModel['build'] }, undefined, 'Build')}>{b === 'slim' ? 'Slim' : b === 'regular' ? 'Regular' : 'Broad'}</button>
      {/each}
    </div>
  {:else if page === 'face'}
    <p class="label">Face shape</p>
    <div class="grid">
      {#each FACE_SHAPES as f (f.id)}
        <button class="pill" class:on={ident.faceShape === f.id} onclick={() => ident$({ faceShape: f.id })}>{f.label}</button>
      {/each}
    </div>
    <p class="label">Skin</p>
    <div class="swatches">
      {#each SKIN_TONES as t (t.color)}
        <button class="swatch" class:on={model.colors.skin === t.color} style="background: {t.color}" aria-label={t.name} onclick={() => colors$({ skin: t.color })}></button>
      {/each}
    </div>
    <p class="label">Eyes</p>
    <div class="grid">
      {#each EYE_SHAPES as e (e.id)}
        <button class="pill" class:on={model.face.eyes === e.id} onclick={() => face$({ eyes: e.id })}>{e.label}</button>
      {/each}
    </div>
    <div class="swatches">
      {#each EYE_COLORS as e (e.color)}
        <button class="swatch" class:on={ident.eyeColor === e.color} style="background: {e.color === 'ink' ? '#1d1b19' : e.color}" aria-label="{e.name} eyes" onclick={() => ident$({ eyeColor: e.color })}></button>
      {/each}
    </div>
    <p class="label">Brows</p>
    <div class="grid">
      {#each BROW_STYLES as b (b.id)}
        <button class="pill" class:on={model.face.brows === b.id} onclick={() => face$({ brows: b.id })}>{b.label}</button>
      {/each}
    </div>
    <Field label="Nose" hint="Off: no nose at all">
      <ToggleField value={model.face.nose} label="Show nose" onchange={(v) => face$({ nose: v })} />
    </Field>
    {#if model.face.nose}
      <div class="grid">
        {#each NOSE_SHAPES as n (n.id)}
          <button class="pill" class:on={model.face.noseShape === n.id} onclick={() => face$({ noseShape: n.id })}>{n.label}</button>
        {/each}
      </div>
    {/if}
    <Field label="Mouth width">
      <Slider value={model.face.mouthWidth} min={0.5} max={1.6} step={0.05} precision={2} unit="×" label="Mouth width" onchange={(v) => face$({ mouthWidth: v }, 'mw')} />
    </Field>
    <p class="label">Beard</p>
    <div class="grid">
      {#each BEARDS as b (b.id)}
        <button class="pill" class:on={ident.beard === b.id} onclick={() => ident$({ beard: b.id })}>{b.label}</button>
      {/each}
    </div>
    <Field label="Freckles">
      <ToggleField value={ident.freckles} label="Freckles" onchange={(v) => ident$({ freckles: v })} />
    </Field>
    <Field label="Blush">
      <ToggleField value={ident.blush} label="Blush" onchange={(v) => ident$({ blush: v })} />
    </Field>
    <Field label="Lipstick">
      <ToggleField value={ident.lipstick} label="Lipstick" onchange={(v) => ident$({ lipstick: v })} />
    </Field>
    {#if ident.lipstick}
      <div class="swatches">
        {#each ['#a4504a', '#8e3b44', '#b36a63', '#c08b8a', '#6e3138'] as l (l)}
          <button class="swatch" class:on={ident.lipColor === l} style="background: {l}" aria-label="Lip color {l}" onclick={() => ident$({ lipColor: l })}></button>
        {/each}
      </div>
    {/if}
  {:else if page === 'hair'}
    {#each HAIR_GROUPS as g (g.label)}
      <p class="label">{g.label}</p>
      <div class="grid">
        {#each g.items as h (h.id)}
          <button class="pill" class:on={model.hair === h.id} onclick={() => setModel(id, { hair: h.id as HairStyle }, undefined, 'Hair')}>{h.label}</button>
        {/each}
      </div>
    {/each}
    <p class="label">Hair color</p>
    <div class="swatches named">
      {#each HAIR_COLORS as h (h.color)}
        <button class="swatch big" class:on={model.colors.hair === h.color} style="background: {h.color}" aria-label="{h.name} hair" title={h.name} onclick={() => colors$({ hair: h.color })}></button>
      {/each}
    </div>
  {:else if page === 'top'}
    <div class="grid three">
      {#each TOPS as t (t.id)}
        <button class="pill" class:on={ident.top === t.id} onclick={() => ident$({ top: t.id })}>{t.label}</button>
      {/each}
    </div>
    <p class="label">Color</p>
    <div class="swatches">
      {#each CLOTH_COLORS as c (c.color)}
        <button class="swatch" class:on={model.colors.shirt === c.color} style="background: {c.color}" aria-label="{c.name} top" onclick={() => colors$({ shirt: c.color })}></button>
      {/each}
    </div>
    <p class="label">Second color: collar, cuffs, hood, the shirt under a jacket</p>
    <div class="swatches">
      {#each CLOTH_COLORS as c (c.color)}
        <button class="swatch" class:on={ident.accent === c.color} style="background: {c.color}" aria-label="{c.name} second color" onclick={() => ident$({ accent: c.color })}></button>
      {/each}
    </div>
  {:else if page === 'bottom'}
    <div class="grid three">
      {#each BOTTOMS as b (b.id)}
        <button class="pill" class:on={ident.bottom === b.id} onclick={() => ident$({ bottom: b.id })}>{b.label}</button>
      {/each}
    </div>
    <p class="label">Color</p>
    <div class="swatches">
      {#each CLOTH_COLORS as c (c.color)}
        <button class="swatch" class:on={model.colors.pants === c.color} style="background: {c.color}" aria-label="{c.name} bottom" onclick={() => colors$({ pants: c.color })}></button>
      {/each}
    </div>
  {:else if page === 'shoes'}
    <div class="grid three">
      {#each SHOES as s (s.id)}
        <button class="pill" class:on={ident.shoes === s.id} onclick={() => ident$({ shoes: s.id })}>{s.label}</button>
      {/each}
    </div>
    <p class="label">Color</p>
    <div class="swatches">
      {#each CLOTH_COLORS as c (c.color)}
        <button class="swatch" class:on={model.colors.shoes === c.color} style="background: {c.color}" aria-label="{c.name} shoes" onclick={() => colors$({ shoes: c.color })}></button>
      {/each}
    </div>
    <p class="label">Sole</p>
    <div class="swatches">
      {#each CLOTH_COLORS.slice(0, 8).concat(CLOTH_COLORS.slice(19)) as c (c.color)}
        <button class="swatch" class:on={ident.sole === c.color} style="background: {c.color}" aria-label="{c.name} sole" onclick={() => ident$({ sole: c.color })}></button>
      {/each}
    </div>
  {:else if page === 'extras'}
    <p class="label">Glasses</p>
    <div class="grid three">
      {#each GLASSES as g (g.id)}
        <button class="pill" class:on={model.glasses === g.id} onclick={() => setModel(id, { glasses: g.id }, undefined, 'Glasses')}>{g.label}</button>
      {/each}
    </div>
    <p class="label">Hat</p>
    <div class="grid three">
      {#each HATS as h (h.id)}
        <button class="pill" class:on={model.hat === h.id} onclick={() => setModel(id, { hat: h.id }, undefined, 'Hat')}>{h.label}</button>
      {/each}
    </div>
    {#if model.hat !== 'none'}
      <div class="swatches">
        {#each CLOTH_COLORS as c (c.color)}
          <button class="swatch" class:on={ident.hatColor === c.color} style="background: {c.color}" aria-label="{c.name} hat" onclick={() => ident$({ hatColor: c.color })}></button>
        {/each}
      </div>
    {/if}
    <Field label="Watch">
      <ToggleField value={ident.watch} label="Watch" onchange={(v) => ident$({ watch: v })} />
    </Field>
    <p class="label">Bag</p>
    <div class="grid three">
      {#each BAGS as b (b.id)}
        <button class="pill" class:on={ident.bag === b.id} onclick={() => ident$({ bag: b.id })}>{b.label}</button>
      {/each}
    </div>
    <p class="label">Jewelry</p>
    <div class="grid">
      {#each JEWELRY as jw (jw.id)}
        <button class="pill" class:on={ident.jewelry === jw.id} onclick={() => ident$({ jewelry: jw.id })}>{jw.label}</button>
      {/each}
    </div>
    <p class="label">Color of watch, bag and jewelry</p>
    <div class="swatches">
      {#each ['#c4a15e', '#b5b2ac', '#5e4433', '#222124', '#a8433a', '#4e6d6a', '#2b3348', '#ece8df'] as x (x)}
        <button class="swatch" class:on={ident.extra === x} style="background: {x}" aria-label="Extra color {x}" onclick={() => ident$({ extra: x })}></button>
      {/each}
    </div>
  {:else if page === 'colors'}
    <div class="buttons">
      <button class="btn primary" onclick={() => surprise('outfit')}>Random outfit</button>
      <button class="btn" onclick={() => surprise('look')}>Whole new look</button>
    </div>
    <p class="label">Outfits</p>
    <div class="outfits">
      {#each OUTFITS.filter((o) => o.for === 'any' || o.for === ident.type || ident.type === 'custom') as o (o.label)}
        <button class="outfit" onclick={() => applyOutfit(id, o)}>
          <span class="dots"><span style="background: {o.shirt}"></span><span style="background: {o.pants}"></span><span style="background: {o.shoeColor}"></span></span>
          {o.label}
        </button>
      {/each}
    </div>
    <p class="label">Outline</p>
    <div class="swatches">
      {#each ['#1d1b19', '#3a3734', '#2b3348', '#4f3529'] as x (x)}
        <button class="swatch" class:on={model.colors.outline === x} style="background: {x}" aria-label="Outline {x}" onclick={() => colors$({ outline: x })}></button>
      {/each}
    </div>
  {:else if page === 'save'}
    <Field label="Name">
      <input class="text" placeholder={info?.name} bind:value={name} aria-label="Character name" onkeydown={(e) => e.key === 'Enter' && name.trim() && renameCharacter(id, name)} />
    </Field>
    <div class="buttons">
      <button class="btn" disabled={!name.trim()} onclick={() => renameCharacter(id, name)}>Rename</button>
      <button class="btn" onclick={() => duplicateCharacter(id)}><Icon name="duplicate" size={14} /> Duplicate</button>
      <button class="btn primary" disabled={busy} onclick={() => keep()}><Icon name="save" size={14} /> Save to library</button>
    </div>
    <p class="label">Main characters of the series</p>
    <div class="buttons">
      <button class="btn" class:on={entry?.main === 1} disabled={busy} onclick={() => keep(1)}>{entry?.main === 1 ? 'Main character 1' : 'Make main character 1'}</button>
      <button class="btn" class:on={entry?.main === 2} disabled={busy} onclick={() => keep(2)}>{entry?.main === 2 ? 'Main character 2' : 'Make main character 2'}</button>
    </div>
    <Field label="Lock the look" hint="Hair, clothes, face and body stay as they are">
      <ToggleField value={locked} label="Lock the look" onchange={(v) => setLocked(id, v)} />
    </Field>
    <p class="note">A main character is saved in the library and its look is locked, so it looks the same in every project and episode. Insert it from the top of this panel. Moves, moods and turns still work on it.</p>
  {/if}
{/if}

<style>
  .pages {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding: 4px 8px 8px;
  }

  .page {
    min-height: 36px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .page.on {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .label {
    margin: 8px 10px 4px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .note {
    padding: 0 10px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .warn {
    color: var(--accent);
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 8px 6px;
  }

  .grid.three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pill,
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 36px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .pill.on,
  .btn.on {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
  }

  .btn.primary {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 8px 8px;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 5px;
    padding: 2px 8px 6px;
  }

  .swatches.named {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .swatch {
    aspect-ratio: 1;
    min-height: 30px;
    border: 1px solid var(--border);
    border-radius: 50%;
  }

  .swatch.big {
    min-height: 40px;
  }

  .swatch.on {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .outfits {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 2px 8px 8px;
  }

  .outfit {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 10px;
    font-size: 12px;
    text-align: left;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .dots {
    display: flex;
    gap: 3px;
  }

  .dots span {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
  }

  .text {
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    color: var(--text-primary);
    background: var(--bg-input, var(--bg-elevated));
    border: 1px solid var(--border);
    border-radius: 6px;
  }
</style>
