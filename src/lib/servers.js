// SKServers: create, run and manage Minecraft servers on this PC, with a plugin / mod installer (Modrinth and SpigotMC).
// Everything that touches the network, a process or an archive goes through ctx so it can be tested without a real PC.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto'), net = require('net');

const UA = 'SKBox-SKServers/1.22.0';
const TYPES = {
  paper: { name: 'Paper', blurb: 'Fast and plugin-ready. The best choice for most servers.', dir: 'plugins', loaders: ['paper', 'spigot', 'bukkit'], spiget: true },
  purpur: { name: 'Purpur', blurb: 'Paper with extra gameplay options. Plugins work the same.', dir: 'plugins', loaders: ['purpur', 'paper', 'spigot', 'bukkit'], spiget: true },
  fabric: { name: 'Fabric', blurb: 'Light and fast, for mods instead of plugins.', dir: 'mods', loaders: ['fabric'], spiget: false },
  vanilla: { name: 'Vanilla', blurb: 'The plain Mojang server. No plugins or mods.', dir: null, loaders: [], spiget: false }
};
const FEATURED = {
  plugins: ['luckperms', 'chunky', 'spark', 'worldedit', 'worldguard', 'essentialsx', 'viaversion', 'geyser', 'floodgate', 'coreprotect', 'placeholderapi', 'bluemap', 'dynmap', 'squaremap', 'multiverse-core', 'griefprevention'],
  mods: ['fabric-api', 'lithium', 'ferrite-core', 'krypton', 'c2me-fabric', 'spark', 'chunky', 'luckperms', 'simple-voice-chat', 'ledger']
};
const PACKS = {
  plugins: [
    { id: 'starter', name: 'Starter pack', desc: 'LuckPerms (permissions), Chunky (pre-generate the world) and spark (find lag).', slugs: ['luckperms', 'chunky', 'spark'] },
    { id: 'bedrock', name: 'Bedrock players', desc: 'Geyser and Floodgate let phone and console players join. They also need UDP port 19132 open.', slugs: ['geyser', 'floodgate'] },
    { id: 'map', name: 'Live map', desc: 'BlueMap: a map of your world in a web browser.', slugs: ['bluemap'] }
  ],
  mods: [
    { id: 'starter', name: 'Performance pack', desc: 'Fabric API, Lithium, FerriteCore and Krypton for a smoother server.', slugs: ['fabric-api', 'lithium', 'ferrite-core', 'krypton'] }
  ]
};
const PROP_DEFAULTS = { motd: 'A Minecraft Server', 'max-players': '20', difficulty: 'easy', gamemode: 'survival', pvp: 'true', 'online-mode': 'true', 'white-list': 'false', 'allow-flight': 'false', 'view-distance': '10', 'simulation-distance': '10', 'spawn-protection': '16', 'enable-command-block': 'false', hardcore: 'false', 'allow-nether': 'true', 'spawn-monsters': 'true', 'spawn-animals': 'true', 'level-name': 'world', 'level-seed': '', 'server-port': '25565' };

