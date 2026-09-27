# straits

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Structure — the reference page

`docs/international/straits/` is the original live page. It is the reference
implementation for how a map looks and behaves. Do not change it unless a task
says to.

## Current state

- The straits map's content exists twice — `docs/international/straits/data.js`,
  which the live page reads, and `docs/maps/straits/records.json`. **Until the
  live page is retired, `data.js` is the single source**: supplied content goes
  there, the extractor re-runs, and the validator proves the two match exactly.
  When the live page goes, `records.json` becomes the source and `data.js`
  disappears.
