# important-days — «বছরের চাকা»

Read it with `CLAUDE.md`, whose rules and verification budget apply. A diagram under বাংলাদেশ.

**Status: live on the home page since 2026-10-08 (GL-WHEEL), under বাংলাদেশ, with no caption.**
- History: WHEEL-M1 and WHEEL-2, the data and the diagram on the local preview; WHEEL-3 to WHEEL-5, the user's
  review (religious days out, two kinds, twelve months, no year shown; two string edits; all 187 strings approved);
  GL-WHEEL, out of `tools/wip.json` and into `docs/registry.json` through `tools/home-cards.json` (`kind` only: the
  descriptor's title, no caption), pushed with the four commits before it (2026-10-08).
- Every string is approved; `tools/verify.mjs` holds it, live, to rule (a). The yearly check of the three
  Bangla-calendar dates (below, under Strings) stands.
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
    (WHEEL-3). The one difference, row খ ২৯, is settled by the user (WHEEL-4, 2026-10-08): both readings agree on
    the name, «জাতীয় পরিসংখ্যান দিবস»; the bracketed text after it is a NOTE of the circular, not part of the name:
    «প্রতি পাঁচ বছর অন্তর বিশ্ব পরিসংখ্যান দিবস এবং জাতীয় পরিসংখ্যান দিবস একসঙ্গে উদ্‌যাপিত হবে». The print shows a
    glyph resembling «একসঙ্গো», a typesetting artefact. Nothing on the diagram changes.
  - Each name is shown as printed.
- **Count:** 91 entries (ক 18, খ 39, গ 34); four name two days.
- **Religious days removed (the user's decision, 2026-10-08):** six entries, the circular's ক ৬ বৌদ্ধ পূর্ণিমা, ক ১০
  বড়দিন, ক ১৪ ঈদ-উল-ফিতর, ক ১৫ ঈদ-উল-আযহা, ক ১৬ ঈদ-ই-মিলাদুন্নবী (সাঃ) and ক ১৭ দুর্গাপূজা. They stay in the seed
  only as `removedReligious`, a record of the circular. The Bangla calendar's cultural days (বাংলা নববর্ষ, রবীন্দ্র
  জয়ন্তী, নজরুল জয়ন্তী) are not religious: kept, as জাতীয়. ক ৮ লালন সাঁই-তিরোধান দিবস stays, as a cultural day
  (জাতীয়): the user's decision (WHEEL-4, 2026-10-08).
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
  - «আজ» is a small dark pill on today's month's outer edge, at today's place in it — not a marker. Every month's name
    keeps clear of it (near a month's edge it reaches into the neighbour). Where some name finds no place with the
    pill at today's spot, the pill moves the least way along today's month's edge until every name fits; failing that,
    it stacks with today's name and markers. On the smallest wheel (under 340 px) it is 30 × 18 px, out in the wheel's
    margin; its text stays 14 px (WHEEL-8: tested with the date forced — every day of 2026 at 320 px, and each
    month's first, middle and last day and 9 October at 320, 390, 768 and 1,280 px — every name inside its wedge,
    none under the pill; before, 183 of the 365 days failed at 320 px).
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
- **ⓘ** (WHEEL-7): the UN's list of international days, the owner bodies' own pages, the Government of Bangladesh's
  sources (PID and the ministries), the Cabinet Division's circular (only for the seven national days no other official
  page states), Wikipedia (the cross-check) and the font's licence.
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

- 187 Bengali strings in the seed, numbered in `tools/.cache/days/strings-review.md` (WHEEL-3's numbering): the 49
  purposes and the UI labels first, then the rule and calendar date lines, the names, and last the held-out days'
  strings (not shown).
- **Approved by the user:** 178 on WHEEL-4 and the last 9 on WHEEL-5 (both 2026-10-08), so all 187; the seed's
  `approval` records it. `tools/verify-descriptor.mjs` fails any pending string.
- **The Bangla-calendar days' placement — approved by the user (WHEEL-5, 2026-10-08).** Each sits in a fixed Gregorian
  month: বাংলা নববর্ষ «১ বৈশাখ» on 14 April, রবীন্দ্র জয়ন্তী «২৫ বৈশাখ» on 8 May, নজরুল জয়ন্তী «১১ জ্যৈষ্ঠ» on 25 May.
  The user's grounds: official sources give the same Gregorian dates in 2019 and 2022–2026, and no date sits near a
  month boundary. No official rule was found: no published rule or table of the revised Bangla calendar on Bangla
  Academy's, MoCA's, MoPA's, the Cabinet Division's or PID's sites (only newspapers report one). The evidence (cached,
  with sizes and SHA-256, in `tools/.cache/days/bangla/manifest.json` and `verify/national/raw/manifest.json`):
  - 2026: the public-holiday gazette, ১৪ এপ্রিল ২০২৬ = ০১ বৈশাখ ১৪৩৩ —
    http://www.dpp.gov.bd/upload_file/gazettes/59216_19984.pdf; PID's handouts datelined «২৫ বৈশাখ (৮ মে)» and
    «১১ জ্যৈষ্ঠ (২৫ মে)» —
    https://pressinform.gov.bd/pages/all-notes/handout-8-may-2026-8fzo01-69fd65c09d0e57ba598bf59e,
    https://pressinform.gov.bd/pages/all-notes/handout-25-may-2026-gb8ns9-6a1452d5977edbd1f133ec4c.
  - 2019, 2023, 2024, 2025: PID's handouts datelined «১ বৈশাখ (১৪ এপ্রিল)», «২৫ বৈশাখ (৮ মে)» and «১১ জ্যৈষ্ঠ (২৫ মে)»,
    e.g. https://pressinform.gov.bd/pages/all-notes/তথ্যবিবরণী-১৪-এপ্রিল-২০২৪-d12399-6922de5e933eb65569e1a2c8,
    https://pressinform.gov.bd/pages/all-notes/তথ্যবিবরণী-৮-মে-২০২৪-7c3140-6922decc933eb65569e1d70f,
    https://pressinform.gov.bd/pages/all-notes/তথ্যবিবরণী-২৫-মে-২০২৫-1adb4c-6922dea4933eb65569e1c3ff (the other years'
    handouts are in the manifest).
  - 2022 and 2023: the Ministry of Cultural Affairs' notices «২৫ বৈশাখ ১৪২৯ বঙ্গাব্দ/০৮ মে ২০২২», «১১ জ্যৈষ্ঠ ১৪২৯/২৫ মে
    ২০২২» and «২৫ বৈশাখ ১৪৩০/ ০৮ মে ২০২৩», «১১ জ্যৈষ্ঠ ১৪৩০/ ২৫ মে ২০২৩» —
    https://moca.gov.bd/pages/notices/আগামী-২৫-বৈশাখ-১৪২৯-বঙ্গাব্দ-০৮-মে-২০২২-খ্রি-বিশ্বকবি-রবীন্দ্রনাথ-220db7-694036df35ce18e1c05866de,
    https://moca.gov.bd/pages/notices/694034f735ce18e1c0576664.
  - One slip: PID's handout of 25 May 2023 has three datelines «১২ জ্যৈষ্ঠ (২৫ মে)» beside six «১১ জ্যৈষ্ঠ (২৫ মে)»;
    MoCA's notice of that year gives ১১ জ্যৈষ্ঠ = ২৫ মে.
