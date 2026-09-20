// Unit test for shared/resolver.js.  Run:  node --test tools/resolver.test.mjs
//
// The point of these assertions is not that the resolver is self-consistent.
// It is that the 'relative' strategy reproduces, byte for byte, the URLs the
// pages composed by hand before the resolver existed — at the server root and
// under a subpath, because GitHub Pages serves this repo from /GeoQuest/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolver, KINDS } from '../docs/shared/resolver.js';

// The two deployments, written the way the browser sees them.
const ROOT = {
  shared: 'http://localhost:3000/shared/',
  document: 'http://localhost:3000/international/straits/index.html',
  prefix: 'http://localhost:3000',
};
const SUBPATH = {
  shared: 'http://localhost:4321/GeoQuest/shared/',
  document: 'http://localhost:4321/GeoQuest/international/straits/index.html',
  prefix: 'http://localhost:4321/GeoQuest',
};

const at = (site) => createResolver({ sharedBase: site.shared, documentBase: site.document });

// kind -> [path, expected path under the deployment prefix]
const CASES = [
  ['tiles', 'world.pmtiles', '/shared/tiles/world.pmtiles'],
  ['style', 'world.json', '/shared/styles/world.json'],
  ['glyphs', 'noto-sans-bengali/NotoSansBengali-Regular.woff2', '/shared/fonts/noto-sans-bengali/NotoSansBengali-Regular.woff2'],
  ['sprite', 'icons.png', '/shared/sprites/icons.png'],
  ['mapData', 'canals.geojson', '/international/straits/canals.geojson'],
  ['maps', 'straits/descriptor.json', '/maps/straits/descriptor.json'],
  ['sharedData', 'seas.json', '/shared/seas.json'],
  ['registry', 'maps.json', '/maps.json'],
];

test('every kind resolves at the server root', () => {
  const r = at(ROOT);
  for (const [kind, path, expected] of CASES) {
    assert.equal(r.url(kind, path), ROOT.prefix + expected, kind);
  }
});

test('every kind resolves under a subpath', () => {
  const r = at(SUBPATH);
  for (const [kind, path, expected] of CASES) {
    assert.equal(r.url(kind, path), SUBPATH.prefix + expected, kind);
  }
});

test('every declared kind is covered by a case', () => {
  assert.deepEqual(new Set(CASES.map(([k]) => k)), new Set(KINDS));
});

test('reproduces the URLs the page composed before the resolver existed', () => {
  // Previously: new URL('../../shared/tiles/world.pmtiles', location.href).href
  // and the same for the font, from international/straits/index.html.
  for (const site of [ROOT, SUBPATH]) {
    const r = at(site);
    assert.equal(
      r.url('tiles', 'world.pmtiles'),
      new URL('../../shared/tiles/world.pmtiles', site.document).href,
    );
    assert.equal(
      r.url('glyphs', 'noto-sans-bengali/NotoSansBengali-Regular.woff2'),
      new URL('../../shared/fonts/noto-sans-bengali/NotoSansBengali-Regular.woff2', site.document).href,
    );
    // Previously: the bare './canals.geojson' MapLibre resolved against the document.
    assert.equal(r.url('mapData', 'canals.geojson'), new URL('./canals.geojson', site.document).href);
  }
});

test('a path that already has a scheme is returned untouched', () => {
  const r = at(ROOT);
  for (const already of [
    'https://example.com/a.json',
    'http://localhost:3000/shared/tiles/world.pmtiles',
    'data:application/json,{}',
    '//cdn.example.com/x.png',
  ]) {
    assert.equal(r.url('tiles', already), already);
  }
});

test('an unknown kind throws rather than guessing', () => {
  const r = at(ROOT);
  assert.throws(() => r.url('fonts', 'x.woff2'), /unknown kind "fonts"/);
  assert.throws(() => r.url('tiles', undefined), /must be a string/);
});

test('transformRequest maps MapLibre resource types onto kinds', () => {
  const r = at(SUBPATH);
  assert.equal(
    r.transformRequest('noto-sans-bengali/NotoSansBengali-Regular.woff2', 'Glyphs').url,
    SUBPATH.prefix + '/shared/fonts/noto-sans-bengali/NotoSansBengali-Regular.woff2',
  );
  assert.equal(r.transformRequest('icons.json', 'SpriteJSON').url, SUBPATH.prefix + '/shared/sprites/icons.json');
  assert.equal(r.transformRequest('icons.png', 'SpriteImage').url, SUBPATH.prefix + '/shared/sprites/icons.png');
  assert.equal(r.transformRequest('world.json', 'Style').url, SUBPATH.prefix + '/shared/styles/world.json');
});

test('transformRequest leaves a pmtiles:// envelope alone', () => {
  const r = at(SUBPATH);
  const tileUrl = `pmtiles://${SUBPATH.prefix}/shared/tiles/world.pmtiles/3/4/5`;
  assert.equal(r.transformRequest(tileUrl, 'Tile').url, tileUrl);
});

test('transformRequest passes through resource types with no class', () => {
  const r = at(ROOT);
  // 'Source' is ambiguous (TileJSON vs GeoJSON) and deliberately unmapped.
  assert.equal(r.transformRequest('anything', 'Source').url, 'anything');
  assert.equal(r.transformRequest('anything', 'Image').url, 'anything');
});

test('pmtilesSource hands out byte-identical archive URLs', () => {
  for (const site of [ROOT, SUBPATH]) {
    const { archive, tiles } = at(site).pmtilesSource('world.pmtiles');
    assert.equal(archive, site.prefix + '/shared/tiles/world.pmtiles');
    assert.equal(tiles, `pmtiles://${archive}/{z}/{x}/{y}`);
    // The Protocol parses the archive back out of the tile template; if this
    // round-trip ever fails it opens a second archive without saying so.
    const parsed = /^pmtiles:\/\/(.+)\/\{z\}\/\{x\}\/\{y\}$/.exec(tiles);
    assert.equal(parsed[1], archive);
  }
});

test('setCredentials exists, selects the host strategy, and is not implemented', () => {
  const r = at(ROOT);
  assert.equal(r.strategy(), 'relative');
  r.setCredentials({ baseUrl: 'https://gateway.example', token: 't', expiresAt: 1 });
  assert.equal(r.strategy(), 'host');
  assert.throws(() => r.url('tiles', 'world.pmtiles'), /not implemented/);
  r.setCredentials(null);
  assert.equal(r.strategy(), 'relative');
  assert.equal(r.url('tiles', 'world.pmtiles'), ROOT.prefix + '/shared/tiles/world.pmtiles');
});

test('resolvers are independent and importing has no side effects', () => {
  const a = at(ROOT);
  const b = at(SUBPATH);
  a.setCredentials({ baseUrl: 'x', token: 'y', expiresAt: 0 });
  assert.equal(a.strategy(), 'host');
  assert.equal(b.strategy(), 'relative', 'one resolver must not reach into another');
});

test('the document anchor is read at call time, not snapshotted', () => {
  let where = ROOT.document;
  const r = createResolver({ sharedBase: ROOT.shared, documentBase: () => where });
  assert.equal(r.url('mapData', 'a.geojson'), 'http://localhost:3000/international/straits/a.geojson');
  where = 'http://localhost:3000/geography/rivers/index.html';
  assert.equal(r.url('mapData', 'a.geojson'), 'http://localhost:3000/geography/rivers/a.geojson');
});
