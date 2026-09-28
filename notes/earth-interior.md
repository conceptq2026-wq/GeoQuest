# earth-interior

A diagram in বিবিধ (misc), «পৃথিবীর অভ্যন্তরীণ গঠন» / "Earth's Interior".
It is work in progress (`tools/wip.json`). Step 1 is done (2026-09-28): its
card, its two inputs and the sources. Nothing is built, and there is no seed.

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

## Measured on the master (for the build, not final)

- **The bands are not concentric.** The boundary between the lower mantle and
  the outer core is a circle within 0.4 px, centred at (626, 634) with r 221.
  The mantle's outer edge fits a circle of r 470 centred 37 px lower. Each
  boundary is therefore fitted on its own, as the atmosphere art tool fits
  each slab.
- **The wedge's vertical cut edge** is at x ≈ 556.
- **The crusts are thin.** The oceanic crust is about 20–30 px on the master,
  under 10 px at phone size, so its tap zone is widened outward, beyond the
  globe's edge.