- **YEARLY CHECK (the user's rule, WHEEL-5, 2026-10-08):** when each new public-holiday gazette is published, compare
  these three Gregorian dates (14 April, 8 May, 25 May) with that year's official dates — the gazette for ১ বৈশাখ, and
  that year's official sources (PID's handouts, MoCA's notices) for ২৫ বৈশাখ and ১১ জ্যৈষ্ঠ. If any differs, the
  three days' date strings go back to `approved: false` and the user is told.
- **Historical years stay (the user's decision, WHEEL-4, 2026-10-08):** «সাল বাদ» means no calendar year is
  displayed — the picker, the dates, «আজ» and «x দিন পর» — and only that. The «প্রথম পালন» years (14 cards) and the
  past years inside purposes (e.g. ১৯৭১, ১৮৮৬, ২০২৪) are kept.
- **Two edits (the user's, WHEEL-4):** #5, জুলাই গণঅভ্যুত্থান দিবস's purpose, is now «২০২৪ সালের ছাত্র-জনতার
  গণঅভ্যুত্থান স্মরণ» (its source, PID's handout of 4 August 2026, says the student-public uprising of 5 August 2024
  is marked as the day); #19, জুলাই শহীদ দিবস's, spells «শহীদদের» as the day's name does. Both keep their sources.
  `tools/.cache/days/wheel4.mjs` applies them to the seed after `merge3.mjs`.

## WHEEL-7 — the user's decisions on WHEEL-6 (2026-10-09)

**The source rule (WHEEL-6):** the Cabinet Division's circular is no longer the authority for dates, only a list of
candidates. An international day's date comes from the body that declared it (the UN or its agency); a national day's
from an official Government of Bangladesh source (PID, a ministry or division, the Bangladesh Gazette). Each is
cross-checked with Wikipedia (read at `/wiki/` with its revision id: its robots.txt disallows the API paths). The
research: `tools/.cache/days/wheel6.md` and `wheel6/`.

1. An official date with no Wikipedia article to cross-check is verified: স্থানীয় সরকার, চা, পাবলিক সার্ভিস, পল্লী
   উন্নয়ন, আইনগত সহায়তা, পেশাগত স্বাস্থ্য, প্রবাসী stay built.
2. a) The seven national days with no other official page (চলচ্চিত্র, নিরাপদ মাতৃত্ব, বার্ষিক প্রশিক্ষণ, ক্যান্সার, BNCC
   DAY, রক্তদান ও চক্ষুদান, জীববৈচিত্র) keep the circular as their official source (tier `circular`): nothing
   contradicts it. b) জাতীয় টিকা দিবস stays held. c) বিশ্ব সাদা ছড়ি দিবস: built only with Wikipedia and one agreeing
   reliable outlet — English Wikipedia gives 15 October as a United States national observance, and no allowed
   outlet was found (its references are US government pages, a blog and an advocacy site; three dailies' topic
   pages 404; BSS and The Daily Star refuse GeoQuest) → **held**.
