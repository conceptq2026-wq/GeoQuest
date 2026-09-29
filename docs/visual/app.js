/*
|--------------------------------------------------------------------------
| THE DIAGRAM SHELL — one page for every interactive diagram,
| visual/index.html?v=<id>.
|--------------------------------------------------------------------------
|
| It reads the diagram's descriptor and data, draws one tab per view the
| descriptor declares and the credits under ⓘ, and hands each view's panel to
| that view's own module, loaded only when its tab first opens. Every file it
| asks for is one of the diagram's own, through the resolver's `diagrams`
| kind; nothing else is requested and no API is called (CLAUDE.md,
| "Interactive diagrams").
|
| If the diagram cannot be loaded — its descriptor, its data, a view's own
| file or its picture — the page says so, in the descriptor's words once it
| has them, and in its own copy of them when the descriptor itself fails.
|
| From the map shell, as it is there: the ?v= id rule (the map shell's rule
| for ?map=), the visually hidden title, the compact ⓘ with the Noto Sans
| Bengali credit, the load notice's look, and the tab bar's roles and arrow
| keys.
*/

import { resolver } from '../shared/resolver.js?v=2120da1993';

const dom = {
  header: document.querySelector('.visual-header'),
  title: document.getElementById('pageTitle'),
  tabs: document.getElementById('viewTabs'),
  panels: document.getElementById('panels'),
  attrib: document.getElementById('attrib'),
  attribButton: document.getElementById('attribButton'),
  attribInner: document.getElementById('attribInner'),
  notice: document.getElementById('loadNotice'),
  noticeHeadline: document.getElementById('loadNoticeHeadline'),
  noticeAdvice: document.getElementById('loadNoticeAdvice'),
};

/*
| A view type's module, by the descriptor's `type`. A view that declares no
| type is not built yet: its tab is there and its panel stays empty. A type
| with no module here is an error.
*/
const VIEW_MODULES = {
  exploded: () => import('./exploded.js?v=2120da1993'),
  cutaway: () => import('./cutaway.js?v=2120da1993'),
  orbit: () => import('./orbit.js?v=2120da1993'),
  rivers: () => import('./rivers.js?v=2120da1993'),
};

const diagramId = new URLSearchParams(location.search).get('v');
if (!diagramId) throw new Error('no ?v=<id> given');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(diagramId)) throw new Error(`"${diagramId}" is not a valid diagram id`);

/** A file of this diagram's, through the resolver. */
const diagramFile = (name) => resolver.url('diagrams', `${diagramId}/${name}`);
const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

/*
| THE LOAD NOTICE. The page carries its own copy of the words, for a
| descriptor that never arrives; once the descriptor is in, its words are the
| ones shown.
*/
let words = null;

function showLoadFailure(error) {
  console.error(error);
  if (words?.loadFailed) dom.noticeHeadline.textContent = words.loadFailed;
  if (words?.loadAdvice) dom.noticeAdvice.textContent = words.loadAdvice;
  dom.notice.hidden = false;
}

try {
  await start();
} catch (error) {
  showLoadFailure(error);
}

