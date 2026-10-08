# GeoQuest — standing rules

Read this before any task in this repo. Everything here is settled and applies
to every map. A prompt that contradicts a RULE here is a mistake in the prompt —
stop and say so rather than following it. A FACT here that the tree disagrees
with (a path, a count, an implementation status) is this file being stale:
correct it from the tree and list every correction in your report.

## Verification budget — read first

The user's rule (2026-09-28). It overrides every other verification text —
here, in `notes/`, in memory.

- **While working**: only a syntax check (`node --check`), the item's build,
  and its section of `node tools/verify-descriptor.mjs` (every map and
  diagram has one; the validator fails one without).
- **Once, at the end of the prompt**, after all edits:
  - the three suites, once — `node tools/verify-descriptor.mjs`,
    `node --test tools/resolver.test.mjs`, `node tools/verify.mjs` — and
    after a fix only the suite that failed;
  - `node tools/check.mjs <id>` (its header says what it does): text, 10
    lines or fewer, contact sheets in `tools/.check/<id>/`;
  - one look in Claude's own browser: the item, one card or one tap, one
    screenshot; if the pane does not paint, say so and move on — one retry
    at most.
- **Other items**: unchanged shell, their folder hashes suffice. Only a
  change to `docs/shell/`, `docs/visual/` or the resolver runs
  `node tools/check.mjs --all` against a `--baseline` stored before it, as
  text. No pixel comparisons. The straits map, the trace count and the
  geometry hashes stay unchanged unless the task says so.
- **Screenshots are for the user**, as contact sheets; open at most 2 per
  prompt yourself, only when a check points at a visual problem.
- No fps, memory or byte measurements unless asked; nothing an earlier
  commit proved and this prompt did not touch is verified again. Big files
  (`app.js`, `globe.js`, this file): search and line ranges, never whole.
- **Reports: 20 lines or fewer**, numbers first, then only problems and
  decisions for the user; no narration of the steps.
- **After a push**: no live browser check, no screenshots — only
  `node tools/check.mjs <id> --live`: the SHA-256 of every file under `docs/`
  that the push changed — `git diff` from the old origin/main to the new,
  read from the ref's reflog (`origin/main@{1}..origin/main`), or from
  `--since=<rev>` — and of `registry.json`, live against pushed; a file the
  push deleted must be gone (404). The user checks the live link on their
  phone.

## Two repos. Never confuse them.

