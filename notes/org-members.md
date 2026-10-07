# org-members — «আঞ্চলিক ও আন্তর্জাতিক সংস্থার সদস্য দেশ» (proposed title)

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map
under International, **live since 2026-10-07** (the user's «Home page এ
তুলুন»): built into `docs/maps/org-members/`, listed in `docs/registry.json`
with its descriptor's titles and no caption, out of `tools/wip.json`. Until
then it was work in progress, built into the local preview only. The
research behind it is `tools/.cache/org-members/investigation.md` (ORG-1),
out of git.

## The user's rule for this map (2026-10-06)

- Every fact comes from the organisation's own official website, or the
  official government site of its current presidency where it has no
  secretariat, and from the latest such page.
- No textbook, NCTB or any other book, is used or mentioned on the map: not
  as a source, not in ⓘ, not as a citation for a Bengali name.
- Bengali organisation names are the user's, dated 2026-10-06, cited to that
  decision.

## Commits

A tool's own co-author trailer is allowed. The user's personal e-mail must
never appear in a commit, a file or a request.

## The user's decisions (2026-10-06)

1. A new map, `org-members`, under International; in `tools/wip.json` only.
2. The UN is dropped.
3. **Geometry follows Bangladesh's view, as org-headquarters does**: Taiwan
   inside China, Israel inside «ফিলিস্তিন অঞ্চল» (PSX), Abyei uncoloured.
4. **Non-country members are card rows only, never coloured**: the EU and the
   AU in the G20, Chinese Taipei in APEC, observers that are organisations.
   Hong Kong has its own shape (HKG), so it is coloured as an APEC member.
5. **Statuses only as each organisation's own page states them**
   (suspended, observer, partner, candidate, dialogue partner). No AU
   suspensions for now.
6. Approved, not built yet: three opt-in shell terms — a country picker,
   opening on Bangladesh's card, a legend that follows the chosen
   organisation.

## Step 1 (2026-10-06): sources, seed, strings — nothing drawn

- 18 organisations: SAARC, BIMSTEC, AU, EU, OIC, Commonwealth, OPEC, NATO,
  SCO, D-8, APEC, ECO, Arab League, IORA, and from the retry ASEAN, GCC, G7
  and G20.
- **BRICS is left out.** Its 2026 chair's site, `www.brics2026.gov.in`, does
  not resolve over IPv4 from here (SERVFAIL; the machine has no IPv6 route),
  in Node and in Edge alike; the Ministry of External Affairs' BRICS pages
  return 404. No other official page was used.
- **ASEAN and GCC** were read in headless Edge, launched as
  `tools/check.mjs` launches it, with the repo's User-Agent
  (`--user-agent` and `Network.setUserAgentOverride`): both sites answer a
  plain fetch with a script challenge.
- **G20**: g20.org, the US presidency's site, refuses our User-Agent even in
  Edge ("Exception: forbidden"); the Federal Register serves a CAPTCHA to it.
  The members come from the same Federal Register notice of the US host year
  (7 January 2025) as govinfo.gov, the US Government Publishing Office,
  publishes it.
- **G7**: France's Ministry for Europe and Foreign Affairs, the 2026
  presidency (page updated 22 July 2026); the EU is its non-country row.
- **SCO**: its page of 6 March 2026 keeps two observers and 15 dialogue
  partners; a decision of 1 September 2025 replaces both with one partner
  status, but the current holders keep theirs until the amendments enter
  into force. The seed keeps the page's two statuses and cites both facts
  (`stated.reform`, `stated.retain`); ⓘ says so.
- **OPEC**: its members page still answers 403; the 12 come from its own home
  page's menu.
- **Commonwealth**: its page writes Nauru as «Naoero» (cited as written).

## Sources and quotes

- Every page is pinned twice: by size and SHA-256 in the seed's `sources`
  and in `tools/sources.json` (`orgMembers`), both checked by
  `tools/verify.mjs`.
- Its text is `tools/lib/html-text.mjs`'s, made from the cached page and
  pinned the same way. That module drops scripts, styles and the head, turns
  block ends into line breaks, decodes entities, collapses each line's white
  space and replaces every e-mail address.
- Each member, status, non-country row and stated count is a `cite`:
  `{ source, offset, length, sha256 }`, in UTF-16 units of that text.
  - No words are committed. Most of these sites reserve their rights, so
    only facts are taken (`terms` in the seed).
  - `verify.mjs` slices each quote again and hashes it. It also checks that
    no tracked file holds a stated-count sentence.
