# seasons

A diagram in বিবিধ (misc), «ঋতু পরিবর্তন» / "Seasons". It is work in progress
(`tools/wip.json`) until the user checks it locally.

## Steps

- **Step 1 (2026-09-28):** its card, and the sources in
  `tools/.cache/seasons/quotes.md`, out of git. The sources are the NCTB book's
  pp. ২৪–২৮, NASA Space Place "What Causes the Seasons?", and Dhaka's day
  length computed by NOAA's equations (`daylength.mjs` beside it).
- **Step 2 (the same day):** the diagram, built from the editor's seed,
  `data-sources/seasons/seasons.seed.json`, which the build reads and never
  writes. The two pending rows were filled from the same NCTB book, chapter
  10's climate section (PDF pages 161 and 164):
  - Bangladesh's warmest month is «এপ্রিল», p. ১৫৬: «এপ্রিল উষ্ণতম মাস». It
    is shown on the 21 June card.
  - Its coldest month is «জানুয়ারি», p. ১৫৯: «জানুয়ারি শীতলতম মাস». It is
    shown on the 22 December card.
  - Both are cited in the seed's sources. The NCTB source's pages, and the
    first line of `ui.creditsBn`, now read ২৪–২৮, ১৫৬, ১৫৯.
- **The seed's pin:** its SHA-256 is pinned in `tools/verify-descriptor.mjs`,
  now `59f4b3fe…efb2` (it was `0f1d1375…0860` before the rows were filled). An
  edit of the user's comes with its new value.

## Inputs, approved by the user

- **The paintings,** `data-sources/seasons/art/sun.png` and `earth.png`, each
  1254×1254 on white. Each is pinned in the seed by its file's SHA-256 and by
  its decoded pixels'. The Earth is cut from white only and never clipped to a
  circle (the user's decision).
- **The look,** `design/mockups/seasons.png`, with its three errors fixed:
  - the orbit runs anticlockwise;
  - each Earth is half day, half night;
  - the positions are the book's (fig. ২.১৯), June right, September top,
    December left, March bottom; the mockup mirrored them.

## How it is built

- **`tools/build-diagram-seasons-art.mjs`** refuses an input whose file or
  pixels differ from the pins. It cuts both paintings with the shared soft key
  (`tools/lib/diagram-art.mjs`), trims them, and writes them to the untracked
  staging folder `data-sources/seasons/build/`:
  - `sun@1x.webp` (171×169) and `sun@2x.webp`;
  - `earth@1x.webp` (101×103) and `earth@2x.webp`, at a few KB each.

  It also measures each painted disc in its cut-out (centre, and the radius of
  its solid area) and records the inputs' hashes.
- **`tools/build-diagram-seasons.mjs [out]`** writes `descriptor.json`,
  `data.json` and `manifest.json`, and copies the art, into
  `docs/diagrams/seasons/`. A second build writes the same bytes.
  - Card titles and picker items are the seed's `ui.cardTitle` and
    `ui.pickerItem`, filled with each position's date and name.
  - Rows follow `ui.rowOrder`, a row a position has not left out.
  - ⓘ shows `ui.creditsBn`: NCTB and NASA linked to their pages, the NOAA
    computation plain text. Nothing is credited for the art.
- **The view,** `docs/visual/orbit.js` and `orbit.css`, is loaded only for a
  view of type `orbit`. It draws everything but the two paintings:
  - the Sun in the centre, with «সূর্য» under its disc;
  - the orbit, an ellipse with arrows running anticlockwise;
  - the four Earths at the seed's placements;
  - each Earth's axis, all parallel, tilted 23.5° with the North Pole leaning
    toward the Sun at June, with an upright dashed line, an arc and «২৩.৫°»;
  - a faint equator square to the axis;
  - the night half, away from the Sun, masked by the Earth cut-out's own alpha;
  - each date, on a pill, under its Earth.

  A tap on an Earth, its date or the picker row selects the position: a white
  glow ring round the Earth, and the card docked at the foot, two columns,
  × «বন্ধ করুন». Each Earth's round tap zone is at least 44 px (70 px at 390,
  59 at 320). The picker row is at the top, as in every shell. The picture is
  fitted to the stage at its least (45% of the screen), so it fits between the
  row and the card whether the card is open or not.
