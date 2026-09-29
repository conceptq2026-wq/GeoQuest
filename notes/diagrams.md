# Interactive diagrams: the diagram shell

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

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
- **The diagram shell, as built.** `docs/visual/index.html` with its own
  `app.js` and `style.css`, and one module per view type, loaded only when
  that view's tab first opens — today `exploded.js`. `app.js` reads the
  descriptor and the diagram's data through the resolver, draws one tab per
  view the descriptor declares, and fills ⓘ. A descriptor with one view gets
  no tab bar, and its header is hidden: the view starts the page. ⓘ has a
  row of its own under the view's picker row, right-aligned, or at the view's
  top where it has none (2026-09-28). A view that
  declares no `type` is not built yet: its tab is there and its panel stays
  empty; a type with no module throws. From the map shell, as it
  is there: the `?v=` id rule (the map shell's for `?map=`), no page zoom,
  the visually hidden `<h1>` filled from the descriptor's Bengali title;
  Noto Sans Bengali from `docs/shared/fonts/`, preloaded; ⓘ collapsed until
  tapped, with the Noto Sans Bengali credit, small and faint as the map
  shell's (see CLAUDE.md, the map baseline); the load notice's look; the tab bar's roles,
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
  at the shell tier. One has moved (2026-09-28): the picker row,
  `docs/shared/picker.js` and `picker.css`, which the map shell and
  earth-interior's view share; atmosphere-layers loads neither. The views
  with a picker and a two-column card — cutaway (earth-interior) and orbit
  (seasons) — build them from `docs/visual/parts.js`, and a credit with no
  link (a value computed for the diagram) shows in ⓘ as plain text.
- **The home section বিবিধ (`misc`)**, with the English heading
  "Miscellaneous", came with its first entry, atmosphere-layers — an empty
  section would have shown "Coming soon": `misc` in the registry
  generator's and the validator's `SECTIONS`, after the three syllabus
  sections, and both names in the home page's `SECTION_NAMES`.
- **The rivers view (2026-09-29).** `docs/visual/rivers.js` and `rivers.css`,
  loaded only for a view of type `rivers` — one line in `VIEW_MODULES` — by
  bangladesh-rivers (local, in the work in progress: `notes/bangladesh-rivers.md`).
  The user approved this shell change with the module:
  - **A picture drawn in code.** One `<svg>` fills the stage; the view's `art`
    file holds the land, the outline, the lines as path data and the markers'
    and names' anchors, all in the frame's own units. Nothing is fetched but the
    diagram's own JSON, through the resolver.
  - **Pan and zoom, this module only.** 1× (the whole frame fitting the stage)
    to 6×; a drag pans, two fingers pinch, the wheel and a double tap zoom. A
    press that moves under 8 px is a tap. Strokes keep their width in CSS px;
    markers and names are laid out over the picture in CSS px, names at least
    15 px at 390 px wide and 14 at 320. No other view zooms. A frame with a
    `view` (x0, x1, cy, zoomMax, keep, in frame units) opens fitted to the
    stage's width on x0–x1 instead, zooms to zoomMax, pans in every direction
    while `keep` of the picture stays on the stage, and gets a reset control
    (`words.reset`, 44 px, bottom right).
  - **Taps.** A line's zone is a 26 px transparent stroke, a marker's a 44 px
    disc; a continuation has none. Each carries `data-key` (`line:<id>`,
    `marker:<id>`) and `data-title`, the heading its card must show. A tap on
    the lit one again, on the picture away from every line, on × or Escape
    closes the card.
  - **Two tabs, one set of standard ids.** Each tab builds its own picker row;
    the tab in view holds `prevRecord`, `recordPicker` and `nextRecord`, the
    other's carry a suffix, so the shell and `tools/check.mjs` read the same ids
    whatever the tab. The picker lists only the rivers the data names.
  - **`tools/check.mjs`** has a rivers branch, `riverSteps`: tab by tab, the
    picker, then every zone tapped where it alone takes the tap, with the layout
    check with no card and with each card, then ⓘ opened once (a shot; on the
    screen, scrolled to its last line, closed again). Its `CARD` and `FIT` read
    the card of the tab in view.
  - **Connectors:** a frame may carry `connectors` (id, parent, length, path
    data): straight segments the build adds from a branch's end to its parent,
    drawn in that river's group, with no tap zone (`notes/bangladesh-rivers.md`).
  - **Shared files and ⓘ blocks:** a view's `mount` also gets `shared(name)`,
    a fetch through the resolver's `sharedData` kind (a frame's `districts`
    reads `bangladesh-districts.json` so). A diagram whose data has
    `creditGroups` gets ⓘ as headed blocks — the ungrouped credits and the
    font first, then each group — one item a line, headings bold at 14 px;
    any other diagram keeps the one run of credits.