// ---------- small helpers ----------
const RELEASE = /^\d+(\.\d+){1,2}$/;
function cmpVer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; } return 0; }   // newest first
const atLeast117 = v => { const [a, b] = String(v).split('.').map(Number); return a >= 26 || (a === 1 && b >= 17); };
function javaFor(v) { const [a, b, c] = String(v).split('.').map(Number); if (a >= 26) return 25; if (a === 1 && (b > 20 || (b === 20 && (c || 0) >= 5))) return 21; return 17; }
function parseJavaMajor(text) { const m = /version "(\d+)(?:\.(\d+))?/.exec(String(text || '')); if (!m) return 0; return +m[1] === 1 ? +(m[2] || 0) : +m[1]; }
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'server';
const safeFile = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 120);
const psq = s => "'" + String(s).replace(/'/g, "''") + "'";
const stripAnsi = s => String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
const ms = n => new Promise(r => setTimeout(r, n));

function parseProps(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if (!line.trim() || /^\s*[#!]/.test(line)) { out.push({ raw: line }); return; }
    const m = /^([^=:\s]+)\s*[=:]?\s*(.*)$/.exec(line); if (!m) { out.push({ raw: line }); return; }
    out.push({ k: m[1], v: m[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\([\\:=#!])/g, '$1') });
  });
  return out;
}
const escVal = v => String(v).replace(/\\/g, '\\\\').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
function propsToObj(entries) { const o = {}; entries.forEach(e => { if (e.k) o[e.k] = e.v; }); return o; }
function setProps(text, updates) {
  const entries = parseProps(text); const done = new Set();
  entries.forEach(e => { if (e.k && Object.prototype.hasOwnProperty.call(updates, e.k)) { e.v = String(updates[e.k]); done.add(e.k); } });
  while (entries.length && entries[entries.length - 1].raw === '') entries.pop();
  Object.keys(updates).forEach(k => { if (!done.has(k)) entries.push({ k, v: String(updates[k]) }); });
  return entries.map(e => e.k ? e.k + '=' + escVal(e.v) : e.raw).join('\n').replace(/\n*$/, '\n');
}

function create(ctx) {
  const F = ctx.fetch || ((u, o) => fetch(u, o)), now = () => (ctx.now ? ctx.now() : Date.now());
  const root = path.join(ctx.dir, 'servers'), javaRoot = path.join(ctx.dir, 'java'), backupRoot = path.join(ctx.dir, 'server-backups');
  const send = (ch, p) => { try { ctx.send && ctx.send(ch, p); } catch {} };
  const runtime = {};   // id -> { proc, state, startedAt, players, log, err, restarts }
  const cache = {};     // url -> { t, v }
  const read = () => { const a = ctx.store.read('servers', []); return Array.isArray(a) ? a : []; };
  const write = a => ctx.store.write('servers', a);
  const find = id => read().find(s => s.id === id);
  const update = (id, fn) => { const a = read(), i = a.findIndex(s => s.id === id); if (i < 0) return null; fn(a[i]); write(a); return a[i]; };
  const dirOf = s => path.join(root, s.folder);
  const rt = id => runtime[id] || (runtime[id] = { state: 'stopped', players: new Set(), log: [], restarts: [] });
  const stateOf = id => rt(id).state;
  const typeOf = s => TYPES[s.type] || TYPES.vanilla;

  // ---------- network ----------
  async function http(url, o) {
    o = o || {}; const c = new AbortController(), t = setTimeout(() => c.abort(), o.timeout || 20000);
    try { const r = await F(url, Object.assign({ signal: c.signal, redirect: 'follow' }, o.init, { headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, o.headers || {}) })); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r; }
    catch (e) { if (e.name === 'AbortError') throw new Error('The server did not answer in time.'); throw e; } finally { clearTimeout(t); }
  }
  async function json(url, o) { o = o || {}; const c = cache[url]; if (c && now() - c.t < (o.ttl || 0)) return c.v; const r = await http(url, o); const v = await r.json(); if (o.ttl) cache[url] = { t: now(), v }; return v; }
  async function download(url, dest, o) {
    o = o || {}; const r = await http(url, { timeout: 30000, headers: { Accept: '*/*' } }); const tmp = dest + '.part', total = +((r.headers && r.headers.get && r.headers.get('content-length')) || 0);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); const out = fs.createWriteStream(tmp), hash = o.algo ? crypto.createHash(o.algo) : null; let got = 0, failed = null; out.on('error', e => { failed = e; });
    try {
      if (r.body && typeof r.body.getReader === 'function') { const rd = r.body.getReader(); for (;;) { const x = await rd.read(); if (x.done) break; got += x.value.length; if (hash) hash.update(x.value); if (failed) throw failed; if (!out.write(x.value)) await new Promise(res => out.once('drain', res)); if (o.progress) o.progress(got, total); } }
      else { const b = Buffer.from(await r.arrayBuffer()); got = b.length; if (hash) hash.update(b); out.write(b); if (o.progress) o.progress(got, got); }
      await new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); out.end(); });
    } catch (e) { out.destroy(); try { fs.unlinkSync(tmp); } catch {} throw e; }
    if (hash && o.sum && hash.digest('hex').toLowerCase() !== String(o.sum).toLowerCase()) { try { fs.unlinkSync(tmp); } catch {} throw new Error('The download did not match its checksum, so it was thrown away.'); }
    fs.renameSync(tmp, dest); return got;
  }
  const progress = (id, stage, pct, text) => send('sks:progress', { id, stage, pct, text });

  // ---------- server software ----------
  async function versions(type) {
    if (!TYPES[type]) throw new Error('Unknown server software.'); let list = [];
    if (type === 'paper') { const d = await json('https://fill.papermc.io/v3/projects/paper', { ttl: 600000 }); const v = d && d.versions; list = Array.isArray(v) ? v : [].concat(...Object.values(v || {})); }
    else if (type === 'purpur') { const d = await json('https://api.purpurmc.org/v2/purpur', { ttl: 600000 }); list = (d && d.versions) || []; }
    else if (type === 'fabric') { const d = await json('https://meta.fabricmc.net/v2/versions/game', { ttl: 600000 }); list = (d || []).filter(x => x.stable).map(x => x.version); }
    else { const d = await json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { ttl: 600000 }); list = ((d && d.versions) || []).filter(x => x.type === 'release').map(x => x.id); }
    return Array.from(new Set(list.filter(v => RELEASE.test(v) && atLeast117(v)))).sort(cmpVer);
  }
  // returns { url, sum, algo, build }
  async function resolveJar(type, v) {
    if (type === 'paper') {
      const b = await json('https://fill.papermc.io/v3/projects/paper/versions/' + encodeURIComponent(v) + '/builds'); const st = (Array.isArray(b) ? b : []).find(x => x.channel === 'STABLE' && x.downloads && x.downloads['server:default']);
      if (!st) throw new Error('Paper has no stable build for ' + v + ' yet. Pick another version.'); const d = st.downloads['server:default']; return { url: d.url, sum: d.checksums && d.checksums.sha256, algo: 'sha256', build: String(st.id) };
    }
    if (type === 'purpur') { const d = await json('https://api.purpurmc.org/v2/purpur/' + encodeURIComponent(v)); const latest = d && d.builds && d.builds.latest; if (!latest) throw new Error('Purpur has no build for ' + v + '.'); return { url: 'https://api.purpurmc.org/v2/purpur/' + encodeURIComponent(v) + '/' + latest + '/download', build: String(latest) }; }
    if (type === 'fabric') {
      const [lo, ins] = await Promise.all([json('https://meta.fabricmc.net/v2/versions/loader', { ttl: 600000 }), json('https://meta.fabricmc.net/v2/versions/installer', { ttl: 600000 })]);
      const l = (lo || []).find(x => x.stable) || (lo || [])[0], i = (ins || []).find(x => x.stable) || (ins || [])[0]; if (!l || !i) throw new Error('Could not find the Fabric loader.');
      return { url: 'https://meta.fabricmc.net/v2/versions/loader/' + encodeURIComponent(v) + '/' + l.version + '/' + i.version + '/server/jar', build: l.version };
    }
    const m = await json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { ttl: 600000 }), e = ((m && m.versions) || []).find(x => x.id === v); if (!e) throw new Error('Minecraft ' + v + ' was not found.');
    const d = await json(e.url), sv = d && d.downloads && d.downloads.server; if (!sv) throw new Error('Minecraft ' + v + ' has no server download.'); return { url: sv.url, sum: sv.sha1, algo: 'sha1', build: '' };
  }

  // ---------- Java ----------
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const ownJava = major => path.join(javaRoot, String(major), 'bin', exe);
  async function javaVersionOf(p) {
    if (ctx.javaVersionOf) return ctx.javaVersionOf(p);
    return new Promise(res => { try { cp.execFile(p, ['-version'], { timeout: 8000, windowsHide: true }, (e, so, se) => res(parseJavaMajor(String(se || '') + String(so || '')))); } catch { res(0); } });
  }
  async function findJava(major) {
    if (fs.existsSync(ownJava(major))) return { path: ownJava(major), major, own: true };
    let dirs = []; try { dirs = fs.readdirSync(javaRoot).map(Number).filter(n => n >= major).sort((a, b) => a - b); } catch {}
    for (const d of dirs) if (fs.existsSync(ownJava(d))) return { path: ownJava(d), major: d, own: true };
    const cands = []; if (process.env.JAVA_HOME) cands.push(path.join(process.env.JAVA_HOME, 'bin', exe)); cands.push('java');
    for (const c of cands) { const v = await javaVersionOf(c); if (v >= major) return { path: c, major: v, own: false }; }
    return null;
  }
  async function extractZip(zip, dest) {
    if (ctx.extract) return ctx.extract(zip, dest); fs.mkdirSync(dest, { recursive: true });
    try { await new Promise((res, rej) => cp.execFile('tar', ['-xf', zip, '-C', dest], { timeout: 300000, windowsHide: true }, e => e ? rej(e) : res())); }
    catch { await ps('Expand-Archive -LiteralPath ' + psq(zip) + ' -DestinationPath ' + psq(dest) + ' -Force'); }
  }
  function ps(script) { if (ctx.ps) return ctx.ps(script); return new Promise((res, rej) => cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 600000, windowsHide: true, maxBuffer: 1 << 24 }, (e, so, se) => e ? rej(new Error(String(se || e.message).slice(0, 200))) : res(so))); }
  async function installJava(major, id) {
    if (process.platform !== 'win32' && !ctx.extract) throw new Error('SKBox can only download Java on Windows. Install Java ' + major + ' and try again.');
    const zip = path.join(javaRoot, 'java-' + major + '.zip'), tmp = path.join(javaRoot, '_tmp' + major);
    progress(id, 'java', 0, 'Downloading Java ' + major + '\u2026');
    await download('https://api.adoptium.net/v3/binary/latest/' + major + '/ga/windows/x64/jre/hotspot/normal/eclipse', zip, { progress: (g, t) => progress(id, 'java', t ? Math.round(g / t * 100) : 0, 'Downloading Java ' + major + '\u2026') });
    progress(id, 'java', 100, 'Unpacking Java ' + major + '\u2026'); fs.rmSync(tmp, { recursive: true, force: true }); await extractZip(zip, tmp);
    const sub = fs.readdirSync(tmp).map(n => path.join(tmp, n)).find(p => fs.existsSync(path.join(p, 'bin', exe))); if (!sub) throw new Error('The Java download did not contain a program.');
    fs.rmSync(path.join(javaRoot, String(major)), { recursive: true, force: true }); fs.renameSync(sub, path.join(javaRoot, String(major))); fs.rmSync(tmp, { recursive: true, force: true }); try { fs.unlinkSync(zip); } catch {}
    return { path: ownJava(major), major, own: true };
  }
  const javaBusy = {};   // major -> promise, so two servers starting together share one Java download
  async function ensureJava(major, id) {
    const have = await findJava(major); if (have) return have;
    if (!javaBusy[major]) javaBusy[major] = installJava(major, id).finally(() => { delete javaBusy[major]; });
    return javaBusy[major];
  }

  // ---------- servers ----------
  const portFree = port => new Promise(res => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '0.0.0.0'); });
  const lanIps = () => { const o = []; const n = os.networkInterfaces(); Object.keys(n).forEach(k => (n[k] || []).forEach(a => { if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) o.push(a.address); })); return o; };
  const view = s => { const r = rt(s.id); return Object.assign({}, s, { state: r.state, players: Array.from(r.players), startedAt: r.startedAt || 0, error: r.err || '', progress: r.prog || null, typeName: typeOf(s).name, pluginDir: typeOf(s).dir, canPlugins: !!typeOf(s).dir, mc: s.version }); };
  const list = () => ({ ok: true, list: read().map(view), ips: lanIps(), totalMB: Math.round(os.totalmem() / 1048576), freeMB: Math.round(os.freemem() / 1048576) });
  const emit = id => { const s = find(id); if (s) { const v = view(s); send('sks:state', v); if (ctx.onState) { try { ctx.onState(v); } catch (_) {} } } };
  const note = (title, body) => { try { ctx.notify && ctx.notify(title, body); } catch (_) {} };
  const setState = (id, st, err) => { const r = rt(id); r.state = st; r.err = err || ''; emit(id); };

  async function createServer(a) {
    a = a || {}; const name = String(a.name || '').trim().slice(0, 40), type = String(a.type || ''), v = String(a.version || '');
    if (!name) return { ok: false, error: 'Give the server a name.' }; if (!TYPES[type]) return { ok: false, error: 'Pick the server software.' }; if (!RELEASE.test(v) || !atLeast117(v)) return { ok: false, error: 'Pick a Minecraft version (1.17 or newer).' };
    if (!a.eula) return { ok: false, error: 'You have to accept the Minecraft EULA to run a server.' };
    const ram = Math.max(512, Math.min(65536, Math.round(+a.ram || 2048))), port = Math.round(+a.port || 25565); if (!(port >= 1024 && port <= 65535)) return { ok: false, error: 'Use a port between 1024 and 65535.' };
    if (read().some(s => s.port === port)) return { ok: false, error: 'Another of your servers already uses port ' + port + '. Pick a different one.' };
    const id = 's_' + now().toString(36) + Math.random().toString(36).slice(2, 5), folder = slug(name) + '-' + id.slice(-4), s = { id, name, type, version: v, build: '', ram, port, folder, java: javaFor(v), created: now(), autoStart: false, autoRestart: true, jvm: '', motd: String(a.motd || '').slice(0, 80) };
    const dir = dirOf(s); const R = rt(id); let javaWarn = ''; R.state = 'installing'; write(read().concat([s])); emit(id);
    try {
      progress(id, 'jar', 0, 'Finding ' + TYPES[type].name + ' ' + v + '\u2026'); const j = await resolveJar(type, v); s.build = j.build || '';
      fs.mkdirSync(dir, { recursive: true });
      await download(j.url, path.join(dir, 'server.jar'), { algo: j.sum ? j.algo : '', sum: j.sum, progress: (g, t) => progress(id, 'jar', t ? Math.round(g / t * 100) : 0, 'Downloading ' + TYPES[type].name + ' ' + v + '\u2026') });
      fs.writeFileSync(path.join(dir, 'eula.txt'), '#By changing the setting below to TRUE you are indicating your agreement to the Minecraft EULA (https://aka.ms/MinecraftEULA).\neula=true\n');
      const props = { 'server-port': port, motd: s.motd || name }; if (a.gamemode) props.gamemode = a.gamemode; if (a.difficulty) props.difficulty = a.difficulty; if (a.seed) props['level-seed'] = String(a.seed).slice(0, 60); if (a.onlineMode === false) props['online-mode'] = 'false';
      fs.writeFileSync(path.join(dir, 'server.properties'), setProps('', props));
      const dirT = TYPES[type].dir; if (dirT) fs.mkdirSync(path.join(dir, dirT), { recursive: true });
      update(id, x => { x.build = s.build; }); try { await ensureJava(s.java, id); } catch (e) { javaWarn = 'Java could not be downloaded yet (' + String((e && e.message) || e).slice(0, 80) + '). SKBox will try again when you start the server.'; }
    } catch (e) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} write(read().filter(x => x.id !== id)); delete runtime[id]; send('sks:state', { id, removed: true });
      return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
    }
    setState(id, 'stopped'); progress(id, 'done', 100, 'Ready'); return { ok: true, id, server: view(find(id)), warn: javaWarn };
  }

  const pushLog = (id, lines) => {
    const r = rt(id); lines.forEach(l => { r.log.push(l); }); if (r.log.length > 1000) r.log.splice(0, r.log.length - 800);
    r.pend = (r.pend || []).concat(lines); if (!r.flush) r.flush = setTimeout(() => { r.flush = null; const p = r.pend; r.pend = []; send('sks:log', { id, lines: p }); }, 120);
  };
  function watchLine(id, line) {
    const r = rt(id); let m;
    if (/Done \([\d.,]+s\)! For help/.test(line)) { const was = r.state; r.state = 'running'; r.startedAt = r.startedAt || now(); emit(id); const sv = find(id); if (was !== 'running' && sv && sv.notifyReady !== false) note(sv.name + ' is ready', 'Players can join now.'); }
    else if ((m = /\]: ([A-Za-z0-9_.]{1,32}) joined the game/.exec(line))) { r.players.add(m[1]); emit(id); const sv = find(id); if (sv && sv.notifyJoin) note(sv.name, m[1] + ' joined'); }
    else if ((m = /\]: ([A-Za-z0-9_.]{1,32}) left the game/.exec(line))) { r.players.delete(m[1]); emit(id); }
    else if (/FAILED TO BIND TO PORT|Address already in use/i.test(line)) r.err = 'That port is already in use. Close whatever uses it or pick another port.';
    else if (/You need to agree to the EULA/i.test(line)) r.err = 'The Minecraft EULA has not been accepted.';
    else if (/UnsupportedClassVersionError|requires running the server with Java/i.test(line)) r.err = 'This needs a newer Java. SKBox will download the right one next time you start it.';
  }

  async function start(id) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; const R = rt(id);
    if (['starting', 'running', 'stopping', 'installing'].includes(R.state)) return { ok: false, error: 'It is already ' + R.state + '.' };
    const dir = dirOf(s); if (!fs.existsSync(path.join(dir, 'server.jar'))) return { ok: false, error: 'server.jar is missing. Use Update server software to download it again.' };
    if (!(await portFree(s.port))) return { ok: false, error: 'Port ' + s.port + ' is already in use on this PC. Another server or program has it. Change the port in Settings.' };
    R.players = new Set(); R.startedAt = 0; const token = R.startToken = (R.startToken || 0) + 1; setState(id, 'starting');
    let j; try { j = await ensureJava(s.java || javaFor(s.version), id); } catch (e) { if (R.startToken !== token) return { ok: true, cancelled: true }; setState(id, 'crashed', 'Java is missing: ' + String((e && e.message) || e).slice(0, 160)); return { ok: false, error: R.err }; }
    if (R.startToken !== token) return { ok: true, cancelled: true };   // Stop was pressed while Java was still downloading
    const args = ['-Xms' + Math.min(s.ram, 1024) + 'M', '-Xmx' + s.ram + 'M', '-Dfile.encoding=UTF-8'].concat(String(s.jvm || '').split(/\s+/).filter(Boolean), ['-jar', 'server.jar', 'nogui']);
    let proc; try { proc = (ctx.spawn || cp.spawn)(j.path, args, { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { setState(id, 'crashed', 'Could not start Java.'); return { ok: false, error: R.err }; }
    R.proc = proc; R.stopping = false; pushLog(id, ['[SKServers] Starting ' + s.name + ' (' + typeOf(s).name + ' ' + s.version + ', ' + Math.round(s.ram / 1024 * 10) / 10 + ' GB)\u2026']);
    const feed = () => { let buf = ''; return d => { buf += stripAnsi(d.toString('utf8')); const parts = buf.split('\n'); buf = parts.pop(); const lines = parts.map(l => l.slice(0, 2000)).filter(l => l.length); if (lines.length) { lines.forEach(l => watchLine(id, l)); pushLog(id, lines); } }; };
    if (proc.stdout) proc.stdout.on('data', feed()); if (proc.stderr) proc.stderr.on('data', feed()); if (proc.stdin) proc.stdin.on('error', () => {});
    proc.on('error', e => { R.proc = null; setState(id, 'crashed', 'Could not start Java: ' + String(e.message).slice(0, 100)); });
    proc.on('exit', code => {
      clearTimeout(R.killT); R.proc = null; R.players = new Set(); R.startedAt = 0; const wasStopping = R.stopping; R.stopping = false;
      pushLog(id, ['[SKServers] The server ' + (wasStopping ? 'stopped.' : 'closed (exit code ' + code + ').')]);
      if (wasStopping || code === 0) { setState(id, 'stopped'); const w = R.waiters; R.waiters = []; (w || []).forEach(f => f()); const sv = find(id); if (sv && sv.backupOnStop && worlds(sv).length) backup(id).then(b => { pushLog(id, ['[SKServers] ' + (b.ok ? 'Backup saved: ' + b.file : 'Backup failed: ' + b.error)]); if (!b.ok) note(sv.name, 'The automatic backup did not work.'); }); return; }
      const known = R.err; setState(id, 'crashed', known || 'The server closed unexpectedly (exit code ' + code + '). Check the console.'); const w = R.waiters; R.waiters = []; (w || []).forEach(f => f());
      const cur = find(id); const t = now(); R.restarts = R.restarts.filter(x => t - x < 600000);
      if (cur && cur.autoRestart && R.restarts.length < 3 && !known) { R.restarts.push(t); pushLog(id, ['[SKServers] Restarting in 5 seconds (' + R.restarts.length + ' of 3)\u2026']); setTimeout(() => { if (rt(id).state === 'crashed') start(id); }, ctx.restartDelay == null ? 5000 : ctx.restartDelay); }
    });
    return { ok: true };
  }
  function killTree(proc) { try { if (process.platform === 'win32' && !ctx.spawn) cp.execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {}); else proc.kill('SIGKILL'); } catch {} }
  function stop(id, force) {
    const R = rt(id); if (!R.proc) { if (R.state === 'starting') { R.startToken = (R.startToken || 0) + 1; setState(id, 'stopped'); } return Promise.resolve({ ok: true, state: R.state }); }
    return new Promise(res => {
      R.waiters = (R.waiters || []).concat([() => res({ ok: true, state: 'stopped' })]);
      if (force) { R.stopping = true; killTree(R.proc); return; }
      if (R.state !== 'stopping') { R.stopping = true; setState(id, 'stopping'); try { R.proc.stdin.write('stop\n'); } catch {} R.killT = setTimeout(() => { if (R.proc) { pushLog(id, ['[SKServers] It did not stop in time, ending it.']); killTree(R.proc); } }, ctx.stopTimeout || 45000); }
    });
  }
  async function command(id, text) {
    const R = rt(id); text = String(text || '').replace(/[\r\n]+/g, ' ').trim().replace(/^\//, ''); if (!text) return { ok: false, error: 'Type a command.' };
    if (!R.proc || !['running', 'starting'].includes(R.state)) return { ok: false, error: 'The server is not running.' };
    try { R.proc.stdin.write(text + '\n'); } catch { return { ok: false, error: 'Could not send that.' }; } pushLog(id, ['> ' + text]); return { ok: true };
  }
  const anyRunning = () => Object.keys(runtime).some(id => runtime[id].proc);
  const stopAll = async (t) => { const ids = Object.keys(runtime).filter(id => runtime[id].proc); const all = Promise.all(ids.map(id => stop(id))); await Promise.race([all, ms(t || 20000)]); ids.forEach(id => { if (runtime[id].proc) killTree(runtime[id].proc); }); };
  function autoStart() { read().filter(s => s.autoStart).forEach((s, i) => setTimeout(() => start(s.id), 3000 * (i + 1))); }

  function logOf(id) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; const R = rt(id);
    if (R.log.length) return { ok: true, lines: R.log.slice(-400), state: R.state };
    try { const t = fs.readFileSync(path.join(dirOf(s), 'logs', 'latest.log'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-150); return { ok: true, lines: t, state: R.state }; } catch { return { ok: true, lines: [], state: R.state }; }
  }
  function getProps(id) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; let t = ''; try { t = fs.readFileSync(path.join(dirOf(s), 'server.properties'), 'utf8'); } catch {}
    const o = Object.assign({}, PROP_DEFAULTS, propsToObj(parseProps(t))); return { ok: true, props: o, defaults: PROP_DEFAULTS };
  }
  function putProps(id, upd) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; if (['starting', 'running', 'stopping'].includes(stateOf(id))) return { ok: false, error: 'Stop the server first. It only reads these when it starts.' };
    const clean = {}; Object.keys(upd || {}).forEach(k => { if (/^[a-z0-9.-]{1,60}$/.test(k)) clean[k] = String(upd[k]).slice(0, 300); });
    if (clean['server-port'] != null) { const p = +clean['server-port']; if (!(p >= 1024 && p <= 65535)) return { ok: false, error: 'Use a port between 1024 and 65535.' }; if (read().some(x => x.id !== id && x.port === p)) return { ok: false, error: 'Another of your servers uses that port.' }; update(id, x => { x.port = p; }); }
    const f = path.join(dirOf(s), 'server.properties'); let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch {} fs.writeFileSync(f, setProps(t, clean)); emit(id); return { ok: true };
  }
  function setServer(id, a) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; a = a || {}; const busy = ['starting', 'running', 'stopping'].includes(stateOf(id));
    if ((a.ram != null || a.jvm != null) && busy) return { ok: false, error: 'Stop the server first.' };
    const r = update(id, x => { if (a.name != null && String(a.name).trim()) x.name = String(a.name).trim().slice(0, 40); if (a.ram != null) x.ram = Math.max(512, Math.min(65536, Math.round(+a.ram || x.ram))); if (a.autoStart != null) x.autoStart = !!a.autoStart; if (a.autoRestart != null) x.autoRestart = !!a.autoRestart; if (a.backupOnStop != null) x.backupOnStop = !!a.backupOnStop; if (a.notifyReady != null) x.notifyReady = !!a.notifyReady; if (a.notifyJoin != null) x.notifyJoin = !!a.notifyJoin; if (a.playit != null) x.playit = !!a.playit; if (a.jvm != null) x.jvm = String(a.jvm).replace(/[^\w\s.:=+\-,\/]/g, '').slice(0, 300); });
    emit(id); return { ok: true, server: view(r) };
  }
  async function deleteServer(id) {
    const s = find(id); if (!s) return { ok: true }; if (rt(id).proc) return { ok: false, error: 'Stop the server first.' };
    try { fs.rmSync(dirOf(s), { recursive: true, force: true }); } catch (e) { return { ok: false, error: 'Windows would not delete the folder. Close anything using it.' }; }
    write(read().filter(x => x.id !== id)); delete runtime[id]; send('sks:state', { id, removed: true }); if (ctx.onState) { try { ctx.onState({ id, removed: true }); } catch (_) {} } return { ok: true };
  }
  async function updateSoftware(id, v) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; if (['starting', 'running', 'stopping', 'installing'].includes(stateOf(id))) return { ok: false, error: 'Stop the server first.' };
    v = String(v || s.version); if (!RELEASE.test(v) || !atLeast117(v)) return { ok: false, error: 'Pick a Minecraft version (1.17 or newer).' };
    if (cmpVer(v, s.version) > 0) return { ok: false, error: 'Going back to an older Minecraft version can break the world. Make a new server for that.' };
    setState(id, 'installing');
    try { progress(id, 'jar', 0, 'Finding the new version\u2026'); const j = await resolveJar(s.type, v); const dir = dirOf(s), tmp = path.join(dir, 'server.jar.new');
      await download(j.url, tmp, { algo: j.sum ? j.algo : '', sum: j.sum, progress: (g, t) => progress(id, 'jar', t ? Math.round(g / t * 100) : 0, 'Downloading\u2026') }); fs.renameSync(tmp, path.join(dir, 'server.jar'));
      const major = javaFor(v); await ensureJava(major, id); update(id, x => { x.version = v; x.build = j.build || ''; x.java = major; }); setState(id, 'stopped'); return { ok: true, server: view(find(id)) };
    } catch (e) { setState(id, 'stopped'); return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
  }

  async function duplicate(id) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; if (['starting', 'running', 'stopping', 'installing'].includes(stateOf(id))) return { ok: false, error: 'Stop the server first so its files are not changing.' };
    const nid = 's_' + now().toString(36) + Math.random().toString(36).slice(2, 5), name = (s.name + ' copy').slice(0, 40), folder = slug(name) + '-' + nid.slice(-4); let port = s.port + 1; const used = new Set(read().map(x => x.port)); while (used.has(port) && port < 65535) port++;
    try { fs.cpSync(dirOf(s), path.join(root, folder), { recursive: true, filter: src => !/[\\/](logs|crash-reports)([\\/]|$)/.test(src) }); } catch (e) { try { fs.rmSync(path.join(root, folder), { recursive: true, force: true }); } catch (_) {} return { ok: false, error: 'Could not copy the files: ' + String((e && e.message) || e).slice(0, 100) }; }
    const c = Object.assign({}, s, { id: nid, name, folder, port, created: now(), autoStart: false, playit: false }); write(read().concat([c]));
    try { const f = path.join(root, folder, 'server.properties'); fs.writeFileSync(f, setProps(fs.readFileSync(f, 'utf8'), { 'server-port': port })); } catch (_) {}
    emit(nid); return { ok: true, id: nid, server: view(find(nid)) };
  }

  // ---------- backups ----------
  const bdir = id => path.join(backupRoot, id);
  const worlds = s => { const name = (getProps(s.id).props || {})['level-name'] || 'world'; return [name, name + '_nether', name + '_the_end'].filter(n => fs.existsSync(path.join(dirOf(s), n))); };
  const stamp = () => { const d = new Date(now()), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
  async function backup(id) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; if (rt(id).proc) return { ok: false, error: 'Stop the server first so the world is saved cleanly.' };
    const w = worlds(s); if (!w.length) return { ok: false, error: 'There is no world to back up yet. Start the server once first.' };
    fs.mkdirSync(bdir(id), { recursive: true }); const file = path.join(bdir(id), safeFile(s.name) + '-' + stamp() + '.zip');
    try { if (ctx.compress) await ctx.compress(w.map(n => path.join(dirOf(s), n)), file); else await ps('Compress-Archive -Path ' + w.map(n => psq(path.join(dirOf(s), n))).join(',') + ' -DestinationPath ' + psq(file) + ' -Force'); }
    catch (e) { try { fs.unlinkSync(file); } catch {} return { ok: false, error: 'The backup did not work: ' + String((e && e.message) || e).slice(0, 120) }; }
    const keep = Math.max(1, Math.min(30, ctx.keepBackups || 5)); listBackups(id).list.slice(keep).forEach(b => { try { fs.unlinkSync(path.join(bdir(id), b.file)); } catch {} }); return { ok: true, file: path.basename(file) };
  }
  function listBackups(id) { let f = []; try { f = fs.readdirSync(bdir(id)).filter(n => /\.zip$/i.test(n)).map(n => { const st = fs.statSync(path.join(bdir(id), n)); return { file: n, size: st.size, t: st.mtimeMs }; }).sort((a, b) => b.t - a.t); } catch {} return { ok: true, list: f }; }
  async function restore(id, file) {
    const s = find(id); if (!s) return { ok: false, error: 'That server is gone.' }; if (rt(id).proc) return { ok: false, error: 'Stop the server first.' };
    const zip = path.join(bdir(id), path.basename(String(file || ''))); if (!fs.existsSync(zip)) return { ok: false, error: 'That backup is gone.' };
    const dir = dirOf(s); worlds(s).forEach(n => { try { fs.renameSync(path.join(dir, n), path.join(dir, n + '.before-restore-' + stamp())); } catch {} });
    try { if (ctx.expand) await ctx.expand(zip, dir); else await ps('Expand-Archive -LiteralPath ' + psq(zip) + ' -DestinationPath ' + psq(dir) + ' -Force'); } catch (e) { return { ok: false, error: 'Could not restore: ' + String((e && e.message) || e).slice(0, 120) }; }
    return { ok: true };
  }
  function deleteBackup(id, file) { try { fs.unlinkSync(path.join(bdir(id), path.basename(String(file || '')))); } catch {} return { ok: true }; }

  // ---------- plugins and mods ----------
  const pdir = s => path.join(dirOf(s), typeOf(s).dir || 'plugins'), metaFile = s => path.join(pdir(s), '.skbox-plugins.json');
  const readMeta = s => { try { return JSON.parse(fs.readFileSync(metaFile(s), 'utf8')); } catch { return {}; } };
  const writeMeta = (s, m) => { fs.mkdirSync(pdir(s), { recursive: true }); fs.writeFileSync(metaFile(s), JSON.stringify(m, null, 1)); };
  const needPlugins = s => { if (!s) return 'That server is gone.'; if (!typeOf(s).dir) return 'Vanilla servers cannot use plugins or mods. Make a Paper or Fabric server for that.'; return ''; };
  function installed(id) {
    const s = find(id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; let files = []; try { files = fs.readdirSync(pdir(s)).filter(n => /\.jar(\.disabled)?$/i.test(n)); } catch {}
    const meta = readMeta(s); return { ok: true, kind: typeOf(s).dir, list: files.map(n => { const m = meta[n.replace(/\.disabled$/i, '')] || {}; let size = 0; try { size = fs.statSync(path.join(pdir(s), n)).size; } catch {} return { file: n, enabled: !/\.disabled$/i.test(n), size, src: m.src || '', title: m.title || n.replace(/\.jar(\.disabled)?$/i, ''), version: m.version || '', icon: m.icon || '', pid: m.pid || '', url: m.url || '' }; }).sort((a, b) => a.title.localeCompare(b.title)) };
  }
  const hitFromModrinth = h => ({ src: 'modrinth', pid: h.project_id, slug: h.slug, title: h.title, desc: h.description, downloads: h.downloads || 0, icon: h.icon_url || '', author: h.author || '', cats: (h.display_categories || h.categories || []).filter(c => !TYPES[c] && !['bukkit', 'spigot', 'paper', 'purpur', 'folia', 'fabric', 'quilt', 'forge', 'neoforge', 'sponge', 'velocity', 'bungeecord', 'waterfall'].includes(c)).slice(0, 3), url: 'https://modrinth.com/project/' + h.slug, updated: h.date_modified || '' });
  const facetsFor = s => '[[' + typeOf(s).loaders.map(l => '"categories:' + l + '"').join(',') + '],["versions:' + s.version + '"]]';
  async function searchModrinth(s, q, o) {
    const sort = ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(o.sort) ? o.sort : (q ? 'relevance' : 'downloads'), off = Math.max(0, +o.offset || 0);
    const d = await json('https://api.modrinth.com/v2/search?query=' + encodeURIComponent(q) + '&limit=20&offset=' + off + '&index=' + sort + '&facets=' + encodeURIComponent(facetsFor(s)));
    const hits = ((d && d.hits) || []).filter(h => !h.project_type || ['mod', 'plugin'].includes(h.project_type)).map(hitFromModrinth); return { ok: true, source: 'modrinth', hits, total: (d && d.total_hits) || hits.length, offset: off, more: off + 20 < ((d && d.total_hits) || 0) };
  }
  async function searchSpigot(s, q, o) {
    if (!typeOf(s).spiget) return { ok: false, error: 'SpigotMC plugins only work on Paper and Purpur servers.' }; const page = Math.max(1, Math.round((+o.offset || 0) / 20) + 1);
    const url = q ? 'https://api.spiget.org/v2/search/resources/' + encodeURIComponent(q) + '?field=name&size=20&page=' + page + '&sort=-downloads' : 'https://api.spiget.org/v2/resources/free?size=20&page=' + page + '&sort=-downloads';
    const d = await json(url); const hits = (Array.isArray(d) ? d : []).filter(r => !r.premium).map(r => ({ src: 'spigot', pid: String(r.id), title: r.name, desc: r.tag || '', downloads: r.downloads || 0, icon: r.icon && r.icon.url ? 'https://www.spigotmc.org/' + r.icon.url : '', author: '', cats: [], url: 'https://www.spigotmc.org/resources/' + r.id + '/', tested: r.testedVersions || [], manual: !!r.external || (r.file && r.file.type && r.file.type !== '.jar') || false, updated: r.updateDate ? r.updateDate * 1000 : 0 }));
    return { ok: true, source: 'spigot', hits, total: hits.length, offset: (page - 1) * 20, more: hits.length >= 20 };
  }
  async function searchPlugins(a) {
    a = a || {}; const s = find(a.id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; const q = String(a.q || '').trim().slice(0, 80);
    try { return a.source === 'spigot' ? await searchSpigot(s, q, a) : await searchModrinth(s, q, a); } catch (e) { return { ok: false, error: 'Could not reach ' + (a.source === 'spigot' ? 'SpigotMC (Spiget)' : 'Modrinth') + ' right now.' }; }
  }
  async function featured(id) {
    const s = find(id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; const slugs = FEATURED[typeOf(s).dir === 'mods' ? 'mods' : 'plugins'];
    try { const d = await json('https://api.modrinth.com/v2/projects?ids=' + encodeURIComponent(JSON.stringify(slugs)), { ttl: 900000 }); const loaders = typeOf(s).loaders;
      const hits = (Array.isArray(d) ? d : []).filter(p => !p.loaders || p.loaders.some(l => loaders.includes(l))).filter(p => !p.game_versions || !p.game_versions.length || p.game_versions.includes(s.version)).map(p => ({ src: 'modrinth', pid: p.id, slug: p.slug, title: p.title, desc: p.description, downloads: p.downloads || 0, icon: p.icon_url || '', author: '', cats: [], url: 'https://modrinth.com/project/' + p.slug })).sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
      return { ok: true, hits, packs: PACKS[typeOf(s).dir === 'mods' ? 'mods' : 'plugins'] }; } catch { return { ok: false, error: 'Could not reach Modrinth right now.' }; }
  }
  const uniqueName = (dir, name) => { let n = name, i = 2; while (fs.existsSync(path.join(dir, n)) || fs.existsSync(path.join(dir, n + '.disabled'))) { n = name.replace(/\.jar$/i, '') + '-' + i++ + '.jar'; } return n; };
  async function modrinthVersion(s, pid, any) {
    const loaders = typeOf(s).loaders; let url = 'https://api.modrinth.com/v2/project/' + encodeURIComponent(pid) + '/version?loaders=' + encodeURIComponent(JSON.stringify(loaders)); if (!any) url += '&game_versions=' + encodeURIComponent(JSON.stringify([s.version]));
    const vs = await json(url); const list = Array.isArray(vs) ? vs : []; return list.find(v => v.version_type === 'release') || list[0] || null;
  }
  async function installModrinth(s, pid, o, seen, out) {
    if (seen.has(pid)) return; seen.add(pid); const ver = await modrinthVersion(s, pid, o.any);
    if (!ver) { const e = new Error('No version for ' + typeOf(s).name + ' ' + s.version + '. Try the other site, or pick a different Minecraft version for the server.'); e.noVersion = true; throw e; }
    const f = (ver.files || []).find(x => x.primary) || (ver.files || [])[0]; if (!f || !/\.jar$/i.test(f.filename || '')) throw new Error('That project has no .jar file to install.');
    fs.mkdirSync(pdir(s), { recursive: true }); const meta = readMeta(s), old = Object.keys(meta).find(k => meta[k].pid === pid);
    if (old) { if (fs.existsSync(path.join(pdir(s), old)) || fs.existsSync(path.join(pdir(s), old + '.disabled'))) { if (rt(s.id).proc) throw new Error('It is already installed. Stop the server to update it.'); } }
    let title = ''; try { const p = await json('https://api.modrinth.com/v2/project/' + encodeURIComponent(pid), { ttl: 300000 }); title = p.title; var icon = p.icon_url || '', slugv = p.slug; } catch {}
    const name = old ? old : uniqueName(pdir(s), safeFile(f.filename)), dest = path.join(pdir(s), name + (old && fs.existsSync(path.join(pdir(s), old + '.disabled')) ? '.disabled' : ''));
    await download(f.url, dest, { algo: f.hashes && f.hashes.sha512 ? 'sha512' : '', sum: f.hashes && f.hashes.sha512, progress: (g, t) => progress(s.id, 'plugin', t ? Math.round(g / t * 100) : 0, 'Downloading ' + (title || name) + '\u2026') });
    if (old && old !== f.filename) { /* keep the existing file name so the server's own config for it stays put */ }
    delete meta._p; meta[name] = { src: 'modrinth', pid, title: title || name.replace(/\.jar$/i, ''), version: ver.version_number || '', vid: ver.id, icon: icon || '', url: slugv ? 'https://modrinth.com/project/' + slugv : '' }; writeMeta(s, meta); out.push((title || name) + ' ' + (ver.version_number || ''));
    for (const d of (ver.dependencies || []).filter(x => x.dependency_type === 'required')) {
      let dp = d.project_id; if (!dp && d.version_id) { try { dp = (await json('https://api.modrinth.com/v2/version/' + encodeURIComponent(d.version_id))).project_id; } catch {} } if (!dp || seen.has(dp)) continue;
      if (Object.values(readMeta(s)).some(m => m.pid === dp)) continue; try { await installModrinth(s, dp, { any: o.any }, seen, out); } catch (e) { out.push('(a required add-on, ' + dp + ', could not be installed: ' + String(e.message).slice(0, 80) + ')'); }
    }
  }
  async function installSpigot(s, rid, out) {
    if (!typeOf(s).spiget) throw new Error('SpigotMC plugins only work on Paper and Purpur servers.'); const r = await json('https://api.spiget.org/v2/resources/' + encodeURIComponent(rid)); if (r.premium) throw new Error('That is a paid plugin. Buy it on SpigotMC and drop the .jar in the plugins folder.');
    if (r.external || (r.file && r.file.type && r.file.type !== '.jar')) throw new Error('The author hosts this one on their own site, so SKBox cannot fetch it. Open its page and download it there.');
    fs.mkdirSync(pdir(s), { recursive: true }); const meta = readMeta(s), old = Object.keys(meta).find(k => meta[k].src === 'spigot' && meta[k].pid === String(rid)); if (old && rt(s.id).proc) throw new Error('It is already installed. Stop the server to update it.');
    const name = old || uniqueName(pdir(s), safeFile(String(r.name || 'plugin').replace(/\s+/g, '')) + '.jar'), dest = path.join(pdir(s), name);
    await download('https://api.spiget.org/v2/resources/' + encodeURIComponent(rid) + '/download', dest, { progress: (g, t) => progress(s.id, 'plugin', t ? Math.round(g / t * 100) : 0, 'Downloading ' + r.name + '\u2026') });
    const fd = fs.openSync(dest, 'r'), b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    if (!(b[0] === 0x50 && b[1] === 0x4b)) { try { fs.unlinkSync(dest); } catch {} throw new Error('SpigotMC would not let SKBox download that one. Open its page and download it by hand.'); }
    meta[name] = { src: 'spigot', pid: String(rid), title: r.name, version: '', icon: r.icon && r.icon.url ? 'https://www.spigotmc.org/' + r.icon.url : '', url: 'https://www.spigotmc.org/resources/' + rid + '/' }; writeMeta(s, meta); out.push(r.name);
  }
  async function installPlugin(a) {
    a = a || {}; const s = find(a.id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; const out = [];
    try { if (a.source === 'spigot') await installSpigot(s, String(a.pid), out); else await installModrinth(s, String(a.pid), { any: !!a.any }, new Set(), out); }
    catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 220), noVersion: !!(e && e.noVersion) }; }
    progress(s.id, 'plugin', 100, 'Done'); return { ok: true, installed: out, restart: rt(s.id).state === 'running' };
  }
  async function installPack(a) {
    const s = find(a && a.id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; const pack = (PACKS[typeOf(s).dir === 'mods' ? 'mods' : 'plugins'] || []).find(p => p.id === a.pack); if (!pack) return { ok: false, error: 'Unknown pack.' };
    const out = [], fails = []; const seen = new Set();
    for (const sl of pack.slugs) { try { await installModrinth(s, sl, {}, seen, out); } catch (e) { fails.push(sl + ': ' + String(e.message).slice(0, 80)); } }
    return { ok: out.length > 0, installed: out, failed: fails, error: out.length ? '' : (fails[0] || 'Nothing installed.'), restart: rt(s.id).state === 'running' };
  }
  function removePlugin(id, file) {
    const s = find(id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; if (rt(id).proc) return { ok: false, error: 'Stop the server first. Windows keeps the file locked while it runs.' };
    const base = path.basename(String(file || '')).replace(/\.disabled$/i, ''); [base, base + '.disabled'].forEach(n => { try { fs.unlinkSync(path.join(pdir(s), n)); } catch {} }); const m = readMeta(s); delete m[base]; writeMeta(s, m); return { ok: true };
  }
  function togglePlugin(id, file) {
    const s = find(id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; if (rt(id).proc) return { ok: false, error: 'Stop the server first.' }; const f = path.basename(String(file || '')), p = path.join(pdir(s), f);
    if (!fs.existsSync(p)) return { ok: false, error: 'That file is gone.' }; const to = /\.disabled$/i.test(f) ? p.replace(/\.disabled$/i, '') : p + '.disabled'; fs.renameSync(p, to); return { ok: true, enabled: !/\.disabled$/i.test(to) };
  }
  async function checkUpdates(id) {
    const s = find(id), bad = needPlugins(s); if (bad) return { ok: false, error: bad }; const meta = readMeta(s), out = [];
    for (const k of Object.keys(meta)) { const m = meta[k]; if (m.src !== 'modrinth' || !m.pid) continue; try { const v = await modrinthVersion(s, m.pid, false); if (v && m.vid && v.id !== m.vid) out.push({ file: k, title: m.title, pid: m.pid, from: m.version, to: v.version_number }); } catch {} }
    return { ok: true, list: out };
  }
  async function updateAll(id) { const c = await checkUpdates(id); if (!c.ok) return c; if (rt(id).proc && c.list.length) return { ok: false, error: 'Stop the server first so the files can be replaced.' }; const done = [], failed = []; for (const u of c.list) { const r = await installPlugin({ id, source: 'modrinth', pid: u.pid }); (r.ok ? done : failed).push(u.title); } return { ok: true, updated: done, failed }; }

  // ---------- misc ----------
  async function netInfo(a) {
    const s = find(a && a.id); const ips = lanIps(); const out = { ok: true, ips, port: s ? s.port : 25565 };
    if (a && a.publicIp) { try { const d = await json('https://api.ipify.org?format=json'); out.publicIp = d && d.ip; } catch { out.publicIpError = 'Could not look up the public address.'; } }
    return out;
  }
  function open(a) { const s = find(a && a.id); if (!s) return { ok: false, error: 'That server is gone.' }; const sub = { folder: '', plugins: typeOf(s).dir || '', logs: 'logs', backups: null }[a.what || 'folder']; const p = sub === null ? bdir(s.id) : path.join(dirOf(s), sub); try { fs.mkdirSync(p, { recursive: true }); } catch {} if (ctx.openPath) ctx.openPath(p); return { ok: true, path: p }; }

  async function run(name, a) {
    if (typeof name !== 'string' || !name.startsWith('sks')) return null; a = a || {};
    try {
      switch (name) {
        case 'sksList': return list();
        case 'sksTypes': return { ok: true, types: Object.keys(TYPES).map(k => ({ id: k, name: TYPES[k].name, blurb: TYPES[k].blurb, plugins: !!TYPES[k].dir })) };
        case 'sksVersions': { const v = await versions(String(a.type || 'paper')); return { ok: true, versions: v }; }
        case 'sksCreate': return await createServer(a);
        case 'sksStart': return await start(String(a.id || a));
        case 'sksStop': return await stop(String(a.id || a), !!a.force);
        case 'sksRestart': { const id = String(a.id || a); await stop(id); return await start(id); }
        case 'sksCmd': return await command(String(a.id || ''), a.text);
        case 'sksLog': return logOf(String(a.id || a));
        case 'sksProps': return getProps(String(a.id || a));
        case 'sksPropsSet': return putProps(String(a.id || ''), a.props);
        case 'sksSet': return setServer(String(a.id || ''), a);
        case 'sksDelete': return await deleteServer(String(a.id || a));
        case 'sksUpdateSoftware': return await updateSoftware(String(a.id || ''), a.version);
        case 'sksBackup': return await backup(String(a.id || a));
        case 'sksBackups': return listBackups(String(a.id || a));
        case 'sksRestore': return await restore(String(a.id || ''), a.file);
        case 'sksBackupDelete': return deleteBackup(String(a.id || ''), a.file);
        case 'sksPlugins': return installed(String(a.id || a));
        case 'sksPluginSearch': return await searchPlugins(a);
        case 'sksPluginFeatured': return await featured(String(a.id || a));
        case 'sksPluginInstall': return await installPlugin(a);
        case 'sksPluginPack': return await installPack(a);
        case 'sksPluginRemove': return removePlugin(String(a.id || ''), a.file);
        case 'sksPluginToggle': return togglePlugin(String(a.id || ''), a.file);
        case 'sksPluginUpdates': return await checkUpdates(String(a.id || a));
        case 'sksPluginUpdateAll': return await updateAll(String(a.id || a));
        case 'sksNet': return await netInfo(a);
        case 'sksOpen': return open(a);
        case 'sksJava': { const m = javaFor(String(a.version || '1.21')); const j = await findJava(m); return { ok: true, need: m, have: !!j, own: !!(j && j.own) }; }
        case 'sksDuplicate': return await duplicate(String(a.id || a));
        case 'sksCopy': if (ctx.copy) ctx.copy(String(a.text || '').slice(0, 300)); return { ok: true };
        case 'sksPortFree': return { ok: true, free: await portFree(+a.port || 0) };
      }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
    return null;
  }
  return { run, anyRunning, stopAll, autoStart, _: { start, stop, createServer, installPlugin, installPack, searchPlugins, featured, versions, resolveJar, list, find, rt, backup, listBackups, restore, getProps, putProps, checkUpdates, updateAll, installed, removePlugin, togglePlugin, updateSoftware, command, logOf, findJava, netInfo } };
}
module.exports = { create, TYPES, javaFor, parseJavaMajor, parseProps, setProps, cmpVer, propsToObj, PROP_DEFAULTS, FEATURED, PACKS };
