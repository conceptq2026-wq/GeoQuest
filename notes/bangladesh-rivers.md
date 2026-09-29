# bangladesh-rivers

A diagram in the Bangladesh section, «বাংলাদেশের নদ-নদী» / "Rivers of
Bangladesh": the Brahmaputra–Jamuna, its tributaries and its distributaries,
**a picture drawn in code**, not a tile map (the user's decision, Prompt 37,
2026-09-29). It is a pilot and **stays in the work in progress**
(`tools/wip.json`, kind `diagram`) — local preview only — until the user
finishes it. It is not in `docs/registry.json`.

## What is on it

- **Two tabs, one view type `rivers`:**
  - «পুরো পথ» — the whole course, lon 82–96, lat 22–31, viewBox
    `0 0 1000 715.2`. The main river, its origin marker and its border-entry
    marker only; no tributary, no distributary.
  - «বাংলাদেশে» — lon 88.47–91.33, lat 22.26–26.87, viewBox `0 0 1000 1771.4`,
    its south edge cut below the Padma–Meghna's end at 22.38°N. The main river,
    the Dharla, Teesta, Karatoya and Atrai (tributaries), the Dhaleshwari,
    Banshi, Shitalakshya and Old Brahmaputra (distributaries), the Padma and
    the Meghna as thin grey non-tappable continuations to the sea, and the
    markers.
- **The main line** ends at the Padma confluence (the book): Natural Earth's
  line to OSM vertex 60, OSM from there. The seam is 39.7 m at 95.14°E; OSM's
  Assam head is dropped. Piece 0 in the Bangladesh frame is dashed — it runs
  outside COD-AB's border — and piece 1 solid.
- **The border-entry marker** stands where the drawn line first crosses
  COD-AB's border, 25.7319°N 89.8272°E, on way 232252698 between vertices 47
  and 48 — snapped there (the user's decision, 2026-09-29) from BWDB's point
  in Nageshwari, 24.4 km north, which lies 6.9 km west of the drawn channel:
  upstream of the crossing, OSM's channel (ways 910696546 and 232252698) runs
  31 km along the line on the India side, 0.5–7.4 km east of the border. The
  seed keeps BWDB's point as `snappedFrom`, with the offset. COD-AB puts the
  crossing in Ulipur upazila, Kurigram. The «প্রবেশস্থল» row, on the main
  river's card and the marker's, is the book's «কুড়িগ্রাম জেলা» alone; ⓘ
  carries one plain line, the user's wording (the marker's `infoBn`): JRCB's
  and BWDB's Nageshwari, and that COD-AB puts the drawn crossing in Ulipur.
