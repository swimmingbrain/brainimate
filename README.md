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

It is early. The drawing tools and the timeline work, symbols and the rig come next.

## Features

- Pen, curvature, pencil, brush, eraser, polygons and stars, every line stays an editable curve
- Unite, subtract, intersect, exclude and divide shapes, holes stay part of their shape, outline strokes, simplify and smooth paths
- Solid colors and linear or radial gradients, a color picker, swatches, paint bucket, ink bottle and eyedropper
- Align, distribute and transform by numbers, rulers, guides, a grid and smart guides that snap
- A timeline with layers and folders, keyframes, labels and tweens that blend moves, turns, shapes and colors
- Easing from simple in and out to your own curve, playback with a loop and onion skin before and after the playhead
- Frames to copy, paste, move, duplicate and reverse, with auto key on the frame you draw on
- Bones for characters, bound to the drawing and posed with inverse kinematics
- Symbols you draw once and reuse, edited in place
- Export to PNG, SVG, GIF, WebM and MP4, image sequences and sprite sheets
- `.brainimate` project files, autosave in the browser and offline use

## Shortcuts

| Key | What it does |
|-----|--------------|
| `V` `A` `Q` | Selection, direct selection, free transform |
| `P` `Shift+P` `Y` `B` `E` | Pen, curvature, pencil, brush, eraser |
| `R` `O` `N` `T` | Rectangle, ellipse, line, text |
| `K` `S` `I` `G` | Paint bucket, ink bottle, eyedropper, gradient |
| `M` `Shift+M` | Bone, bind |
| `Z` `H` `Space` | Zoom, hand, hand while held |
| `Ctrl+G` `Ctrl+Shift+G` `Ctrl+B` `Ctrl+J` | Group, ungroup, break apart, join paths |
| `Ctrl+Up` `Ctrl+Down` | Bring forward, send backward, with `Shift` to the front or back |
| `Enter` `Esc` `Backspace` | End the pen path, or take back its last anchor |
| `X` `Shift+X` `D` | Fill or stroke in front, swap them, default colors |
| `Ctrl+R` `Ctrl+;` `Ctrl+'` `Ctrl+U` | Rulers, guides, grid, smart guides |
| `F5` `F6` `F7` | Insert frame, keyframe, blank keyframe |
| `Shift+F5` `Shift+F6` | Remove frame, clear keyframe |
| `,` `.` `Enter` | Previous frame, next frame, play and pause |
| `Shift+,` `Shift+.` | First and last frame |
| `Ctrl+Alt+C` `Ctrl+Alt+V` | Copy and paste frames |
| `Alt+Shift+O` | Onion skin |
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
- A layer holds keyframes. Between two keyframes with a tween, items with the same id are blended: the transform as move, turn, scale and skew, the paths point by point, the colors in rgb. A frame is worked out once and kept, so playback only pays for frames it has not seen.
- Onion skin draws the frames around the playhead offscreen, tints them and keeps the result until something changes.
- Bones live on a rig layer. Each point of a bound shape follows a weighted mix of its bones.
- Projects are json, zipped with fflate when they carry pictures or fonts.

## Tech stack

| Part | Library |
|------|---------|
| Framework | Svelte 5 + SvelteKit (static adapter) |
| Curves | bezier-js, fit-curve |
| Shape booleans | paper, loaded when first used |
| Brush | perfect-freehand |
| Undo | immer |
| Easing | bezier-easing |
| Export | gifenc, mediabunny, fflate |
| Storage | idb-keyval, browser-fs-access |
| Language | TypeScript |

## License

MIT, see [LICENSE](LICENSE). The libraries keep their own licenses, [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) lists them.
