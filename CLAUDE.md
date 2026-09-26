# GeoQuest — standing rules

Read this before any task in this repo. Everything here is settled and applies
to every map. A prompt that contradicts a RULE here is a mistake in the prompt —
stop and say so rather than following it. A FACT here that the tree disagrees
with (a path, a count, an implementation status) is this file being stale:
correct it from the tree and list every correction in your report.

## Two repos. Never confuse them.

- **GeoQuest** (this repo, public, GitHub Pages) — maps only.
- **ConceptQ** (private) — the app, admin console and CMS. Not here. Never
  reference its files, never assume access to it.

GeoQuest serves interactive maps that the Preli Quest app opens in a WebView.
The plan is 190–200 maps, Bangladesh-focused and international, for Bengali
BCS / government exam prep.

## Working rules

- Work locally. Commit directly to `main`.
- Never open a PR, never create a branch, never edit through the GitHub web
  interface.
- **Never push until told to.** Report first; the user decides when to push.
- Report in numbers, not narrative. Every report states: pending-fact count,
  trace count, geometry-hash status. Then anything that broke. Keep prose to
  what a number cannot say.

## Pinned, do not bump

- `maplibre-gl` **6.9.0**
- `pmtiles` **4.5.0**

Vendored under `docs/shared/vendor/<lib>-<version>/`. 6.9.0 is where Bengali
label rendering was tested on a real device. Upgrading is a separate,
deliberate task with device testing, never a side effect.

## Structure

One HTML page serves every map, selected by a query parameter:

```
shell/index.html?map=straits
```

Not one folder per map. Each map's data lives in its own file so its source can
later change from a local file to a fetch from the app's Gateway without
touching anything else.

`docs/` is the served tree. **Invariant: the committed contents of `docs/` are
byte-identical to the production bucket.** Production will not resolve
directory indexes, so every URL names `index.html` explicitly.

`docs/index.html` is generated from `docs/registry.json`, which
`tools/build-registry.mjs` builds from every descriptor found. It is never
hand-maintained: adding a map makes it appear under its section with no edit.
Each descriptor declares its `section`: `bangladesh | international |
geography`.

`docs/international/straits/` is the original live page. It is the reference
implementation for how a map looks and behaves. Do not change it unless a task
says to.

## Portability is the point

GeoQuest moves to another host later. **That move must be a change of hosting
and one data source — never a restructure.**

- Every outbound URL comes from `docs/shared/resolver.js`. Nothing else
  constructs one.
- `resolver.url(kind, path)`, `kind ∈ tiles | style | glyphs | sprite |
  mapData | maps | sharedData | registry`. The `kind → { anchor, base }` table
  is the single place that knows where anything lives; a layout change is that
  one edit.
- **Never hard-code** a base URL, host, repo name, `.pmtiles` path, glyph URL
  or data path. `grep -rn "new URL(\|location\.href\|pmtiles://"` excluding
  vendor must return only the resolver.
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

## The map baseline — every map, without being asked

1. Sea and ocean names.
2. Country names.
3. A tilt / flat view **button**.
4. The picker row in one fixed form:

```
[ ‹ ]  [ the select, taking all remaining width          ▾ ]  [ › ]
```

**This is shell chrome, not descriptor content, and it is enforced.** The shell
owns the baseline layer ids and styles; a descriptor that declares one throws.
A map cannot omit a baseline item by forgetting it.

Where the data comes from:

- Sea names — `docs/shared/seas.json`, loaded on every map through the
  `sharedData` kind. A map that needs to reference a sea points a `refs` field
  at this table exactly as it would at its own.
- Country names — the **basemap tiles**, source layer `country_labels`, field
  `name_bn` falling back to `name_en`. No shared records file.
- A per-map `countries` table exists only to name the countries that map
  **emphasises**, and it joins on `adm0_a3`, never on the name.

**Which labels are emphasised is derived, never declared** — taken from the
`refs` field a map already has for its own data. Nothing extra to write and
nothing extra to forget. Follow this pattern for anything similar.

Selecting a record must not reset tilt or bearing: `fitBounds` defaults bearing
to 0, so the current bearing is passed explicitly. The tilt button stops at
pitch 55; drags are clamped at `maxPitch` 60, slightly above the button's stop.

