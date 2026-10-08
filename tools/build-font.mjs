// Builds shared/fonts/noto-sans-bengali/: WOFF2s of Noto Sans Bengali Regular and Bold plus their OFL licence,
// from the pinned release in sources.json (notoSansBengali; its zip unpacked into .cache/noto-bengali/).
//
// The font is used through MapLibre's `font-faces` style property (see
// README "Bengali labels"). Its GSUB/GPOS tables are kept whole, because the
// browser's shaper needs them for conjuncts (প্র), pre-base vowel signs (ি)
// and split vowels (কৌ). Only unused codepoints are dropped.
//
// Bold (the user's approval, 2026-10-08, WHEEL-2) is built the same way from the same release, for the diagram
// shell's real bold — headings, a month's name, numerals — in place of the browser's synthesized bold.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);
const SRC = path.resolve('.cache/noto-bengali');
// Inside the served tree. Change here if it moves.
const OUT = path.resolve('..', 'docs', 'shared', 'fonts', 'noto-sans-bengali');
const WEIGHTS = ['Regular', 'Bold'];

const hb = await require('harfbuzzjs');
fs.mkdirSync(OUT, { recursive: true });
for (const weight of WEIGHTS) {
  const ttf = fs.readFileSync(path.join(SRC, `NotoSansBengali/unhinted/ttf/NotoSansBengali-${weight}.ttf`));
  const face = hb.createFace(hb.createBlob(ttf), 0);
  const text = String.fromCodePoint(...face.collectUnicodes()); // everything the font covers
  const woff2 = await subsetFont(ttf, text, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(OUT, `NotoSansBengali-${weight}.woff2`), woff2);
  console.log(`NotoSansBengali-${weight}.woff2: ${(woff2.length / 1024).toFixed(1)} KB (from ${(ttf.length / 1024).toFixed(0)} KB TTF)`);
}
fs.copyFileSync(path.join(SRC, 'OFL.txt'), path.join(OUT, 'OFL.txt'));
