// Cache-busting for the shells' own code (the user's rule, 2026-09-29): every
// reference to a script or stylesheet under docs/shell/, docs/visual/ or
// docs/shared/ ends in ?v=<version>, so that after a push no phone or WebView
// keeps an old stylesheet or script beside a new page. One version for all of
// it: a short SHA-256 of the shells' code (their pages, scripts and styles,
// the vendored libraries aside, whose folders carry their own versions), read
// with every ?v= taken out — so writing the version never changes it.
// tools/stamp-assets.mjs writes it; tools/verify.mjs holds every reference to
// it. Data files, fonts and PMTiles carry none.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// The folders whose code is versioned, under the served tree.
export const CODE_DIRS = ['shell', 'visual', 'shared'];
const CODE = /\.(m?js|css|html)$/;
const VERSION_LENGTH = 10;

// A reference: a relative path to a script or stylesheet, quoted in code or an
// href / src in a page, with or without a version already on it.
const IN_CODE = /(['"`])(\.\.?\/[^'"`\s?]+\.(?:m?js|css))(?:\?v=[0-9a-f]+)?\1/g;
const IN_PAGE = /(\s(?:href|src)=")(\.\.?\/[^"\s?]+\.(?:m?js|css))(?:\?v=[0-9a-f]+)?(")/g;
const patternFor = (file) => (file.endsWith('.html') ? IN_PAGE : IN_CODE);

/** The versioned files: every page, script and stylesheet in CODE_DIRS but the vendored ones. */
export function codeFiles(served) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['vendor', 'fonts', 'tiles'].includes(e.name)) walk(p);
      } else if (CODE.test(e.name)) out.push(p);
    }
  };
  for (const d of CODE_DIRS) walk(path.join(served, d));
  return out;
}

/** A file's text with every version taken off its references. */
export const unversioned = (file, text) => text.replace(patternFor(file), (...m) => (file.endsWith('.html') ? `${m[1]}${m[2]}${m[3]}` : `${m[1]}${m[2]}${m[1]}`));

/** The version of the shells' code as it stands. */
export function assetVersion(served) {
  const hash = crypto.createHash('sha256');
  for (const f of codeFiles(served)) hash.update(`${path.relative(served, f).split(path.sep).join('/')}\n${unversioned(f, fs.readFileSync(f, 'utf8'))}\n`);
  return hash.digest('hex').slice(0, VERSION_LENGTH);
}

/** Every reference in a file: the path it names and the version it carries (or null). */
export function references(file, text) {
  const out = [];
  for (const m of text.matchAll(file.endsWith('.html') ? /\s(?:href|src)="(\.\.?\/[^"\s?]+\.(?:m?js|css))(?:\?v=([0-9a-f]+))?"/g : /(['"`])(\.\.?\/[^'"`\s?]+\.(?:m?js|css))(?:\?v=([0-9a-f]+))?\1/g))
    out.push(file.endsWith('.html') ? { ref: m[1], v: m[2] ?? null } : { ref: m[2], v: m[3] ?? null });
  return out;
}

/** A file's text with every reference carrying `version`. */
export const stamped = (file, text, version) => text.replace(patternFor(file), (...m) => (file.endsWith('.html') ? `${m[1]}${m[2]}?v=${version}${m[3]}` : `${m[1]}${m[2]}?v=${version}${m[1]}`));
