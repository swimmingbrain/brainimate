<script lang="ts">
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import Slider from '../Slider.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Layer, TransitionKind } from '$lib/core/types';
  import { PRESETS, TRANSITIONS, cameraLayerOf, type PresetKind } from '$lib/anim/camera';
  import { docVersion, editor } from '$lib/editor/editor';
  import {
    addCamera,
    applyPreset,
    cameraShots,
    cameraView,
    focusSelection,
    keyCamera,
    sceneDepth,
    setCamera,
    setCameraEase,
    setParallax,
    setTransition,
    toggleCameraView
  } from '$lib/editor/camera';
  import { cameraKeyAt } from '$lib/anim/camera';
  import { goToFrame } from '$lib/anim/playback';
  import { frame, selection } from '$lib/stores/app';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { selectTool } from '$lib/tools';

  // the camera of the video: where it looks at the playhead, how it gets to the next keyframe, how a
  // new shot starts, the moves to put down in one go and how far each layer follows it

  const EASES = [
    { value: 'hold', label: 'Hold, no move' },
    { value: 'linear', label: 'Linear' },
    { value: 'in', label: 'Ease in' },
    { value: 'out', label: 'Ease out' },
    { value: 'inout', label: 'Ease in and out' },
    { value: 'cubic-inout', label: 'Cinematic, strong in and out' },
    { value: 'quad-out', label: 'Quick start, soft stop' },
    { value: 'back-out', label: 'Overshoot a little' }
  ];
  const PRESET_EASES = [{ value: '', label: 'The preset decides' }, ...EASES.filter((e) => e.value !== 'hold')];
  const SHOT = [{ value: 'none', label: 'No new shot' }, ...TRANSITIONS.map((t) => ({ value: t.kind, label: t.label }))];
  const COLORS = [
    { value: '#000000', label: 'Black' },
    { value: '#ffffff', label: 'White' },
    { value: '#1d1b19', label: 'Comic ink' },
    { value: '#e9e2d2', label: 'Old paper' }
  ];
  const DIRECTIONS = [
    { value: 'left', label: 'Pushes to the left' },
    { value: 'right', label: 'Pushes to the right' },
    { value: 'up', label: 'Pushes up' },
    { value: 'down', label: 'Pushes down' }
  ];
  const PREVIEW = [
    { value: 'auto', label: 'Faster while playing on a tablet' },
    { value: 'full', label: 'Always sharp' },
    { value: 'half', label: 'Always fast' }
  ];

  const cs = $derived.by(() => {
    void $docVersion;
    void $frame;
    const doc = editor.doc;
    const cam = editor.editStack.length === 0 ? cameraLayerOf(doc.layers) : null;
    if (!cam) return null;
    const at = editor.frame;
    const own = cam.keyframes.find((k) => k.frame === at) ?? null;
    const before = [...cam.keyframes].reverse().find((k) => k.frame <= at) ?? null;
    const values = cameraKeyAt(cam, at, doc.width, doc.height);
    return {
      cam,
      at,
      fps: doc.fps,
      values,
      keyed: !!own,
      ease: before?.tween ? before.tween.ease : 'hold',
      easeFrom: before?.frame ?? 0,
      transition: own?.camera?.transition ?? null
    };
  });

  // the layers that draw, top first like the timeline, with their parallax
  const depthRows = $derived.by(() => {
    void $docVersion;
    return [...editor.doc.layers]
      .reverse()
      .filter((l: Layer) => l.type === 'normal' || l.type === 'folder' || l.type === 'guide')
      .map((l) => ({ id: l.id, name: l.name, folder: l.type === 'folder', value: l.parallax ?? null, child: !!l.parent }));
  });

  const shots = $derived.by(() => {
    void $docVersion;
    return cameraShots();
  });

  let preset = $state<{ kind: PresetKind; seconds: number; strength: number; ease: string }>({
    kind: 'push',
    seconds: 3,
    strength: 1,
    ease: ''
  });
  const presetInfo = $derived(PRESETS.find((p) => p.kind === preset.kind)!);

  function pickPreset(kind: string) {
    const info = PRESETS.find((p) => p.kind === kind);
    if (info) preset = { ...preset, kind: info.kind, seconds: info.seconds };
  }

  const deg = (r: number) => (r * 180) / Math.PI;
  const rad = (d: number) => (d * Math.PI) / 180;
  const seconds = (frames: number, fps: number) => `${(frames / fps).toFixed(frames / fps < 10 ? 2 : 1)} s`;
</script>

