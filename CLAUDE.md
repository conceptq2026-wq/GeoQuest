# GeoQuest — standing rules

Read this before any task in this repo. Everything here is settled and applies
to every map. A prompt that contradicts a RULE here is a mistake in the prompt —
stop and say so rather than following it. A FACT here that the tree disagrees
with (a path, a count, an implementation status) is this file being stale:
correct it from the tree and list every correction in your report.

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
- Report in numbers, not narrative. Every report states: pending-fact count,
  trace count, geometry-hash status. Then anything that broke. Keep prose to
  what a number cannot say.

## Pinned, do not bump

- `maplibre-gl` **6.9.0**
- `pmtiles` **4.5.0**
- `three` **0.185.1**

Vendored under `docs/shared/vendor/<lib>-<version>/` by `tools/vendor.mjs`,
and `tools/verify.mjs` checks the vendored code byte for byte against the
pinned npm packages and pins each library's network surface by count (see
**Build pins**). 6.9.0 is where Bengali label rendering was tested on a
real device. three.js 0.185.1 is the last release that ships official
minified builds — 0.186 dropped them — and its `three.module.min.js` imports
`./three.core.min.js`, so the pair keeps the package's own file names.
Upgrading is a separate, deliberate task with device testing, never a side
effect.

## Structure

One HTML page serves every map, selected by a query parameter:

```
shell/index.html?map=straits
```

Not one folder per map. Each map's data lives in its own file so its source can
later change from a local file to a fetch from the app's Gateway without
touching anything else. A diagram is opened the same way by a second page,
`visual/index.html?v=<id>` — built, with one diagram live (see
**Interactive diagrams**).

`docs/` is the served tree. **Invariant: the committed contents of `docs/` are
byte-identical to the production bucket.** Production will not resolve
directory indexes, so every URL names `index.html` explicitly.

`docs/index.html` renders its list from `docs/registry.json`, which
`tools/build-registry.mjs` builds from every descriptor under `docs/maps/` and
`docs/diagrams/`. The list is never hand-maintained: adding a map makes it
appear under its section with no edit. Of the list, only the section names are
written into the page (`SECTION_NAMES`). Each descriptor declares its `section`:
`bangladesh | international | geography | misc` — the three BCS subjects in
syllabus order, then বিবিধ for what belongs to none of them.

`docs/international/straits/` is the original live page. It is the reference
implementation for how a map looks and behaves. Do not change it unless a task
says to.

## Portability is the point

GeoQuest moves to another host later. **That move must be a change of hosting
and one data source — never a restructure.**

- Every outbound URL comes from `docs/shared/resolver.js`. Nothing else
  constructs one.
- `resolver.url(kind, path)`, `kind ∈ tiles | style | glyphs | sprite |
  mapData | maps | diagrams | sharedData | registry`. The `kind → { anchor,
  base }` table is the single place that knows where anything lives; a layout
  change is that one edit. Only `diagrams` checks its path before resolving
  it (see **Interactive diagrams**).
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

The row keeps that form while it fits. A name too wide for it — a long option
in the picker — would wrap the row and leave one arrow alone, so a row that
wraps goes fully stacked: the picker on its own row, ‹ › sharing the next, the
same form a phone under 380 px always gets. The name is never truncated.

**One exception, the user's decision (2026-09-27): a map with a timeline has
no picker row** — no `<select>` and no ‹ ›. The timeline is its selector, and
keyboard access runs through the timeline's dot buttons, in time order. Every
other map keeps the picker. It is enforced both ways: the validator fails a
map with neither a picker nor a timeline and a map with both, and the timeline
throws if a picker is declared beside it.

Where the data comes from:

- Sea names — `docs/shared/seas.json`, loaded on every map through the
  `sharedData` kind. A map that needs to reference a sea points a `refs` field
  at this table exactly as it would at its own. A record may also carry
  `atByBasemap: { <basemap>: [lon, lat] }`, a better place for its label on
  that basemap, used there instead of `at`; the name stays in its one record.
  The Bay of Bengal has one for `bangladesh`, whose bounds its world anchor
  lies outside. The validator requires each such anchor to lie inside that
  basemap's frame, on open water at least 50 km from any coast.
- Country names — the **basemap tiles**, source layer `country_labels`, field
  `name_bn` falling back to `name_en`. No shared records file.
- A per-map `countries` table exists only to name the countries that map
  **emphasises**, and it joins on `adm0_a3`, never on the name.

