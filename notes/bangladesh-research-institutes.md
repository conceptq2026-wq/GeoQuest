# bangladesh-research-institutes «বাংলাদেশের গবেষণা প্রতিষ্ঠান» (work in progress)

A map under বাংলাদেশ: one numbered point per national research institute at its head office, in four tabs, with a
picker. Seed: `data-sources/bangladesh-research-institutes/` — the seed, `sources.json` (124 pages, pinned) and
`pins.json` (the points). RES-1 (investigation, 2026-10-09: `tools/.cache/research-institutes/investigation.md`),
RES-2 (decisions and seed, 2026-10-09), RES-3 (five restored, the predecessor note, approvals, 2026-10-10; drawn on
the local preview).

## The user's decisions (2026-10-09, RES-2)

1. **Scope:** only institutes whose main work, by their own page, is research. Out: training academies (e.g.
   BPATC), hospitals, language and culture bodies (Bangla Academy, Nazrul Institute), and BIBM, IWM and CEGIS. In,
   by name: BARC (it coordinates agricultural research) and icddr,b.
2. **National Herbarium:** the বিজ্ঞান ও প্রযুক্তি tab only.
3. **Founding year**, year only: the main year is the first year the institute itself began, counting a continuous
   line through renamings; where it was later re-formed under a new name or Act, a second line «বর্তমান রূপে:
   <year>». The seed records which event each year is, with its source.
   - Applied as: a farm, a programme, a plan, a proposal or a decision is not the institute beginning; a laboratory,
     station, centre or project that the page says became the institute is. A later Act that only continues the
     body unchanged (the 2017–2020 re-enactments) is not a re-forming.
   - The 14 calls this needed are written beside each year in the seed (`founded.judgement`) and in the table below.
4. **Contradictions:** a year-only card settles BIISS (and Bangla Academy, out of scope). For BAEC, BCSIR, BLRI and
   BSRTI: the Act or Gazette first, then the institute's own site, then the ministry's list; unresolved, the year is
   held (null) and listed.
   - Result: BAEC 1973, BCSIR's re-forming 1978 and BLRI 1984, each by its Act. BSRTI's main year (1962) has no
     conflict, but its «বর্তমান রূপে» line is held: the 1977/1978 renaming, the 2003 Act and the 2013 merger into
     the Sericulture Development Board leave its present form unsettled.
5. **Locations:**
   - A pin on the institute's own site counts as official if it falls inside the district its address names.
   - Geofabrik's Bangladesh extract (OpenStreetMap, ODbL) replaces an approximate point with the institute's own
     campus or building where OSM clearly names it, with its OSM id; otherwise the approximate point stays, marked.
   - The extract is never committed. The dated snapshot of 2026-10-01 is pinned in `tools/sources.json`
     (`osmGeofabrikBangladesh`: size, the published MD5, SHA-256). It is held in memory only, because 17 random runs
     in its zlib data match the e-mail pattern (`tools/lib/scrub-email.mjs`'s rule for a binary). It is read by
     `tools/lib/osm-pbf.mjs`.
   - The ODbL credit is in the seed's `credits`.
6. **Same-spot points:** a cluster bubble that lists its members when tapped (RES-3); every institute is in the
   picker. After RES-2 no two points share a spot.
7. **Names:**
   - Exactly as the institute writes it; approved by rule.
   - The Bengali abbreviation in brackets is dropped from the name, and abbreviations are shown in English letters
     (BFRI for both the fisheries and the forest institute; their full names tell them apart).
   - ICMH's Act form — moot, since ICMH is out (a hospital).
   - Where the institute's own site gives no Bengali name, its Act's: icddr,b and BIISS. With no official Bengali
     name, the English name would be used; none of the 27 needs it.
8. **BIRTAN:** the head office on its own page (`R2-birtan-hq`): «প্রধান কার্যালয়, বিশনন্দী, আড়াইহাজার,
   নারায়ণগঞ্জ।». Its site's head-office map pin lies in Narayanganj, so it is an official point.
9. **Card label for the parent:** «অধীন» (e.g. «অধীন: কৃষি মন্ত্রণালয়»). icddr,b has none (an autonomous
   international body under its Act): `parentAbsent`.
10. **Strings:**
    - Names as printed, and labels already approved elsewhere («প্রতিষ্ঠান বেছে নিন», «সূত্র», the shared file's
      district names), are approved.
    - Our «কী নিয়ে গবেষণা» lines and every other new string are `approved: false`: 72, listed with sources in
      `tools/.cache/research-institutes/strings-review.md`.

## The user's decisions (2026-10-10, RES-3)

1. **Five restored**, on RES-1's sources and points, with the same card and rules: SRDI → কৃষি; BMRC → স্বাস্থ্য (kept
   like BARC, as the apex body); IPH → স্বাস্থ্য; BARD, Cumilla and RDA, Bogura → সমাজ, অর্থনীতি ও কৌশল. Now 32
   institutes (কৃষি 14, বিজ্ঞান ও প্রযুক্তি 9, স্বাস্থ্য 5, সমাজ, অর্থনীতি ও কৌশল 4), 26 left out.
   - BMRC's Bengali name is the Medical Education and Family Welfare Division's (its own site is English only).
   - A name keeps the place after its bracketed abbreviation: «বাংলাদেশ পল্লী উন্নয়ন একাডেমি, কুমিল্লা»,
     «পল্লী উন্নয়ন একাডেমী, বগুড়া».
   - IPH: none of its own pages names its parent, so «অধীন» is null (pending); OpenStreetMap names no element for it
     (a fresh search of the pinned extract, in memory), so its point is approximate — the same district capital as
     icddr,b's: the two share one spot.
