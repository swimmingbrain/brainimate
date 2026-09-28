# Contributing

There is no formal process. Fork the repo, make your change, open a pull request. Small and focused beats big and sweeping, so if you plan something larger, open an issue first and we can talk it through before you spend time on it.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in Chrome, Edge or Firefox. A pen tablet helps for the brush, but the mouse draws too.

`pnpm check` runs the type checker and has to come back with no errors and no warnings, `pnpm test` runs the unit tests, and `pnpm build` writes the static site to `build/`.

## Where things live

- `src/lib/core` is the geometry: points, matrices, curves, paths and hit tests. Plain TypeScript, no Svelte in it.
- `src/lib/editor` holds the document, undo, the view and what the menus and keys call.
- `src/lib/tools` are the stage tools, one file each, `src/lib/render` draws the stage.
- `src/lib/anim` is the timeline and the tweens, `src/lib/rig` the bones, `src/lib/io` opening, saving and exports.
- `src/lib/stores` are the small app wide stores, the preferences and the workspaces, `src/lib/ui` the Svelte components, one per file.
- A new command goes into the list in `src/lib/editor/actions.ts` with a label, a group and its default keys. The keys, the menus, the command palette and the shortcuts editor all read that list.
- `pnpm dev` adds a hidden "Insert stress test" to the command palette, 600 shapes on six layers, to see how the stage keeps up.

## Style

There is no linter and no formatter, so keep the style of the file you are in: two spaces, single quotes, semicolons, and lowercase comments that explain why rather than what. The document is a plain object, never a Svelte store, and the points of a path never go into Svelte state.

Commit messages are short and lowercase with a type prefix, like `fix: the pen closes the path on the first anchor` or `feat: shift keeps the line at 45 degrees`. The types in use are `feat`, `fix`, `perf`, `docs`, `test`, `refactor` and `chore`.

## License

By contributing you agree that your work is released under the MIT license, like the rest of the project.
