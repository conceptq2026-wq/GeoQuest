# liberation-war-1971

Read it with `CLAUDE.md`, whose rules and verification budget apply.

## Current state

- **liberation-war-1971**, «মুক্তিযুদ্ধ ১৯৭১» / "Liberation War 1971", a
  Bangladesh map on the `bangladesh` basemap. It is built, in
  `docs/maps/liberation-war-1971/`, and stays work in progress
  (`tools/wip.json`) until the user checks it locally.
- **Four tabs**, one records table `items`, each record carrying its `tab`:
  «সেক্টর» (11), «ফোর্স» (3), «স্থান ও ঘটনা» (16), «বীরশ্রেষ্ঠ» (7). The
  picker row is at the top. Each tab has its own picker prompt, and the
  sectors tab has its note in the map's top-left corner (the tabs module's
  `placeholder` and `note`).
  - Sectors: soft pastel areas with white borders, each numbered in a small
    white circle where the book prints its number. A tapped sector deepens and
    the rest fade (`dimmed`, a `fromSelection` relation on `siblings`). Each HQ
    has a flag, India's included. Sector 10 has no area; its four ports have
    anchors.
  - Forces: cards only; the battles are card text.
  - Places and events: red dots.
  - Bir Sreshtho: gold stars at the current burial places.
- **Sources.** The seed, `data-sources/liberation-war-1971/liberation-war-1971.seed.json`,
  is the editor's and holds every value with its source, in this order: the
  NCTB book → molwa.gov.bd → Wikipedia (bn, then en) → newspapers →
  Banglapedia. The research behind it, `tools/.cache/liberation-war-1971/quotes.md`,
  is out of git. The words — tabs, picker prompts, card labels, the note, the
  event names — are the user-approved draft's (`user-approved-draft-2.xlsx`, by
  SHA-256), except where NCTB names an event. The card's joining words are the
  editor's (`ui.composeBn`).
- **Sectors** are traced from the NCTB class 8 book's p. ২৬ map:
  - `sector-trace.json` holds the control points, lines and label positions,
    in the scan's pixels. The scan stays out of git (copyright).
  - `tools/build-liberation-sectors.mjs` fits them to COD-AB (9 points, RMS
    1.47 km), snaps internal lines within 5 km of a COD-AB boundary, and
    gives whole districts by the trace's `reassign` table: Bhola → 9.
  - It checks that the ten sectors tile COD-AB: overlap 0, gap 0.025 km².
  - `tools/review-liberation-sectors.mjs` draws the book's page beside the
    result, for review.
- **Points.**
  - Most points come from the seed, taken from Wikipedia.
  - Where Wikipedia gave only a stand-in, the point is the named place from
    OpenStreetMap: `tools/extract-liberation-points.mjs`, pinned as
    `osmLiberationPoints`, 9 elements.
  - Harina has no point of its own and takes COD-AB's centre of Khagrachhari,
    approximate.
- **The build**, `tools/build-liberation-war-1971.mjs`, composes each card
  from the seed and writes records, tabs, the areas, the port and place
  points, and the three SVG markers. It is byte-deterministic, and it pins
  the traced sectors' SHA-256.
- **Pending**: 0.
- **Decisions**, the user's, 2026-09-28:
  - Thakurgaon is in sector 6 as the book's map draws it, with a note on
    sectors 6 and 7.
  - Kalurghat's card quotes B8 p. ২৪.
  - Nasimpur is text only.
  - Taher and Hamidullah have no dates; the ministry's wounding of Taher is
    on the card.
  - K Force has no formation date.
  - A troop or guerrilla number is kept only where two sources agree.