2. **A predecessor outside present Bangladesh keeps both years**; the first carries where it was:
   «{year} (পূর্বসূরি প্রতিষ্ঠান, {place})», with «বর্তমান রূপে: <year>» under it. Two institutes:
   - BIDS: 1957, Karachi — Bengali Wikipedia (rev 8363218) and the user's own example; BIDS's own page says only that it
     began in Pakistan and moved to Dhaka in 1971, and PIDE's own site refused us (403, now never asked again).
   - IEDCR: 1947, New Delhi — its own history page.
   The others' first years are in present Bangladesh (Dhaka, Sreemangal, Chattogram, Ishwardi, Comilla…), by their
   own pages.
3. **BIRTAN's line** is the user's: «মানুষের পুষ্টিমান বাড়াতে খাদ্যভিত্তিক পুষ্টি; এ বিষয়ে প্রশিক্ষণও।» (approved).
4. **Approved** (the user, 2026-10-10): every string of RES-2's review — names, areas, parents, the title, the tabs, the
   labels (with «আনুমানিক অবস্থান: জেলা সদর») and the 26 other lines. New and awaiting the user: 13 — the five
   restored institutes' lines, four areas, one parent (পল্লী উন্নয়ন ও সমবায় বিভাগ), the predecessor template and its two
   places (`tools/.cache/research-institutes/strings-review.md`).
5. **The card's foot:** «সর্বশেষ যাচাই» — the latest day a page it cites was read — and «সূত্র ↗», the institute's own
   page it cites first (`verified`, `sourcePage` in the seed).

## The preview (RES-3, 2026-10-10)

Built into the local preview only by `tools/build-bangladesh-research-institutes.mjs <out>` (still in
`tools/wip.json`; nothing under `docs/maps/`, nothing in the registry). Four tabs, each its own table and clustered
source; the ethnic map's numbered discs (an approximate point hollow, its card subtitled «আনুমানিক অবস্থান: জেলা সদর»);
the shared district outlines; navy count bubbles (radius 22, to z15) that split when tapped; IPH and icddr,b, at one
point, open a list (`cluster.list`). A disc's frame is drawn small enough to set it apart from its nearest neighbour
(zoom 9–15). ⓘ: the sources grouped (the institutes' own sites, the ministries' and divisions', bdlaws, the one
Wikipedia revision), COD-AB's credit for the outlines and capitals, and OpenStreetMap's (ODbL) for BRRI, BJRI and
BTRI. Two new opt-in shell terms: a row's `link` (the card's foot) and `cluster.list` (`notes/descriptor.md`).

## Card

- প্রতিষ্ঠার সাল, with «বর্তমান রূপে: <year>» under it where one exists.
- অবস্থান ও সদর দপ্তর: the area in the official page's own words, then the district (the shared file's name). The
  area is null (pending) where the page gives only the district (BSRTI, RRI) or an English address only (IEDCR,
  icddr,b, BIDS, BIISS).
- অধীন: the parent body.
- কী নিয়ে গবেষণা: our one line.

An approximate point carries «আনুমানিক অবস্থান: জেলা সদর».

## Points

- 21 site pins, 3 OpenStreetMap, 3 approximate (COD-AB district capitals).
- OpenStreetMap:
  - BRRI: way 760123923, the campus;
  - BJRI: way 295516680, the building;
  - BTRI: way 28954612, the building.