3. জাতীয় পরিসংখ্যান দিবস, জাতীয় প্রতিবন্ধী দিবস, জাতীয় বস্ত্র দিবস keep their official dates (only a Bengali Wikipedia
   list disagrees); nothing changes.
4. শিশু অধিকার দিবস stays held.
5. Built on their owners' dates: জাতিসংঘ দিবস 24 October, বিশ্ব টেলিযোগাযোগ দিবস 17 May, বিশ্ব হার্ট দিবস 29 September.
6. Every approved name stays as it is (WHEEL-6's nine official spellings are noted only).
7. **50 days added with the user's names** (approved): 47 from the UN's list (আন্তর্জাতিক) and উনসত্তরের গণ-অভ্যুত্থান
   দিবস, সশস্ত্র বাহিনী দিবস, শহিদ বুদ্ধিজীবী দিবস (জাতীয়), each "agree" in wheel6.md at the date given. (The prompt said
   53; its list has 50 — with the three resolved days, 53 dates change.)
8. Cancelled days are not shown.

- **Each named day's `source7`:** its tier — `owner` (the declaring body's own page, 87), `gob` (an official GoB
  source, 41), `circular` (7), `secondary` (1: Wikipedia and a New Age/BSS report) — its URL and Wikipedia's revision.
- **The new days' purposes** are our own words from the owners' pages (`tools/.cache/days/strings-review-7.md`), 49,
  `approved: false`; শহিদ বুদ্ধিজীবী দিবস has none (PID's handout gives only the programme). A purpose not approved is
  not built (`tools/build-diagram-important-days.mjs`); `tools/verify-descriptor.mjs` and `tools/verify.mjs` allow
  pending strings only there, and never in docs/ (rule (a)).
- **Now:** 132 of 135 entries built, per month 4 9 16 12 13 11 7 6 8 18 12 16; 104 rows open a card.
- **Found by the check (not WHEEL-7's):** at 320 px October's name does not fit beside the «আজ» pill around
  9 October — the committed (live) build fails the same way today; a fix belongs to `docs/visual/days.js`.
- **Local only:** the user said this build must not reach the live site until the purposes are approved.

## WHEEL-8 (the user, 2026-10-09)

- The new days' purposes approved, #14 («পরাগায়নকারীর»), #44 («আইকাও-এর») and #49 («১৯৭১ সালের মুক্তিযুদ্ধে …») after the
  user's edits: 49 purposes now built (106 rows open a card).
- শহিদ বুদ্ধিজীবী দিবস: no official GoB page read states what the day commemorates (PID gives the programme, MoLWA's site
  the gazette of names), so its purpose is from Bengali Wikipedia (revision 8646102), in our own words — awaiting the
  user, not built until approved.
