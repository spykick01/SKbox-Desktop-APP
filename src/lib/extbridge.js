// A tiny local-only server (127.0.0.1, random port, random token) that lets an extension's background use APIs Electron lacks.
// Today: chrome.cookies, backed by the SKBrowse session. The token is written into the extension's shim, so no other program can use it.
const http = require('http'), crypto = require('crypto');
const toChrome = c => ({ name: c.name, value: c.value, domain: c.domain || '', hostOnly: !!c.hostOnly, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: c.sameSite || 'unspecified', session: !!c.session, expirationDate: c.expirationDate, storeId: '0' });
const hostUrl = c => 'http' + (c.secure ? 's' : '') + '://' + String(c.domain || '').replace(/^\./, '') + (c.path || '/');

async function cookieOp(ses, op, a) {
  const ck = ses.cookies;
  if (op === 'getAll' || op === 'get') {
    const q = {}; ['url', 'name', 'domain', 'path', 'secure', 'session'].forEach(k => { if (a[k] !== undefined) q[k] = a[k]; });
    const l = (await ck.get(q)).map(toChrome); return op === 'get' ? (l[0] || null) : l;
  }
  if (op === 'set') {
    const d = { url: a.url, name: a.name || '', value: a.value || '', path: a.path, secure: a.secure, httpOnly: a.httpOnly, expirationDate: a.expirationDate, sameSite: a.sameSite };
    if (a.domain) d.domain = a.domain; Object.keys(d).forEach(k => d[k] === undefined && delete d[k]); await ck.set(d);
    const l = await ck.get({ url: a.url, name: a.name }); return l[0] ? toChrome(l[0]) : null;
  }
  if (op === 'remove') { await ck.remove(a.url, a.name); return { url: a.url, name: a.name, storeId: '0' }; }
  if (op === 'stores') return [{ id: '0', tabIds: [] }];
  throw new Error('Unknown cookie call: ' + op);
}
function start(getSes) {
  const token = crypto.randomBytes(16).toString('hex');
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      const m = /^\/c\/([0-9a-f]{32})\/(\w+)$/.exec(req.url || '');
      if (req.method !== 'POST' || !m || m[1] !== token) { res.writeHead(403, cors); return res.end('{"err":"no"}'); }
      let body = ''; req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
      req.on('end', async () => { let out; try { out = { v: await cookieOp(getSes(), m[2], JSON.parse(body || '{}')) }; } catch (e) { out = { err: String((e && e.message) || e).slice(0, 200) }; } res.writeHead(200, cors); res.end(JSON.stringify(out)); });
    });
    srv.on('error', () => resolve(null)); srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, token, close: () => srv.close() }));
  });
}
module.exports = { start, cookieOp, hostUrl };
