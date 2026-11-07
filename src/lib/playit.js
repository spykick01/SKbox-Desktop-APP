// playit.gg: lets friends join a server from anywhere with no port forwarding.
// SKBox downloads playit's own signed agent (playitd), links it to a free playit.gg account through playit's public API
// (you approve it once in a browser), makes a Minecraft Java tunnel for the server and shows you the address.
// Everything that touches the network, a process or Windows goes through ctx so it can be tested without a PC.
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

const API = 'https://api.playit.gg';
const DL = 'https://github.com/playit-cloud/playit-agent/releases/latest/download/';   // "latest" skips preview builds
const PIPE = '\\\\.\\pipe\\skbox-playitd';
const SIGNER = /Developed Methods|playit/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MSG = {
  RequiresVerifiedAccount: 'Your playit.gg account needs a verified email. Open playit.gg, verify your email, then try again.',
  RequiresPlayitPremium: 'playit.gg wants a premium plan for that region.',
  CodeExpired: 'The playit.gg link expired. Press the button again for a new one.',
  UserRejected: 'You declined the link on playit.gg. Press the button to try again.',
  VersionTextTooLong: 'playit.gg did not accept this version name.',
  AgentNotFound: 'playit.gg does not know this computer any more. Set it up again.',
  InvalidTunnelName: 'playit.gg did not accept the tunnel name.',
  TunnelNameTooLong: 'playit.gg did not accept the tunnel name.'
};

