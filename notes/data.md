# Building a map's data

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Accuracy — provenance and names

- **Provenance lives outside the served tree, in the seed.**
  `data-sources/<map>/*.seed.json` is the provenance carrier. It holds two
  things: `review`, the free-text editorial note on a record whose sourcing is
  unsettled, and `sources`, an object keyed by the record field each citation
  justifies. Every cited field carries at least one citation — the
  authoritative source, per the rule above — and the build fails a field with
  none, or with two from the same host, since one host is one source. Records
  written under the older two-source rule keep their second citation; it is not
  deleted. What is cited is the feature's **documented extent**, not the
  point — the point only has to lie on that extent, the way the straits map
  marks a strait with a point. There is no `provenance.json` and none is
  wanted — one input, not two. The seed is also where the shipped fields are
  built from, but nothing in it that is provenance — `review`, `sources` — is
  shipped in `records.json` or reaches a student.
- **Names are the exception, by decision.** Where a record has no Bengali name,
  its English name is final: `nameBn` is **absent**, not null, and never counts
  as pending. The record is listed in `ENGLISH_NAME_FINAL` in the build, and
  every place a name is shown — map label, picker, sheet title — falls back
  `nameBn` → `nameEn` (`["coalesce", ["get","nameBn"], ["get","nameEn"]]` on the
  map, `compose` in the picker and sheet). The build fails a listed record that
  carries a `nameBn`, an unlisted record that lacks one, and any `nameBn: null`.
  Supplying a Bengali name later means adding it and taking the record off the
  list in the same edit.

## Name matching is always constrained

Never search an external source by bare name. Always bound by bbox or filter by
tags. A bare name search once returned a rural road in Ontario named "Wallace
Line" and a way named "Ligne Maginot" in New Jersey — either would have shipped
a confidently wrong line. State the constraint used.

## Frames need basemap context

Every basemap's tiles stop at z6 outside its detail areas — world.pmtiles'
strait boxes, bangladesh.pmtiles' Bangladesh box. A frame tight around a
city-scale feature leaves its marker on blank land with nothing to place it
against. Widen the frame and say why in the report.

**Measure every record's resulting zoom at phone width — a 390 px wide
viewport (390×780), which leaves 368 px of map — and widen anything that lands
past z6.** Zoom depends on the canvas, so a frame that looks fine on a desktop
pane can land at z7+ on a phone. A record with no frame is fitted to its own
geometry and is measured the same way: a short traced line needs a frame too,
and that frame must contain the whole trace.
