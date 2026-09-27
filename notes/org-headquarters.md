# org-headquarters

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Current state

- org-headquarters holds international organisations **and** technology
  companies, one map by the user's decision. It is built by
  `tools/build-org-headquarters.mjs` from two user-approved seeds, which the
  build reads and never rewrites:
  `data-sources/org-headquarters/organisations.seed.json` and
  `data-sources/tech-headquarters/companies.seed.json`. They become one records
  table, organisations first; the companies carry no category and form one
  picker group, `প্রযুক্তি প্রতিষ্ঠান`, shown last. The cities table, the host
  countries and every point and frame are derived; the cities' provenance goes
  to `data-sources/org-headquarters/cities.seed.json`.
- **Hubs.** Towns too close to tell apart at frame zoom share one marker, by
  the user's decision. `data-sources/org-headquarters/hubs.seed.json` names
  each hub and its member towns; today that is `silicon-valley`
  (সিলিকন ভ্যালি): Cupertino, Mountain View, Menlo Park, Santa Clara, San Jose
  and Los Gatos. In the shipped marker table (`cities.json`) a hub replaces
  its towns, with its point the mean of theirs and its frame their extent
  widened by `FRAME_HALF`, so its one card lists everything in all of them.
  The towns keep their own points and provenance in `cities.seed.json`
  (`hub` names where each went), and each record keeps its own `cityBn` and
  gains `regionBn`, the hub's name, shown as অঞ্চল. No descriptor term: the
  hub is an ordinary record of the marker table.