- Approximate, where OSM names no head office:
  - the fisheries institute (only a regional station);
  - the forest institute (a mosque and a school only; its own site's pin lies in Sunamganj, so it was rejected);
  - icddr,b (field offices only).
- Within 5 km of another point in the same tab:
  - কৃষি 6 of 13, nearest 742 m (BRRI/BARI);
  - বিজ্ঞান ও প্রযুক্তি 6 of 9, nearest 187 m (BCSIR/BRiCM, one campus);
  - স্বাস্থ্য 2 of 3;
  - সমাজ, অর্থনীতি ও কৌশল 2 of 2.

## Fetch rule

Every request goes through the investigation's fetch helper (`tools/.cache/research-institutes/lib.mjs`: `get`,
`wiki`, `fetchBytes`). It sends the repo User-Agent, checks robots.txt, scrubs e-mail addresses at write time and
never asks a refused host again. No direct fetch by anyone, sub-agents included. RES-1 had one breach: a plain fetch
of a baec.gov.bd script, nothing saved. CLAUDE.md records the rule.

## Institutes

**কৃষি** (14)

| Institute | Year | বর্তমান রূপে | Point | Why kept / note |
|---|---|---|---|---|
| BSRI — বাংলাদেশ সুগারক্রপ গবেষণা ইনস্টিটিউট | 1933 | 2019 | site | its own page: research is its main work; year: its own page tells its evolution from the 1933 seedling-testing laboratory; BARC dates the station at Ishwardi to 1951 |
| BJRI — বাংলাদেশ পাট গবেষণা ইনস্টিটিউট | 1951 | 1974 | osm | its own page: research is its main work; year: 1904 is jute research beginning in Dhaka and 1936 a laboratory of the Indian Central Jute Committee; the institute itself is the one set up at its present site in 1951 |
| BFRI — বাংলাদেশ বন গবেষণা ইনস্টিটিউট | 1955 | 1968 | approximate | its own page: research is its main work |
| BTRI — বাংলাদেশ চা গবেষণা ইনস্টিটিউট | 1957 | 1973 | osm | its own page: research is its main work; year: 1952 is the Tea Board's decision and preliminary work; the station was established in 1957 |
| BINA — বাংলাদেশ পরমাণু কৃষি গবেষণা ইনস্টিটিউট | 1961 | 1984 | site | its own page: research is its main work; year: its own page says its first journey began in 1961 with the RAGENE laboratory, from which INA (1972) grew |
| SRDI — মৃত্তিকা সম্পদ উন্নয়ন ইনস্টিটিউট | 1961 | 1983 | site | restored by the user (RES-3); its own page: research is its main work; year: BARC dates its beginning to 1961, renamed several times since, as SRDI in 1983 |
| BSRTI — বাংলাদেশ রেশম গবেষণা ও প্রশিক্ষণ ইনস্টিটিউট | 1962 | held | site | its own page: research is its main work |
| BIRTAN — বাংলাদেশ ফলিত পুষ্টি গবেষণা ও প্রশিক্ষণ ইনস্টিটিউট | 1968 | 2012 | site | its own page: research is its main work; year: it began as the Applied Nutrition Project at Jurain in 1968 and was renamed BIRTAN in 1979 |
| BRRI — বাংলাদেশ ধান গবেষণা ইনস্টিটিউট | 1970 | 1973 | osm | its own page: research is its main work |
| BARC — বাংলাদেশ কৃষি গবেষণা কাউন্সিল | 1973 | — | site | the apex of the national agricultural research system (kept by decision 1) |
| BARI — বাংলাদেশ কৃষি গবেষণা ইনস্টিটিউট | 1976 | — | site | its own page: research is its main work; year: 1908 is the Dhaka Farm, a farm its page calls the forerunner of its research, not the institute |
| BLRI — বাংলাদেশ প্রাণিসম্পদ গবেষণা ইনস্টিটিউট | 1984 | — | site | its own page: research is its main work; conflict: BARC and its own glance page give 1986, the year work began at Savar; the 1984 Ordinance on bdlaws comes first (decision 4) |
| BFRI — বাংলাদেশ মৎস্য গবেষণা ইনস্টিটিউট | 1984 | — | approximate | its own page: research is its main work |
| BWMRI — বাংলাদেশ গম ও ভুট্টা গবেষণা ইনস্টিটিউট | 2017 | — | site | its own page: research is its main work |

**বিজ্ঞান ও প্রযুক্তি** (9)

