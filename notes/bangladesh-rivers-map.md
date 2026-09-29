# bangladesh-rivers-map — the rivers on the map shell

The Rivers of Bangladesh seed drawn by the map shell (MapLibre), beside the SVG
diagram `bangladesh-rivers`, which stays live and maintenance-only (the user's
decision, Prompt 51 Part B, 2026-09-30). Work in progress: in `tools/wip.json`
only, on the local preview's home page, not in the registry. Built in stages:
M1 the shell capabilities (`notes/shell.md`), M2 the Bangladesh view (this
file), M3 «পুরো পথ», M4 parity with the diagram.

## What is on it (M2)

- The seed's Bangladesh frame: its 68 lines, 9 markers and 55 names, and all
  50 cards in the picker, grouped by system. Basemap `bangladesh-wide`
  (`notes/basemaps.md`): the neighbours plain grey, no basemap river, the
  district names the basemap's own, at 14 px from z7.
- **Focus** (`notes/shell.md`): at rest only the 9 main rivers and their names
  and markers; a selection draws that river, its own branches, and the chain of
  rivers it joins up to its main river — a branch of a branch keeps the branch
  between it and its main river, so it is never drawn cut off (18 cards sit
  below a branch). Everything else is hidden, not greyed; the picker still
  lists all 50.
- Lines by role in the diagram's colours; dashed outside Bangladesh where the
  seed splits a line at COD-AB's border; a white halo, the selected river's
  lit. Markers: the diagram's glyphs, a ring when selected. Names beside
  their line at 15 px, the main rivers' placed first.
- Cards: the seed's rows in `ui.rowOrder`; a null stays null in the records,
  so the shell hides it and the validator counts it — the same 48 the diagram
  leaves out. A marker's card is «name — kind» with its one row.
- ⓘ: the seed's 81 credits as links, then its 40 notes and 50 conflicts under
  the seed's headings, exactly as the diagram lists them.
- **Kaptai Lake** is drawn by the basemap (Natural Earth's 10m lakes, pinned).
  It has no name: the only Bengali name the seed cites is the NCTB book's map
  label «কাপ্তাই লেক» (ভূগোল ও পরিবেশ, p. ১৫৩, fig. ১০.৩), held in an ⓘ line's
  citation; a label needs a seed entry of its own, which moves the seed's pin —
  the user's decision. Two ⓘ lines say the lake is not drawn «in this
  picture»; true of the diagram, not of the map — the user's wording to come.

## How it is built

- **`tools/build-bangladesh-rivers-map.mjs [out]`** writes the descriptor, the
  records (`rivers.json`, `marks.json`, `names.json`), `info.json`, the lines
  (`lines-in.geojson` solid, `lines-out.geojson` dashed, `connectors.geojson`)
  and one SVG per marker kind into `docs/maps/bangladesh-rivers-map/`. It
  reads the seed through `tools/lib/rivers-core.mjs`, the diagram's own code
  moved there verbatim: the same chains, the same 68 pins.
- Each line is its pinned full-precision chain, split at the border, cut at
  the basemap's box (`COVERAGE`) and simplified by Douglas–Peucker at 14 m;
  the build then measures every chain vertex against the drawn segment and
  refuses anything over 15 m (worst 14.01 m, the Kasalong), and every drawn
  vertex against its chain (worst 0.08 m). 53,324 chain vertices, 26,399 drawn.
- Connectors are computed on the map's own lines, in metres: 19. The
  diagram's Bangladesh frame has 24; the five it has more (shitalakshya,
  mahananda3, kapotaksha, punarbhaba, manu2, 65–156 m) end within 50 m of
  their parent at the map's precision, so they need none.
- Nothing in the seed may carry `only` yet: the map-only flag (the user's
  decision) is built with the first map-only river, with its own pins in
  `tools/bangladesh-rivers-map-pins.json`.

## What is checked

`tools/verify-descriptor.mjs` (its section): the generic checks, and every card,
row, null, marker, name, ⓘ line, credit and word against the seed.
`tools/verify.mjs`: the diagram's checks a–g, in metres on the map's GeoJSON,
and the build re-run to the same bytes. Old limit (the diagram, in its frame
units, 1 u ≈ 512 m in the Bangladesh frame) → new:

- a. marker at its coordinate: 1 u and 500 m → 0.5 m (it is the coordinate).
- b. branch meets parent: 50 m, connector ≤ 12 km, its ends within 50 m →
  50 m and 12 km unchanged, the connector's ends within 0.5 m; the lines are
  within 15 m of the chains, not 0.8 u.
- c. entry on the border: 500 m or 1 u of the drawn border → 0.5 m of COD-AB's.
- d. main line end to end: gaps 500 m → 0.5 m; other main rivers' lines
  500 m → 3.5 m (the chains' 3 m and the rounding); duplicates, crossings and
  points outside the box 0, as before; its end 2 km from BWDB's Padma
  confluence, unchanged.
- e. every piece a line of the frame on its own card: unchanged (ids).
- f. entry at the dash switch: 500 m → 0.5 m each side.
- g. every marker in a district, 500 m: unchanged. The diagram's label checks
  (anchor inside, crossed by a line, marker districts named at the opening)
  have nothing to hold: the names are the basemap's, from z7.
