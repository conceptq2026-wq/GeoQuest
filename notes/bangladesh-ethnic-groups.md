# bangladesh-ethnic-groups — «বাংলাদেশের ক্ষুদ্র নৃ-গোষ্ঠী» (seed draft)

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map under বাংলাদেশ.

**Status: a seed draft (ETH-2, 2026-10-08).**
- Nothing is built.
- Nothing is under `docs/`, and `docs/registry.json` does not list it.
- It is not in `tools/wip.json`: the user said so for this step, though CLAUDE.md puts a new map on the
  preview home page first (an open decision).
- The seed is `data-sources/bangladesh-ethnic-groups/bangladesh-ethnic-groups.seed.json`. `tools/verify.mjs`
  checks it (section "bangladesh-ethnic-groups: seed (draft)").
- The research behind it is out of git, in `tools/.cache/ethnic/`:
  - ETH-1: `investigation.md`;
  - ETH-2: `eth2/` (the assembly scripts), `names/`, `facts/`, `institutes/` and `strings-review.md`.

## The user's decisions (2026-10-08)

- **Title:** «বাংলাদেশের ক্ষুদ্র নৃ-গোষ্ঠী», the term of the ক্ষুদ্র নৃ-গোষ্ঠী সাংস্কৃতিক প্রতিষ্ঠান আইন,
  ২০১০ (s.2(2), its title; http://bdlaws.minlaw.gov.bd/act-details-1043.html) and the heading of the 2019
  gazette list.
- **Groups:** the 18 with ≥ 10,000 people in Census 2022 (National Report Vol I, Table P29), plus হাজং
  (7,996): 19 in all.
- **Names:** the Census 2022 Bengali labels. Where the gazette (S.R.O. 78-Law/2019) spells a name
  differently, the seed records it as `gazetteName` (below); the map shows the census label.
- **District colouring:** take a group's districts from the largest count down until together they hold
  80 % of the group, then keep only those with ≥ 1,000 of its people.
- **Jashore and Sunamganj:** the figures corrected from the national tables (below), recorded here only.
- **Religion:** Banglapedia may be used where no official source states it.
- **কুর্মি = মাহাতো** only if an official source says so; otherwise the census name alone (below).
- **Two official pages in conflict:** the card states only what both agree on, and the difference is noted
  here.
- **Hill or plains:** «পাহাড়ি» if ≥ 50 % of the group lives in Rangamati, Khagrachhari and Bandarban,
  otherwise «সমতল».
- **Institutes:** a separate layer. An institute's name appears on a group's card only if that institute's
  own page names the group.
- **Source rule (2026-10-07):** official sources first, then Banglapedia (or NCTB) only where no official
  source states the fact.
  - The map never mentions a book.
  - One cited source per claim, nothing from memory.
- **Rule (a)** applies: every Bengali string carries an approval flag. All 102 are `approved: false` now.

## Sources

- **BBS, Population and Housing Census 2022:**
  - National Report Vol I (November 2023):
    - Table P29, group × division, gives the national counts, printed p. 365 (PDF p. 413);
    - P28 gives district totals;
    - P02 gives district populations.
  - The 64 District Reports (June 2024), Table P17, group × upazila: the district counts. The 29 reports
    the coloured districts come from are each a source in the seed, with their pages.
  - The preliminary report's Bangla version, সারণি স-১.৪ (PDF pp. 52–53): the Bengali labels.
  - The URLs, sizes and SHA-256s are in `tools/.cache/ethnic/raw/census/manifest.tsv`.
- **The 2019 gazette** (https://dpp.gov.bd/upload_file/gazettes/31266_79440.pdf): the official list of 50
  groups and their spellings.
- **District portals (*.gov.bd):** Rangamati, Khagrachhari, Naogaon, Tangail, Moulvibazar, Rajshahi,
  Barguna and Patuakhali, for language, religion and festivals. Each card fact cites its page, the place on
  it, and an anchor (offset, length, SHA-256) into the cached text (`tools/.cache/ethnic/raw/culture/`,
  whitespace collapsed). The texts are pinned in the seed's `texts`.
- **Banglapedia:** where no official page states the fact. It is cited the same way and marked
  `sourceType: "banglapedia"`.
- **The Ministry of Cultural Affairs' list** of its 10 institutes
  (https://moca.gov.bd/pages/static-pages/694032e335ce18e1c0563ee3), and each institute's own portal.
- **Geometry:** `docs/shared/bangladesh-districts.json` (COD-AB v03, BBS/OCHA, CC BY-IGO 3.0), joined by
  pcode. bangladesh.pmtiles has only district lines and labels, not polygons. Institute points come from
  the institutes' own map embeds or from OpenStreetMap (ODbL, credited).
- **Licences:**
  - BBS has no terms page.
  - bdlaws has a © footer only.
  - Banglapedia reserves all rights.
  - Facts are therefore restated in our own words, and no quote's words are committed: only its anchor.

## Names (Census 2022 labels)

- **Verified from the text layer** of সারণি স-১.৪, 9 of 19: চাকমা, মারমা, গারো, মালো/ঘাসিমালো, বম,
  খাসিয়া/ খাসি, বাগদী, রাখাইন, হাজং.
- **Unverified**, 10: ত্রিপুরা, সাঁওতাল, ওরাওঁ, মুন্ডা, ম্রো, তঞ্চঙ্গা, বর্মণ, মণিপুরী, মাহাতো/কুর্মি
  মাহাতো/বেদিয়ামাহাতো, কোচ.
  - The PDF's text layer drops every conjunct, reph and vowel-sign glyph that has no ToUnicode entry.
  - Every glyph it does map agrees with the form read from the page image, but the missing ones cannot be
    read from text.
  - No other BBS Bengali Unicode source prints these labels. The seed marks each name `verifiedFromText`.
- **Gazette spellings that differ** (`gazetteName`):
  - মুন্ডা (census) / মুণ্ডা (gazette, entry 19);
  - মাহাতো/কুর্মি মাহাতো/বেদিয়ামাহাতো / মাহাতো/কুর্মি মাহাতো/বেদিয়া মাহাতো (entry 25);
  - খাসিয়া/ খাসি / খাসিয়া/খাসি (entry 4).
  - The census label is kept as printed, the space after the slash included: names are never corrected.
- **The institutes' pages** spell তঞ্চঙ্গ্যা (census তঞ্চঙ্গা) and the Lalitkala Academy's site মনিপুরী
  (census মণিপুরী). They are matched as spelling variants of one name, which the user is asked to
  confirm.

## কুর্মি and মাহাতো

- No official source states that plain «কুর্মি» is the same people as «মাহাতো».
- The 2019 gazette has «কুর্মি» only inside entry 25, «মাহাতো/কুর্মি মাহাতো/বেদিয়া মাহাতো».
- BBS writes "Kurmi" only as "Kurmi Mahato".
- The Naogaon portal describes «কুর্মি» and never names মাহাতো. The Rajshahi academy and the Tanore and
  Tarash upazila portals name only «মাহাতো».
- Banglapedia (not official) makes মাহাতো a গোত্র of the Kurmi.
- So the record keeps the census name alone. The Kurmi facts (Naogaon portal, Banglapedia) are not attached;
  they sit in `tools/.cache/ethnic/facts/facts.json` as `kurmiCandidate`.

## Districts (80 % + 1,000)

| group | P29 | coloured districts (count) | zone, share in the three hill districts |
|---|---:|---|---|
| চাকমা | 483,365 | রাঙ্গামাটি 276,048, খাগড়াছড়ি 175,165 | পাহাড়ি 94.1 % |
| মারমা | 224,299 | বান্দরবান 84,170, খাগড়াছড়ি 74,210, রাঙ্গামাটি 51,403 | পাহাড়ি 93.5 % |
| ত্রিপুরা | 156,620 | খাগড়াছড়ি 98,500, বান্দরবান 22,572, চট্টগ্রাম 15,894 | পাহাড়ি 85.2 % |
| সাঁওতাল | 129,056 | দিনাজপুর 41,079, রাজশাহী 26,224, নওগাঁ 18,903, হবিগঞ্জ 6,666, চাঁপাইনবাবগঞ্জ 6,409, মৌলভীবাজার 6,308 | সমতল 0.5 % |
| ওরাওঁ | 85,858 | নওগাঁ 33,198, রংপুর 8,580, রাজশাহী 8,048, চাঁপাইনবাবগঞ্জ 6,510, সিরাজগঞ্জ 5,678, জয়পুরহাট 5,074, মৌলভীবাজার 4,468 | সমতল 0 % |
| গারো | 76,854 | ময়মনসিংহ 21,908, নেত্রকোণা 16,064, টাঙ্গাইল 12,610, ঢাকা 9,367, শেরপুর 6,444 | সমতল 0.2 % |
| মুন্ডা | 60,201 | নওগাঁ 25,194, হবিগঞ্জ 13,152, মৌলভীবাজার 8,158, জয়পুরহাট 3,489 | সমতল 0 % |
| ম্রো | 52,463 | বান্দরবান 51,448 | পাহাড়ি 98.6 % |
| তঞ্চঙ্গা | 45,974 | রাঙ্গামাটি 27,975, বান্দরবান 14,889 | পাহাড়ি 93.4 % |
| বর্মণ | 44,671 | নওগাঁ 11,918, ঠাকুরগাঁও 6,534, টাঙ্গাইল 5,219, জয়পুরহাট 4,463, চাঁপাইনবাবগঞ্জ 4,196, গাজীপুর 2,942, ময়মনসিংহ 1,390 | সমতল 0.1 % |
| মণিপুরী | 22,979 | মৌলভীবাজার 18,031, সিলেট 2,834 | সমতল 0.1 % |
| মাহাতো/… | 19,271 | সিরাজগঞ্জ 7,533, মৌলভীবাজার 2,632, জয়পুরহাট 2,132, নওগাঁ 1,894, বগুড়া 1,305 | সমতল 0 % |
| মালো/ঘাসিমালো | 14,797 | নড়াইল 4,141, যশোর 2,164, ফরিদপুর 2,046, জয়পুরহাট 1,277, মাগুরা 1,030 | সমতল 0.2 % |
| কোচ | 13,704 | টাঙ্গাইল 4,845, গাজীপুর 2,890, শেরপুর 1,773, ঝিনাইদহ 1,388, ঠাকুরগাঁও 1,258 | সমতল 0 % |
| বম | 13,193 | বান্দরবান 11,854 | পাহাড়ি 93.3 % |
| খাসিয়া/ খাসি | 12,422 | মৌলভীবাজার 10,045 | সমতল 0.3 % |
| বাগদী | 12,096 | মাগুরা 2,542, রাজবাড়ী 2,157, ঝিনাইদহ 1,830 | সমতল 0 % |
| রাখাইন | 11,197 | কক্সবাজার 7,273, বরগুনা 1,017 | সমতল 12.5 % |
| হাজং | 7,996 | নেত্রকোণা 4,327, সুনামগঞ্জ 1,506 | সমতল 0.1 % |

- **Districts the 1,000 floor drops from the 80 % set:**
  - রাখাইন: Patuakhali 891;
  - হাজং: Mymensingh 954;
  - মালো: Jhenaidah 707, Gopalganj 658;
  - বাগদী: six districts of 447–614.
  - বাগদী's three coloured districts hold 54 % of it, মালো's 72 %, হাজং's 73 %.
- **Metro districts enter as migrant destinations:** Dhaka for গারো, Chattogram for ত্রিপুরা, Gazipur for
  বর্মণ and কোচ.
- **District tab:** 31 districts are coloured for at least one group. The other 33 are empty, and their card
  says so in one line: Barishal, Bhola, Jhalokati, Patuakhali, Pirojpur, Brahmanbaria, Chandpur, Cumilla,
  Feni, Lakshmipur, Noakhali, Gopalganj, Kishoreganj, Madaripur, Manikganj, Munshiganj, Narayanganj,
  Narsingdi, Shariatpur, Bagerhat, Chuadanga, Khulna, Kushtia, Meherpur, Satkhira, Jamalpur, Natore, Pabna,
  Gaibandha, Kurigram, Lalmonirhat, Nilphamari, Panchagarh.
- **Jashore and Sunamganj (recorded here only):**
  - Their District Reports' Table P17 is shifted by one row from Patro on, and the "Kora" row carries Kora
    plus Others.
  - The seed uses P29's division block less the division's other districts. Each district's Community
    Report, Table C-13, prints the same values for its top three groups.
  - Of the coloured districts this affects only যশোর for মালো (2,164) and সুনামগঞ্জ for হাজং (1,506). Both
    cite P29 as derived.
- Census district codes are the pcode's last two digits (`bbsCode`). The census's spellings differ from the
  shared file's in three names (Chapainawabganj, Netrokona, Jhalokathi); the join is by pcode.

## Hill or plains

- No official document classifies the groups as hill (পাহাড়ি) or plains (সমতল); recorded here only.
- The CHT Regional Council Act 1998 s.2(গ) (bdlaws act-details-822) and the three Hill District Council
  Acts 1989 s.2(খ) name only the people who live permanently in the hill districts. Of these 19 they name
  চাকমা, মারমা, ত্রিপুরা, ম্রো, তঞ্চঙ্গা and বম. The user's 50 % rule gives exactly those six.
- No group lies between 40 % and 60 %. The nearest are ত্রিপুরা at 85.2 % and রাখাইন at 12.5 %.

## Card facts: sources, conflicts and what is left out

| field | official | Banglapedia | omitted |
|---|---:|---:|---:|
| language | 10 | 8 | 1 (বর্মণ) |
| religion | 4 | 12 | 3 (বর্মণ, মাহাতো, মালো) |
| festivals | 9 | 1 | 9 |

The omitted festivals are গারো, মুন্ডা, বর্মণ, মাহাতো, মালো, কোচ, বম, খাসিয়া and বাগদী.

- **Chakma language:**
  - Rangamati («ভাষা ও সংস্কৃতি», «ভাষা:») places it in the Indo-Aryan family, with its own alphabet.
  - Khagrachhari («চাকমা») derives the spoken tongue from the Chittagong dialect and says the alphabet is
    on the Burmese model.
  - The card states only that it has its own alphabet.
- **Marma script:** Rangamati says Marmas write in Burmese script; Khagrachhari says they have their own,
  «মারমাচা». The card gives only the language family, from Rangamati, which Khagrachhari does not address.
- **Festival names:**
  - Tripura: «বৈসাবী» (Khagrachhari) / «বৈসুক» (Rangamati); the card keeps «বৈসাবী».
  - Marma: «সাংগ্রাইং» / «সাংগ্রাই»; the card keeps «সাংগ্রাইং».
  - Both are for the user.
- **মুন্ডা festivals, left out:** the Naogaon portal names Mundas only in passing, in its কুর্মি section
  («like the Mundas and Oraons, Kurmis also …»). That is a weak source, so the field stays empty.
- **গারো festivals, left out:** «ওয়ানগালা» is on the Moulvibazar portal's list of the district's
  festivals, which ties it to no group.
- **মালো and মাহাতো language:** «শাদ্রি», from Banglapedia («উপজাতীয় ভাষা» ¶4), matched by name. The user
  is asked to confirm.
- **মালো:** Banglapedia's «মালো» article on the Bengali fishing caste may be another people, so it is not
  used.
- **Small differences kept as the source prints them:** Mro «ধর্মপ্রাণবাদী»; Khasi Christian 80–90 %
  (Bengali Banglapedia) vs > 80 % (English). The sources' «তিববতী-বর্মী» is written «তিব্বতি-বর্মী».
- **বর্মণ** has no source for anything but its census counts.

## Institutes (a separate layer)

The 10 are on the Ministry of Cultural Affairs' list:
- seven under s.4 of the 2010 Act;
- three more with no notification found (Haluaghat, Dinajpur, Naogaon).

**Located, 4:**

| institute | point | source |
|---|---|---|
| Cox's Bazar cultural centre | 91.97592, 21.42847 | its «যোগাযোগ ম্যাপ» embed |
| Khagrachhari | 91.97164, 23.11869 | its home page's map embed |
| Rajshahi | 88.56557, 24.39092 | OSM way 1058731398 |
| Rangamati | 92.15549, 22.66121 | OSM node 4707811087 |

- Rajshahi's OSM way is tagged `amenity=dojo`; the name is what matches it.
- Rangamati's OSM node is tagged as the institute's museum, and no page says it shares the office site.
- All four lie inside their stated upazila in COD-AB.

**Missing, 6:** Birishiri, Bandarban, the Manipuri Lalitkala Academy, Haluaghat, Dinajpur and Naogaon.
- The proposed fallback is COD-AB's upazila or district capital point, marked as a fallback. It is not used
  until the user decides.
- Bandarban's own map embed points to a template default in Chattogram, so it was rejected.

**Haluaghat's district:** no official page states it.
- The candidate is Mymensingh: COD-AB has one Haluaghat, and its upazila portal sits under mymensingh.gov.bd.
  That is an inference.

**Groups an institute's own page names:**
- Rangamati: 12 groups;
- Bandarban: 11 groups;
- Lalitkala: মণিপুরী;
- none for the other 7.

So 7 of the 19 groups show an institute on their card: চাকমা, মারমা, ত্রিপুরা, ম্রো, তঞ্চঙ্গা and বম
(Rangamati, Bandarban), and মণিপুরী (Lalitkala).

## Tabs (proposed), the tab row on top

- **«গোষ্ঠী»:** the picker lists the 19 groups.
  - Choosing one colours its districts and opens its card:
    - name;
    - population (2022);
    - main districts, with counts;
    - zone, with the share in the three hill districts;
    - language, religion, festivals and culture;
    - the institutes that name it.
  - A tap on a coloured district opens that group's card.
- **«জেলা»:** the picker lists the 64 districts.
  - Choosing one, or tapping it, outlines it and opens a card listing the groups coloured there, each a tap
    to its group card.
  - An empty district's card is the one line «মানচিত্রের ১৯টি গোষ্ঠীর কোনোটির জন্য এই জেলা রং করা
    হয়নি।».
- **«প্রতিষ্ঠান»:** the picker lists the 10 institutes, drawn as points.
  - Choosing or tapping one opens its card: name, district, and the groups its own page names (or none).
  - The 6 without a cited point wait for the user's decision on a fallback.

## ⓘ (drafts, in the seed)

The four lines cover:
- which groups the map shows;
- the census source;
- the colouring rule;
- the hill rule.

The sources list names BBS, the district portals, the institutes' pages, Banglapedia where used, COD-AB and
OpenStreetMap.

## Strings

102, all `approved: false`, numbered in `tools/.cache/ethnic/strings-review.md`:
- the title;
- 3 tab names and 3 picker placeholders;
- 7 group-card labels;
- 2 zone values;
- 2 templates;
- 2 district-card lines;
- 3 institute-card lines;
- 2 legend lines;
- 4 ⓘ lines;
- 19 group names;
- 10 institute names;
- 44 card facts.
