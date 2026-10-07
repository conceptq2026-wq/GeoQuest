// The push guard: run before `git push`, after the three suites and tools/check.mjs (the user's push
// guards, 2026-10-07; rule (b), 2026-10-08, BD-6). It reads git and the local caches only — no network.
//
//   node tools/push-guard.mjs [--base=origin/main] [--head=HEAD] [--no-skip]
//
// For the commits base..HEAD:
//   1. fast-forward only: base is an ancestor of HEAD;
//   2. every commit's author and committer is the repo's no-reply identity (git config user.email, a GitHub
//      users.noreply address);
//   3. no e-mail-address pattern in the diff or the commit messages, but GitHub no-reply addresses and the
//      tool's co-author trailer's no-reply address;
//   4. the 8-word quote scan: no run of 8 words that the commits add to a file (a run in the file at HEAD
//      and not at base) appears in a cached source text (SOURCE_TEXTS, in tools/.cache/, out of git). URLs
//      are set aside. Credit fields are skipped (rule (b)): a source is credited by its own title, which is
//      not reused text. Exactly these, and nothing else:
//        docs/maps/<id>/descriptor.json      `attribution` (all of it, `extra[]` included) and every
//                                            `sources.<src>.attribution`;
//        docs/maps/<id>/info.json            the `lines[]` whose `group` is "sources";
//        docs/diagrams/<id>/data.json        `credits` and `creditGroups`.
//      --no-skip scans those too (to count what the rule sets aside);
//   5. no PDF, scan or image added.
// Exits 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BASE = arg('base') ?? 'origin/main';
const HEAD = arg('head') ?? 'HEAD';
const SKIP = !process.argv.includes('--no-skip');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 }).toString('utf8');
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

// The cached source texts a quote could come from: the maritime map's (ITLOS, PCA, bdlaws, the CLCS
// submission, the UN notes, the Teknaf portal) and the NCTB books'.
const SOURCE_TEXTS = [
  ['tools/.cache/bd-maritime/text', /\.txt$/],
  ['tools/.cache/org-members/nctb', /\.txt$/],
  ['tools/.cache/earth-interior', /^book\.txt$/],
];

// 1. Fast-forward only.
let ff = true;
try { git('merge-base', '--is-ancestor', BASE, HEAD); } catch { ff = false; }
const commits = git('log', '--format=%h %ae %ce', `${BASE}..${HEAD}`).split('\n').filter(Boolean);
check(ff && commits.length > 0, `fast-forward from ${BASE}: ${commits.length} new commit(s)`);

// 2. The no-reply identity.
const me = git('config', 'user.email').trim();
const NOREPLY = /^\d+\+[\w-]+@users\.noreply\.github\.com$/;
const strangers = commits.filter((l) => { const [, a, c] = l.split(' '); return a !== me || c !== me; });
check(NOREPLY.test(me) && strangers.length === 0, `every new commit's author and committer is the configured GitHub no-reply identity${strangers.length ? ` — not: ${strangers.map((l) => l.split(' ')[0]).join(', ')}` : ''}`);

// 3. E-mail patterns in the diff and the messages.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const ALLOWED = [NOREPLY, /^noreply@anthropic\.com$/];
const found = [...git('diff', `${BASE}..${HEAD}`).matchAll(EMAIL), ...git('log', '--format=%B', `${BASE}..${HEAD}`).matchAll(EMAIL)].map((m) => m[0]).filter((e) => !ALLOWED.some((a) => a.test(e)));
check(found.length === 0, `no e-mail-address pattern in the diff or the commit messages${found.length ? ` — ${found.length} found (not printed)` : ''}`);

// 4. The 8-word quote scan.
const words = (s) => s.replace(/https?:[^\s"'<>)]+/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim().split(' ').filter(Boolean);
const runs = (s) => { const w = words(s); const out = new Set(); for (let i = 0; i + 8 <= w.length; i++) out.add(w.slice(i, i + 8).join(' ')); return out; };
const sources = new Map();
let texts = 0;
for (const [dir, re] of SOURCE_TEXTS) {
  const at = path.join(ROOT, dir);
  if (!fs.existsSync(at)) continue;
  for (const f of fs.readdirSync(at).filter((f) => re.test(f))) {
    texts++;
    for (const r of runs(fs.readFileSync(path.join(at, f), 'utf8'))) sources.set(r, `${dir}/${f}`);
  }
}
// What a file says once the credit fields are set aside (rule (b)).
const withoutCredits = (file, text) => {
  if (!SKIP || !file.endsWith('.json')) return text;
  let j;
  try { j = JSON.parse(text); } catch { return text; }
  if (/^docs\/maps\/[^/]+\/descriptor\.json$/.test(file)) {
    delete j.attribution;
    for (const s of Object.values(j.sources ?? {})) if (s && typeof s === 'object') delete s.attribution;
  } else if (/^docs\/maps\/[^/]+\/info\.json$/.test(file) && Array.isArray(j.lines)) {
    j.lines = j.lines.filter((l) => l?.group !== 'sources');
  } else if (/^docs\/diagrams\/[^/]+\/data\.json$/.test(file)) {
    delete j.credits;
    delete j.creditGroups;
  } else return text;
  return JSON.stringify(j);
};
// A file new in the range has no text at base.
const show = (rev, file) => { try { return execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); } catch { return ''; } };
const changed = git('diff', '--name-only', '--diff-filter=AM', `${BASE}..${HEAD}`).split('\n').filter(Boolean).filter((f) => !/\.(pdf|png|jpe?g|webp|gif|avif|pmtiles|woff2?|ttf|otf|zip|pbf)$/i.test(f));
const hits = [];
for (const f of changed) {
  const before = runs(withoutCredits(f, show(BASE, f)));
  for (const r of runs(withoutCredits(f, show(HEAD, f)))) if (!before.has(r) && sources.has(r)) hits.push(`${f}: «${r}» (${sources.get(r)})`);
}
check(texts > 0 && hits.length === 0, `8-word quote scan${SKIP ? ', credit fields skipped' : ', nothing skipped (--no-skip)'}: ${changed.length} changed text files against ${texts} cached source texts — ${hits.length} hit(s)${hits.length ? `\n  ${hits.slice(0, 20).join('\n  ')}${hits.length > 20 ? `\n  … ${hits.length - 20} more` : ''}` : ''}`);

// 5. No PDF, scan or image added.
const added = git('diff', '--name-only', '--diff-filter=A', `${BASE}..${HEAD}`).split('\n').filter(Boolean);
const binary = added.filter((f) => /\.(pdf|png|jpe?g|webp|gif|avif|tiff?|bmp|svg)$/i.test(f));
check(binary.length === 0, `no PDF, scan or image added (${added.length} file(s) added)${binary.length ? ` — ${binary.join(', ')}` : ''}`);

if (failures) { console.error(`\n${failures} guard(s) failed — do not push.`); process.exit(1); }
console.log('\nAll push guards passed.');