**Every map is in Bengali but one.** environment-treaties is in English, by the
user's decision (2026-09-27), and declares it: `language: "en"`. A map that
declares no language is Bengali; the validator accepts only `bn` and `en`.
The shell turns its own words with the map — the page's title and every `lang`
attribute, the load notice, country names from the tiles' `name_en` alone,
Western digits — and shows no sea names, because `seas.json` has them in
Bengali only. The map's English fields are the editor's, each the translation
of a Bengali field (a date, the cited source's own wording), present exactly
where it is: null where it is null, absent where it is absent. The Bengali
fields stay in the data, unused there. The validator fails an English map
that shows any Bengali field, and that map's build and validator fail an
English field whose null or absent state differs from its Bengali one.

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
  with no card. A kicker that resolves to nothing is hidden. A card may also
  declare `subtitle` — a value spec shown as a small grey line under the title
  (the janapadas' "approximate area" caption); like a row, it hides when it
  resolves to nothing.
- **Card terms.** `chip` — a value spec drawn as a pill on the kicker's line
  (a record's theme); a card declares a kicker or a chip, not both. A row
  declared `stacked` puts its value under its label, across the card.
  `columns: n` lays a card's rows out as cells of an n-column grid, filled in
  order: a cell that does not apply to the record — none of the fields it
  reads, no linked record — is left out, one whose value is null keeps its
  place empty so its neighbour stays in its own column, and a grid row with
  nothing in it is dropped; stacked rows run under the grid, across it. A row
  may declare `when: { field: value | [values] }`, in `expectGeometry`'s
  field/value shape: it applies only to records whose field holds one of the
  values, and the validator requires each value to occur. A cell may declare
  `short`, a value spec shown instead where the value does not fit the cell's
  one line — measured again whenever the card resizes, card by card.
  environment-treaties uses all of them.
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
  a round photo — 56 px with a 2 px white ring and a soft shadow, 72 px with a
  2 px `#0b3d91` ring when selected, the pulse behind it — and a tap runs that
  source's click interaction. Two sites close together overlap at a wide
  zoom (Mahasthangarh and Paharpur on the janapada map): both markers stay at
  their real sites, the selected one draws on top, and a tap on the overlap
  goes to the site nearest the finger, not to the disc on top; a click with
  no pointer — Enter or Space on a focused marker — is that marker's own. A
  record with no free photo gets the plain dot the straits map gives a
  passage instead, so it is never missing from the map. `photo: { field }` on
  a sheet puts the card photo (16:10) at the top of the card and its credit —
  author · licence · Wikimedia Commons, both linked — at the bottom; one term
  draws both, so a card cannot show a photo without the credit CC BY and CC
  BY-SA require. When the shipped image is a crop, the value carries
  `cropped: true` and the credit says "Photo (cropped)": CC BY-SA asks the
  credit of a derivative to say what was changed. Sizes, rings and shadows are
  shell CSS, identical on every map. The validator fails a photo missing
  either file or any part of its credit, or carrying a licence other than
  public domain, CC0, CC BY or CC BY-SA.
- **Names avoid photos.** A photo marker is DOM, above the canvas, so
  MapLibre's label placement cannot see it. The shell reserves each marker's
  circle in the collision index with invisible icons on its topmost layers,
  placed before any name: three centred rectangles that cover the circle and
  overreach it by at most 17% of the radius (one square would by 41%, and turn
  away names that sit beside a photo), sized from the marker as the CSS draws
  it. A name is placed round a photo as round another name, and one with
  nowhere to go is dropped rather than drawn under a photo. The icons are
  never drawn and take no tap. Flat, they match the marker at every zoom;
  tilted, MapLibre scales symbols with perspective and the DOM markers not,
  so at the tilt button's 55° the reserve is 92–95% of the marker. A name
  under its own photo must sit outside that photo's reserve or it is pushed
  off it: the janapada names clear it by 0.4 px, the geography maps' by 2.5 px
  (6 px beside it).
- **Photos are light.** Every marker on a map loads when the map opens, so a
  marker file is at most 8 KB; a card photo loads only when its card opens,
  never at map load, and is at most 40 KB. The extractor steps WebP quality
  down until each file fits; the build fails a file over either cap.
- **Photos come from Wikimedia Commons, freely licensed, with no people.** The
  seed records the Commons file, its page, author, licence, the original's
  SHA-1 and the two crop boxes, in the original's pixels;
  `tools/extract-commons-photos.mjs <map>` refuses a file whose SHA-1
  differs, crops, and writes `photos/<id>-marker.webp` (128 px square) and
  `photos/<id>-card.webp` (640×400) with ffmpeg. An original wider than 1280
  px is fetched as Commons' own 1280 px rendition (a standard thumbnail width;
  others are refused) and the crop boxes are scaled to it. The build reads
  the committed files, never Commons. A photo is a satellite view only where
  that is what shows the place recognisably — a whole lake, a desert with no
  free ground photo — and never a map.
- A card taller than 62% of the screen scrolls inside the sheet; the handle
  still drags it.
- **Areas nest, and the smallest wins a tap.** The Nubian Desert lies inside
  the Sahara, Rub' al Khali inside the Arabian. A tap on overlapping areas
  selects the smallest, measured on each record's whole geometry rather than
  the tile-clipped piece the renderer hands back. Photo markers draw above
  every area.
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
- **A source whose geometry comes from OpenStreetMap declares the ODbL credit**
  as its `attribution` — `© OpenStreetMap contributors`, linked to
  openstreetmap.org/copyright. The licence requires it. straits (`routes`,
  `canals`), border-lines (`lines`) and org-headquarters (`cities`) do.

## Shell modules: tabs and timeline

A shell feature that not every map needs is a module of its own, loaded only
for a map whose descriptor declares its term (`SHELL_MODULES` in `app.js`), so
no other map requests it. A module mounts before the map is built — it may
take room on the page, and hide records through the shell's `hide` — and
installs once it is, with `map`, `runActions`, `refilter`, `deselect` and
`onChange` (after a selection, or a change in what is shown). Everything it
creates or changes goes through `own`, so teardown undoes it.

- **`tabs: { records, field, from, label }`** divides one records table by a
  field, one part at a time: the tabs are the rows of `from`, in its order,
  titled by `label`. Only the active tab's records are on the map and in the
  timeline; a table they refer to (a shared city marker) stays only while an
  active record points at it; card links are not divided, and selecting a
  record in another tab opens that tab. A tab the student picks resets the
  camera to the map's own view; one opened by a selection keeps that
  selection's frame. The first tab is active on every load; nothing is kept.
  Drawn as one rounded pill bar, the active tab a filled pill.
- **`timeline: { records, at, label?, rowBy?, rowLabel?, colour?, state?, do }`**
  puts each record at its year (`at`) as a dot labelled above it — `label`
  (default the card's title) over the year, in the map's digits — one lane per
  `rowBy` value, each row opening with a chip (`rowLabel`, read off its first
  record) in a tint of its colour, pinned at the left while the rows scroll
  sideways. `colour` names a style token and paint property: the dots take
  the markers' colour from the same expression (a literal, or `match` on
  `get`; the timeline names anything else rather than guess). `state` lights
  dots as a source's state does; a tap runs `do`. Nothing overlaps: every dot
  keeps a 24 px target, and two closer than that — two records of one year —
  move apart sideways as little as they can, never into a second lane; a
  label that would touch a neighbour's goes below its dot, and where labels
  still touch, the plot widens to the least px-per-year at which all fit and
  scrolls sideways. Short of that the rows fill the panel's width, spending
  their edge margins rather than scroll a few pixels. Year axes run along the
  top and the bottom, pinned while the rows scroll up and down. The selected
  dot is larger, ringed in white with a soft glow, its label bold, and a
  dashed line in its colour runs from it down to the bottom axis; whatever
  selected it, it is scrolled into view. The dots are buttons in time order,
  so the keyboard walks the years.
- **Spans are reserved, not built**: a timeline of periods would declare
  `span: { from, to }` in place of `at`, a bar from one year to the other. The
  validator fails a timeline that declares one, and the module throws.
- **The docked card.** A map with a timeline lays its page out from the
  module's CSS: the tabs, the map edge to edge, the card docked at the map's
  foot — over its last few pixels, never over what it frames — and the panel.
  The card shows while a record is selected, collapses with nothing selected,
  and has a × that clears the selection (`deselect`) and gives the room back
  to the map. A docked card does not float, so the camera is not padded for
  it and it is not dragged (the shell checks `sheetFloats()`). The map never
  drops under 35% of the screen: the panel fits its rows but gives way first,
  down to one row (122 px), then the card, down to its title; each scrolls
  inside itself when short of room.
- The timeline is the map's selector: see the baseline exception above.

## Interactive diagrams

The user's decisions (2026-09-27; the exploded view revised the same day).
Built so far: the registry and the home page take diagram entries, the
resolver has a `diagrams` kind, three.js 0.185.1 is vendored for a future 3D
diagram — atmosphere-layers does not use it — the no-calls check covers
diagram code, vendored libraries and diagram build tools,
`tools/build-diagram-atmosphere-art.mjs` cuts atmosphere-layers' art into a
staging folder outside `docs/`, the diagram shell, `docs/visual/`, draws the
exploded view, and atmosphere-layers is live in
`docs/diagrams/atmosphere-layers/`, under বিবিধ on the home page. The
cross-section view is not built, so every rule below about it is decided,
not built.

- **A second shell.** A diagram opens in its own page,
  `docs/visual/index.html?v=<id>` — HTML, images and SVG, served from our own
  host like everything else; no MapLibre. A 3D diagram, if one comes, adds
  WebGL2 through three.js, which MapLibre already requires, so no new device
  requirement. `docs/shell/` and its URLs do not change for it. A diagram's
  built data lives in `docs/diagrams/<id>/`, its approved seed in
  `data-sources/<id>/`.
- **The `diagrams` kind.** The diagram shell reaches a diagram's files through
  `resolver.url('diagrams', '<id>/<path>')`, which resolves to
  `diagrams/<id>/<path>` from the site root, as `maps` does for a map. The id
  follows the map shell's rule for `?map=` — the resolver's unit test reads
  that rule from `shell/app.js`, so the two cannot drift apart. An absolute
  path, a `..` segment, a backslash or an empty segment — spelled out or
  percent-encoded — is refused rather than resolved, as is an id with no file
  under it. No other kind checks its path.
- **One registry, one home page.** `tools/build-registry.mjs` reads
  `docs/diagrams/*/descriptor.json` beside `docs/maps/`. A diagram's entry
  carries `"kind": "diagram"`; a map's entry gets no new field. Ids are unique
  across maps and diagrams: the generator fails an id used by both. The home
  page opens an entry by its kind — a map in `shell/index.html?map=<id>`, a
  diagram in `visual/index.html?v=<id>`. `tools/verify.mjs` holds the registry
  to both folders and runs the map baseline's checks on maps only.
- **No API calls, ever** (the user's rule, 2026-09-27). At runtime the diagram
  shell, like the map shell, requests only static files from our own host,
  through the resolver — no third-party service, no API, no analytics. The
  diagram build tools make no network calls at all: art is cut from the
  approved masters and data comes only from the approved seed, both in
  `data-sources/`.
  `tools/verify.mjs` holds both halves, with `tools/outbound.mjs` reading the
  code:
  - Under `docs/visual/` it fails:
    - any absolute URL;
    - a request whose URL is written by hand rather than taken from the
      resolver: `fetch()`, XHR, or a three.js loader's `load()`, `loadAsync()`,
      `setPath()` or `setResourcePath()`, on any object;
    - a literal path into `diagrams/` or `maps/`, since their files come only
      through the resolver;
    - a beacon or socket;
    - a URL built outside the resolver;
    - code or a subresource loaded by anything but a relative path;
    - a bare host name.

    Only the W3C namespace names, SVG's among them, pass: they are names,
    never fetched. So does `document.fonts.load()`, which takes a CSS font,
    not a URL.
  - The same check runs over `docs/shell/` and `docs/index.html` as a report
    that fails nothing. It tells a link from a request by where the URL
    stands:
    - an anchor's `href` — in `<a>` markup, or passed to a helper whose own
      definition writes one, as the map shell's `credit()` does — is followed
      only on a tap;
    - the argument of `fetch()`, `import()` and the like, a static import, an
      element's `src`, a `<link href>` and a CSS `url()` are fetched without
      one.
  - Each vendored library's network surface is counted and pinned (see
    **Build pins**).
  - A diagram build tool — `tools/build-diagram*.mjs`, and every local module
    it imports — fails on a network module (`http`, `https`, `net`, `dns`,
    `undici` and the like), a `fetch()`, a socket, or a child process that
    runs `curl` or `wget`.
- **The diagram shell, as built.** `docs/visual/index.html` with its own
  `app.js` and `style.css`, and one module per view type, loaded only when
  that view's tab first opens — today `exploded.js`. `app.js` reads the
  descriptor and the diagram's data through the resolver, draws one tab per
  view the descriptor declares, and fills ⓘ. A descriptor with one view gets
  no tab bar, and the header keeps ⓘ's own row, so the stage starts below it
  (atmosphere-layers today, until its cross-section lands). A view that
  declares no `type` is not built yet: its tab is there and its panel stays
  empty; a type with no module throws. From the map shell, as it
  is there: the `?v=` id rule (the map shell's for `?map=`), no page zoom,
  the visually hidden `<h1>` filled from the descriptor's Bengali title;
  Noto Sans Bengali from `docs/shared/fonts/`, preloaded; ⓘ drawn as
  MapLibre's compact attribution control, collapsed until tapped, with the
  Noto Sans Bengali credit; the load notice's look; the tab bar's roles,
  roving focus and arrow keys; the docked card's ×. The page's `<title>` is
  the Bengali title too, by the user's decision — the map shell's takes the
  English one first. ⓘ lists the sources the diagram's data cites, each
  once, from the data alone, each opening outside the WebView. Escape closes
  ⓘ first, then the card. The page asks for no favicon (`data:,`), so a
  browser does not ask the host's root for one.
- **The load notice.** When the diagram cannot be loaded — its descriptor,
  its data, a view's module or own file, or the view's picture — the page
  says so over everything, in the descriptor's words (`loadFailed`,
  `loadAdvice`) once it has them, and in its own copy of the same words,
  in `index.html`, when the descriptor itself fails.
- **Shared pieces move only when needed.** A piece of the map shell moves into
  `docs/shared/` only when the diagram shell needs it, and each move is proven
  at the shell tier. None has moved: the diagram shell imports only
  `docs/shared/resolver.js` and the font.
- **The home section বিবিধ (`misc`)**, with the English heading
  "Miscellaneous", came with its first entry, atmosphere-layers — an empty
  section would have shown "Coming soon": `misc` in the registry
  generator's and the validator's `SECTIONS`, after the three syllabus
  sections, and both names in the home page's `SECTION_NAMES`.
- **The first diagram is atmosphere-layers, in Bengali**, with two views: the
  exploded view and the cross-section. **The exploded view matches
  `design/mockups/atmosphere-layers-exploded.png` 100%** (the user's
  decision, 2026-09-27, replacing the earlier 3D plan): it is 2D painted art,
  not a three.js scene and not art drawn in code — five glossy, translucent
  slabs with gaps above a slice of Earth, the km axis on the left, the
  relative temperature curve on the right, the docked card at the bottom. The
  cross-section is 2D SVG and has no approved look yet. The picture guides
  the look, never the data: the axis ticks sit on the seed's layer
  boundaries, and the temperature curve follows the seed's points only.
  Nothing is hard-coded from the seed: the user revises its content later.
- **The art is final and approved by the user**, in
  `data-sources/atmosphere-layers/art/`, committed with the seed — the eight
  inputs below; `earth-original-v3.png`, not an input, stays untracked:
  - `stack-master.png` — the whole stack without text, 1024×1536, on a
    background of `#EDF4FA`. It is the position reference.
  - `exosphere.png`, `thermosphere.png`, `mesosphere.png`,
    `stratosphere.png`, `troposphere.png` and `earth.png` — one slab, or the
    Earth slice, alone on the same canvas. The image model moved each one
    vertically, and drew some up to 17 px thicker or thinner than the master
    does, so each is placed by the master, never by its own position: fitted
    by the ends of its two upright edges, alone and in the master, and centred
    on them. The fitted offsets lie within 1.2–4.5 px of the editor's
    measurements (the top of the front-left upright edge, alone → in the
    master: exosphere 245 → 247, thermosphere 330 → 402, mesosphere 518 →
    564, stratosphere 681 → 740, troposphere 679 → 934). `earth.png` is the
    editor's retouch of `earth-original-v3.png`, its missing back strip
    filled in, with the same geometry: it draws the Earth 750 px wide against
    the master's 675, and fits at scale 0.9, its left edge at x 176 and its
    front-left edge's top at y 1181.5 — the editor's 0.9, 176 and 1181. The
    original is kept for the record only.
  - `icons-master.png` — the card's 13 icons, in a four-column grid with
    light cell borders: 1 ozone ring, 2 jet, 3 weather balloon, 4 cloud with
    sun (weather), 5 storm with lightning, 6 snowy peak (Everest), 7 wind
    ribbon (jet stream), 8 meteor, 9 high clouds, 10 aurora, 11 ionosphere
    (radio arcs over Earth), 12 radio tower, 13 satellite.

  The art was made by ConceptQ with its own model. No licence note and no
  credit is shipped or shown for it — not in ⓘ, not beside the art. The
  photo credits on the maps are unchanged.
- **The default view is `stack-master.png` itself** (the user's decision,
  2026-09-27), cut to the stack's bounds: pixel for pixel the approved
  picture, the only loss the encoder's. The draw rule: that one picture, and
  over it only the lit slab. The single-slab images are the model's own
  renders — a slab's clouds, stars or thickness not quite the master's — so
  they are never composed into the default view; each is drawn only when its
  slab is lit.
- **The one interaction is a tap.** Nothing rotates. Tapping a slab lights
  it: its cut-out is drawn over the master at its fitted place, scaled about
  its centre by 1.08 — or more, where that is what it takes for the cut-out
  alone to cover the master's own copy of the slab (today the stratosphere,
  1.11) — lifted 2 layout px, over the mockup's white outline and soft glow;
  it highlights that layer's stretch of the relative temperature curve; the
  card opens. The other slabs are not dimmed: the mockup does not dim them.
  «বন্ধ করুন» (×), or tapping the slab again, closes it. With reduced motion,
  nothing animates. The Earth slice is never lit and has no cut-out. Tap
  areas are the slabs' outlines on the master, tested from the exosphere
  down, since each outline takes in its slab's top face hidden behind the
  slab above. The ionosphere and the aurora are in the thermosphere slab, as
  the art draws them, and the card gives their real ranges from the seed.
- **All text is HTML over the art**, never baked into an image. Each slab
  shows its Bengali name from the seed, laid along the slab's front face as
  in the mockup; the km axis and the relative temperature curve come from the
  seed.
- **The page's background is the art's own colour**, `#EDF4FA`, so the
  default view's edges and a lit cut-out's soft edges blend in without
  halos — taken as the view's file shows it at its edges once decoded
  (`view.edge` in the manifest, `#EBF3FA` today), since the encoder moves a
  flat colour a level or two and the file's rectangle showed against the
  painted one. The card takes the icons' decoded white (`iconEdge`,
  `#FDFDFD`) the same way.