| Institute | Year | বর্তমান রূপে | Point | Why kept / note |
|---|---|---|---|---|
| RRI — নদী গবেষণা ইনস্টিটিউট | 1948 | 1990 | site | its own page: research is its main work; year: the Hydraulic Research Laboratory, approved and set up in Dhaka in mid-1948, merged fully into RRI in 1978 |
| BCSIR — বাংলাদেশ বিজ্ঞান ও শিল্প গবেষণা পরিষদ | 1955 | 1978 | site | its own page: research is its main work; conflict: its own page says it was established as BCSIR by an ordinance in 1973; the ordinance on bdlaws is No. V of 1978, and the Act comes first (decision 4) |
| BNH — বাংলাদেশ ন্যাশনাল হারবেরিয়াম | 1970 | 1975 | site | its own page: research is its main work; year: the 1970 project «Botanical Survey of East Pakistan» became the Bangladesh National Herbarium on 1 July 1975 |
| BAEC — বাংলাদেশ পরমাণু শক্তি কমিশন | 1973 | — | site | its own page: research is its main work; year: 1964 is the Atomic Energy Centre, Dhaka, set up by the then (Pakistan) commission; conflict: its own page dates President's Order 15 to February 1972; bdlaws dates the same order 27 February 1973, and the Act comes first (decision 4) |
| HBRI — হাউজিং এন্ড বিল্ডিং রিসার্চ ইনস্টিটিউট | 1975 | 1977 | site | its own page: research is its main work |
| SPARRSO — বাংলাদেশ মহাকাশ গবেষণা ও দূর অনুধাবন প্রতিষ্ঠান | 1980 | 1991 | site | its own page: research is its main work; year: 1968 and 1975 are a ground station and a programme it grew out of |
| NIB — ন্যাশনাল ইনস্টিটিউট অব বায়োটেকনোলজি | 1999 | 2010 | site | its own page: research is its main work |
| BRiCM — বাংলাদেশ রেফারেন্স ইনস্টিটিউট ফর কেমিক্যাল মেজারমেন্টস্‌ | 2012 | 2020 | site | its own page: research is its main work; year: 2008 is a grant for a laboratory inside BCSIR; DRiCM, the institute under its earlier name, was inaugurated in 2012 |
| BORI — বাংলাদেশ ওশানোগ্রাফিক রিসার্চ ইনস্টিটিউট | 2015 | — | site | its own page: research is its main work; year: 1973 and 2000 are an initiative and an establishment project; the institute was established under its Act in 2015 |

**স্বাস্থ্য** (5)

| Institute | Year | বর্তমান রূপে | Point | Why kept / note |
|---|---|---|---|---|
| IEDCR — রোগতত্ত্ব, রোগ নিয়ন্ত্রণ ও গবেষণা ইনস্টিটিউট | 1947 (predecessor in নয়াদিল্লি) | 1976 | site | its own page: research is its main work; year: its own history runs from the Central Malaria Institute of East Pakistan (1947), working in Dhaka as the Malaria Institute of Pakistan from 1954, to IEDCR (1976) |
| IPH — জনস্বাস্থ্য ইনস্টিটিউট | 1952 | 1953 | approximate | restored by the user (RES-3); its own page: research is its main work |
| icddr,b — আন্তর্জাতিক উদরাময় গবেষণা কেন্দ্র, বাংলাদেশ | 1960 | 1978 | approximate | an international research centre under its own Act (kept by decision 1) |
| BMRC — বাংলাদেশ মেডিকেল রিসার্চ কাউন্সিল | 1972 | — | site | restored by the user (RES-3); the apex body of health research, kept like BARC (the user, 2026-10-10) |
| NIPORT — জাতীয় জনসংখ্যা গবেষণা ও প্রশিক্ষণ ইনস্টিটিউট | 1977 | — | site | its own page: research is its main work |

**সমাজ, অর্থনীতি ও কৌশল** (4)

| Institute | Year | বর্তমান রূপে | Point | Why kept / note |
|---|---|---|---|---|
| BIDS — বাংলাদেশ উন্নয়ন গবেষণা প্রতিষ্ঠান | 1957 (predecessor in করাচি) | 1974 | site | its own page: research is its main work; year: its own page traces it to PIDE, established in Pakistan in 1957 and moved to Dhaka in 1971; the 1974 Act (s. 19) also dates BIDE to a 1964 notification |
| BARD — বাংলাদেশ পল্লী উন্নয়ন একাডেমি, কুমিল্লা | 1959 | 1986 | site | restored by the user (RES-3); its own page: research is its main work |
| RDA — পল্লী উন্নয়ন একাডেমী, বগুড়া | 1974 | 1990 | site | restored by the user (RES-3); its own page: research is its main work |
| BIISS — বাংলাদেশ ইনস্টিটিউট অব ইন্টারন্যাশনাল এন্ড স্ট্র্যাটেজিক স্টাডিজ | 1978 | 1984 | site | its own page: research is its main work; conflict: its own page dates the 1984 Ordinance 28 March, bdlaws 17 April: the same year, so a year-only card settles it (decision 4) |

