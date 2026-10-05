# maritime-zones

Read it with `CLAUDE.md`, whose rules and verification budget apply.

## Step 3 (2026-10-05): the real-time 3D view — local preview only

- **The look** is the user's approved mockup,
  `tools/.cache/unclos/maritime-zones-mockup-3d-v7.html` (SHA-256
  `bca6dd80…`, an original made for the project, not copied into `docs/`),
  ported into the shell's conventions. The descriptor's view is now of type
  `zones3d`; its file is still `zones.json`, which gains a `scene` model (the
  mockup's units) beside step 2d's 2D model.
- **The shell exception the user approved** (as in step 2): new
  `docs/visual/zones3d.js` and `zones3d.css`, loaded only for a `zones3d`
  view through one line in `VIEW_MODULES` (`docs/visual/app.js`), plus the
  regenerated asset stamp. Nothing else in the shells changed.
- **Three.js r128**, for this view only (the shells' `three` stays 0.185.1):
  `build/three.min.js` and `LICENSE` from the npm package three 0.128.0,
  unchanged, in `docs/visual/vendor/three-0.128.0/`.
  - Source: `https://registry.npmjs.org/three/-/three-0.128.0.tgz`, fetched
    once with the repo's User-Agent; 6,543,441 bytes, SHA-256 `df6a5d06…`
    (`threeR128` in `tools/sources.json`; `tools/fetch-sources.mjs` checks the
    cached copy).
  - `three.min.js`: 603,445 bytes (148,737 gzip -9), SHA-256 `9274bbce…`;
    `LICENSE` (MIT) SHA-256 `7dddf7c5…`.
  - `tools/verify.mjs` holds both files to those hashes, allows nothing else in
    `docs/visual/vendor/`, and pins the network surface: absolute URLs 4,
    `fetch(` 2, image src 1, XHR 1, the rest 0 (its loaders; the view uses
    none). Loaded by a relative dynamic import from `zones3d.js` only; no CDN.
- **Fallback.** No WebGL context, Three.js failing to load or the renderer
  failing to start: `zones3d.js` hands the panel to `zones.js` with the same
  file — step 2d's 2D view, both projections. Its legend's Area swatch is
  still `zones.js`'s own pink (`#C98FAE`); `zones.js` may not change.
- **The scene** (the user's decisions):
  - one side view; a drag turns it, a pinch or the wheel zooms × 0.35–1.5 of
    the distance; ⟲, named «পাশ থেকে», goes back (at once with reduced
    motion, else 600 ms); a frame is drawn only on a change, no loop;
  - a low rolling coastal plain, field-patch colours, tree clumps, no hills;
    the bay is the internal waters; strata on all four cut faces, the
    terrain's underside filled; translucent water walls on the near, far and
    open-sea faces; the surface's opacity follows the depth;
  - the shelf and the Area as thick bands on the near and far faces, the
    Area's on the open-sea face, nodules on its floor, the overlays over the
    water tint; «মহীসোপান» and «এরিয়া» beside discs ৫ and ৭;
  - the baseline a white dashed line on a dark edge, a light curtain to the
    seabed, «ভিত্তিরেখা» at its far end;
  - four bars under the near face, every one from the baseline, each label
    above its bar; choosing ২–৫ washes the span from the baseline with a white
    dashed outline and thickens its bar; every zone keeps its own area's
    outline (the EEZ after the territorial sea, arts. 33, 55).
- **Colours** (the user's change): the shelf bright yellow, fill `#E8C400`
  (was `#F0E442`), bands `#F2D21B`; the Area deep purple, fill `#6A3D9A` (was
  `#CC79A7`), bands `#7B4BAE`, nodule texture `#8A63BD`. All seven now live in
  the seed (`drawing.colours`); the build reads them there.
- **New strings**, approved (the user, 2026-10-05): `words.tip3d` and the four
  `drawing.distanceLabels`. The shelf's name is its approved name without the
  bracket (step 2's rule).
- **Layout.** The stage is 58% of the screen's height (at least 260 px) under
  the picker row and ⓘ's row; under it the tip and the legend (baseline,
  contiguous zone, shelf, Area); the card takes their place, never the
  stage's. Text ≥ 14 px; each number a 44 px button (`.zone[data-key]`).
- **Where it differs from the mockup:**
  - disc anchors moved (১ 66/0.5, ২ 148/0.1, ৩ 222/0.88, ৫ 215) and the bars
    0.66 apart (was 0.46), so that at 320 px the numbers stand ≥ 44 px apart
    and each label fits between two bars;
  - a name that would leave the stage stands left of its number (৭ at 320 and
    390); «ভিত্তিরেখা» stands higher, clear of ১;
  - no «ঘোরাতে টানুন» hint (not an approved string) and no failure text (the
    2D view replaces it);
  - a tap on nothing or a second tap on the chosen zone closes the card, as in
    step 2; × and Escape return focus to the zone's number.

## Step 2d (2026-10-02): a half-screen picture, baseline distance bars — local preview only

- **Size** (the user's decision). The picture is as wide as the stage and
  stands at its top, about as tall as it is wide.
  - At 320 × 640: side 320 × 315 (60% of the stage's height), sea 320 × 309
    (59%).
  - At 390 × 844: side 390 × 384 (53%), sea 390 × 377 (52%).
  - One shape cannot be 55–60% on both screens; this one sits at the range's
    top on the first and just under it on the second.
  - Projections: side y = 300 − 140v + 1.3z; sea y = 600 − 165a + 0.8z.
  - Zoom, double tap and the card behave as in step 2c.
- **Distance bars** (the user's decision) replace step 2c's arrows. They are
  thin strips on the sea surface along its v = 0 edge (the front edge from
  the side, the left edge from the sea), each in its zone's colour, every
  one starting at the baseline:
  - ০→১২ (২), ০→২৪ (৩, hatched), ০→২০০ (৪);
  - the shelf's ০→২০০, then dashed to 440 (৫).
- **Details.**
  - The dashed baseline is drawn again over the bars' starts.
  - The tick labels ০/১২/২৪/২০০ stand off the edge, on a light halo. In the
    sea view they stand to the edge's left, and a label that would touch
    the one before steps out.
  - Choosing a zone outlines its bar too.
  - The zones' own areas are unchanged: the contiguous zone over the EEZ's
    inner part, the EEZ after the territorial sea (arts. 33, 55).
- **At 320 px:**
  - the bars start 0.02–0.03 px from the baseline line (0, to rounding);
  - text ≥ 15.7 px; disc centres ≥ 50 px apart;
  - the strips ≥ 15 px from the discs and ≥ 2.6 px from their tap circles;
  - the bars' numbers and the tick labels ≥ 13 px from the discs and
    ≥ 0.9 px from the tap circles;
  - no words overlapping. No new words.

## Step 2c, second part (2026-10-02): a picture that fills the stage — local preview only

- **Why.** At 320 × 640 the picture filled about a third of the stage
  (288 × 204 px in 320 × 522).
- **Recomposed for portrait phones:**
  - side view: x = u + 40v, y = 300 − 235v + 2.1z;
  - sea view: x = 84 + 280v + 150a, y = 600 − 400a + 1.6z;
  - the block's floor is 150 (was 170), so the earth under the seabed is
    thinner;
  - numbers relative to the seabed may stand above it ('bed-n'), as the
    Area's does in the side view.
- **Fill.** The frame is cropped to the drawing, with the legend drawn
  inside the picture under it. At 1× the frame is as wide as the stage.
  - At 320 × 640: side 320 × 521, sea 320 × 516 in a 320 × 522 stage.
  - At 390 × 844: side 390 × 635 (88% of the height), sea 390 × 629 (87%).
- **Zoom.** A pinch zooms 1×–3× and a drag pans. A double tap at one place
  takes back the first tap's choice and goes to 1×. The wheel zooms on a
  desktop. A switch of view resets the zoom.
  - With the card open the stage is shorter. The picture keeps its 1× size
    and centres on the chosen number; a number taking the keyboard's focus
    is brought into view.
  - The discs' tap circles stay 45 px at any zoom. Nothing animates.
- **Layout check.** Nothing in the picture carries `data-fit`: it pans, so
  `check.mjs`'s fixed-stage layout probe does not apply to it. Word overlaps
  and sizes were measured by hand at 1×.
- **At 320 px:** text ≥ 14.95 px; disc centres ≥ 57.6 px apart; arrows ≥ 7.6
  px from the tap circles and ≥ 20.6 px from the discs; no words overlapping.

## Step 2c (2026-10-02): full colours, baseline arrows — local preview only

- **Full colour** (the user's decision). Choosing a zone dims nothing. Every
  face of the chosen zone gets a light halo under a dark line, and its
  numbers' discs a stronger ring (6 units against 2.5).
- **Distances from the baseline** (the user's decision). The ruler is now
  nested dimension arrows, every one starting at ০:
  - ০→১২ with disc ২, ০→২৪ with ৩, ০→২০০ with ৪;
  - the shelf's arrow, solid to ২০০ then dashed beyond it, with ৫.

  Tick labels ০/১২/২৪/২০০ sit between the block and the arrows, with
  dotted extension lines.
- **Where they sit.** Under the block from the side, left of it from the
  sea. The longest arrow is nearest the block; each number stands just past
  its arrow's tip, where no shorter arrow reaches. The zones' own areas are
  unchanged: the EEZ after the territorial sea, the contiguous zone 12–24
  over its inner part.
- **The sea projection** became x = 84 + 280v + 150a (from 40 + 300v + 150a),
  to make room for the arrows on its left.
  - Its numbers moved to stay 45 px apart and clear of the tick labels;
    the shelf's now stands at u = 250.
  - The side view's Area number moved up 6 units, and the stage's padding
    tightened, so the side view with a card open still fits 288 px at
    320 × 640.
- **At 320 px:**
  - arrows to the zones' tap circles: ≥ 1.8 px (side), ≥ 0.6 px (sea);
  - arrows to the discs: ≥ 15 px;
  - disc centres: ≥ 46.1 px (side), 45.2 px (sea) apart;
  - text: 14.4 px least.

  No new words.

## Step 2b (2026-10-02): the 3D look and the sea view — local preview only

- **The look** is the user's approved mockup,
  `tools/.cache/unclos/maritime-zones-mockup-v4.html` (SHA-256 `90e4c8da…`,
  an original made for the project), ported into the shell's conventions.
  The same exception as step 2 covers it: only `zones.js`, `zones.css`,
  this item's files and the stamp changed.
- **The model.** `zones.json` holds one 3D model: u from the land to the open
  sea, v along the coast, z the depth. The seabed is a profile, with a bay
  for the internal waters.
  - It has two affine projections, chosen by a two-button switch in a row of
    its own under ⓘ's: «পাশ থেকে» (default) and «সমুদ্র থেকে».
  - Switching re-renders the picture and keeps the choice and the card.
    Choosing changes classes only.
- **Drawn back to front:**
  - the seabed shaded by depth and slope, with depth lines, under a water
    surface whose opacity follows the depth;
  - the zones' approved fills blended into the water;
  - the land with hills, the cut face's sediment layers and water column,
    and the end face;
  - ships, a platform, and nodules on the Area.

  Textures are SVG filters; no image. The contiguous zone is hatched and
  the baseline dashed.
- **Numbers.** The zones are numbered ১–৭ coast to sea in discs. The picker,
  the card's title and each disc's name read «<number>. <name>».
  - The legend: dashed line «ভিত্তিরেখা», hatch «সংলগ্ন অঞ্চল», nodules
    «এরিয়া», «স্কেল অনুযায়ী নয়», and «দাগের সংখ্যা: ভিত্তিরেখা থেকে নটিক্যাল
    মাইলে».
  - The switch's and the legend's new words are in the seed, approved (the
    user, step 2b).
- **Taps.** Each zone's button is an invisible disc round its number, 45 px
  across on any screen. The zone's own surface and faces take a tap too.
  - The numbers stand at least 44 px apart at 320 px in both views. The
    mockup's places moved along the coast where two were closer.
  - Numbers keep full ink when another zone is chosen; only the disc's ring
    dims.
- **Sizes at 320 px.** The numbers and the ruler are 26 picture units, 14.4
  px when the picture is 288 px wide. The legend is 14 px (15 from 390 px).
  - The sea view with a card open is taller than the stage at 320 × 640,
    and the stage scrolls to its legend.
- **Not drawn now:** the land's label, the shelf's «শর্তসাপেক্ষে ২০০-এর
  বেশি» and the separate axis note; the legend replaces them.

## Step 2 (2026-10-02): the drawing, a `zones` view — local preview only

- **The shell exception the user approved (Option A).** It adds a new
  `docs/visual/zones.js` and `zones.css`, loaded only for a view of type
  `zones`, through one line in `VIEW_MODULES` (`docs/visual/app.js`), plus
  the regenerated asset stamp. Nothing else in the shells changed.
  `check.mjs --all` against the baseline stored first: all 36 differences
  are exactly the stamp swap.
- **The build.** `tools/build-diagram-maritime-zones.mjs [out]` writes
  `descriptor.json`, `data.json` and `zones.json` (the layout). While the
  item is in progress only the preview runs it, into its copy; nothing is
  under `docs/diagrams/` yet, and the registry is unchanged. It refuses an
  unapproved string and a fill whose label colour misses 4.5:1, plain or
  dimmed.
- **The picture**, drawn by `zones.js` in CSS px, not to scale:
  - Water row, coast to sea: land, internal waters, the baseline, the
    territorial sea, the EEZ (the contiguous zone a hatched strip over its
    inner part), the high seas.
  - Seabed row: plain seabed under the internal waters, then the territorial
    sea's own bed, then the shelf from the 12 mark, solid to 200 and fading
    with no end tick, then the Area, dotted.
  - Ticks 0/12/24/200, the axis note, a three-line legend (hatch, fade,
    dots), and the baseline's name and «স্কেল অনুযায়ী নয়» in the top row,
    clear of ⓘ's zone.
- **Labels.** A zone's name on its fill is its approved name without the
  bracket that follows it, placed across or up in lines wherever it fits
  whole. Names on the picture are 15 px from 390 px wide and 14 px under
  (the user's rule); every other word is 14 px. ⓘ's lines are 14 px here
  only (`.zones .attrib-item`).
- **Colours** are zones-design.md's light values. Label ink per fill, plain
  then dimmed (dark ink when another zone is chosen):
  - internal waters: white 5.19, dimmed 10.38;
  - territorial sea: 8.38, dimmed 13.19;
  - EEZ: 5.52, dimmed 11.47;
  - high seas: 8.18, dimmed 13.22;
  - shelf: 14.28, dimmed 15.82;
  - land: 11.54.

  The hatched strip and the dotted Area carry no text; the legend names
  them.
- **Tap zones at 320 px:**
  - water row: internal waters 44 wide, territorial sea 48, EEZ 98 (strip
    48 × 44 over its inner part), high seas 72;
  - seabed row, 48 tall: the territorial sea's bed 48, shelf 126 (with its
    fade), Area 44.

  At 390 px the columns are wider by weight. The picker is the main way in.
  Water and seabed are separate zones; the territorial sea's two are one
  item.
- **Interaction.** Choosing or tapping outlines the zone (2 px), dims the
  other fills to 35%, and docks the card with the zone's sentences. ×, Escape
  or a second tap closes it, and focus returns to the zone; the zones are
  focusable buttons (Enter or Space).
- **Checked at the end:**
  - `check.mjs maritime-zones` at 390 and 320 px: picker 7/7, taps 8/8,
    tap zones ≥ 44 px, layout clear 16/16, console 0.
  - The three suites.
  - Escape, × and focus return in the in-app browser at 320 px.
  - One contact sheet: `tools/.check/maritime-zones/contact-sheet.png`.

## Current state (step 1c, 2026-10-02)

- **What it is.** A diagram of the zones of the UN Convention on the Law of
  the Sea (UNCLOS), in Bengali, under International. It is in progress:
  listed in `tools/wip.json`, so it is on the local preview's home page only
  (a «কাজ চলছে» card), and not in the registry.
- **Title.** The working title is «সমুদ্র আইন: সমুদ্রের অঞ্চল». The card's
  caption, «কোন সমুদ্র-অঞ্চলে কার কী অধিকার», goes into
  `tools/home-cards.json` only when the diagram is finished: that file takes
  finished items only, and the preview draws no caption for a card in
  progress.
- **Step 1 is the seed alone:** no drawing, no shell change.
  `data-sources/maritime-zones/maritime-zones.seed.json` is written by a
  research script outside the repo, which refused any quote it could not
  find.
- **Picker items.** The seed holds 7 picker items, coast to sea, decided by
  the user: internal waters, territorial sea, contiguous zone, EEZ,
  continental shelf, high seas, the Area. It has 19 card sentences, and 3
  lines shown as text only: straits, archipelagic waters, land-locked
  States.
- **Approval.** All 49 Bengali strings are `"approved": true` (step 1c,
  2026-10-02), after the user's six edits to sentences #29, #31, #37, #39,
  #41 and #46 of the approval list.
  - Three terms are approved **provisionally**, pending the user's check
    against a textbook: «নির্দোষ অতিক্রমণ» (innocent passage), «মানবজাতির
    সাধারণ ঐতিহ্য» (common heritage of mankind) and «ট্রানজিট অতিক্রমণ»
    (transit passage).
  - Two edits gained a quote from the same article:
    - #29 the straight-baseline condition, art. 8(2);
    - #37 "all States", art. 58(1).

    The seed now has 60 quotes. The overview words #37's subject as "All
    other States", which does not contradict art. 58(1).

## Sources (the user's decision, 2026-10-02)

There are two sources, and nothing else:

1. The DOALOS overview page, "Overview - Convention & Related Agreements".
2. The Convention's full text, as DOALOS publishes it, linked from that
   page: parts I–VII, X and XI §1–2.

- **Pinned files.** Each downloaded file is pinned in the seed by size and
  SHA-256, with its retrieval date. The files are kept in
  `tools/.cache/unclos/`, out of git; the research notes there are
  `inventory.md`, `zones-design.md` and `picker-check.md`.
- **Citations.** Every sentence cites `overview` (with its place, e.g. "key
  features, bullet 7") or `convention` (with the article). Since step 1c a
  quote is committed only as its place: `file`, `offset` and `length` in
  that pinned file's normalised text, and the `sha256` of the quote (its
  UTF-8 bytes). Each quote is at most 15 words. The readable quotes are in
  `tools/.cache/unclos/quotes.json`, out of git.
- **The normalisation**, defined once here and repeated in
  `tools/verify.mjs`, takes one pinned file's bytes and:
  1. decodes them as Latin-1;
  2. removes `<script>…</script>`, `<style>…</style>` and `<!-- … -->`;
  3. puts a newline for each opening `p`, `div`, `br`, `li`, `tr`, `table`
     and `h1`–`h6` tag;
  4. removes every other tag;
  5. decodes `&#N;` and the entities `nbsp amp quot lt gt rsquo lsquo ldquo
     rdquo ndash mdash`;
  6. collapses each run of whitespace (JavaScript `\s`) to one space.

  Offsets are JavaScript string indices into that text.
- **What `tools/verify.mjs` checks:**
  - the pins, and that they are the ones `tools/sources.json` records;
  - every quote, sliced out of the normalised pinned text at its offset and
    length: at most 15 words, and matching its SHA-256;
  - that no seed citation carries readable words;
  - that no tracked file holds any quote's words (whitespace collapsed);
  - the item order;
  - the approval flag on every Bengali string;
  - no project words and no stray spacing in Bengali;
  - nautical miles only;
  - no e-mail address.
- **In `tools/sources.json`** (step 1b, 2026-10-02): `unclosOverview` and
  `unclosConvention`, each file by size and SHA-256, cached under `unclos/`.
  - `tools/fetch-sources.mjs` downloads both (step 1c). The site names the
    Convention's parts `.htm`; the cache keeps them as `.html`. On another
    machine, `node tools/fetch-sources.mjs` fetches them to their pins, and
    then the check runs.
  - **Licence (step 1c).** The UN site's Terms of Use,
    <https://www.un.org/en/about-us/terms-of-use>, were read on 2026-10-01
    at 22:43 UTC (page SHA-256 `c63ab9e5…`, kept in the cache).
    - They permit downloading and copying for personal, non-commercial use,
      without any right to redistribute or create derivative works.
    - So the public repo carries no UN text: only the diagram's own Bengali
      sentences and each quote's place and hash. The same finding is in
      both `tools/sources.json` entries.
    - The app is commercial, and GeoQuest's sources must permit commercial
      use. Whether stating facts from these pages in our own Bengali is
      acceptable is the user's decision, before the diagram ships.
- **No other link was followed.** A third-party infographic the user showed
  for layout was not copied, traced or stored.

## Decisions that shape the drawing (from the sources)

- **Measuring.** Every distance is measured from the baselines (art. 3, 33,
  57, 76). The axis says so.
- **The contiguous zone is a strip, not a band.** It reaches at most 24 NM
  (art. 33(2)) inside the EEZ's span: the EEZ starts at the territorial sea
  (art. 55) and reaches at most 200 NM (art. 57). The strip over the EEZ's
  inner part is a drawing choice, never a card claim.
- **Two rows, water and seabed.**
  - The territorial sea's bed is the territorial sea's (art. 2(2)).
  - The shelf starts beyond the territorial sea (art. 76(1)), and is at
    least 200 NM per the overview. Past 200 it fades with no end tick. The
    art. 76(5) limits are in the card only.
  - The high seas begin beyond the EEZ (art. 86). Shelf rights do not change
    the waters above (art. 78(1)).
  - The Area: what it is from art. 1, its status from arts. 136 and 137
    (the user, step 1b, which replaced the earlier "art. 1 only").
- **Units.** Nautical miles only: neither source gives the nautical mile's
  length, so a kilometre figure would need an outside constant.

## Serving it: Option A or Option B (read-only finding, 2026-10-02)

**Option A — an opt-in view in the diagram shell:**

- one line in `VIEW_MODULES` in `docs/visual/app.js`, plus a new
  `zones.js` (about 300 lines) and `zones.css`, loaded only by a view of
  type `zones`;
- the picker (`parts.js` `pickerBar`), the docked card (`dockedCard`) and
  the highlight-and-dim pattern are reused as they are;
- the change moves the shells' asset version, so `tools/stamp-assets.mjs`
  rewrites every `?v=` reference, and `check.mjs --all` is run against a
  baseline stored first;
- other items' data stays byte-identical;
- the home card, registry, preview and `check.mjs` all work as for any
  diagram.

**Option B — a self-contained page.** It still changes shared files:

- **The home card's link.** `docs/index.html` (`hrefOf`) opens a diagram
  only as `visual/index.html?v=<id>`. A page elsewhere needs a new registry
  kind or link field: `tools/build-registry.mjs`, the home page, and the
  registry checks in `tools/verify.mjs`. The preview (`tools/preview.mjs`,
  placeholders keyed `diagrams/<id>`) and `tools/check.mjs` (`pageOf`) open
  only the two shells.
- **The stamp.** `tools/lib/asset-version.mjs` versions and checks only
  references from `docs/shell/`, `docs/visual/` and `docs/shared/`. A page
  under `docs/diagrams/` that loads the resolver or the picker would go
  unversioned and unchecked, unless that file changes.
- **The no-calls scan.** `tools/verify.mjs` scans `docs/visual/`,
  `docs/shell/` and `docs/index.html` for outbound calls; the new page
  would need adding.
- **The resolver.** The portability rule (every URL from
  `docs/shared/resolver.js`) still applies: the page must load the
  resolver, or inline all its data and fonts.
- **Duplication.** It would repeat the picker and the card instead of
  reusing them.

**Finding:** B touches more shared files than A, and A is the smaller,
already-patterned change. Neither is started; both need the user's
approval as a shell exception.
