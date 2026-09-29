// The Rivers of Bangladesh seed: one common file and one file per river system,
// merged into the one shape the build and the validators read.
//
//   data-sources/bangladesh-rivers/bangladesh-rivers.seed.json   the diagram: words, sources,
//       countries, frames (their bounds and views), ⓘ's lines, and `systems` — the order of
//   data-sources/bangladesh-rivers/systems/<id>.seed.json         one system each: its labels,
//       lines (and, for the Jamuna, the main line's recipe), markers, cards, continuations, and
//       per frame the lines, markers and labels it draws there.
//
// Every id — line, card, marker, label — is stable and unique across the systems; the merge
// refuses a duplicate. Each file is pinned by SHA-256 in tools/verify-descriptor.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COMMON = 'bangladesh-rivers.seed.json';

export function loadRiversSeed(dir) {
  const read = (file) => {
    const buf = fs.readFileSync(path.join(dir, file));
    return { json: JSON.parse(buf.toString('utf8')), file, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  };
  const common = read(COMMON);
  const systems = common.json.systems.map((id) => {
    const s = read(path.join('systems', `${id}.seed.json`));
    if (s.json.id !== id) throw new Error(`rivers seed: systems/${id}.seed.json says it is «${s.json.id}»`);
    return s;
  });
  const unique = (what, ids) => {
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`rivers seed: the ${what} id «${id}» is used twice`);
      seen.add(id);
    }
  };
  const all = (key) => systems.flatMap((s) => (s.json[key] ?? []).map((x) => ({ ...x, system: s.json.id })));
  const { systems: order, ...rest } = common.json;
  const frames = {};
  for (const [name, frame] of Object.entries(common.json.geometry.frames)) {
    const part = (key) => systems.flatMap((s) => s.json.frames?.[name]?.[key] ?? []);
    frames[name] = { ...frame, lines: part('lines'), markers: part('markers'), labels: part('labels') };
  }
  const lines = Object.assign({}, ...systems.map((s) => Object.fromEntries(Object.entries(s.json.geometry?.lines ?? {}).map(([id, l]) => [id, { ...l, system: s.json.id }]))));
  unique('line', systems.flatMap((s) => [...Object.keys(s.json.geometry?.lines ?? {}), ...(s.json.geometry?.main ? ['main'] : [])]));
  unique('card', all('entities').map((e) => e.id));
  unique('marker', all('markers').map((m) => m.id));
  unique('label', systems.flatMap((s) => Object.keys(s.json.labelsBn ?? {}).filter((k) => !k.startsWith('_'))));
  const mains = systems.filter((s) => s.json.geometry?.main);
  if (mains.length !== 1) throw new Error(`rivers seed: ${mains.length} systems carry the main line's recipe, not one`);
  const seed = {
    ...rest,
    labelsBn: Object.assign({}, common.json.labelsBn ?? {}, ...systems.map((s) => s.json.labelsBn ?? {})),
    geometry: { ...common.json.geometry, main: { ...mains[0].json.geometry.main, system: mains[0].json.id }, lines, frames },
    markers: all('markers').map(({ system, ...m }) => ({ ...m, system })),
    entities: all('entities'),
    continuations: all('continuations'),
    systems: systems.map((s) => ({ id: s.json.id, nameBn: s.json.nameBn ?? null })),
  };
  return { seed, files: [common, ...systems].map(({ file, sha256 }) => ({ file: file.replace(/\\/g, '/'), sha256 })) };
}
