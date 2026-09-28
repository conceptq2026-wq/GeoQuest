# The Geography maps: deserts, lakes, forests, mountains, waterfalls

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Data model — places and areas

- **A record's place comes from one named source, in the seed.** A Geography
  seed record carries `geometry`: an `area` (a Natural Earth feature matched
  by exact field values — a list of values where one record is several
  features, as the Aral Sea is — or a RESOLVE extract feature) or a `point` (a
  Natural Earth feature, an OSM node, or a Wikidata item's P625). An area's
  photo marker sits at its pole of inaccessibility. **A wrong area is worse
  than no area**: a polygon that is visibly wrong against the basemap and the
  region's usual description moves to `geometry.withheld` with its reason,
  and the record ships as a marker only unless an openly licensed better
  polygon exists. The Libyan Desert is marker-only: its polygon runs deep
  into Darfur and Kordofan.
- **Ecoregion unions, by the user's approved method.** Where no single open
  polygon of a named feature exists, its area may be the union of the RESOLVE
  Ecoregions 2017 ecoregions that make it up (CC BY 4.0, credited on every map
  that uses one). An ecoregion is included only if its name matches the
  feature or a cited description places it inside it; the seed records which,
  and why others were left out. The union is compared with the basemap and a
  cited description of the feature's usual extent: somewhat smaller is
  accepted and noted in `review`; claiming land that is not the feature —
  savanna as desert, farmland as forest, an offshore island as a desert — is
  rejected and the record stays a marker, the union kept in
  `geometry.withheld` with the reason. Drawn this way: the Sahara (edge at
  17–19°N, north of the conventional 15–16°N), the Arabian, Mojave, Great
  Basin and Patagonian deserts, and the Amazon, Congo and Borneo rainforests.
  **Dropping a disjoint component is selection, not drawing**: where a union
  takes in a detached landmass that is not the feature, only the parts on the
  same Natural Earth land polygon as its main body are kept, each whole
  (`mainlandOnly` in `tools/extract-resolve.mjs`). The Patagonian steppe
  loses the Falklands and Tierra del Fuego that way. The Caspian is Natural
  Earth's own "Caspian Sea" marine polygon.

## Current state

- The five Geography maps are built by one script, `tools/build-geography.mjs`,
  from `data-sources/<map>/<map>.seed.json` — approved content in display
  order, with the geometry, photo and pinned citations added to it. Their
  outside sources are committed extracts, each re-made only on purpose by its
  own tool: `tools/extract-resolve.mjs` (RESOLVE Ecoregions 2017, CC BY 4.0 —
  the Sundarbans and taiga areas), `tools/extract-geography-points.mjs`
  (Wikidata points, OSM waterfall nodes) and
  `tools/extract-commons-photos.mjs` (the photos). Their names take the
  janapada map's alternative positions: under the photo, else above it, right
  or left (`text-variable-anchor`), at radial offsets of 2.73 em and 3.16 em
  when selected, which put a name under its photo exactly where the fixed
  2.6 em and 3 em offsets did — measured in MapLibre's collision index, since
  a variable anchor lifts the text by an amount that depends on its size.
  Since the markers are sized by zoom (2026-09-28: `zooms` 1.2, 2.2 and 4 on
  all five, whose opening zoom is 0.61 at 390 px and 0.17 at 320), the
  offsets keep those gaps at each size: 0.89, 1.45 and 1.93 em beside a 10,
  24 and 36 px marker, 2.63 em under the selected 56 px one.
