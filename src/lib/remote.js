// SKBox Remote Play host: a tiny LAN-only HTTP server (pairing + WebRTC signalling + the web client) and a UDP "who is here" responder.
// Nothing here runs unless the user turns Remote play on in Settings. Turning it off closes every port.
const http = require('http'), dgram = require('dgram'), os = require('os'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const EventEmitter = require('events');

const HTTP_PORT = 47822, DISC_PORT = 47821;
const FILES = { '/': ['client.html', 'text/html; charset=utf-8'], '/client.html': ['client.html', 'text/html; charset=utf-8'], '/client.js': ['client.js', 'text/javascript; charset=utf-8'], '/client.css': ['client.css', 'text/css; charset=utf-8'] };

function isLan(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/.test(ip) || ip === '::1' || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip);
}
const newPin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
function sameStr(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

class RemoteHost extends EventEmitter {
  constructor(o) {
    super(); this.o = Object.assign({ name: os.hostname(), version: '0', webDir: '.', httpPort: HTTP_PORT, discPort: DISC_PORT, lan: isLan, createSession: async () => { throw new Error('not ready'); }, endSession: () => {} }, o || {});
    this.on_ = false; this.server = null; this.udp = null; this.port = 0; this.pin = ''; this.session = null; this.fails = {}; this.totalFails = 0; this.lockedUntil = 0;
  }
  trusted() { try { return !!(this.on_ && this.o.trusted && this.o.trusted()); } catch { return false; } }   // trusted mode: devices on your home network connect without the PIN while Remote play is on
  state() { return { on: this.on_, trusted: this.trusted(), port: this.port, pin: this.on_ ? this.pin : '', ips: this.ips(), name: this.o.name, client: this.session ? { name: this.session.name, ip: this.session.ip, since: this.session.since } : null }; }
  ips() { const out = []; const n = os.networkInterfaces(); for (const k in n) for (const a of n[k] || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out.sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0)); }
  async start() {
    if (this.on_) return this.state();
    this.pin = newPin(); this.fails = {}; this.totalFails = 0; this.lockedUntil = 0;
    const srv = http.createServer((q, r) => this.handle(q, r).catch(() => { try { r.writeHead(500); r.end(); } catch (_) {} }));
    srv.headersTimeout = 10000; srv.requestTimeout = 30000;
    let port = this.o.httpPort, bound = false;
    for (let i = 0; i < 6 && !bound; i++, port++) {
      bound = await new Promise(res => { const onErr = () => res(false); srv.once('error', onErr); srv.listen(port, '0.0.0.0', () => { srv.removeListener('error', onErr); res(true); }); });
      if (this.o.httpPort === 0) break;
    }
    if (!bound) throw new Error('Could not open a port for Remote play. Is something else using it?');
    this.server = srv; this.port = srv.address().port;
    try { await this.startUdp(); } catch (_) { /* discovery is optional: the address and PIN still work */ }
    this.on_ = true; this.emit('state'); return this.state();
  }
  startUdp() {
    return new Promise((resolve, reject) => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.once('error', e => { try { s.close(); } catch (_) {} reject(e); });
      s.on('message', (m, ri) => {
        if (!this.on_ || m.toString().trim() !== 'SKBOX?' || !this.o.lan(ri.address)) return;
        const reply = Buffer.from(JSON.stringify({ app: 'skbox', name: this.o.name, port: this.port, v: this.o.version, busy: !!this.session }));
        s.send(reply, ri.port, ri.address);
      });
      s.bind(this.o.discPort, '0.0.0.0', () => { this.udp = s; resolve(); });
    });
  }
  stop() {
    if (!this.on_ && !this.server) return;
    this.on_ = false; this.endSession('Remote play was turned off');
    try { this.server && this.server.close(); } catch (_) {} try { this.server && this.server.closeAllConnections && this.server.closeAllConnections(); } catch (_) {}
    try { this.udp && this.udp.close(); } catch (_) {}
    this.server = null; this.udp = null; this.port = 0; this.pin = ''; this.emit('state');
  }
  newPin() { this.pin = newPin(); this.emit('state'); return this.pin; }
  endSession(why) { const s = this.session; if (!s) return; this.session = null; try { this.o.endSession(s.sid, why); } catch (_) {} this.emit('ended', s, why); this.emit('state'); }
  sessionEnded(sid) { if (this.session && this.session.sid === sid) { const s = this.session; this.session = null; this.emit('ended', s, 'The remote player left'); this.emit('state'); } }

  cors(r) { r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); r.setHeader('Access-Control-Allow-Headers', 'Content-Type'); r.setHeader('Access-Control-Allow-Private-Network', 'true'); }
  json(r, code, obj) { this.cors(r); r.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(obj)); }
  body(q, max) {
    return new Promise((res, rej) => { let n = 0; const b = []; q.on('data', d => { n += d.length; if (n > max) { rej(new Error('too big')); q.destroy(); } else b.push(d); }); q.on('end', () => { try { res(JSON.parse(Buffer.concat(b).toString('utf8') || '{}')); } catch (e) { rej(e); } }); q.on('error', rej); });
  }
  async handle(q, r) {
    const ip = (q.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (!this.on_ || !this.o.lan(ip)) { r.writeHead(403); r.end(); return; }
    const url = (q.url || '/').split('?')[0];
    if (q.method === 'OPTIONS') { this.cors(r); r.writeHead(204); r.end(); return; }
    if (q.method === 'GET' && FILES[url]) {
      const f = FILES[url]; let data; try { data = fs.readFileSync(path.join(this.o.webDir, f[0])); } catch (_) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-store' }); r.end(data); return;
    }
    if (q.method === 'GET' && url === '/api/info') { this.json(r, 200, { skbox: true, name: this.o.name, v: this.o.version, busy: !!this.session, trusted: !!this.trusted() }); return; }
    if (q.method === 'POST' && url === '/api/bye') {
      let b; try { b = await this.body(q, 2000); } catch (_) { this.json(r, 400, { error: 'bad request' }); return; }
      if (this.session && typeof b.token === 'string' && sameStr(b.token, this.session.sid)) this.endSession('The remote player disconnected');
      this.json(r, 200, { ok: true }); return;
    }
    if (q.method === 'POST' && url === '/api/offer') {
      let b; try { b = await this.body(q, 80000); } catch (_) { this.json(r, 400, { error: 'bad request' }); return; }
      const now = Date.now();
      if (now < this.lockedUntil) { this.json(r, 429, { error: 'Too many wrong PINs. Wait a minute and try again.' }); return; }
      const f = this.fails[ip] || (this.fails[ip] = { n: 0, until: 0 });
      if (now < f.until) { this.json(r, 429, { error: 'Too many wrong PINs. Wait a minute and try again.' }); return; }
      if (!this.trusted() && (typeof b.pin !== 'string' || !/^\d{6}$/.test(b.pin) || !sameStr(b.pin, this.pin))) {
        f.n++; this.totalFails++;
        if (f.n >= 5) { f.until = now + 60000; f.n = 0; }
        if (this.totalFails >= 20) { this.pin = newPin(); this.totalFails = 0; this.lockedUntil = now + 120000; this.emit('state'); }
        this.json(r, 403, { error: 'Wrong PIN.' }); return;
      }
      f.n = 0;
      if (this.session) { this.json(r, 409, { error: 'Someone is already playing on this PC.' }); return; }
      const o = b.offer; if (!o || o.type !== 'offer' || typeof o.sdp !== 'string' || !o.sdp.startsWith('v=0') || o.sdp.length > 60000) { this.json(r, 400, { error: 'bad offer' }); return; }
      const name = String(b.name || 'Remote player').replace(/[^\w .\-\u00C0-\u024F]/g, '').slice(0, 32) || 'Remote player';
      const sid = crypto.randomBytes(16).toString('hex');
      this.session = { sid, name, ip, since: Date.now(), pending: true }; this.emit('state');
      try {
        const answer = await this.o.createSession({ sid, name, ip, offer: { type: 'offer', sdp: o.sdp } });
        if (!this.session || this.session.sid !== sid) { this.json(r, 410, { error: 'The session was closed.' }); return; }
        this.session.pending = false; this.emit('connected', this.session); this.emit('state');
        this.json(r, 200, { answer, token: sid, name: this.o.name });
      } catch (e) {
        if (this.session && this.session.sid === sid) this.session = null; this.emit('state');
        this.json(r, 502, { error: String((e && e.message) || e).slice(0, 200) });
      }
      return;
    }
    r.writeHead(404); r.end();
  }
}
module.exports = { RemoteHost, isLan, HTTP_PORT, DISC_PORT };