async function start() {
  const descriptor = await fetchJson(diagramFile('descriptor.json'));
  words = descriptor.words ?? null;

  // Every diagram so far is in Bengali; the map shell's English exception has
  // no diagram yet, so another language is refused rather than half supported.
  if ((descriptor.language ?? 'bn') !== 'bn') throw new Error(`language "${descriptor.language}" is not supported by the diagram shell`);
  for (const view of descriptor.views ?? []) {
    if (view.type && !VIEW_MODULES[view.type]) throw new Error(`view "${view.id}" has type "${view.type}", which the diagram shell has no module for`);
  }
  if (!descriptor.views?.length) throw new Error('the descriptor declares no view');

  // Started together: the data every view reads, and the first view's own file.
  const dataReady = fetchJson(diagramFile(descriptor.data));
  const firstArt = descriptor.views[0].art ? fetchJson(diagramFile(descriptor.views[0].art)) : null;
  firstArt?.catch(() => {}); // awaited, and reported, by the view that asked for it

  // The Bengali title, for the heading screen readers find and for the tab.
  const pageTitle = descriptor.title?.bn;
  if (pageTitle) {
    dom.title.textContent = pageTitle;
    dom.title.hidden = false;
    document.title = pageTitle;
  }

  const data = await dataReady;

  /*
  |--------------------------------------------------------------------------
  | ⓘ — THE CREDITS
  |
  | The map shell's compact attribution control, drawn here without MapLibre:
  | the same "i", collapsed until tapped, the credits beside it. They are the
  | sources the diagram's data cites, from the data alone, and the font's
  | licence. Each opens outside the WebView and reads as plain credit.
  |--------------------------------------------------------------------------
  */

  function creditLink(href, text, lang) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (lang) {
      const span = document.createElement('span');
      span.lang = lang;
      span.textContent = text;
      a.append(span);
    } else a.textContent = text;
    return a;
  }

  // A credit with no link (a value computed for the diagram) reads as plain text.
  function creditText(text, lang) {
    const span = document.createElement('span');
    if (lang) span.lang = lang;
    span.textContent = text;
    return span;
  }

  const credits = [
    ...(data.credits ?? []).map((c) => {
      const a = c.url ? creditLink(c.url, c.title, c.lang) : creditText(c.title, c.lang);
      if (c.by) a.append(` (${c.by})`);
      return a;
    }),
    creditLink(resolver.url('glyphs', 'noto-sans-bengali/OFL.txt'), 'Noto Sans Bengali'),
  ];
  credits.forEach((a, n) => dom.attribInner.append(...(n ? [' | ', a] : [a])));
  dom.attrib.hidden = false;

  // ⓘ sits in a row of its own directly below the picker row, right-aligned —
  // or at the top of a view that has none (the user's decision, 2026-09-28).
  const infoRow = document.createElement('div');
  infoRow.className = 'info-row';
  infoRow.append(dom.attrib);
  const placeInfo = (panel) => {
    const bar = panel.querySelector(':scope > .picker-row');
    if (bar) bar.after(infoRow);
    else panel.prepend(infoRow);
  };

  function setAttribOpen(open) {
    dom.attrib.classList.toggle('open', open);
    dom.attribInner.hidden = !open;
    dom.attribButton.setAttribute('aria-expanded', String(open));
  }
  dom.attribButton.addEventListener('click', () => setAttribOpen(!dom.attrib.classList.contains('open')));

  /*
  |--------------------------------------------------------------------------
  | TABS — one per view, the first open on every load; nothing is kept.
  |--------------------------------------------------------------------------
  */

  const views = descriptor.views.map((view, n) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'view-tab';
    tab.id = `tab-${view.id}`;
    tab.lang = 'bn';
    tab.textContent = view.tab;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `panel-${view.id}`);
    dom.tabs.append(tab);

    const panel = document.createElement('section');
    panel.className = 'view-panel';
    panel.id = `panel-${view.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.hidden = true;
    dom.panels.append(panel);

    return { view, tab, panel, art: n === 0 ? firstArt : null, mounted: null };
  });
  dom.tabs.hidden = views.length < 2;
  // With one view the header holds nothing: the page starts with the view.
  dom.header.hidden = views.length < 2;

  let active = null;

  /** Shows a view; its first showing mounts it. Settles once it is drawn, or fails. */
  function open(entry) {
    active = entry;
    for (const v of views) {
      const on = v === entry;
      v.tab.classList.toggle('active', on);
      v.tab.setAttribute('aria-selected', String(on));
      v.tab.tabIndex = on ? 0 : -1;
      v.panel.hidden = !on;
    }
    placeInfo(entry.panel);
    if (!entry.view.type) return Promise.resolve();
    entry.mounted ??= VIEW_MODULES[entry.view.type]()
      .then((module) => module.mount(entry.panel, { view: entry.view, descriptor, data, art: entry.art ?? (entry.view.art ? fetchJson(diagramFile(entry.view.art)) : null), file: diagramFile }))
      .then(async (mounted) => {
        // Placed before the view lays itself out, under its picker row if it drew one.
        placeInfo(entry.panel);
        await mounted.ready;
        return mounted;
      });
    return entry.mounted.then((mounted) => mounted.shown?.());
  }

  dom.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.view-tab');
    const entry = views.find((v) => v.tab === tab);
    if (entry && entry !== active) open(entry).catch(showLoadFailure);
  });

  // Arrow keys move along the bar, as a tab list's should.
  dom.tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const at = views.indexOf(active);
    const next = views[(at + (event.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length];
    open(next).catch(showLoadFailure);
    next.tab.focus();
  });

  // Escape closes ⓘ first; otherwise the open view has it (it closes its card).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !dom.attrib.classList.contains('open')) return;
    setAttribOpen(false);
    dom.attribButton.focus();
    event.stopImmediatePropagation();
  });

  await open(views[0]);
}
