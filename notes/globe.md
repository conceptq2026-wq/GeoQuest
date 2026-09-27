# The globe

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## The map baseline — the globe

**A second, the user's too (2026-09-27): a globe map has no tilt button.** The
globe stays upright: a drag turns it, a pinch zooms it, nothing tilts or
rotates it. The shell draws the compass only where a map can rotate and the
tilt button only where it can tilt (`maxPitch` above 0), so every flat map
keeps both. A globe map keeps the picker row, the same bar in the same place,
size, style and behaviour as every other map's (the user's decision,
2026-09-28, which replaced the pill row it first had). Every map but one with
a timeline keeps the picker. It is enforced both ways: the validator fails a
map with neither a picker nor a timeline and a map with both; the timeline
throws if a picker is declared beside it, and the globe module throws with no
picker or with a timeline.

## Data model — `globe`

- **`globe`** draws a map on a globe, by the shell's globe module (see
  **Shell modules**): `{ size, open, imagery?, edgeLabels, coordinates?,
  antipode? }`, nothing else; its table is its picker's. `size` is the
  globe's diameter as a share of the map's shorter side; `open: { record }`
  faces the viewer when the map opens. `imagery: { file, fadeOut }` names a
  raster PMTiles archive in the map's own folder — PMTiles v3, raster tiles
  from z0 — and the two zooms between which it fades out over the vector
  basemap; the archive's own metadata carries its credit, which the
  validator requires in ⓘ as a link. `edgeLabels: { source, text, colour:
  { style, paint } }` names each line of `source` — a source of the
  picker's table with a geometry file — at the globe's edge, in its colour
  (a literal, `get`, or `match` on `get`). `coordinates: { at, lines,
  minZoom }` shows `lines` beside every record with a point in `at`, from
  `minZoom`; the validator requires every such record to have every line.
  `antipode: { between: [a, b], labels: { a, b }, duration }` is the button
  on those two records' cards. `flyTo` is the globe's action: the validator
  fails it on a map with no globe.

## Shell modules — the globe module

- **`globe`** (`docs/shell/globe.js`, `globe.css`; the term under **Data
  model**) draws the map on MapLibre's own globe projection, held upright:
  no rotation, no tilt. It opens with `open` facing the viewer, the globe
  `size` of the map's shorter side, the camera sized from MapLibre's own
  globe geometry before the first frame; when the card docks or closes, a
  globe seen whole is fitted again. Everything the module draws over the
  globe is placed by its own projection of MapLibre's globe at pitch 0,
  within 0.001 px of `map.project` at every zoom.
  - **The picker row** is the map's selector, the shell's own, exactly as
    on every map (the user's decision, 2026-09-28, replacing a pill row):
    `globe.css` gives the header the inset every map's page gives it on a
    phone, 10 px, while the globe itself spans the page's width. Choosing
    a record, or ‹ ›, runs the picker's `do` — on latitude-longitude
    select and `flyTo`, 1.8 s; the shell keeps the dropdown on the
    selection, whatever made it (a tap, the antipode button), and back on
    its placeholder when the card closes or a tap finds nothing. A line is
    turned to the least way (the least change of longitude and latitude
    together) into the globe's middle, seen whole from no further toward a
    pole than 40°; a pole comes to the middle's top or foot; a place is
    fitted to its frame. A flight cut short, by another or by a drag, runs
    nothing after it.
  - **The poles**: a record whose point lies beyond ±85.05°, which the map's
    point layers cannot draw, is taken off them — every layer on a point
    source of the table, its tap layer too, filtered by the records' keys,
    not the shell's `hide`, so the picker and ‹ › keep it — and drawn as a
    named marker at its true place, hidden and untappable on the far side.
  - **Each line's name at the globe's visible edge**, with a short leader
    to a dot on the line just inside it: where the line leaves the visible
    globe — its edge, or the map's where the globe is larger than the map —
    a parallel's name first on the left, any other line's at the bottom.
    The names on one side stand in the order of their lines there, moved
    apart as little as they can, so no two overlap and no leaders cross; a
    name blocked by a control, a pole's name, a callout or a place's dot or
    name slides along its side, then tries its line's next crossing, and is
    hidden when it has none. The selected line's name is placed first and
    filled; a line out of sight has none. Measured: 0 overlaps over 72 views
    round the globe at 390×844 and 320×640.
  - **Latitude and longitude beside a place** (`coordinates`), from z3.2
    on latitude-longitude — below it Bangladesh is under about 30 px across
    — while the place faces the viewer: one line per value, never broken,
    the selected place's first, each in the first box round its place that
    covers nothing else and no place's point.
  - **Taps are the module's**, in the user's order (2026-09-28): the nearest
    dot within 14 px; else the nearest line within 14 px, lines within
    1.5 px of each other (as at a crossing) going by the picker's order; else the
    smallest area under the finger, measured on its whole outline. Only what
    faces the viewer counts — a dot in front, a line's run in front, an area
    holding the tap's own point on the front of the globe, found by the
    module's own inverse projection (within 0.0001 km of MapLibre's) — so
    nothing on the far side is ever hit; a tap on nothing closes the card.
    On latitude-longitude the Tropic of Cancer × 90°E crossing, in Faridpur,
    selects Dhaka at the opening zoom, whose dot lies 1 px from it, and the
    Tropic of Cancer at z5.2, by the picker's order; a tap on either line inside
    Bangladesh selects that line, one 20 px or more from both selects
    Bangladesh, one inside the antipode's outline the antipode, and the
    equator × 90°E the equator.
  - **The docked card**, as the timeline's: shown while a record is
    selected, with a × that clears the selection, its chip tinted with the
    record's colour. On a record of `antipode.between` it carries one button,
    kept at the card's foot while a long card scrolls under it, that turns the
    globe to the other place over `duration` (2.6 s) — a jump with reduced
    motion — and opens its card on arrival. From the tap until the map is
    idle again, the pair's outlines and points are drawn by the module's own
    overlay, as the descriptor's layers draw them, since the map's own tiles
    for the far side load only as it turns into view; then they are handed
    back. Measured by frame: 0 frames without the outline or the point, both
    ways, at both phone sizes, with and without reduced motion.
  - Measured (2026-09-28): the module is 61,646 bytes (19,621 gzipped); its
    work each frame 0.2–0.4 ms on this machine (1.4–2.3 ms at 4× CPU
    slowdown); the globe turns at 50 fps at 4× CPU slowdown on this machine's
    GPU, 15 fps in software rendering.