- **EU**: CC BY 4.0, credit given and changes indicated. The credit line is
  in the seed (`terms.eu-cc-by.credit`) and in ⓘ.
- **Other terms**:
  - NATO asks for a credit and no sale or advertising.
  - APEC asks for a credit, non-profit and unmodified use.
  - The AU and the Commonwealth reserve reproduction.
- `tools/fetch-sources.mjs` downloads the fetched pages into
  `tools/.cache/org-members/sources/`. A page that has changed is not cached,
  and the run names it: the re-check is due. The three browser pages are not
  downloaded there.
- **As of** 2026-10-06 (retrieved) for every organisation, with the page's
  own date where it shows one.
- **Re-check (ORG-1)**:
  - after each summit and at least quarterly: AU, SCO;
  - every 6 months: ASEAN, EU, NATO, Commonwealth, OPEC;
  - yearly: the rest.

## Shapes (Bangladesh-view countries file, ADM0_A3)

- All 173 countries named have a shape.
- **Shapes that hold another territory** (`geometry.absorbs`):
  - PSX holds Israel (OIC, Arab League);
  - CHN holds Taiwan (SCO, APEC, G20, IORA dialogue partner);
  - SOM holds Somaliland;
  - CYP holds Northern Cyprus and the UN buffer zone (EU, Commonwealth;
    the Turkish Cypriot State, an OIC and ECO observer, is a card row only);
  - IND holds Siachen;
  - KAZ holds Baikonur.
- PSX overlaps no other shape: 0 of 25,595 grid points at 0.01°. No list
  names Israel.
- FRA includes French Guiana, Réunion and Mayotte, so the EU and IORA colour
  them.
- **Geometry file**: org-headquarters' `countries.geojson` holds its 42 host
  countries; 133 of these 173 are not in it. It cannot be reused without
  changing a live file. A separate file at org-headquarters' simplification
  (5 km, 3 decimals) is 750,319 bytes, 257,612 gzipped.

## Latest source check (2026-10-06)

Every pinned page was fetched again. The membership text is unchanged for
all 18. Where the raw bytes moved, the normalised text did not, apart from
a visitor counter (BIMSTEC, GCC). No list or status changed, so nothing was
re-pinned.

- NATO's member page is still "Updated: 11 March 2024", still 32. Its
  enlargement page names Sweden (7 March 2024) as the latest.
- G7's presidency page is still updated 22 July 2026. An Élysée statement
  of 25 September 2026 names the same seven and the EU.
- SCO's pages of 6 March 2026 are unchanged. A secretariat note of 10 July
  2026 confirms Laos as the fifteenth dialogue partner, already listed. The
  2025 partner reform has not replaced the two statuses on those pages.
- G20: g20.org and the State Department release of 18 December 2025 both
  refuse this User-Agent, in a fetch and in Edge. The pinned govinfo notice
  (7 January 2025) is unchanged.
- ASEAN and GCC were read again in Edge. ASEAN's eleven are unchanged;
  GCC's six are unchanged.

## Strings

57 Bengali strings, every one `approved: true`. 20 names are the
org-headquarters seed's, unchanged. The user's, dated 2026-10-06:
«জি-৭», «জি-২০», and plain «ইউরোপীয় ইউনিয়ন» (this map only;
org-headquarters keeps its own form). The Arab League stays «আরব লীগ».
Country names on cards will be the basemap's `name_bn`. Eleven non-country
rows have no Bengali name (`bn: null`).

## Step 2 (2026-10-06): drawn in the local preview only

`tools/build-org-members.mjs <out-dir>` writes the map into the preview copy.
Nothing under `docs/`. The three opt-in shell terms, this map only:

- `controls[].byTab` — the country picker. «সংস্থা» lists organisations;
  «দেশ» lists countries.
- `openOn` — on open, the «সংস্থা» tab, no organisation chosen, Bangladesh's
  card open.
- `legend.followsSelection` — the legend lists only the chosen organisation's
  statuses, and is hidden when none is chosen.

