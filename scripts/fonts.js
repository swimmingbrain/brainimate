// copies the bundled fonts out of the fontsource packages into static/fonts, run with pnpm fonts
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

// package, the file name in static/fonts and the faces: weight and style
const FONTS = [
  ['inter', 'inter', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['instrument-serif', 'instrument-serif', ['400-normal', '400-italic']],
  ['jetbrains-mono', 'jetbrains-mono', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['lora', 'lora', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['poppins', 'poppins', ['400-normal', '700-normal', '400-italic', '700-italic']],
  ['bebas-neue', 'bebas-neue', ['400-normal']]
];

mkdirSync('static/fonts', { recursive: true });
let copied = 0;
for (const [pkg, name, faces] of FONTS) {
  for (const face of faces) {
    const from = `node_modules/@fontsource/${pkg}/files/${pkg}-latin-${face}.woff`;
    if (!existsSync(from)) {
      console.warn(`missing ${from}`);
      continue;
    }
    copyFileSync(from, `static/fonts/${name}-${face}.woff`);
    copied++;
  }
}
console.log(`copied ${copied} font files to static/fonts`);
