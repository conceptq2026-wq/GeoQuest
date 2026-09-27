# border-lines

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## `bdPov` means one thing

`bdPov` describes **only what the Natural Earth Bangladesh point-of-view
boundary file shows for this record's traces.** It is therefore **absent** —
not applicable — for any record whose geometry does not come from Natural
Earth.

Each record records its geometry source: `naturalEarth | osm | generated |
none`, in the build input, not in shipped records. Build assertion: `bdPov` is
present if and only if the source is `naturalEarth`, and the build fails
naming the record and both values. `geometrySource` is derived by the build
from how the geometry was produced, lives in `lines.seed.json`, and is dropped
on the way into `records.json`. Alongside it the records carry `hasTrace` (a
Natural Earth trace exists) and `hasGeometry` (any geometry exists — traced,
OSM or generated), and it is `hasGeometry` the map keys off.

Bangladesh's own position on a line is a different claim, is user-supplied
content, and does not exist as a field yet.
