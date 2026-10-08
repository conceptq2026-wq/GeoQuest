// E-mail addresses out of the cache (the user's rule, IDX-3, 2026-10-08): a fetched source is checked against its pin
// as downloaded, and only then written — a text file with every e-mail pattern replaced (a record beside it says so);
// a binary file as pinned. The text is read
// as bytes (latin1), so no encoding is touched. Used by tools/fetch-sources.mjs.
import fs from 'node:fs';
import crypto from 'node:crypto';

// An address: a local part, @, a domain with at least one dot; not an image or code file named like one (a name with
// an @2x suffix and a .png ending).
export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?!(?:png|jpe?g|gif|svg|webp|css|js|pdf)\b)[A-Za-z]{2,}/g;
const TEXT = /\.(html?|json|csv|txt|xml|md|tsv)$/i;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const SIDECAR = (dest) => `${dest}.scrubbed.json`;

/** Writes a verified source to `dest` without any e-mail address; returns what it did. */
export function keepScrubbed(dest, buf) {
  const view = buf.toString('latin1');
  const count = view.match(EMAIL)?.length ?? 0;
  fs.rmSync(SIDECAR(dest), { force: true });
  if (!count) {
    fs.writeFileSync(dest, buf);
    return { kept: true, count: 0 };
  }
  // A binary (an archive, a PDF, an image) is kept as pinned: its bytes are compressed or encoded, a pattern in them
  // is not text anyone reads, and changing it would break its pin. Its extracted text, where a map uses one, is
  // scrubbed when it is made (tools/lib/html-text.mjs, or here when written as a text file).
  if (!TEXT.test(dest)) {
    fs.writeFileSync(dest, buf);
    return { kept: true, count: 0 };
  }
  const out = Buffer.from(view.replace(EMAIL, '[address removed]'), 'latin1');
  fs.writeFileSync(dest, out);
  // The record that it was scrubbed: the pinned download's hash, the kept file's, and how many addresses went.
  fs.writeFileSync(SIDECAR(dest), JSON.stringify({ rawSha256: sha256(buf), sha256: sha256(out), removed: count }) + '\n');
  return { kept: true, count };
}

/** A cached copy that is the pinned download, or that download scrubbed (its record says so and its hash agrees). */
export function cachedCopy(dest, check) {
  if (!fs.existsSync(dest)) return null;
  const buf = fs.readFileSync(dest);
  if (check(buf)) {
    // A copy cached before this rule, verified but holding an address: written again without it.
    if (TEXT.test(dest) && (buf.toString('latin1').match(EMAIL)?.length ?? 0) > 0) keepScrubbed(dest, buf);
    return buf;
  }
  if (!fs.existsSync(SIDECAR(dest))) return null;
  const note = JSON.parse(fs.readFileSync(SIDECAR(dest), 'utf8'));
  return note.sha256 === sha256(buf) ? buf : null;
}
