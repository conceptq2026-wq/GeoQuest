# Vendored libraries

Moved verbatim from `CLAUDE.md` (2026-09-28). Read it with `CLAUDE.md`, whose
rules and verification budget apply.

## Pinned, do not bump — how

Vendored under `docs/shared/vendor/<lib>-<version>/` by `tools/vendor.mjs`,
and `tools/verify.mjs` checks the vendored code byte for byte against the
pinned npm packages and pins each library's network surface by count (see
**Build pins**). 6.9.0 is where Bengali label rendering was tested on a
real device. three.js 0.185.1 is the last release that ships official
minified builds — 0.186 dropped them — and its `three.module.min.js` imports
`./three.core.min.js`, so the pair keeps the package's own file names.
Upgrading is a separate, deliberate task with device testing, never a side
effect.
