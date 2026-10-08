// Takes the facts the user read by hand into global-indices' seed (IDX-3, 2026-10-08):
//
//   node tools/ingest-user-input.mjs [<file>] [<seed>]     (defaults: tools/.cache/indices/user-input.md, the seed)
//
// The file has one section per ranking whose site may not be read automatically ("## <id>"), each with exactly these
// lines: edition year, release month, Bangladesh (or Dhaka) rank/N, top, bottom, previous-edition Bangladesh rank.
// A section left empty is skipped: its ranking stays hidden from the map and the list, with no placeholder. A section
// filled in part, or with an impossible value — a rank that is not a whole number, a rank above N, a month that is no
// month, a country this map cannot name, or the same top and bottom — is refused, and nothing is written. Each
// ranking taken in is stored as facts only (Bangladesh's rank of N, the top, the bottom), with its source: the
// official page, «read by the user», and the date; `approved: false` until the user approves it. No network.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readSource } from './lib/geo.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const FILE = process.argv[2] ?? path.join(HERE, '.cache', 'indices', 'user-input.md');
const SEED = process.argv[3] ?? path.join(ROOT, 'data-sources', 'global-indices', 'global-indices.seed.json');
const FIELDS = { year: 'edition year', month: 'release month', bd: 'rank/N', top: 'top', bottom: 'bottom', previous: 'previous-edition' };
const ITEMS = ['gpi', 'gti', 'ghi', 'democracy-index', 'henley-passport', 'clothing-exports', 'economic-freedom', 'gggi', 'eiu-liveability'];

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
// Country names as the user may write them: Natural Earth's English names (Bangladesh's view), and the seed's own
// names for countries with no shape (Israel, Taiwan).
const ne = readSource('ne_10m_admin_0_countries_bdg.geojson');
const byName = new Map();
for (const f of ne.features) {
  const p = f.properties;
  const key = p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3;
  for (const n of [p.NAME_EN, p.NAME, p.NAME_LONG, p.FORMAL_EN, p.ADMIN]) if (n) byName.set(n.trim().toLowerCase(), { iso3: key, name: p.NAME_EN });
}
for (const [iso3, name] of [['ISR', 'Israel'], ['TWN', 'Taiwan']]) byName.set(name.toLowerCase(), { iso3, name });

const text = fs.readFileSync(FILE, 'utf8');
const sections = [...text.matchAll(/^## ([a-z-]+)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((m) => [m[1], m[2]]);
const problems = [];
const taken = [];
const today = new Date().toISOString().slice(0, 10);
for (const [id, body] of sections) {
  if (!ITEMS.includes(id)) { problems.push(`${id}: not one of the user-input rankings (${ITEMS.join(', ')})`); continue; }
  const entry = seed.indices.find((x) => x.id === id);
  const value = (label) => {
    const line = body.split('\n').find((l) => l.replace(/^[-*]\s*/, '').toLowerCase().startsWith(label));
    return line ? line.slice(line.indexOf(':') + 1).trim() : null;
  };
  const got = Object.fromEntries(Object.entries(FIELDS).map(([k, label]) => [k, value(label === 'rank/N' ? '' : label)]));
  // The rank line is the one that names Bangladesh or Dhaka.
  const rankLine = body.split('\n').find((l) => /rank\/n/i.test(l) && !/previous/i.test(l));
  got.bd = rankLine ? rankLine.slice(rankLine.indexOf(':') + 1).trim() : null;
  const filled = Object.values(got).filter((v) => v);
  if (!filled.length) continue; // not read yet: stays hidden
  const bad = [];
  if (filled.length !== Object.keys(FIELDS).length) bad.push(`every field is needed (missing: ${Object.entries(got).filter(([, v]) => !v).map(([k]) => FIELDS[k]).join(', ')})`);
  const year = Number(got.year);
  if (got.year && !(/^\d{4}$/.test(got.year) && year >= 2000 && year <= 2100)) bad.push(`edition year «${got.year}» is not a year`);
  if (got.month && !(/^\d{4}-(0[1-9]|1[0-2])$/.test(got.month))) bad.push(`release month «${got.month}» is not YYYY-MM`);
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(got.bd ?? '');
  const rank = m ? Number(m[1]) : NaN, n = m ? Number(m[2]) : NaN;
  if (got.bd && !m) bad.push(`rank/N «${got.bd}» is not two whole numbers`);
  else if (m && !(rank >= 1 && n >= 1 && rank <= n)) bad.push(`rank ${rank} is not within 1…${n}`);
  const prev = Number(got.previous);
  if (got.previous && !(/^\d+$/.test(got.previous) && prev >= 1)) bad.push(`previous rank «${got.previous}» is not a whole number from 1`);
  const city = entry.kind === 'city';
  const who = (name) => (city ? { name } : byName.get(String(name).trim().toLowerCase()) ?? null);
  for (const k of ['top', 'bottom']) if (got[k] && !who(got[k])) bad.push(`${k} «${got[k]}»: no such country here (write its English name as Natural Earth has it)`);
  if (got.top && got.bottom && got.top.trim().toLowerCase() === got.bottom.trim().toLowerCase()) bad.push('the top and the bottom are the same');
  if (bad.length) { problems.push(`${id}: ${bad.join('; ')}`); continue; }
  const page = entry.userInput?.pages?.[0] ?? entry.officialUrl;
  const top = who(got.top), bottom = who(got.bottom);
  entry.latest = {
    edition: `${entry.nameEn} ${year}`,
    releaseDate: got.month,
    n,
    bd: { rank },
    top: { ...(top.iso3 ? { iso3: top.iso3 } : {}), name: top.name, rank: 1 },
    bottom: { ...(bottom.iso3 ? { iso3: bottom.iso3 } : {}), name: bottom.name, rank: n },
    source: { url: page, by: 'read by the user', date: today },
    approved: false,
  };
  entry.previous = { bd: { rank: prev } };
  taken.push(`${id} ${rank}/${n}`);
}
if (problems.length) {
  console.error(`refused — nothing written:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
fs.writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
const hash = crypto.createHash('sha256').update(fs.readFileSync(SEED)).digest('hex');
console.log(`${taken.length} ranking(s) taken in${taken.length ? `: ${taken.join(', ')}` : ''}; the seed is now ${hash} — the pin in tools/verify-descriptor.mjs moves only with the user's approval`);
