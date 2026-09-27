// What a page asks the network for, read from its source — for the rule that a
// page requests only static files from its own host, through the resolver, and
// calls no API (CLAUDE.md, "Interactive diagrams": no API calls, ever).
//
// A LINK is a URL the browser follows only when it is tapped: an anchor's href,
// in <a … href="…"> markup (in HTML, or inside a JS string) or handed to a
// helper whose own definition in the same file writes it into one — the map
// shell's credit(). A REQUEST is a URL the browser fetches with no tap: the
// argument of fetch(), XHR's open(), import(), a Worker, sendBeacon(),
// WebSocket or EventSource; a static import; the src, srcset, poster, data or
// action of an element; a <link href>, which is fetched, unlike <a>; a CSS
// url() or @import. The W3C XML namespaces — SVG's among them — are names,
// never fetched. A URL in none of these places is OTHER.
//
// The rules, one finding each:
//   absolute URL            any http://, https:// or //host, whatever it is
//   hand-written request    fetch() or XHR open() with a URL written as a
//                           string or template, or built from one, rather
//                           than a value from the resolver
//   beacon or socket        sendBeacon, WebSocket, EventSource: never a file
//   URL built by hand       new URL(), location.href and the like — only the
//                           resolver builds URLs
//   not a relative path     a module, script, stylesheet, image or CSS url()
//                           that is a bare name or starts at the host root
//   third-party host        a string that is a host name
//
// tools/verify.mjs fails every finding under docs/visual/ but a namespace, and
// reports the findings over the map shell and the home page without failing.
import fs from 'node:fs';
import path from 'node:path';

/** W3C XML namespace names: identifiers, never addresses. */
const NAMESPACES = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
]);
const SOURCE = /\.(html?|m?js|css|svg)$/i;
const HOST = /^(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|ai|cloud|info|xyz|gov|edu|int|bd)(?::\d+)?(?:\/\S*)?$/i;

/** Every HTML, JS, CSS and SVG file at `target` or under it; none when it does not exist. */
export function sourcesAt(target) {
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return SOURCE.test(target) ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .map((e) => e.name)
    .sort()
    .flatMap((name) => sourcesAt(path.join(target, name)));
}

/** Index of the quote that closes the string or template opening at `i`. */
function stringEnd(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === quote) return j;
    else if (quote === '`' && src[j] === '$' && src[j + 1] === '{') {
      let depth = 0;
      for (j += 1; j < src.length; j++) {
        if (src[j] === '"' || src[j] === "'" || src[j] === '`') j = stringEnd(src, j);
        else if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
    }
  }
  return src.length;
}

/** The arguments of the call whose "(" is at `open`, as source text, and where the call ends. */
function callAt(src, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') i = stringEnd(src, i);
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth === 0) {
        args.push(src.slice(start, i).trim());
        return { args: args.filter(Boolean), end: i };
      }
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  return { args, end: src.length };
}

/** True when the expression writes any part of itself as a string or template, outside a call. */
function handWritten(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '"' || c === "'" || c === '`') {
      if (depth === 0) return true;
      i = stringEnd(expr, i);
    }
  }
  return false;
}

