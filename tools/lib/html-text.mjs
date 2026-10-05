// One HTML page's visible text, the same on every run: the text a quote's offset and
// length point into (org-members' sources). Scripts, styles and the head are dropped,
// block ends become line breaks, entities are decoded, each line's white space is
// collapsed, empty lines go, and every e-mail address is replaced, so no cached text
// holds one.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', laquo: '«', raquo: '»',
  copy: '©', reg: '®', eacute: 'é', egrave: 'è', ocirc: 'ô', ccedil: 'ç', uuml: 'ü',
  ouml: 'ö', auml: 'ä', iacute: 'í', aacute: 'á', oacute: 'ó', uacute: 'ú', atilde: 'ã',
  ntilde: 'ñ', middot: '·', bull: '•', times: '×', shy: '',
};
const BLOCK = 'address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|option|p|pre|section|select|table|tbody|td|tfoot|th|thead|tr|ul';

export function htmlText(html) {
  let s = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style|noscript|template|svg|iframe)[\s>][\s\S]*?<\/\1>/gi, '')
    .replace(new RegExp(`</?(?:${BLOCK})(?:\\s[^>]*)?/?>`, 'gi'), '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, k) => NAMED[k] ?? NAMED[k.toLowerCase()] ?? m)
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\ufeff]/g, '');
  s = s.split(/\r?\n/).map((l) => l.replace(/[ \t\f\v\r]+/g, ' ').trim()).filter(Boolean).join('\n');
  return s.replace(EMAIL, '[address removed]') + '\n';
}

// A source's text: `json:<dotted.path>` reads one string out of a JSON body first.
export function sourceText(buf, extract) {
  const raw = buf.toString('utf8');
  if (extract?.startsWith('json:')) {
    let v = JSON.parse(raw);
    for (const k of extract.slice(5).split('.')) v = v?.[k];
    if (typeof v !== 'string') throw new Error(`no string at ${extract}`);
    return htmlText(v);
  }
  return htmlText(raw);
}