- **Connectors** (the user's rule, 2026-09-29): where a tributary's mouth or a
  distributary's head, as drawn, lies more than 50 m and at most 10 km from
  its drawn parent, the build adds a straight connector from that end to the
  parent's nearest point — the Dharla (2,566 m) and the Teesta (3,005 m) to
  the main line, the Shitalakshya (145 m, a gap the Old Brahmaputra's
  simplified line opens) to the Old Brahmaputra, and the Dhaleshwari's head
  (11,400 m) to the main line, the one entry on the allow-list (12 km, the
  user's decision; `CONNECT_MAX_M_FOR` in the build, `CONNECTOR_ALLOW` in
  `tools/verify.mjs`). They are `connectors` in the frame (id, parent,
  length in m, path data), never part of the sourced lines, drawn in the
  river's own group — its colour, width and highlight — with no tap zone.
  The Karatoya (17.6 km), Atrai (47.0 km) and Banshi (31.0 km) stay unjoined
  (the user's decision); the Dhaleshwari's mouth, 3.1 km from the drawn
  Meghna, has no connector.
- **The cards** (Prompt 40, the user's decisions of 2026-09-29): a tributary's
  or distributary's card gives «সম্পর্ক», «উৎপত্তি», «গতিপথ», and «মিলনস্থল»
  for a river that joins the main one or «পতিত স্থল» for one that falls into
  another (the Karatoya, Atrai, Dhaleshwari, Banshi, Shitalakshya and Old
  Brahmaputra); the Dhaleshwari keeps the book's «শাখা নদী» row (বুড়িগঙ্গা).
  The main river's card keeps its rows and gains «গতিপথ». Each value is the
  first in the source order — the books («ভূগোল ও পরিবেশ» before «বাংলাদেশ ও
  বিশ্বপরিচয়»), BWDB and JRCB, Bengali then English Wikipedia, newspapers,
  Banglapedia — in its source's words; a card follows its source's words
  where they differ from the drawn line. The Karatoya card is BWDB's NW-14,
  the river drawn. The Padma and the Meghna have no card. Wherever a card
  names «দেওয়ানগঞ্জ» with «ময়মনসিংহ জেলা» (the main river's and the Old
  Brahmaputra's «গতিপথ», the Old Brahmaputra's «উৎপত্তি»), the note «(বর্তমানে
  জামালপুর জেলা)» follows it.
- **A marker's card names only what COD-AB agrees with** (the user's policy,
  as for the entry): a marker's row keeps the part of its place — upazila or
  district — that contains the drawn marker, and the source's full wording
  goes to a plain ⓘ line with the drawn location. The Teesta's mouth, drawn in
  Gaibandha Sadar, shows «গাইবান্ধা জেলা»; BWDB's Sundarganj is in ⓘ. The
  build holds it (`teestaConfluence in Gaibandha district`). Rows with no
  marker (the origins and mouths of the unjoined and distributary lines)
  follow their sources.
- **ⓘ,** after the cited sources and the entry line, carries the seed's
  `infoBn.lines` as plain text, each citing its sources: the two lines on the
  drawn joins (the user's words), where COD-AB puts what a source places
  otherwise (Dewanganj in Jamalpur; the Karatoya's and Banshi's drawn lines
  beginning in Gaibandha and Tangail), the Karatoya from India (NW-13) that is
  not drawn, and one line per source conflict, the card's value first.
  Research for these cards: `tools/.cache/bangladesh-rivers/review2.csv` and
  `quotes.md` §6. Its Bengali lines are 14 px (`rivers.css`), not the
  credits' 12 px; the panel scrolls within 60 % of the screen (`style.css`).
- **The picker row** is the shell's, at the top, with one entry, the main river.
  A tap on a line or a marker opens its card; a marker's heading is composed
  «name — legend word». The legend lists only the kinds a tab draws. ⓘ carries
  every cited source and OpenStreetMap's credit, as plain links.
- **Names on the picture** are at least 15 px at 390 px wide (14 at 320),
  semi-bold, put beside their anchors where no other name, marker, the legend
  or ⓘ's tap zone is. Pinch and pan run 1×–6× in this module only.

## Inputs, all pinned

- **Editor's seed:** `data-sources/bangladesh-rivers/bangladesh-rivers.seed.json`
  — every word, its sources, the geometry recipe (way ids with trims, the joins,
  the frames, the label anchors) and a `review` of where sources differ. Its
  SHA-256 is pinned in `tools/verify-descriptor.mjs`, now `1c70b88a…95ec`
  (`08aff7d1…` before the Dewanganj notes and the Teesta district; `28856c9a…`
  before the Prompt 40 cards; `c14c8bb4…` before the entry row lost «নাগেশ্বরী উপজেলা»; `95090aa6…`
  before the entry marker was snapped; `a6e2e386…` before the
  Teesta mouth's provenance was corrected). NCTB books
  first, then the source order in CLAUDE.md; past exam questions are not used.
- **Geometry:** Natural Earth's rivers, land and boundary lines; COD-AB's
  Bangladesh outline; the OSM rivers snapshot `osmBangladeshRivers` and the
  OSM pilot extract `osmBangladeshRiversPilot` (way ids with node ids and
  tags, snapshot 2026-05-31, ODbL) — all in `tools/sources.json`. The pilot
  extract is `tools/sources/osm-bangladesh-rivers-pilot.geojson`, cut by
  `tools/extract-bangladesh-rivers-pilot.mjs` from the way ids the seed
  records, and only a deliberate re-run changes it.
- **Research,** outside git: `tools/.cache/bangladesh-rivers/`.

## How it is built

- **`tools/build-diagram-bangladesh-rivers.mjs [out]`** writes `descriptor.json`,
  `data.json`, `frame-whole.json` and `frame-bangladesh.json` into
  `docs/diagrams/bangladesh-rivers/` (85 KB together); a second build writes
  the same bytes. Each river is one chain of features, refused if it branches,
  loops or has a gap over 3 m. The frames are SVG path data in the frame's own
  units, one flat projection per frame that `tools/lib/rivers-frame.mjs`
  shares with the validator.
- **The geometry pins,** one hash per line, in
  `tools/bangladesh-rivers-pins.json` (11 lines). A build whose line moved
  stops and says so; it is never re-pinned to pass.
- **The view,** `docs/visual/rivers.js` and `rivers.css`, is loaded only for a
  view of type `rivers` (one line in `VIEW_MODULES`). It reads only the
  diagram's own JSON through the resolver.

## What is checked

- **`node tools/verify-descriptor.mjs`** — the descriptor, the data against the
  seed (every Bengali string shown is the seed's or a heading composed from
  two of its own), the frames, every branch card's four rows and the main
  card's «গতিপথ», ⓘ's plain lines each citing a listed source, the pending
  list (1: the main river's length).
- **`node tools/verify.mjs`,** its bangladesh-rivers section, reading the pinned
  sources by checksum:
  - a. every marker, its source coordinate projected with the picture's own
    projection: within 1 px at the frame's scale and 500 m on the ground;
  - b. every tributary and distributary: its parent-side end within 50 m of
    its parent line as drawn, or of a connector (one straight segment, at most
    10 km) that starts at that end and ends on the parent line; the list of
    connectors is printed; the Dhaleshwari alone may reach 12 km (the
    allow-list). Karatoya, Atrai and Banshi stay unjoined, each with its reason
    in the seed; the Old
    Brahmaputra passes on its own at 0 m;
  - c. the entry marker on COD-AB's border (500 m), and BWDB's point it was
    snapped from;
  - d. the main river one connected line, gaps 0 m, no duplicate segment, no
    self-crossing, nothing outside the frame;
  - e. every drawn line and marker traced to an id in the pinned sources, by
    way, node, vertex or — the entry — the way segment that crosses COD-AB's
    border; and the build reproduced byte for byte;
  - f. the entry marker within 500 m of the drawn main line, and of the
    point where the line turns from dashed to solid, in both frames.
- **`node tools/check.mjs bangladesh-rivers`** — its rivers branch, `riverSteps`,
  takes each tab in turn: the picker's entry, then every line and marker
  tapped at a point where its zone alone takes the tap, its card's heading the
  zone's; a marker's zone 44 px across; the layout (names on the stage, clear
  of each other, the picker row and the card) with no card and with each; and
  ⓘ opened (a shot), on the screen, scrolled to its last line, closed again.

## Where decorations may go

None are drawn (the user: none from their model now). If some come, they are a
separate, approved change:

- a layer inside the art group of the frame file, **between the land and the
  rivers**, so it pans and zooms with the ground; placed by longitude and
  latitude through the frame's projection, never by pixel;
- images pinned as art inputs in the seed, cut by a diagram art tool from the
  approved masters as atmosphere-layers' are;
- `pointer-events: none`, never over a tap zone, a marker or a name — the
  layout check would hold it clear;
- a new descriptor term, so it needs the user's approval first.

## Decisions to keep

- The Jamuna ends at the Padma confluence; no sea-mouth marker.
- The entry marker sits on the drawn line at its border crossing, not at
  BWDB's point. The cards give only the book's «কুড়িগ্রাম জেলা»; Nageshwari
  (JRCB, BWDB) and Ulipur (COD-AB) are in ⓘ.
- The Teesta is a tributary of the Brahmaputra, as the books have it; its
  card and marker say «গাইবান্ধা জেলা», the district of the drawn mouth, and
  BWDB's Sundarganj (679 m away) and JRCB's Fulchhari are in ⓘ.
- No Old Brahmaputra offtake marker: the book (Dewanganj) and BWDB (Fulchhari)
  name different places.
- «শিয়াং» and «দিহাং» are on the main river's card only, never on the picture.
- The origin marker is Natural Earth's line start (82.40°E); Bengali Wikipedia
  gives 82°0′E, and both are recorded.
