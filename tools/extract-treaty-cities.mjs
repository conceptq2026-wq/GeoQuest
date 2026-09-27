// One-off: finds the Wikidata item of every city the environment-treaties
// seed names, and saves its point with the revision it was read at, so the
// build reads a committed file and never a live service.
//
//   data-sources/environment-treaties/cities.seed.json
//
// Each city is searched by its seed `cityQuery` — never by bare name: a label
// or alias must equal the city part exactly, in English or in Wikidata's
// multilingual `mul` (where many cities now keep their name — Poznań has no
// English label of its own), the item's country (P17) must be the country the
// query names, and the item must be a human settlement or an administrative
// territorial entity (P31/P279*) — Madrid is typed only as a municipality of
// Spain, which Wikidata's classes do not make a settlement — or the kind KINDS
// names for the one query that is not a city. Of what passes, the item with
// the most sitelinks is taken, and every candidate is recorded. Then a second,
// independent constraint: the winner must be the item of the English Wikipedia
// article on the place — the city's name, else "City, Country", else "City,
// Region" (a disambiguation page never counts) — or the tool fails, naming
// both. Neither lookup alone is trusted: the first once took a one-sitelink
// "Maŷrīṭ" for Madrid, and a kelurahan on Sumbawa for Bali.
//
// Re-run only on purpose, then review the diff and update the checksum in
// tools/sources.json (treatyCities); the build refuses a file that differs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The editor's seed, read and never written, and the file this writes. Change here if they move.
const SEED = path.join(ROOT, 'data-sources/environment-treaties/treaties.seed.json');
const OUT = path.join(ROOT, 'data-sources/environment-treaties/cities.seed.json');
const UA = { 'User-Agent': 'GeoQuest-map-build/1.0 (https://github.com/conceptq2026-wq/GeoQuest)', Accept: 'application/json' };
const TABLES = ['conventions', 'treaties', 'summits', 'cops'];

/*
 * The countries the queries name, by their Wikidata items. Checked against
 * each item's own English label before anything is searched, so a wrong
 * number here fails instead of constraining the search to another country.
 */
