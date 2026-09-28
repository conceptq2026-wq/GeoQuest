// Writes the current version onto every reference to the shells' scripts and
// stylesheets (tools/lib/asset-version.mjs), so a phone or the app's WebView
// never keeps an old one after a push. Run it after any change under
// docs/shell/, docs/visual/ or docs/shared/; tools/verify.mjs fails a
// reference that does not carry the current version.
//
//   node tools/stamp-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { assetVersion, codeFiles, stamped } from './lib/asset-version.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// The served tree. Change here if it moves.
const SERVED = path.resolve(HERE, '..', 'docs');

const version = assetVersion(SERVED);
let changed = 0;
for (const file of codeFiles(SERVED)) {
  const text = fs.readFileSync(file, 'utf8');
  const next = stamped(file, text, version);
  if (next !== text) {
    fs.writeFileSync(file, next);
    changed++;
    console.log(`  ${path.relative(SERVED, file).split(path.sep).join('/')}`);
  }
}
if (assetVersion(SERVED) !== version) throw new Error('stamping changed the version: a reference the version ignores was rewritten');
console.log(`asset version ${version}: ${changed} file(s) stamped`);