- **The exploded view, as built** (`docs/visual/exploded.js`):
  - The stage, then the card docked under it. The stage never drops under
    45% of the screen; the card takes the room its content needs and
    scrolls inside itself. The art is scaled to fit the stage at those 45%,
    never past its own size, between the km axis's column on its left, as
    wide as the widest label, and the curve's on its right, as wide as its
    caption's widest word — so a card opening never shrinks it. It is
    centred in the stage's spare height, the hint under it while nothing is
    lit; a card opening takes that room, and the art glides up. Names, axis
    and curve show only once the picture has decoded.
  - Each slab's name is a real button, bottom to top in the page's order,
    `lang="bn"`, `aria-pressed` on the lit one; its font follows the art's
    scale, never under 11 px. A lit slab's name moves with its cut-out.
  - The km axis ticks every boundary the art has, with its height from the
    data in Bengali digits: the Earth's 0, the pauses, and the exosphere's
    top, «১০,০০০ কিমি». A height the seed gives as a range — `toKmRange`,
    `fromKmRange` or `atKmRange`, NOAA's 6–20 km for the tropopause, by the
    user's decision to use NOAA's figures until the book is in — is shown as
    that range, «৬–২০ কিমি». «স্কেল অনুপাতে নয়» sits low in the axis's
    column.
  - The curve stands each profile point at its boundary's level, the known
    temperatures across the first 78% of its width from − to +, an "up to"
    point at + with an up-arrow; between two points an S with upright ends,
    which never leaves the span of the two, so it shows no turn the data does
    not have. The lit layer's stretch is drawn brighter and wider, with a
    halo; a layer the profile does not reach (the exosphere) has none.
  - The card: the chip in the layer's colour (the descriptor's), the name,
    «উচ্চতা» (the layer's span) beside «তাপমাত্রা» (`trendBn`, `rateBn`
    under it), two small line glyphs drawn in code, then «যা ঘটে» with each
    feature's icon and name, three to a row, and under the name the reach of
    a feature that has one (the aurora, the ionosphere, the ozone layer's
    15–35 km). A span reads «৫০–৮৫ কিমি», or, where
    an end is itself a range, joins its ends with «থেকে» (the user's
    decision): the troposphere «০ থেকে ৬–২০ কিমি», the stratosphere
    «৬–২০ থেকে ৫০ কিমি». A line breaks only at the spaces round «থেকে» —
    never inside a range, nor between a number and its unit. A span with a
    pending end, and a pending line, is not shown; a layer with no `trendBn`
    has no «তাপমাত্রা» column — today the exosphere, whose one line, that
    atoms and molecules escape into space, the editor moved to `noteBn`
    (2026-09-27): no source gives it a temperature. `noteBn` is not shown.
  - Keyboard: the names by Tab, Enter or Space lights one, Escape or × closes
    it and focus returns to its name.
  - A lit slab's cut-out, and a card's icons, load only when that slab is
    lit: the first open is the page, the font, the descriptor, the data, the
    manifest and the view.
