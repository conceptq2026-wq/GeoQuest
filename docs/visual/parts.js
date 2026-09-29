/*
|--------------------------------------------------------------------------
| PARTS SHARED BY THE DIAGRAM SHELL'S VIEWS — the cutaway (earth-interior)
| and the orbit (seasons): elements, a view's own stylesheet, the picker row
| at the top, and the card docked at the foot with its two columns.
|--------------------------------------------------------------------------
*/

import { pickerRow } from '../shared/picker.js?v=59adf41b77';

export const SVG = 'http://www.w3.org/2000/svg';

export function el(tag, className, lang) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (lang) node.lang = lang;
  return node;
}

export function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** A stylesheet beside this page, once. */
export function stylesheet(href) {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', resolve);
    link.addEventListener('error', () => reject(new Error(`${href} did not load`)));
    document.head.append(link);
  });
}

/**
 * The picker row, at the top, directly under the header, where every shell
 * has it (the user's decision, 2026-09-28): the shared row
 * (../shared/picker.js) on its three elements. Returns the bar to place and
 * the row's { render, sync }, with its select.
 */
export function pickerBar({ placeholder, items, groups, current, choose }) {
  const bar = el('nav', 'picker-row diagram-picker');
  const prev = el('button', 'step-btn');
  prev.type = 'button';
  prev.id = 'prevRecord';
  prev.setAttribute('aria-label', 'Previous');
  prev.textContent = '‹';
  prev.hidden = true;
  const select = el('select', 'record-picker', 'bn');
  select.id = 'recordPicker';
  select.hidden = true;
  const next = el('button', 'step-btn');
  next.type = 'button';
  next.id = 'nextRecord';
  next.setAttribute('aria-label', 'Next');
  next.textContent = '›';
  next.hidden = true;
  bar.append(prev, select, next);
  const row = pickerRow({ select, prev, next, placeholder, items, groups, current, choose });
  return { bar, select, row };
}

/**
 * The card docked at the foot: its ×, whose accessible name is the
 * descriptor's `close` word, its title, and its rows in two columns — each
 * of `rows` ({ key, label }) whose value the record has, label left and value
 * right; a row the record has no value for is left out.
 */
export function dockedCard({ close: closeWord, id }) {
  const card = el('section', 'card');
  card.hidden = true;
  const close = el('button', 'card-close');
  close.type = 'button';
  close.setAttribute('aria-label', closeWord);
  close.lang = 'bn';
  close.textContent = '×';
  const body = el('div', 'card-body');
  const title = el('h2', 'card-title', 'bn');
  title.id = `${id}-card-title`;
  card.setAttribute('aria-labelledby', title.id);
  const list = el('dl', 'card-rows');
  body.append(title, list);
  card.append(close, body);
  function fill(heading, rows, values) {
    title.textContent = heading;
    list.replaceChildren();
    for (const { key, label } of rows ?? []) {
      const value = values?.[key];
      if (value === undefined || value === null) continue;
      const dt = el('dt', null, 'bn');
      dt.textContent = label;
      const dd = el('dd', null, 'bn');
      dd.textContent = value;
      list.append(dt, dd);
    }
    body.scrollTop = 0;
  }
  return { card, close, fill };
}