const literalText = (expr) => (/^(['"`])([^'"`]*)\1$/.exec(expr) ?? [])[2];
const relative = (url) => /^\.\.?\//.test(url);
const opensOutside = (tag) => /\btarget=["']_blank["']/.test(tag) && /\brel=["'][^"']*\bnoopener\b/.test(tag) && /\brel=["'][^"']*\bnoreferrer\b/.test(tag);

// What the text just before a URL says it is.
const REQUEST_BEFORE = [
  /(?<![\w$])(?:fetch|import|importScripts|sendBeacon|Worker|SharedWorker|WebSocket|EventSource)\s*\(\s*['"`]$/,
  /\.open\s*\(\s*['"`]\w+['"`]\s*,\s*['"`]$/,
  /\b(?:from|import)\s*['"]$/,
  /<(?:script|img|source|video|audio|track|iframe|embed|input|image|use|link|object|form)\b[^<>]*\b(?:src|srcset|poster|href|xlink:href|data|action)\s*=\s*["']?$/i,
  /(?<![\w$.])url\(\s*['"]?$/i,
  /@import\s+(?:url\(\s*)?['"]?$/i,
  /\.(?:src|srcset)\s*=\s*['"`]$/,
  /setAttribute\(\s*['"](?:src|srcset|href)['"]\s*,\s*['"`]$/,
];

/** Every finding in one file, in order. */
export function scan(file) {
  const src = fs.readFileSync(file, 'utf8');
  const css = /\.css$/i.test(file);
  const markup = /\.(html?|svg)$/i.test(file);
  const findings = [];
  const covered = []; // [start, end] already reported as a whole
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  const add = (index, rule, what, kind, note = '') => findings.push({ file, line: lineOf(index), index, rule, what, class: kind, note });
  const isCovered = (i) => covered.some(([a, b]) => i >= a && i <= b);

  // Comments: /* */ in scripts and styles, <!-- --> in markup too, and // to the
  // end of a script line — found on the line with its strings taken out.
  const comments = [...src.matchAll(markup ? /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\//g)].map((m) => [m.index, m.index + m[0].length]);
  const inComment = (i) => {
    if (comments.some(([a, b]) => i >= a && i < b)) return true;
    const line = src.slice(src.lastIndexOf('\n', i - 1) + 1, i).replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    return !css && /(^|[^:\\])\/\//.test(line.replace(/(['"`]).*$/, ''));
  };

  // Helpers that write their first parameter into an anchor's href, read from their own definition.
  const builders = new Map();
  for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*\(\s*([\w$]+)[^)]*\)\s*=>\s*`(<a\s[^`]*?href="\$\{\2\}"[^`]*)`/g)) builders.set(m[1], m[3]);
  for (const m of src.matchAll(/function\s+([\w$]+)\s*\(\s*([\w$]+)[^)]*\)\s*\{[^}]*?`(<a\s[^`]*?href="\$\{\2\}"[^`]*)`/g)) builders.set(m[1], m[3]);

  const classOf = (i, url) => {
    if (NAMESPACES.has(url)) return ['namespace', 'an XML namespace name, never fetched'];
    if (inComment(i)) return ['comment', 'never fetched'];
    const before = src.slice(Math.max(0, i - 400), i);
    const anchor = /<a\s[^<>]*\bhref=["']?$/i.exec(before);
    if (anchor) {
      const tag = before.slice(anchor.index) + src.slice(i, src.indexOf('>', i) + 1);
      return ['link', opensOutside(tag) ? 'an <a href>, opens in a new tab, noopener noreferrer' : 'an <a href> WITHOUT target="_blank" rel="noopener noreferrer"'];
    }
    const call = /([\w$]+)\(\s*['"`]$/.exec(before);
    if (call && builders.has(call[1])) {
      return ['link', `through ${call[1]}(), which writes an <a href>${opensOutside(builders.get(call[1])) ? ', opens in a new tab, noopener noreferrer' : ' WITHOUT target="_blank" rel="noopener noreferrer"'}`];
    }
    if (REQUEST_BEFORE.some((re) => re.test(before))) return ['request', 'fetched with no tap'];
    return ['other', ''];
  };

  // ---- requests for data: from the resolver, never written by hand
  const requests = { resolver: 0, value: 0 };
  const inspect = (open, n, what) => {
    const { args, end } = callAt(src, open);
    const arg = args[n];
    if (arg === undefined) return;
    if (/^resolver\s*\.\s*(?:url|pmtilesSource)\s*\(/.test(arg)) requests.resolver++;
    else if (handWritten(arg)) {
      add(open, 'hand-written request', `${what}(${arg})`, 'request', 'the URL is not from the resolver');
      covered.push([open, end]);
    } else requests.value++;
  };
  if (!css) {
    for (const m of src.matchAll(/(?<![\w$])fetch\s*\(/g)) inspect(m.index + m[0].length - 1, 0, 'fetch');
    if (/XMLHttpRequest/.test(src)) for (const m of src.matchAll(/\.open\s*\(/g)) inspect(m.index + m[0].length - 1, 1, 'XHR open');
    for (const m of src.matchAll(/\bnavigator\s*\.\s*sendBeacon\s*\(|\bnew\s+(?:WebSocket|EventSource)\s*\(/g)) {
      add(m.index, 'beacon or socket', m[0].replace(/\s*\($/, '').replace(/\s+/g, ' '), 'request', 'never a static file');
      covered.push([m.index, callAt(src, m.index + m[0].length - 1).end]);
    }
    for (const m of src.matchAll(/\bnew\s+URL\s*\(|\blocation\s*\.\s*(?:href|origin|host|hostname|protocol|pathname|port)\b|\bdocument\s*\.\s*(?:baseURI|URL|documentURI)\b|pmtiles:\/\//g)) {
      add(m.index, 'URL built by hand', m[0].replace(/\s*\($/, '').replace(/\s+/g, ' '), 'other', 'only the resolver builds URLs');
    }
  }

  // ---- code and subresources: relative paths only, so they stay on this host
  const own = { relative: 0, value: 0 };
  const subresource = (index, url, what) => {
    if (url === undefined || url.includes('${') || /^(?:data|blob):/i.test(url) || url.startsWith('#')) return;
    if (relative(url)) own.relative++;
    else if (!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url)) add(index, 'not a relative path', `${what} ${url}`, 'request', url.startsWith('/') ? 'starts at the host root, which breaks under /GeoQuest/' : 'a bare name no browser can load');
  };
  if (!css) {
    for (const m of src.matchAll(/(?:^|[\s;{}])(?:import|export)\s+(?:[\w$*{}\s,]+?\s+from\s+)?(['"])([^'"\n]+)\1/g)) {
      subresource(m.index + m[0].search(/import|export/), m[2], 'import');
    }
    for (const m of src.matchAll(/(?<![\w$.])import\s*\(|\bnew\s+(?:Shared)?Worker\s*\(|\bimportScripts\s*\(/g)) {
      const { args } = callAt(src, m.index + m[0].length - 1);
      const text = literalText(args[0] ?? '');
      if (text !== undefined) subresource(m.index, text, m[0].replace(/[\s(]+$/, ''));
      else own.value++;
    }
    for (const m of src.matchAll(/\.(?:src|srcset)\s*=\s*(['"`])([^'"`]*)\1|setAttribute\(\s*['"](?:src|srcset|href)['"]\s*,\s*(['"`])([^'"`]*)\3/g)) subresource(m.index, m[2] ?? m[4], 'src');
    own.value += [...src.matchAll(/\.(?:src|srcset)\s*=\s*(?![\s'"`])/g)].length;
  }
  for (const m of src.matchAll(/<(script|img|source|video|audio|track|iframe|embed|input|image|use|link|object|form)\b([^<>]*)>/gi)) {
    for (const a of m[2].matchAll(/\b(src|srcset|poster|href|xlink:href|data|action)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const value = a[2] ?? a[3];
      for (const url of a[1].toLowerCase() === 'srcset' ? value.split(',').map((s) => s.trim().split(/\s+/)[0]) : [value]) subresource(m.index, url, `<${m[1]} ${a[1]}>`);
    }
  }
  if (css || markup) {
    for (const m of src.matchAll(/(?<![\w$.])url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) subresource(m.index, m[2].trim(), 'url()');
    for (const m of src.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1/gi)) subresource(m.index, m[2], '@import');
  }

  // ---- absolute URLs, wherever they are
  for (const m of src.matchAll(/\bhttps?:\/\/[^\s'"`<>()\\]*|(?<=['"`(=])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s'"`<>()\\]*/gi)) {
    if (isCovered(m.index)) continue;
    const [kind, note] = classOf(m.index, m[0]);
    add(m.index, 'absolute URL', m[0], kind, note);
  }

  // ---- host names standing alone in a string
  for (const m of src.matchAll(/(['"`])([^'"`\s]+)\1/g)) {
    if (HOST.test(m[2]) && !isCovered(m.index)) add(m.index, 'third-party host', m[2], inComment(m.index) ? 'comment' : 'other', 'a host name');
  }

  findings.sort((a, b) => a.index - b.index);
  return { findings, requests, own };
}
