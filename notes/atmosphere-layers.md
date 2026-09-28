# atmosphere-layers

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Interactive diagrams — the first diagram

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
     copies them into the diagram's folder. Tier: tools. Its cutting and
     saving moved into `tools/lib/diagram-art.mjs` (2026-09-28), shared with
     earth-interior's art tool; the 46 files it writes stayed byte-identical.
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
     second build is byte-identical; a preview tool, since
     `tools/preview.mjs --build <id>`, which builds into a temporary copy of
     `docs/` outside the repo and serves it on 127.0.0.1, to see a change
     before it is built in; the diagram's
     section in `verify-descriptor.mjs`; and বিবিধ with its registry entry.
     While the descriptor declares one view, the tab bar is hidden: no empty
     tab. Tier: the diagram's own, plus the home page / registry tier.
  8. Next: the 2D cross-section view, once it has an approved look. The tab
     bar returns with it, both tabs as in the mockup. Tier: the diagram's
     own.

## Current state

- One diagram, under বিবিধ: `atmosphere-layers`, in `docs/diagrams/`, with
  its exploded view; its cross-section is next. It is built by
  `tools/build-diagram-atmosphere-art.mjs`, then
  `tools/build-diagram-atmosphere-layers.mjs`, from
  `data-sources/atmosphere-layers/` — the seed, NOAA's figures by the user's
  decision until the user's book is in, and the eight approved art inputs.
  Nothing on it is pending. What is built for diagrams is listed at the top
  of **Interactive diagrams**.
