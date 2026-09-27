# The resolver

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Portability is the point — the resolver

- `resolver.url(kind, path)`, `kind ∈ tiles | style | glyphs | sprite |
  mapData | maps | diagrams | sharedData | registry`. The `kind → { anchor,
  base }` table is the single place that knows where anything lives; a layout
  change is that one edit. Only `diagrams` checks its path before resolving
  it (see **Interactive diagrams**).
- The credential cell is read **synchronously**. `transformRequest` cannot
  await.
- PMTiles Range reads bypass `transformRequest` entirely — they call global
  `fetch`. Leave `pmtiles://` URLs untouched in the hook; rewriting one changes
  which archive is opened.
- MapLibre's `'Source'` resourceType is deliberately unmapped: it covers both
  TileJSON and GeoJSON, and one asset class would sign the other wrongly.
- The shell page's own subresources are not resolver business. `<link>`,
  `<script src>` and ES `import` are resolved by the browser before any
  JavaScript runs.
- `resolver.pmtilesSource(path, kind = 'tiles')` gives a PMTiles archive's two
  forms, its own URL and its `pmtiles://` tile template: a basemap is a shared
  archive, under `tiles`; an archive that belongs to one map sits in that
  map's folder and is named under `maps` — a globe's imagery. The shell opens
  one through its `archive(path, kind)`, which registers it with the PMTiles
  protocol.

## Current state

- The bridge to the app does not exist yet. `resolver.setCredentials()` is
  written, works, and nothing calls it. Until it is called the resolver uses
  the `relative` strategy, which is today's production behaviour.
