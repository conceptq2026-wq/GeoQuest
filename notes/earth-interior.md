# earth-interior

A diagram in বিবিধ (misc), «পৃথিবীর অভ্যন্তরীণ গঠন» / "Earth's Interior".
Step 1 (2026-09-28): its card, its two inputs and the sources. Step 2 (the
same day): the seed, `data-sources/earth-interior/earth-interior.seed.json`
(the editor's, approved; the build reads it and never writes it), and the
diagram, built into `docs/diagrams/earth-interior/`. Step 3 (the same day,
after the user checked it locally): the picker row moved to the top, the
names made larger, two words added, and the diagram left the work in progress
for the registry. The seed is pinned by its SHA-256 in
`tools/verify-descriptor.mjs` (`990b45a5…`); an edit of the user's comes with
its new value.

## Inputs, approved by the user

- **`design/mockups/earth-interior.png`**, 852×1846, is the look. It has one
  error: its "Lower mantle" leader points at the orange band, where it must
  point at the deep red band. On the diagram, labels and leaders are drawn by
  code, in Bengali. The mockup's numbers are placeholders.
- **`data-sources/earth-interior/art/earth-master.png`**, 1254×1254 on white,
  is the master painting and the only art. It shows six layers:
  - continental crust, on the top cut face;
  - oceanic crust, on the right cut face;
  - the upper mantle (outer orange band);
  - the lower mantle (deep red);
  - the outer core (inner orange);
  - the inner core (yellow-white).

## Sources, read for step 1

The research files are in `tools/.cache/earth-interior/`, out of git, and are
fetched only on purpose.

- **NCTB «ভূগোল ও পরিবেশ», Class 9–10, 2026 edition, Bangla version.** It is
  row ১৩ on
  <https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612>, and was
  downloaded through the row's government-cloud link (68,511,711 bytes,
  SHA-256 `54143857…c8f79a`).
  - The file is a scanned PDF with no text layer.
  - The section «পৃথিবীর অভ্যন্তরীণ গঠন» is all on book page ৪৮ (PDF page
    53), with চিত্র ৪.১.
- **USGS "Inside the Earth"**: <https://pubs.usgs.gov/gip/dynamic/inside.html>
  (6,515 bytes, SHA-256 `e7b9c53a…696f00`).
- **What each says, layer by layer:** `tools/.cache/earth-interior/quotes.md`.
  - The book gives no temperature but the crust's 30 °C per km.
  - It gives no density figures.
  - It never uses the term «নিফে».

## How it is built

- **`tools/build-diagram-earth-interior-art.mjs`** refuses the master unless
  both its SHA-256 and its decoded pixels' SHA-256 are the seed's pins
  (`art.files`). It cuts the master out of its white background with the
  atmosphere art's soft key (`tools/lib/diagram-art.mjs`, shared), trims it to
  the globe, and writes `earth@1x.webp` (334×346, 27 KB) and `earth@2x.webp`
  (80 KB), capped at 40 KB and 112 KB, into the untracked staging folder
  `data-sources/earth-interior/build/`.
- **`tools/build-diagram-earth-interior.mjs [out]`** (`--measure` prints and
  writes nothing) measures the geometry on the master and writes
  `descriptor.json`, `data.json` and `manifest.json`, and copies the art, into
  `docs/diagrams/earth-interior/` (or `out`, as `tools/preview.mjs` gives it).
  A second build writes the same bytes.
  - The cut's two straight edges are lines fitted to where the cut meets the
    globe's surface (left) and where the face meets the lower cut face's thin
    sliver (bottom), within 4.8 px. Their corner is (555.6, 692.3), the left
    edge at 89.9°, the bottom at −9.12°.
  - Each band boundary is its own circle, fitted to where the colour changes
    along rays from the corner (the inner core's edge, a disc fading into a
    glow, where the green falls fastest), within 1.2 px RMS. A ray that grazes
    a cut edge's sliver is left out.
  - The two crusts share the outer band, split at 58.4°, where the painting's
    brown slab gives way to its grey band. Each layer is an annular sector
    between its two circles; its leader's anchor is its radial middle — on the
    cut's bisector for the four inner layers — and the anchors run down the
    picture in the layers' order, which the build and the validator hold.
- **The view**, `docs/visual/cutaway.js` and `cutaway.css`, is loaded only for
  a view of type `cutaway`. A tap on a layer lights its sector with a white
  outline and a soft glow; the outermost layers' (the crusts') tap zones grow
  outward until they are 44 CSS px deep. Names and leaders are placed by code;
  the card docks under the picture in two columns, in `ui.rowOrder`; the
  picker row is the map shell's (`docs/shared/picker.js`), at the top,
  directly under the header, as in every shell (the user's decision; the
  mockup drew it at the foot). The names are at least 15 px at 390 px wide and
  14 px at 320, semi-bold, on light pills, in a column at the right: the globe
  shrinks to make room, never the names (the user's rule). The ×'s
  accessible name is the seed's `ui.closeBn`, «বন্ধ করুন».
- **ⓘ** lists the NCTB book, «পৃষ্ঠা ৪৮» (`ui.pageBn` and the source's page),
  and USGS. Nothing is credited for the art.

## Measured on the master in step 1 (superseded by the build's numbers above)

- **The bands are not concentric.** The boundary between the lower mantle and
  the outer core is a circle within 0.4 px, centred at (626, 634) with r 221.
  The mantle's outer edge fits a circle of r 470 centred 37 px lower. Each
  boundary is therefore fitted on its own, as the atmosphere art tool fits
  each slab.
- **The wedge's vertical cut edge** is at x ≈ 556.
- **The crusts are thin.** The oceanic crust is about 20–30 px on the master,
  under 10 px at phone size, so its tap zone is widened outward, beyond the
  globe's edge.
