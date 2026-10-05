# bangladesh-maritime-boundary — «বাংলাদেশের সমুদ্রসীমা»

Read it with `CLAUDE.md`, whose rules and verification budget apply. A map
under বাংলাদেশ, **work in progress** (`tools/wip.json`): local preview only.
Nothing is under `docs/` and `docs/registry.json` is unchanged. The research
behind it is `tools/.cache/bd-maritime/investigation.md`, out of git.

## The user's decisions (2026-10-05)

1. **ITLOS data: option (ক), as for the UN.**
   - ITLOS's website terms bar reproducing or commercially using its
     information or data, and its judgments, without the Registrar's
     written permission.
   - The user decided to proceed as with the UN sources of maritime-zones:
     facts restated in our own words, the drawing our own, no ITLOS text
     reproduced (quotes are offsets and hashes only, below).
   - The Myanmar line is a separate item (`myanmar-line`, its own feature in
     `lines.geojson` and its own arc source), so it can be removed without
     touching the rest.
2. **Points 8–9:** the 12 NM envelope of arcs round St Martin's is derived
   from a coastline, drawn dashed and marked «আনুমানিক».
3. **Step 1 has five items only:** the Myanmar line, the India line, St
   Martin's, the 2015 baselines and the junction point.
   - No grey area, no 12/24/200 NM line.
   - No link from the maritime-zones diagram yet.
4. **No card sentences yet.** They wait for NCTB «বাংলাদেশ ও বিশ্বপরিচয়»
   chapters 5 and 9, which the user will supply as photos. The card shows the
   name only.

## Sources

All of them are pinned by size and SHA-256 in the seed and in
`tools/sources.json` (`bangladeshMaritime`). They were fetched once with the
repo's User-Agent into `tools/.cache/bd-maritime/`; `tools/fetch-sources.mjs`
fetches them again.

- **ITLOS**, Case No. 16, Judgment of 14 March 2012: points 1–11 (¶501–504),
  the envelope (¶502) and the 215° geodesic (¶505), all p. 128.
- **PCA**, Bay of Bengal Maritime Boundary Arbitration, Award of 7 July 2014,
  from the PCA's case repository (pca-cpa.org answers our User-Agent with a
  Cloudflare challenge):
  - the land boundary terminus and delimitation points 2–3, and the
    177°30′00″ geodesic (¶509(2)–(3), p. 165);
  - from the hydrographer's appendix, the junction (¶23, p. A-4) and the
    unrounded start of the 177°30′ line (¶14 Prov-3, ¶22), used for the
    check only.
- **S.R.O. No. 328** (4 November 2015; Gazette Extraordinary, 10 November
  2015), as deposited with the UN (M.Z.N.118.2016.LOS).
  - A **scan** with no text: the four baseline points are read from the
    table on p. ৮৭৬৪.
  - Point 2 is also read back from India's 2017 note, which states it as
    text.
- **Act No. XXIX of 2021** (bdlaws act-1394) and the 1974 Act's sections
  2C, 3, 4, 5 and 7 as it substitutes them: pinned for the cards to come.
  Nothing from them is shown yet.
- **Bangladesh's amended CLCS executive summary** (22 October 2020):
  - Table 1, its one fixed point, is the junction's cross-check.
  - It gives 0.1″; it agrees with the PCA's point to that, the seconds
    truncated (28.7, 54.3), not rounded.
- **The protest notes** (in ⓘ):
  - India, PM/NY/443/1/2017 (3 August 2017) and PM/NY/443/4/2021;
  - Myanmar, 57/03 09 45 (15 February 2019) and 29/13 13 (2021).
  - All object to baseline points 2 and 5. The 2021 notes are scans.
- **NCTB «ভূগোল ও পরিবেশ», ৯–১০ (2026)**, p. ১৪৯ (PDF p. 154): for the
  conflicts below and the spelling «সেন্টমার্টিন্স দ্বীপ».
  - It is the earth-interior download, pinned again here
    (`bangladeshMaritime.nctbBhugol2026`).
- **The coastline**: `osmBangladeshLand` (`tools/sources/osm-bangladesh-land.geojson`),
  the OSM land polygons behind the Bangladesh basemap, detail set.
  - St Martin's is its two polygons in the box [92.28, 20.55, 92.36,
    20.66].
  - It is a mapped coastline, not the low-water line ITLOS measured from.

**Quotes.**

- The seed stores each coordinate's citation as its source, paragraph and
  page, the file, and the quote's offset and length in that file's normalised
  text, with the quote's SHA-256. No words are stored.
- The normalised text is what `pdftotext -enc UTF-8 <file> -` (xpdf 4.06)
  prints, kept as `text/<name>.txt` in the cache and pinned by its own
  SHA-256, with each whitespace run collapsed to one space.
- `tools/verify.mjs`:
  - slices each quote again and hashes it;
  - reads it back as the seed's numbers;
  - fails any tracked file holding a quote's words.
- The readable quotes are in `tools/.cache/bd-maritime/quotes.json`.

## How it is drawn (`tools/build-bangladesh-maritime-boundary.mjs`)

- **Geodesics** are computed at build time by `tools/lib/geodesic.mjs`.
  - It uses Vincenty's direct and inverse formulae on GRS 80, the PCA
    hydrographer's ellipsoid; WGS 84 differs below what is resolved here.
  - No dependency and no network.
  - Lines are densified every 2 km.