- **No WebGL and no three.js for this diagram**, so no fallback renderer.
  three.js 0.185.1 stays vendored, unused, for a future 3D diagram, under
  the rendering rule measured for it (390×844, 4× CPU slowdown, software
  rendering): Phong materials; no transmission — 7.5× Phong's frame cost,
  and it rendered dark after a context restore; a Standard material with an
  environment map only if Phong cannot reach the look — 4× the cost — its
  environment map rebuilt after a context restore; pixel ratio capped at 2;
  rendering on change only, nothing drawn at rest; shader-error checking off
  in production (`renderer.debug.checkShaderErrors = false`).
- **Interface words are data, never code** (approved 2026-09-27). They live in
  the diagram's descriptor: the tabs «৩ডি স্তর» and «প্রস্থচ্ছেদ»; the button
  «বন্ধ করুন»; the unit «কিমি»; the curve's caption
  «তাপমাত্রা (আপেক্ষিক)»; the card labels «উচ্চতা», «তাপমাত্রা» and
  «যা ঘটে»; the layer chips «স্তর ১» to «স্তর ৫»; the scale caption
  «স্কেল অনুপাতে নয়», the mockup's "scale not to proportion"; the hint
  «যেকোনো স্তরে ট্যাপ করুন», shown under the stack while nothing is lit and
  hidden while a card is open; «থেকে», joining a span whose end is a range;
  and the load notice, «ডায়াগ্রামটি লোড করা যায়নি।» over
  «ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।» (the last four approved with the
  diagram shell, 2026-09-27). The diagram's title, «বায়ুমণ্ডলের স্তর», is in
  its descriptor too. No other Bengali is shown until the user approves it.
