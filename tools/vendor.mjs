// Copies the pinned browser libraries from node_modules into shared/vendor/.
// Folder names carry the version, so a published page's URLs change if a
// library ever does — nothing gets swapped out under an existing map.
//
// MapLibre GL JS stays pinned at 6.9.0 on purpose: the Bengali labels rely on
// its `font-faces` support, which the style-spec docs still list as
// unsupported on web. It works in 6.9.0 (tested); a different version must be
// re-tested with Bengali labels before it replaces this one.
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')).devDependencies;
const OUT = path.resolve('..', 'shared', 'vendor');

const libs = [
  { name: 'maplibre-gl', files: ['dist/maplibre-gl.mjs', 'dist/maplibre-gl-shared.mjs', 'dist/maplibre-gl-worker.mjs', 'dist/maplibre-gl.css', 'LICENSE.txt'] },
  { name: 'pmtiles', files: ['dist/pmtiles.js'], extra: { LICENSE: '.cache/pmtiles-LICENSE' } },
];

for (const { name, files, extra = {} } of libs) {
  const installed = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;
  if (installed !== pkg[name]) throw new Error(`${name}: installed ${installed}, pinned ${pkg[name]} — run npm ci`);
  const dir = path.join(OUT, `${name}-${installed}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.copyFileSync(`node_modules/${name}/${f}`, path.join(dir, path.basename(f)));
  for (const [as, from] of Object.entries(extra)) fs.copyFileSync(from, path.join(dir, as));
  console.log(`${name}-${installed}: ${files.map((f) => path.basename(f)).join(', ')}`);
}
