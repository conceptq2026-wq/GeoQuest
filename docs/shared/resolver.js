/*
|--------------------------------------------------------------------------
| URL RESOLVER
|--------------------------------------------------------------------------
|
| Every outbound URL a map needs is composed here and nowhere else.
|
| Today there is one strategy, 'relative': resolve against this module's own
| location (for shared assets) or the document (for a map's own files). That
| is exactly what the pages did before this module existed, so nothing about
| hosting or behaviour changes.
|
| The reason it exists now rather than later: the app will serve these assets
| from object storage behind its Gateway, against a short-lived token, from a
| host that is not the page's own. With the seam in place that is a second
| strategy behind `setCredentials`; without it, it is a search through every
| map for every string that happens to be a path.
|
| `kind` is an asset class, not decoration. Under the Gateway each class gets
| a different base and a different token scope, so the class has to be known
| at the call site — it cannot be recovered from the path afterwards.
|
| No side effects on import: this module reads, computes and returns. It
| starts nothing and registers nothing.
|
*/

/** Asset classes. 'registry' is reserved: nothing uses it yet. */
export const KINDS = ['tiles', 'style', 'glyphs', 'sprite', 'mapData', 'maps', 'registry'];

/*
| THE LAYOUT ASSUMPTION, IN ONE PLACE.
|
| `anchor` says what the base hangs off:
|   'shared'    this module's own directory — shared/ — so a map that moves
|               between sections keeps resolving shared assets correctly.
|   'root'      the repo root, one level above shared/.
|   'document'  the page being viewed, for a map's own files.
|
| When the file layout changes, this table is the edit. Nothing else in the
| repo knows where anything lives.
|
| tiles/ and fonts/ are the two that exist today and are covered by the unit
| test. styles/, sprites/ and the registry base are provisional: no such
| asset exists yet, so they are a placement decision waiting to be made, not
| a verified fact.
*/
const BASES = {
  tiles: { anchor: 'shared', base: 'tiles/' },
  style: { anchor: 'shared', base: 'styles/' },
  glyphs: { anchor: 'shared', base: 'fonts/' },
  sprite: { anchor: 'shared', base: 'sprites/' },
  mapData: { anchor: 'document', base: '' },
  // A map's descriptor, records and geometry, addressed by map id rather than
  // relative to the page. The shell serves every map from one document, so
  // 'mapData' — which hangs off the document — cannot reach them.
  maps: { anchor: 'root', base: 'maps/' },
  registry: { anchor: 'root', base: '' },
};

/*
| MapLibre's resourceType, as it passes it to transformRequest, mapped to an
| asset class. Verified against the vendored 6.9.0 bundle.
|
| Deliberately absent:
|   'Source'  ambiguous — it covers both TileJSON and GeoJSON source data.
|             A map's own GeoJSON is resolved explicitly at the call site
|             (it is 'mapData'); no map uses TileJSON. Mapping this to one
|             class would sign the other with the wrong scope later, so it
|             passes through until there is a map that needs it.
|   'Image'   no map loads images through MapLibre.
*/
const RESOURCE_KIND = {
  Tile: 'tiles',
  Glyphs: 'glyphs',
  SpriteJSON: 'sprite',
  SpriteImage: 'sprite',
  Style: 'style',
};

/** A URL that already carries a scheme, or is protocol-relative. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:|^\/\//i;

const read = (anchor) => (typeof anchor === 'function' ? anchor() : anchor);

/**
 * @param {object} anchors
 * @param {string|(() => string)} anchors.sharedBase    URL of shared/, with a trailing slash.
 * @param {string|(() => string)} anchors.documentBase  URL the page's own files hang off.
 */