## Data model

A map is a **descriptor** plus **records** plus **geometry**. The descriptor
declares sources, layers, sheet rows and actions; it holds no content.

- **`properties` is required on every source derived from a records table.**
  Those sources are built from rows, so a property no one declared never
  reaches the feature: the result is empty labels and no error. A GeoJSON
  source carries its own properties and declares none — straits' `routes` is
  the example. Every `["get", x]` must resolve on its layer's source; the
  validator asserts this.
- Record keys are **structure, not content**. Joins depend on them. Never
  rename, never reorder. Content replacement is field-level at known keys.
- Camera padding is **symbolic, never numeric**. A pixel number in a
  descriptor is a bug waiting for a different phone.
- `fitBounds` on a record unions every feature of that record. A record with
  three traces must not frame one of them.
- **One selection at a time.** Selection is held per records table, but
  selecting a record in one table clears every other table's selection, and a
  selection the picker does not list puts the picker back to its placeholder.
  The sheet shows one record, so only one may be lit.
- **`sheet` or `sheets`.** `sheet` is the card for a map that selects from one
  table. `sheets` is the same card keyed by records table, for a map where
  more than one table can be selected; the validator fails a selectable table
  with no card. A kicker that resolves to nothing is hidden.
- **`referencedBy` is the reverse of a `refs` field**, in the `fromSelection`
  shape pointed the other way. A sheet row
  `{ "referencedBy": { "records": R, "listField": F }, "item": <value spec>,
  "do": [actions] }` lists every record of `R` whose `F` contains the shown
  key, in `R`'s own order, each a button that runs `do` on that record. `F`
  must be a `refs` field pointing at the sheet's table; the validator asserts
  it. No match hides the row, like a null. org-headquarters uses it for the
  organisations a city hosts.
- A picker's `groupBy` may omit `lookup`: the field's value is then the group
  label as it stands, and `order` must name every value that occurs.
- A tap on overlapping points goes to the one **nearest the finger**, not the
  first the renderer lists.
- **`recordFilter` hides records by a field value.** A control
  `{ "type": "recordFilter", "id": ..., "records": T, "field": F, "label": ...,
  "allLabel": ... }` draws the layerToggle's button and checkbox menu: a
  select-all row, then one checkbox per value. The values, their order and
  their labels are the picker's `groupBy` on the same field, which the
  validator requires, so the two cannot list different things. Unchecking a
  value hides every record of `T` carrying it — from every source derived
  from `T`, from the picker and from ‹ ›, and from `referencedBy` lists — and
  a record of a table `T` references through a `refs` field (a city) stays
  only while a shown record still points at it. A selection the filter hides
  is cleared and its card closed. Baseline sources are never filtered.
  Everything starts checked on every load; nothing is persisted. The
  mechanism is the selection's: sources re-derived with `setData`. A map
  declares a layerToggle or a recordFilter, not both — they share a corner.
- **Photos: one field type and two terms.** A record field of type `photo`
  holds `{ marker, card, author, licence, licenceUrl, page }`: two files in
  the map's folder and the whole credit. `photoMarker: { field }` on a source
  whose points come from a record field (`geometryFrom`) draws each record as
  a round photo — 56 px with a white ring and a soft shadow, 72 px with a
  `#0b3d91` ring when selected, the pulse behind it — and a tap runs that
  source's click interaction. `photo: { field }` on a sheet puts the card
  photo (16:10) at the top of the card and its credit — author · licence ·
  Wikimedia Commons, both linked — at the bottom; one term draws both, so a
  card cannot show a photo without the credit CC BY and CC BY-SA require.
  Sizes, rings and shadows are shell CSS, identical on every map. The
  validator fails a photo missing either file or any part of its credit, or
  carrying a licence other than public domain, CC0, CC BY or CC BY-SA.
- **Photos come from Wikimedia Commons, freely licensed, with no people.** The
  seed records the Commons file, its page, author, licence, the original's
  SHA-1 and the two crop boxes; `tools/extract-commons-photos.mjs <map>`
  refuses an original whose SHA-1 differs, crops, and writes
  `photos/<id>-marker.webp` (128 px square) and `photos/<id>-card.webp`
  (640×400) with ffmpeg. The build reads the committed files, never Commons.
