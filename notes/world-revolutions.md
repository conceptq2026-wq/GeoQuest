# world-revolutions

Read it with `CLAUDE.md`, whose rules and verification budget apply.

## Current state (Stage 1, 2026-10-01)

- **What it is.** World and Bangladesh revolutions and uprisings on the world
  basemap (`world`, world.pmtiles), in three tabs:
  - «বিপ্লব»: 30 events.
  - «গণঅভ্যুত্থান ও বিদ্রোহ»: 14 events.
  - «অ-রাজনৈতিক বিপ্লব»: 9 events, cards only, no points.
- **In progress.** Listed in `tools/wip.json`: on the local preview's home page
  only, not in the registry. The title «বিশ্বের বিপ্লব ও গণঅভ্যুত্থান» is a
  working title; the final one is the user's decision.
- **The list.** It is the shortlist the user approved on 2026-10-01,
  `tools/.cache/world-revolutions/shortlist.md`. That file also holds the
  exclusions, what is held back, and the rules:
  - Each event lives in one tab.
  - The primary label is the majority label of confirmed exam questions, then
    the bn Wikipedia title, then the user's decision.
  - The other label's name goes in the card row «অন্য নাম».
  - Protests, movements and coups are excluded.
- **Build.** `tools/build-world-revolutions.mjs` builds it from the editor's
  seed, `data-sources/world-revolutions/world-revolutions.seed.json`, which it
  reads and never writes. The output is four files:
  - `records.json`: one table, `items`.
  - `places.json`: one marker for a spot that holds two or more events of one
    tab; its card lists them.
  - `tabs.json`
  - `info.json`: the ⓘ lines.
- **Seed pin.** The seed is pinned by SHA-256 in `tools/verify-descriptor.mjs`.
  Its values were chosen from research kept in `tools/.cache/world-revolutions/`:
  `wp-stage1.json` (the Wikipedia revisions read), `stage1-extra.json`,
  `nctb-h910.md` and the four exam files. The script that wrote the seed
  checked every quoted phrase against that text.
- **Sources, in the user's order.**
  - The NCTB textbook «বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা», classes 9–10 (2026) —
    liberation-war-1971's H910 — for the events it covers: কৈবর্ত,
    ফকির-সন্ন্যাসী, সিপাহি, ১৯৬৯, ১৯৯০, ২০২৪ and ফরাসি বিপ্লবের সাল.
  - Then Bengali Wikipedia, then English Wikipedia, each at a pinned revision.
  - Names follow the exam, the authority for Bengali names, where no textbook
    names the event. Exam questions count only where two independent sites
    agree.
  - A Bengali country name the sources lack comes from the pinned Natural
    Earth file (NAME_BN), checked by the build. Egypt, Libya and Syria are
    titled by their country: no source gives them a Bengali event name. Their
    cards, like Tunisia's, say «আরব বসন্তের অংশ» (`group`). The group chips
    come in Stage 2.
  - Banglapedia could not be read on 2026-10-01: every page served «Hello
    World :-)».
- **Markers**, by the user's decision:
  - A filled dot (`dot.svg`) where the cited source names a specific place.
  - A hollow ring (`ring.svg`) where it names only a country or a region.
- **Where each point comes from.** Every point comes from a pinned file, named
  by the seed and read by the build:
  - NE-0: the country's Natural Earth label point, the same point world.pmtiles
    labels the country at.
  - NE-pp: a Natural Earth populated place, matched on name and country code.
  - NE-1: an admin-1 unit's label point.
  - COD-AB: a district or upazila point.
- **Historical names.** A source that gives only a historical name is placed
  only where a cited source states the present-day place, recorded as the
  point's `match`. Examples: Petrograd, East Pakistan, Zanzibar, Chechen-Ingush.
- **Map layers.** Rings draw in `belowLabels`, so the country's own name stays
  readable over them. Dots draw above the labels.
- **Legend.** Two lines at 14 px.
- **The basemap check.** In the build, and again in `tools/verify.mjs`:
  - every marker's country is one world.pmtiles labels;
  - every marker lies inside that country's polygon, in the Bangladesh-POV
    countries file the basemap is built from.
- **No point.** Four events have no marker: the exception to "never silently
  absent", written out in `notes/descriptor.md`.
- **ⓘ.** It lists every event's sources, then every disagreement between
  sources, value by value: what the card shows and whose it is, then each
  other value and whose.
- **Pending: 7.** Four non-political events have no place in any source, and
  two have no time: চিন্তাবিপ্লব and নব্যপ্রস্তর যুগীয় বিপ্লব.
- **Stages to come.**
  - Stage 2: group chips (a `chips` module) and the Arab Spring and 1848
    country markers.
  - Stage 3: the remaining regional points and the user's no-point decisions.
  - Stage 4: card facts (leaders, causes, results).
