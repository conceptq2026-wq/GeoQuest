# maritime-zones

Read it with `CLAUDE.md`, whose rules and verification budget apply.

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
