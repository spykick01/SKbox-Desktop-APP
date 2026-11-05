// SKBox Companion: your phone as a remote for SKBox. A small web app served on your home network.
// Off until you turn it on in Settings. It only answers devices on your local network, only after the PIN, and it can only do the things listed in handle().
const http = require('http'), os = require('os'), crypto = require('crypto'), fs = require('fs'), path = require('path');

const isLan = ip => { ip = String(ip || '').replace(/^::ffff:/, ''); return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/.test(ip) || ip === '::1' || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip); };
const newPin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+n || 0)));

// Typing text from the phone: US keyboard layout as scancodes (the helper injects scancodes)
const SC = {}; 'qwertyuiop'.split('').forEach((c, i) => { SC[c] = 0x10 + i; }); 'asdfghjkl'.split('').forEach((c, i) => { SC[c] = 0x1E + i; }); 'zxcvbnm'.split('').forEach((c, i) => { SC[c] = 0x2C + i; });
'1234567890'.split('').forEach((c, i) => { SC[c] = 0x02 + i; }); Object.assign(SC, { ' ': 0x39, '-': 0x0C, '=': 0x0D, '[': 0x1A, ']': 0x1B, ';': 0x27, "'": 0x28, '`': 0x29, '\\': 0x2B, ',': 0x33, '.': 0x34, '/': 0x35 });
const SHIFTED = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', ':': ';', '"': "'", '~': '`', '|': '\\', '<': ',', '>': '.', '?': '/' };
function charKeys(ch) { if (SC[ch] !== undefined) return { sc: SC[ch], shift: false }; const l = ch.toLowerCase(); if (l !== ch && SC[l] !== undefined) return { sc: SC[l], shift: true }; if (SHIFTED[ch]) return { sc: SC[SHIFTED[ch]], shift: true }; return null; }
function textToLines(text) {   // -> helper lines (IK scancode ext down)
  const out = []; for (const ch of String(text).slice(0, 200)) { const k = charKeys(ch); if (!k) continue; if (k.shift) out.push('IK 42 0 1'); out.push('IK ' + k.sc + ' 0 1', 'IK ' + k.sc + ' 0 0'); if (k.shift) out.push('IK 42 0 0'); } return out;
}
const KEYS = { up: [0x48, 1], down: [0x50, 1], left: [0x4B, 1], right: [0x4D, 1], enter: [0x1C, 0], esc: [0x01, 0], back: [0x0E, 0], tab: [0x0F, 0], space: [0x39, 0], home: [0x47, 1], f11: [0x57, 0], f5: [0x3F, 0], del: [0x53, 1], altenter: null };

class Companion {
  constructor(o) { this.o = Object.assign({ port: 47830, lan: isLan, webFile: '', maxDevices: 4, tokenHours: 12 }, o); this.server = null; this.on_ = false; this.pin = ''; this.tokens = new Map(); this.fails = {}; this.totalFails = 0; this.lockedUntil = 0; this.port = 0; this.rate = new Map(); }
  ips() { const out = [], n = os.networkInterfaces(); for (const k in n) for (const a of n[k] || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out; }
  state() { return { on: this.on_, port: this.port, pin: this.on_ ? this.pin : '', ips: this.ips(), devices: Array.from(this.tokens.values()).map(t => ({ name: t.name, since: t.since, last: t.last })) }; }
  async start() {
    if (this.on_) return this.state(); this.pin = newPin(); this.tokens.clear(); this.fails = {}; this.totalFails = 0; this.lockedUntil = 0;
    const srv = http.createServer((q, r) => this.handle(q, r).catch(() => { try { r.writeHead(500); r.end(); } catch (_) {} })); srv.headersTimeout = 8000; srv.requestTimeout = 15000;
    let port = this.o.port, bound = false; for (let i = 0; i < 6 && !bound; i++, port = port ? port + 1 : 0) { bound = await new Promise(res => { const er = () => res(false); srv.once('error', er); srv.listen(port, '0.0.0.0', () => { srv.removeListener('error', er); res(true); }); }); if (this.o.port === 0) break; }
    if (!bound) throw new Error('Could not open a port for the phone companion.'); this.server = srv; this.port = srv.address().port; this.on_ = true; return this.state();
  }
  stop() { this.on_ = false; this.tokens.clear(); this.pin = ''; try { this.server && this.server.close(); this.server && this.server.closeAllConnections && this.server.closeAllConnections(); } catch (_) {} this.server = null; this.port = 0; }
  newPin() { if (!this.on_) return this.state(); this.pin = newPin(); this.tokens.clear(); return this.state(); }   // a new PIN signs every phone out
  kickAll() { this.tokens.clear(); return this.state(); }
  json(r, code, obj) { const b = JSON.stringify(obj); r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); r.end(b); }
  body(q) { return new Promise((res, rej) => { let b = ''; q.on('data', d => { b += d; if (b.length > 20000) { rej(new Error('big')); q.destroy(); } }); q.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } }); q.on('error', rej); }); }
  hostOk(q) { const h = String(q.headers.host || ''); return /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\]|localhost)(:\d+)?$/i.test(h); }   // blocks DNS-rebinding tricks
  authed(q, urlObj) { const t = q.headers['x-sk-token'] || (urlObj && urlObj.searchParams.get('t')) || ''; const x = this.tokens.get(t); if (!x) return null; if (Date.now() - x.since > this.o.tokenHours * 3600000) { this.tokens.delete(t); return null; } x.last = Date.now(); return x; }
  limited(x) { const now = Date.now(), r = this.rate.get(x.id) || { t: now, n: 0 }; if (now - r.t > 1000) { r.t = now; r.n = 0; } r.n++; this.rate.set(x.id, r); return r.n > 80; }
  async handle(q, r) {
    const ip = String((q.socket && q.socket.remoteAddress) || '').replace(/^::ffff:/, '');
    if (!this.o.lan(ip) || !this.hostOk(q)) { r.writeHead(403); return r.end('Only devices on your home network can use SKBox Companion.'); }
    const u = new URL(q.url, 'http://x'), p = u.pathname;
    if (q.method === 'GET' && (p === '/' || p === '/index.html')) { let h = ''; try { h = fs.readFileSync(this.o.webFile, 'utf8'); } catch {} r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); return r.end(h); }
    if (q.method === 'POST' && p === '/api/login') {
      const now = Date.now(); if (now < this.lockedUntil || (this.fails[ip] && this.fails[ip].until > now)) return this.json(r, 429, { ok: false, error: 'Too many tries. Wait a minute.' });
      const b = await this.body(q); const good = this.on_ && /^\d{6}$/.test(String(b.pin || '')) && same(b.pin, this.pin);
      if (!good) { const f = this.fails[ip] || (this.fails[ip] = { n: 0, until: 0 }); f.n++; this.totalFails++; if (f.n >= 5) { f.until = now + 60000; f.n = 0; } if (this.totalFails >= 20) { this.lockedUntil = now + 300000; this.totalFails = 0; } return this.json(r, 401, { ok: false, error: 'Wrong PIN.' }); }
      this.fails[ip] = { n: 0, until: 0 }; if (this.tokens.size >= this.o.maxDevices) { const oldest = Array.from(this.tokens.entries()).sort((a, b) => a[1].last - b[1].last)[0]; if (oldest) this.tokens.delete(oldest[0]); }
      const t = crypto.randomBytes(24).toString('hex'); this.tokens.set(t, { id: t.slice(0, 8), name: String(b.name || 'Phone').slice(0, 30), since: now, last: now }); if (this.o.onChange) this.o.onChange(); return this.json(r, 200, { ok: true, token: t });
    }
    if (q.method === 'GET' && p.startsWith('/cover/')) { const x = this.authed(q, u); if (!x) { r.writeHead(401); return r.end(); } const f = this.o.coverFile(decodeURIComponent(p.slice(7))); if (!f) { r.writeHead(404); return r.end(); } try { const buf = fs.readFileSync(f), ext = path.extname(f).toLowerCase(); r.writeHead(200, { 'Content-Type': { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' }); return r.end(buf); } catch { r.writeHead(404); return r.end(); } }
    if (!p.startsWith('/api/')) { r.writeHead(404); return r.end(); }
    const x = this.authed(q); if (!x) return this.json(r, 401, { ok: false, error: 'Sign in again.' });
    if (q.method !== 'POST' && !(q.method === 'GET' && p === '/api/state')) { r.writeHead(405); return r.end(); }
    if (this.limited(x)) return this.json(r, 429, { ok: false, error: 'Slow down.' });
    const b = q.method === 'POST' ? await this.body(q) : {}, c = this.o;
    switch (p) {
      case '/api/state': return this.json(r, 200, Object.assign({ ok: true }, c.state()));
      case '/api/logout': this.tokens.delete(String(q.headers['x-sk-token'])); return this.json(r, 200, { ok: true });
      case '/api/launch': return this.json(r, 200, await c.launch(String(b.id || '')));
      case '/api/close': return this.json(r, 200, await c.close());
      case '/api/menu': c.menu(); return this.json(r, 200, { ok: true });
      case '/api/queue': return this.json(r, 200, await c.queue(String(b.op || ''), String(b.id || '')));
      case '/api/volume': if (!['up', 'down', 'mute'].includes(b.dir)) return this.json(r, 400, { ok: false }); c.volume(b.dir); return this.json(r, 200, { ok: true });
      case '/api/power': if (!['lock', 'sleep'].includes(b.what) || b.confirm !== true) return this.json(r, 400, { ok: false, error: 'Confirm first.' }); if (!c.powerAllowed()) return this.json(r, 403, { ok: false, error: 'Turn on \u201CAllow lock and sleep\u201D in SKBox settings.' }); c.power(b.what); return this.json(r, 200, { ok: true });
      case '/api/mouse': c.hin('IM ' + clamp(b.dx, -300, 300) + ' ' + clamp(b.dy, -300, 300)); return this.json(r, 200, { ok: true });
      case '/api/click': { const btn = b.button === 2 ? 2 : 0; for (let i = 0; i < (b.double ? 2 : 1); i++) { c.hin('IB ' + btn + ' 1'); c.hin('IB ' + btn + ' 0'); } return this.json(r, 200, { ok: true }); }
      case '/api/hold': { const btn = b.button === 2 ? 2 : 0; c.hin('IB ' + btn + ' ' + (b.down ? 1 : 0)); return this.json(r, 200, { ok: true }); }
      case '/api/scroll': c.hin('IW ' + clamp(b.dy, -1200, 1200)); return this.json(r, 200, { ok: true });
      case '/api/key': { const k = KEYS[String(b.key)]; if (!k) return this.json(r, 400, { ok: false }); c.hin('IK ' + k[0] + ' ' + k[1] + ' 1'); c.hin('IK ' + k[0] + ' ' + k[1] + ' 0'); return this.json(r, 200, { ok: true }); }
      case '/api/text': { const lines = textToLines(b.text || ''); for (const l of lines) c.hin(l); return this.json(r, 200, { ok: true, typed: lines.length }); }
      default: return this.json(r, 404, { ok: false });
    }
  }
}
module.exports = { Companion, isLan, textToLines, charKeys, KEYS };
