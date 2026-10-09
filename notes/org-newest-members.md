# org-newest-members — «সংস্থার সর্বশেষ সদস্য» (work in progress)

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map under International, in
`tools/wip.json` only (home first): nothing built under `docs/` yet. The research is out of git in
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
