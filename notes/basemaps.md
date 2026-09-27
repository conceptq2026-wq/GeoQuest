# Basemaps

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Current state

- Two basemap archives: `docs/shared/tiles/world.pmtiles` and
  `docs/shared/tiles/bangladesh.pmtiles`. A descriptor names one in `basemap`;
  the shell's `BASEMAPS` table maps the name to its archive (through the
  resolver) and its style. `world-light` is the world archive in the
  environment-treaties mockup's palette — paler water and land, thin solid
  borders, no coastline stroke; `world` is unchanged by it. Both archives
  are tiled alike — overview to z6, detail z7–10 inside detail areas, drawn
  over a mask — so both keep the source ids `basemap` / `basemap-detail` and
  the baseline reads either unchanged. A cross-basemap switch is a full
  re-initialise.
- **bangladesh.pmtiles** is a *bounded* basemap: its own metadata carries the
  frame a map opens on (Bangladesh, West Bengal, Tripura) and the bounds it
  cannot pan past (those plus Cachar and Rakhine); a descriptor's own
  `fitBounds` / `maxBounds` win. Boxes are in `tools/bangladesh.config.mjs`.
  **Bounds under the card**: MapLibre keeps the whole canvas inside
  `maxBounds`, card or no card, so on any map with bounds the shell loosens
  them while the card is open and spans the map — the box's south edge gives
  way by exactly the height the card covers, through MapLibre's own
  `setTransformConstrain`, so only what lies under the card may go past the
  box and everything visible stays inside it. When the card closes the camera
  eases back inside and MapLibre's bounds return. A map without bounds never
  reaches this code.
  Built by `tools/build-bangladesh.mjs` from: OSM land and named rivers
  (committed snapshots from `tools/extract-bangladesh.mjs`), OCHA COD-AB for
  Bangladesh's divisions and districts (by pcode), geoBoundaries India ADM2
  for West Bengal, Tripura (the union of its districts) and Cachar (by name,
  inside the box, each exactly once), Natural Earth admin-1 for Rakhine, and
  Natural Earth's Bangladesh point-of-view lines for every international
  border but one. Its units, Bangladesh's land border and the owner of each
  piece of land between them come from `tools/lib/bangladesh-units.mjs`,
  which the janapada build reads too.
- **The one exception to "the point-of-view line wins": inside
  bangladesh.pmtiles, Bangladesh's own land border is the government's line**
  — the Bangladesh Bureau of Statistics', as OCHA COD-AB v03 admin0 publishes
  it. Measured along the whole border, Natural Earth's 1:10m line runs a
  median 1.44 km and up to 8.64 km off it (in Panchagarh), and it crosses the
  Padma. The land border is the stretch of COD-AB's outline between the two
  places Natural Earth's own Bangladesh lines reach the sea — the Sundarbans
  and the Naf — plus the ring of the Dahagram–Angarpota exclave. world.pmtiles
  keeps the point-of-view line, and every other border in bangladesh.pmtiles
  is still Natural Earth's. The other sources yield to it: their district
  edges are cut at the border or carried on to it (≤ 3 km), Bangladesh's own
  district lines end on it exactly (COD-AB draws both), land between it and a
  neighbour's edge goes to the neighbour, and other land no source owns goes
  to the nearest unit of the country whose point-of-view polygon holds it.
  Land outside the units it covers is muted.
- **bangladesh.pmtiles names.** Inside Bangladesh: every division, district
  and listed river. The main channel's record is NRCC entry 971,
  ব্রহ্মপুত্র-যমুনা; on the map it carries two display labels, ব্রহ্মপুত্র
  near Chilmari and যমুনা near Sirajganj (the user's decision, textbook usage)
  — labels placed on the channel, not a split. Outside Bangladesh: only the
  units the janapada seed uses. Bengali names come from
  `tools/sources/bangladesh-names.json`, one official source each (National
  Portal, each Indian district's own site, NRCC's river list). A unit with no
  sourced Bengali name is not labelled — never in English — and the build
  lists it: today Cachar, whose official sites have none.
