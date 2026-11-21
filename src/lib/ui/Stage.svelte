<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    activeLayer,
    activeTool,
    contextMenu,
    selection,
    addToast,
    anchorSelection,
    frameSelection,
    outlineMode,
    playing,
    stageSize,
    toolCursor,
    view,
    type View
  } from '$lib/stores/app';
  import { preferences, setGroup, type PasteboardShade, type Preferences } from '$lib/stores/preferences';
  import {
    fitView,
    isAutoFit,
    setAutoFit,
    setStageElement,
    setViewport,
    zoomAround,
    zoomForOpen
  } from '$lib/editor/view';
  import { editor, hover } from '$lib/editor/editor';
  import { invalidateStageCache, renderStage, setImageLoaded, type DimLevel } from '$lib/render/renderer';
  import { onionFrames } from '$lib/render/onion';
  import { pause } from '$lib/anim/playback';
  import { drawOverlay as drawEditorOverlay } from '$lib/render/overlay';
  import { currentTool, doubleClick, drawToolOverlay, keyDown, pointerDown, pointerMove, pointerUp } from '$lib/tools';
  import { coalescedEvents, makeEvent, type ToolEvent } from '$lib/tools/tool';
  import { pickForSelect, pickItem } from '$lib/tools/pick';
  import { stageMenu } from '$lib/editor/menus';
  import { select } from '$lib/editor/selection';
  import { pointerFactor } from '$lib/core/hit';
  import { finishGuideDrag, guideAt, guideState, guidesLocked, type GuideAxis } from '$lib/editor/guides';
  import { clearSnap, snapPoint } from '$lib/editor/snap';
  import { identity, multiply } from '$lib/core/mat';
  import { setFontLoaded } from '$lib/core/fonts';
  import { textEditing } from '$lib/editor/text';
  import TextEditor from './TextEditor.svelte';
  import { importFiles } from '$lib/editor/importer';
  import type { Mat, Vec } from '$lib/core/types';
  import { GestureTracker, pinchView, type GestureAction, type GesturePoint } from '$lib/editor/gestures';
  import { gestureOptions, penSeen, touchUi, withModifiers } from '$lib/editor/touch';
  import { previewScaleFor, showingCamera } from '$lib/editor/camera';
  import { drawSubtitles } from '$lib/render/subtitles';
  import { renderCameraFrame } from '$lib/render/camera';
  import { context as surfaceContext, sized as sizedSurface, type Surface } from '$lib/render/surface';

  const RULER = 20;
  // the tools that can grab a guide on the stage
  const GUIDE_TOOLS = ['select', 'direct', 'transform'];

  let host = $state<HTMLDivElement | null>(null);
  let content = $state<HTMLCanvasElement | null>(null);
  let overlay = $state<HTMLCanvasElement | null>(null);
  let spaceHeld = $state(false);
  let panning = $state(false);
  // the axis of the guide under the pointer or being dragged, for the cursor
  let guideCursor = $state<GuideAxis | null>(null);

  let contentCtx: CanvasRenderingContext2D | null = null;
  let overlayCtx: CanvasRenderingContext2D | null = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let panStart: { x: number; y: number; panX: number; panY: number } | null = null;
  let sized = false;
  // css pixels on the stage, the rulers mark where it is with two thin lines over the canvas
  let pointerAt = $state<{ x: number; y: number } | null>(null);

  // read once from the theme, the canvas cannot use css variables
  const colors = {
    pasteboard: '#111113',
    shadow: 'rgba(0, 0, 0, 0.5)',
    ruler: '#19191c',
    tick: '#5a5a62',
    label: '#85858e',
    border: '#2e2e33',
    accent: '#d19a66'
  };

  // the three greys of the theme the pasteboard can take
  const shades: Record<PasteboardShade, string> = { deep: '#111113', surface: '#19191c', elevated: '#212124' };
  const SHADE_VARS: Record<PasteboardShade, string> = {
    deep: 'var(--bg-deep)',
    surface: 'var(--bg-surface)',
    elevated: 'var(--bg-elevated)'
  };

  const cursor = $derived.by(() => {
    if (panning) return 'grabbing';
    if (spaceHeld || $activeTool === 'hand') return 'grab';
    if (guideCursor) return guideCursor === 'h' ? 'row-resize' : 'col-resize';
    return $toolCursor;
  });

  // the editor holds the dirty flags, the loop below reads them
  function markDirty() {
    editor.markAll();
  }

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    colors.pasteboard = read('--pasteboard', colors.pasteboard);
    shades.deep = read('--bg-deep', shades.deep);
    shades.surface = read('--bg-surface', shades.surface);
    shades.elevated = read('--bg-elevated', shades.elevated);
    colors.shadow = read('--stage-shadow', colors.shadow);
    colors.ruler = read('--stage-ruler', colors.ruler);
    colors.tick = read('--stage-ruler-tick', colors.tick);
    colors.label = read('--text-muted', colors.label);
    colors.border = read('--border', colors.border);
    colors.accent = read('--accent', colors.accent);
  }

  function resize() {
    if (!host || !content || !overlay) return;
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = window.devicePixelRatio || 1;
    for (const canvas of [content, overlay]) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    setViewport(width, height);
    if (!sized && width > 0 && height > 0) {
      // the first size the stage gets shows the document the way it opens
      sized = true;
      zoomForOpen();
    } else if (isAutoFit() && width > 0 && height > 0) {
      const size = get(stageSize);
      view.set(fitView(width, height, size.width, size.height));
    }
    markDirty();
  }

  // the ghosts around the playhead, none while playing or while fingers zoom, so both stay light
  function onionFor(prefs: Preferences) {
    const t = prefs.timeline;
    if (!t.onion || get(playing) || gesturing || (t.onionBefore === 0 && t.onionAfter === 0)) return null;
    const layers = editor.currentLayers();
    const at = editor.frame;
    const ghosts = onionFrames(layers, at, t.onionBefore, t.onionAfter, t.onionKeyframes, editor.length());
    if (ghosts.before.length === 0 && ghosts.after.length === 0) return null;
    return {
      options: {
        ...ghosts,
        beforeColor: t.onionBeforeColor,
        afterColor: t.onionAfterColor,
        outline: t.onionOutline,
        start: t.onionStart,
        step: t.onionStep
      },
      key: `${at}|${ghosts.before.join(',')}|${ghosts.after.join(',')}|${t.onionBeforeColor}|${t.onionAfterColor}|${t.onionOutline}|${t.onionStart}|${t.onionStep}`
    };
  }

  // the levels around an open symbol, each one without the instance that was opened in it
  function editLevels(): { base: Mat; dim: DimLevel[] } | null {
    const stack = editor.editStack;
    if (stack.length === 0) return null;
    const doc = editor.doc;
    const dim = stack.map((level, i) => {
      const below = i > 0 ? stack[i - 1] : null;
      return {
        layers: below ? (doc.symbols[below.symbolId]?.layers ?? []) : doc.layers,
        frame: level.frame,
        base: below ? below.base : identity(),
        skip: level.instanceId
      };
    });
    return { base: editor.base(), dim };
  }

  // the camera view: the stage shows what the video shows, drawn by the same function as the export.
  // while playing on a tablet it draws at half the pixels and is scaled up, the export never is
  let previewSurface: Surface | null = null;

  function drawCameraView(ctx: CanvasRenderingContext2D) {
    const v = get(view);
    const prefs = get(preferences);
    const doc = editor.doc;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = shades[prefs.stage.shade];
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const base: Mat = [dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY];
    const w = doc.width * base[0];
    const h = doc.height * base[3];
    ctx.save();
    ctx.beginPath();
    ctx.rect(base[4], base[5], w, h);
    ctx.clip();
    const k = previewScaleFor(prefs.stage.preview, get(touchUi), get(playing));
    if (k >= 1) {
      renderCameraFrame(ctx, doc, { frame: editor.frame, base, transparent: false });
    } else {
      const sw = Math.max(1, Math.ceil(w * k));
      const sh = Math.max(1, Math.ceil(h * k));
      previewSurface = sizedSurface(previewSurface, sw, sh);
      const p = surfaceContext(previewSurface);
      p.setTransform(1, 0, 0, 1, 0, 0);
      p.clearRect(0, 0, sw, sh);
      renderCameraFrame(p, doc, { frame: editor.frame, base: [base[0] * k, 0, 0, base[3] * k, 0, 0], transparent: false });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(previewSurface, base[4], base[5], w, h);
    }
    drawSubtitles(ctx, doc, editor.frame, base);
    ctx.restore();
  }

  function drawContent(ctx: CanvasRenderingContext2D) {
    if (get(showingCamera)) {
      drawCameraView(ctx);
      return;
    }
    const v = get(view);
    const prefs = get(preferences);
    renderStage(
      ctx,
      editor.doc,
      editor.currentLayers(),
      { zoom: v.zoom, panX: v.panX, panY: v.panY, dpr, width, height },
      {
        frame: editor.frame,
        outline: get(outlineMode),
        preview: editor.preview,
        added: editor.previewAdded,
        pose: editor.posePreview,
        assets: editor.doc.assets,
        pasteboard: prefs.stage.pasteboard,
        grid: prefs.grid.show
          ? {
              size: prefs.grid.size,
              color: prefs.grid.color,
              subdivisions: prefs.grid.subdivisions,
              opacity: prefs.grid.opacity / 100
            }
          : null,
        colors: { ...colors, pasteboard: shades[prefs.stage.shade] },
        shadow: prefs.stage.shadow,
        onion: onionFor(prefs),
        edit: editLevels(),
        hide: get(textEditing),
        cache: !get(playing),
        active: get(activeLayer)
      }
    );
  }

  function drawOverlay(ctx: CanvasRenderingContext2D) {
    const v = get(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawEditorOverlay(ctx, v, dpr, colors);
    // the tools draw in the space they work in
    const m = multiply([dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY], editor.base());
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    drawToolOverlay(ctx);
    if (get(preferences).rulers.show) drawRulers(ctx, v);
  }

  // 1, 2 or 5 times a power of ten, the smallest one at least min long
  function niceStep(min: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(min)));
    for (const m of [1, 2, 5]) if (m * p >= min) return m * p;
    return 10 * p;
  }

  function label(n: number): string {
    return String(Math.round(n * 100) / 100);
  }

  function drawRulers(ctx: CanvasRenderingContext2D, v: View) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, width, RULER);
    ctx.fillRect(0, 0, RULER, height);

    const major = niceStep(64 / v.zoom);
    const minor = major / 10;
    const minorPx = minor * v.zoom;
    const every = minorPx < 4 ? 5 : 1;

    ctx.strokeStyle = colors.tick;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.label;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.beginPath();

    for (let i = Math.ceil((RULER - v.panX) / v.zoom / minor); ; i++) {
      const sx = Math.round(i * minor * v.zoom + v.panX) + 0.5;
      if (sx > width) break;
      if (i % every !== 0) continue;
      const len = i % 10 === 0 ? RULER : i % 5 === 0 ? 8 : 4;
      ctx.moveTo(sx, RULER - len);
      ctx.lineTo(sx, RULER);
      if (i % 10 === 0) ctx.fillText(label(i * minor), sx + 3, 3);
    }

    for (let i = Math.ceil((RULER - v.panY) / v.zoom / minor); ; i++) {
      const sy = Math.round(i * minor * v.zoom + v.panY) + 0.5;
      if (sy > height) break;
      if (i % every !== 0) continue;
      const len = i % 10 === 0 ? RULER : i % 5 === 0 ? 8 : 4;
      ctx.moveTo(RULER - len, sy);
      ctx.lineTo(RULER, sy);
      if (i % 10 === 0) {
        ctx.save();
        ctx.translate(3, sy - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label(i * minor), 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();

    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, RULER, RULER);
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(RULER, RULER - 0.5);
    ctx.lineTo(width, RULER - 0.5);
    ctx.moveTo(RULER - 0.5, RULER);
    ctx.lineTo(RULER - 0.5, height);
    ctx.moveTo(0, RULER - 0.5);
    ctx.lineTo(RULER, RULER - 0.5);
    ctx.lineTo(RULER - 0.5, 0);
    ctx.stroke();
  }

  // in the space of the timeline being edited, a symbol open in place has its own. the sticky keys of
  // the touch bar count like held ones
  function toolEvent(e: PointerEvent | MouseEvent): ToolEvent {
    return withModifiers(makeEvent(e, overlay!.getBoundingClientRect(), get(view), editor.base()));
  }

  // guides and rulers stay in document space
  function docEvent(e: PointerEvent | MouseEvent): ToolEvent {
    return makeEvent(e, overlay!.getBoundingClientRect(), get(view));
  }

  // the top ruler pulls out horizontal guides, the left one vertical guides
  function rulerAt(sx: number, sy: number): GuideAxis | null {
    if (!get(preferences).rulers.show || (sx < RULER && sy < RULER)) return null;
    if (sy < RULER) return 'h';
    if (sx < RULER) return 'v';
    return null;
  }

  // a guide the pointer can grab: visible, unlocked, a selection tool, and no item on top of it
  function grabbableGuide(ev: ToolEvent, at: ToolEvent): { axis: GuideAxis; index: number } | null {
    const prefs = get(preferences);
    if (!prefs.guides.show || prefs.guides.lock || !GUIDE_TOOLS.includes(get(activeTool))) return null;
    const g = editor.doc.guides;
    if (g.h.length === 0 && g.v.length === 0) return null;
    const factor = pointerFactor(ev.pointerType);
    const hit = guideAt(at, at.zoom, factor);
    if (!hit || pickItem(ev, ev.zoom, factor)) return null;
    return hit;
  }

  function startGuide(axis: GuideAxis, index: number, ev: ToolEvent) {
    if (!get(preferences).guides.show) setGroup('guides', { show: true });
    guideState.drag = { axis, index, value: axis === 'h' ? ev.y : ev.x, remove: false };
    guideCursor = axis;
    editor.markOverlay();
  }

  function dragGuide(ev: ToolEvent) {
    const drag = guideState.drag;
    if (!drag) return;
    const axis = drag.axis === 'h' ? 'y' : 'x';
    // the snap targets are in the space of an open symbol, a guide lives in the document
    const p = editor.editing() ? ev : snapPoint(ev, { zoom: ev.zoom, axis, guides: false, show: true });
    drag.value = axis === 'y' ? p.y : p.x;
    drag.remove = drag.axis === 'h' ? ev.sy < RULER : ev.sx < RULER;
    editor.markOverlay();
  }

  function onpointerdown(e: PointerEvent) {
    overlay?.setPointerCapture(e.pointerId);
    if (isTouch(e)) {
      touchDown(e);
      return;
    }
    startTool(e);
  }

  // what a press does with the active tool, for the mouse at once and for fingers and the pencil when
  // the gesture tracker says it is no pinch
  // in the camera view the stage shows the video, only moving around and the camera tool work there
  const CAMERA_VIEW_TOOLS = ['hand', 'zoom', 'camera'];
  let blocked = false;
  let blockedNoteAt = 0;

  function startTool(e: PointerEvent) {
    blocked = false;
    if (get(showingCamera) && !get(playing) && !CAMERA_VIEW_TOOLS.includes(get(activeTool)) && e.button === 0 && !spaceHeld) {
      blocked = true;
      if (performance.now() - blockedNoteAt > 4000) {
        blockedNoteAt = performance.now();
        addToast('The camera view shows the video. Turn it off to draw, or move the camera with the camera tool', 'info', 3500);
      }
      return;
    }
    // working on the stage stops playback and lets go of the frames picked in the timeline
    pause();
    if (e.button === 0) frameSelection.set(null);
    const hand = e.button === 1 || (e.button === 0 && (spaceHeld || get(activeTool) === 'hand'));
    if (hand) {
      e.preventDefault();
      const v = get(view);
      panStart = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
      panning = true;
      setAutoFit(false);
      return;
    }
    if (e.button !== 0) return;
    const ev = toolEvent(e);
    const at = docEvent(e);
    const ruler = rulerAt(ev.sx, ev.sy);
    if (ruler) {
      if (guidesLocked()) addToast('Guides are locked');
      else startGuide(ruler, -1, at);
      return;
    }
    const guide = grabbableGuide(ev, at);
    if (guide) {
      startGuide(guide.axis, guide.index, at);
      return;
    }
    pointerDown(ev);
    editor.markOverlay();
  }

  function onpointermove(e: PointerEvent) {
    if (isTouch(e)) {
      lastTouch = performance.now();
      run(tracker.move(point(e)));
      return;
    }
    moveTool(e);
  }

  function moveTool(e: PointerEvent) {
    if (blocked && e.buttons !== 0) return;
    if (panStart) {
      const start = panStart;
      view.update((v) => ({ ...v, panX: start.panX + e.clientX - start.x, panY: start.panY + e.clientY - start.y }));
      return;
    }
    const ev = toolEvent(e);
    pointerAt = { x: ev.sx, y: ev.sy };
    if (guideState.drag) {
      dragGuide(docEvent(e));
      return;
    }
    // a hover only needs the latest position, a drag gets every point in between. the tools mark
    // the overlay when a hover changes what it shows, so a still stage is not drawn again
    if (e.buttons === 0) {
      const guide = rulerAt(ev.sx, ev.sy) ? null : grabbableGuide(ev, docEvent(e));
      guideCursor = guide?.axis ?? null;
      pointerMove(ev);
      if (currentTool()?.followsPointer?.()) editor.markOverlay();
    } else {
      for (const one of coalescedEvents(e)) pointerMove(toolEvent(one));
      editor.markOverlay();
    }
  }

  function onpointerup(e: PointerEvent) {
    if (overlay?.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
    if (isTouch(e)) {
      lastTouch = performance.now();
      run(tracker.up(point(e)));
      return;
    }
    endTool(e);
  }

  // the system took the pointer, a finger that slid off the screen or a gesture of ipados
  function onpointercancel(e: PointerEvent) {
    if (overlay?.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
    if (isTouch(e)) {
      lastTouch = performance.now();
      run(tracker.cancel(point(e)));
      return;
    }
    endTool(e);
  }

  function endTool(e: PointerEvent) {
    if (blocked) {
      blocked = false;
      return;
    }
    if (panStart) {
      panStart = null;
      panning = false;
      return;
    }
    if (guideState.drag) {
      dragGuide(docEvent(e));
      finishGuideDrag();
      clearSnap();
      guideCursor = null;
      return;
    }
    if (e.button !== 0) return;
    pointerUp(toolEvent(e));
    editor.markOverlay();
  }

  // a right click picks what is under the pointer when it is not selected yet, then the menu opens
  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    // a long press opens the menu itself, safari may send its own event on top
    if (panStart || touchedLately()) return;
    openMenu(e, 'mouse');
  }

  function openMenu(e: MouseEvent, pointerType: string) {
    const ev = toolEvent(e);
    const hit = pickForSelect(ev, ev.zoom, pointerFactor(pointerType));
    if (hit && !get(selection).has(hit.id)) select([hit.id]);
    const canBind = editor.currentLayers().some((l) => l.type === 'rig' && l.bones.length > 0);
    const items = stageMenu(get(preferences).shortcuts, get(selection).size > 0, canBind);
    contextMenu.set({ x: e.clientX, y: e.clientY, items });
  }

  function ondblclick(e: MouseEvent) {
    // the tracker finds double taps, the click the browser makes of them would come twice
    if (touchedLately()) return;
    doubleClick(toolEvent(e));
    editor.markOverlay();
  }

  // fingers and the pencil: the tracker tells a stroke from a pinch, a tap and a long press, the stage
  // carries out what it decides. the mouse never comes here
  const tracker = new GestureTracker<PointerEvent>(() =>
    gestureOptions(get(activeTool), get(preferences), get(penSeen))
  );
  let pinchFrom: View | null = null;
  let gestureTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTouch = -Infinity;
  // a pinch is on, the onion skin waits until it ends
  let gesturing = false;

  function isTouch(e: PointerEvent): boolean {
    return e.pointerType === 'touch' || e.pointerType === 'pen';
  }

  function touchedLately(): boolean {
    return performance.now() - lastTouch < 800;
  }

  function point(e: PointerEvent): GesturePoint<PointerEvent> {
    return {
      id: e.pointerId,
      kind: e.pointerType === 'pen' ? 'pen' : 'touch',
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      data: e
    };
  }

  function touchDown(e: PointerEvent) {
    lastTouch = performance.now();
    if (e.pointerType === 'pen') penSeen.set(true);
    run(tracker.down(point(e)));
  }

  // stage pixels from the page ones the tracker keeps
  function local(p: Vec): Vec {
    const r = overlay!.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  }

  // the tool lets go of what it started: escape drops a stroke or a drag, a tool without one ends it
  function cancelTool(e: PointerEvent) {
    if (panStart) {
      panStart = null;
      panning = false;
      return;
    }
    if (guideState.drag) {
      guideState.drag = null;
      clearSnap();
      guideCursor = null;
      editor.markOverlay();
      return;
    }
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    keyDown(esc);
    if (!esc.defaultPrevented) endTool(e);
    editor.markAll();
  }

  function run(actions: GestureAction<PointerEvent>[]) {
    for (const a of actions) {
      switch (a.type) {
        case 'tool-down':
          startTool(a.data);
          break;
        case 'tool-move':
          moveTool(a.data);
          break;
        case 'tool-up':
          endTool(a.data);
          break;
        case 'tool-cancel':
          cancelTool(a.data);
          break;
        case 'pan':
          setAutoFit(false);
          view.update((v) => ({ ...v, panX: v.panX + a.dx, panY: v.panY + a.dy }));
          break;
        case 'pinch-start':
          pause();
          setAutoFit(false);
          pinchFrom = get(view);
          gesturing = true;
          break;
        case 'pinch':
          if (pinchFrom) view.set(pinchView(pinchFrom, local(a.a0), local(a.b0), local(a.a1), local(a.b1)));
          break;
        case 'pinch-end':
          pinchFrom = null;
          gesturing = false;
          markDirty();
          break;
        case 'double-tap':
          doubleClick(toolEvent(a.data));
          editor.markOverlay();
          break;
        case 'long-press':
          openMenu(a.data, a.data.pointerType);
          break;
        case 'multi-tap':
          if (!get(preferences).touch.fingerTaps) break;
          if (a.fingers === 2) fingerHistory('undo');
          else if (a.fingers === 3) fingerHistory('redo');
          break;
      }
    }
    schedule();
  }

  // two fingers undo, three redo, a short note says what, there is no menu to look at
  function fingerHistory(which: 'undo' | 'redo') {
    const label = which === 'undo' ? editor.undo() : editor.redo();
    if (label === null) addToast(which === 'undo' ? 'Nothing to undo' : 'Nothing to redo', 'info', 1200);
    else addToast(`${which === 'undo' ? 'Undo' : 'Redo'}: ${label}`, 'info', 1200);
  }

  // the hold before a finger draws and the long press need a clock, the tracker asks for it
  function schedule() {
    if (gestureTimer) clearTimeout(gestureTimer);
    gestureTimer = null;
    const due = tracker.deadline();
    if (due === null) return;
    gestureTimer = setTimeout(() => run(tracker.tick(performance.now())), Math.max(0, due - performance.now()) + 1);
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    setAutoFit(false);
    const rect = overlay!.getBoundingClientRect();
    // a line is about 16 pixels when the wheel counts in lines
    const unit = e.deltaMode === 1 ? 16 : 1;
    // the preferences can make the plain wheel zoom, then ctrl scrolls
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl !== (get(preferences).stage.wheel === 'zoom')) {
      const factor = Math.exp(-e.deltaY * unit * 0.002);
      view.update((v) => zoomAround(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top));
      return;
    }
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    view.update((v) => ({ ...v, panX: v.panX - dx, panY: v.panY - dy }));
  }

  // keys typed into a field or pressed in a menu or a dialog are not for the stage
  function busy(target: EventTarget | null): boolean {
    const el = target instanceof HTMLElement ? target : null;
    if (!el) return false;
    if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
    return el.closest('[role="dialog"], [role="menu"]') !== null;
  }

  // files dragged over the stage, the drop point is where they land
  let dropping = $state(false);

  function hasFiles(e: DragEvent): boolean {
    return [...(e.dataTransfer?.types ?? [])].includes('Files');
  }

  function ondragover(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropping = true;
  }

  function ondrop(e: DragEvent) {
    dropping = false;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    e.preventDefault();
    const ev = toolEvent(e);
    void importFiles(files, { x: ev.x, y: ev.y });
  }

  // only space lives here, every other key goes through the shortcuts
  function onkeydown(e: KeyboardEvent) {
    if (busy(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      spaceHeld = true;
    }
  }

  // space on a focused toolbar button would click it as well, so the stage keeps it
  function onkeyup(e: KeyboardEvent) {
    if (e.key !== ' ' || !spaceHeld) return;
    e.preventDefault();
    spaceHeld = false;
  }

  onMount(() => {
    readColors();
    // desynchronized cuts the pen latency where the browser supports it and spares the copy of
    // the whole canvas on every frame. the content always covers itself with the pasteboard, an
    // opaque canvas spares the page under it
    contentCtx = content!.getContext('2d', { desynchronized: true, alpha: false });
    overlayCtx = overlay!.getContext('2d', { desynchronized: true });

    const observer = new ResizeObserver(resize);
    observer.observe(host!);
    resize();

    const canvas = overlay!;
    canvas.addEventListener('wheel', onwheel, { passive: false });

    const unsubscribe = [
      view.subscribe(markDirty),
      preferences.subscribe(markDirty),
      stageSize.subscribe(markDirty),
      outlineMode.subscribe(markDirty),
      playing.subscribe(markDirty),
      activeTool.subscribe(() => editor.markOverlay()),
      anchorSelection.subscribe(() => editor.markOverlay()),
      textEditing.subscribe(markDirty),
      showingCamera.subscribe(markDirty)
    ];
    setImageLoaded(markDirty);
    setStageElement(host);
    // a font that arrives lays its texts out again, the kept pictures of the layers are stale
    setFontLoaded(() => {
      invalidateStageCache();
      markDirty();
    });

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (editor.contentDirty && contentCtx) {
        editor.contentDirty = false;
        drawContent(contentCtx);
      }
      if (editor.overlayDirty && overlayCtx) {
        editor.overlayDirty = false;
        drawOverlay(overlayCtx);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (gestureTimer) clearTimeout(gestureTimer);
      observer.disconnect();
      canvas.removeEventListener('wheel', onwheel);
      for (const off of unsubscribe) off();
      setImageLoaded(null);
      setStageElement(null);
      setFontLoaded(null);
    };
  });
</script>

<svelte:window {onkeydown} {onkeyup} onblur={() => (spaceHeld = false)} />

<div
  class="stage"
  class:dropping
  bind:this={host}
  style="cursor: {cursor}; --pasteboard: {SHADE_VARS[$preferences.stage.shade]}"
  role="application"
  {ondragover}
  ondragleave={(e) => {
    // moving over the canvases inside is no leave
    if (!host?.contains(e.relatedTarget as Node | null)) dropping = false;
  }}
  {ondrop}>
  <canvas class="content" bind:this={content}></canvas>
  <canvas
    class="overlay"
    bind:this={overlay}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    {onpointercancel}
    onpointerleave={() => {
      if (!panStart) hover.set(null);
      pointerAt = null;
    }}
    {ondblclick}
    onmousedown={(e) => {
      // the middle button pans, it must not start the browser's autoscroll
      if (e.button === 1) e.preventDefault();
    }}
    {oncontextmenu}></canvas>
  {#if pointerAt && $preferences.rulers.show}
    {#if pointerAt.x > RULER}
      <div class="ruler-mark x" style="transform: translateX({Math.round(pointerAt.x)}px)"></div>
    {/if}
    {#if pointerAt.y > RULER}
      <div class="ruler-mark y" style="transform: translateY({Math.round(pointerAt.y)}px)"></div>
    {/if}
  {/if}
  {#if dropping}
    <div class="drop-note">Drop to place it here</div>
  {/if}
  {#if $textEditing}
    {#key $textEditing}
      <TextEditor id={$textEditing} />
    {/key}
  {/if}
</div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--pasteboard);
  }

  /* each canvas on its own layer, so a redraw does not paint the rest of the page again */
  /* both canvases match the screen pixel for pixel, without filtering the page lays them down twice as fast */
  canvas {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    will-change: transform;
    image-rendering: pixelated;
  }

  .overlay {
    touch-action: none;
  }

  /* where the pointer is, on both rulers */
  .ruler-mark {
    position: absolute;
    left: 0;
    top: 0;
    background: var(--accent);
    pointer-events: none;
  }

  .ruler-mark.x {
    width: 1px;
    height: 20px;
  }

  .ruler-mark.y {
    width: 20px;
    height: 1px;
  }

  .stage.dropping::after {
    content: '';
    position: absolute;
    inset: 6px;
    border: 2px dashed var(--accent);
    background: var(--accent-dim);
    pointer-events: none;
  }

  .drop-note {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    padding: 6px 12px;
    font-size: 12px;
    color: #111;
    background: var(--accent);
    pointer-events: none;
    z-index: 2;
  }
</style>
