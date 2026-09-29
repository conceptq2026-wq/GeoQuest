# bangladesh-rivers

A diagram in the Bangladesh section, «বাংলাদেশের নদ-নদী» / "Rivers of
Bangladesh": the country's rivers, one **river system** at a time — the
Brahmaputra–Jamuna (the pilot) and, from Stage 1, the Padma — **a picture drawn
in code**, not a tile map (the user's decision, Prompt 37, 2026-09-29). It
**stays in the work in progress**
(`tools/wip.json`, kind `diagram`) — local preview only — until the user
finishes it. It is not in `docs/registry.json`.

## What is on it

- **Two tabs, one view type `rivers`:**
  - «পুরো পথ» — the whole course, lon 82–96, lat 22–31, viewBox
    `0 0 1000 715.2`. The main river, its origin marker and its border-entry
    marker only; no tributary, no distributary.
  - «বাংলাদেশে» — lon 87.88–92.81, lat 20.47–26.87, viewBox `0 0 1720 2453.8`
    (2026-09-29; it was 88.47–91.33 × 22.26–26.87, `0 0 1000 1771.4`): the
    whole of Bangladesh as COD-AB draws it and the rivers, at the old scale
    (about 384 u per degree). It opens fitted to the stage's width on
    88.0–91.6°E, centred on 24.75°N (the frame's `view`), zooms 1× to 8×, pans
    in every direction while a quarter of the picture stays on the stage, and
    a reset control (44 px, the stage's bottom-right corner) returns to the
    opening view. The Meghna's pinned line ends 1.5 km short of COD-AB's
    coast at 22.38°N; no pinned way goes further. The Jamuna system: the main
    river, the Dharla, Teesta, Karatoya and Atrai (tributaries), the
    Dhaleshwari, Banshi, Shitalakshya and Old Brahmaputra (distributaries).
    The Padma system: the Ganges–Padma (two main lines, `gangaPadma` from the
    frame's west edge, dashed outside Bangladesh, and `padma`, way 82854640,
    unchanged), the Gorai, Madhumati, Arial Khan and Bhagirathi
    (distributaries) and the Mahananda (tributary, three reaches); from
    Stage 2, batch 2, the south-west: the Mathabhanga, the Kumar (the OSM
    Kumar that leaves the Padma, «কুমার (কুষ্টিয়া)» since Stage 3), the Bhairab (its
    Jashore–Khulna course, two reaches, «ভৈরব (চুয়াডাঙ্গা)» since Stage 3), the Kapotaksha, the
    Nabaganga (three reaches) and the Chitra (two reaches, «চিত্রা
    (চুয়াডাঙ্গা)»), all distributaries. The Karnaphuli system (Stage 2,
    batch 5): the Karnaphuli (two main lines,
    `karnaphuliUpper` from the border in Barkal into Kaptai Lake and
    `karnaphuli` from the lake's Kaptai arm to the sea, 14.6 km apart across
    the lake, which is not drawn), the Kasalong and the Halda (tributaries).
    Left out: the Boalkhali and the Rankhiang (no OSM way carries either
    name) and the Chingri (OSM's only candidate is the «চেঙ্গী», and no
    cited source says the two are one river: the user's decision 1 of Stage
    3, below). The Meghna system (Stage 2, batch 3): the Meghna (a card; two
    main lines, `meghnaUpper` from where OSM first names it, near Austagram,
    to Bhairab, and the pinned `meghna` on to 22.38°N, which was the grey
    continuation), and in the `disputed` style the Barak (dashed, in India),
    the Surma and the Kushiyara (the books disagree on how the Barak meets
    them) and the Titas («তিতাস (ব্রাহ্মণবাড়িয়া)»; the books make it the
    Meghna's tributary and distributary). The Surma and the Kushiyara join the
    Meghna by connectors (10.4 and 9.9 km). Left out: the Kalni (OSM has no
    Kalni below Ajmiriganj, where it tags the stream Kushiyara). Batch 4
    adds the Manu and the Gumti (`disputed`, as the Titas; the Gumti's last
    12.7 km are four unnamed members of its «Gomati» relation, and its end is
    12.0 km from the Meghna, a connector), the Khowai (the Kushiyara's
    tributary, in neither book: BWDB's card) and, in the Jamuna system, the
    Buriganga (the Dhaleshwari's distributary, drawn from the Turag to the
    Dhaleshwari as OSM and BWDB have it). Left out: the Baulai and the Dhanu
    (no OSM way under any spelling). One ⓘ note names every river the books
    give that is not drawn. No grey continuation remains.
    Stage 3, batch 7 (the Padma system, the Mahananda's tributaries B-GEO
    names): the Punarbhaba (from Birganj through India to the Mahananda at
    Rohanpur, a shared node), the Pagla («পাগলা (চাঁপাইনবাবগঞ্জ)»; from the
    Ganga in India to the Mahananda in Chapainawabganj Sadar) and the Tangon
    («ট্যাংগন», the book's spelling; from Thakurgaon Sadar to just inside
    India, unjoined: OSM names nothing on to the Mahananda in Malda), each
    dashed outside Bangladesh (`split: "border"`). Left out: the Nagar (two
    BWDB Nagars; B-GEO's text fits the border river NW-65, both books' maps
    label NW-66, into the Atrai — it stays out, the user checks the book), the Kulik (4.7 km of
    named way in Bangladesh) and the Tetulia of Dinajpur (no named way; not in
    the books). Batch 6, the rivers of the south-east that each reach the
    sea, grouped by region under the user's rule a of Stage 3 — first as a
    group of their own, then (the user's decision 2 after Stage 3) joined to
    the Karnaphuli system, whose picker group is named as B910 পৃ. ৬২ names
    the region, «দক্ষিণ পূর্বাঞ্চল» («দক্ষিণ পূর্বাঞ্চলের প্রধান নদী কর্ণফুলী»;
    B910 পৃ. ৬৩ gives the four a paragraph headed only by their names) — the Feni (a main card; along the border, so drawn
    solid, not split) with its tributary the Muhuri (a shared node), the Sangu
    (four main pieces: 16.6 km unjoined, then connectors of 5.6 km and 733 m),
    the Matamuhuri (OSM names only its upper 58.7 km, in Alikadam) and the
    Naf (way 1223242401; the relation's head way, named «Modhur Chhora», is
    another stream's name and is not drawn). Each is its own main card:
    choosing one lights its basin, not the whole group. Batch 9: in the
    Meghna system, the Tetulia of Barishal («তেতুলিয়া (বরিশাল)», the book's
    spelling with BWDB's bracket; only its lowest 18.1 km, Dashmina to
    Galachipa, is named in OSM, so it is unjoined), the Burishwar (the Payra;
    BWDB's list names the river «বুড়িশ্বর-পায়রা/ পায়রা»; unjoined — it rises
    from the Karkhana, not drawn) and the Mogra (the books' «মোগরা», BWDB's
    «মগড়া», matched by geometry — from the Dhalai at Purbadhala to the Ujan
    Dhanu at Itna — in two pieces joined by a 9.9 km connector; unjoined at
    its mouth, as the Dhanu is not drawn); in the Padma system, the
    Kirtankhola, the Arial Khan's distributary (BWDB), trimmed to begin at the
    Arial Khan's last node and ending in Barishal city, where OSM's name
    becomes «সুগন্ধা». Left out: the Shahbazpur (OSM draws the channel east of
    Bhola as the Meghna, already drawn) and the Lohalia (no named way).
    Batch 8, all in the Padma system: the Rupsa (from the Bhairab's end in
    Khulna to the Pashur's start, shared nodes; B910's «ভৈরব বা রূপসা» is its
    other name, BWDB keeps the two apart), the Pashur (two pieces, 363 m
    apart, to the sea at Koyra; since the user's decision 3 after Stage 3 a
    main card of its own, B910 পৃ. ৬১ listing it among the main rivers), the
    Ichamati («ইছামতী (চুয়াডাঙ্গা)», BWDB's
    «ইছামতি-কালিন্দি», matched by geometry: it begins on the Mathabhanga's
    last node, where BWDB's Mathabhanga ends; drawn solid, as the Feni, since
    split at the border it falls into some 130 pieces), the Harinbhanga
    («হাড়িয়াভাঙ্গা»; mostly in India, dashed; unjoined, the user's decision 5
    after Stage 3, though the Ichamati is 8.3 km off: BWDB has it rise from
    the Raimangal, which is not drawn) and the Baral (from the Padma
    near Charghat on to the Jamuna at Bera, as OSM names it; the drawn Atrai
    ends on it, its join unchanged). Left out: the Haringhata (no named way;
    drawing the Baleshwar in its place would substitute one river for
    another).
- **The legend** lists the kinds the current system draws — its line roles
  and its markers' kinds — so it shrinks to what the lit colours mean (at
  320 px with a card open the stage is under 300 px tall).
- **Line roles:** `main`, `tributary`, `distributary`, `continuation`,
  and `disputed` (Stage 2, the user's rule b): a river the two books give
  different roles is drawn violet (#7e57c2), neither role's colour, and the
  legend names it «সম্পর্ক নিয়ে বইয়ে ভিন্নমত» (the user's wording, Stage 3
  decision 3); its «সম্পর্ক» row is null and ⓘ gives both books' words. Which end of a line meets its parent is its mouth for a
  tributary, its head for a distributary or for a main river's later piece;
  a `disputed` line says which (`join.end`), as its course decides.
- **River systems** (Stage 1, the user's decisions of 2026-09-29): the data
  lists `systems`; every frame line and marker carries its `system`, every
  line its card (`entity`; one card may have several lines). One system is
  current — the first the frame draws, until a card of another is chosen.
  Its lines, markers and names are drawn in full; every other system's lines
  are thin and grey (`.other`, the continuation's look), beneath the
  current one's, still tappable, with no markers; only their main river's
  names show, grey and placed as a continuation's. Choosing a main river
  lights its basin — every line whose parents lead to it (`basin`, built,
  held by the validator): the whole system where the system has one main
  river, that river and its branches in a group of rivers that each reach
  the sea (Stage 3); a branch lights its own lines. So the Jamuna
  system looks as it did in the pilot, with the Padma system's lines grey.
- **The main line** ends at the Padma confluence (the book): Natural Earth's
  line to OSM vertex 60, OSM from there. The seam is 39.7 m at 95.14°E; OSM's
  Assam head is dropped. Piece 0 in the Bangladesh frame is dashed — it runs
  outside COD-AB's border — and piece 1 solid.
- **The border-entry marker** stands where the drawn line first crosses
  COD-AB's border, 25.7319°N 89.8272°E, on way 232252698 between vertices 47
  and 48 — snapped there (the user's decision, 2026-09-29) from BWDB's point
  in Nageshwari, 24.4 km north, which lies 6.9 km west of the drawn channel:
  upstream of the crossing, OSM's channel (ways 910696546 and 232252698) runs
  31 km along the line on the India side, 0.5–7.4 km east of the border. The
  seed keeps BWDB's point as `snappedFrom`, with the offset. COD-AB puts the
  crossing in Ulipur upazila, Kurigram. The «প্রবেশস্থল» row, on the main
  river's card and the marker's, is the book's «কুড়িগ্রাম জেলা» alone; ⓘ
  carries one plain line, the user's wording (the marker's `infoBn`): JRCB's
  and BWDB's Nageshwari, and that COD-AB puts the drawn crossing in Ulipur.
- **Connectors** (the user's rules, 2026-09-29: 10 km, then 12 km for the
  Dhaleshwari alone, then from Stage 1 "gaps over 12 km stay unjoined" for
  every line): where a tributary's mouth or a distributary's head, as drawn,
  lies more than 50 m and at most 12 km from its drawn parent (`join.parent`;
  the reach above, where a river is drawn in reaches), the build adds a
  straight connector from that end to the parent's nearest point — the
  Dharla (2,573 m) and the Teesta (3,011 m) to the main line, the
  Shitalakshya (145 m, a gap the Old Brahmaputra's simplified line opens),
  the Dhaleshwari's head (11,385 m); the Arial Khan's lower reach (6,636 m),
  the Mahananda's middle reach (11,285 m) and its last reach (92 m, a gap the
  simplified Padma opens), the Bhagirathi to the Ganges (7,393 m) and between
  its reaches (407 m). They are `connectors` in the frame (id, parent,
  length in m, path data), never part of the sourced lines, drawn in the
  river's own group — its colour, width and highlight — with no tap zone.
  Unjoined, each with its reason in the seed (`exempt`): the Karatoya
  (17.6 km), Atrai (47.0 km), Banshi (31.0 km), the Madhumati (12.2 km from
  the Gorai; the course between is unnamed in OSM) and the Mahananda's upper
  reach (76.6 km, leaving the picture in India); an unjoined line may end
  outside the frame. The Dhaleshwari's mouth, 3.1 km from the drawn Meghna,
  has no connector. One ⓘ line names the connected rivers; one each gives
  the Jamuna's and the Padma's unjoined gaps.
- **The cards** (Prompt 40, the user's decisions of 2026-09-29): a tributary's
  or distributary's card gives «সম্পর্ক», «উৎপত্তি», «গতিপথ», and «মিলনস্থল»
  for a river that joins the main one or «পতিত স্থল» for one that falls into
  another (the Karatoya, Atrai, Dhaleshwari, Banshi, Shitalakshya and Old
  Brahmaputra); the Dhaleshwari keeps the book's «শাখা নদী» row (বুড়িগঙ্গা).
  The main river's card keeps its rows and gains «গতিপথ». Each value is the
  first in the source order — the books («ভূগোল ও পরিবেশ» before «বাংলাদেশ ও
  বিশ্বপরিচয়»), BWDB and JRCB, Bengali then English Wikipedia, newspapers,
  Banglapedia — in its source's words; a card follows its source's words
  where they differ from the drawn line. The Karatoya card is BWDB's NW-14,
  the river drawn. The Meghna has no card yet. Wherever a card
  names «দেওয়ানগঞ্জ» with «ময়মনসিংহ জেলা» (the main river's and the Old
  Brahmaputra's «গতিপথ», the Old Brahmaputra's «উৎপত্তি»), the note «(বর্তমানে
  জামালপুর জেলা)» follows it.
- **The Padma system's cards** (Stage 1 decisions 2, 3 and 8): the NCTB book's
  value first; a differing BWDB or JRCB value in ⓘ with both citations;
  **where the two books disagree, the row is null (pending) and ⓘ gives both**
  — the Padma's «প্রবেশস্থল» and «গতিপথ» (Kushtia vs Chapainawabganj), its
  «শাখা নদী», and the Bhagirathi's other name (one river «ভাগীরথী (হুগলি
  নদী)» vs two). The Padma's length is null, as the Jamuna's: which stretch
  is «পদ্মা» differs even inside B-GEO (BWDB 121 km Daulatdia–Chandpur,
  230 km for the Ganges reach). Where the books are silent, BWDB stands, then
  JRCB: the Gorai (SW-24), Madhumati (SW-74) and Arial Khan (SW-2), each
  matched by district; the Mahananda's origin and course are JRCB's (row ১৪,
  the whole river), its confluence BWDB's NW-95 (Debinagar; JRCB's Godagari
  in ⓘ). A BWDB entry is matched to a drawn river only by geometry or
  district. River names follow the book's spelling («মধুমতী», not BWDB's
  «মধুমতি»); the Mahananda's course spells the upazila «তেঁতুলিয়া», as BWDB
  does, where JRCB printed «তেতুঁলিয়া» — one ⓘ note gives both spellings
  (decision 3: never correct a source silently). The Padma's «মিলনস্থল» is the
  Jamuna card's value, «দৌলতদিয়ার কাছে (গোয়ালন্দ উপজেলা)».
- **Rules for every card** (the user's decisions of 2026-09-29, after Stage 1):
  1. A conflict is a different place or a different number. Wordings of one
     place («দৌলতদিয়ার কাছে» / «গোয়ালন্দে»; «চাঁদপুরের কাছে» / «চাঁদপুরে»)
     are not: the card keeps the cautious «…র কাছে» with the upazila in
     brackets (the Padma's mouth: «চাঁদপুরের কাছে (চাঁদপুর সদর উপজেলা)»), and
     ⓘ gives the other wording.
  2. The Padma's length stays hidden, like the Jamuna's; ⓘ gives 121 km
     (Daulatdia–Chandpur, BWDB NC-32) and 230 km (the border at Shibganj to
     Daulatdia, BWDB NW-27; JRCB's Ganges in Bangladesh), each with its reach.
  3. A spelling is never corrected silently: the card keeps one source's and ⓘ
     notes the other's.
  4. The book's value on the card, a differing BWDB/JRCB value in ⓘ; where
     the two books disagree, the field is null and ⓘ gives both. Where they
     give a river different roles, the «সম্পর্ক» row is null, ⓘ gives both
     wordings, and the line is drawn in the neutral role style the legend
     explains.
  5. Same-name rivers get distinct ids and a bracketed district or system in
     the picker, from the cited sources; a BWDB entry is matched by geometry or
     district only.
  6. The new tabs and the Padma's «পুরো পথ» frame come in the final stage.
- **Rules from Stage 3's decisions** (the user's, 2026-09-29):
  1. No swap by inference. A river is drawn under another name only when a
     cited source — the BWDB list or an NCTB book — states the two are one
     river, and then under that source's name with that citation; an
     encyclopaedia saying so is not enough. So the Chingri stays out (BWDB's
     list has only EH-5 «চেঙ্গী», other name «চেঙে»; bn Wikipedia's
     «চেঙ্গি নদী বা চিংড়ি নদী» does not count), and ⓘ names it as not drawn.
  2. What lies outside the Bangladesh frame is not drawn in it: the
     Karnaphuli's upstream in Mizoram waits for Stage 4 (below).
  3. The violet style's legend wording is «সম্পর্ক নিয়ে বইয়ে ভিন্নমত».
  4. The Kushiyara's other names stay pending.
  5. Where BWDB and JRCB word one origin differently (the Manu and the
     Khowai: BWDB «ভারত», JRCB «ভারতের ত্রিপুরার পাহাড়» and «… পূর্বাঞ্চলের
     পাহাড়», as printed), BWDB's goes on the card and JRCB's in ⓘ.
  6. Every bracketed picker name has an ⓘ line naming the other rivers of
     that name in BWDB's river list and which one is drawn, cited to the list
     (`bwdbList`, the list page's JSON, SHA-256 a8f58942…) and the drawn
     river's own BWDB page.
- **After Stage 3's acceptance** (the user's decisions and fixes, 2026-09-29):
  1. The Nagar stays out; the one not-drawn ⓘ note names it (B-GEO's text
     points to NW-65, both book maps label NW-66). The user checks the book.
  2. The south-east rivers and the Karnaphuli are one picker group,
     «দক্ষিণ পূর্বাঞ্চল», B910 পৃ. ৬২'s region (above); the Karnaphuli system
     keeps its id, the south-east group's file is gone, and its extract was
     renamed `…-karnaphuli-b6.geojson` (bytes and SHA-256 unchanged). The
     `basin` field is approved.
  3. The Pashur is a main card (its own basin, no relation row); BWDB's
     relation — the Kazibachha's lower reach — is in ⓘ.
  4. «বুড়িচর» (B-GEO's map, where B910 has «বুড়িশ্বর»): no river or unit of
     that name in BWDB's list, the pinned COD-AB layers (upazilas; no unions)
     or Banglapedia, so the name is not adopted; ⓘ says so. The Mogra and
     BWDB's «মগড়া» are spellings of one name, matched by geometry and
     district; both spellings in ⓘ, both OSM pieces drawn.
  5. The Harinbhanga is unjoined though the Ichamati is 8.3 km off: the
     build and the validator each hold the one list of lines unjoined by the
     user's decision (`UNJOINED_BY_DECISION`), which get no connector. (`exempt`
     alone means no join point, with a connector where one is under 12 km —
     the Dhaleshwari.)
  6. Border rivers — the Feni, the Naf, the Ichamati — are drawn solid outside
     Bangladesh; one ⓘ line says so.
  7. The Shahbazpur and the Haringhata stay out (no relabelling of the
     Meghna, no substitution of the Baleshwar); the one not-drawn note names
     them with the Baulai, Dhanu, Boalkhali, Rankhiang, Chingri, Lohalia,
     Kulik and Nagar.
  8. «বরিশাল নদী» keeps its single Banglapedia citation; the Tetulia's 18 km
     drawn reach keeps its ⓘ line.
  Text conventions (every card and ⓘ line, every stage):
  a. An other name that is a river with its own card is pending, with both
     views in ⓘ: the Bhairab's «রূপসা» and the Rupsa's «ভৈরব» (B910: one river
     «ভৈরব বা রূপসা»; BWDB: two).
  b. A picker bracket (corrected in the Task 1 pass): the bracket of BWDB's
     own page name where it has one — «কুমার (চুয়াডাঙ্গা)» (SW-10's local
     name), «চিত্রা (চুয়াডাঙ্গা)», «তিতাস (ব্রাহ্মণবাড়িয়া)», «তেতুলিয়া
     (বরিশাল)»; else the district of origin — «ভৈরব (চুয়াডাঙ্গা)» (Darshana),
     «তেঁতুলিয়া (দিনাজপুর)» (not drawn); or, for a river rising outside
     Bangladesh, the district of entry — «ইছামতী (চুয়াডাঙ্গা)», «পাগলা
     (চাঁপাইনবাবগঞ্জ)».
  c. «কি.মি.» in card rows, «কিলোমিটার» in ⓘ sentences; a long ⓘ line is split
     into sentences.
  d. Place names use the pinned Bengali admin list's spelling where a source
     differs only in spelling (`tools/sources/bangladesh-names.json`, from
     bangladesh.gov.bd: divisions and districts only — no pinned list holds
     upazilas or unions, so those keep the source's spelling, except the
     user's «দামুড়হুদা»). River names keep their source's spelling.
  e. «OpenStreetMap-এর তথ্যে», never «ডেটায়»; «সরকারি প্রশাসনিক সীমানার তথ্য
     (COD-AB)».
  f. Kaptai: «কাপ্তাই একটি হ্রদ, এই ছবিতে হ্রদটি আঁকা নেই».
  g. Editorial rule (Task 1 pass): obvious typos and spacing in quoted common
     words are corrected («বাংলাদশের», «পূনরায়», «বাংলাদেশ প্রবেশ করে»,
     «প্রবাহিত হয় সাতক্ষীরা», «পুর্বাঞ্চলের», «পার্বত্যঞ্চল», «মধ্যদিয়ে», a
     space before a comma); names never. Card rows quote whole clauses: the
     Mathabhanga, Ichamati, Harinbhanga, Pashur, Mogra, Feni, Punarbhaba,
     Tangon, Naf and Baral courses were rewritten; the Matamuhuri's course is
     pending with BWDB's full sentence in ⓘ; the Harinbhanga's border
     statement is B-GEO's whole sentence in ⓘ. The Tetulia of Dinajpur is in
     the not-drawn note. `tools/verify.mjs` fails a space before , ; । or a
     doubled space in any served Bengali string.
- **Stage 4, the final stage** (collected here as decided):
  - the new tabs, and the «পুরো পথ» frame for the Padma;
  - in «পুরো পথ», the Karnaphuli's upstream in Mizoram, dashed, with an ⓘ
    line citing Bengali Wikipedia that the Khawthlangtuipui is the
    Karnaphuli's upstream (the user's decision 2 of Stage 3); never in the
    Bangladesh frame.
- **Kaptai** (decision 4): no line and no card; one ⓘ note that B910 names it
  a Karnaphuli tributary while our maps show it as a lake.
- **A marker's card names only what COD-AB agrees with** (the user's policy,
  as for the entry): a marker's row keeps the part of its place — upazila or
  district — that contains the drawn marker, and the source's full wording
  goes to a plain ⓘ line with the drawn location. The Teesta's mouth, drawn in
  Gaibandha Sadar, shows «গাইবান্ধা জেলা»; BWDB's Sundarganj is in ⓘ. The
  build holds it (`teestaConfluence in Gaibandha district`). Rows with no
  marker (the origins and mouths of the unjoined and distributary lines)
  follow their sources.
- **ⓘ,** after the cited sources and the entry line, carries the seed's
  `infoBn.lines` as plain text, each citing its sources: the two lines on the
  drawn joins (the user's words), where COD-AB puts what a source places
  otherwise (Dewanganj in Jamalpur; the Karatoya's and Banshi's drawn lines
  beginning in Gaibandha and Tangail), the Karatoya from India (NW-13) that is
  not drawn, and one line per source conflict, the card's value first.
  Research for these cards: `tools/.cache/bangladesh-rivers/review2.csv` and
  `quotes.md` §6. Its Bengali lines are 14 px (`rivers.css`), not the
  credits' 12 px; the panel scrolls within 60 % of the screen (`style.css`).
- **The picker row** is the shell's, at the top, one line: a native select of
  the cards the tab draws, grouped by system (`<optgroup>`) where there are
  two or more; ⓘ in its own row under it.
  A tap on a line or a marker opens its card; a marker's heading is composed
  «name — legend word». The legend lists only the kinds a tab draws. ⓘ carries
  every cited source and OpenStreetMap's credit, as plain links.
- **Names on the picture** are at least 15 px at 390 px wide (14 at 320),
  semi-bold, put beside their anchors where no other name, marker, the legend
  or ⓘ's tap zone is. A hidden marker (another system's) blocks nothing.
  Every river name gives way (Stage 2, with 46 lines): one that finds no spot
  clear of the other names, the legend, the reset control and ⓘ's zone is not
  drawn at that view, and zooming in brings it back — names never overlap and
  never shrink (the user's label rule). The placing order decides who gets
  the room: the current system's main river first, then the lit branch (a
  card open), the other branches, the other systems' grey names, countries,
  districts. A name is positioned by its box as drawn, after its lines are
  aligned. Pinch and pan run 1×–6× on «পুরো পথ» and 1×–8× on
  «বাংলাদেশে», in this module only. River strokes (2026-09-29, 35 % thinner):
  main 2.9 px, tributary and distributary 2 px, continuation 1.3 px.
- **Districts** (the «বাংলাদেশে» tab, the user's decisions of 2026-09-29):
  thin light-grey boundaries (0.5 px) behind the rivers, drawn from the shared
  `docs/shared/bangladesh-districts.json` (resolver kind `sharedData`, so a
  device caches it once for every diagram that reads it); and a grey name, at
  the river names' size, for each district a system's tappable lines run
  through for at least 0.5 km, standing per system (`systems` on each label:
  `always` or `zoom`) — those holding the system's marker from the opening
  view (the Jamuna's Kurigram, Gaibandha, Rajbari, Narsingdi; the Padma's
  Rajbari, Chapainawabganj, Chandpur), the rest from 2×; a district no line
  of the current system crosses is not named.
  Each name's anchor, chosen by the build, lies inside its district near the
  river and away from the markers and the rivers' names (`BUSY_KM`); at run
  time a name sits on it or on a ring round it, its middle inside its
  district, and one that cannot be placed clear of others is dropped at that
  zoom. The marker districts' names are placed first, before the rivers'.
  COD-AB has no Bengali names, so the names are the Bangladesh basemap's
  (bangladesh.gov.bd, `tools/sources/bangladesh-names.json`). One ⓘ line says
  the districts are today's, per COD-AB.
- **ⓘ** is three headed blocks (`creditGroups` in the data; `group` on each
  plain line): «সূত্র» (the sources and the font), «ছবি সম্পর্কে টীকা» (the
  notes), «উৎসগুলোর অমিল» (the source conflicts), each item on its own line.

## Inputs, all pinned

- **Editor's seed,** split per system (Stage 1): the common file
  `data-sources/bangladesh-rivers/bangladesh-rivers.seed.json` (the page's
  words, the sources, the countries, the frames' specs, ⓘ's lines, the
  `review`) and one file per system, `systems/<id>.seed.json` (its lines
  with way ids, trims and joins, its markers, cards, names and label anchors,
  its frame lists, and `geometry.extract`), merged by
  `tools/lib/rivers-seed.mjs`, which refuses a duplicate id and anything but
  one Jamuna main recipe. Systems are keyed by stable ids (`jamuna`,
  `padma`, `meghna`). Each file's SHA-256 is pinned in
  `tools/verify-descriptor.mjs`: common `25d60c66…`, jamuna `e84123ae…`,
  padma `7627ac1d…`, meghna `faf14e36…`. Before the split, the one file was
  `355c69af…46ad`
  (`2b3e3c57…` before the districts and the ⓘ blocks; `1c70b88a…` before the whole-Bangladesh frame; `08aff7d1…` before the Dewanganj notes and the Teesta district; `28856c9a…`
  before the Prompt 40 cards; `c14c8bb4…` before the entry row lost «নাগেশ্বরী উপজেলা»; `95090aa6…`
  before the entry marker was snapped; `a6e2e386…` before the
  Teesta mouth's provenance was corrected). NCTB books
  first, then the source order in CLAUDE.md; past exam questions are not used.
- **Geometry:** Natural Earth's rivers, land and boundary lines; COD-AB's
  Bangladesh outline; the OSM rivers snapshot `osmBangladeshRivers` and the
  OSM pilot extract `osmBangladeshRiversPilot` (way ids with node ids and
  tags, snapshot 2026-05-31, ODbL) — all in `tools/sources.json`. The pilot
  extract is `tools/sources/osm-bangladesh-rivers-pilot.geojson`, cut by
  `tools/extract-bangladesh-rivers-pilot.mjs` from the way ids the seed
  records, and only a deliberate re-run changes it. Each later system has its
  own extract, cut by `tools/extract-bangladesh-rivers-system.mjs <system>`
  from the system seed's `geometry.extract` (by way id, with node ids and
  tags; a way with no name, name:bn, name:en or wikidata tag is refused) into
  `tools/sources/osm-bangladesh-rivers-<system>.geojson`, pinned as
  `osmBangladeshRivers<System>`: the Padma's has 16 ways, snapshot
  2026-09-29T09:49:40Z, SHA-256 `d15c0028…`; the Karnaphuli's 8 ways
  (`61b86f20…`). A later batch of a system gets its own file, never a
  re-fetch of an earlier one: `geometry.extractBatches.<batch>` → `…-<system>-<batch>.geojson`,
  pinned as `osmBangladeshRivers<System><Batch>` (`tools/extract-bangladesh-rivers-system.mjs
  <system> <batch>`): the Padma's b2, 41 ways (`016d3bf6…`); the Meghna's
  b3, 6 ways (`eb26c514…`); the Meghna's b4, 29 ways (`fce48299…`; its
  group «evidence» holds the four unnamed «Gomati» relation members, the one
  group the tag rule exempts); the Jamuna's b4, the Buriganga's one way
  (`d31d584f…`); the Padma's b7, 17 ways (`a7c5e722…`); the Karnaphuli's
  b6, 33 ways (`670ba065…`; cut as the south-east group's own, renamed
  when the groups merged); the Meghna's b9, 11 ways
  (`6b7c9702…`); the Padma's b9, 1 way (`8de7f900…`); the Padma's b8, 22
  ways (`b456037a…`). The extractor refuses an Overpass answer whose
  data is more than two days old: a mirror once served a May snapshot with
  older way versions. A way in two
  files must agree within 1 m.
- **Research,** outside git: `tools/.cache/bangladesh-rivers/`.

## How it is built

- **`tools/build-diagram-bangladesh-rivers.mjs [out]`** writes `descriptor.json`,
  `data.json`, `frame-whole.json` and `frame-bangladesh.json` into
  `docs/diagrams/bangladesh-rivers/` (172 KB together: data 41 KB, the
  Bangladesh frame 103 KB) — one data file, and one frame per tab, loaded
  when the tab opens; a second build writes
  the same bytes. Each river is one chain of features, refused if it branches,
  loops or has a gap over 3 m. The frames are SVG path data in the frame's own
  units, one flat projection per frame that `tools/lib/rivers-frame.mjs`
  shares with the validator.
- **The geometry pins,** one hash per line, in
  `tools/bangladesh-rivers-pins.json` (36 lines: the pilot's 11, the Padma
  system's 10 from Stage 1, from Stage 2 the Karnaphuli system's 5 (b5),
  the Padma south-west's 10 (b2), the Meghna core's 5 (b3; the pinned
  `meghna` line changed role, not ways) and batch 4's 5; from Stage 3 the
  Mahananda's tributaries' 3 (b7), the south-east rivers' 8 (b6) and the
  estuary batch's 5 (b9) and the south-west coast's 6 (b8); 68 in all, no
  earlier pin has moved). A build whose line moved stops and says so; it is never
  re-pinned to pass. A main river drawn as several lines must run end to end
  within 3 m (`gangaPadma→padma` 0.6 m), or a later piece joins the one
  before as a branch joins its parent (`join.parent`): by a connector up to
  12 km, or unjoined with the seed's reason (`karnaphuliUpper→karnaphuli`,
  14.6 km across Kaptai Lake).
- **The view,** `docs/visual/rivers.js` and `rivers.css`, is loaded only for a
  view of type `rivers` (one line in `VIEW_MODULES`). It reads only the
  diagram's own JSON through the resolver.

## What is checked

- **`node tools/verify-descriptor.mjs`** — the descriptor, the data against the
  seed (every Bengali string shown is the seed's or a heading composed from
  two of its own), the frames, every branch card's four rows and the main
  card's «গতিপথ», ⓘ's plain lines each citing a listed source, the picker
  grouped by system, the pending list (the fields the seed holds as null,
  listed by name in the validator; 48 after Stage 3 and its Task 1 pass (the
  Matamuhuri's course) — Stage 2's 32, the
  Pagla's, Kirtankhola's and Rupsa's course, the Bhairab's and the Rupsa's
  other names (fix a), the Muhuri's other names and course, the Sangu's
  course, the Matamuhuri's entry, the Tetulia's (Barishal) relation, other
  names and course, the Burishwar's relation and course, the Harinbhanga's
  relation: the Jamuna's length;
  the Buriganga's course; the Padma's entry, course, length and
  distributaries; the Gorai's, Madhumati's and Chitra's course; the
  Bhagirathi's other name; the Meghna's length, tributaries and
  distributaries; the Barak's relation, entry, course and end; the Surma's
  relation and origin; the Kushiyara's relation, other names and origin; the
  Titas's relation; the Manu's and Gumti's relation and course; the Khowai's
  course; the Karnaphuli's length and tributaries; the Kasalong's and
  Halda's course).
- **`node tools/verify.mjs`,** its bangladesh-rivers section, reading the pinned
  sources by checksum:
  - a. every marker, its source coordinate projected with the picture's own
    projection: within 1 px at the frame's scale and 500 m on the ground;
  - b. every tributary and distributary: its parent-side end within 50 m of
    its parent line as drawn, or of a connector (one straight segment, at most
    12 km) that starts at that end and ends on the parent line; the list of
    connectors is printed. Karatoya, Atrai, Banshi, Madhumati, the
    Mahananda's upper reach, the Mathabhanga, the Bhairab's Jashore reach,
    the Nabaganga's two lower reaches, the Chitra's lower reach, the
    Karnaphuli's lower reach and the Kasalong stay unjoined, each with its
    reason in the seed;
  - c. the entry marker on COD-AB's border (500 m), and BWDB's point it was
    snapped from;
  - d. the main river one connected line, gaps 0 m, no duplicate segment, no
    self-crossing, nothing outside the frame; every other system's main river
    its main lines end to end in the Bangladesh frame (500 m);
  - e. every drawn line and marker traced to an id in the pinned sources, by
    way, node, vertex or — the entry — the way segment that crosses COD-AB's
    border; and the build reproduced byte for byte;
  - f. the entry marker within 500 m of the drawn main line, and of the
    point where the line turns from dashed to solid, in both frames;
  - g. every labelled district crossed by a drawn tappable line, every name's
    anchor inside its district as COD-AB draws it, every district holding a
    system's marker labelled from the opening view when that system is
    current; and the shared district file
    rebuilt by `tools/build-bangladesh-districts.mjs` byte for byte.
- **`node tools/check.mjs bangladesh-rivers`** — its rivers branch, `riverSteps`,
  takes each tab in turn: the picker's entry, then every line and marker
  tapped at a point where its zone alone takes the tap, its card's heading the
  zone's; a marker's zone 44 px across; the layout (names on the stage, clear
  of each other, the picker row and the card) with no card and with each; and
  ⓘ opened (a shot), on the screen, scrolled to its last line, closed again.
  Zones are tapped one system at a time; a zone off the view, or never alone
  under the finger there, is first framed by choosing its river in the
  picker, then zoomed in about its middle (the wheel, up to three times), as a
  user would. The taps sheets are one per system (`<size>-taps-<system>.png`).

## Where decorations may go

None are drawn (the user: none from their model now). If some come, they are a
separate, approved change:

- a layer inside the art group of the frame file, **between the land and the
  rivers**, so it pans and zooms with the ground; placed by longitude and
  latitude through the frame's projection, never by pixel;
- images pinned as art inputs in the seed, cut by a diagram art tool from the
  approved masters as atmosphere-layers' are;
- `pointer-events: none`, never over a tap zone, a marker or a name — the
  layout check would hold it clear;
- a new descriptor term, so it needs the user's approval first.

## Decisions to keep

- The Jamuna ends at the Padma confluence; no sea-mouth marker.
- The entry marker sits on the drawn line at its border crossing, not at
  BWDB's point. The cards give only the book's «কুড়িগ্রাম জেলা»; Nageshwari
  (JRCB, BWDB) and Ulipur (COD-AB) are in ⓘ.
- The Teesta is a tributary of the Brahmaputra, as the books have it; its
  card and marker say «গাইবান্ধা জেলা», the district of the drawn mouth, and
  BWDB's Sundarganj (679 m away) and JRCB's Fulchhari are in ⓘ.
- No Old Brahmaputra offtake marker: the book (Dewanganj) and BWDB (Fulchhari)
  name different places.
- «শিয়াং» and «দিহাং» are on the main river's card only, never on the picture.
- The origin marker is Natural Earth's line start (82.40°E); Bengali Wikipedia
  gives 82°0′E, and both are recorded.
- The Padma system's markers: the Jamuna meeting (the Jamuna marker's point,
  in Goalanda), the Mahananda confluence (the drawn mouth, in Chapainawabganj
  Sadar, as BWDB) and the Padma's mouth (the drawn junction with the Meghna,
  in Chandpur Sadar). No marker where the receiving river is not drawn (the
  Arial Khan's Kalabadar, the Madhumati's Sholdaha) or where the drawn line
  stops short (the Gorai, the Madhumati).
- «পুরো পথ» stays the Jamuna's until the three new tabs and a per-system
  whole-course frame are built (decision 1); the Padma's Ganges is pinned only
  from the Bangladesh frame's west edge.