- **Myanmar line:**
  - geodesics through ITLOS 1–8;
  - the envelope from 8 to 9;
  - geodesics 9–10–11;
  - the geodesic from 11 to the junction, which leaves 11 at 215.000000°.
- **The envelope (8–9):**
  - Along bearings every 2° from the island's centre, clockwise round the
    south (61.1°), the distance at which the OSM coast is 12 NM away. The
    coast is densified to 10 m.
  - Point 8 and point 9 are joined to its ends.
  - It is its own source (`arc`), dashed, labelled «আনুমানিক» from zoom 8.
- **India line:**
  - geodesics through the LBT and points 2–3 as ¶509 gives them;
  - the geodesic from point 3 to the junction.
  - Because ¶509 rounds point 3, that last geodesic leaves at
    177.499926°, not 177.5°.
- **Baselines (2015):**
  - The straight geodesics between the four published points only, with
    their numbers «১»–«৪» from zoom 6.
  - The rest follows the low-water line from point 4 to Teknaf and St
    Martin's, and point 5 has no coordinates: neither is drawn, and ⓘ says
    so.
- **The sea area:**
  - Its outline runs along the India line to the junction, back along the
    Myanmar line (envelope included), and closes over land, east of the Naf
    and Raimangal mouths.
  - The OSM land is erased from it and the largest piece kept, simplified to
    30 m.
  - It reaches 22.80° N where the OSM coastline leaves estuaries open; 146
    islands are cut out.
  - Its label, «বাংলাদেশের সমুদ্র এলাকা», never names the EEZ. ⓘ says
    that grey areas inside it carry seabed rights only (ITLOS ¶471–476, PCA
    ¶498–508).
  - No area figure is shown.
- **Points:**
  - St Martin's is at the centre of the OSM polygons;
  - the junction is the PCA's.
  - Both use the standard point marker.
  - The published turning points are small dots.
- **Basemap `bangladesh-wide`.**
  - The Bangladesh archive's box ends at 17.0° N, and the junction is at
    16.7247° N, on world.pmtiles.
  - The map's bounds [85.5, 14.5, 95.5, 25.5] hold it with 2.22° to spare.
  - The opening frame [88.9, 16.5, 92.6, 22.9] holds it with 0.22°.
  - Neighbours are the basemap's plain grey. Their country names are the
    shell's baseline, not the map's.

## Checks (the build stops on any)

- **The junction:**
  - The 215° and 177°30′ geodesics, from ITLOS point 11 and from the PCA
    appendix's unrounded point 3, meet 0.00002″ / 0.00000″ (1 mm) from the
    appendix's ¶23 point. The limit is 0.01″.
  - From ¶509's rounded point 3 they meet 0.029″ / 0.020″ (1.06 m) away.
    This is reported, not checked; ¶26 says the award's points are rounded
    to 0.1″.
- **The CLCS point** is within 0.1″ of the junction.
- **St Martin's** is two polygons in its box.
- **The bounds** hold the junction with at least 1°.
- **Reported:** ITLOS point 8 lies 561 m and point 9 944 m outside the derived
  envelope, at 12.303 and 12.510 NM from the OSM coast.

## Conflicts (notes only, not on cards)

1. **Case date.** NCTB p. ১৪৯ gives «১৪ই ডিসেম্বর, ২০০৯» for both cases.
   - The PCA award ¶1 dates India's case's notification 8 October 2009.
   - ITLOS ¶1 says the proceedings against Myanmar were instituted on 8
     October 2009 and the letter filed with the Tribunal on 14 December 2009.
2. **Shelf.** NCTB p. ১৪৯ puts the shelf to 350 NM from the coast.
   - Bangladesh's 2020 CLCS amendment defines its outer limit by one fixed
     point, the junction of the two lines.
   - The CLCS has not yet made its recommendations (its page, read
     2026-10-05).
3. **St Martin's EEZ.** NCTB p. ১৪৯ has the island give Bangladesh a 200 NM
   EEZ.
   - ITLOS ¶319 gives the island no effect on the EEZ and shelf boundary,
     and full effect in the territorial sea (¶152).
   - The 2015 baselines use the island's south end (point 5) for the EEZ;
     India and Myanmar object.

## Strings

Every Bengali string in the seed is `{ bn, approved }`. The title is the
user's (approved). The rest await approval: the five item names, the area
label, «আনুমানিক», the picker's placeholder, the four ⓘ lines and the ⓘ
headings «টীকা» and «সূত্রগুলোর অমিল» («সূত্র», not «উৎস», as on
world-revolutions). The build prints the list.

## Files

- `data-sources/bangladesh-maritime-boundary/bangladesh-maritime-boundary.seed.json`
- `tools/build-bangladesh-maritime-boundary.mjs <out>`: it refuses to run
  without `<out>` while in progress.
- `tools/lib/geodesic.mjs`
- Built:
  - `descriptor.json`
  - `items.json`
  - `lines.geojson`
  - `arc.geojson`
  - `area.geojson` (207 KB)
  - `vertices.geojson`
  - `info.json`
- Checks:
  - `tools/verify-descriptor.mjs` builds the map into a temporary folder
    and runs the generic checks there.
  - `tools/verify.mjs` holds the seed.
