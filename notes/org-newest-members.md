# org-newest-members — «সংস্থার সর্বশেষ সদস্য»

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map under International,
**live on the home page since 2026-10-09 (GL-ORGN)**, built into `docs/maps/org-newest-members/`. The research is out of git in
`tools/.cache/org-newest/` — ORGN-1's `investigation.md` (77 organisations, their own sites only) and ORGN-2's
secondary readings (`sec2/`, `orgn2/`).

## The user's decisions (2026-10-09, ORGN-2)

1. **Shade only the newest member(s) and Bangladesh**; no full member lists.
2. **Newest = the latest admission, including a rejoin.** A rejoin is marked «পুনরায় যোগদান» and gets no ordinal;
   the card also gives the newest first-time member (AU: South Sudan). A suspended newest member is shown with
   «সদস্যপদ স্থগিত».
3. **Ties and year/month-only dates are shown as stated.** Up to 3 tied members get a pin each; more than 3 are
   shaded and listed in the card. No date at all → the organisation is held out.
4. **A site that answered 403, or whose robots.txt disallows us, is never fetched again, not even in a browser**
   (PCA, IPU, OECD, OPEC and AfDB included); their facts may come from the secondary tier. The fetch helper
   (`tools/.cache/org-newest/lib.mjs`) refuses those hosts itself and adds any new 403 or block page to the list;
   block pages are never saved.
5. **The main date is when membership took effect** (entry into force); the accession or deposit date is a second
   line in the card where it differs.
6. **ADB (newest: Israel) stays, in the card and the list only**, with no map pin — as the EU, the AU and Chinese
   Taipei are card rows only in org-members.
7. **OSCE, CARICOM, WHO, BIMSTEC**: read further; held out if still unproven.
8. **The 77 organisations and the excluded kinds are approved** (`investigation.md`, Part A).
10. **No «২ / ২৪» counter**: the picker row rule stands.

## The secondary tier (the user's decision, this map only)

For the 32 organisations ORGN-1 could not verify, PCA, IPU, OECD, OPEC and AfDB, and decision 7's four:
- Allowed sources: the joining state's own government site; the UN Treaty Collection or another official
  depositary or gazette record; Reuters, AP, AFP, BSS or a leading national daily, dated at the event; Wikipedia.
- Wikipedia is read at `/wiki/` with the repo's User-Agent — its robots.txt disallows the API paths (`/w/`, `/api/`)
  for generic agents — and cited by its revision id (`oldid` permalink), with the reference the article cites for
  that statement.
