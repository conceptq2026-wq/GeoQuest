# bangladesh-rivers-map — the rivers on the map shell

The Rivers of Bangladesh seed drawn by the map shell (MapLibre), beside the SVG
diagram `bangladesh-rivers`, which stays live and maintenance-only (the user's
decision, Prompt 51 Part B, 2026-09-30); its four built files stay byte for
byte what they were. Work in progress: in `tools/wip.json` only (the preview's
cards «নদী ১», the diagram, and «নদী ২», this map), not in the registry. Built in
stages: M1 the shell capabilities (`notes/shell.md`), M2 the Bangladesh view,
M3 «পুরো পথ», M4 parity with the diagram — all done, 2026-09-30.

## What is on it

- All 68 lines of the seed, each drawn whole as its pin holds it (from the
  Jamuna's origin in Tibet), 10 markers (the Bangladesh frame's 9 and the
  origin) and 56 names (the Bangladesh frame's 55 and the whole-course frame's
  Yarlung) — no other name, inside Bangladesh or out, each on its own reach.
  All 50 cards in the picker, grouped by system. Basemap `bangladesh-wide`
  (`notes/basemaps.md`): the neighbours plain grey, country names only, no
  basemap river, the district names the basemap's own from z7; the 27.6°N
  seam draws no line in either tab (checked on the shots, 2026-09-30).
- **Two tabs, two views of one map** (M3, the user's rules, 2026-09-30):
  - «বাংলাদেশে» opens on Bangladesh. A selection is framed on the parts inside
    Bangladesh (COD-AB) of what it draws — the river, its descendants, its
    ancestors (`frameBd`).
  - «পুরো পথ» frames the same set whole, with every pinned reach outside and a
    margin (`frameWhole`: 5% of the span a side, at least 0.1°). With nothing
    selected it rests on the main rivers with a reach outside — the Jamuna,
    the Padma, the Feni and the Naf — framed on all of them.
  - **Disabled rule:** «পুরো পথ» is disabled for a selection whose set has no
    reach outside Bangladesh — a card's lines running at least 1 km outside
    COD-AB's outline; the build refuses a disabled set that has any piece
    outside at all, so its note is exactly true. Disabled: greyed, still in
    the bar, 44 px, aria-disabled; a tap does nothing, and ⓘ's row says «এই
    নদীর বাংলাদেশের বাইরের কোনো অংশ এই মানচিত্রে আঁকা নেই।». A selection that
    disables the open tab opens «বাংলাদেশে». Ten cards: pashur, titas,
    tetuliaBarishal, burishwar, mogra, karnaphuli, kasalong, halda, sangu,
    matamuhuri. The selection stays when the tab changes.
- **Focus** (`notes/shell.md`): at rest only the tab's rest set; a selection
  draws that river, all its descendants and every ancestor up to its main
  river, no sibling; the ancestors lighter, for context (lines at 0.45 of
  their opacity, names at 0.6), through the selected card's `ancestors` and
  `ancestorNames`. Everything else is hidden, not greyed; the picker lists all.
- Lines by role in the diagram's colours; dashed outside Bangladesh where the
  seed splits a line at COD-AB's border (the Feni and the Ichamati stay solid,
  border rivers); a white halo, the selected river's lit. The legend lists a
  dashed reach, «বাংলাদেশের বাইরে», only while a drawn river has one.
- No text under 14 px (`minTextSize: 14`, M3): the labels floored, the card,
  the tabs, the Tilt button and ⓘ at 14 px; `tools/check.mjs` scans the page
  and the style.
- Cards: the seed's rows in `ui.rowOrder`; a null stays null in the records —
  the shell hides it, the validator counts it: the same 48 the diagram leaves
  out. A marker's card is «name — kind» with its one row.
- ⓘ: the seed's 84 credits as links (the diagram's 81, and Natural Earth's
  lakes, admin-1 and regions), its notes and conflicts under the seed's
  headings — the diagram's, but for the items `only` keeps to one product.
- **Kaptai Lake** is drawn by the basemap (Natural Earth's 10m lakes) and named
  «কাপ্তাই লেক», the NCTB book's map label (ভূগোল ও পরিবেশ, p. ১৫৩, fig. ১০.৩):
  the seed's map-only place `kaptaiLake`, its outline pinned in
  `tools/bangladesh-rivers-map-pins.json`; its name 15 px under the rivers'
  names, which win a collision (at the opening it yields; framed on the
  Karnaphuli it shows). The two ⓘ lines saying the lake is not drawn are the
  diagram's (`only: "diagram"`); the map shows its own two.

## The upstream rule (M3 item 4, 2026-09-30)

A card whose origin row names a place outside Bangladesh and whose drawn
course does not reach it gets a map-only ⓘ line «<name>: এই নদীর উজানের পুরো
অংশ এই মানচিত্রে আঁকা হয়নি।» (the user's sentence, after the card's name as
every ⓘ line has it). Decided from the seed and the pins only; each piece of
evidence stands in the seed and the build re-checks it against the pinned file:

- the chain begins inside COD-AB's Bangladesh (Karnaphuli, Feni, Sangu, Meghna);
- its upstream end lies outside the place the origin row names, in a pinned
  Natural Earth polygon (Dharla: not Sikkim, IND-3259; Padma and Mahananda:
  not the HIMALAYAS region; Barak: neither Manipur nor Nagaland);
- the seed's own note on the line records an undrawn upper course (Barak,
  Manu, Naf);
