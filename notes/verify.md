# What tools/verify.mjs checks for calls

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Interactive diagrams — No API calls, ever: the check

The rule itself is in `CLAUDE.md`; `tools/verify.mjs`, with `tools/outbound.mjs`
reading the code, holds it:

  - Under `docs/visual/` it fails:
    - any absolute URL;
    - a request whose URL is written by hand rather than taken from the
      resolver: `fetch()`, XHR, or a three.js loader's `load()`, `loadAsync()`,
      `setPath()` or `setResourcePath()`, on any object;
    - a literal path into `diagrams/` or `maps/`, since their files come only
      through the resolver;
    - a beacon or socket;
    - a URL built outside the resolver;
    - code or a subresource loaded by anything but a relative path;
    - a bare host name.
    Only the W3C namespace names, SVG's among them, pass: they are names,
    never fetched. So does `document.fonts.load()`, which takes a CSS font,
    not a URL.
  - The same check runs over `docs/shell/` and `docs/index.html` as a report
    that fails nothing. It tells a link from a request by where the URL
    stands:
    - an anchor's `href` — in `<a>` markup, or passed to a helper whose own
      definition writes one, as the map shell's `credit()` does — is followed
      only on a tap;
    - the argument of `fetch()`, `import()` and the like, a static import, an
      element's `src`, a `<link href>` and a CSS `url()` are fetched without
      one.
  - Each vendored library's network surface is counted and pinned (see
    **Build pins**).
  - A build tool, a diagram's or a map's — `tools/build-*.mjs`, and every
    local module it imports — fails on a network module (`http`, `https`,
    `net`, `dns`, `undici` and the like), a `fetch()`, a socket, or a child
    process that runs `curl` or `wget`.
