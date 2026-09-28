/*
|--------------------------------------------------------------------------
| THE PICKER ROW — [ ‹ ] [ the select, taking all remaining width ▾ ] [ › ]
|--------------------------------------------------------------------------
|
| Shared by the map shell (docs/shell/) and the diagram shell (docs/visual/);
| its look is docs/shared/picker.css. The shell keeps its own selection: the
| row asks it what is chosen (`current`) and tells it what the student chose
| (`choose`), from the dropdown or from ‹ ›, which step through what is shown
| (`shown`), in order, and stop at the ends. A disabled arrow is the only
| position feedback there is, so wrapping silently would just look like a jump.
|
| The row keeps its one form while it fits. A name too wide for it would wrap
| the row and leave one arrow alone, so a row that wraps goes fully stacked —
| the name on its own row, the arrows sharing the next. The name is never
| truncated.
*/

/**
 * Builds the row on its three elements, all in one parent (the row).
 *   items   [{ key, label, group? }] in order; `groups` [{ value, label }] in order
 *   shown   () => the keys shown now, in order (default: every item)
 *   current () => the key chosen now, or undefined
 *   choose  (key) => the student chose it
 *   listen  (element, type, handler) => registers a handler, so a shell can undo it
 * Returns { render, stack, sync }: `render` after what is shown changes,
 * `stack` after the row's width changes, `sync` after the choice changes.
 */
export function pickerRow({ select, prev, next, placeholder, label, groups = [], items, shown = () => items.map((i) => i.key), current, choose, listen = (element, type, handler) => element.addEventListener(type, handler) }) {
  const groupOf = new Map(items.map((i) => [i.key, i.group]));
  const optgroups = new Map(); // group value -> optgroup, built once
  const options = new Map(); // key -> option, built once
  let order = []; // what ‹ › step through: the shown keys, in order

  select.hidden = false;
  if (label) select.setAttribute('aria-label', label);

  if (placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.disabled = true;
    option.selected = true;
    option.textContent = placeholder;
    select.appendChild(option);
  }

  for (const group of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    optgroup.dataset.value = group.value;
    optgroups.set(group.value, optgroup);
  }

  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.key;
    option.textContent = item.label;
    options.set(item.key, option);
  }

  /**
   * Puts the shown keys into the select, in order under their groups, and
   * drops a group left empty. Rebuilt from the elements made once, so a
   * change in what is shown never re-creates an option.
   */
  function render() {
    order = shown();
    // Everything but the placeholder comes off, then goes back filtered.
    for (const child of [...select.children]) if (!(child.tagName === 'OPTION' && child.value === '')) child.remove();
    for (const og of optgroups.values()) og.replaceChildren();
    const loose = [];
    for (const key of order) {
      const og = optgroups.get(groupOf.get(key));
      if (og) og.appendChild(options.get(key));
      else loose.push(options.get(key));
    }
    for (const og of optgroups.values()) if (og.children.length) select.appendChild(og);
    for (const option of loose) select.appendChild(option);
    select.value = current() ?? '';
    stack();
  }

  function stack() {
    const row = select.parentElement;
    row.classList.remove('stacked');
    if (prev.hidden) return;
    // Wrapped means a whole row down, not the pixel a taller select sits apart.
    const top = prev.offsetTop;
    const apart = (el) => Math.abs(el.offsetTop - top) > prev.offsetHeight / 2;
    if (apart(select) || apart(next)) row.classList.add('stacked');
  }

  function sync() {
    const key = current();
    const index = key === undefined ? -1 : order.indexOf(key);
    prev.disabled = index <= 0;
    next.disabled = index >= order.length - 1;
  }

  render();

  listen(select, 'change', (event) => {
    const key = event.target.value;
    if (key) choose(key);
  });

  prev.hidden = false;
  next.hidden = false;
  const step = (delta) => {
    const key = current();
    const index = key === undefined ? -1 : order.indexOf(key);
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    choose(order[to]);
  };
  listen(prev, 'click', () => step(-1));
  listen(next, 'click', () => step(1));
  sync();
  // Measured once the arrows show, and again once the Bengali font has
  // arrived, since the font sets how wide a name is.
  stack();
  document.fonts?.ready.then(() => stack());

  return { render, stack, sync };
}