export function createResolver({ sharedBase, documentBase }) {
  const anchorFor = (name) => {
    if (name === 'shared') return read(sharedBase);
    if (name === 'document') return read(documentBase);
    if (name === 'root') return new URL('../', read(sharedBase)).href;
    throw new Error(`resolver: unknown anchor "${name}"`);
  };

  /*
   | The single mutable cell. It is read synchronously on every resolve, and
   | that is deliberate: a URL is needed at the moment MapLibre asks for it,
   | inside transformRequest, which cannot await. Making this a promise for
   | tidiness would push the await up into every call site and break the one
   | interface this module exists to keep narrow.
   */
  let credentials = null;

  /** 'relative' until credentials are supplied; 'host' once they are. */
  const strategy = () => (credentials === null ? 'relative' : 'host');

  /**
   * Declared, not implemented. Nothing calls this yet. When the Gateway
   * lands, supplying { baseUrl, token, expiresAt } here is what switches
   * every URL in every map over — one call, no other edit.
   */
  function setCredentials(next) {
    credentials = next ?? null;
  }

  /**
   * resolver.url(kind, path) -> string
   * A path already carrying a scheme is returned untouched, so this is safe
   * to call on something already resolved.
   */
  function url(kind, path) {
    const spec = BASES[kind];
    if (!spec) throw new Error(`resolver: unknown kind "${kind}"`);
    if (typeof path !== 'string') throw new Error(`resolver: path for "${kind}" must be a string`);
    if (strategy() === 'host') {
      throw new Error('resolver: the "host" strategy is declared but not implemented');
    }
    if (ABSOLUTE.test(path)) return path;
    return new URL(spec.base + path, anchorFor(spec.anchor)).href;
  }

  /**
   * The hook for everything MapLibre fetches itself — glyph ranges, font
   * files, sprites, style JSON. Shaped for `new Map({ transformRequest })`.
   */
  function transformRequest(requestUrl, resourceType) {
    /*
     | pmtiles:// is an envelope, not a location. The archive URL sits inside
     | it and was resolved once, at the creation point in `pmtilesSource`
     | below; the pmtiles Protocol parses it back out of this string to decide
     | which archive to open. Rewriting it here would make the Protocol open a
     | second archive under a second key, re-reading its header and directory.
     */
    if (requestUrl.startsWith('pmtiles://')) return { url: requestUrl };

    const kind = RESOURCE_KIND[resourceType];
    if (!kind) return { url: requestUrl };
    return { url: url(kind, requestUrl) };
  }

  /**
   * The one place a .pmtiles archive URL is produced.
   *
   * pmtiles does its own HTTP range reads from its own FetchSource, which
   * calls global fetch directly — it has no request hook of any kind, so
   * MapLibre's transformRequest cannot reach those reads. Verified against
   * the vendored 4.5.0 bundle: FetchSource exposes only url, customHeaders,
   * credentials, mustReload, chromeWindowsNoCache, getKey, setHeaders and
   * getBytes.
   *
   * The archive URL therefore has to be correct at the moment the PMTiles
   * object is created — which is why it is made here and handed out, rather
   * than each caller building its own.
   *
   * `archive` and `tiles` must carry byte-identical archive URLs: the
   * Protocol keys its cache on the string it parses out of `tiles`, and a
   * mismatch silently opens a second archive.
   */
  function pmtilesSource(path) {
    const archive = url('tiles', path);
    return { archive, tiles: `pmtiles://${archive}/{z}/{x}/{y}` };
  }

  return { url, transformRequest, pmtilesSource, setCredentials, strategy, kinds: KINDS };
}

/*
| The instance the pages use.
|
| sharedBase comes from this module's own URL, so it is right regardless of
| which map imports it or how deep that map sits. documentBase is read at
| call time rather than snapshotted, and is document.baseURI — which equals
| location.href here, because no page in this repo carries a <base href>.
*/
export const resolver = createResolver({
  sharedBase: new URL('./', import.meta.url).href,
  documentBase: () => (typeof document === 'undefined' ? new URL('./', import.meta.url).href : document.baseURI),
});
