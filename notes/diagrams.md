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
  at the shell tier. One has moved (2026-09-28): the picker row,
  `docs/shared/picker.js` and `picker.css`, which the map shell and
  earth-interior's view share; atmosphere-layers loads neither.
- **The home section বিবিধ (`misc`)**, with the English heading
  "Miscellaneous", came with its first entry, atmosphere-layers — an empty
  section would have shown "Coming soon": `misc` in the registry
  generator's and the validator's `SECTIONS`, after the three syllabus
  sections, and both names in the home page's `SECTION_NAMES`.
