# Descriptor terms

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Data model — every other term

- **One selection at a time.** Selection is held per records table, but
  selecting a record in one table clears every other table's selection, and a
  selection the picker does not list puts the picker back to its placeholder.
  The sheet shows one record, so only one may be lit.
- **`sheet` or `sheets`.** `sheet` is the card for a map that selects from one
  table. `sheets` is the same card keyed by records table, for a map where
  more than one table can be selected; the validator fails a selectable table
  with no card. A kicker that resolves to nothing is hidden. A card may also
  declare `subtitle` — a value spec shown as a small grey line under the title
  (the janapadas' "approximate area" caption); like a row, it hides when it
  resolves to nothing.
- **Card terms.** `chip` — a value spec drawn as a pill on the kicker's line
  (a record's theme); a card declares a kicker or a chip, not both. A row
  declared `stacked` puts its value under its label, across the card.
  `columns: n` lays a card's rows out as cells of an n-column grid, filled in
  order: a cell that does not apply to the record — none of the fields it
  reads, no linked record — is left out, one whose value is null keeps its
  place empty so its neighbour stays in its own column, and a grid row with
  nothing in it is dropped; stacked rows run under the grid, across it. A row
  may declare `when: { field: value | [values] }`, in `expectGeometry`'s
  field/value shape: it applies only to records whose field holds one of the
  values, and the validator requires each value to occur. A cell may declare
  `short`, a value spec shown instead where the value does not fit the cell's
  one line — measured again whenever the card resizes, card by card.
  environment-treaties uses all of them.
- **`referencedBy` is the reverse of a `refs` field**, in the `fromSelection`
  shape pointed the other way. A sheet row
  `{ "referencedBy": { "records": R, "listField": F }, "item": <value spec>,
  "do": [actions] }` lists every record of `R` whose `F` contains the shown
  key, in `R`'s own order, each a button that runs `do` on that record. `F`
  must be a `refs` field pointing at the sheet's table; the validator asserts
  it. No match hides the row, like a null. org-headquarters uses it for the
  organisations a city hosts.
- A picker's `groupBy` may omit `lookup`: the field's value is then the group
  label as it stands, and `order` must name every value that occurs.
- A tap on overlapping points goes to the one **nearest the finger**, not the
  first the renderer lists.
- **`minTextSize`** (2026-09-30): 14 or absent. With it the shell draws no text
  on that map under 14 px (`notes/shell.md`); the validator holds the map's own
  layers to it and `tools/check.mjs` scans the page and the style.
- **`tapWidth`** on a tapped source (2026-09-30) sets its invisible hit
  layer's width in px: a line's tap band, a point's tap disc. Without it a
  line's band is 22 px and a point's disc 44 px, as before; the rivers map
  gives its thin lines 44.
- **A tap is resolved once, on the view it landed on** (2026-09-28): every
  tapped source's features under the finger are found first, then each
  source's actions run in the descriptor's order. One handler per source let
  the first source's instant camera jump, under reduced motion, put another
  source's feature under the finger (ancient-janapadas: Samatata opened Banga).
- **`recordFilter` hides records by a field value.** A control
  `{ "type": "recordFilter", "id": ..., "records": T, "field": F, "label": ...,
  "allLabel": ... }` draws the layerToggle's button and checkbox menu: a
  select-all row, then one checkbox per value. The values, their order and
  their labels are the picker's `groupBy` on the same field, which the
  validator requires, so the two cannot list different things. Unchecking a
  value hides every record of `T` carrying it — from every source derived
  from `T`, from the picker and from ‹ ›, and from `referencedBy` lists — and
  a record of a table `T` references through a `refs` field (a city) stays
  only while a shown record still points at it. A selection the filter hides
  is cleared and its card closed. Baseline sources are never filtered.
  Everything starts checked on every load; nothing is persisted. The
  mechanism is the selection's: sources re-derived with `setData`. A map
  declares a layerToggle or a recordFilter, not both — they share a corner.
- **Photos: one field type and two terms.** A record field of type `photo`
  holds `{ marker, card, author, licence, licenceUrl, page }`: two files in
  the map's folder and the whole credit. `photoMarker: { field }` on a source
  whose points come from a record field (`geometryFrom`) draws each record as
  a round photo, sized by zoom (the user's decision, 2026-09-28), and a tap
  runs that source's click interaction. `photoMarker.zooms: { dot, photo,
  full }`, per map, sets the look: at and below `dot` — chosen so that the
  opening view shows dots only — a 10 px dot in the plain marker's colour,
  `#0b3d91`, with a white ring; zooming in, it turns smoothly into the photo,
  24 px at `photo`, growing to 36 px at `full`. The selected one is always the
  photo, 56 px, with a white ring and a soft shadow, above the rest, the pulse
  round it. The ring, shadow, pulse and collision reserve scale with the size,
  and a name's `text-radial-offset` on that source interpolates at the same
  three zooms (the validator holds both). Every marker is a round tap zone of
  at least 44 px, the disc drawn inside it. Two sites close together overlap at a wide
  zoom (Mahasthangarh and Paharpur on the janapada map): both markers stay at
  their real sites, the selected one draws on top, and a tap on the overlap
  goes to the site nearest the finger, not to the disc on top; a click with
  no pointer — Enter or Space on a focused marker — is that marker's own. A
  record with no free photo gets the plain dot the straits map gives a
  passage instead, so it is never missing from the map. `photo: { field }` on
  a sheet puts the card photo (16:10) at the top of the card and its credit —
  author · licence · Wikimedia Commons, both linked — at the bottom; one term
  draws both, so a card cannot show a photo without the credit CC BY and CC
  BY-SA require. When the shipped image is a crop, the value carries
  `cropped: true` and the credit says "Photo (cropped)": CC BY-SA asks the
  credit of a derivative to say what was changed. Sizes, rings and shadows are
  shell CSS, identical on every map. The validator fails a photo missing
  either file or any part of its credit, or carrying a licence other than
  public domain, CC0, CC BY or CC BY-SA.
- **Names avoid photos.** A photo marker is DOM, above the canvas, so
  MapLibre's label placement cannot see it. The shell reserves each marker's
  circle in the collision index with invisible icons on its topmost layers,
  placed before any name: three centred rectangles that cover the circle and
  overreach it by at most 17% of the radius (one square would by 41%, and turn
  away names that sit beside a photo), sized as the marker's disc is drawn at
  each zoom. A name is placed round a photo as round another name, and one with
  nowhere to go is dropped rather than drawn under a photo. The icons are
  never drawn and take no tap. Flat, they match the marker at every zoom;
  tilted, MapLibre scales symbols with perspective and the DOM markers not,
  so at the tilt button's 55° the reserve is 92–95% of the marker. A name
  under its own photo must sit outside that photo's reserve or it is pushed
  off it: with the fixed 56 and 72 px markers the janapada names cleared it by
  0.4 px, the geography maps' by 2.5 px (6 px beside it); the offsets by zoom
  keep those gaps at each size (2026-09-28).
- **Photos are light.** Every marker on a map loads when the map opens, so a
  marker file is at most 8 KB; a card photo loads only when its card opens,
  never at map load, and is at most 40 KB. The extractor steps WebP quality
  down until each file fits; the build fails a file over either cap.
- **Photos come from Wikimedia Commons, freely licensed, with no people.** The
  seed records the Commons file, its page, author, licence, the original's
  SHA-1 and the two crop boxes, in the original's pixels;
  `tools/extract-commons-photos.mjs <map>` refuses a file whose SHA-1
  differs, crops, and writes `photos/<id>-marker.webp` (128 px square) and
  `photos/<id>-card.webp` (640×400) with ffmpeg. An original wider than 1280
  px is fetched as Commons' own 1280 px rendition (a standard thumbnail width;
  others are refused) and the crop boxes are scaled to it. The build reads
  the committed files, never Commons. A photo is a satellite view only where
  that is what shows the place recognisably — a whole lake, a desert with no
  free ground photo — and never a map.
- A card taller than 62% of the screen scrolls inside the sheet; the handle
  still drags it.
- **Areas nest, and the smallest wins a tap.** The Nubian Desert lies inside
  the Sahara, Rub' al Khali inside the Arabian. A tap on overlapping areas
  selects the smallest, measured on each record's whole geometry rather than
  the tile-clipped piece the renderer hands back. Photo markers draw above
  every area.
- **A source whose geometry comes from OpenStreetMap declares the ODbL credit**
  as its `attribution` — `© OpenStreetMap contributors`, linked to
  openstreetmap.org/copyright. The licence requires it. straits (`routes`,
  `canals`), border-lines (`lines`) and org-headquarters (`cities`) do.
- **`attribution.extra`** lists whole credits the shell adds to ⓘ that no
  source carries — each an https link that opens outside the WebView; the
  validator holds that shape. latitude-longitude's NASA credit is one.

- **`images` names the pictures symbol layers draw** (2026-09-28):
  `{ <id>: { file, pixelRatio } }`, each an SVG in the map's own folder with
  its own width and height, fetched through the resolver like the map's other
  files and drawn at `pixelRatio` pixels to the CSS pixel; a layer's
  `icon-image` names one. The validator fails an icon-image that names no
  declared image, and an image no layer draws. liberation-war-1971's flag,
  anchor and star are the first.

## Records with no line geometry get a point marker

A record that cannot be traced is marked with a point, the same treatment the
straits map gives a passage — radius 6, `#0b3d91`, 2px white stroke, property
for property. On selection the circle hides and the pulsing DOM marker takes
its place, exactly as on straits. A record that has a line to draw — traced or
generated — gets no marker and keeps the line-width idiom.

The marker is one `maplibregl.Marker` placed at one coordinate, so it is
narrowed by a condition rather than by the source it hangs off:
`selectionMarker` takes an optional `when`, in the same field/value shape
`expectGeometry` uses. border-lines declares `{ when: { hasGeometry: false } }`;
straits declares `true`. More than one source may declare `selectionMarker`,
at most one per records table; the one marker goes to whichever table holds
the selection. org-headquarters declares it on `cities` and on
`organisations`, so a tapped city and a chosen organisation both pulse at the
city.

The build fails, naming the record, when a record has no line geometry, no
point and no frame. A record that legitimately cannot be given a point is
listed in `NO_POINT_YET`, and the build also fails if that list goes stale.

**Never silently absent from the map.**

**The one exception: world-revolutions** (the user's decision, 2026-10-01).
There, an event whose sources name no single place a pinned file can locate
has no marker at all. It is still in the picker, its card opens, and a row on
it says «নির্দিষ্ট বিন্দু নেই» — absent, but never silently. The events are
listed, each with its reason, in the seed's `noPoint`
(`data-sources/world-revolutions/world-revolutions.seed.json`). The build and
`tools/verify-descriptor.mjs` each fail when the list and the unmarked events
disagree either way, or when a listed event's card lacks the row. The map's
third tab, «অ-রাজনৈতিক বিপ্লব», is cards only: the same decision, and the
validator fails any marker there. No other map may leave a record unmarked.