<Panel>
  {#if !cs}
    <div class="intro">
      <Icon name="camera" size={22} />
      <p>A camera films the scene: it pans, zooms, turns, shakes by hand and cuts between shots. The video shows what it films.</p>
      {#if editor.editStack.length > 0}
        <p class="muted">Leave the symbol to work on the camera.</p>
      {:else}
        <button class="big" onclick={() => addCamera()}><Icon name="plus" size={14} /> Add a camera</button>
      {/if}
    </div>
  {:else}
    <div class="bar">
      <button class="chip" class:on={$cameraView} aria-pressed={$cameraView} onclick={toggleCameraView} title="The stage shows what the video shows">
        <Icon name="camera-view" size={16} /> Camera view
      </button>
      <button class="chip" onclick={() => selectTool('camera')} title="Drag the camera on the stage">
        <Icon name="camera" size={16} /> Tool
      </button>
    </div>

    <h3 class="section">
      Frame {cs.at + 1}
      <span class="tag" class:keyed={cs.keyed}>{cs.keyed ? 'keyframe' : 'between keyframes'}</span>
    </h3>
    <Field label="X">
      <NumberField value={cs.values.x} step={5} precision={0} unit=" px" label="Camera x" onchange={(v) => setCamera({ x: v })} oninput={(v) => setCamera({ x: v }, 'Move camera', 'camera-field')} />
    </Field>
    <Field label="Y">
      <NumberField value={cs.values.y} step={5} precision={0} unit=" px" label="Camera y" onchange={(v) => setCamera({ y: v })} oninput={(v) => setCamera({ y: v }, 'Move camera', 'camera-field')} />
    </Field>
    <Field label="Zoom" hint="100% shows the whole stage">
      <NumberField
        value={cs.values.zoom * 100}
        min={10}
        max={2000}
        step={5}
        precision={0}
        unit="%"
        label="Camera zoom"
        onchange={(v) => setCamera({ zoom: v / 100 }, 'Zoom camera')}
        oninput={(v) => setCamera({ zoom: v / 100 }, 'Zoom camera', 'camera-field')} />
    </Field>
    <Field label="Turn">
      <NumberField value={deg(cs.values.rotation)} step={1} precision={1} unit="°" label="Camera rotation" onchange={(v) => setCamera({ rotation: rad(v) }, 'Turn camera')} oninput={(v) => setCamera({ rotation: rad(v) }, 'Turn camera', 'camera-field')} />
    </Field>
    <Field label="Handheld" hint="How much it shakes, in pixels of the video">
      <Slider value={cs.values.shake} min={0} max={40} step={1} precision={0} unit=" px" label="Handheld shake" onchange={(v) => setCamera({ shake: v }, 'Handheld')} />
    </Field>
    <Field label="Walk bob" hint="The head going up and down with the steps">
      <Slider value={cs.values.bob} min={0} max={40} step={1} precision={0} unit=" px" label="Walk bob" onchange={(v) => setCamera({ bob: v }, 'Walk bob')} />
    </Field>
    <div class="buttons">
      <button class="btn" onclick={() => setCamera({ zoom: cs.values.zoom / 1.25 }, 'Zoom camera')} title="Zoom out"><Icon name="minus" size={14} /> Zoom</button>
      <button class="btn" onclick={() => setCamera({ zoom: cs.values.zoom * 1.25 }, 'Zoom camera')} title="Zoom in"><Icon name="plus" size={14} /> Zoom</button>
      <button class="btn" disabled={$selection.size === 0} onclick={focusSelection} title="Frame what is picked">Focus selection</button>
      <button class="btn" onclick={keyCamera} title="A keyframe here holding the camera as it is"><Icon name="keyframe" size={14} /> Key</button>
      <button
        class="btn"
        onclick={() => setCamera({ x: editor.doc.width / 2, y: editor.doc.height / 2, zoom: 1, rotation: 0, shake: 0, bob: 0 }, 'Reset camera')}
        title="Show the whole stage again">Reset</button>
    </div>

    <h3 class="section">Move to the next keyframe</h3>
    <Field label="Ease" hint="From the keyframe on frame {cs.easeFrom + 1}">
      <SelectField value={cs.ease} options={EASES.some((e) => e.value === cs.ease) ? EASES : [...EASES, { value: cs.ease, label: 'Custom curve' }]} label="Camera ease" onchange={(v) => setCameraEase(v === 'hold' ? null : v)} />
    </Field>

    <h3 class="section">New shot on this frame</h3>
    <Field label="Transition">
      <SelectField value={cs.transition?.kind ?? 'none'} options={SHOT} label="Transition" onchange={(v) => setTransition(v === 'none' ? null : (v as TransitionKind))} />
    </Field>
    {#if cs.transition && cs.transition.kind !== 'cut'}
      <Field label="Length" hint={seconds(cs.transition.duration, cs.fps)}>
        <NumberField
          value={cs.transition.duration}
          min={1}
          max={240}
          step={1}
          precision={0}
          unit=" f"
          label="Transition length in frames"
          onchange={(v) => setTransition(cs.transition!.kind, { duration: Math.round(v) })} />
      </Field>
      {#if cs.transition.kind === 'fade'}
        <Field label="Color">
          <SelectField value={cs.transition.color} options={COLORS.some((c) => c.value === cs.transition!.color) ? COLORS : [...COLORS, { value: cs.transition.color, label: cs.transition.color }]} label="Fade color" onchange={(v) => setTransition('fade', { color: v })} />
        </Field>
      {/if}
      {#if cs.transition.kind === 'slide'}
        <Field label="Direction">
          <SelectField value={cs.transition.direction} options={DIRECTIONS} label="Slide direction" onchange={(v) => setTransition('slide', { direction: v as 'left' | 'right' | 'up' | 'down' })} />
        </Field>
      {/if}
    {/if}

    <h3 class="section">Camera moves</h3>
    <Field label="Move">
      <SelectField value={preset.kind} options={PRESETS.map((p) => ({ value: p.kind, label: p.label }))} label="Camera move" onchange={pickPreset} />
    </Field>
    <Field label="Length">
      <NumberField value={preset.seconds} min={0.25} max={30} step={0.25} precision={2} unit=" s" label="Move length" onchange={(v) => (preset = { ...preset, seconds: v })} />
    </Field>
    <Field label="Strength">
      <Slider value={preset.strength} min={0.25} max={3} step={0.05} precision={2} label="Move strength" onchange={(v) => (preset = { ...preset, strength: v })} />
    </Field>
    <Field label="Ease">
      <SelectField value={preset.ease} options={PRESET_EASES} label="Move ease" onchange={(v) => (preset = { ...preset, ease: v })} />
    </Field>
    {#if presetInfo.needs}
      <p class="note">{presetInfo.needs === 'track' ? 'Follows what is picked as it moves.' : 'Pulls focus to what is picked.'}</p>
    {/if}
    <div class="buttons">
      <button class="btn primary" onclick={() => applyPreset(preset)}>Put down from frame {cs.at + 1}</button>
    </div>

    <h3 class="section with-action">
      <span>Depth</span>
      <button class="link" onclick={sceneDepth} title="Background 0.3, midground 0.65, characters 1, foreground 1.4, bubbles 0">Comic layers</button>
    </h3>
    <p class="note">1 follows the camera, less is further back and moves slower, more is in front, 0 stays on the screen.</p>
    {#each depthRows as row (row.id)}
      <Field label={row.child ? `· ${row.name}` : row.name}>
        <NumberField
          value={row.value ?? 1}
          min={0}
          max={4}
          step={0.05}
          precision={2}
          label="Parallax of {row.name}"
          onchange={(v) => setParallax(row.id, v)}
          oninput={(v) => setParallax(row.id, v, `parallax-${row.id}`)} />
      </Field>
    {/each}

    {#if shots.length > 0}
      <h3 class="section">Shots</h3>
      <div class="shots">
        {#each shots as shot (shot.frame)}
          <button class="shot" class:here={shot.frame === cs.at} onclick={() => goToFrame(shot.frame)}>
            <span>{shot.name}</span>
            <span class="muted">{shot.kind ?? 'start'} · {seconds(shot.frame, cs.fps)}</span>
          </button>
        {/each}
      </div>
    {/if}

    <h3 class="section">Preview</h3>
    <Field label="Camera view" hint="The export always draws at full size">
      <SelectField value={$preferences.stage.preview} options={PREVIEW} label="Camera view quality" onchange={(v) => setGroup('stage', { preview: v === 'full' || v === 'half' ? v : 'auto' })} />
    </Field>
    <Field label="Layer visible">
      <ToggleField value={cs.cam.visible} label="Camera on" onchange={() => editor.commit('Camera on or off', (d) => {
        const c = d.layers.find((l) => l.type === 'camera');
        if (c) c.visible = !c.visible;
      })} />
    </Field>
  {/if}
</Panel>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .muted {
    color: var(--text-muted);
  }

  .big {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px;
    font-weight: 600;
    color: #111;
    background: var(--accent);
    border-radius: 6px;
  }

  .bar {
    display: flex;
    gap: 6px;
    padding: 2px 8px 6px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .chip.on {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
  }

  .section {
    margin: 10px 8px 6px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .with-action {
    justify-content: space-between;
  }

  .tag {
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  .tag.keyed {
    color: var(--accent);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 8px;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 34px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .btn:disabled {
    opacity: 0.5;
  }

  .btn.primary {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .link {
    font-family: var(--font-ui);
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
    color: var(--accent);
  }

  .note {
    padding: 0 10px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .shots {
    display: flex;
    flex-direction: column;
    padding: 0 6px;
  }

  .shot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 36px;
    padding: 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
    border-radius: 4px;
  }

  .shot.here {
    background: var(--accent-dim);
    color: var(--text-primary);
  }
</style>