**Left out** (26)

| Candidate | Reason |
|---|---|
| সিডিবি — তুলা উন্নয়ন বোর্ড (AG14) | a development board: research runs together with cotton extension and seed production under one management |
| GSB — বাংলাদেশ ভূতাত্ত্বিক জরিপ অধিদপ্তর (ST9) | a survey department: its page lists mapping and exploration before research (its founding year was also unverified) |
| BEPRC — বাংলাদেশ জ্বালানি ও বিদ্যুৎ গবেষণা কাউন্সিল (বিইপিআরসি) (ST10) | a council that funds and coordinates energy research rather than doing it; only BARC is kept as such a body (decision 1) |
| IWM — ইনস্টিটিউট অব ওয়াটার মডেলিং (আইডব্লিউএম) (ST11) | left out by the user (decision 1) |
| BPI — বাংলাদেশ পেট্রোলিয়াম ইন্সটিটিউট (ST13) | a training institute: training first, research one of its functions (decision 1: training academies) |
| NACTAR — জাতীয় কম্পিউটার প্রশিক্ষণ ও গবেষণা একাডেমী (নেকটার) (ST14) | a training academy (decision 1) |
| CEGIS — সেন্টার ফর এনভায়রনমেন্টাল এন্ড জিওগ্রাফিক ইনফরমেশন সার্ভিসেস (ST15) | left out by the user (decision 1); not verifiable in RES-1 either |
| আইপিএইচএন — জনস্বাস্থ্য পুষ্টি প্রতিষ্ঠান (HE3) | runs national nutrition programmes, surveys and training; research is one task among them |
| NIPSOM — জাতীয় প্রতিষেধক ও সামাজিক চিকিৎসা প্রতিষ্ঠান (নিপসম) (HE4) | a postgraduate teaching and training institute |
| ICMH — বাংলাদেশ শিশু ও মাতৃস্বাস্থ্য ইনস্টিটিউট (HE8) | a hospital-institute (decision 1: hospitals) |
| NICRH — জাতীয় ক্যান্সার গবেষণা ইনস্টিটিউট ও হাসপাতাল (HE9) | a hospital (decision 1) |
| RDA Gopalganj — পল্লী উন্নয়ন একাডেমি (আরডিএ), গোপালগঞ্জ (SE5) | a rural-development academy (decision 1) |
| RDA Rangpur — পল্লী উন্নয়ন একাডেমি (আরডিএ), রংপুর (SE6) | a rural-development academy (decision 1) |
| RDA Jamalpur — পল্লী উন্নয়ন একাডেমী, জামালপুর (SE7) | a rural-development academy (decision 1) |
| NAPD — জাতীয় পরিকল্পনা ও উন্নয়ন একাডেমি (SE8) | a training academy (decision 1) |
| BPATC — বাংলাদেশ লোক-প্রশাসন প্রশিক্ষণ কেন্দ্র (SE9) | a training academy, named in decision 1 |
| NILG — জাতীয় স্থানীয় সরকার ইনস্টিটিউট (SE10) | a training institute for local government (decision 1) |
| NAEM — জাতীয় শিক্ষা ব্যবস্থাপনা একাডেমি (SE11) | a training academy (decision 1) |
| NAPE — জাতীয় প্রাথমিক শিক্ষা একাডেমি (SE12) | a training academy (decision 1) |
| PIB — প্রেস ইনস্টিটিউট বাংলাদেশ (SE13) | a journalism training and publication institute (decision 1: training) |
| বাংলা একাডেমি (SE14) | a language and culture body, named in decision 1 |
| IMLI — আন্তর্জাতিক মাতৃভাষা ইনস্টিটিউট (SE15) | a language body (decision 1: language and culture bodies) |
| কবি নজরুল ইনস্টিটিউট (SE16) | a culture body, named in decision 1 |
| BIPS — বাংলাদেশ ইনস্টিটিউট অব পার্লামেন্টারী স্ট্যাডিজ (SE17) | a parliamentary training and research institute whose own site did not answer: research is not shown to be its main work |
| BIBM — Bangladesh Institute of Bank Management (SE18) | left out by the user (decision 1) |
| IPF — Institute of Public Finance Bangladesh (SE19) | a training institute: training in public financial management first (decision 1) |
