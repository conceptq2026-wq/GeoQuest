# bangladesh-rivers-map — the rivers on the map shell

The Rivers of Bangladesh seed drawn by the map shell (MapLibre), beside the SVG
diagram `bangladesh-rivers`, which stays live and maintenance-only (the user's
decision, Prompt 51 Part B, 2026-09-30); its four built files stay byte for
byte what they were. Live since 2026-09-30, with the diagram: on the home
page this map is «নদী ২», captioned «ম্যাপে নদী বেছে শাখা-উপনদী ও গতিপথ দেখুন»,
and the diagram «নদী ১» (`tools/home-cards.json`). Built in
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
- **Two tabs, two views of one map** (M3, the user's rules, 2026-09-30; R-55,
  2026-10-05):
  - «বাংলাদেশে» shows Bangladesh only (R-55). Every line is split, at build
    time, into the pieces inside COD-AB's outline widened by a 500 m band
    (`BD_BAND_M`, `tools/lib/rivers-cut.mjs`), so a reach that follows the
    border is not cut into bits where the two traces part.
    - The band keeps 23 lines' border reaches: main, dharla, teesta, atrai,
      gangaPadma, mahananda, mahananda3, mathabhanga, kapotaksha, punarbhaba,
      pagla, tangon, harinbhanga, ichamati, baral, surma, kushiyara, manu2,
      gumti, khowai, feni, muhuri and naf.
    - An inside piece under 1 km between reaches outside is a flicker and is
      dropped: one, 0.97 km of the Kushiyara.
    - The tab draws, names and takes taps on those pieces only (`bd-lines`,
      `bd-connectors`: 74 pieces, 16 of the 19 connectors). The whole-course
      sources are hidden there, with their tap zones. So are the names and
      markers outside (4 names, the Yarlung's among them, and the origin
      marker), through `tabs.views.bd.hide` (`notes/shell.md`).
    - Two cards have no inside piece, Bhagirathi and Barak. «বাংলাদেশে»
      leaves them out of its picker and ‹ › (the user's decision, 2026-10-05;
      `hide.records[].picker`, `notes/shell.md`). «পুরো পথ» lists them as
      before. Chosen there, a switch to «বাংলাদেশে» clears the selection and
      shows its rest view. Their `frameBd` is the rest frame, unused.
    - Nothing else opens either: no card row links a river, no marker is
      theirs, and their names are hidden in «বাংলাদেশে». A selection of one
      from anywhere while «বাংলাদেশে» is open would open «পুরো পথ».
  - A selection there is framed on the inside pieces of the river and its
    descendants, not its ancestors (`frameBd`). The ancestors stay drawn,
    inside Bangladesh only, lighter. At rest the tab frames the main rivers'
    inside pieces: 88.02, 20.73, 92.63, 25.74.
  - **A frame keeps a name** (the user's default, 2026-10-05,
    `tools/lib/bd-labels.mjs`):
    - A frame's square (the room above the card is about square) must hold a
      district's label point as bangladesh.pmtiles draws it (from z7).
    - Otherwise the frame takes in the nearest one, with room for its name
      (0.06° × 0.02° a side). Seven frames: Kirtankhola, Harinbhanga, Rupsa,
      Mogra, Halda, Matamuhuri and Naf. The other 41 are their inside pieces,
      as before.
    - The deepest frame is now z10.53 (Buriganga, unchanged), down from 11.
      Rupsa opens at 9.72 (390 px) and 9.16 (320 px), Bagerhat's name in view.
  - The open card takes at most 40% of the map's height and scrolls inside
    itself; the frame fits the room above it (`sheetMaxHeight: 0.4`,
    `notes/shell.md`).
  - Zoom with the card open, before → after:
    - 390 px: Rupsa 6.51 → 11 (the map's maxZoom), Tista 6.79 → 8.24,
      Brahmaputra–Jamuna 5.09 → 6.53, Padma 5.81 → 5.79;
    - 320 px: Rupsa 6.17 → 10.95, Tista 5.73 → 7.57, Brahmaputra–Jamuna
      3.67 → 5.99, Padma 4.56 → 5.16.
  - «পুরো পথ» frames, as «বাংলাদেশে» does, the river and its descendants —
    every piece, inside and out, with a margin (`frameWhole`: 5% of the span
    a side, at least 0.1°) — not its ancestors, which stay drawn, lighter
    (the user's decision, 2026-10-05). A card whose origin is reached through
    another card's line (`origin-reached`) frames that line too, to its
    head. The Meghna's Barak is already a descendant through the Kushiyara,
    so this changes no card today. Every selection's frame keeps clear of the
    top-right controls (`frameClearsControls`, `notes/shell.md`, 2026-10-06):
    70 px on the right at 320 and 390. With nothing
    selected it rests on every main river whose system — the river and its
    descendants — has a reach outside, framed on all of those systems: the
    Jamuna, the Padma, the Meghna (by the Barak, Gumti, Khowai and Manu; R-55),
    the Karnaphuli (by the Khawthlangtuipui, Stage 4), the Feni and the Naf.
    Its frame is 77.16, 19.86, 96.35, 31.92 since Stage 4: the Ganga's course
    reaches 78.0°E near Haridwar.
  - «পুরো পথ» pans within bounds of its own (R-56, `views.whole.maxBounds`).
    They hold its rest frame fitted to the width of a map up to 2.2 times as
    high as wide.
    - R-56: 80.5, 10, 97, 40. Under the map's own 19–32°N, a phone held
      upright had stopped at z5.12, with the Tibetan reach cut off.
    - Stage 4: **77, 5, 97, 44** (the S4-1 estimate, 77.5, 7, 97, 43, read
      only the Gangotri head, not the course's 78.0°E at Haridwar).
    - Rest view: z3.75 at 390 × 844, z3.45 at 320 × 640 (R-56: 4.17 and 3.86).
  - «বাংলাদেশে» and the map keep the map's own bounds, 80.5, 19, 97, 32: the
    map-only upstream reaches are left out of them, and out of «বাংলাদেশে»'s
    pieces. world.pmtiles covers the globe (±85.05°, z0–10).
  - Until 2026-10-05 a whole-course frame held the card's ancestors too, so
    Stage 4 had widened 26 frames (Gorai to Gangotri, Teesta all of Tibet).
  - Chosen, z at 390 / 320, before → after:
    - Teesta 4.04 → 6.54 / 3.7 → 5.88; Gorai 4.09 → 8.12 / 3.75 → 7.37;
      Barak 5.94 → 7.04 / 5.6 → 6.7;
    - unchanged: Padma 4.09 / 3.75, Meghna 5.74 / 5.4, Karnaphuli 7.48 /
      6.95, Brahmaputra–Jamuna 4.04 / 3.7.
  - Zoom with the controls kept clear, at 390 / 320, before → after: Meghna
    5.74 → 5.49 / 5.4 → 5.08; Barak 7.04 → 6.78 / 6.7 → 6.37; Padma 4.09 →
    3.84 / 3.75 → 3.43; Teesta unchanged, 6.54 / 5.88 (its frame clears
    them already). The rest views do not move.
  - **Disabled rule** (the user's rules, 2026-10-05 and 2026-10-06): «পুরো পথ»
    is enabled for a card only where the card, its descendants or its
    origin-reached line reach outside Bangladesh **beyond the 500 m band**
    «বাংলাদেশে» uses (R-55). A border river's trace that parts from COD-AB's by
    less than that is no reach outside. Ancestors no longer count.
    - Until 2026-10-05 the rule read the whole set, ancestors included, and
      1 km outside COD-AB's outline.
    - Disabled: greyed, still in
    the bar, 44 px, aria-disabled; a tap does nothing, and ⓘ's row says «এই
    নদীর বাংলাদেশের বাইরের কোনো অংশ এই মানচিত্রে আঁকা নেই।». A selection that
    disables the open tab opens «বাংলাদেশে», framed there.
  - **27 cards disabled:**
    - pashur, titas, tetuliaBarishal, burishwar, mogra, sangu, matamuhuri
      (before);
    - karatoya, dhaleshwari, banshi, shitalakshya, oldBrahmaputra, buriganga,
      gorai, madhumati, arialKhan, kirtankhola, kumar, bhairab, rupsa,
      nabaganga, chitra, kasalong and halda (nothing outside of their own);
    - kapotaksha (2.89 km), baral (0.2 km) and surma (19.27 km): outside
      COD-AB's outline, but only within the band.
  - The selection stays when the tab changes.
- **Focus** (`notes/shell.md`): at rest only the tab's rest set; a selection
  draws that river, all its descendants and every ancestor up to its main
  river, no sibling; the ancestors lighter, for context (lines at 0.45 of
  their opacity, names at 0.6), through the selected card's `ancestors` and
  `ancestorNames`. Everything else is hidden, not greyed; the picker lists all.
- Lines by role in the diagram's colours; dashed outside Bangladesh where the
  seed splits a line at COD-AB's border (the Feni and the Ichamati stay solid,
  border rivers); a white halo, the selected river's lit. The legend lists a
  dashed reach, «বাংলাদেশের বাইরে», only while a drawn river has one, and only in
  «পুরো পথ», the one tab that draws it (`legend.kinds[].tab`, R-55).
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

In part: dharla, mahananda, manu, naf, feni and sangu.

Listed as reaching the origin the seed states, with their evidence
(`mapUpstreamReached`):
- main (its pinned origin point); ichamati (its head meets the Mathabhanga);
- teesta (in Sikkim); pagla and khowai (in India, the origin row's word);
  gumti (in Tripura); muhuri (South Tripura); bhagirathi (Murshidabad);
- since Stage 4 batch 1 (2026-10-05):
  - padma: in the HIMALAYAS region and in Uttarkashi (geoBoundaries);
  - barak: in Manipur, IND-2478;
  - meghna: `origin-reached`, a new evidence kind — the card its origin row
    names (the Barak) is itself listed here;
  - karnaphuli: in Mizoram, IND-3300;
- rising in Bangladesh (a district of the pinned Bengali list in the origin
  row): mathabhanga, kapotaksha, harinbhanga, baral.

Every card whose chain begins outside Bangladesh is in one list or the other,
or the build stops.

**The cut rule** (R-55, 2026-10-05, `tools/lib/rivers-cut.mjs`):
- A card listed as reached is CUT when its head line's upstream end lies
  within 1 km (`CUT_TOL_M`) of the outline of a box the rivers snapshot
  selected that line's ways in (`tools/extract-bangladesh.mjs` takes a river
  by name only inside its own box).
- A cut card gets the map's upstream ⓘ line, built by the map from the
  approved sentence after the card's name, as every upstream line has it.
- The seed's `mapUpstreamReached` is unchanged and its evidence still holds.
  The rule overrides it from the drawn course; no seed file moved.
- **Refined** (the user, 2026-10-05): a line whose upstream end joins its
  parent has reached its source, however near a box's edge it lies.
  - Joining means within 50 m of the parent's drawn course, or the start of
    a connector to it (`headJoins`).
  - The build and the validator read the same helper.
- The 12, end to box outline:
  - main 900.102 km (its pinned origin in Tibet; the brahmaputraJamuna box);
  - **teesta 0.122 km** (its teesta box's 27.6°N; it joins its parent at its
    other end): cut;
  - bhagirathi 0.714 km (the hooghly box's 24.5°N), but its head joins the
    Ganga by its 7.4 km connector: reached, no upstream ⓘ line (R-56);
  - ichamati, kapotaksha and baral also join their parents at their heads.
  - ichamati, pagla, khowai, gumti, muhuri, mathabhanga, kapotaksha,
    harinbhanga and baral: no box (every way read by its id, whole).
- **By id** (the user, 2026-10-05, Stage 4): a head line whose upstream end
  lies on a way read by its id has reached its source when that end is the
  way's own, named head (`byIdHead`); trimmed short of it, it is cut.
  - Every listed card ends so today. The Teesta is drawn to the Lachen Chu's
    head, so it is no longer cut.
- `tools/verify-descriptor.mjs` re-reads the rule off the built lines, so a
  future river can't be counted reached by mistake.

## Stage 4: the upstream reaches

**Batch 1, drawn** (the user's decisions, 2026-10-05, from the S4-1 investigation):
- Map-only lines (`only: "map"`), each before its card's head line and ending
  on its first node, with no gap and no trim.
- Each comes from a new by-id extract, `osm-bangladesh-rivers-<system>-s4`,
  pinned in `tools/sources.json` by size and SHA-256. The lines are pinned in
  the map pins file's `lines`, and the five seed files re-pinned.
- **All these pins were approved by the user as part of the batch.**

| Line | Card | OSM | Added | Raw / gzip |
|---|---|---|---|---|
| gangaUpper | Padma | relations 1236345 and 1236089, 35 ways, to the Gangotri glacier (Uttarkashi) | 2,058 km | 95,191 / ~32,894 B |
| barakUpper | Barak (the Meghna through it) | relation 5904028, 9 ways, to Senapati, Manipur | 401.6 km | 37,707 / ~12,490 B |
| khawthlangtuipui | Karnaphuli | 2 ways, to its named head in Lunglei, Mizoram | 79.9 km | 13,546 / ~3,250 B |
| lachenChu | Teesta | relation 19299440, 4 ways, from Chungthang | 89.5 km | 13,982 / ~4,506 B |

- **Styles:** dashed outside, as their cards' head lines split at the border.
  - The Khawthlangtuipui's last reach zigzags across COD-AB's border: 12 solid
    and 12 dashed pieces.
  - The Lachen Chu is solid, as the Teesta's line is.
- **Labels:** none of their own. This Bhagirathi is the Ganga's headstream,
  not the map's «ভাগীরথী» card (the Hooghly).
- **Not drawn, by the user's decision:** the Tuiliampul, the Tuichawng, the
  Lachung Chu and the Zemu Chu.
- **Size:** the map's folder grew from 1,209,081 B to 1,368,090 B (+159,009;
  +53,530 B gzip, to 414,564 B). Every line loads with the map, whichever tab
  opens first.

**Still missing, each keeping its upstream ⓘ line:**
- **Dharla / Jaldhaka** (on hold): ends at 88.8738°E 26.6993°N. BWDB
  (bwdbNW59 §1.1) says the Jaldhaka rises in South Sikkim; OSM's relation
  12420354 heads in East Sikkim (89.4 / 86.8 km). Waits for that conflict to
  be ruled.
- **Mahananda**: OSM's named river begins at our end, 88.3622°E 26.8666°N;
  only unnamed streams flow in.
- **Manu**: OSM's «Manu» begins at our end, 92.0366°E 23.8352°N, already in
  Tripura; only unnamed ways above.
- **Naf**: OSM's relation is a tidal channel to the sea from our end,
  92.1805°E 21.1592°N; its one upstream member, «Modhur Chhora» (13.4 km),
  rises in Bangladesh, not in Myanmar's northern hills.
- **Feni**: OSM's «ফেনী নদী» begins at our end, 91.7838°E 23.3252°N; nothing
  flows in.
- **Sangu**: OSM's «সাঙ্গু নদী» begins at our end, 92.6074°E 21.2725°N;
  nothing flows in.
- **Bhagirathi**: reached since R-56; its 7.4 km connector to the Ganga stays.

## Stage 4 before batch 1 (R-55, notes only, nothing fetched)

Each card's current upstream end, as the map draws it, and what drawing the rest
would need. Every source named is a new pinned extract, fetched only on purpose.

- **Padma — the Ganga's upper course**: ends at 87.8726°E 25.0607°N (Bihar).
  Needs the Ganga upstream to the Gangotri glacier (the origin row): OSM
  ways by id, or Natural Earth's 10m rivers (already pinned) for the upper
  course, as the main line takes its Tibetan reach.
- **Barak — to its source**: no inside piece. Ends at 92.9091°E 24.7511°N
  (Assam). Needs OSM ways of the Barak in Manipur and Nagaland.
- **Meghna**: its origin row is the Barak's; drawn once the Barak is.
- **Karnaphuli in Mizoram**: ends at 92.3761°E 22.9288°N. Needs OSM ways of
  the Karnaphuli (Khawthlangtuipui) in Mizoram (the «লুসাই পাহাড়»).
- **Teesta in north Sikkim**: ends at 88.6489°E 27.6011°N (cut, the box's
  edge). Needs OSM ways of the Teesta north of 27.6°N, a box or way list
  reaching its source in Sikkim.
- Bhagirathi: off this list since R-56. Its head, 88.0913°E 24.4936°N, joins
  the Ganga by its 7.4 km connector. Drawing that gap as the river would
  need OSM ways of the Bhagirathi up to its offtake near Dhulian.
- **Dharla**: ends at 88.8738°E 26.6993°N. Needs the Jaldhaka's OSM ways to
  south Sikkim.
- **Mahananda**: ends at 88.3622°E 26.8666°N. Needs its OSM ways in the
  Darjeeling hills.
- **Manu**: ends at 92.0366°E 23.8352°N. Needs its OSM ways in Tripura.
- **Naf**: ends at 92.1805°E 21.1592°N. Needs its OSM ways in Myanmar.
- **Feni**: ends at 91.7838°E 23.3252°N. Needs its OSM ways in Tripura.
- **Sangu**: ends at 92.6074°E 21.2725°N. Needs its OSM ways in the north
  Arakan hills (Myanmar).

## `only`

"map" keeps a seed item to the map, "diagram" to the diagram; absent, both
draw it. It may stand on a card, a marker, a continuation, an ⓘ line, a line
of `geometry.lines`, a map place or a `mapUpstreamReached` card — nowhere else
(`tools/lib/rivers-core.mjs` refuses it elsewhere). Each build reads the seed
less the other's items and asserts that none of their ids or texts reaches its
files; the validator holds both directions; the words only the map shows are
`ui.mapOnlyBn`. The map's own lines are pinned in the map pins file's `lines`:
gangaUpper, barakUpper, khawthlangtuipui and lachenChu (Stage 4, 2026-10-05).

## How it is built

- **`tools/build-bangladesh-rivers-map.mjs [out]`** writes the descriptor, the
  records (`rivers.json`, `marks.json`, `names.json`, `places.json`,
  `views.json`), `info.json`, the lines (`lines-in.geojson` solid,
  `lines-out.geojson` dashed, `connectors.geojson`; «বাংলাদেশে»'s
  `bd-lines.geojson` and `bd-connectors.geojson`, R-55) and one SVG per marker
  kind into `docs/maps/bangladesh-rivers-map/`, through
  `tools/lib/rivers-core.mjs` (the same chains, the same 68 pins, and the
  map's own four lines, 72 in all).
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
fitTab, idleByTab, minTextSize, the views' `hide`, `sheetMaxHeight` and the
legend's `tab` among them), and every card, row, null, marker, name, view,
ⓘ line, credit, upstream line and word against the seed. Since R-55 also:
- «বাংলাদেশে» draws Bangladesh only: every vertex of `bd-lines` and
  `bd-connectors` inside COD-AB's outline or within the band; every name and
  marker outside it hidden there.
- The cut rule, read off the built lines.
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

- Settled by R-55 (2026-10-05): the card takes at most 40% of the map, and the
  frame fits the room above it.
- Settled by R-56 (2026-10-05): Bhagirathi and Barak are out of «বাংলাদেশে»'s
  picker; Bhagirathi is reached; «পুরো পথ» pans wider; a frame keeps a
  district's name.
- The Karnaphuli's «আসামের লুসাই পাহাড়» (origin row, cited) = today's Mizoram:
  no ⓘ line yet (2026-10-05). No authoritative source was reachable with the
  project's User-Agent:
  - Banglapedia (en and bn) answers "Hello World :-)";
  - india.gov.in (Know India), mizoram.gov.in and mdoner.gov.in answer 403,
    and mizoram.nic.in fails;
  - ten Mizoram district sites (nic.in) are reachable, but none says the
    Lushai Hills became Mizoram (Lunglei's names the Lushai Hills District
    of 1898, under Assam, only).
  - Needs a source the user names.