- A card taller than 62% of the screen scrolls inside the sheet; the handle
  still drags it.
- **A source whose geometry comes from OpenStreetMap declares the ODbL credit**
  as its `attribution` — `© OpenStreetMap contributors`, linked to
  openstreetmap.org/copyright. The licence requires it. straits (`routes`,
  `canals`), border-lines (`lines`) and org-headquarters (`cities`) do.

## `null` versus absent — they are different

- **`null`** = unverified. Hidden from the student, and printed on the pending
  list at every build.
- **absent** = not applicable to this record. Hidden, and never counted as
  pending.

Getting this wrong hides real work or invents work that does not exist. When
unsure, ask which one the field is.

## Accuracy

Every fact shown to a student is verified. Content is supplied by the user, map
by map. **Nothing is guessed to fill a gap.**

- **One authoritative source per claim, and stop there.** The source is chosen
  for the kind of claim: the body that owns the thing for its own facts (a
  canal authority for that canal's length and opening year), the BCS corpus
  for Bengali names and exam-relevant values, OSM or Natural Earth for
  geometry. Record which one. Do not sweep for corroboration once the
  authoritative source has answered — the cost of a second opinion is not
  worth what it adds.
- **A weak source is a `null`, not a reason to keep hunting.** If the best
  available source is vague, self-contradictory, or plainly not the authority
  for that claim, the field stays unverified and goes on the pending list.
- **Geometry is verified differently.** The bar is *the right feature was
  selected and clipped*, checked by looking at the rendered result against a
  reference map — not by two sources and not by reading coordinates.
- **The authority for Bengali names is the exam, not the encyclopaedia.** If a
  Bangladeshi textbook and an international reference disagree, follow the
  textbook. A map more internationally correct than the student's textbook is
  wrong for this product.
- Where sources disagree, record both, show the more common one, and record the
  disagreement. Never silently pick.
- **Provenance lives outside the served tree, in the seed.**
  `data-sources/<map>/*.seed.json` is the provenance carrier. It holds two
  things: `review`, the free-text editorial note on a record whose sourcing is
  unsettled, and `sources`, an object keyed by the record field each citation
  justifies. Every cited field carries at least one citation — the
  authoritative source, per the rule above — and the build fails a field with
  none, or with two from the same host, since one host is one source. Records
  written under the older two-source rule keep their second citation; it is not
  deleted. What is cited is the feature's **documented extent**, not the
  point — the point only has to lie on that extent, the way the straits map
  marks a strait with a point. There is no `provenance.json` and none is
  wanted — one input, not two. The seed is also where the shipped fields are
  built from, but nothing in it that is provenance — `review`, `sources` — is
  shipped in `records.json` or reaches a student.
- The user's own verification is recorded as editor-verified with a date, and
  stays distinguishable from a cited source.
- Never invent Bengali content. An unsupplied Bengali field is `null`.
- **Names are the exception, by decision.** Where a record has no Bengali name,
  its English name is final: `nameBn` is **absent**, not null, and never counts
  as pending. The record is listed in `ENGLISH_NAME_FINAL` in the build, and
  every place a name is shown — map label, picker, sheet title — falls back
  `nameBn` → `nameEn` (`["coalesce", ["get","nameBn"], ["get","nameEn"]]` on the
  map, `compose` in the picker and sheet). The build fails a listed record that
  carries a `nameBn`, an unlisted record that lacks one, and any `nameBn: null`.
  Supplying a Bengali name later means adding it and taking the record off the
  list in the same edit.
- Shortening the pending list is not a goal. A fact with one weak source stays
  pending.

## Name matching is always constrained

Never search an external source by bare name. Always bound by bbox or filter by
tags. A bare name search once returned a rural road in Ontario named "Wallace
Line" and a way named "Ligne Maginot" in New Jersey — either would have shipped
a confidently wrong line. State the constraint used.

## `bdPov` means one thing

`bdPov` describes **only what the Natural Earth Bangladesh point-of-view
boundary file shows for this record's traces.** It is therefore **absent** —
not applicable — for any record whose geometry does not come from Natural
Earth.

Each record records its geometry source: `naturalEarth | osm | generated |
none`, in the build input, not in shipped records. Build assertion: `bdPov` is
present if and only if the source is `naturalEarth`, and the build fails
naming the record and both values. `geometrySource` is derived by the build
from how the geometry was produced, lives in `lines.seed.json`, and is dropped
on the way into `records.json`. Alongside it the records carry `hasTrace` (a
Natural Earth trace exists) and `hasGeometry` (any geometry exists — traced,
OSM or generated), and it is `hasGeometry` the map keys off.

Bangladesh's own position on a line is a different claim, is user-supplied
content, and does not exist as a field yet.

## feature-state is forbidden in `filter` and in layout properties

Proven against MapLibre's own validator: *"feature-state data expressions are
not supported with filters"*, and the same for layout properties. So selection
state is written into the features and the source is re-derived with `setData`.
That is the mechanism. Do not reintroduce feature-state for selection.

## Records with no line geometry get a point marker

A record that cannot be traced is marked with a point, the same treatment the
straits map gives a passage — radius 6, `#0b3d91`, 2px white stroke, property
for property. On selection the circle hides and the pulsing DOM marker takes
its place, exactly as on straits. A record that has a line to draw — traced or
generated — gets no marker and keeps the line-width idiom.

The marker is one `maplibregl.Marker` placed at one coordinate, so it is
narrowed by a condition rather than by the source it hangs off:
`selectionMarker` takes an optional `when`, in the same field/value shape
`expectGeometry` uses. border-lines declares `{ when: { hasGeometry: false } }`;
straits declares `true`. More than one source may declare `selectionMarker`,
at most one per records table; the one marker goes to whichever table holds
the selection. org-headquarters declares it on `cities` and on
`organisations`, so a tapped city and a chosen organisation both pulse at the
city.

The build fails, naming the record, when a record has no line geometry, no
point and no frame. A record that legitimately cannot be given a point is
listed in `NO_POINT_YET`, and the build also fails if that list goes stale.

**Never silently absent from the map.**

## Frames need basemap context

World tiles stop at z6 outside the detail areas. A frame tight around a
city-scale feature leaves its marker on blank land with nothing to place it
against. Widen the frame and say why in the report.

**Measure every record's resulting zoom at phone width — a 390 px wide
viewport (390×780), which leaves 368 px of map — and widen anything that lands
past z6.** Zoom depends on the canvas, so a frame that looks fine on a desktop
pane can land at z7+ on a phone. A record with no frame is fitted to its own
geometry and is measured the same way: a short traced line needs a frame too,
and that frame must contain the whole trace.

## Build pins

A value earns a pin when it is derived from an external source **and** is either
displayed to a student or load-bearing for what is displayed.

Currently pinned: trace count, per-record geometry hash, `bdPov` literals,
`name_bn` hash and count, per-class boundary counts — and for the OpenStreetMap
extract, its file checksum in `tools/sources.json` plus a per-record OSM trace
count and geometry hash. Generated lines carry no hash: they are computed from
constants in the build, and editing those constants is the review. For
deserts: each area's Natural Earth geometry hash (`EXPECTED_AREA` in
`tools/build-deserts.mjs`), and the geography-regions file in
`tools/sources.json`. org-headquarters: the Natural Earth populated-places file (size and blob SHA in
`tools/sources.json`), the OSM places extract's checksum, and the split of city
points by source — 65 Natural Earth, 16 OSM — in the validator.

