# bangladesh-ethnic-groups — «বাংলাদেশের ক্ষুদ্র নৃ-গোষ্ঠী»

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map under বাংলাদেশ.

**Status: work in progress (ETH-3, 2026-10-08), on the local preview only.**
- In `tools/wip.json` under Bangladesh, so it is on the preview's home page; not in `docs/registry.json`.
- Built into `docs/maps/bangladesh-ethnic-groups/` by `tools/build-bangladesh-ethnic-groups.mjs` from the
  seed, `data-sources/bangladesh-ethnic-groups/bangladesh-ethnic-groups.seed.json`. `tools/verify-descriptor.mjs`
  pins the seed and holds the folder to a fresh build; `tools/verify.mjs` holds the seed's sources and anchors.
- ETH-2 (2026-10-08) wrote the seed only, and kept it out of `tools/wip.json` by the user's instruction for
  that step. ETH-3 added it there before the build.
- The research behind it is out of git, in `tools/.cache/ethnic/`:
  - ETH-1: `investigation.md`;
  - ETH-2: `eth2/` (the assembly scripts), `names/`, `facts/`, `institutes/` and `strings-review.md`;
  - ETH-3: `eth3/` (the review applied, the source checks, the names image, the contact sheet's script).

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
- The user decided (ETH-3, 2026-10-08): they sit at their district's capital in COD-AB, and their card says
  so (#23).
- Bandarban's own map embed points to a template default in Chattogram, so it was rejected.

**Haluaghat's district:** no official page states it.
- COD-AB has one Haluaghat, in Mymensingh, and its upazila portal sits under mymensingh.gov.bd.
- The user takes the district from the COD-AB upazila record (ETH-3, 2026-10-08): Mymensingh.

**Groups an institute's own page names:**
- Rangamati: 12 groups;
- Bandarban: 11 groups;
- Lalitkala: মণিপুরী;
- none for the other 7.

So 7 of the 19 groups show an institute on their card: চাকমা, মারমা, ত্রিপুরা, ম্রো, তঞ্চঙ্গা and বম
(Rangamati, Bandarban), and মণিপুরী (Lalitkala).

## The user's review (2026-10-08, ETH-3), by ETH-2 number

Numbers are those of `tools/.cache/ethnic/strings-review.md` (ETH-2). Each edited string keeps its source; each
new wording was checked against the cached passage it cites.

- **Edited and approved** (the user's wording):
  - #19 (`strings.districtCard.groups`): «এই জেলায় রং করা গোষ্ঠী» → now «এই জেলায় যেসব গোষ্ঠীর প্রধান বসতি»
  - #22 (`strings.instituteCard.groupsNamed`): «প্রতিষ্ঠানের পাতায় নাম থাকা গোষ্ঠী» → now «প্রতিষ্ঠানের নিজের পাতায় উল্লেখিত গোষ্ঠী»
  - #28 (`info[2]`): «বড় থেকে ছোট ক্রমে যেসব জেলা মিলে একটি গোষ্ঠীর ৮০% মানুষ ধরে, তার মধ্যে অন্তত ১,০০০ জন থাকা জেলাগুলো রং করা।» → now «যে জেলাগুলোতে একটি গোষ্ঠীর মোট মানুষের ৮০% থাকে (সবচেয়ে বেশি থেকে শুরু করে), তার মধ্যে যেখানে অন্তত ১,০০০ জন আছে, সেগুলো রং করা।»
  - #29 (`info[3]`): «যে গোষ্ঠীর অর্ধেক বা তার বেশি মানুষ রাঙ্গামাটি, খাগড়াছড়ি ও বান্দরবানে থাকে, তাকে পাহাড়ি বলা হয়েছে; বাকিগুলো সমতলের।» → now «যে গোষ্ঠীর অর্ধেক বা তার বেশি মানুষ রাঙ্গামাটি, খাগড়াছড়ি ও বান্দরবানে থাকে, তাকে এই মানচিত্রে পাহাড়ি ধরা হয়েছে; বাকিগুলো সমতলের।»
  - #45 (`khasia.name`): «খাসিয়া/ খাসি» → now «খাসিয়া/খাসি»
  - #63 (`marma.religion`): «বৌদ্ধ; পাশাপাশি দেবতা ও অপদেবতাতেও বিশ্বাস রাখে» → now «বৌদ্ধ; পাশাপাশি নানা দেবতাতেও বিশ্বাস রাখে»
  - #65 (`tripura.language`): «চীনা-তিব্বতি গোত্রের ভাষা; ভারতে একে ককবরক বলা হয়» → now «চীনা-তিব্বতি গোত্রের ভাষা»
  - #72 (`oraon.religion`): «জড়োপাসক; তাদের ভগবান ধরমেশ বা ধরমী» → now «নিজস্ব ঐতিহ্যবাহী ধর্ম; উপাস্য ধরমেশ বা ধরমী»
  - #75 (`garo.religion`): «শতকরা ৯৯ জনই খ্রিস্টধর্মের অনুসারী» → now «প্রায় সবাই খ্রিস্টধর্মের অনুসারী»
  - #82 (`tonchonga.religion`): «প্রধানত বৌদ্ধ; অনেকের মধ্যে গাঙ পূজা ও ভূত পূজার মতো দেবপূজাও প্রচলিত» → now «প্রধানত বৌদ্ধ; পাশাপাশি গাঙ পূজার মতো ঐতিহ্যবাহী পূজাও প্রচলিত»
  - #90 (`koch.religion`): «দুর্গা, কালী প্রভৃতির পূজা করে, সঙ্গে নিজেদের আদি দেবদেবীরও উপাসনা» → now «দুর্গা, কালী প্রভৃতির পূজা করে, সঙ্গে নিজেদের আদি দেবদেবীরও উপাসনা করে»
  - #92 (`bom.religion`): «২০০১ সালের মধ্যে প্রায় সবাই খ্রিস্টান হয়েছে» → now «প্রায় সবাই খ্রিস্টধর্মের অনুসারী (২০০১ সালের তথ্য)»
  - #94 (`khasia.religion`): «বেশির ভাগই খ্রিস্টান (শতকরা ৮০-৯০ জন)» → now «বেশির ভাগই খ্রিস্টধর্মের অনুসারী»
  - #95 (`bagdi.language`): «নিজেদের ভাষা ব্যবহার করে, তবে তা প্রায় বাংলার কাছাকাছি» → now «নিজেদের ভাষা আছে, যা বাংলার খুব কাছাকাছি»
  - #102 (`hajong.festivals`): «বারোয়ারি দুর্গাপুজা; কালী পূজার সময় উৎসব» → now «বারোয়ারি দুর্গাপূজা; কালীপূজার সময়েও উৎসব হয়»
  - #45's census form, «খাসিয়া/ খাসি», is recorded in its citation; the map follows the gazette's.
  - #72: the source (Banglapedia, «ওরাওঁ») calls the Oraons «জড়োপাসক» and names their creator ধরমেশ or ধরমী.
    «নিজস্ব ঐতিহ্যবাহী ধর্ম» restates that without the word.
- **Removed:** #87 (`mahato.language`, «শাদ্রি ভাষায় কথা বলে»), #88 (`malo.language`, «শাদ্রি ভাষায় কথা বলে»). «শাদ্রি» was a match by name only, so the
  মাহাতো and মালো cards have no language line.
- **Source checks, proposed and still awaiting the user** (`approved: false`):
  - #67 (`tripura.festivals`): «প্রধান উৎসব বৈসাবী» unchanged. The Khagrachhari portal
    («ত্রিপুরা») names «বৈসাবী» as the Tripuras' own main festival, and spells it so.
  - #79 (`mro.religion`): «ধর্মপ্রাণবাদী; তাদের দেবতা তিনজন» → now «তিন দেবতায় বিশ্বাস: তুরাই (সৃষ্টিকর্তা), সাংতুং (পাহাড়ের দেবতা) ও ওরেং (নদীর দেবী)».
    - Banglapedia («ম্রো», ¶8) prints «ধর্মপ্রাণবাদী» (no English article exists; checked 2026-10-08).
    - The new line avoids the word and names the three deities the same sentence gives.
  - #80 (`mro.festivals`): «গো-হত্যা উৎসব» → now «কুমুলং উৎসব, যাতে গরু বধ করা হয়».
    - The Rangamati portal gives no name. Banglapedia's «ম্রো» names it «কুমুলং», in a photograph's caption.
    - The line now cites Banglapedia, the one source that gives the name.
  - #83 (`tonchonga.festivals`): «প্রধান সামাজিক উৎসব বিজু-সাংগ্রাই-বৈসুক» → now «চাকমা, মারমা ও ত্রিপুরাদের সঙ্গে অভিন্ন প্রধান সামাজিক উৎসব বিজু-সাংগ্রাই-বৈসুক».
    The Rangamati portal names বিজু-সাংগ্রাই-বৈসুক as the shared main festival of the চাকমা, মারমা, ত্রিপুরা
    and তঞ্চঙ্গ্যা.
  - #84 (`monipuri.language`): «মাতৃভাষা মেইতেই লন (মণিপুরী), তিব্বতি-বর্মি উপ-পরিবারের» unchanged.
    - No official page cached or found, and no Banglapedia article, says the census «মণিপুরী» covers more
      than one language community.
    - Banglapedia's «মণিপুরী» names Meitei as the mother tongue and the Meitei Pangon (Muslim Manipuris)
      within it.
    - The Bishnupriya appear only in non-official pages (a teachers' portal, newspapers); Banglapedia has no
      article on them (404, 2026-10-08).
  - #97 (`rakhain.language`): «নিজেদের মধ্যে নিজস্ব আরাকাইন ভাষায় কথা বলে» unchanged. The Barguna portal spells
    «আরাকাইন».
- **The ten unverified names** (#32–#34, #36–#41, #43) stay `approved: false` until the user confirms them
  against `tools/.cache/ethnic/names-check.png`. It shows each label cropped from the BBS page (PDF pp. 52–53,
  printed ৩৩–৩৪) beside the seed's spelling. The crops' places come from the PDF's own glyph runs.
- **Every other string is approved.** Two new ones await the user: the ⓘ headings «সূত্র» and «টীকা», which
  the map shows.

## The map as built (ETH-3, 2026-10-08)

- **Basemap and bounds:** `bangladesh-wide`, Bangladesh only, held by `constraints.maxBounds` [86, 19, 95,
  28]; 14 px text at least; frames clear of the corner controls.
- **Districts:** drawn from `docs/shared/bangladesh-districts.json` through the shell's new opt-in source term
  `sharedGeometry` (`notes/shell.md`). Nothing of the file is copied into the map's folder.
  - Two sources read it: `districtFill`, the chosen group's districts in one colour, and `districtTap`, the
    «জেলা» tab's outline and tap targets.
- **Tabs** (view tabs), on top, with the ‹ picker › row under them and ⓘ under that. The picker lists each
  tab's own table (`byTab`, as org-members does).
  - **«গোষ্ঠী»:** the 19 groups, largest first. Choosing one colours its districts and frames them.
    - Its card shows population, main districts with counts, অঞ্চল (পাহাড়ি or সমতল, with the hill share),
      language, religion, festivals, and the institutes whose own page names it, each a tap to that
      institute.
    - A field the seed omits is not shown.
  - **«জেলা»:** the 64 districts, in Bengali order. Choosing or tapping one outlines it.
    - Its card lists the groups whose main settlement it is, each a tap to its group.
    - An empty district's card gives #20.
  - **«প্রতিষ্ঠান»:** the 10 institutes as points.
    - The 4 with a cited point sit there.
    - The 6 others sit at their district's capital: COD-AB's `bgd_admincapitals` (a division capital where
      the district is one; Mymensingh for Haluaghat, from COD-AB's upazila record).
    - Their card carries #23 under the title.
    - Each card shows the name, the district, and the groups the institute's own page names.
- **Each tab's targets only:**
  - «গোষ্ঠী» hides the district targets and the institutes;
  - «জেলা» hides the institutes;
  - «প্রতিষ্ঠান» hides the districts.
- **ⓘ:**
  - Notes: lines #26–#29.
  - Sources: the census (the National Report and the District Reports), the 2019 gazette, the Ministry of
    Cultural Affairs, each government portal a shown fact cites, and Banglapedia (as a source only, never in
    card text).
  - Credits: COD-AB (CC BY-IGO 3.0) on the district sources, and OpenStreetMap (ODbL) on the institutes.

## Final fixes (ETH-4, 2026-10-08), the user's decisions

- **#80** (`mro.festivals`): «কুমুলং উৎসব, যাতে গরু বধ করা হয়» → now «কুমুলং উৎসব, যাতে গরু বলি দেওয়া হয়». Two
  citations, each with its own anchor:
  - the Rangamati district portal («সংস্কৃতি:», ETH-2's anchor), for the act;
  - Banglapedia «ম্রো» (the photograph's caption), for the name «কুমুলং».
  - Its `sourceType` is official, for the first.
- **The Mahato label** stays «মাহাতো/কুর্মি মাহাতো/বেদিয়ামাহাতো», with a space after «কুর্মি», by the user's
  decision.
  - On the census page (সারণি স-১.৪, PDF p. 52) the label wraps after «কুর্মি», so the space cannot be read
    there.
  - The seed already had the space; the decision is now in the name's citation.
- **Every pending string approved**, 18 in all:
  - the six source checks (#67, #79, #80, #83, #84, #97);
  - the ten names, which the user checked against `tools/.cache/ethnic/names-check.png`;
  - the ⓘ headings «সূত্র» and «টীকা».
- **The institute marker:** a 22 px SVG image (`institute.svg`, drawn by a symbol layer and shown in the
  legend) → now a plain circle layer.
  - Org-members' dot style: radius 6, 7 when chosen; white 2 px stroke, dark 3 px when chosen. One colour,
    `#D55E00`.
  - The shell's invisible tap disc, `tapWidth` 44.
  - No image file is left in the folder.
  - The legend draws a line or an image only, so the institutes have no legend row now. Their tab names them;
    «সাংস্কৃতিক প্রতিষ্ঠান» (#25) is kept in the seed, approved, and not drawn.
- **ⓘ's sources:** the seven district portals' eight lines → now one line, the seed's
  `strings.credits.portals`, approved under this decision. It links to https://bangladesh.gov.bd/:
  - «বাংলাদেশ জাতীয় তথ্য বাতায়ন: খাগড়াছড়ি, টাঙ্গাইল, নওগাঁ, বরগুনা, মৌলভীবাজার, রাঙ্গামাটি, রাজশাহী».
  - The name is the header every cached portal page prints (Barguna, Khagrachhari, Moulvibazar, Naogaon,
    Rajshahi, Rangamati, Tangail). The districts come in Bengali order, by the shared district file's names.
  - Each fact keeps its own page's URL in the seed.
  - The Ministry of Cultural Affairs' page, listed twice before, is listed once.
  - Credit lines: 25 → now 17.

## Strings

103: ETH-2's 102, less the two removed (#87, #88), plus the two ⓘ headings and the portal line.
- **All approved; none pending** (the user, 2026-10-08).
- `tools/verify.mjs`'s rule (a) warns on any that is not while the map is work in progress, and fails a live
  item that serves one.
