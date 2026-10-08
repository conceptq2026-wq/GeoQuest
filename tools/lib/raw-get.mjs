// A plain HTTP/1.1 GET over TLS, for a server whose response header Node's HTTP parser refuses even in its lenient
// mode (UN DESA's E-Government Knowledgebase, publicadministration.un.org: an invalid header token, 2026-10-08). It
// sends the repo's User-Agent like every other request, follows redirects, and reads a chunked or plain body. Used by
// tools/fetch-sources.mjs for a source marked `rawHttp` in tools/sources.json; nothing else.
import tls from 'node:tls';
import { UA } from '../net.mjs';

export async function rawGet(url, redirects = 5) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error(`rawGet: ${url} is not https`);
  const raw = await new Promise((resolve, reject) => {
    const socket = tls.connect({ host: u.hostname, port: Number(u.port || 443), servername: u.hostname }, () => {
      socket.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`);
    });
    const parts = [];
    socket.on('data', (d) => parts.push(d));
    socket.on('end', () => resolve(Buffer.concat(parts)));
    socket.on('error', reject);
    socket.setTimeout(60000, () => socket.destroy(new Error(`rawGet: ${url} timed out`)));
  });
  const split = raw.indexOf('\r\n\r\n');
  if (split < 0) throw new Error(`rawGet: ${url} sent no header end`);
  const head = raw.subarray(0, split).toString('latin1').split('\r\n');
  const status = Number(head[0].split(' ')[1]);
  const header = (name) => head.find((l) => l.toLowerCase().startsWith(`${name}:`))?.slice(name.length + 1).trim();
  if (status >= 300 && status < 400 && header('location')) {
    if (!redirects) throw new Error(`rawGet: ${url} redirects too often`);
    return rawGet(new URL(header('location'), url).href, redirects - 1);
  }
  if (status !== 200) throw new Error(`${url}: HTTP ${status}`);
  let body = raw.subarray(split + 4);
  if ((header('transfer-encoding') ?? '').toLowerCase().includes('chunked')) {
    const out = [];
    let at = 0;
    for (;;) {
      const eol = body.indexOf('\r\n', at);
      const size = parseInt(body.subarray(at, eol).toString('latin1'), 16);
      if (!size) break;
      out.push(body.subarray(eol + 2, eol + 2 + size));
      at = eol + 2 + size + 2;
    }
    body = Buffer.concat(out);
  }
  return body;
}