function create(ctx) {
  const F = ctx.fetch || ((u, o) => fetch(u, o)), now = () => (ctx.now ? ctx.now() : Date.now()), platform = ctx.platform || process.platform;
  const dir = path.join(ctx.dir, 'playit'), secretFile = path.join(dir, 'playit.toml'), exe = path.join(dir, 'playitd.exe'), logFile = path.join(dir, 'playitd.log');
  const send = (ch, p) => { try { ctx.send && ctx.send(ch, p); } catch (_) {} };
  const poll = ctx.pollMs == null ? 2000 : ctx.pollMs, version = ('SKBox ' + (ctx.version || '1')).slice(0, 20);
  const st = { phase: 'off', claimUrl: '', error: '', agent: 'stopped', agentError: '' };   // phase: off | claim | ready
  let claimTask = null, cancelClaim = false, proc = null, intentional = false, stopT = null, restarts = [], active = new Set(), tunnelBusy = {};
  const saved = () => ctx.store.read('playit', { tunnels: {} }), setSaved = v => ctx.store.write('playit', v);

  // ---------- state ----------
  const claimed = () => { try { return !!readSecret(); } catch { return false; } };
  const tunnelsOut = () => { const t = saved().tunnels || {}, o = {}; Object.keys(t).forEach(k => { o[k] = { address: t[k].address || '', state: tunnelBusy[k] ? 'working' : (t[k].address ? 'ready' : 'none'), error: tunnelBusy[k] ? '' : (t[k].error || '') }; }); Object.keys(tunnelBusy).forEach(k => { if (!o[k]) o[k] = { address: '', state: 'working', error: '' }; }); return o; };
  const status = () => ({ ok: true, supported: platform === 'win32', claimed: claimed(), phase: claimed() ? 'ready' : st.phase, claimUrl: st.claimUrl, error: st.error, agent: st.agent, agentError: st.agentError, tunnels: tunnelsOut() });
  const emit = () => send('playit:state', status());

  // ---------- secret ----------
  function readSecret() {
    let t; try { t = fs.readFileSync(secretFile, 'utf8'); } catch { return ''; }
    const m = /secret_key\s*=\s*"([0-9a-fA-F]+)"/.exec(t) || /^\s*([0-9a-fA-F]+)\s*$/.exec(t); return m ? m[1] : '';
  }
  function writeSecret(key) {
    if (!/^[0-9a-fA-F]{8,}$/.test(String(key || ''))) throw new Error('playit.gg sent back a key SKBox does not understand.');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(secretFile, 'secret_key = "' + key + '"\n', { mode: 0o600 });
  }

  // ---------- API ----------
  async function api(p, body, secret) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'SKBox-playit/1' }; if (secret) headers.Authorization = 'Agent-Key ' + secret;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 20000); let r;
    try { r = await F(API + p, { method: 'POST', headers, body: JSON.stringify(body || {}), signal: ac.signal }); }
    catch (e) { const er = new Error(e && e.name === 'AbortError' ? 'playit.gg did not answer in time.' : 'Could not reach playit.gg. Check your internet.'); er.net = true; throw er; } finally { clearTimeout(t); }
    if (r.status === 429) { const e = new Error('playit.gg is busy. Try again in a minute.'); e.busy = true; throw e; }
    let j; try { j = await r.json(); } catch { const e = new Error('playit.gg gave an answer SKBox could not read (HTTP ' + r.status + ').'); e.http = r.status; throw e; }
    if (j && j.status === 'success') return j.data;
    const code = typeof (j && j.data) === 'string' ? j.data : (j && j.data && (j.data.type || j.data.message)) || (j && j.status) || 'error'; const e = new Error(MSG[code] || ('playit.gg said: ' + code)); e.playit = code; e.http = r.status; e.auth = r.status === 401 || r.status === 403 || /auth|secret|unauthor/i.test(String(code)); throw e;
  }

  // ---------- claim: link this PC to a playit.gg account ----------
  const newCode = () => crypto.randomBytes(5).toString('hex');
  async function runClaim() {
    const deadline = now() + 15 * 60000; let code = newCode(), shown = false, fails = 0; st.error = '';
    while (!cancelClaim && now() < deadline) {
      try {
        const r = await api('/claim/setup', { code, agent_type: 'self-managed', version }); fails = 0;
        if (!shown) { shown = true; st.claimUrl = 'https://playit.gg/claim/' + code; st.phase = 'claim'; emit(); }
        if (r === 'UserAccepted') { const ex = await api('/claim/exchange', { code }); writeSecret(ex && ex.secret_key); st.phase = 'ready'; st.claimUrl = ''; emit(); return true; }
        if (r === 'UserRejected') { st.phase = 'off'; st.claimUrl = ''; st.error = MSG.UserRejected; emit(); return false; }
      } catch (e) {
        if (e.playit === 'CodeExpired' || e.playit === 'InvalidCode') { code = newCode(); shown = false; st.claimUrl = ''; continue; }
        if (e.playit === 'UserRejected') { st.phase = 'off'; st.claimUrl = ''; st.error = MSG.UserRejected; emit(); return false; }
        if ((e.net || e.busy) && ++fails < 8) { await sleep(poll * 2); continue; }
        st.phase = 'off'; st.claimUrl = ''; st.error = e.message; emit(); return false;
      }
      await sleep(poll);
    }
    st.phase = 'off'; st.claimUrl = ''; if (!cancelClaim) st.error = 'The playit.gg link was not approved in 15 minutes. Press the button to try again.'; emit(); return false;
  }
  function startClaim() {
    if (claimed()) return Promise.resolve(true); if (claimTask) return claimTask;
    cancelClaim = false; st.phase = 'claim'; st.claimUrl = ''; st.error = ''; emit();
    claimTask = runClaim().finally(() => { claimTask = null; });
    claimTask.then(ok => { if (ok) resumeTunnels(); });
    return claimTask;
  }

  // ---------- the agent program ----------
  async function verifySignature(file) {
    if (ctx.verifySignature) return ctx.verifySignature(file);
    return new Promise(res => cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$s = Get-AuthenticodeSignature -LiteralPath '" + file.replace(/'/g, "''") + "'; $s.Status.ToString() + '|' + $s.SignerCertificate.Subject"], { timeout: 60000, windowsHide: true }, (e, so) => { const [status, subject] = String(so || '').trim().split('|'); res({ status: status || 'Unknown', subject: subject || '' }); }));
  }
  async function download(url, dest) {
    const r = await F(url, { redirect: 'follow', headers: { 'User-Agent': 'SKBox-playit/1' } }); if (!r.ok) throw new Error('Could not download the playit.gg agent (HTTP ' + r.status + ').');
    const buf = Buffer.from(await r.arrayBuffer()); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); return buf.length;
  }
  async function ensureExe() {
    if (ctx.agentPath) return ctx.agentPath;
    try { const s = fs.statSync(exe); if (s.size > 1e6) return exe; } catch (_) {}
    const part = exe + '.part'; try { fs.rmSync(part, { force: true }); } catch (_) {}
    const n = await download(DL + (process.arch === 'ia32' ? 'playitd-windows-x86-signed.exe' : 'playitd-windows-x86_64-signed.exe'), part);
    const head = fs.readFileSync(part).subarray(0, 2).toString('latin1');
    if (n < 1e6 || head !== 'MZ') { fs.rmSync(part, { force: true }); throw new Error('What SKBox downloaded was not the playit.gg agent, so it was not used.'); }
    const sig = await verifySignature(part);
    if (sig.status !== 'Valid' || !SIGNER.test(sig.subject || '')) { fs.rmSync(part, { force: true }); throw new Error('The playit.gg agent was not signed by its publisher' + (sig.subject ? ' (signed by ' + sig.subject.slice(0, 60) + ')' : ' (no valid signature)') + ', so SKBox did not run it.'); }
    fs.renameSync(part, exe); return exe;
  }
  async function ensureAgent() {
    clearTimeout(stopT); stopT = null; if (proc) return true; const key = readSecret(); if (!key) throw new Error('Set up playit.gg first.');
    if (platform !== 'win32') throw new Error('playit.gg tunnels work on Windows in SKBox.');
    st.agent = 'starting'; st.agentError = ''; emit(); let bin; try { bin = await ensureExe(); } catch (e) { st.agent = 'error'; st.agentError = e.message; emit(); throw e; }
    if (proc) return true; intentional = false; let err = '';
    const p = (ctx.spawn || cp.spawn)(bin, ['--secret-path', secretFile, '--socket-path', PIPE, '--log-path', logFile], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); proc = p;
    if (p.stderr) p.stderr.on('data', d => { err = (err + d.toString()).slice(-600); });
    p.on('error', e => { proc = null; st.agent = 'error'; st.agentError = 'Could not start the playit.gg agent: ' + e.message; emit(); });
    p.on('exit', code => {
      if (proc === p) proc = null; if (intentional) { st.agent = 'stopped'; st.agentError = ''; emit(); return; }
      const t = now(); restarts = restarts.filter(x => t - x < 600000);
      if (active.size && restarts.length < 3) { restarts.push(t); st.agent = 'starting'; emit(); setTimeout(() => { if (active.size && !proc) ensureAgent().catch(() => {}); }, ctx.restartDelay == null ? 4000 : ctx.restartDelay); return; }
      st.agent = 'error'; st.agentError = (err.trim().split('\n').pop() || 'The playit.gg agent closed (code ' + code + ').').slice(0, 160); emit();
    });
    setTimeout(() => { if (proc === p && st.agent === 'starting') { st.agent = 'running'; emit(); } }, ctx.settleMs == null ? 2500 : ctx.settleMs);
    return true;
  }
  function stopAgent() { clearTimeout(stopT); stopT = null; if (proc) { intentional = true; try { proc.kill(); } catch (_) {} } else if (st.agent !== 'stopped') { st.agent = 'stopped'; emit(); } }
  function scheduleStop() { clearTimeout(stopT); stopT = setTimeout(() => { if (!active.size) stopAgent(); }, ctx.idleStopMs == null ? 20000 : ctx.idleStopMs); }

  // ---------- tunnels ----------
  const tunnelName = id => ('skbox-' + String(id).replace(/[^a-z0-9]/gi, '')).slice(0, 20).toLowerCase();
  const fieldOf = (t, k) => { const f = ((t.agent_config || {}).fields || []).find(x => x.name === k); return f ? f.value : ''; };
  function findTunnel(rd, name, port) {
    const list = (rd && rd.tunnels) || [];
    return list.find(t => t.name === name) || list.find(t => (!t.tunnel_type || t.tunnel_type === 'minecraft-java') && String(fieldOf(t, 'local_port')) === String(port) && /^(127\.0\.0\.1|localhost|::1)?$/.test(fieldOf(t, 'local_ip') || ''));
  }
  async function makeTunnel(agentId, name, port, secret) {
    const legacy = { name, tunnel_type: 'minecraft-java', port_type: 'tcp', port_count: 1, origin: { type: 'agent', data: { agent_id: agentId, local_ip: '127.0.0.1', local_port: port } }, enabled: true, alloc: { type: 'region', details: { region: 'global' } }, firewall_id: null, proxy_protocol: null };
    const v1 = { ports: { type: 'tunnel-type', details: 'minecraft-java' }, origin: { type: 'agent', data: { agent_id: agentId, config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, { name: 'local_port', value: String(port) }] } } }, enabled: true, alloc: { type: 'region', details: { region: 'global', port: null } }, name, firewall_id: null };
    let first; try { return await api('/tunnels/create', legacy, secret); } catch (e) { first = e; if (e.net || e.auth || e.busy || ['RequiresVerifiedAccount', 'RequiresPlayitPremium'].includes(e.playit)) throw e; }
    try { return await api('/v1/tunnels/create', v1, secret); } catch (e2) { if (e2.net || e2.auth || e2.busy) throw e2; throw (first && first.playit && !MSG[first.playit] ? e2 : first) || e2; }
  }
  async function tunnelFor(server) {   // server: { id, name, port }
    const id = server.id; const secret = readSecret(); if (!secret) throw new Error('Set up playit.gg first.');
    tunnelBusy[id] = true; emit();
    try {
      const name = tunnelName(id); let rd = await api('/v1/agents/rundata', {}, secret), t = findTunnel(rd, name, server.port);
      if (t && t.disabled_reason) throw new Error('This tunnel is turned off on playit.gg: ' + String(t.disabled_reason).slice(0, 80));
      if (!t) {
        await makeTunnel(rd.agent_id, name, server.port, secret);
        for (let i = 0; i < (ctx.waitTries == null ? 16 : ctx.waitTries); i++) { await sleep(ctx.waitMs == null ? 1500 : ctx.waitMs); rd = await api('/v1/agents/rundata', {}, secret); t = findTunnel(rd, name, server.port); if (t && t.display_address) break; }
      }
      if (!t || !t.display_address) { const pend = ((rd && rd.pending) || []).find(x => x.name === name); throw new Error(pend && pend.status_msg ? 'playit.gg is still setting it up: ' + String(pend.status_msg).slice(0, 80) : 'playit.gg is still setting up the address. Try again in a minute.'); }
      const sv = saved(); sv.tunnels = sv.tunnels || {}; sv.tunnels[id] = { address: t.display_address, name, port: server.port, at: now() }; setSaved(sv); return t.display_address;
    } catch (e) {
      if (e.auth) { try { fs.rmSync(secretFile, { force: true }); } catch (_) {} stopAgent(); st.phase = 'off'; st.error = 'playit.gg no longer accepts this PC. Set it up again.'; }
      const sv = saved(); sv.tunnels = sv.tunnels || {}; sv.tunnels[id] = Object.assign({}, sv.tunnels[id], { error: e.message.slice(0, 160) }); setSaved(sv); throw e;   // keep a working address even if a later check fails
    } finally { delete tunnelBusy[id]; emit(); }
  }
  function resumeTunnels() { (ctx.servers ? ctx.servers() : []).filter(s => s.playit).forEach(s => { const sv = saved().tunnels || {}; if (!(sv[s.id] && sv[s.id].address)) tunnelFor(s).catch(() => {}); }); }

  // ---------- public ----------
  function onServer(v) {   // called whenever a server changes state
    if (!v || !v.id) return; const on = v.playit && ['starting', 'running'].includes(v.state);
    if (on) { active.add(v.id); if (claimed() && platform === 'win32') ensureAgent().catch(() => {}); } else active.delete(v.id);
    if (!active.size && (proc || st.agent === 'starting')) scheduleStop();
    if (v.removed) { const sv = saved(); if (sv.tunnels && sv.tunnels[v.id]) { delete sv.tunnels[v.id]; setSaved(sv); } }
  }
  async function enable(id) {
    const server = ctx.getServer && ctx.getServer(id); if (!server) return { ok: false, error: 'That server is gone.' };
    if (platform !== 'win32') return { ok: false, error: 'playit.gg tunnels work on Windows in SKBox.' };
    if (ctx.setFlag) ctx.setFlag(id, true);
    if (!claimed()) { startClaim(); await sleep(ctx.firstWaitMs == null ? 1500 : ctx.firstWaitMs); return Object.assign(status(), { needsClaim: true }); }
    try { const address = await tunnelFor(server); if (['starting', 'running'].includes(server.state)) { active.add(id); ensureAgent().catch(() => {}); } return Object.assign(status(), { address }); } catch (e) { return Object.assign(status(), { ok: false, error: e.message }); }
  }
  function disable(id) { if (ctx.setFlag) ctx.setFlag(id, false); active.delete(id); if (!active.size) scheduleStop(); emit(); return Object.assign(status(), { ok: true }); }
  function reset() { cancelClaim = true; stopAgent(); try { fs.rmSync(secretFile, { force: true }); } catch (_) {} setSaved({ tunnels: {} }); st.phase = 'off'; st.claimUrl = ''; st.error = ''; (ctx.servers ? ctx.servers() : []).forEach(s => { if (s.playit && ctx.setFlag) ctx.setFlag(s.id, false); }); emit(); return Object.assign(status(), { ok: true }); }
  function openClaim() { if (!st.claimUrl) return { ok: false, error: 'There is no link to open right now.' }; if (ctx.openExternal) ctx.openExternal(st.claimUrl); return { ok: true }; }
  async function run(name, a) {
    if (typeof name !== 'string' || !name.startsWith('playit')) return null; a = a || {};
    try { switch (name) {
      case 'playitStatus': return status(); case 'playitEnable': return await enable(String(a.id || a)); case 'playitDisable': return disable(String(a.id || a));
      case 'playitRetry': { const id = String(a.id || a); const s = ctx.getServer && ctx.getServer(id); if (!s) return { ok: false, error: 'That server is gone.' }; if (!claimed()) { startClaim(); await sleep(ctx.firstWaitMs == null ? 1500 : ctx.firstWaitMs); return status(); } try { await tunnelFor(s); return status(); } catch (e) { return Object.assign(status(), { ok: false, error: e.message }); } }
      case 'playitOpenClaim': return openClaim(); case 'playitCancelClaim': cancelClaim = true; st.phase = 'off'; st.claimUrl = ''; emit(); return status(); case 'playitReset': return reset();
    } } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
    return null;
  }
  return { run, onServer, status, stop: () => { cancelClaim = true; stopAgent(); }, _: { api, tunnelFor, ensureAgent, startClaim, readSecret, writeSecret, st, findTunnel, tunnelName, active: () => active } };
}
module.exports = { create, API, DL, PIPE };
