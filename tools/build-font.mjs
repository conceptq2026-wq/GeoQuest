// Builds shared/fonts/noto-sans-bengali/: a WOFF2 of Noto Sans Bengali
// Regular plus its OFL licence, from the pinned release in sources.json.
//
// The font is used through MapLibre's `font-faces` style property (see
// README "Bengali labels"). Its GSUB/GPOS tables are kept whole, because the
// browser's shaper needs them for conjuncts (প্র), pre-base vowel signs (ি)
// and split vowels (কৌ). Only unused codepoints are dropped.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);
const SRC = path.resolve('.cache/noto-bengali');
// Inside the served tree. Change here if it moves.
const OUT = path.resolve('..', 'docs', 'shared', 'fonts', 'noto-sans-bengali');
const TTF = path.join(SRC, 'NotoSansBengali/unhinted/ttf/NotoSansBengali-Regular.ttf');

const hb = await require('harfbuzzjs');
const ttf = fs.readFileSync(TTF);
const face = hb.createFace(hb.createBlob(ttf), 0);
const text = String.fromCodePoint(...face.collectUnicodes()); // everything the font covers

const woff2 = await subsetFont(ttf, text, { targetFormat: 'woff2' });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'NotoSansBengali-Regular.woff2'), woff2);
fs.copyFileSync(path.join(SRC, 'OFL.txt'), path.join(OUT, 'OFL.txt'));
console.log(`NotoSansBengali-Regular.woff2: ${(woff2.length / 1024).toFixed(1)} KB (from ${(ttf.length / 1024).toFixed(0)} KB TTF)`);
