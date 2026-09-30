# world-revolutions

Read it with `CLAUDE.md`, whose rules and verification budget apply.

## Current state (Stages 1–3, 2026-10-01)

- **What it is.** World and Bangladesh revolutions and uprisings on the world
  basemap (`world`, world.pmtiles), in three tabs:
  - «বিপ্লব»: 32 events.
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
  - The NCTB textbook «বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা», classes 9–10, revised for the 2026 school year (its title page: «২০২৬ শিক্ষাবর্ষের জন্য পরিমার্জিত») —
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
    are the chips module's (`notes/shell.md`).
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
- **Stage 2 and 3 (the user's review, 2026-10-01).**
  - The three Iraqi «বিপ্লব» (1958, 1963, 1968) are out. bn Wikipedia calls
    them coups, and coups are excluded. They are kept, with the reason and the
    source, in the seed's `excluded`.
  - Egypt, Libya and Syria carry a descriptive label, «আরব বসন্ত — …», not an
    event name. The five 1848 members carry «১৮৪৮-এর বিপ্লব — …». ⓘ says so for
    each, and cites the group's own name: bn Wikipedia's «আরব বসন্ত», and the
    bn category «১৮৪৮-এর বিপ্লবের ব্যক্তি».
  - The 1848 members are the countries en Wikipedia's "Revolutions of 1848"
    (revision 1372038790) names by a present-day name: France, Denmark,
    Switzerland, Belgium and Hungary. Left out:
    - Ireland, because Natural Earth's Bengali name is «প্রজাতন্ত্রী
      আয়ারল্যান্ড»;
    - the German and Italian states, the Austrian Empire, the Romanian
      principalities and Greater Poland, because no cited source gives a
      present-day place for them.
  - The Russian Revolution's card row «এর দুই পর্ব» replaces «অন্য নাম». A
    part is never an alias; every other alias row was checked.
  - Zanzibar is drawn as a ring. Its ⓘ, and Vietnam's, carry one sentence:
    «মার্কারটি দেশ বা অঞ্চলের নাম ধরে বসানো; সূত্রে নির্দিষ্ট স্থান নেই।»
  - The group chips (`chips`) and the cards-only tab (`tabs.cardsOnly`)
    are the map's.
- **Wording (the user's review of Stages 2–3, 2026-10-01).**
  - A student reads only plain Bengali: no project word (pin, extract, seed,
    NE-, COD-AB, «উৎস-ক্রম») in any shown string. Natural Earth and BBS / OCHA
    are named in the credits alone; the Bengali country names taken from
    Natural Earth are not listed as a source in ⓘ.
  - «সূত্র» for a source, never «উৎস». Centuries are the ordinal word with
    «শতক» («অষ্টাদশ শতক», «উনবিংশ শতক»), as the NCTB book writes «অষ্টাদশ
    শতকের শেষার্ধে» (p. ১১৩). Decades are «১৯৮০-এর দশক». A quoted source keeps
    its own form.
  - `tools/verify.mjs` fails any shown string of this map that breaks one of
    these, or has a space before , ; । or a doubled space.
  - ⓘ opens with one cited line per group chip: the chip shows only the
    members drawn here, so the line names what else the group's own article
    lists. Arab Spring: bn Wikipedia's list «যেসব দেশে বিক্ষোভ চলছে» (15 more).
    1848: en Wikipedia's infobox participants (7 more), in English, since
    none has a bn article. The validator requires both.
- **Stage 4 to come.** Card facts: leaders, causes, results, and when the
  exams asked.
