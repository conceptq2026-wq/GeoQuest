# important-days — «বছরের চাকা» (work in progress)

Read it with `CLAUDE.md`, whose rules and verification budget apply. A diagram under বাংলাদেশ.

**Status: work in progress (WHEEL-2, revised by WHEEL-3 after the user's review, 2026-10-08), on the local preview
only.**
- In `tools/wip.json` under Bangladesh; not in `docs/registry.json`.
- Built into `docs/diagrams/important-days/` by `tools/build-diagram-important-days.mjs` from
  `data-sources/important-days/days.seed.json`. `tools/verify-descriptor.mjs` pins the seed and holds the folder to a
  fresh build: twelve months whose counts are the seed's, two kinds, no religious day, theme or declarer, no year
  shown.
- Drawn by the diagram shell's view `days`: `docs/visual/days.js` and `days.css`, a module loaded only for this
  view (one line in `VIEW_MODULES`).
- The research is out of git, in `tools/.cache/days/`:
  - `investigation.md`, the verified list (a WHEEL-3 section at its end);
  - `circular/`, the Cabinet Division's circular and amendments, and the first reading of them (`days.json`);
  - `reread/`, the second, blind reading (`reading.json`, `notes.md`) and the two compared (`diff.md`);
  - `verify/`, three passes, each with `result.json`, `notes.md` and `raw/manifest.json`;
  - `merge3.mjs`, which writes the seed; `strings-review.md`.
- `design-v1.png` there is the user's approved design. The diagram draws everything itself and never uses the
  image.

## The list

- **Source:** the Cabinet Division's circular «জাতীয় ও আন্তর্জাতিক দিবস উদ্‌যাপন/পালন», no.
  ০৪.০০.০০০০.০০০.৪১৬.২৩.০০০২.২৫.১৩২, 11 March 2026 (cabinet.gov.bd), and its four amendments of 21 and 28 April and
  2 August 2026. None cancels a day.
  - The PDFs are scans, so the names were read from the page images, twice, the second time blind to the first
    (WHEEL-3). The one difference — row খ ২৯, whose bracketed note the first reading left out of the name — is
    listed in `reread/diff.md`; neither reading was chosen.
  - Each name is shown as printed.
- **Count:** 91 entries (ক 18, খ 39, গ 34); four name two days.
- **Religious days removed (the user's decision, 2026-10-08):** six entries, the circular's ক ৬ বৌদ্ধ পূর্ণিমা, ক ১০
  বড়দিন, ক ১৪ ঈদ-উল-ফিতর, ক ১৫ ঈদ-উল-আযহা, ক ১৬ ঈদ-ই-মিলাদুন্নবী (সাঃ) and ক ১৭ দুর্গাপূজা. They stay in the seed
  only as `removedReligious`, a record of the circular. The Bangla calendar's cultural days (বাংলা নববর্ষ, রবীন্দ্র
  জয়ন্তী, নজরুল জয়ন্তী) are not religious: kept, as জাতীয়. ক ৮ লালন সাঁই-তিরোধান দিবস is borderline: kept, for the
  user to decide.
- **Kept:** 85 entries. **Held out (not built):**
  - the 4 CONFLICT entries: বিশ্ব টেলিযোগাযোগ দিবস, বিশ্ব হার্ট দিবস, জাতিসংঘ দিবস, শিশু অধিকার দিবস;
  - জাতীয় টিকা দিবস, which has no date: it is set each year.
  - 80 are built: per month 2, 6, 11, 9, 8, 4, 5, 3, 4, 13, 6, 9 — no month empty.
- **Dates by type, and how each shows (no year anywhere):**
  - **Fixed:** most days; the tile shows the day's number over its month.
  - **Weekday rules (4):** the tile shows the rule's short form, the row and card the rule in full —
    বিশ্ব নৌ দিবস «সেপ্টেম্বরের শেষ বৃহস্পতিবার» (শেষ/বৃহস্পতি; IMO's rule, the circular says «শেষ সপ্তাহ»),
    জাতীয় সমবায় দিবস «নভেম্বরের প্রথম শনিবার», আন্তর্জাতিক সমবায় দিবস «জুলাইয়ের প্রথম শনিবার» (১ম/শনি),
    বিশ্ব বসতি দিবস «অক্টোবরের প্রথম সোমবার» (১ম/সোম). This year's or next year's date is worked out silently.
  - **Another calendar (3, all Bangla):** the circular's own wording — «১ বৈশাখ», «২৫ বৈশাখ», «১১ জ্যৈষ্ঠ». Each
    sits in the month of its official 2026 date, which alone times «আজ» for it.

## Kinds (the user's decision, 2026-10-08)

- Two, by who declares the day: the UN, its agencies or another international body → আন্তর্জাতিক দিবস; the
  Government of Bangladesh, the Bangla calendar's cultural days included → জাতীয় দিবস. «অন্যান্য» is gone.
- The circular's own categories (ক, খ, গ) are its observance tiers, not kinds. They are kept in the seed.
- **Dual-kind entries (4):** «শহীদ দিবস/আন্তর্জাতিক মাতৃভাষা দিবস» and the sports, disability and migrants entries
  show both markers. The card's facts are the international day's.

## The view

- **Layout:** one column under 600 px; one column, centred, at most 560 px, from 600 px; from 900 px two columns,
  at most 1,100 px — on the left, sticky, the wheel card (the picker row, ⓘ, the wheel, the legend), on the right
  the list. No sideways scroll from 320 to 1,920 px.
- **The picker** lists the twelve months, with no year, and goes round: ‹ on জানুয়ারি is ডিসেম্বর, › on ডিসেম্বর
  জানুয়ারি (the shared picker's opt-in `wrap`, `notes/diagrams.md`). ⓘ sits under it inside the card (the shell's
  opt-in `data-info-after`).
- **The wheel** is the card's width, 300 px at least and 460 at most, with twelve 30° wedges, জানুয়ারি at the top.
  - The chosen month pops 4 px, in the one accent #2563EB, with a soft shadow.
  - Each wedge's name and markers are placed where they lie wholly inside it (`data-fit`), measured once the fonts
    are in.
  - «আজ» is a small dark pill on today's month's outer edge, at today's place in it — not a marker.
  - At 320 a wedge's tap zone at mid-ring is 52.7 px of arc × 75 px of ring.
- **Markers:** জাতীয় a filled dot #009E73, আন্তর্জাতিক a hollow ring #0072B2 with a 2 px stroke, 9 px, the same in the
  wheel, the list and the legend. The legend is one quiet line under the wheel.
- **Style:** one accent (#2563EB) for the chosen month, the next day and links; neutral greys on #F7F8FA and white;
  light shadows; the list one white card with hairlines; the date tile no box, a bold number (or the rule's short
  form) over a 14 px grey month (or weekday). Text at least 14 px; Bold is real (below).
- **«আজ» and «x দিন পর»** use the device's date; its year is used only to work out dates, never shown. The next day
  after 30 December is found in January.
- **The card** is a sheet: ইংরেজি নাম, প্রথম পালন, উদ্দেশ্য and a small «সূত্র» link to that day's own official source; a
  row without a value is left out. A day with none of the three facts has no card: its row is not a button and has no
  chevron (54 of the 80 rows open a card). ✕ (44 px) or Escape closes it; motion respects prefers-reduced-motion.
- **ⓘ** is short: the circular, its four amendments, the UN's list of observances and the font's licence.
- **`tools/check.mjs important-days --sizes=320,390,768,1280`** runs `daysSteps`: every month by ›, both wraps, the
  page at each width (sideways scroll, text, taps, names inside wedges), the twelve wedges tapped at mid-ring, every
  row with a card opened and closed, every row without one inert.

## The Bold font

- `docs/shared/fonts/noto-sans-bengali/NotoSansBengali-Bold.woff2`: 42,016 bytes, SHA-256 79dfb48884d8d7b4….
- Built by `tools/build-font.mjs` from the same pinned Noto release as the Regular: NotoSansBengali-v3.011,
  https://github.com/notofonts/bengali/releases (tools/sources.json `notoSansBengali`), under SIL OFL 1.1, whose
  licence ships beside it. The Regular is unchanged byte for byte.
- `days.css` declares it, so no other view requests it. `tools/verify.mjs` holds its SHA-256.

## Strings

- 187 Bengali strings in the seed, all `approved: false`, every one numbered in
  `tools/.cache/days/strings-review.md`: the 49 purposes and the UI labels first, then the rule and calendar date
  lines, the names, and last the held-out days' strings (not shown).
- **For the user:** «প্রথম পালন» is a year by nature (14 cards), and 10 purposes name a past year (e.g. ১৯৭১, ১৮৮৬,
  ২০২৪); no calendar year is shown anywhere.
