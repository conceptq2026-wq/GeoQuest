# The home page and the registry

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Working rules — the home page first

- **Every new map or diagram goes on the home page first, before any work
  on it — on the local preview's home page only** (the user's standing rule,
  2026-09-27). It is listed in `tools/wip.json` — id, kind (`map` |
  `diagram`), section, Bengali and English title — and `tools/preview.mjs`
  adds it to the home page of its local copy of `docs/`, in its section, as
  a card that opens whatever exists so far, or a «কাজ চলছে» page while
  nothing does. It reaches the live home page, the committed
  `docs/registry.json`, only when finished, leaving the list. **Finished
  means in the registry** (the user's rule, 2026-09-27): its folder may be
  under `docs/` while its work continues — `tools/build-registry.mjs` leaves
  every listed id out, and `tools/verify.mjs` holds the registry to the
  folders less the work in progress, fails an id in the list that the
  registry has, and fails a folder whose descriptor's id, section or titles
  differ from its entry in the list.

## Structure — the home page

`docs/index.html` renders its list from `docs/registry.json`, which
`tools/build-registry.mjs` builds from every descriptor under `docs/maps/` and
`docs/diagrams/`, less the work in progress in `tools/wip.json`. The list is
never hand-maintained: adding a map makes it
appear under its section with no edit. Of the list, only the section names are
written into the page (`SECTION_NAMES`). Each descriptor declares its `section`:
`bangladesh | international | geography | misc` — the three BCS subjects in
syllabus order, then বিবিধ for what belongs to none of them.
