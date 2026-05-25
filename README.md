<p align="center">
  <img src="static/brainimate-logo-readme.svg" alt="brainimate logo" width="80" />
</p>

<h1 align="center">brainIMATE</h1>

<p align="center">
  Vector drawing and 2D animation that run in your browser.<br/>
  Draw it, then make it move.
</p>

<p align="center">
  <a href="https://animate.swimmingbrain.dev"><strong>Try it now &rarr; animate.swimmingbrain.dev</strong></a>
</p>

brainIMATE is an open source app for drawing and animating, like Adobe Animate and Illustrator, but in a browser tab. It is made for illustrators and for people who never animated before. There is no account and no server, everything stays in your browser.

It is early. The editor shell is there, the drawing tools, the timeline and the rig come next.

## Features

- Pen, pencil, brush, eraser and shapes, every line stays an editable curve
- A timeline with layers, keyframes, tweens with easing and onion skin
- Bones for characters, bound to the drawing and posed with inverse kinematics
- Symbols you draw once and reuse, edited in place
- Export to PNG, SVG, GIF, WebM and MP4, image sequences and sprite sheets
- `.brainimate` project files, autosave in the browser and offline use

## Shortcuts

| Key | What it does |
|-----|--------------|
| `V` `A` | Selection, direct selection |
| `P` `N` `B` `E` | Pen, pencil, brush, eraser |
| `M` `L` `\` `T` | Rectangle, ellipse, line, text |
| `K` `I` `G` | Paint bucket, eyedropper, gradient |
| `X` `Y` | Bone, pose |
| `Space` | Hand while held |
| `F5` `F6` `F7` | Insert frame, keyframe, blank keyframe |
| `,` `.` `Enter` | Previous frame, next frame, play |
| `Ctrl+Z` `Ctrl+Shift+Z` | Undo, redo |
| `?` | All shortcuts |

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. `pnpm test` runs the tests, `pnpm check` the type checks and `pnpm build` writes the static site to `build/`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) if you want to help.

## How it works

- The stage is two stacked canvases, the drawing below and the handles on top. Both are drawn only when something changed.
- A drawing is a list of paths made of cubic curves, kept as plain objects. Undo stores immer patches, not copies.
- A layer holds keyframes. Between two keyframes with a tween, the shapes are blended point by point.
- Bones live on a rig layer. Each point of a bound shape follows a weighted mix of its bones.
- Projects are json, zipped with fflate when they carry pictures or fonts.

## Tech stack

| Part | Library |
|------|---------|
| Framework | Svelte 5 + SvelteKit (static adapter) |
| Curves | bezier-js, fit-curve |
| Brush | perfect-freehand |
| Undo | immer |
| Easing | bezier-easing |
| Export | gifenc, mediabunny, fflate |
| Storage | idb-keyval, browser-fs-access |
| Language | TypeScript |

## License

MIT, see [LICENSE](LICENSE). The libraries keep their own licenses, [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) lists them.
