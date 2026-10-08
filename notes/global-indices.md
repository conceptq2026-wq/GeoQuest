# global-indices — «বৈশ্বিক সূচক» (work in progress)

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map under International.

**Status: work in progress (IDX-2 and IDX-3, 2026-10-08), on the local preview only.**
- In `tools/wip.json` under International; not in `docs/registry.json`.
- Built into `docs/maps/global-indices/` by `tools/build-global-indices.mjs` from
  `data-sources/global-indices/global-indices.seed.json` and the pinned Natural Earth countries file (Bangladesh's
  view). `tools/verify-descriptor.mjs` pins the seed and holds the folder to a fresh build.
- Drawn by the map shell with one new opt-in module, `indices` (`docs/shell/indices.js`, `indices.css`;
  `notes/shell.md`).
- IDX-1's investigation (out of git): `tools/.cache/indices/investigation.md`, `catalog.json`. IDX-2's working files:
  `tools/.cache/indices/idx2/` — the scouts' reports (`scout-open.json`, `scout-facts.json`), the two readings
  (`read-A-*`, `read-B-*`), their comparison (`diff.md`), the seed writer (`seed.mjs`), and
  `tools/.cache/indices/strings-review.md`.
- `tools/.cache/indices/design-country.jpg` and `design-bangladesh.jpg` are the user's approved designs: a layout
  reference only, never embedded.

## The user's decisions (2026-10-08)

- Tabs «দেশ» and «বাংলাদেশ» only; no «শহর».
- **Open** rankings shade every country, by rank, in seven classes of one blue (grey where unranked): HDI, MPI (value
  only, no rank), GII, WHR, population, population density, remittances, FDI — and, once supplied, GDP per capita and
  the Global Gender Gap Index.
- **Facts-only** rankings (restricted licences) store and show only Bangladesh's rank of N, the top, the bottom, the
  edition, the release date and the official URL; the map greys everything but those three; the card says the full
  ranking is not shown.
- Dhaka's EIU liveability rank is a row in the «বাংলাদেশ» tab. Dropped: GFSI, both Mercer rankings, Happy City.
- Population: WPP 2024's 2026 medium-variant projection, «প্রক্ষেপণ»; population and density ranked among the 193 UN
  members (the members as un.org lists them); WPP 2024 counts as current.
- Ranks we compute from official values (population, density, remittances, FDI) say «মান অনুযায়ী সাজানো».
- «দক্ষিণ এশিয়ায়» = Bangladesh's place among the eight SAARC countries ranked.
- A country with no shape in the Bangladesh-view file (Israel, Taiwan …) is listed on the card, never shaded.
- **Assistant's readings, for the user:** for a ranking computed from one release (population, density, remittances,
  FDI), "previous" is the year before in the same release; CRI shows its long-term ranking (1995–2024).

## Sources and the double read

- Only each publisher's own data file or page; a PDF only where it publishes the facts nowhere else (CRI's annex, the
  2022 EGDI annex for its top and bottom). Every file is pinned by its first download in `tools/sources.json`
  (`globalIndices`: size, SHA-256) and fetched by `tools/fetch-sources.mjs`, which reports a changed file rather than
  caching it. UN DESA's E-Government pages send a header Node's parser refuses: they are read with
  `tools/lib/raw-get.mjs` (`rawHttp`), with the same User-Agent.
- **User-input** (not fetched; the user reads the official page by hand and supplies three facts per edition):
  IMF WEO (terms forbid automated bulk download), WEF gender gap (its web report is unreachable; PDF only), IEP's GPI and
  GTI (terms 4.1(l)), Henley (terms §12 and robots.txt), WTO clothing (robots.txt disallows all), EIU Democracy Index
  and liveability (terms 2.2(D)), Heritage (bot wall; terms unread), GHI (its terms bar downloading by any means). Each
  item in the seed lists its pages and the facts needed.
- Every value was read twice, independently (two readers, separate parsers), and compared field by field
  (`tools/.cache/indices/idx2/diff.md`): all 14 built rankings agree; the one mismatch, EGDI 2022's Bangladesh score
  (0.56 / 0.563), is in a field the seed does not store.

## The view

- Tabs on top, the ‹ ranking › picker row under them, ⓘ under that. The page is one screen tall at every width; the
  map in a card with a শীর্ষ → নিম্ন gradient strip (open rankings only); the ranking's card docked under it, beside it
  from 900 px (two columns, at most 1,280 px).
- On the map: a vermillion Bangladesh with a «বাংলাদেশ · rank» pill, a «১» pill on the top country and a «নিম্ন» pill on
  the bottom one (for MPI «সর্বনিম্ন» / «সর্বোচ্চ»); a pill's bubble slides to stay inside the map.