const COUNTRIES = {
  Iran: 'Q794', France: 'Q142', Germany: 'Q183', Austria: 'Q40', Switzerland: 'Q39', Brazil: 'Q155',
  Netherlands: 'Q55', Sweden: 'Q34', Japan: 'Q17', Canada: 'Q16', Rwanda: 'Q1037', 'United States': 'Q30',
  Argentina: 'Q414', Morocco: 'Q1028', India: 'Q668', Italy: 'Q38', Kenya: 'Q114', Indonesia: 'Q252',
  Poland: 'Q36', Denmark: 'Q35', Mexico: 'Q96', 'South Africa': 'Q258', Qatar: 'Q846', Peru: 'Q419',
  Spain: 'Q29', 'United Kingdom': 'Q145', Egypt: 'Q79', 'United Arab Emirates': 'Q878', Azerbaijan: 'Q227',
};
const SETTLEMENT = 'Q486972';
const ADMINISTRATIVE = 'Q56061';
// A query that names a place other than a city, with the kind it names.
const KINDS = {
  'Bali, Indonesia': { type: 'Q5098', why: "The seed names Bali, not a city in it — COP 13 met at Nusa Dua, on the island. The item that is Bali (the English article 'Bali') is the province (province of Indonesia, Q5098), whose point is the island's middle; a kelurahan also called Bali, on Sumbawa, is a settlement and would pass as one." },
};

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const queries = new Map(); // cityQuery -> the records that name it
for (const table of TABLES)
  for (const [key, r] of Object.entries(seed[table])) if (r.cityQuery) queries.set(r.cityQuery, [...(queries.get(r.cityQuery) ?? []), key]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`${url} -> ${res.status}`);
    await sleep(3000 * attempt);
  }
}
const entities = async (ids, props) => (await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=${props}&languages=en&format=json`)).entities;

// The country table, checked.
const named = [...new Set([...queries.keys()].map((q) => q.split(',').at(-1).trim()))];
const unknown = named.filter((c) => !COUNTRIES[c]);
if (unknown.length) throw new Error(`no Wikidata item listed for: ${unknown.join(', ')}`);
const countryItems = await entities(named.map((c) => COUNTRIES[c]), 'labels');
const wrong = named.filter((c) => countryItems[COUNTRIES[c]]?.labels?.en?.value !== c);
if (wrong.length) throw new Error(`country items whose label is not the name: ${wrong.map((c) => `${c} → ${COUNTRIES[c]} "${countryItems[COUNTRIES[c]]?.labels?.en?.value}"`).join('; ')}`);

const out = {
  _about: `The Wikidata item and point of every city tools/extract-treaty-cities.mjs found for the environment-treaties seed, keyed by the seed's cityQuery. Read at the revision each citation names; retrieved ${new Date().toISOString().slice(0, 10)}. Constraint: exact label or alias in English or mul, the country (P17) the query names, and a human settlement (${SETTLEMENT}) by P31/P279* — or, for a query KINDS names, that kind; the item with the most sitelinks wins, and every candidate is listed.`,
};
for (const [query, keys] of queries) {
  const parts = query.split(',').map((s) => s.trim());
  const [city, country] = [parts[0], parts.at(-1)];
  const kinds = KINDS[query] ? [KINDS[query].type] : [SETTLEMENT, ADMINISTRATIVE];
  const sparql = `SELECT DISTINCT ?item ?links WHERE {
    VALUES ?name { "${city}"@en "${city}"@mul }
    VALUES ?kind { ${kinds.map((k) => `wd:${k}`).join(' ')} }
    { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
    ?item wdt:P17 wd:${COUNTRIES[country]} ; wdt:P625 ?coord ; wikibase:sitelinks ?links .
    ?item wdt:P31/wdt:P279* ?kind .
  }`;
  const rows = (await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`)).results.bindings;
  const candidates = [...new Map(rows.map((b) => [b.item.value.split('/').at(-1), Number(b.links.value)])).entries()].sort((a, b) => b[1] - a[1]);
  if (!candidates.length) throw new Error(`${query}: no item passes the constraint`);
  const labels = await entities(candidates.map(([q]) => q), 'labels');
  const [qid] = candidates[0];
  // The cross-check: the English article on the place, by exact title.
  let article = null;
  for (const title of [city, `${city}, ${country}`, ...(parts.length > 2 ? [`${city}, ${parts[1]}`] : [])]) {
    const r = await json(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item|disambiguation&redirects=1&format=json&titles=${encodeURIComponent(title)}`);
    const page = Object.values(r.query.pages)[0];
    if (page.missing !== undefined || page.pageprops?.disambiguation !== undefined || !page.pageprops?.wikibase_item) continue;
    article = { title: page.title, qid: page.pageprops.wikibase_item };
    break;
  }
  if (!article) throw new Error(`${query}: no English article on the place to check the item against`);
  if (article.qid !== qid) throw new Error(`${query}: the search takes ${qid}, the English article "${article.title}" is ${article.qid}`);
  const e = (await entities([qid], 'info|claims|labels'))[qid];
  const mul = (await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=mul&format=json`)).entities[qid];
  const claims = e.claims?.P625 ?? [];
  const claim = claims.find((c) => c.rank === 'preferred') ?? claims.find((c) => c.rank === 'normal');
  const v = claim?.mainsnak?.datavalue?.value;
  if (!v) throw new Error(`${query}: ${qid} has no usable P625`);
  const at = [Number(v.longitude.toFixed(6)), Number(v.latitude.toFixed(6))];
  const label = e.labels?.en?.value ?? mul.labels?.mul?.value;
  out[query] = {
    wikidata: qid,
    labelEn: label,
    at,
    records: keys,
    ...(KINDS[query] ? { kind: KINDS[query].type, why: KINDS[query].why } : {}),
    article: article.title,
    found: `${candidates.length} item${candidates.length === 1 ? '' : 's'} pass${candidates.length === 1 ? 'es' : ''}: ${candidates.map(([q, n]) => `${q} ${labels[q]?.labels?.en?.value ?? '(mul label only)'} (${n} sitelinks)`).join('; ')}.`,
    sources: {
      at: [
        {
          title: `${label} (${qid})`,
          publisher: `Wikidata (revision ${e.lastrevid}, ${e.modified.slice(0, 10)})`,
          url: `https://www.wikidata.org/w/index.php?title=${qid}&oldid=${e.lastrevid}`,
          states: `coordinate location (P625): ${v.latitude}, ${v.longitude}`,
          retrieved: new Date().toISOString().slice(0, 10),
        },
      ],
    },
  };
  console.log(`${query.padEnd(34)} ${qid.padEnd(10)} ${String(at).padEnd(24)} ${out[query].found}`);
  await sleep(1200);
}

const text = JSON.stringify(out, null, 2) + '\n';
fs.writeFileSync(OUT, text);
console.log(`\n${Object.keys(out).length - 1} cities -> ${path.relative(ROOT, OUT)}, sha256 ${crypto.createHash('sha256').update(text).digest('hex')}`);
