# environment-treaties

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## The map baseline — the English map

**Every map is in Bengali but one.** environment-treaties is in English, by the
user's decision (2026-09-27), and declares it: `language: "en"`. A map that
declares no language is Bengali; the validator accepts only `bn` and `en`.
The shell turns its own words with the map — the page's title and every `lang`
attribute, the load notice, country names from the tiles' `name_en` alone,
Western digits — and shows no sea names, because `seas.json` has them in
Bengali only. The map's English fields are the editor's, each the translation
of a Bengali field (a date, the cited source's own wording), present exactly
where it is: null where it is null, absent where it is absent. The Bengali
fields stay in the data, unused there. The validator fails an English map
that shows any Bengali field, and that map's build and validator fail an
English field whose null or absent state differs from its Bengali one.

## Current state

- **environment-treaties** — environmental conventions, treaties and
  protocols, world summits and UNFCCC COPs, in four tabs, in English (see the
  baseline section) — is built by `tools/build-environment-treaties.mjs` from
  the editor's seed, `data-sources/environment-treaties/treaties.seed.json`,
  which the build reads and never writes. Its four tables become one records
  table, `items`, each record carrying its `tab`. A record's city is its
  Wikidata item's point, from `tools/extract-treaty-cities.mjs` — matched by
  English label within the named country and a settlement or administrative
  type, and cross-checked against the city's English Wikipedia title — into
  `cities.seed.json`, cited to the revision read. A value the seed leaves
  null that a cited source was found for comes from `additions.seed.json`,
  and only there: today Montreal's parent, the Vienna Convention. A city that
  holds two or more records in one tab is one shared marker, `places.json`,
  whose card lists them; `children`, the reverse of `parentId`, is the
  card's "Under" link. The build derives three values for the card —
  `inForceYear`, the one year in `inForceEn` (it must match `inForceBn`'s),
  `parentShortEn`, the abbreviation closing `parentTextEn` (UNCLOS, for the
  High Seas Treaty, whose parent is not on the map), and `tabBn`/`tabEn`,
  which name a timeline row whose records carry no theme. The card, in
  `columns: 2`: Adopted | In force, Place | Under for a convention or a
  treaty; Held | Place, Under for a summit or a COP; years only; the note
  under the grid. Place is "City, Country", or the city alone (`short`) in a
  card too narrow for it — at 320 px, 19 of the 54. Values the seed gives
  without a citation stand on the user's approval, listed in the build's
  `EDITOR_VERIFIED`: every COP's parent (UNFCCC) and two COP notes. Markers
  are small dots in their theme's colour, the selected one larger with a glow
  (no pulse), each with its city's name beside it, a shared marker's once,
  in plain dark text under normal collision rules. Pending: 30 — Bangladesh's
  ratification (19, not shown yet); the cities of CITES, UNCCD and the 2002
  World Summit and the countries of CITES and UNCCD, each in both languages
  (10); and the High Seas Treaty's parent.
