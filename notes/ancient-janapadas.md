# ancient-janapadas

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Current state

- **ancient-janapadas** is built by `tools/build-janapadas.mjs` from the
  editor's seed, `data-sources/ancient-janapadas/janapadas.seed.json`, which
  the build reads and never writes. A janapada is the union of the whole
  present-day units its seed names — Bangladesh's by COD-AB pcode, India's by
  the names table and geoBoundaries (Tripura as its eight districts), Rakhine
  from Natural Earth admin-1 — each matched exactly once or the build fails.
  **The units are the basemap's own**, from `tools/lib/bangladesh-units.mjs`,
  which `build-bangladesh.mjs` draws from too: a unit outside Bangladesh is
  cut at Bangladesh's border as COD-AB draws it, and each piece of land
  between it and that border goes to the nearest unit across it, as the
  basemap gives it — so no area outside Bangladesh claims Bangladeshi land,
  and every area's international edge is the basemap's border line, drawn to
  within the 250 m it is simplified at. The areas are
  then simplified together as the lakes map simplifies its areas (250 m), so
  an edge two outlines share stays one line; keeping the border stretches at
  the basemap's own 20 m was measured and refused, at +124% gzip. All eleven
  are built, pinned and measured, and `SHIP` lists which are written — today
  all eleven; a record the seed gains ships only once it is listed. A frame
  outside the detail box is never narrower than `MIN_FRAME_LON` (3.7° of
  longitude, which lands at z6 or below on a 390 px phone whatever card is
  open), widened about its centre and kept inside the basemap's bounds. A
  photo is found only for a record whose seed photo is null, and its
  provenance goes to `photos.seed.json` beside the seed, which
  `tools/extract-commons-photos.mjs ancient-janapadas` reads; the same entry
  holds the point of the site the photo shows — its Wikidata item's P625,
  cited there — which ships as `siteAt`. Where the item's point is wrong, the
  point is the site's own Wikipedia article's, cited to its revision, and the
  entry keeps the item's point and says why (`pointFrom: "wikipedia"`,
  `wikidataPoint`, `why`): today banga, whose item puts Wari-Bateshwar 22 km
  off, at Narsingdi town. A record that can have no photo — no site point for
  one to stand on — is made absent in the photo seed, `absent: { reason }`,
  and ships with no `photo` field, never pending; the editor's seed still says
  null. Today that is tamralipta: no Wikidata item is an archaeological site
  at Tamluk. Nothing on this map is pending. A record with a photo is drawn
  as a photo marker at that site (sized by zoom: `zooms` 5.8, 6.6 and 8, the
  opening zoom being 5.58 at 390 px and 5.14 at 320; name offsets 0.68,
  1.18 and 1.61 em, 2.18 em when selected), never at the area's centre, with its name
  under it, or above or beside it where that would collide; a record without
  one has no marker, and its name sits on its name point, or beside it. Names
  take those alternative anchors (`text-variable-anchor` with a
  `text-radial-offset`) rather than overlap, and avoid the photos (see
  **Names avoid photos**). A name point is the inner point of the part of the
  area inside the default view, kept half a name's width (25 px) from the
  view's edges and 30 px from every photo's centre, never of the whole area,
  so every name stands in the default view; the build fails one that does
  not. The default view is `DEFAULT_VIEW` in the build: what a 320×780 phone
  shows at the camera the map opens on, measured, not derived. The basemap's
  bounds set that zoom on a tall screen, so the view is narrower than the
  frame the map asks for, 86.9–91.6°E of 85.5–93.0°E. It is recorded with the
  frame and coverage it was measured on, and the build fails if either
  changes; a change to the page's layout needs it measured again by hand. A
  janapada with no part in that view keeps its whole area's inner point and
  is listed in `OUT_OF_VIEW` with the reason: today Ruhma, as Rakhine lies
  east of 92.17°E. Every area is a thin outline; only the selected one is
  filled. Every Bengali unit name the seed shows must be the names table's
  spelling; the build fails any other, except where `NAME_EXCEPTIONS` lists
  one with its reason — today Harikela's কাছাড়, cited to the seed's own
  source, where the names table has no Bengali. The areas credit every source
  they are made from — COD-AB (CC BY 3.0 IGO), geoBoundaries India (ODbL 1.0),
  Natural Earth, and OpenStreetMap (ODbL) for the land between a unit and the
  border — and, holding ODbL data, the areas file is offered under the ODbL;
  the build fails if the descriptor's credit leaves any of that out.
