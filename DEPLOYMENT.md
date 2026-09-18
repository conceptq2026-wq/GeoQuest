# Deployment

The site is a folder of static files. Deploying = copying the repo (minus
`tools/`, which is only the build pipeline) to a static host. The app knows
one URL — the hub, `index.html` at the top of the folder — stored in a single
field in the app's CMS. **Changing host = copy the folder, update that one
field.** Nothing else refers to the host.

## Current host

GitHub Pages, branch `main`, folder `/` (root).

- Hub: `https://conceptq2026-wq.github.io/GeoQuest/`
- Temporary: the old straits address `https://conceptq2026-wq.github.io/GeoQuest/straits/`
  forwards to `international/straits/`. `straits/` is deleted once the CMS
  field points at the hub and that has been checked on a phone.
- `.nojekyll` at the root stops Jekyll from processing the site (harmless on
  other hosts).
- Pages sends `Cache-Control: max-age=600`: a push can take up to 10 minutes
  to reach a phone.

## Requirements for any host

PMTiles fails **silently** (blank sea, no land, only a console error) if any
of these are not met.

- [ ] **HTTP Range requests.** `Range: bytes=…` must return
      `206 Partial Content` with `Accept-Ranges: bytes` and a correct
      `Content-Range`. A server that ignores Range and returns `200` with the
      whole file breaks the maps. Python's `python -m http.server` (3.12) is
      one such server — fine for the hub, not for the maps.
- [ ] **No transforming compression on `.pmtiles`.** No gzip, brotli or other
      on-the-fly encoding of `.pmtiles` files. Compression changes the byte
      offsets, so range reads return the wrong bytes. (Pages gzips when the
      client allows it; browsers send `Accept-Encoding: identity` with Range,
      so they are safe. Non-browser tools must set that header themselves.)
- [ ] **`.pmtiles` served as-is** as `application/octet-stream` (or
      `application/vnd.pmtiles`). Not rewritten, not intercepted by an SPA
      fallback, not redirected.
- [ ] **`.mjs` served as JavaScript** (`text/javascript`). The map library is
      loaded as ES modules; a wrong type blocks it.
- [ ] **Static file serving only.** No rewrite rules, no redirects that add or
      strip trailing slashes or `index.html`: every path in the site is
      relative to the current page, and a redirect that changes the page's
      directory breaks them. All internal links name `index.html` explicitly.
- [ ] **Case-sensitive paths are fine.** All folder and file names are
      lowercase; the site works on case-sensitive (Linux) hosts.
- [ ] **Subpath or root.** The site works at a domain root or under any
      subpath without edits. No `<base href>`, no absolute paths, no domain in
      any file.

## Check after deploying

1. Open the hub; all three sections show; the straits card opens the map.
2. The map shows land (not just blue sea); the console has no errors.
3. `curl -sI -H "Range: bytes=0-16383" -H "Accept-Encoding: identity" <hub>/shared/tiles/world.pmtiles`
   returns `206` and `Content-Range: bytes 0-16383/<file size>` with no
   `Content-Encoding`.
4. "← All maps" on the map returns to the hub.
5. Update the CMS field to the new hub URL.
