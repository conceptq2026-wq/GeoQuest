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

## Shell modules: tabs, timeline and globe

A shell feature that not every map needs is a module of its own, loaded only
for a map whose descriptor declares its term (`SHELL_MODULES` in `app.js`), so
no other map requests it. A module mounts before the map is built — it may
take room on the page, hide records through the shell's `hide`, add to the
map's style and options (`build.style`, `build.options`), take the map's taps
(`tapsOwned`, with the descriptor's click interactions as `tapTargets`) and
add actions (`actions`) — and installs once it is, with `map`, `runActions`,
`refilter`, `deselect`, `onChange` (after a selection, or a change in what is
shown), `archive` and `geometry` (a source's geometry file). Everything it
creates or changes goes through `own`, so teardown undoes it.

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
