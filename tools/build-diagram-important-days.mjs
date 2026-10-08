// Builds the important-days diagram («বছরের চাকা», work in progress; WHEEL-2, revised by WHEEL-3, 2026-10-08):
//
//   node tools/build-diagram-important-days.mjs [<out>]     (default: docs/diagrams/important-days/)
//
// Reads data-sources/important-days/days.seed.json only: no network, no picture. Writes descriptor.json (the view
// `days`, docs/visual/days.js, and its words) and data.json (the built entries — those whose every named day is
// VERIFIED or SINGLE-SOURCE and that have a date — and ⓘ's short list: the circular, its amendments and the UN's list
// of observances). A held-out entry (a CONFLICT, or no date) never reaches data.json; nor does a religious day, a
// declarer or a theme (the user's review, 2026-10-08). No year is shown: a day carries its month and what its date
// tile and row show — the date, its rule («অক্টোবরের প্রথম সোমবার») or the circular's wording («১ বৈশাখ») — and,
// apart, `when`, from which the view works out «আজ» and «x দিন পর» without showing a year. A second build writes the
// same bytes.
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
  if (e.kinds.some((k) => !['national', 'international'].includes(k))) throw new Error(`entry ${e.index}: kind ${e.kinds}`);
}
// A dated day (another calendar) sits in the month of the one Gregorian date the data gives it.
const monthOf = (e) => (e.date.type === 'dated' ? Number(Object.values(e.date.dates)[0].slice(5, 7)) : e.date.m);
const MONTHS_COUNT = Array(12).fill(0);
for (const e of built) MONTHS_COUNT[monthOf(e) - 1]++;

const days = built.map((e) => {
  const c = e.card;
  const card = {};
  if (c.englishName) card.englishName = c.englishName.value ?? c.englishName.bn;
  if (c.firstObserved) card.firstObserved = c.firstObserved.value;
  if (c.purposeBn) card.purposeBn = c.purposeBn.bn;
  if (c.source) card.source = { url: c.source.url, host: new URL(c.source.url).host.replace(/^www\./, '') };
  const t = e.date;
  const when = t.type === 'fixed' ? { type: 'fixed', m: t.m, d: t.d } : t.type === 'rule' ? { type: 'rule', m: t.m, weekday: t.weekday, nth: t.nth } : { type: 'dated', dates: t.dates };
  const shows = t.type === 'fixed' ? {} : { tile: t.tile.map((x) => x.bn), dateText: t.text.bn };
  return { id: `e${e.index}`, nameBn: e.nameBn.bn, kinds: e.kinds, month: monthOf(e), when, ...shows, ...(c.purposeBn ? { purposeBn: c.purposeBn.bn } : {}), tappable: Boolean(card.englishName || card.firstObserved || card.purposeBn), card };
});

// ⓘ: short — the circular, its amendments, the UN's list (the shell adds the font's licence). Each day's own source is
// its card's «সূত্র».
const credits = [
  { title: `Cabinet Division, circular no. ${seed.circular.number} (${seed.circular.date})`, url: seed.circular.url },
  ...seed.amendments.map((a) => ({ title: `Cabinet Division, amendment no. ${a.number} (${a.date})`, url: a.url })),
  ...seed.credits.map((c) => ({ title: c.what, url: c.url })),
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
    legend: Object.fromEntries(Object.entries(W.legend).map(([k, v]) => [k, v.bn])),
    today: W.today.bn,
    listTitle: W.listTitle.bn,
    count: W.count.bn,
    inDays: W.inDays.bn,
    empty: W.empty.bn,
    wheelLabel: W.wheelLabel.bn,
    cardRows: W.cardRows.map((r) => ({ key: r.key, label: r.bn })),
  },
};
const data = {
  _about: 'Built by tools/build-diagram-important-days.mjs from data-sources/important-days/days.seed.json; do not edit. The days Bangladesh observes (the Cabinet Division\'s circular of 11 March 2026 and its amendments), each date verified; religious days removed (the user, 2026-10-08); held-out days (a CONFLICT, or no date) are not here. `when` only times «আজ»; no year is shown.',
  monthCounts: MONTHS_COUNT,
  days,
  credits,
};
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true });
fs.writeFileSync(path.join(out, 'descriptor.json'), JSON.stringify(descriptor, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data, null, 2) + '\n');
const pending = [];
JSON.stringify(seed, (k, v) => { if (v && typeof v === 'object' && typeof v.bn === 'string' && v.approved === false) pending.push(v.bn); return v; });
console.log(`${days.length} days built (${seed.entries.length - days.length} held out), ${days.filter((d) => d.tappable).length} tappable, months ${MONTHS_COUNT.join(' ')}, ${credits.length} credits; ${pending.length} Bengali strings await approval`);