When a pin moves, **stop and report the old and new values.** Never re-pin to
make a build pass. A dropped `featurecla` once shifted a line by three points
and was caught only because a count moved.

Identity comes from stable codes (`ADM0_A3`), never from names. Names are
content.

## Teardown is derived, not written

The builder records every id it creates — layer, source, image, handler, timer,
observer, DOM node — into a per-map registry, and teardown loops it in reverse.
Correctness must not depend on anyone remembering anything.

Between teardown and the next build, a **leak assertion**: layer and source
sets equal the pristine baseline, the registry is empty, no popups or markers
remain, handler and observer registries are empty. Loud in dev, counted in
production.

The build pipeline runs an **A→B→A test**: build A, switch to B, switch back,
assert the style is identical to a freshly built A. *Not built yet: there is no
map switching. The shell builds one map per page load, and teardown ends by
removing the `Map` itself. `teardown()` and `assertNoLeaks()` exist and are
exercised, and the leak assertion reports both directions — it throws while a
map is live and reports clean once torn down.*

Kept across a switch: the `Map` instance and its WebGL context, the basemap
source and layers, the glyph atlas, the PMTiles archive registration, the
resolver and credential cell — and the baseline label sources and layers, which
are deliberately left out of the per-map registry for exactly this reason.

One live WebGL context, ever. An inline lesson embed is a static thumbnail with
tap-to-open, never a live map.