- **The order of the work** (approved 2026-09-27, revised the same day), one
  commit per step, each at its verification tier. Nothing is committed under
  `docs/diagrams/` before the diagram is whole: the registry lists any folder
  there, and `verify.mjs` fails one it does not list.
  1. Done: the registry and the home page take diagram entries.
  2. Done: the resolver's `diagrams` kind.
  3. Done: three.js 0.185.1 vendored and pinned.
  4. Done: the no-calls check tightened for 3D — loader calls, data paths,
     the pinned library surface, and the build-tool check.
  5. Done: the art tool, `tools/build-diagram-atmosphere-art.mjs`, inside the
     no-network rule — ffmpeg on this machine and the approved files, nothing
     else. It refuses an input whose SHA-256 differs from the seed's
     `art.files`. It writes, as WebP at 1× and 2× for a layout 390 CSS px
     wide — the master's 1024 px making 390 — at quality 82 stepping down to
     fit each file's cap:
     - the default view: the master, cut to the stack's bounds, capped at 24
       KB and 64 KB;
     - the five slabs' cut-outs, for the lit state, capped at 12 KB and 32
       KB. Each is placed by the master, at the placements recorded in the
       tool, and the build fails if a fresh fit (`--measure`) moves one. Each
       is cut out with a soft alpha key against its own image's background —
       solid inside the picture's shape, holes filled, so a white cloud or
       edge never shows what lies behind it; soft only at the edge and in the
       glows and shadows, where every pixel shows over that background
       exactly as painted; a speck of the image's noise dropped;
     - the 13 icons, as squares inside their cell borders, opaque on the
       card's white, 40 CSS px across, capped at 1 KB and 2 KB.

     `manifest.json` gives the page's colour, `#EDF4FA`, taken from the
     master, and the colours the view's and the icons' files show at their
     edges once decoded, for what lies behind them; the view's box; and for
     each slab its cut-out's box, and the
     least scale from 1.08 at which the lit cut-out alone covers the master's
     own copy of it, checked at 2×. Its order, tap outline, name line (two
     points, the angle, the face's height), upright edges, and the points
     where the km axis and the curve meet it all follow the master: the
     cut-out's shape with its top face moved to the master's upright tops and
     its foot to their feet. It also gives the boundaries — in the middle of
     each gap, by the seed's boundary ids — and the icons, by the seed's
     feature ids.

     The proof: the view against the master, where only the encoder's loss
     may show; each cut over the page's colour against its own image, within
     a mean of 1 level and a 99th percentile of 4, or the build fails; the
     encoder's loss for each file; and each slab lit, as the page will draw
     it. The outputs are staged, untracked, in
     `data-sources/atmosphere-layers/build/`, from where the data build
     copies them into the diagram's folder. Tier: tools.
  6. Done: `docs/visual/` with the 2D exploded view (see **The diagram
     shell, as built** and **The exploded view, as built**), tested locally
     against the uncommitted diagram and committed without it, once the user
     approved its look. Tier: a new folder, nothing shared changed — the
     suites, the strict check, and the page at 390 and 320 px with a clean
     console in a fresh tab.
  7. Done: the diagram landed with its exploded view alone (the user's
     decision, 2026-09-27, replacing the plan to wait for the cross-section):
     the seed and the eight art inputs; `tools/build-diagram-atmosphere-layers.mjs`,
     which builds data, art and manifest into
     `docs/diagrams/atmosphere-layers/` from the seed, the art tool's staging
     folder and the descriptor authored there, which it only reads — a
     second build is byte-identical; `tools/preview-diagram.mjs`, which
     builds into a temporary copy of `docs/` outside the repo and serves it
     on 127.0.0.1, to see a change before it is built in; the diagram's
     section in `verify-descriptor.mjs`; and বিবিধ with its registry entry.
     While the descriptor declares one view, the tab bar is hidden: no empty
     tab. Tier: the diagram's own, plus the home page / registry tier.
  8. Next: the 2D cross-section view, once it has an approved look. The tab
     bar returns with it, both tabs as in the mockup. Tier: the diagram's
     own.
- A change to the home page or the registry has its own verification tier, in
  **Before every commit**.

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
- **A value that varies by nature is not unverified.** Where sources differ
  because the thing itself changes — Mont Blanc's summit is an ice cap whose
  thickness changes — the card shows the most recent survey as "প্রায় …",
  cited to that survey and its year, and `review` logs the other values.
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

Every basemap's tiles stop at z6 outside its detail areas — world.pmtiles'
strait boxes, bangladesh.pmtiles' Bangladesh box. A frame tight around a
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

Currently pinned: each vendored library's network surface, counted over its
JS and CSS — absolute URLs, `fetch(` sites, image `src`, XHR, workers,
sockets, beacons and dynamic imports — in `tools/verify.mjs`: MapLibre
6.9.0 8 / 3 / 5 / 1 / 2 / 0 / 0 / 2, pmtiles 4.5.0 1 / 2 / 1 / 0 / 0 / 0 / 0
/ 0, three.js 0.185.1 2 / 3 / 1 / 0 / 0 / 0 / 0 / 0. The count cannot tell a
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
unit counts (8 divisions, 64 districts, West Bengal 23, Tripura 8), the
classes of Natural Earth's lines inside the box other than Bangladesh's own (5
international, 2 disputed — both at Doklam, between Bhutan and China),
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
fit moves it.

When a pin moves, **stop and report the old and new values.** Never re-pin to
make a build pass. A dropped `featurecla` once shifted a line by three points
and was caught only because a count moved.

Identity comes from stable codes (`ADM0_A3`), never from names. Names are
content.

## Teardown is derived, not written

The builder records every id it creates — layer, source, image, handler, timer,
observer, DOM node — into a per-map registry, and teardown loops it in reverse;
a change a map makes to the page it did not create — a class, an inline style
on the shell's own card — is recorded too, with how to undo it (`own.undo`).
Correctness must not depend on anyone remembering anything.

Between teardown and the next build, a **leak assertion**: layer, source and
image sets equal the pristine baseline, the registry is empty, no popups or
markers remain, handler and observer registries are empty. Loud in dev,
counted in production.

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
  tools/resolver.test.mjs`, `node tools/verify.mjs`. Every map under
  `docs/maps/` and every diagram under `docs/diagrams/` has its own section
  in `verify-descriptor.mjs`; the validator fails one without, naming it.
- 320px wide renders correctly.
- Console clean **in a fresh tab** — stale buffers from an earlier load have
  produced false failures more than once.
- The straits map unchanged unless the task says otherwise.
- Trace count and geometry hashes unchanged unless the task changed geometry.

Verification scales with what changed:

- Only one map's or one diagram's data or its own folder: run the three
  suites and check that map or diagram. Do not open other maps.
- The home page or the registry: the three suites, registry entries
  byte-identical for existing maps, and the home page's existing sections
  rendering identically at 390 and 320 px.
- The shell or shared code (`docs/shell/`, `docs/shared/`, `tools/lib/`): run
  the suites, plus a request-and-camera comparison on two maps only, straits
  (world basemap) and ancient-janapadas (bangladesh basemap), at the site root
  only.
- A basemap, a vendored library, or the resolver: full verification as before.
- New shell features are separate modules that load only for maps whose
  descriptor uses them.

Screenshots only of what changed. The pending-count summary stays in every
report.

## What needs the user's approval

Needs approval: any schema change or new descriptor term; which places appear on
a map at all; any Bengali content; substituting one real-world feature for
another; anything that moves a pin; pushing.

Does not need approval: applying a rule in this file to a new record;
mechanical work already specified; fixing a bug in something already approved.

State which kind a task is when reporting it.

## Current state

- Ten maps. Bangladesh: `ancient-janapadas`. International: `straits`,
  `border-lines`, `org-headquarters`, `environment-treaties`. Geography:
  `deserts`, `lakes`, `forests`, `mountains`, `waterfalls`, all under
  `docs/maps/`.
- One diagram, under বিবিধ: `atmosphere-layers`, in `docs/diagrams/`, with
  its exploded view; its cross-section is next. It is built by
  `tools/build-diagram-atmosphere-art.mjs`, then
  `tools/build-diagram-atmosphere-layers.mjs`, from
  `data-sources/atmosphere-layers/` — the seed, NOAA's figures by the user's
  decision until the user's book is in, and the eight approved art inputs.
  Nothing on it is pending. What is built for diagrams is listed at the top
  of **Interactive diagrams**.
- **environment-treaties** — environmental conventions, treaties and
  protocols, world summits and UNFCCC COPs, in four tabs, in English (see the
  baseline section) — is built by `tools/build-environment-treaties.mjs` from
  the editor's seed, `data-sources/environment-treaties/treaties.seed.json`,
  which the build reads and never writes. Its four tables become one records
  table, `items`, each record carrying its `tab`. A record's city is its
  Wikidata item's point, from `tools/extract-treaty-cities.mjs` — matched by
  English label within the named country and a settlement or administrative
  type, and cross-checked against the city's English Wikipedia title — into
  `cities.seed.json`, cited to the revision read. A value the seed leaves
  null that a cited source was found for comes from `additions.seed.json`,
  and only there: today Montreal's parent, the Vienna Convention. A city that
  holds two or more records in one tab is one shared marker, `places.json`,
  whose card lists them; `children`, the reverse of `parentId`, is the
  card's "Under" link. The build derives three values for the card —
  `inForceYear`, the one year in `inForceEn` (it must match `inForceBn`'s),
  `parentShortEn`, the abbreviation closing `parentTextEn` (UNCLOS, for the
  High Seas Treaty, whose parent is not on the map), and `tabBn`/`tabEn`,
  which name a timeline row whose records carry no theme. The card, in
  `columns: 2`: Adopted | In force, Place | Under for a convention or a
  treaty; Held | Place, Under for a summit or a COP; years only; the note
  under the grid. Place is "City, Country", or the city alone (`short`) in a
  card too narrow for it — at 320 px, 19 of the 54. Values the seed gives
  without a citation stand on the user's approval, listed in the build's
  `EDITOR_VERIFIED`: every COP's parent (UNFCCC) and two COP notes. Markers
  are small dots in their theme's colour, the selected one larger with a glow
  (no pulse), each with its city's name beside it, a shared marker's once,
  in plain dark text under normal collision rules. Pending: 30 — Bangladesh's
  ratification (19, not shown yet); the cities of CITES, UNCCD and the 2002
  World Summit and the countries of CITES and UNCCD, each in both languages
  (10); and the High Seas Treaty's parent.
- **ancient-janapadas** is built by `tools/build-janapadas.mjs` from the
  editor's seed, `data-sources/ancient-janapadas/janapadas.seed.json`, which
  the build reads and never writes. A janapada is the union of the whole
  present-day units its seed names — Bangladesh's by COD-AB pcode, India's by
  the names table and geoBoundaries (Tripura as its eight districts), Rakhine
  from Natural Earth admin-1 — each matched exactly once or the build fails.
  **The units are the basemap's own**, from `tools/lib/bangladesh-units.mjs`,
  which `build-bangladesh.mjs` draws from too: a unit outside Bangladesh is
  cut at Bangladesh's border as COD-AB draws it, and each piece of land
  between it and that border goes to the nearest unit across it, as the
  basemap gives it — so no area outside Bangladesh claims Bangladeshi land,
  and every area's international edge is the basemap's border line, drawn to
  within the 250 m it is simplified at. The areas are
  then simplified together as the lakes map simplifies its areas (250 m), so
  an edge two outlines share stays one line; keeping the border stretches at
  the basemap's own 20 m was measured and refused, at +124% gzip. All eleven
  are built, pinned and measured, and `SHIP` lists which are written — today
  all eleven; a record the seed gains ships only once it is listed. A frame
  outside the detail box is never narrower than `MIN_FRAME_LON` (3.7° of
  longitude, which lands at z6 or below on a 390 px phone whatever card is
  open), widened about its centre and kept inside the basemap's bounds. A
  photo is found only for a record whose seed photo is null, and its
  provenance goes to `photos.seed.json` beside the seed, which
  `tools/extract-commons-photos.mjs ancient-janapadas` reads; the same entry
  holds the point of the site the photo shows — its Wikidata item's P625,
  cited there — which ships as `siteAt`. Where the item's point is wrong, the
  point is the site's own Wikipedia article's, cited to its revision, and the
  entry keeps the item's point and says why (`pointFrom: "wikipedia"`,
  `wikidataPoint`, `why`): today banga, whose item puts Wari-Bateshwar 22 km
  off, at Narsingdi town. A record that can have no photo — no site point for
  one to stand on — is made absent in the photo seed, `absent: { reason }`,
  and ships with no `photo` field, never pending; the editor's seed still says
  null. Today that is tamralipta: no Wikidata item is an archaeological site
  at Tamluk. Nothing on this map is pending. A record with a photo is drawn
  as a photo marker at that site, never at the area's centre, with its name
  under it, or above or beside it where that would collide; a record without
  one has no marker, and its name sits on its name point, or beside it. Names
  take those alternative anchors (`text-variable-anchor` with a
  `text-radial-offset`) rather than overlap, and avoid the photos (see
  **Names avoid photos**). A name point is the inner point of the part of the
  area inside the default view, kept half a name's width (25 px) from the
  view's edges and 30 px from every photo's centre, never of the whole area,
  so every name stands in the default view; the build fails one that does
  not. The default view is `DEFAULT_VIEW` in the build: what a 320×780 phone
  shows at the camera the map opens on, measured, not derived. The basemap's
  bounds set that zoom on a tall screen, so the view is narrower than the
  frame the map asks for, 86.9–91.6°E of 85.5–93.0°E. It is recorded with the
  frame and coverage it was measured on, and the build fails if either
  changes; a change to the page's layout needs it measured again by hand. A
  janapada with no part in that view keeps its whole area's inner point and
  is listed in `OUT_OF_VIEW` with the reason: today Ruhma, as Rakhine lies
  east of 92.17°E. Every area is a thin outline; only the selected one is
  filled. Every Bengali unit name the seed shows must be the names table's
  spelling; the build fails any other, except where `NAME_EXCEPTIONS` lists
  one with its reason — today Harikela's কাছাড়, cited to the seed's own
  source, where the names table has no Bengali. The areas credit every source
  they are made from — COD-AB (CC BY 3.0 IGO), geoBoundaries India (ODbL 1.0),
  Natural Earth, and OpenStreetMap (ODbL) for the land between a unit and the
  border — and, holding ODbL data, the areas file is offered under the ODbL;
  the build fails if the descriptor's credit leaves any of that out.
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
- The straits map's content exists twice — `docs/international/straits/data.js`,
  which the live page reads, and `docs/maps/straits/records.json`. **Until the
  live page is retired, `data.js` is the single source**: supplied content goes
  there, the extractor re-runs, and the validator proves the two match exactly.
  When the live page goes, `records.json` becomes the source and `data.js`
  disappears.
- The bridge to the app does not exist yet. `resolver.setCredentials()` is
  written, works, and nothing calls it. Until it is called the resolver uses
  the `relative` strategy, which is today's production behaviour.
