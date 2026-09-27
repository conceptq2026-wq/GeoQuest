# latitude-longitude

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Data model — generated lines

- **Generated lines keep off the tiles' clip edges.** MapLibre's own tiler
  (`@maplibre/geojson-vt` 6.1.1, as maplibre-gl resolves it) drops a line's
  whole piece in a tile where one of its vertices lies exactly on the
  tile's clip edge — a quarter tile outside it — and the simplification has
  marked that vertex unimportant, as every inner vertex of a straight line
  is: with a vertex every 1°, 5° or 15°, every parallel vanished from the
  eastern z1 tiles, whose edges fall at 45°W and 45°E. A parallel is
  straight in Web Mercator and the renderer bends it on a globe, so a
  generated parallel has a vertex every 30° and none at ±90°, and a
  generated meridian only its two ends and the equator — one at a multiple
  of 45° lies on an edge by construction, and the tiling proves it keeps
  its pieces. `tools/tile-clip.mjs` finds vertices on a clip edge
  and tiles every line as MapLibre does, failing any tile a line runs
  through that keeps no piece of it; latitude-longitude's build and the
  validator run it over z0–6.

## Current state

- **latitude-longitude**, in geography, «অক্ষরেখা ও দ্রাঘিমারেখা» /
  "Latitude & Longitude" (the title the user confirmed, 2026-09-28), left
  the work in progress for the registry on 2026-09-28. Its look is
  `design/mockups/globe-latitude-longitude.png`, the user's approved mockup:
  a 3D globe with its lines, a pill row and a docked card — but for the pill
  row, which the user replaced with the standard picker row (2026-09-28). The
  shell's globe module draws it (see **Shell modules**).
  - `tools/build-latitude-longitude.mjs` builds it from the editor's seed,
    `data-sources/latitude-longitude/latitude-longitude.seed.json`, which it
    reads and never writes: one records table, `items` — eight lines, the
    two poles and Greenwich, Bangladesh, Dhaka and Bangladesh's antipode —
    and the 15° graticule as a source of its own, drawn and never selected.
  - Every line is drawn at the seed's value: the equator, the tropics at the
    conventional 23°30′, the polar circles at 66°30′ (the user's decision:
    textbook values), the prime meridian and 90°E — a parallel with a vertex
    every 30°, a meridian with its two ends and the equator (see **Generated
    lines** under Data model). The date line is Natural
    Earth's current one, its feature `ne_id` 1159100219 (`featurecla` "Date
    line"), which runs east of Kiribati to 150°W as it has since 1995.
  - Bangladesh is COD-AB's admin0, simplified at 500 m; the antipode is
    that outline with every vertex at (lon − 180°, −lat), and Dhaka's
    antipode point the same flip of COD-AB's capital point. The build fails
    if COD-AB disagrees with the seed at the card's values: the Tropic of
    Cancer crosses 9 districts, 90°E crosses 9, and they meet in Faridpur —
    the editor's check in the seed's `review`.
  - The imagery is NASA's Blue Marble: Next Generation, July, with
    topography and bathymetry, cut by
    `tools/build-latitude-longitude-imagery.mjs` into WebP tiles, z0–3,
    quality 75: `imagery.pmtiles`, 905,573 bytes, 79,929 of them read when
    the globe opens on a 390 px phone. It fades out between z3 and z4 over
    `world-light`, which draws no coastline — so no false ring at 85.05°S,
    where the world basemap's coastline stroke drew one on a globe. ⓘ
    credits "NASA Earth Observatory", linked to the product's page, and
    nothing names NASA otherwise, as NASA's terms ask.
  - The globe opens on Bangladesh. Its picker lists every record, in the
    seed's order, by its `nameBn` (`chipBn` is a category several records
    share, never a selector's label; it is the card's chip), under the
    placeholder the user approved, «একটি রেখা বা স্থান বেছে নিন…»
    (2026-09-28), ending in the ellipsis every map's placeholder ends in.
    The card shows every Bengali field a record has, in the seed's
    order, under the words the user approved (2026-09-27): «অক্ষাংশ» for a
    parallel's value and `latBn`, «দ্রাঘিমাংশ» for a meridian's value and
    `lonBn`, «সময়» for `timeBn`, «নিকটতম স্থলভাগ» for `nearestBn`,
    «অবস্থান» for `whereBn`; `factBn` and `ruleBn` read on their own, as does
    a value no label was approved for (the date line's, a point's). The
    antipode button reads «প্রতিপাদে যান» on Bangladesh's card and
    «বাংলাদেশে ফিরুন» on the antipode's. No other Bengali is shown but the
    seed's, and the validator holds every one of these. The latitude and
    longitude show beside Bangladesh (at its outline's inner point) and
    Dhaka. At 320×640 the prime meridian's name is hidden at the opening
    view, where the line runs along the globe's edge with no room for it (the
    user accepted it, 2026-09-28); it shows when the line is selected or
    turned into view. Nothing on it is pending.