- The card: three stat blocks (Bangladesh's rank of N — MPI's value —, the top, the bottom), then প্রকাশক, সংস্করণ,
  দক্ষিণ এশিয়ায়, র‍্যাংক (what rank 1 means), «মানচিত্রে আঁকা নেই», and a foot «সর্বশেষ যাচাই» · «সূত্র ↗».
- «বাংলাদেশ» tab: the map, its card and the picker row hidden; one row per ranking — name, «publisher · edition»,
  rank of N, a position bar শীর্ষ → নিম্ন, and a ▲/▼ x ধাপ / — অপরিবর্তিত chip (green where the move is better, red where
  worse, grey where neither); a row opens its ranking on the map. MPI shows its value, no bar, no chip.
- No text under 14 px (`minTextSize: 14`); every tap 44 px or more. `tools/check.mjs global-indices --sizes=…` runs
  `indicesSteps` (every ranking's card, stats, pills and shading; the tab's rows; the page at that width).

## Strings

- 107 Bengali strings in the seed, all `approved: false`, numbered in `tools/.cache/indices/strings-review.md`
  (labels, then the rankings' names, then country names). Country names on the cards are the basemap's pinned
  `NAME_BN`; the two new ones (Israel, Taiwan) await approval.

## IDX-4 (the user's review, 2026-10-09)

- **Every string approved** (113): ⓘ's first note is now «মানচিত্রে দেশের সীমানা বাংলাদেশের দৃষ্টিকোণ অনুযায়ী দেখানো। যে
  দেশ মানচিত্রে আলাদা করে আঁকা নেই, তার নাম ও অবস্থান কার্ডে দেওয়া আছে।», and Henley's name «হেনলি পাসপোর্ট সূচক». Facts
  `tools/ingest-user-input.mjs` writes later still enter `approved: false` and wait for the user's review;
  `tools/verify-descriptor.mjs` fails a built one that is not approved.
- **UN peacekeeping's chip is neutral**, as population's and density's: «▲/▼ x ধাপ ওপরে/নিচে», grey.
- **GDP per capita stays on 2025** (180 of 193 UN members with a value), the user's decision.
- **Accepted:** the «re-check due» warning for org-members' 7 cached pages lost in IDX-3 (a re-verification step is
  open: CLAUDE.md); push-guard's skip of 8-token runs made only of numbers.

## IDX-3 (the user's decisions on IDX-2, 2026-10-08)

- **Chips:** better or worse by each ranking's direction — «▲ উন্নতি x ধাপ» (green), «▼ অবনতি x ধাপ» (vermillion),
  «— অপরিবর্তিত» (grey); CRI's move toward rank 1 (most affected) is «অবনতি». Under each, «আগের সংস্করণের তুলনায়», or
  «আগের বছরের তুলনায়» for population, density, remittances, FDI and GDP. Population and density have no better or
  worse: a move says «x ধাপ ওপরে/নিচে», in grey (peacekeeping too, since IDX-4). Remittances, FDI and GDP count up as
  better.
- **GDP per capita** from the World Bank (WDI, NY.GDP.PCAP.CD, current US$; CC BY 4.0 per the WDI dataset page's
  licence field and datacatalog.worldbank.org/public-licenses, both pinned): the latest year with broad coverage,
  2025 (180 of the 193 UN members have a value; 2024 had 186), ranked by value among those members; the 13 without a
  value are listed on the card («তথ্য নেই»), unshaded; compared with 2024. Read twice; the readings agree. The IMF
  user-input entry is gone.
- **One shared countries file** (`docs/shared/world-countries.json`, `notes/shell.md`): this map's countries are keyed
  by ISO3 and joined on `iso3`; its own `countries.geojson` (462,149 bytes) is gone.
- **Release dates:** where unsure, the year only — GII (a "save the date" notice), WJP and the peacekeeping data.
  CRI's rank line states its period (১৯৯৫–২০২৪, দীর্ঘমেয়াদি).
- **User input:** the user fills `tools/.cache/indices/user-input.md` (one section per ranking: edition year,
  release month, Bangladesh's — Dhaka's — rank/N, top, bottom, the previous edition's rank) and runs
  `node tools/ingest-user-input.mjs`: it refuses a section filled in part or with an impossible value (a rank above N,
  a non-number, a month that is no month, a country it cannot name, the same top and bottom) and writes nothing then;
  it stores each ranking as facts only, its source the official page, «read by the user» and the date,
  `approved: false`. A ranking not filled in stays hidden from the map and the list, with no placeholder. GHI stays
  user-input; the picker row stays hidden in the «বাংলাদেশ» tab.
