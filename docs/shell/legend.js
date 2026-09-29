/*
|--------------------------------------------------------------------------
| LEGEND — a shell module: what the map's colours and marks mean, for what it
| draws now
|
|   legend: { items: [{ kind, label, line?: { color, width?, dash? }, image? }],
|             kinds: [{ records, field }] }
|
| One line per item: a sample — a stroke in the line's colour, dashed where it
| says so, or one of the map's own images — and its label. An item is listed
| only while some record drawn on the map carries its `kind` in one of the
| `kinds` fields (a river's role, a marker's kind), so the legend shrinks to
| what the current view shows — one river system's roles and marks. Drawn in
| the map's bottom-left corner, 14 px text, above the map and under the card.
|
| Loaded only for a map whose descriptor declares `legend`.
|--------------------------------------------------------------------------
*/

let spec;
let shell;
let box;
const rows = new Map(); // kind -> its row

export async function mount(api) {
  shell = api;
  spec = api.descriptor.legend;
  if (!Array.isArray(spec.items) || !spec.items.length) throw new Error('legend: items must be a non-empty list');
  if (!Array.isArray(spec.kinds) || !spec.kinds.length) throw new Error('legend: kinds must name at least one records field');
  for (const k of spec.kinds) if (!api.records[k.records]) throw new Error(`legend: "${k.records}" is not a records table`);
  await stylesheet(api, './legend.css?v=4dbc90b9b6');
  box = api.own.node(document.createElement('ul'), 'legend');
  box.className = 'map-legend';
  box.lang = api.language ?? 'bn';
  for (const item of spec.items) {
    const li = document.createElement('li');
    li.className = 'map-legend-item';
    li.dataset.kind = item.kind;
    const sample = document.createElement('span');
    sample.className = 'map-legend-sample';
    if (item.line) {
      const stroke = document.createElement('span');
      stroke.className = 'map-legend-line';
      stroke.style.borderTopColor = item.line.color;
      stroke.style.borderTopWidth = `${item.line.width ?? 3}px`;
      stroke.style.borderTopStyle = item.line.dash ? 'dashed' : 'solid';
      sample.append(stroke);
    } else if (item.image) {
      const image = api.descriptor.images?.[item.image];
      if (!image) throw new Error(`legend: image "${item.image}" is not declared`);
      const img = document.createElement('img');
      img.className = 'map-legend-image';
      img.alt = '';
      img.src = api.file(image.file);
      sample.append(img);
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    li.append(sample, label);
    box.append(li);
    rows.set(item.kind, li);
  }
  api.dom.mapShell.append(box);
}

export function install(api) {
  render();
  api.onChange(render);
}

/** Only the kinds some drawn record carries. */
function render() {
  const present = new Set();
  for (const { records, field } of spec.kinds) {
    for (const [key, row] of Object.entries(shell.records[records])) if (shell.drawn(records, key)) present.add(row[field]);
  }
  let any = false;
  for (const [kind, li] of rows) {
    li.hidden = !present.has(kind);
    any ||= !li.hidden;
  }
  box.hidden = !any;
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