- Each fact (newest member, date, order, member count, Bangladesh's status) needs two agreeing sources from
  different outlets, at least one not Wikipedia. Disagreement or a single source → held out, both values listed.
  No guessing; no order computed where withdrawals or rejoins make it ambiguous.
- Two independent readings (`sec2/A*`, `sec2/B*`), merged only where they agree (`orgn2/merge.mjs`).
- Every fact in the seed carries `tier: "official"` or `tier: "secondary"`.

## Official-tier rulings (ORGN-2)

- ICAO and the ICC: only the deposit dates are stated (Dominica's adherence, Ukraine's ratification), not when
  membership took effect → held (decision 5).
- UNESCO: the latest admission is the United States («since 2023»); no UNESCO page says whether it is a rejoin →
  held (decision 2 cannot be applied).
- EAEU: the year (2015) is only a timeline tab's heading, not beside the two accessions → held (decision 3).
- ECO: «in the early 1990s» → held (decision 3). ICIMOD, GCC: no admission since their founding → held. CSTO: the
  Organization was set up in 2002 by all six; only accessions to the 1992 Treaty are dated → held.
- UN Tourism: its page heads the list «160 Member States» and lists 161 → the count is held, the rest stands.

## Files

- `data-sources/org-newest-members/org-newest-members.seed.json` — the facts, each with its tier and citations
  (offset, length and SHA-256 into a cached page's text; no words kept), and the strings with approval flags.
- `data-sources/org-newest-members/sources.json` — every page cited, by URL, size and SHA-256 of the download and of
  its text (`tools/lib/html-text.mjs`), with its kind, outlet, date and, for Wikipedia, the revision id.
- `tools/.cache/org-newest/strings-review.md` — the new strings for the user's review.

## ORGN-2 outcome (2026-10-09)

- **36 built, 41 held** of 77. Official tier 32: 29 from ORGN-1's readings (UN 8, regional 10, economic 10, other 1:
  ESA) and SAARC, CICA and OSCE, whose own sites the second reading reached. Secondary tier 4: CTBTO (Tonga,
  2026-07-07; UN Treaty Collection + Wikipedia), OAS (Belize and Guyana, 1991; the OAS depositary table + Wikipedia),
  WTO (Timor-Leste, 2024-08-30; Timor-Leste's government + Wikipedia), G7 (Canada, 1976; Global Affairs Canada +
  Wikipedia).
- **The merge's rules** (`orgn2/merge.mjs`): both readings give the same value (two precisions of one date agree on
  the coarser: CICA 2022, OAS 1991); an outlet is a registrable domain (two subdomains of one database count once —
  PCA's two Dutch treaty-database pages); a date's source states that date in its own words («on Monday», «later
  that year», or a year from a neighbouring sentence do not); an order's source states the ordinal («69th»), not a
  count; a page ORGN-1 read in a browser after a 403 (PCA, IPU, OECD, OPEC, AfDB) is no source (decision 4).
- **Held** (each with both readings' values in the seed's `held`): IAEA (21 vs 14 September 2026), INTERPOL (18 vs
  27 September 2017), CARICOM (1 vs 2 July 2002, both on caricom.org), BIMSTEC (February vs July 2004 on its own
  page), Mercosur (July vs 7 August 2024, Wikipedia only); one source only — IFAD, ILO, IOM, UNIDO, UPU, WHO,
  CIRDAP, Arab League, Council of Europe, SADC, OIF (Cyprus), NAM (Fiji), IDB, IsDB, OECD's and BRICS's dates,
  OPEC, PCA, IPU; no date at all — UNCTAD, ISA, IRENA, AfDB, BIS, ACU, G77, ECO; no admission since founding —
  ICIMOD, GCC, CIS, G20 (the AU, 2023, is not a state); CSTO, EAEU, ICAO, ICC, UNESCO as above.
- PDFs among the pages (SAARC's and CICA's documents, WHO's Basic Documents, IOM's resolution, ICAO's list) are cited
  in `pdftotext 4.06 -raw` text (`orgn2/pdftext.mjs`; the page's record names the tool). WHO's cached PDF was
  altered by the e-mail scrub (saved as .html) — its pin is the download as received; WHO is held in any case.
- Hosts that answered 403 or a block page during ORGN-2 are in `tools/.cache/org-newest/blocked-hosts.json` and are
  never asked again.

## ORGN-2b (the user, 2026-10-09)

- **Strings:** the 40 of ORGN-2 approved by the user. One new string awaits the user: the pending-withdrawal line
  «সদস্যপদ ত্যাগের ঘোষণা: {name}, কার্যকর {date}».
- **The secondary tier extended** to ICAO's and the ICC's entry-into-force dates and UNESCO's rejoin (two readings,
  `sec2/A4-fix.json`, `B4-fix.json`):
  - UNESCO built (official): the United States, a rejoin effective 10 July 2023; the newest first-time member the State
    of Palestine, 23 November 2011 (secondary: the UK's depositary list and Wikipedia); the US's withdrawal pending,
    announced 22 July 2025, effective «at the end of December 2026» (UNESCO's Director-General) — on the card.
  - ICAO held: no source states when Dominica's membership took effect. ICC held: 1 January 2025 has Wikipedia alone
    in one reading; Ukraine is still the newest State Party.
  - CTBTO: Tonga signed and ratified on 7 July 2026, one day; a Preparatory Commission member is a signatory State,
    though the Commission's founding Resolution was on no host we may read (noted in the seed).
- **Single-source holds whose one source is the organisation's own page** move to the official tier (the base rule:
  one authoritative source per claim): ILO (Tonga, effective 24 February 2016, «187th ILO member State»), IOM
  (Barbados, 29 November 2022, the Council's resolution), WHO (South Sudan, 27 September 2011, the Basic Documents;
  Wikipedia's «Tuvalu in 2023» contradicts WHO's own list and is noted). WHO's card also carries the US's pending
  withdrawal (stated effective date 22 January 2026, pending before WHO's governing bodies). The rest stay held: their
  one source is a depositary (IFAD, UNIDO), a joining state (NAM, OIF), Wikipedia, a page ORGN-1 read in a browser
  after a 403 (OPEC, PCA, IPU), or an organisation page that contradicts itself (IsDB: 19 May vs July 2016).
- **Founders' ties** (ICIMOD, GCC, CIS) stay held: no newest member.
- **Outcome:** 40 built (official 36, secondary 4), 37 held.

## WHEEL-8 (the user, 2026-10-09)

- The pending-withdrawal line «সদস্যপদ ত্যাগের ঘোষণা: {name}, কার্যকর {date}» approved: all 41 strings approved.
- WHO's card shows the US withdrawal exactly as WHO's page states it today (fetched 2026-10-09): a notification of the
  US's intention to withdraw «with a stated effective date of 22 January 2026», which «is pending consideration by
  WHO's governing bodies». The stated date has passed; WHO still calls it pending and still lists the US, so the US is
  not shown as no longer a member.

## ORGN-3 (2026-10-09): drawn, on the local preview only

- `tools/build-org-newest-members.mjs <out>` builds the map into the preview's copy (`tools/preview.mjs`,
  `tools/check.mjs`); nothing goes to `docs/maps/` or the registry while the map is in `tools/wip.json`. It reads the
  seed, its pins' URLs, the shared countries file, Natural Earth's pinned admin-0 file (Bengali names, label points)
  and approved strings of global-indices (months, «সর্বশেষ যাচাই», «সূত্র», «টীকা») and org-members (the picker's
  prompt, the borders note in ⓘ). Every string shown is an approved one; no new string.
- 40 organisations (held ones not shown), in the picker by group (জাতিসংঘ, আঞ্চলিক, অর্থনৈতিক, অন্যান্য), then the seed's
  order; it opens on the map tab with জাতিসংঘ. Two view tabs, «ম্যাপ» and «তালিকা»; ⓘ under the picker row.
- The map: the shared countries file; the newest member(s) #2563EB, Bangladesh #D55E00, the rest light grey; no
  country's name (`hideCountryLabels`, as global-indices), seas keep theirs; the picker frames the newest member(s)
  and Bangladesh (`fitBounds` on each record's `frame`; the whole world where no newest member is drawn, as ADB's).
- Pins: global-indices' (exported from `docs/shell/indices.js`), one per newest member up to three, a halo round a
  shape under 2,000 km² as drawn (11 organisations), Bangladesh's vermillion «বাংলাদেশ», which opens the card; a
  newest member with no shape (ADB's Israel) is in the card and the list only.
- The card: the tiles «মোট সদস্য», «সর্বশেষ সদস্য», «যোগদানের ক্রম» (the order only where the seed states one; none for a
  tie or a rejoin); a long name wraps to two lines, then shrinks to 14 px — at 320 px FAO's and APEC's three-way
  ties take a third line at 14 px. The marks (যৌথভাবে, পুনরায় যোগদান, সদস্যপদ স্থগিত, the pending withdrawals) under the
  tiles; the rows «যোগদানের তারিখ» (with «দলিল জমা: …» where it differs), «প্রথমবার যোগ দেওয়া সর্বশেষ সদস্য», «সদর দপ্তর»,
  «বাংলাদেশ সদস্য?»; the foot «সর্বশেষ যাচাই» and «সূত্র ↗» («সূত্র: {outlet}» for a secondary-tier fact).
- The list tab: «সংস্থা খুঁজুন», the chips সব/জাতিসংঘ/আঞ্চলিক/অর্থনৈতিক/অন্যান্য (scrolling sideways at 320 px), a row
  per organisation (its name, the newest member with a blue dot, the order, the group), «মোট {n}টি সংস্থা»; a row opens
  its organisation on the map tab.
- Two names are Natural Earth's NAME_BN as the basemap has them: the State of Palestine «ফিলিস্তিন অঞ্চল» (Bangladesh's
  view), the Federated States of Micronesia «মাইক্রোনেশিয়া যুক্তরাজ্য» (for the user's review).

## ORGN-3b (the user, 2026-10-09)

- Country names in text (card, pins, list): this map's seed overrides Natural Earth's NAME_BN for the Federated States
  of Micronesia («মাইক্রোনেশিয়া»; NAME_BN reads "Micronesia United Kingdom") and the State of Palestine («ফিলিস্তিন»);
  the shapes and the shared countries file are unchanged. The other 40 names shown come straight from NAME_BN (and
  Israel's «ইসরায়েল» from global-indices); none is plainly wrong.
- Pins stay clear of the map's own controls as well as its edge (the shared placement in `docs/shell/indices.js`:
  global-indices' pins move where they met a control). A label is placed again once the fonts are in.
- No tilt button: `flat: true`, a flat 2D map (CLAUDE.md, the baseline).

## GL-ORGN (2026-10-09): live

- Built into `docs/maps/org-newest-members/` (two builds, the same bytes); out of `tools/wip.json`; its home card
  under International, after org-members, `kind` only (the descriptor's title, no caption) in `tools/home-cards.json`;
  `docs/registry.json` rebuilt.
- `tools/verify-descriptor.mjs` pins the seed and holds the folder to a fresh build (the picker's order, Bangladesh's
  pin and shading, at most three newest pins, `flat` on this map alone, `hideCountryLabels` on this map and
  global-indices only); `tools/verify.mjs` holds the seed live: no unapproved string reaches docs/ (rule (a)).
