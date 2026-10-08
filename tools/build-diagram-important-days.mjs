// Builds the important-days diagram («বছরের চাকা», work in progress, WHEEL-2, 2026-10-08) from its seed:
//
//   node tools/build-diagram-important-days.mjs [<out>]     (default: docs/diagrams/important-days/)
//
// Reads data-sources/important-days/days.seed.json only: no network, no picture. Writes descriptor.json (the view
// `days`, docs/visual/days.js, and its words) and data.json (the built entries — those whose every named day is
// VERIFIED or SINGLE-SOURCE and that have a date — and the sources they cite, for ⓘ). A held-out entry (a CONFLICT,
// or no date) never reaches data.json. A second build writes the same bytes.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const ID = 'important-days';
const out = process.argv[2] ?? path.join(ROOT, 'docs', 'diagrams', ID);
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-sources', ID, 'days.seed.json'), 'utf8'));
const W = seed.words;

const built = seed.entries.filter((e) => e.status === 'built');
for (const e of built) {
  if (!e.date) throw new Error(`entry ${e.index}: built with no date`);
  if (e.named.some((d) => d.status === 'CONFLICT')) throw new Error(`entry ${e.index}: built with a CONFLICT`);
}
const MONTHS_COUNT = Array(12).fill(0);
for (const e of built) MONTHS_COUNT[(e.date.type === 'dated' ? Number(e.date.dates[2026].slice(5, 7)) : e.date.m) - 1]++;

// The days, as the view reads them: the card's facts, a theme by year.
const days = built.map((e) => {
  const c = e.card;
  const card = {};
  if (c.englishName) card.englishName = c.englishName.value ?? c.englishName.bn;
  if (c.declaredBy) card.declaredBy = c.declaredBy.value ?? c.declaredBy.bn;
  if (c.firstObserved) card.firstObserved = c.firstObserved.value;
  if (c.purposeBn) card.purposeBn = c.purposeBn.bn;
  if (c.themes) card.themes = Object.fromEntries(Object.entries(c.themes).map(([y, t]) => [y, t.bn ?? t.text]));
  const date = e.date.type === 'fixed' ? { type: 'fixed', m: e.date.m, d: e.date.d } : e.date.type === 'rule' ? { type: 'rule', m: e.date.m, weekday: e.date.weekday, nth: e.date.nth } : { type: 'dated', dates: e.date.dates };
  return { id: `e${e.index}`, nameBn: e.nameBn.bn, kinds: e.kinds, date, ...(c.purposeBn ? { purposeBn: c.purposeBn.bn } : {}), card };
});

// ⓘ: the circular and its amendments first; then every page a built day cites, once, by who publishes it.
const host = (u) => new URL(u).host;
const isBd = (u) => /\.gov\.bd$/.test(host(u)) || /office-cabinet|office-|\.gov\.bd/.test(u);
const cited = new Map();
const cite = (url, title) => { if (url && /^https?:/.test(url) && !cited.has(url)) cited.set(url, title); };
for (const e of built) {
  for (const d of e.named) for (const s of d.sources ?? []) cite(s.url, s.what);
  for (const k of ['englishName', 'declaredBy', 'firstObserved', 'purposeBn']) if (e.card[k]) cite(e.card[k].url, null);
  for (const t of Object.values(e.card.themes ?? {})) cite(t.url, null);
}
const circularUrls = new Set([seed.circular.url, ...seed.amendments.map((a) => a.url)]);
const titleOf = (url, given) => {
  const t = (given ?? '').replace(/\s+/g, ' ').trim();
  if (t && t.length <= 140 && !/[ঀ-৿]/.test(t)) return t;
  const u = new URL(url);
  return `${u.host}${decodeURIComponent(u.pathname).replace(/\/$/, '').slice(0, 80)}`;
};
const credits = [
  { title: `Cabinet Division, circular no. ${seed.circular.number} (${seed.circular.date})`, url: seed.circular.url },
  ...seed.amendments.map((a) => ({ title: `Cabinet Division, amendment no. ${a.number} (${a.date})`, url: a.url })),
  ...[...cited].filter(([u]) => !circularUrls.has(u)).map(([url, t]) => ({ title: titleOf(url, t), url, group: isBd(url) ? 'bd' : 'intl' })).sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title) || a.url.localeCompare(b.url)),
];

const descriptor = {
  id: ID,
  section: seed.section,
  language: 'bn',
  title: { en: 'Year Wheel of Days', bn: W.title.bn },
  data: 'data.json',
  views: [{ id: 'wheel', type: 'days' }],
  words: {
    picker: W.picker.bn,
    close: W.close.bn,
    months: W.months.map((m) => m.bn),
    kinds: Object.fromEntries(Object.entries(W.kinds).map(([k, v]) => [k, v.bn])),
    listTitle: W.listTitle.bn,
    count: W.count.bn,
    inDays: W.inDays.bn,
    empty: W.empty.bn,
    wheelLabel: W.wheelLabel.bn,
    cardRows: W.cardRows.map((r) => ({ key: r.key, label: r.bn })),
  },
};
const data = {
  _about: 'Built by tools/build-diagram-important-days.mjs from data-sources/important-days/days.seed.json; do not edit. The days Bangladesh observes (the Cabinet Division\'s circular of 11 March 2026 and its amendments), each date verified; held-out days (a CONFLICT, or no date) are not here.',
  monthCounts: MONTHS_COUNT,
  days,
  credits,
  creditGroups: { bd: W.creditGroups.bd.bn, intl: W.creditGroups.intl.bn },
};
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true });
fs.writeFileSync(path.join(out, 'descriptor.json'), JSON.stringify(descriptor, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data, null, 2) + '\n');
const pending = [];
JSON.stringify(seed, (k, v) => { if (v && typeof v === 'object' && typeof v.bn === 'string' && v.approved === false) pending.push(v.bn); return v; });
console.log(`${days.length} days built (${seed.entries.length - days.length} held out), months ${MONTHS_COUNT.join(' ')}, ${credits.length} credits; ${pending.length} Bengali strings await approval`);