Tab labels «সংস্থা» and «দেশ» were `approved: false` (approved in step 2b). Country shapes are
simplified at 12 km (Douglas–Peucker), 110,749 bytes gzipped, with no
self-crossing and no country containing another's interior. A kept outline
stays within 12 km; a few islets (Chile's is the farthest) collapse.

## Step 2b (2026-10-07)

- **Shared code review** of 8005b75:
  - stamp-only: chips.js, globe.js, index.html and timeline.js in docs/shell/,
    and every file in docs/visual/;
  - real code, all opt-in: picker.js (`setItems`), app.js (`byTab`,
    `openOn`, card rows' `stacked`), info.js (the `sources` group),
    legend.js (`followsSelection`, `line.style`), tabs.js (calls
    `pickerForTab` only where it exists), style.css (rules under
    `html[data-map='org-members']`);
  - one line runs on every map: app.js sets `<html data-map="<id>">`,
    inert unless a stylesheet names the id;
  - `check.mjs --all`: every item stamp-only.
- **Tab labels** «সংস্থা» and «দেশ» approved by the user (2026-10-07). All 59
  Bengali strings are approved now.
- **Dots:**
  - Every country is a fill, tapped by its main part.
  - A country also has a 44 px tap target while its main part is under 44 px
    both ways at the current zoom (`dotUntil`, the zoom it reaches 44 px).
    171 of 173 have one at some zoom.
  - Drawn dots: only where a dot says something — the chosen organisation's
    members and statuses, or the chosen country. No grey dot for the rest.
  - The literal rule (a grey dot for every country under 44 px) would draw
    158 at the opening zoom against 139 before: at world zoom nearly every
    country is smaller than a finger. Opening now: 1 dot, Bangladesh's.
- **The chosen country:** a dark outline over a white halo, and its dot ringed
  dark. Bangladesh at opening, its card open; in «দেশ» whichever is chosen.
- **Frames:**
  - Each organisation's members the short way round the globe, the widest
    uncovered stretch of longitude left out (across the antimeridian where
    that is shorter; the east edge then past 180°).
  - The card at most 40% of the map (`sheetMaxHeight: 0.4`); every frame
    fits the room above it.
  - The map zooms out to −1 and past the world's height
    (`constraints.wholeWorld`, `notes/shell.md`): MapLibre otherwise holds a
    390 × 844 phone at z0.48, where 197° of longitude fit.
  - Zoom chosen at 390 / 320, before → after:
    - Commonwealth and G20 0.48 → −0.44 / 0 → −0.78;
    - IORA 0.48 → −0.34 / 0 → −0.68; APEC 0.48 → −0.23 / 0 → −0.57;
    - G7 0.48 → −0.07 / 0 → −0.4; OIC 0.48 → −0.03 / 0 → −0.37;
    - NATO 0.48 → 0.35 / 0 → 0.01;
    - the other 11 unchanged.
  - Every member's main part now lies in view above the card for all 18
    organisations (before, 15 of the Commonwealth's 56 were hidden at 390).
  - The opening is unchanged: z0.51 / z0.03.
- New opt-in shell terms, this map only: `sources.<id>.tapFilter` and
  `constraints.wholeWorld` (`notes/shell.md`).

## Step 2c (2026-10-07)

- **Approved by the user** (2026-10-07, on the step 2b report):
  - the dot rule — no grey dots at the opening; dots drawn only for the chosen
    organisation's members and statuses and for the chosen country; an
    invisible 44 px tap target on every country under 44 px at the zoom;
  - the opt-in shell terms `constraints.wholeWorld` and `tapFilter`;
  - `tools/check.mjs`: on a map with `tapFilter`, each country counts once
    per tab, reached by any of its targets.
- **Opening:** South Asia, Bangladesh in the middle of the room above its open
  card, its neighbours (India, Myanmar, Nepal, Bhutan, Sri Lanka) wholly in
  that room and its dot inside it. Before, the world's frame put Bangladesh's
  dot half off the right edge at 390.
  - One `view.fitBounds` box, derived in the build from Bangladesh's label
    point and the neighbours' main parts: centred on that point, a degree
    spare each side; 1.2 times as tall as wide in Mercator, so the width sets
    the zoom on a phone; its middle south of Bangladesh by a fifth of a map
    1.8 widths tall (320 × 640 is 1.71, 390 × 844 1.94), the card covering up
    to 40%.
  - Today's box: 67.14, −18.44, 112.8, 33.87.

## Open items

- **BRICS** stays out. Its 2026 chair's site, `www.brics2026.gov.in`, does
  not resolve over IPv4 from this machine (no IPv6 route), and the Ministry
  of External Affairs' BRICS pages return 404.

## Files

- `data-sources/org-members/org-members.seed.json`
- `tools/lib/html-text.mjs`
- `tools/sources.json` (`orgMembers`)
- `tools/fetch-sources.mjs`
- `tools/verify.mjs` (section "org-members: seed")
- Out of git, in `tools/.cache/org-members/`: `pin-fetch.mjs`,
  `browser.mjs`, `gen.mjs`, `spec.json`, `make-seed.mjs`, `shapes.mjs`, and
  the readable `quotes.json`.