## Before every commit

- All three suites pass: `node tools/verify-descriptor.mjs`, `node --test
  tools/resolver.test.mjs`, `node tools/verify.mjs`.
- 320px wide renders correctly.
- Console clean **in a fresh tab** — stale buffers from an earlier load have
  produced false failures more than once.
- The straits map unchanged unless the task says otherwise.
- Trace count and geometry hashes unchanged unless the task changed geometry.

## What needs the user's approval

Needs approval: any schema change or new descriptor term; which places appear on
a map at all; any Bengali content; substituting one real-world feature for
another; anything that moves a pin; pushing.

Does not need approval: applying a rule in this file to a new record;
mechanical work already specified; fixing a bug in something already approved.

State which kind a task is when reporting it.

## Current state

- Four maps: `docs/maps/straits/`, `docs/maps/border-lines/`,
  `docs/maps/org-headquarters/` and `docs/maps/deserts/`.
- deserts is the first Geography map and a design sample: one record, the
  Sahara, awaiting the user's review before any other is added. Four more
  Geography maps — lakes, forests, mountains, waterfalls — are planned to
  reuse its photo terms unchanged. It is built by `tools/build-deserts.mjs`
  from `data-sources/deserts/deserts.seed.json`; each area is Natural Earth's
  `ne_10m_geography_regions_polys` feature matched by NAME and FEATURECLA,
  its photo marker at the area's pole of inaccessibility.
- org-headquarters holds international organisations **and** technology
  companies, one map by the user's decision. It is built by
  `tools/build-org-headquarters.mjs` from two user-approved seeds, which the
  build reads and never rewrites:
  `data-sources/org-headquarters/organisations.seed.json` and
  `data-sources/tech-headquarters/companies.seed.json`. They become one records
  table, organisations first; the companies carry no category and form one
  picker group, `প্রযুক্তি প্রতিষ্ঠান`, shown last. The cities table, the host
  countries and every point and frame are derived; the cities' provenance goes
  to `data-sources/org-headquarters/cities.seed.json`.
- **Hubs.** Towns too close to tell apart at frame zoom share one marker, by
  the user's decision. `data-sources/org-headquarters/hubs.seed.json` names
  each hub and its member towns; today that is `silicon-valley`
  (সিলিকন ভ্যালি): Cupertino, Mountain View, Menlo Park, Santa Clara, San Jose
  and Los Gatos. In the shipped marker table (`cities.json`) a hub replaces
  its towns, with its point the mean of theirs and its frame their extent
  widened by `FRAME_HALF`, so its one card lists everything in all of them.
  The towns keep their own points and provenance in `cities.seed.json`
  (`hub` names where each went), and each record keeps its own `cityBn` and
  gains `regionBn`, the hub's name, shown as অঞ্চল. No descriptor term: the
  hub is an ordinary record of the marker table.
- One basemap archive exists, `docs/shared/tiles/world.pmtiles`. A
  `bangladesh.pmtiles` is planned and not built. A cross-basemap switch is a
  full re-initialise; the shell decides that from each map's descriptor.
- The straits map's content exists twice — `docs/international/straits/data.js`,
  which the live page reads, and `docs/maps/straits/records.json`. **Until the
  live page is retired, `data.js` is the single source**: supplied content goes
  there, the extractor re-runs, and the validator proves the two match exactly.
  When the live page goes, `records.json` becomes the source and `data.js`
  disappears.
- The bridge to the app does not exist yet. `resolver.setCredentials()` is
  written, works, and nothing calls it. Until it is called the resolver uses
  the `relative` strategy, which is today's production behaviour.
