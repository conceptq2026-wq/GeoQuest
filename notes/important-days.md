# important-days — «বছরের চাকা» (work in progress)

Read it with `CLAUDE.md`, whose rules and verification budget apply. A diagram under বাংলাদেশ.

**Status: work in progress (WHEEL-2, 2026-10-08), on the local preview only.**
- In `tools/wip.json` under Bangladesh; not in `docs/registry.json`.
- Built into `docs/diagrams/important-days/` by `tools/build-diagram-important-days.mjs` from
  `data-sources/important-days/days.seed.json`. `tools/verify-descriptor.mjs` pins the seed and holds the folder to a
  fresh build, with twelve months whose counts are the seed's.
- Drawn by the diagram shell's view `days`: `docs/visual/days.js` and `days.css`, a new module loaded only for this
  view (one line in `VIEW_MODULES`).
- The research is out of git, in `tools/.cache/days/`:
  - `investigation.md`, the verified list;
  - `circular/`, the Cabinet Division's circular and amendments;
  - `verify/`, three passes, each with `result.json`, `notes.md` and `raw/manifest.json`;
  - `strings-review.md`.
- `design-v1.png` there is the user's approved design. The diagram draws everything itself and never uses the
  image.

## The list

- **Source:** the Cabinet Division's circular «জাতীয় ও আন্তর্জাতিক দিবস উদ্‌যাপন/পালন», no.
  ০৪.০০.০০০০.০০০.৪১৬.২৩.০০০২.২৫.১৩২, 11 March 2026 (cabinet.gov.bd), and its four amendments of 21 and 28 April and
  2 August 2026. None cancels a day.
  - The PDFs are scans, so the names were read from the page images.
  - Each name is shown as printed.
- **Count:** 91 entries (ক 18, খ 39, গ 34). Four entries name two days, so there are 95 named days.
- **Dates:** each named day's date was checked against a second official source.
  - International days: the UN observance page, the resolution, or the lead agency.
  - National days: the leading ministry, the 2026 public-holiday gazette, or PID's handouts.
  - Result: 76 VERIFIED, 4 CONFLICT, 15 SINGLE-SOURCE.
- **Held out (not built):**
  - the 4 CONFLICT entries: বিশ্ব টেলিযোগাযোগ দিবস, বিশ্ব হার্ট দিবস, জাতিসংঘ দিবস, শিশু অধিকার দিবস;
  - জাতীয় টিকা দিবস, which has no date: it is set each year.
  - 86 are built.
- **Dates by type:**
  - **Fixed:** most days.
  - **Weekday rules:** four, computed for any year — বিশ্ব নৌ দিবস (the last Thursday of September, IMO's rule; the
    circular says «শেষ সপ্তাহ»), জাতীয় সমবায় দিবস, আন্তর্জাতিক সমবায় দিবস and বিশ্ব বসতি দিবস.
  - **Other calendars:** eight days (Bangla, Hijri, পঞ্জিকা, «মে মাসে») carry only their official 2026 date, so they
    appear only in 2026.

## Kinds (a proposal, for the user)

- Kinds follow who declares the day:
  - the UN, its agencies or another international body → আন্তর্জাতিক দিবস;
  - the Government of Bangladesh → জাতীয় দিবস;
  - religious festivals and the Bangla calendar's cultural days → অন্যান্য দিবস.
- The circular's own categories (ক, খ, গ) are its observance tiers, not kinds. They are kept in the seed.
- **Dual-kind entries (4):** «শহীদ দিবস/আন্তর্জাতিক মাতৃভাষা দিবস» and the sports, disability and migrants entries.
  - Each shows both markers, in its row and on its card.
  - The card's facts are the international day's; the national day has none from an official source.

## The view

- **Top to bottom:** the shared picker row, ⓘ, the wheel card, the legend, the list card.
- **The wheel** is 86 % of the card's width, with twelve 30° wedges, জানুয়ারি at the top.
  - The chosen month pops 6 px out, solid #2563EB, with a soft shadow.
  - «আজ» is a vermillion ring on today's month's outer edge.
  - At 320 a wedge's tap zone at mid-ring is 49.7 px of arc × 60 px of ring.
- **Text** is at least 14 px. Bold is real: Noto Sans Bengali Bold (below).
- **«আজ»** is the device's local date at runtime.
  - The picker lists this year's and next year's months, opening on today's month.
  - A wedge chooses its month in the year shown, so December → January rolls over.
  - A day on 29 February would appear only in a leap year.
- **The card** is a bottom sheet with ইংরেজি নাম, ঘোষণাকারী, প্রথম পালন, উদ্দেশ্য and প্রতিপাদ্য (year); a row without
  a value is left out. ✕ (44 px) or Escape closes it.
  - The motion respects prefers-reduced-motion.
  - The whole page scrolls.
- **`tools/check.mjs`** has a `daysSteps` branch: every month by ›, the twelve wedges tapped at mid-ring, every row's
  card opened and closed.

## The Bold font

- `docs/shared/fonts/noto-sans-bengali/NotoSansBengali-Bold.woff2`: 42,016 bytes, SHA-256 79dfb48884d8d7b4….
- Built by `tools/build-font.mjs` from the same pinned Noto release as the Regular: NotoSansBengali-v3.011,
  https://github.com/notofonts/bengali/releases (tools/sources.json `notoSansBengali`), under SIL OFL 1.1, whose
  licence ships beside it. The Regular is unchanged byte for byte.
- `days.css` declares it, so no other view requests it. `tools/verify.mjs` holds its SHA-256.

## Strings

- 190 Bengali strings in the seed, all `approved: false`.
- 182 are numbered for review in `tools/.cache/days/strings-review.md`: the words, 86 names, 55 purposes and the
  Bengali themes. The other 8 belong to held-out days.
- Themes over 7 words: 13 (the 8-word quote guard is unchanged).
