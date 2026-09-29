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
  registry has, and fails a folder whose descriptor's id or section differs
  from its entry in the list. The list's titles are the preview card's and
  may differ from the descriptor's while the item is in progress; the live
  card takes the descriptor's, or `tools/home-cards.json`'s (below).

## Structure — the home page

`docs/index.html` renders its list from `docs/registry.json`, which
`tools/build-registry.mjs` builds from every descriptor under `docs/maps/` and
`docs/diagrams/`, less the work in progress in `tools/wip.json`. The list is
never hand-maintained: adding a map makes it
appear under its section with no edit. Of the list, only the section names are
written into the page (`SECTION_NAMES`). Each descriptor declares its `section`:
`bangladesh | international | geography | misc` — the three BCS subjects in
syllabus order, then বিবিধ for what belongs to none of them.

**A card's own words** (the user's decision, 2026-09-30): `tools/home-cards.json`
gives a card a Bengali title where it differs from its page's (`titleBn`) and
an optional one-line caption (`captionBn`); `tools/build-registry.mjs` merges
them into the entry — `title.bn` replaced, `caption: { bn }` added — and
`tools/verify.mjs` holds each to a finished map or diagram of its kind, one
line of Bengali, at most 60 characters. `docs/index.html` draws a caption as
a third line, 14 px, under the Bengali title; an entry without one is drawn
exactly as before (the 15 cards then live, rendered in headless Edge before
and after, hashed alike). No card has a thumbnail. The first two: the rivers
diagram «নদী ১» («বাংলাদেশের নদ-নদীর সম্পর্ক এক নজরে (ছবি)») and the rivers
map «নদী ২» («ম্যাপে নদী বেছে শাখা-উপনদী ও গতিপথ দেখুন»).
