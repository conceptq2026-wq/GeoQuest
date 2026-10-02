/*
|--------------------------------------------------------------------------
| INFO — a shell module: ⓘ in three headed blocks
|
|   info: { file, headings: { sources, notes, conflicts } }
|
| ⓘ stays where every map has it — its own row under the picker row, an 18 px
| icon at 0.35 opacity, its 44 px tap zone — and still opens MapLibre's own
| credits, gathered from the sources. Opened, it shows them under a heading
| (`sources`), followed by the map's plain lines from `file`
| (`{ lines: [{ text, group }] }`, `group` "notes" or "conflicts"), each group
| under its heading — the diagrams' ⓘ, on a map. 14 px text; the panel
| scrolls inside itself when it is taller than the screen allows.
|
| Loaded only for a map whose descriptor declares `info`.
|--------------------------------------------------------------------------
*/

let spec;
let lines = [];

export async function mount(api) {
  spec = api.descriptor.info;
  for (const key of ['sources', 'notes', 'conflicts']) if (typeof spec.headings?.[key] !== 'string') throw new Error(`info: headings.${key} is required`);
  const response = await fetch(api.file(spec.file));
  if (!response.ok) throw new Error(`info: ${spec.file} -> ${response.status}`);
  lines = (await response.json()).lines ?? [];
  for (const line of lines) if (!['notes', 'conflicts'].includes(line.group) || typeof line.text !== 'string') throw new Error('info: every line is { text, group: "notes" | "conflicts" }');
  await stylesheet(api, './info.css?v=628d4ffd04');
}

/** Once the credits row exists: the headed panel inside ⓘ, filled from the credits whenever it opens. */
export function install(api) {
  const row = document.querySelector('.info-credits');
  const control = row?.querySelector('.maplibregl-ctrl-attrib');
  const credits = control?.querySelector('.maplibregl-ctrl-attrib-inner');
  if (!control || !credits) throw new Error('info: the credits row is not built');
  row.classList.add('has-info-blocks');
  api.own.undo('info blocks', () => row.classList.remove('has-info-blocks'));

  const panel = api.own.node(document.createElement('div'), 'info panel');
  panel.className = 'info-panel';
  panel.lang = api.language ?? 'bn';
  const block = (heading) => {
    const h = document.createElement('h3');
    h.className = 'info-heading';
    h.textContent = heading;
    panel.append(h);
  };
  block(spec.headings.sources);
  const sources = document.createElement('div');
  sources.className = 'info-sources';
  panel.append(sources);
  for (const group of ['notes', 'conflicts']) {
    const mine = lines.filter((l) => l.group === group);
    if (!mine.length) continue;
    block(spec.headings[group]);
    const list = document.createElement('ul');
    list.className = 'info-lines';
    for (const l of mine) {
      const li = document.createElement('li');
      li.textContent = l.text;
      list.append(li);
    }
    panel.append(list);
  }
  control.append(panel);

  // MapLibre rewrites its credits as sources load; they are copied in each time ⓘ opens.
  const fill = () => {
    sources.innerHTML = credits.innerHTML;
  };
  fill();
  api.own.domHandler(control, 'toggle', fill);
  api.own.domHandler(control.querySelector('.maplibregl-ctrl-attrib-button') ?? control, 'click', () => setTimeout(fill, 0));
}

function stylesheet(api, href) {
  return new Promise((resolve, reject) => {
    const link = api.own.node(document.createElement('link'), `stylesheet ${href}`);
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`${href} did not load`));
    document.head.appendChild(link);
  });
}
