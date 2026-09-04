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

It is early. The drawing tools, the timeline, symbols, text, pictures and the rig work, saving and export come next.

## Features

- Pen, curvature, pencil, brush, eraser, polygons and stars, every line stays an editable curve
- Unite, subtract, intersect, exclude and divide shapes, holes stay part of their shape, outline strokes, simplify and smooth paths
- Solid colors and linear or radial gradients, a color picker, swatches, paint bucket, ink bottle and eyedropper
- Align, distribute and transform by numbers, rulers, guides, a grid and smart guides that snap
- A timeline with layers and folders, keyframes, labels and tweens that blend moves, turns, shapes and colors
- Easing from simple in and out to your own curve, playback with a loop and onion skin before and after the playhead
- Frames to copy, paste, move, duplicate and reverse, with auto key on the frame you draw on
- Bones for characters, bound to the drawing and posed with inverse kinematics, see Rigging below
- Symbols you draw once and reuse from a library, edited in place, played in a loop, once or on one frame, with alpha and a tint
- Text with bundled fonts, your own font files or the fonts on your computer, typed right on the stage, turned into outlines when you need paths
- Pictures imported, dropped or pasted onto the stage, and copy and paste between tabs through the system clipboard
- Export to PNG, SVG, GIF, WebM and MP4, image sequences and sprite sheets
- `.brainimate` project files, autosave in the browser and offline use

### Rigging

Draw an arm on a layer, press `M`, click the shoulder, the elbow and the wrist, press `Esc`. A Rig layer appears and the arm is bound to its two bones. Press `V`, drag the wrist, and the arm bends at the elbow with its curves kept smooth. Alt drag turns one bone, a double click pins a joint, posing on another frame keys it and tweens to it. The bind tool (`Shift+M`) changes what follows which bone, the Rig panel lists the bones and adds humanoid, four legged and arm templates.

## Shortcuts

| Key | What it does |
|-----|--------------|
| `V` `A` `Q` | Selection, direct selection, free transform |
| `P` `Shift+P` `Y` `B` `E` | Pen, curvature, pencil, brush, eraser |
| `R` `O` `N` `T` | Rectangle, ellipse, line, text |
| `F8` `Ctrl+L` | Convert to symbol, library |
| Double click `Esc` | Edit a symbol in place or type into text, leave the symbol |
| `Ctrl+Shift+O` | Create outlines from text |
| `K` `S` `I` `G` | Paint bucket, ink bottle, eyedropper, gradient |
| `M` `Shift+M` | Bone (`Esc` ends the chain), bind |
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
- A symbol has its own layers and keyframes. An instance works out which of its frames to show from the frame it is on, and draws those layers with its own matrix, alpha and tint. Editing in place swaps the timeline for the symbol's and draws the rest of the stage faded.
- Text is laid out with opentype.js and drawn from the glyph outlines, so it looks the same on every machine and turns into paths without loss.
- Bones live on a rig layer and a pose is a keyframe on it. Each anchor of a bound shape follows a weighted mix of its bones, its handles follow how that mix changes along the outline, and the bent shapes are worked out once per pose.
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
| Text | opentype.js |
| Fonts | Inter, Instrument Serif, JetBrains Mono, Lora, Poppins, Bebas Neue from Fontsource (OFL) |
| Export | gifenc, mediabunny, fflate |
| Storage | idb-keyval, browser-fs-access |
| Language | TypeScript |

## License

MIT, see [LICENSE](LICENSE). The libraries keep their own licenses, [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) lists them.