- its origin is a river itself drawn in part (Meghna: the Barak).

In part: dharla, padma, mahananda, barak, manu, naf, meghna, karnaphuli, feni,
sangu. Listed as reaching the origin the seed states, with their evidence
(`mapUpstreamReached`): main (its pinned origin point), ichamati (its head
meets the Mathabhanga), teesta (in Sikkim), pagla and khowai (in India, the
origin row's word), gumti (in Tripura), muhuri (South Tripura), bhagirathi
(Murshidabad); and rising in Bangladesh (a district of the pinned Bengali list
in the origin row): mathabhanga, kapotaksha, harinbhanga, baral. Every card
whose chain begins outside Bangladesh is in one list or the other, or the
build stops. The Teesta's chain ends at 27.601°N, on the snapshot's box, yet
inside Sikkim, the region its origin row names: reached, by the rule.

## `only`

"map" keeps a seed item to the map, "diagram" to the diagram; absent, both
draw it. It may stand on a card, a marker, a continuation, an ⓘ line, a line
of `geometry.lines`, a map place or a `mapUpstreamReached` card — nowhere else
(`tools/lib/rivers-core.mjs` refuses it elsewhere). Each build reads the seed
less the other's items and asserts that none of their ids or texts reaches its
files; the validator holds both directions; the words only the map shows are
`ui.mapOnlyBn`. The map's own lines, when there are any, are pinned in the map
pins file's `lines`.

## How it is built

- **`tools/build-bangladesh-rivers-map.mjs [out]`** writes the descriptor, the
  records (`rivers.json`, `marks.json`, `names.json`, `places.json`,
  `views.json`), `info.json`, the lines (`lines-in.geojson` solid,
  `lines-out.geojson` dashed, `connectors.geojson`) and one SVG per marker
  kind into `docs/maps/bangladesh-rivers-map/`, through
  `tools/lib/rivers-core.mjs` (the same chains, the same 68 pins).
- Each line is its pinned chain, split at the border, simplified by
  Douglas–Peucker at 14 m; every chain vertex within 15 m of the drawn segment
  (worst 14.01 m, the Kasalong), every drawn vertex on its chain. The main line
  crosses itself once, at 95.147°E 27.644°N in Assam — in the pinned chain
  itself (OpenStreetMap's ways), drawn as pinned; the build refuses any
  crossing the simplification adds.
- Connectors on the map's own lines, in metres: 19 (the diagram's frame has
  24; five end within 50 m of their parent at the map's precision).

## What is checked

`tools/verify-descriptor.mjs` (its section): the generic checks (view tabs,
fitTab, idleByTab, minTextSize among them), and every card, row, null, marker,
name, view, ⓘ line, credit, upstream line and word against the seed.
`tools/verify.mjs`: the diagram's checks a–g in metres on the map's GeoJSON, the
build re-run to the same bytes, and the **parity** check (M4): the two
products' built files — the same cards in the same groups, their rows word for
word, the markers' cards, ⓘ's lines but the `only` items, the line ids and
roles, the pending facts. Old limit (the diagram, 1 u ≈ 512 m) → new:

- a. marker at its coordinate: 1 u and 500 m → 0.5 m.
- b. branch meets parent: 50 m and 12 km unchanged; a connector's ends
  within 0.5 m.
- c. entry on the border: 500 m or 1 u → 0.5 m of COD-AB's.
- d. main line: from 0.5 m of the origin marker, pieces end to end within
  0.5 m (other main rivers 3.5 m), no duplicate, no crossing but the pinned
  chain's own, inside the map's bounds, its end 2 km from BWDB's Padma
  confluence.
- e. every piece a line of the frames on its own card.
- f. entry at the dash switch: 0.5 m each side.
- g. every marker of the Bangladesh frame in a district, 500 m; the district
  names are the basemap's.

`tools/check.mjs bangladesh-rivers-map` taps both tabs, frames each system's
first card in «পুরো পথ», taps a disabled tab, and scans the text floor.

## Decisions open

- The frame of a selection fits above the open card, which covers up to 62% of
  the screen (taller with 14 px rows): «বাংলাদেশে» frames the Jamuna at z5.09
  at 390 px and z3.67 at 320 px (the pan limit), though its box inside
  Bangladesh is 2.3° × 2.7°.
