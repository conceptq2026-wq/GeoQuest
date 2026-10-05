# The map shell

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## The map baseline — where its data comes from

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

Selecting a record must not reset tilt or bearing: `fitBounds` defaults bearing
to 0, so the current bearing is passed explicitly. The tilt button stops at
pitch 55; drags are clamped at `maxPitch` 60, slightly above the button's stop.

## feature-state is forbidden in `filter` and in layout properties

Proven against MapLibre's own validator: *"feature-state data expressions are
not supported with filters"*, and the same for layout properties. So selection
state is written into the features and the source is re-derived with `setData`.
That is the mechanism. Do not reintroduce feature-state for selection.

## Shell modules: tabs, timeline, globe, focus, legend and info

A shell feature that not every map needs is a module of its own, loaded only
for a map whose descriptor declares its term (`SHELL_MODULES` in `app.js`), so
no other map requests it. A module mounts before the map is built — it may
take room on the page, hide records through the shell's `hide`, add to the
map's style and options (`build.style`, `build.options`), take the map's taps
(`tapsOwned`, with the descriptor's click interactions as `tapTargets`) and
add actions (`actions`) — and installs once it is, with `map`, `runActions`,
`refilter`, `deselect`, `onChange` (after a selection, or a change in what is
shown), `archive` and `geometry` (a source's geometry file). Everything it
creates or changes goes through `own`, so teardown undoes it. Since
2026-09-30 it may also hide records from the map alone (`hideOnMap`: the
picker and ‹ › still list them, unlike `hide`), ask whether a record is
drawn now (`drawn`), and read a file of the map's own folder (`file`).

- **`tabs: { records, field, from, label, placeholder?, note? }`** divides one records table by a
  field, one part at a time: the tabs are the rows of `from`, in its order,
  titled by `label`. Only the active tab's records are on the map and in the
  timeline; a table they refer to (a shared city marker) stays only while an
  active record points at it; card links are not divided, and selecting a
  record in another tab opens that tab. A tab the student picks resets the
  camera to the map's own view; one opened by a selection keeps that
  selection's frame. The first tab is active on every load; nothing is kept.
  Drawn as one rounded pill bar, the active tab a filled pill. Two words may
  change with the tab (2026-09-28), each a value spec on the tab's row:
  `placeholder`, the picker's prompt, since what it offers changes; and
  `note`, a short note in the map's top-left corner, shown only while that tab
  is open. liberation-war-1971 uses both.
  **View tabs** (2026-09-30): a `tabs` with no `records` divides nothing —
  every record stays drawn and listed — and each tab may name a `frame`, a
  value spec on its row giving `[west, south, east, north]`; a tab the student
  picks puts the camera on that frame, or on the map's own view without one.
  The first use is the rivers map's «বাংলাদেশে» / «পুরো পথ».
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
- **`focus: { records, idle: { field, value }, parent, also?: [{ records, field }] }`**
  (2026-09-30) draws only what the selection is about — hidden, not greyed.
  With nothing selected, only the records of `records` whose `idle.field`
  holds `idle.value` (the main rivers); with one selected, that record, all
  its descendants (every generation, since 2026-09-30) and its chain of
  parents up to its main river — no sibling. A map draws the parents in a
  lighter context style through its own state (`fromSelection` on a refs
  field of ancestors), as the rivers map does. A table in `also` follows the record its
  `field` names (a river's markers go with their river), and selecting one of
  its records puts the view on that record. Hidden on the map only, through
  `hideOnMap`: the picker and ‹ › still list every record.
- **`legend: { items: [{ kind, label, line? | image? }], kinds: [{ records, field }] }`**
  (2026-09-30) lists, in the map's bottom-left corner at 14 px, what its
  colours and marks mean: one row per item, a stroke (`line: { color, width?,
  dash? }`) or one of the map's `images`, then its label. A row shows only
  while some record drawn now carries its `kind` in one of the `kinds`
  fields, so it follows focus and tabs; with nothing to show, it is gone.
- **`info: { file, headings: { sources, notes, conflicts } }`** (2026-09-30)
  keeps ⓘ exactly where every map has it — its row, its icon, its 44 px zone —
  and, opened, shows three headed blocks: the map's credits (MapLibre's own,
  copied in each time it opens), then the lines of `file` (`{ lines: [{ text,
  group }] }`, `group` "notes" or "conflicts") under their headings. 14 px
  text; the panel scrolls inside itself.
- **`chips: { records, field, from, label, frame? }`** (2026-10-01) is one line
  of group chips in the map's top-left corner, clear of the ⓘ zone and the
  corner controls. It scrolls sideways when it is longer than the map.
  - The groups are the rows of `from`, each chip titled by `label`. A record
    belongs to the group its `field` names; every group needs at least two
    members.
  - On a tabbed map, a group's row names its `tab`, and only the open tab's
    chips show.
  - A tap on a chip keeps its members on the map and takes the rest off it,
    off the map only (`hideOnMap`), so a tap can land only on a member. A
    place a member points at stays. The camera goes to the union of the
    members' `frame` fields.
  - A second tap, a selection outside the group, or another tab releases the
    chip.
  - Each chip is a 44 px tap zone with 14 px text. `tools/check.mjs` presses
    each chip, checks that only its members stay drawn, then releases it.
  - world-revolutions' Arab Spring and Revolutions of 1848 are the first use.
- **`tabs.cardsOnly: [<tab>]`** (2026-10-01) names tabs whose records have no
  place on the map.
  - While one is open, the map and everything drawn on it are hidden, not
    removed: the legend, chips, corner controls and the floating card.
  - The tab's cards are listed in the map's own space instead, in the table's
    order. Each card is drawn by the shell's `card(table, key)`: the sheet's
    title and value rows.
  - A tap on a card selects it as the picker would, and the picked card is
    marked and scrolled into view.
  - The validator fails any source that draws a record of such a tab.
  - It is the exception written in `notes/descriptor.md`, used by
    world-revolutions' «অ-রাজনৈতিক বিপ্লব».
- A capability may be proved on a **test map outside `docs/`** first:
  `tools/fixtures/<name>/`, never published, checked by
  `node tools/check.mjs --fixture=tools/fixtures/<name>`. M1's `shell-m1` was
  removed in M4 (2026-09-30): the rivers map draws everything it held, under
  `node tools/check.mjs bangladesh-rivers-map`.
- **View tabs say more by `views`** (M3, 2026-09-30): `views: { <tab>: {
  selectionFrame?, enabledBy?, disabledNote? } }`. `selectionFrame` names a
  bbox field: while that tab is open the tabs module's action `fitTab` (run by
  the picker and taps after `select`) frames the selection there, and picking
  the tab frames it there too — the selection stays. `enabledBy` names a
  boolean field: a selected record holding false disables the tab (greyed,
  44 px, aria-disabled, a tap does nothing), and `disabledNote`, a value spec
  on the tab's row, says why in ⓘ's row; a selection that disables the open
  tab opens the first left. The module tells others the open tab
  (`activeTab()`); focus's `idleByTab` rests a tab on a set of its own.
- **Approved** (the user, 2026-10-05, on the R-55 report): `views.<tab>.hide`,
  legend `kinds[].tab` and `sheetMaxHeight`, below. R-56 (the same day, the
  user's decisions) added `hide.records[].picker` and `views.<tab>.maxBounds`,
  approved by the user the same day (2026-10-05, on the R-56 report).
- **A view tab may hide part of the map** (R-55, 2026-10-05): `views: { <tab>:
  { hide: { sources?: [<source>], records?: [{ records, field, value, picker? }] } } }`.
  - While that tab is open, `sources` are off the map: every layer drawing
    them, their tap zones too.
  - `records` are off the map wherever their `field` holds `value`, from
    every source derived from their table (`hideOnMap`: the picker and ‹ ›
    still list them).
  - `picker: true` on a records entry (R-56) takes those records out of the
    picker and ‹ › as well (`hide`, not `hideOnMap`). Picking the tab with
    one selected clears the selection and opens the tab's own view. One
    selected from anywhere while the tab is open opens the first tab that
    lists it.
  - Another tab shows them again. The validator holds the names to declared
    sources and fields.
  - The rivers map's «বাংলাদেশে» draws Bangladesh only; its «পুরো পথ» hides
    the Bangladesh-only lines.
- **A view tab may pan within bounds of its own** (R-56, 2026-10-05):
  `views: { <tab>: { maxBounds: [w, s, e, n] } }`, within ±85°, beside the
  map's own `constraints.maxBounds`, which every other tab keeps.
  - The tabs module sets them through the shell's `bound(box | null)`; the
    bounds under the card follow the box in force.
  - The rivers map's «পুরো পথ»: 80.5, 10, 97, 40, so its rest view shows
    every course on a phone held upright.
- **A legend `kinds` entry may name a `tab`** (R-55): it counts only while
  that view tab is open, so the rivers map lists its dashed reach outside
  only in «পুরো পথ».
- **`frameClearsControls: true`** (top level, opt-in; the user's decision,
  2026-10-06, approved for the rivers map): every fit to a record keeps the
  column of the map's top-right controls (the compass, the tilt button) out of
  the frame on the right, measured as they stand: the column plus 16 px, 70 px
  on the rivers map at 320 and 390. Opening and tab rest views are not fits to
  a record and do not move. Without it a map frames as before.
- **`sheetMaxHeight`** (R-55, top level): the open card's most, as a share of
  the map's height, from 0.2 to the shell's own 0.62.
  - The card's body scrolls inside the rest; the camera, padded for the card
    as it stands, frames the selection in the room above.
  - Set when a card opens and on every resize. Without it a card is as before.
  - The rivers map's 0.4.
- **`minTextSize: 14`** (M3): no text under 14 px on that map — every label's
  size in its style floored (the basemap's, the baseline's, its own), the
  shell's chrome under `[data-min-text]` in style.css. Other maps unchanged.

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