- **GeoQuest** (this repo, public, GitHub Pages) — maps and interactive
  diagrams only.
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
- **No unapproved string goes live** (the user's rule, 2026-10-08):
  - `tools/verify.mjs` fails a live item whose seed has a `{ bn, approved: false }` string that reaches its
    files under `docs/`.
  - It also fails a live item whose seed carries no approval flags at all, unless the item is one of the 17
    on its fixed LEGACY list. Every new map or diagram carries flags.
  - Work in progress only warns.
- **Before a push, `node tools/push-guard.mjs`** checks the commits since origin/main:
  - fast-forward only, and the no-reply identity on every commit;
  - no e-mail pattern in the diff or the commit messages;
  - the 8-word quote scan against the cached source texts;
  - no PDF, scan or image added.

  The scan skips credit fields only, since a source is credited by its own title (rule (b), 2026-10-08):
  - descriptor `attribution` and `sources.<src>.attribution`;
  - `info.json` lines in the "sources" group;
  - a diagram's `credits` and `creditGroups`.
- Report in numbers, not narrative. Every report states: pending-fact count,
  trace count, geometry-hash status. Then anything that broke. Keep prose to
  what a number cannot say.
- **Every new map or diagram goes on the home page first** — the local
  preview's, from `tools/wip.json`, before any work; the live one only when
  finished (the user's standing rule): `notes/home-and-registry.md`.
- **No e-mail address, ever** (the user's rule, 2026-09-29): the user's
  address never appears in an HTTP request (User-Agent, any header, URL,
  payload), a script, a note, a commit or a sub-agent prompt. Where a
  service asks for contact details in the User-Agent (Wikimedia does), send
  exactly `GeoQuest-research/1.0 (https://github.com/conceptq2026-wq/GeoQuest)`
  — defined once, as `UA` in `tools/net.mjs`, which every tool that makes a
  request imports. Every sub-agent prompt carries that UA line and: "Never
  include any e-mail address in any request, file or note."
  `tools/verify.mjs` fails a fetching tool without that UA, and any tracked
  file holding an e-mail-address pattern outside its commented allow-list.
- **Commits use the no-reply identity** (the user's rule, 2026-09-29): the
  repo-local `git config` sets `user.name` conceptq2026-wq and `user.email`
  `319420647+conceptq2026-wq@users.noreply.github.com` (the id read from
  GitHub's public API, never guessed). The user's personal e-mail never
  appears in commit metadata — author or committer. Unpushed commits that
  carry it are rewritten (a backup branch first, the tree proved identical);
  pushed commits are never rewritten or force-pushed.

## Pinned, do not bump

- `maplibre-gl` **6.9.0**
- `pmtiles` **4.5.0**
- `three` **0.185.1**
- One exception, the user's (2026-10-05): Three.js **r128** (three 0.128.0's
  `build/three.min.js`), in `docs/visual/vendor/three-0.128.0/`, for
  maritime-zones' 3D view only: `notes/maritime-zones.md`.

## Structure

One HTML page serves every map, selected by a query parameter:

```
shell/index.html?map=straits
```

Not one folder per map. Each map's data lives in its own file so its source can
later change from a local file to a fetch from the app's Gateway without
touching anything else. A diagram is opened the same way by a second page,
`visual/index.html?v=<id>` — built, with five diagrams live (see
**Interactive diagrams**).

`docs/` is the served tree. **Invariant: the committed contents of `docs/` are
byte-identical to the production bucket.** Production will not resolve
directory indexes, so every URL names `index.html` explicitly. Neither shell's
page asks for a favicon (`<link rel="icon" href="data:,">`), so a browser
never asks the host's root for one, and no map logs a 404 for it.

**Every script and stylesheet the shells load carries the current version**
(the user's rule, 2026-09-29), so after a push no phone or app WebView keeps
an old one beside a new page: each reference to a `.js`, `.mjs` or `.css` file
under `docs/shell/`, `docs/visual/` or `docs/shared/` ends in `?v=<version>`,
one short hash of the shells' code (`tools/lib/asset-version.mjs`). After any
change there, run `node tools/stamp-assets.mjs`; `tools/verify.mjs` fails a
reference without the current version. Data files, fonts and PMTiles carry
none. The pages themselves are not versioned: a cached page loads its own
assets, old but consistent, until it expires.

The home page lists `docs/registry.json`, which is built, never written by
hand: `notes/home-and-registry.md`. A card's own words — a Bengali title
that differs from its page's, an optional one-line caption — come from
`tools/home-cards.json` (2026-09-30).

## Portability is the point

GeoQuest moves to another host later. **That move must be a change of hosting
and one data source — never a restructure.**

- Every outbound URL comes from `docs/shared/resolver.js`. Nothing else
  constructs one.
- **Never hard-code** a base URL, host, repo name, `.pmtiles` path, glyph URL
  or data path. `grep -rn "new URL(\|location\.href\|pmtiles://"` excluding
  vendor must return only the resolver.
- **No API calls, ever** (the user's rule, 2026-09-27). At runtime the diagram
  shell, like the map shell, requests only static files from our own host,
  through the resolver — no third-party service, no API, no analytics. The
  diagram build tools make no network calls at all: art is cut from the
  approved masters and data comes only from the approved seed, both in
  `data-sources/`. Nor does any map build (the user's rule, extended
  2026-09-27): only `tools/fetch-sources.mjs` downloads, into
  `tools/.cache/`, every file pinned in `tools/sources.json`, and a new
  source with no published hash is pinned by its first download — its size
  checked, its SHA-256 printed, nothing cached until that hash is recorded.
  `tools/verify.mjs` holds both halves, with `tools/outbound.mjs` reading the
  code — what it checks is in `notes/verify.md`.

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
A map cannot omit a baseline item by forgetting it. The picker row itself is
shared code, `docs/shared/picker.js` and `picker.css`, used by both shells,
and it sits at the top in every shell, directly under the header, whatever a
mockup draws (the user's decision, 2026-09-28). **On a page with tabs the tab
row goes on top and the picker row directly under it** (the user's rule,
2026-10-07, in the shared shells: `docs/shell/tabs.js`; the diagram shell's
header already held its tabs above each view's picker row). Its look is
`design/mockups/picker-row.png`: ‹ and › round, 44 px, light blue, navy
chevrons; the select a light-blue pill between them, the name centred, bold,
navy. ⓘ has a row of its own directly under the picker row — under the tabs
where a page has tabs but no picker row — right-aligned: an 18 px icon at 0.35 opacity, fully opaque when
pressed or focused, its tap zone an invisible 44 px square hanging down over
the map's or the view's top-right corner, never over ‹ ›. The map's corner
controls and the diagrams' words start below that zone; `tools/check.mjs`
holds it clear.

The row is ONE line at every width (the user's decision, 2026-09-28, which
replaced stacking it on narrow screens): the select takes all the width the
arrows leave and grows or shrinks with the screen; ‹ and › keep a fixed 44 px.
A long chosen name ends in … in the closed select only — the open list, the
card and the map show every name whole.

**One exception, the user's decision (2026-09-27): a map with a timeline has
no picker row** — no `<select>` and no ‹ ›. The timeline is its selector, and
keyboard access runs through the timeline's dot buttons, in time order.

**Bangladesh maps show Bangladesh only** (the user's decision, 2026-09-28): on
bangladesh.pmtiles no Indian state or Myanmar region is drawn — no fill, no
outline, no name; the neighbours' land is plain, the sea keeps its colour, and
a map's own layers still draw over it: `notes/basemaps.md`.

A globe map has no tilt button and keeps the picker row: `notes/globe.md`.
One map, environment-treaties, is in English: `notes/environment-treaties.md`.

**Which labels are emphasised is derived, never declared** — taken from the
`refs` field a map already has for its own data. Nothing extra to write and
nothing extra to forget. Follow this pattern for anything similar.

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

- **The NCTB book comes first** (the user's standing rule, 2026-09-28).
  - What the NCTB textbook gives always takes priority.
  - A value the book does not give is taken from, in this order:
    1. for the Liberation War, the Ministry of Liberation War Affairs,
       molwa.gov.bd (the user's addition, 2026-09-28), cited with its URL,
       page title, date or document name and any gazette number;
    2. Bengali Wikipedia, then English Wikipedia, each cited with its
       revision ID;
    3. a Bangladeshi national newspaper (Prothom Alo, The Daily Star,
       bdnews24, BSS and the like), cited with its URL, title and date;
    4. Banglapedia, last.
  - Every value from them keeps its reference. Where a later source differs
    from an earlier one, the difference is recorded; the earlier one stands.
  - What none of them gives stays MISSING, never filled from memory.

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
- **What is a conflict** (the user's decisions, 2026-09-29): a different place
  or a different number. Two wordings of one place («দৌলতদিয়ার কাছে» /
  «গোয়ালন্দে»; «চাঁদপুরের কাছে» / «চাঁদপুরে») are not one: the card keeps the
  more cautious wording («…র কাছে») with the upazila in brackets, and ⓘ gives
  the other. The NCTB book's value goes on the card and a differing government
  value (BWDB, JRC) in ⓘ, both cited; **where the two NCTB books disagree with
  each other, the field is `null` (hidden, pending) and ⓘ lists both** — a
  river's role too: the relation row is hidden and the river is drawn in a
  neutral style the legend explains. A spelling that differs between sources is
  never corrected silently: the card keeps one source's and ⓘ notes the
  other's. A same-name government entry is matched to a drawn feature only by
  its geometry or district, else the field stays pending; a picker name
  bracketed to tell same-name rivers apart gets an ⓘ line naming the others in
  the government's list and which one is drawn, cited.
- **No swap by inference** (the user's decision, 2026-09-29): a feature is
  drawn under another name only when a cited source — the government's list
  or an NCTB book — states the two are one; an encyclopaedia saying so is not
  enough. Otherwise it stays out and ⓘ names it as not drawn. Where two
  government bodies word one place differently (BWDB «ভারত», JRC «ভারতের
  ত্রিপুরার পাহাড়»), the first in the source order goes on the card, the
  other in ⓘ.
- **Bengali text on cards and in ⓘ** (the user's conventions, 2026-09-29, for
  every item): «কি.মি.» in card rows, «কিলোমিটার» in ⓘ sentences; place names
  in the pinned Bengali admin list's spelling where a source differs only in
  spelling (river names keep their source's); «OpenStreetMap-এর তথ্যে», never
  «ডেটায়»; an other name that is a river with its own card is pending, both
  views in ⓘ; a same-name river's picker bracket is the bracket of BWDB's own
  page name where it has one, else the district of origin, or of entry for a
  river rising outside Bangladesh. **Editorial rule:** obvious typos and
  spacing in quoted common words may be corrected; names — rivers, places —
  never. A card row quoting a source is whole clauses, no «…» joining
  sentences (an ellipsis only for an omitted list of place names); where no
  whole clause fits, the row is pending and ⓘ carries the full quote. In card
  rows a slash takes no spaces; a source title keeps BWDB's own spelling.
  `tools/verify.mjs` fails a space before , ; । or a doubled space in any
  shown Bengali string. Details: `notes/bangladesh-rivers.md`.
- The user's own verification is recorded as editor-verified with a date, and
  stays distinguishable from a cited source.
- Never invent Bengali content. An unsupplied Bengali field is `null`.
- **A value that varies by nature is not unverified.** Where sources differ
  because the thing itself changes — Mont Blanc's summit is an ice cap whose
  thickness changes — the card shows the most recent survey as "প্রায় …",
  cited to that survey and its year, and `review` logs the other values.
- Shortening the pending list is not a goal. A fact with one weak source stays
  pending.

## Build pins

A value earns a pin when it is derived from an external source **and** is either
displayed to a student or load-bearing for what is displayed.

Currently pinned: each vendored library's network surface, counted over its
JS and CSS — absolute URLs, `fetch(` sites, image `src`, XHR, workers,
sockets, beacons and dynamic imports — in `tools/verify.mjs`: MapLibre
6.9.0 8 / 3 / 5 / 1 / 2 / 0 / 0 / 2, pmtiles 4.5.0 1 / 2 / 1 / 0 / 0 / 0 / 0
/ 0, three.js 0.185.1 2 / 3 / 1 / 0 / 0 / 0 / 0 / 0, and the diagram
shell's three.js r128 4 / 2 / 1 / 1 / 0 / 0 / 0 / 0, its two files by
SHA-256 (`threeR128` in `tools/sources.json`). The count cannot tell a
live call from a mention, so any change is read before it is re-pinned.
Then: trace count, per-record geometry hash, `bdPov` literals,
`name_bn` hash and count, per-class boundary counts — and for the OpenStreetMap
extract, its file checksum in `tools/sources.json` plus a per-record OSM trace
count and geometry hash. Generated lines carry no hash: they are computed from
constants in the build, and editing those constants is the review. For the
five Geography maps: every record's geometry hash, as its source has it, in
`tools/geography-pins.json`; the three Natural Earth files they read; and the
checksums of the RESOLVE, Wikidata and OSM-waterfall extracts, all in
`tools/sources.json` — as are the geography-regions, elevation-points and
marine-polygons files they read. org-headquarters: the Natural Earth populated-places file (size and blob SHA in
`tools/sources.json`), the OSM places extract's checksum, and the split of city
points by source — 65 Natural Earth, 16 OSM — in the validator.
bangladesh.pmtiles: the COD-AB zip and the geoBoundaries India file (sha256),
the Natural Earth admin-1 file (size and blob SHA), the two OSM extracts'
checksums, all in `tools/sources.json`; and in `tools/build-bangladesh.mjs` the
unit counts (8 divisions, 64 districts, West Bengal 23, Tripura 8), the labels
it ships (Bangladesh's 8 divisions and 64 districts, and no neighbour's unit —
`tools/verify.mjs` holds every line, name and river to Bangladesh's own),
Bangladesh's land border as COD-AB draws it (2 parts: the 4,038 km mainland
stretch and the 29 km Dahagram–Angarpota exclave), and that each box still
holds its units with 0.3° to spare. ancient-janapadas:
every area's geometry hash, all eleven whether shipped or not, in
`tools/janapada-pins.json`. environment-treaties: its cities extract,
`data-sources/environment-treaties/cities.seed.json`, by checksum
(`treatyCities` in `tools/sources.json`), and the seed's table counts —
conventions 12, treaties 7, summits 4, COPs 31 — in the build.
atmosphere-layers: the SHA-256 of each of the eight art inputs, in the
seed's `art.files` — the art tool refuses, and `verify-descriptor.mjs`
fails, a committed input that differs — and each image's placement on the
master, in `tools/build-diagram-atmosphere-art.mjs`, which fails if a fresh
fit moves it. latitude-longitude: Natural Earth's 10m geographic lines
(60,564 bytes, git blob SHA-1 6745635f…, SHA-256 e0d96b65…) and NASA's Blue
Marble: Next Generation, July, topography and bathymetry, 5400 × 2700
(2,308,798 bytes, SHA-256 4f424067…), both in `tools/sources.json`, the
second with NASA's terms quoted; the date line's and Bangladesh's outline's
geometry hashes, as drawn, in `tools/latitude-longitude-pins.json`; and in
the build, the districts COD-AB gives each line at the card's value, held
to the seed's own count. liberation-war-1971: its OpenStreetMap points extract
by checksum (`osmLiberationPoints` in `tools/sources.json`); the traced
sectors' SHA-256 in `tools/build-liberation-war-1971.mjs`; and in
`tools/build-liberation-sectors.mjs` the COD-AB zip's pin and the ten sectors
tiling COD-AB — overlap and gap each under 0.5 km². bangladesh-rivers: the
seed's files — the common one and one per river system, merged by
`tools/lib/rivers-seed.mjs` — each by SHA-256 in `tools/verify-descriptor.mjs`;
the OSM pilot extract (`osmBangladeshRiversPilot`), each system's own extract
(`osmBangladeshRivers<System>`, and one per later batch,
`osmBangladeshRivers<System><Batch>`) and the rivers snapshot by checksum in
`tools/sources.json`; and the 68 lines' geometry hashes in
`tools/bangladesh-rivers-pins.json`, held for both products by the shared
build core, `tools/lib/rivers-core.mjs`. bangladesh-rivers-map: the same
seed, pins and extracts, and its lines within 15 m of the pinned chains
(checked vertex by vertex in its build); what only the map draws is pinned
apart, in `tools/bangladesh-rivers-map-pins.json` — Kaptai Lake's outline, as
Natural Earth's 10m lakes file (pinned in `tools/sources.json`) has it, and
Stage 4's four map-only upstream lines (2026-10-05), from the by-id extracts
`osmBangladeshRivers<System>S4`, pinned by size and SHA-256. The
seed's `only` ("map" or "diagram", 2026-09-30) keeps an item to one product;
each build asserts that none of the other's reaches it, and `tools/verify.mjs`
holds the two products' built files to parity. The map's upstream rule reads
the pinned Natural Earth admin-1 and regions files and geoBoundaries India. The shared district file,
`docs/shared/bangladesh-districts.json` (COD-AB's 64 districts, the
basemap's Bengali names), is rebuilt by `tools/build-bangladesh-districts.mjs`
and compared byte for byte in `tools/verify.mjs`. world-revolutions: its
seed, `data-sources/world-revolutions/world-revolutions.seed.json`, by
SHA-256 in `tools/verify-descriptor.mjs`; every marker is re-derived from the
pinned Natural Earth countries, populated-places and admin-1 files and the
COD-AB zip in `tools/verify.mjs`, and must lie inside its own country.
bangladesh-maritime-boundary (live 2026-10-08): its seed by SHA-256 and its
built files held to a fresh build, in `tools/verify-descriptor.mjs`; its
sources, each by size and SHA-256, and the texts its quotes are offsets
into (`bangladeshMaritime` in `tools/sources.json`); in its build, the
junction recomputed from the two azimuths within 0.01″ of the PCA's.
org-members (live 2026-10-07): its seed by SHA-256 and its built files held
to a fresh build, in `tools/verify-descriptor.mjs`; each organisation's page and its text
(`tools/lib/html-text.mjs`), each by size and SHA-256, in the seed and in
`tools/sources.json` (`orgMembers`); every member, status and stated count
cites an offset into that text with the quote's SHA-256, checked in
`tools/verify.mjs`. Bengali names cite the user's decision of 2026-10-06;
no book is a source. bangladesh-ethnic-groups (live 2026-10-08): its seed by SHA-256 and its built
files held to a fresh build, in `tools/verify-descriptor.mjs`; every card fact's quote anchor re-hashed against
its cached text (`tools/.cache/ethnic/`) in `tools/verify.mjs`.

When a pin moves, **stop and report the old and new values.** Never re-pin to
make a build pass. A dropped `featurecla` once shifted a line by three points
and was caught only because a count moved.

Identity comes from stable codes (`ADM0_A3`), never from names. Names are
content.

## What needs the user's approval

Needs approval: any schema change or new descriptor term; which places appear on
a map at all; any Bengali content; substituting one real-world feature for
another; anything that moves a pin; pushing.

Does not need approval: applying a rule in this file to a new record;
mechanical work already specified; fixing a bug in something already approved.

State which kind a task is when reporting it.

## Current state

- Seventeen maps. Bangladesh: `ancient-janapadas`, `liberation-war-1971`,
  `bangladesh-rivers-map` («নদী ২»), `bangladesh-maritime-boundary`
  (`notes/bangladesh-maritime-boundary.md`) and `bangladesh-ethnic-groups`
  (`notes/bangladesh-ethnic-groups.md`). International: `straits`,
  `border-lines`, `org-headquarters`, `environment-treaties`,
  `world-revolutions` (`notes/world-revolutions.md`) and `org-members`
  (`notes/org-members.md`). Geography:
  `deserts`, `lakes`, `forests`, `mountains`, `waterfalls` and
  `latitude-longitude`, all under `docs/maps/`.
- Five diagrams, in `docs/diagrams/`: `bangladesh-rivers` («নদী ১») under
  বাংলাদেশ, drawn in code from the rivers seed (`notes/bangladesh-rivers.md`),
  maintenance-only beside the map of the same seed
  (`notes/bangladesh-rivers-map.md`); `maritime-zones` under International;
  `atmosphere-layers`, `earth-interior` and `seasons` under বিবিধ. Both
  rivers products went live together (2026-09-30), with the home page's first
  captions.
- `world-revolutions` went live on the home page on 2026-10-01, with a
  caption, after Stages 1–3 of its plan: three tabs, 55 events, dot and ring
  markers, group chips, a cards-only tab, and the one no-point exception.
- `maritime-zones` «সমুদ্র আইন: সমুদ্রের অঞ্চল» went live on the home page on
  2026-10-05, with a caption, after step 3d: a real-time 3D view (Three.js
  r128); its fallback without WebGL, the 2D view, shows the side view only —
  `zones.js` changed for it once, by the user's exception of 2026-10-05
  (`notes/maritime-zones.md`).
- `org-members` «আঞ্চলিক ও আন্তর্জাতিক সংস্থার সদস্য দেশ» went live on the home
  page on 2026-10-07, with no caption, after steps 1–2c: 18 organisations from
  their own official pages, two tabs («সংস্থা», «দেশ»), opening on South Asia
  with Bangladesh's card open.
- `bangladesh-maritime-boundary` «বাংলাদেশের সমুদ্রসীমা» went live on the home
  page on 2026-10-08, under বাংলাদেশ, with no caption, after steps 1–2: the
  ITLOS and PCA lines, St Martin's, the 2015 baselines and the lines'
  junction, card text from official sources only (the user's rule,
  2026-10-07).
- `bangladesh-ethnic-groups` «বাংলাদেশের ক্ষুদ্র নৃ-গোষ্ঠী» went live on the home page on 2026-10-08, under
  বাংলাদেশ, with no caption, after ETH-1–5 and GL-ETH:
  - 19 groups from Census 2022, in three tabs: «পাহাড়ি» (6), «সমতল» (13) and «প্রতিষ্ঠান» (10 numbered
    institutes);
  - its districts drawn from the shared district file through the shell's opt-in `sharedGeometry`
    (2026-10-08, `notes/shell.md`);
  - all 96 strings approved (2026-10-08, `notes/bangladesh-ethnic-groups.md`).
- Work in progress (`tools/wip.json`): `important-days` «বছরের চাকা», a diagram under বাংলাদেশ (WHEEL-2, revised
  by WHEEL-3 after the user's review, 2026-10-08): the Cabinet Division's circular of 11 March 2026 and its
  amendments, religious days removed by the user, 80 of the 85 kept entries built (4 date conflicts and one undated
  day held out), two kinds, twelve months and no year shown, drawn by the diagram shell's `days` view, with Noto
  Sans Bengali Bold; all strings awaiting the user (`notes/important-days.md`).

## Index — notes, read only when working on that item

Moved verbatim from this file on 2026-09-28; every line lives in one place.

- Each map and diagram: `notes/<id>.md` — the Geography maps but
  latitude-longitude share `notes/geography.md`; straits is the reference page.
  world-revolutions, `notes/world-revolutions.md`; its no-point exception to
  "never silently absent", `notes/descriptor.md`.
- The map shell (baseline data, tabs and cards-only tabs, chips, timeline,
  teardown; a new shell feature is a module loaded only where declared):
  `notes/shell.md`; the globe,
  `notes/globe.md`; descriptor terms past the data model, `notes/descriptor.md`;
  the diagram shell, `notes/diagrams.md`. A map's data (provenance, the
  English-name exception, name matching, frames): `notes/data.md`.
- `notes/basemaps.md`; `notes/resolver.md` (kinds, hooks, the app bridge);
  `notes/vendor.md` (why these versions); `notes/home-and-registry.md`;
  `notes/verify.md` (what `verify.mjs` checks for calls).
