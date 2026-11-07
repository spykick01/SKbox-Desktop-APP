// SKServers screens: your Minecraft servers, creating one, running it, plugins and mods, settings, backups.
(function () {
  'use strict';
  const K = window.K, { sk, S, el, esc, nav, toast, hints, focus, ensureFocus, openLayer, closeLayer, confirm, menu, osk } = K, U = K.ui, row = U.row, toggle = U.toggle, cyc = U.cyc;
  const X = (n, a) => sk.extras.do(n, a), say = r => toast((r && r.error) || 'That did not work');
  const live = {};
  const STATE = { stopped: ['Stopped', 'off'], starting: ['Starting\u2026', 'warn'], running: ['Running', 'on'], stopping: ['Stopping\u2026', 'warn'], installing: ['Working\u2026', 'warn'], crashed: ['Crashed', 'bad'] };
  const gb = mb => (Math.round(mb / 102.4) / 10) + ' GB';
  const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0);
  const fmtUp = t => { if (!t) return ''; const m = Math.floor((Date.now() - t) / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  const stOf = s => STATE[s.state] || STATE.stopped;
  K.sksOnState = null; K.sksOnLog = null; K.sksOnProg = null; K.playitOnState = null; K.playit = null; K.sksHist = K.sksHist || [];
  sk.on('playit:state', p => { K.playit = p; if (K.playitOnState) K.playitOnState(p); });
  const hideOn = () => S.settings.hideAddresses !== false, DOTS = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
  // hides IP addresses and tunnel addresses in text (used for the console while "Hide addresses" is on)
  const maskText = t => String(t).replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?\b/g, '\u2022\u2022\u2022.\u2022\u2022\u2022.\u2022\u2022\u2022.\u2022\u2022\u2022').replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:playit\.gg|joinmc\.link|ply\.gg)(?::\d{2,5})?\b/gi, '\u2022\u2022\u2022\u2022\u2022\u2022.playit.gg');
  K.sksMask = maskText;
  sk.on('sks:state', s => { if (!s || !s.id) return; if (s.removed) delete live[s.id]; else live[s.id] = s; if (K.sksOnState) K.sksOnState(s); });
  sk.on('sks:log', m => { if (K.sksOnLog) K.sksOnLog(m); });
  sk.on('sks:progress', m => { if (K.sksOnProg) K.sksOnProg(m); });

  // A box with a title, a line of text and a bar. Returns { set(text, pct), close() }.
  function progressLayer(title) {
    const L = el('div', 'layer'), b = el('div', 'box', '<h3>' + esc(title) + '</h3><p class="ptext">Starting\u2026</p><div class="pbar"><i style="width:0%"></i></div>'); L.appendChild(b); openLayer(L, () => {});
    const set = (t, p) => { if (!L.isConnected) return; if (t) b.querySelector('.ptext').textContent = t; if (p != null) b.querySelector('.pbar i').style.width = Math.max(2, Math.min(100, p)) + '%'; };
    return { set, close: () => { if (L.isConnected) closeLayer(L); } };
  }
  const withProgress = async (title, id, fn) => { const pl = progressLayer(title); K.sksOnProg = m => { if (!m || (id && m.id !== id)) return; pl.set(m.text, m.pct); }; try { return await fn(pl); } finally { K.sksOnProg = null; pl.close(); } };
  const card = s => { const st = stOf(s); return '<div class="sdot s-' + st[1] + '"></div><b>' + esc(s.name) + '</b><small>' + esc(s.typeName + ' ' + s.version + ' \u00B7 ' + gb(s.ram)) + '</small><em>' + st[0] + (s.state === 'running' ? ' \u00B7 ' + s.players.length + ' online' : '') + '</em>'; };

  // ---------- list ----------
  K.screens.servers = async function (root) {
    hints([['A', 'Open'], ['Y', 'Quick actions'], ['B', 'Back']]); S.backFn = () => K.go('library');
    root.innerHTML = '<div class="page"><h1>SKServers</h1><div class="sub">Make and run Minecraft servers on this PC, with a plugin and mod store. Pick Paper for plugins, Fabric for mods.</div><div class="sgrid"></div></div>';
    const grid = root.querySelector('.sgrid'); let first = null;
    const draw = (list, ips, totalMB) => {
      if (!grid.isConnected) return; const keep = K.current() && K.current().dataset.sid; grid.innerHTML = ''; let focusEl = null;
      list.forEach(s => { const c = nav(el('button', 'scard', card(s))); c.dataset.sid = s.id; c.onclick = () => K.go('server', { id: s.id });
        c._onopts = () => { const run = ['starting', 'running'].includes(s.state), id = s.id; menu(s.name, [{ label: run ? 'Stop' : 'Start', fn: async () => { const r = await X(run ? 'sksStop' : 'sksStart', { id }); if (r && r.ok === false) say(r); } }, ...(s.state === 'running' ? [{ label: 'Open the console', fn: () => K.go('server', { id, cat: 'console' }) }] : []), { label: 'Back up the world', fn: async () => { if (run) return toast('Stop the server first'); toast('Backing up\u2026'); const r = await X('sksBackup', { id }); toast(r.ok ? 'Backup saved' : (r.error || 'That did not work')); } }, { label: 'Open its folder', fn: () => X('sksOpen', { id, what: 'folder' }) }, { label: 'Back', fn: () => {} }]); }; grid.appendChild(c); if (s.id === keep) focusEl = c; });
      const n = nav(el('button', 'scard new', '<b>+</b><small>New server</small>')); n.onclick = () => createFlow(totalMB || 8192); grid.appendChild(n);
      if (!list.length) root.querySelector('.sub').textContent = 'No servers yet. Press New server: pick the software and version, accept the Minecraft EULA, and SKBox downloads everything, even Java if you do not have it.';
      if (!first) { first = focusEl || (list[0] ? grid.firstChild : n); ensureFocus(root, first); } else if (focusEl) focus(focusEl);
    };
    let last = { list: [], totalMB: 8192 };
    const load = async () => { const r = await X('sksList'); if (!r || !r.ok) return; r.list.forEach(s => { live[s.id] = s; }); last = r; draw(r.list, r.ips, r.totalMB); };
    K.sksOnState = () => { if (grid.isConnected) { draw(Object.values(live), null, last.totalMB); } }; await load();
  };

  // ---------- create ----------
  async function createFlow(totalMB) {
    const types = [['paper', 'Paper'], ['fabric', 'Fabric'], ['purpur', 'Purpur'], ['vanilla', 'Vanilla']], blurbs = { paper: 'Fast and plugin-ready. The best choice for most servers.', fabric: 'Light and fast, for mods instead of plugins.', purpur: 'Paper with extra gameplay options.', vanilla: 'The plain Mojang server. No plugins or mods.' };
    const rams = [1, 2, 3, 4, 6, 8, 12, 16].filter(g => g * 1024 <= totalMB * 0.75), ramDef = rams.includes(4) && totalMB >= 15000 ? 4 : (rams.includes(2) ? 2 : rams[0] || 1);
    const f = { name: 'My Server', type: 'paper', version: '', ram: ramDef, port: 25565, gamemode: 'survival', difficulty: 'easy', eula: false }; let vers = [], loading = true;
    const L = el('div', 'layer'), b = el('div', 'box wide', '<h3>New server</h3>'), body = el('div'); b.appendChild(body); L.appendChild(b);
    const loadVers = async () => { loading = true; f.version = ''; draw(); const r = await X('sksVersions', { type: f.type }); loading = false; vers = (r && r.versions) || []; f.version = vers[0] || ''; if (!r || !r.ok) toast((r && r.error) || 'Could not load versions. Check your internet.'); draw(); };
    function draw() {
      if (!L.isConnected) return; const keep = K.current() && K.current().dataset.k; body.innerHTML = '';
      const add = (k, e) => { e.dataset.k = k; body.appendChild(e); return e; };
      add('name', row('Name', 'What you call it here', esc(f.name), () => osk({ title: 'Server name', value: f.name, submitLabel: 'Done', onDone: v => { f.name = (v || '').trim().slice(0, 40) || f.name; draw(); } })));
      add('type', cyc('Software', blurbs[f.type], types, () => f.type, v => { f.type = v; loadVers(); }));
      add('ver', row('Minecraft version', loading ? 'Loading\u2026' : (vers.length ? 'Newest is ' + vers[0] : 'Could not load the list'), esc(f.version || '\u2014'), () => { if (!vers.length) return; menu('Minecraft version', vers.slice(0, 40).map((v, i) => ({ label: v + (i === 0 ? ' (newest)' : ''), fn: () => { f.version = v; draw(); } }))); }));
      add('ram', cyc('Memory', 'About 1 GB per 5 players. This PC has ' + gb(totalMB) + '.', rams.map(g => [g, g + ' GB']), () => f.ram, v => { f.ram = v; }));
      add('port', row('Port', 'Players join on this. Change it if you run more than one server.', esc(f.port), () => osk({ title: 'Port (1024 to 65535)', value: String(f.port), submitLabel: 'Done', onDone: v => { const n = parseInt(v, 10); if (n >= 1024 && n <= 65535) f.port = n; else toast('Use a number from 1024 to 65535'); draw(); } })));
      add('gm', cyc('Game mode', '', [['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure']], () => f.gamemode, v => { f.gamemode = v; }));
      add('df', cyc('Difficulty', '', [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], () => f.difficulty, v => { f.difficulty = v; }));
      add('eula', toggle('I accept the Minecraft EULA', 'Required by Mojang to run a server: aka.ms/MinecraftEULA', f.eula, v => { f.eula = v; }));
      const br = el('div', 'btnrow'), go = nav(el('button', 'btn p', 'Create server')), cancel = nav(el('button', 'btn', 'Cancel')); go.dataset.k = 'go'; cancel.dataset.k = 'cancel';
      cancel.onclick = () => closeLayer(L);
      go.onclick = async () => {
        if (!f.eula) return toast('Accept the Minecraft EULA first'); if (!f.version) return toast('Pick a Minecraft version');
        const r = await withProgress('Creating ' + f.name, null, () => X('sksCreate', { name: f.name, type: f.type, version: f.version, ram: f.ram * 1024, port: f.port, gamemode: f.gamemode, difficulty: f.difficulty, eula: true }));
        if (!r || !r.ok) { say(r); return; } closeLayer(L); toast(r.warn || (f.name + ' is ready. Press Start.')); K.go('server', { id: r.id });
      };
      br.append(go, cancel); body.appendChild(br); const k = body.querySelector('[data-k="' + keep + '"]'); ensureFocus(L, k || body.querySelector('[data-k="name"]'));
    }
    openLayer(L, () => closeLayer(L)); draw(); loadVers();
  }

  // ---------- one server ----------
  K.screens.server = async function (root, d) {
    const id = d.id; let s = live[id]; if (!s) { const r = await X('sksList'); (r.list || []).forEach(x => { live[x.id] = x; }); s = live[id]; } if (!s) return K.go('servers');
    hints([['A', 'Select'], ['B', 'Back']]); S.backFn = () => K.go('servers');
    root.innerHTML = '<div class="page"><h1></h1></div>'; const page = root.querySelector('.page'), h1 = page.querySelector('h1');
    const split = el('div', 'split'), menuE = el('div', 'menu'), pane = el('div', 'pane'); split.append(menuE, pane); page.appendChild(split);
    const head = () => { s = live[id] || s; const st = stOf(s); h1.innerHTML = esc(s.name) + ' <span class="schip s-' + st[1] + '">' + st[0] + (s.state === 'running' ? ' \u00B7 ' + s.players.length + ' online' : '') + '</span>'; }; head();
    const cats = [['overview', '\u23FB', 'Overview'], ['console', '\u2328', 'Console'], ['plugins', '\u{1F9E9}', s.canPlugins ? (s.pluginDir === 'mods' ? 'Mods' : 'Plugins') : 'Plugins'], ['rules', '\u2699', 'Game settings'], ['backups', '\u{1F4BE}', 'Backups'], ['options', '\u{1F6E0}', 'Server options']];
    let sel = d.cat || 'overview', refs = {}; const items = {}; let firstEl = null;
    const busyNow = () => ['starting', 'running', 'stopping', 'installing'].includes((live[id] || s).state);
    cats.forEach(([cid, ic, name]) => { const m = nav(el('button', 'mi', '<span>' + ic + '</span>' + name)); items[cid] = m; if (cid === sel) { m.classList.add('sel'); firstEl = m; }
      m._onfocus = () => { if (sel !== cid || !pane.firstChild) { sel = cid; Object.values(items).forEach(x => x.classList.remove('sel')); m.classList.add('sel'); panel(cid); } }; m.onclick = () => { const f = pane.querySelector('[data-nav]'); if (f) focus(f); }; menuE.appendChild(m); });
    const bk = nav(el('button', 'mi', '<span>\u2190</span>All servers')); bk.onclick = () => K.go('servers'); menuE.appendChild(bk);

    K.sksOnState = m => { if (m.id !== id || !pane.isConnected) return; if (m.removed) return K.go('servers'); head(); if (refs.refresh) refs.refresh(); };
    K.sksOnLog = m => { if (m.id !== id || !refs.log || !refs.log.isConnected) return; addLog(m.lines); };
    const lineKind = l => /ERROR|Exception|FAILED|Can't keep up|WARN/.test(l) ? 'problems' : /joined the game|left the game|lost connection|logged in|<[^>]{1,32}>|\[Server\]|was slain|was shot|fell from|drowned|burned|died|\[SKServers\]|^>/.test(l) ? 'chat' : 'other';
    const lineShown = l => { const f = K.sksFilter || 'all'; return f === 'all' || (f === 'chat' && ['chat', 'problems'].includes(lineKind(l))) || (f === 'problems' && lineKind(l) === 'problems'); };
    const paintLine = l => { const d2 = el('div', /ERROR|Exception|FAILED/.test(l) ? 'le' : /WARN/.test(l) ? 'lw' : l.startsWith('>') ? 'lc' : ''); d2.textContent = hideOn() ? maskText(l) : l; return d2; };
    const addLog = lines => { const lg = refs.log; refs.raw = (refs.raw || []).concat(lines).slice(-600); const stick = lg.scrollTop + lg.clientHeight >= lg.scrollHeight - 30; lines.forEach(l => { if (lineShown(l)) lg.appendChild(paintLine(l)); }); while (lg.childElementCount > 500) lg.firstChild.remove(); if (stick) lg.scrollTop = lg.scrollHeight; };
    const repaintLog = () => { const lg = refs.log; if (!lg) return; lg.innerHTML = ''; (refs.raw || []).filter(lineShown).forEach(l => lg.appendChild(paintLine(l))); if (!lg.childElementCount) lg.appendChild(el('div', 'lc', 'Nothing to show with this filter.')); lg.scrollTop = lg.scrollHeight; };
    const start = async () => { const r = await X('sksStart', { id }); if (!r || !r.ok) say(r); }, stop = async () => { await X('sksStop', { id }); };

    function panel(cid) {
      refs = {}; K.sksOnProg = null; pane.innerHTML = ''; const h = t => pane.appendChild(el('h2', '', t)), sub = t => pane.appendChild(el('div', 'sub', t)), add = e => { pane.appendChild(e); return e; };
      if (cid === 'overview') {
        h('Overview'); const err = add(el('div', 'salert')), info = add(el('div', 'sub')), br = add(el('div', 'btnrow')), main = nav(el('button', 'btn p', 'Start')), again = nav(el('button', 'btn', 'Restart'));
        main.onclick = () => { const st = (live[id] || s).state; if (st === 'stopped' || st === 'crashed') start(); else if (st === 'running' || st === 'starting') stop(); }; again.onclick = async () => { toast('Restarting\u2026'); const r = await X('sksRestart', { id }); if (r && !r.ok) say(r); }; br.append(main, again);
        const players = add(el('div', 'sub')); const addr = add(el('div')), net = add(el('div'));
        refs.refresh = () => { const c = live[id] || s, st = stOf(c); err.textContent = c.error || ''; err.style.display = c.error ? '' : 'none'; main.textContent = c.state === 'running' || c.state === 'starting' ? 'Stop server' : (c.state === 'stopping' || c.state === 'installing' ? st[0] : 'Start server'); main.disabled = ['stopping', 'installing'].includes(c.state); again.style.display = c.state === 'running' ? '' : 'none';
          info.textContent = c.typeName + ' ' + c.version + ' \u00B7 ' + gb(c.ram) + ' \u00B7 port ' + c.port + (c.state === 'running' ? ' \u00B7 up ' + fmtUp(c.startedAt) : ''); players.textContent = c.state === 'running' ? (c.players.length ? 'Online now: ' + c.players.join(', ') : 'Nobody online yet.') : ''; };
        refs.refresh();
        const playitBox = addr.parentNode.insertBefore(el('div'), addr); let reveal = false; const shown = t => (hideOn() && !reveal) ? DOTS : t;
        const copyAddr = (text, what) => { X('sksCopy', { text }); toast(hideOn() && !reveal ? 'Copied the ' + what : 'Copied ' + text); };
        const drawPlayit = () => {
          if (!playitBox.isConnected) return; const ps = K.playit, sv = live[id] || s; playitBox.innerHTML = ''; const R = (t, sb, right, fn) => playitBox.appendChild(row(t, sb, right, fn));
          if (!ps) { R('Play from anywhere (playit.gg)', 'Checking\u2026', '', null); return; }
          if (!ps.supported) { R('Play from anywhere (playit.gg)', 'Works on Windows.', '', null); return; }
          const enable = async () => { toast('Setting up playit.gg\u2026'); const r = await X('playitEnable', { id }); K.playit = r; if (r.needsClaim) claimLayer(); else if (r.ok === false) toast(r.error); drawPlayit(); };
          if (!sv.playit) { R('Let friends join from anywhere', 'No router setup. Uses playit.gg and a free account. Friends get one address to paste into Minecraft.', 'Turn on', enable); return; }
          const t = (ps.tunnels || {})[id] || {};
          if (!ps.claimed) { if (ps.phase === 'claim') R('Waiting for you on playit.gg', 'Open the link on this PC or scan the code with your phone, then approve SKBox.', 'Open', () => claimLayer()); else R('Link SKBox to playit.gg', ps.error || 'A one-time step that takes about a minute.', 'Continue', enable); R('Turn off', 'Go back to local play only', '', async () => { K.playit = await X('playitDisable', { id }); drawPlayit(); }); return; }
          if (t.state === 'working') { R('Getting your address\u2026', 'This takes a few seconds.', '', null); return; }
          if (t.address) {
            R('Friends outside your home join with', 'Tap to copy, then Minecraft > Multiplayer > Add Server. No port forwarding.', esc(shown(t.address)), () => copyAddr(t.address, 'address'));
            const live2 = sv.state === 'running' ? (ps.agent === 'running' ? 'Connected' : ps.agent === 'error' ? 'Problem: ' + (ps.agentError || 'the tunnel program stopped') : 'Connecting\u2026') : 'The tunnel opens when the server starts.'; R('Tunnel', live2, '', null);
            if (t.error) R('Last check failed', t.error, 'Try again', async () => { K.playit = await X('playitRetry', { id }); drawPlayit(); });
          } else R('Could not get an address', t.error || ps.error || 'Something went wrong.', 'Try again', async () => { K.playit = await X('playitRetry', { id }); if (K.playit.needsClaim || K.playit.phase === 'claim') claimLayer(); drawPlayit(); });
          R('Turn off playit.gg for this server', 'Your address stays reserved on playit.gg if you turn it on again.', '', async () => { K.playit = await X('playitDisable', { id }); drawPlayit(); });
        };
        function claimLayer() {
          const L = el('div', 'layer'), b = el('div', 'box wide'), body = el('div'); b.appendChild(body); L.appendChild(b);
          const draw = () => { const ps = K.playit || {}; body.innerHTML = '<h3>Link SKBox to playit.gg</h3>'; if (ps.claimed) { closeLayer(L); toast('Linked. Getting your address\u2026'); return; }
            if (!ps.claimUrl) { body.appendChild(el('p', '', ps.error ? esc(ps.error) : 'Getting your link\u2026')); } else {
              body.appendChild(el('p', '', '1. Open the link below on this PC, or scan the code with your phone.<br>2. Sign in or make a free playit.gg account.<br>3. Press the button to approve SKBox. This page continues by itself.'));
              try { const q = qrcode(0, 'M'); q.addData(ps.claimUrl); q.make(); const im = el('div', 'qrbox'); im.innerHTML = '<img alt="QR code" src="' + q.createDataURL(5, 2) + '"><div class="sub">' + esc(ps.claimUrl) + '</div>'; body.appendChild(im); } catch (_) {} }
            const br = el('div', 'btnrow'); const mk = (t, fn, cls) => { const x = nav(el('button', 'btn' + (cls ? ' ' + cls : ''), t)); x.onclick = fn; br.appendChild(x); return x; };
            if (ps.claimUrl) { mk('Open playit.gg', () => X('playitOpenClaim'), 'p'); mk('Copy link', () => { X('sksCopy', { text: ps.claimUrl }); toast('Link copied'); }); }
            mk('Cancel', async () => { await X('playitCancelClaim'); closeLayer(L); K.playit = await X('playitStatus'); drawPlayit(); }); body.appendChild(br); ensureFocus(L, br.firstChild); };
          const prev = K.playitOnState; K.playitOnState = p => { if (prev) prev(p); if (L.isConnected) draw(); };
          openLayer(L, () => { closeLayer(L); }); draw();
        }
        K.playitOnState = p => { K.playit = p; drawPlayit(); }; X('playitStatus').then(p => { K.playit = p; drawPlayit(); });
        const addrHead = addr.appendChild(row('Addresses', hideOn() ? 'Hidden so nobody sees your IP on stream. Tap to show them for now.' : 'Shown. Turn on "Hide addresses" in Server options to hide them.', hideOn() ? 'Show' : '', () => { if (hideOn()) { reveal = !reveal; K.go('server', { id, cat: 'overview', reveal }); } }));
        if (d.reveal) { reveal = true; addrHead.querySelector('.r') && (addrHead.querySelector('.r').textContent = 'Hide'); }
        X('sksNet', { id }).then(n => { if (!addr.isConnected) return; (n.ips || []).forEach(ip => addr.appendChild(row('Friends on your Wi-Fi join with', 'Tap to copy. Minecraft > Multiplayer > Add Server', esc(shown(ip + ':' + n.port)), () => copyAddr(ip + ':' + n.port, 'address'))));
          addr.appendChild(row('On this PC, join with', 'Tap to copy', 'localhost' + (n.port === 25565 ? '' : ':' + n.port), () => { X('sksCopy', { text: 'localhost' + (n.port === 25565 ? '' : ':' + n.port) }); toast('Copied'); }));
          net.appendChild(row('Without playit.gg: your public address', 'Friends need port ' + n.port + ' (TCP) forwarded on your router. Press to look up and copy it.', '\u2192', async () => { const r = await X('sksNet', { id, publicIp: true }); if (r.publicIp) { X('sksCopy', { text: r.publicIp + ':' + r.port }); toast(hideOn() && !reveal ? 'Public address copied' : 'Public address copied: ' + r.publicIp + ':' + r.port); } else toast(r.publicIpError || 'Could not look it up'); }));
          net.appendChild(row('Windows firewall', 'The first start shows a Windows window asking about Java. Allow private networks.', '', null)); });
        add(el('div', '', '<div style="height:.8rem"></div>'));
        add(row('Update server software', 'Download the newest build for ' + s.version + ', or move to a newer Minecraft version. Make a backup first.', '\u2192', async () => {
          if (busyNow()) return toast('Stop the server first'); const r = await X('sksVersions', { type: s.type }); const vs = ((r && r.versions) || []).filter(v => { const a = v.split('.').map(Number), b2 = s.version.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b2[i] || 0)) return (a[i] || 0) > (b2[i] || 0); } return true; });
          menu('Update to', vs.slice(0, 30).map(v => ({ label: v === s.version ? v + ' (latest build)' : v, fn: () => confirm('Update to ' + v + '?', v === s.version ? 'Downloads the newest build of the same version.' : 'Newer Minecraft versions change the world. Make a backup first (Backups tab). Plugins may need updating too.', 'Update', async () => { const x = await withProgress('Updating', id, () => X('sksUpdateSoftware', { id, version: v })); if (!x || !x.ok) say(x); else { toast('Updated to ' + v); K.go('server', { id, cat: 'overview' }); } }) })).concat([{ label: 'Back', fn: () => {} }]));
        }));
        add(row('Open the server folder', 'Worlds, logs and settings files', '\u{1F4C2}', () => X('sksOpen', { id, what: 'folder' })));
        ensureFocus(pane);
      } else if (cid === 'console') {
        h('Console'); sub('What the server prints. Type a command (without the slash) or use Quick commands.'); const lg = add(el('div', 'slog')); refs.log = lg; X('sksLog', { id }).then(r => { if (lg.isConnected && r.ok) { lg.innerHTML = ''; refs.raw = []; addLog(r.lines.length ? r.lines : ['Nothing yet. Start the server.']); lg.scrollTop = lg.scrollHeight; } });
        const send = async t => { const r = await X('sksCmd', { id, text: t }); if (!r || !r.ok) say(r); else { K.sksHist = [t].concat(K.sksHist.filter(x => x !== t)).slice(0, 8); } };
        add(cyc('Show', 'Filter what the console shows', [['all', 'Everything'], ['chat', 'Players & chat'], ['problems', 'Problems only']], () => K.sksFilter || 'all', v => { K.sksFilter = v; repaintLog(); }));
        add(row('Type a command', 'For example: say hello, op Steve, whitelist add Alex', '\u2328', () => osk({ title: 'Console command', value: '', canSend: true, submitLabel: 'Send', onDone: (v, snd) => { if (v && v.trim()) send(v); } })));
        const ask = (title, cmd) => osk({ title, value: '', submitLabel: 'Send', onDone: v => { if (v && v.trim()) send(cmd + ' ' + v.trim()); } });
        add(row('Quick commands', 'Recent commands, save, op, whitelist, time, weather and more', '\u26A1', () => menu('Quick commands', K.sksHist.slice(0, 5).map(c => ({ label: '\u21BB ' + c.slice(0, 40), fn: () => send(c) })).concat([
          { label: 'Save the world', fn: () => send('save-all') }, { label: 'Say something to everyone\u2026', fn: () => ask('Message', 'say') }, { label: 'List players', fn: () => send('list') },
          { label: 'Make a player an operator\u2026', fn: () => ask('Player name', 'op') }, { label: 'Remove an operator\u2026', fn: () => ask('Player name', 'deop') }, { label: 'Add to the whitelist\u2026', fn: () => ask('Player name', 'whitelist add') },
          { label: 'Whitelist on', fn: () => send('whitelist on') }, { label: 'Whitelist off', fn: () => send('whitelist off') }, { label: 'Kick a player\u2026', fn: () => ask('Player name', 'kick') }, { label: 'Ban a player\u2026', fn: () => ask('Player name', 'ban') },
          { label: 'Time: day', fn: () => send('time set day') }, { label: 'Weather: clear', fn: () => send('weather clear') }, { label: 'Back', fn: () => {} }]))));
        add(row('Open the logs folder', 'Older logs and crash reports', '\u{1F4C2}', () => X('sksOpen', { id, what: 'logs' })));
        ensureFocus(pane);
      } else if (cid === 'plugins') {
        if (!s.canPlugins) { h('Plugins'); sub('Vanilla servers cannot use plugins or mods. Make a Paper server for plugins or a Fabric server for mods.'); return; }
        const mods = s.pluginDir === 'mods'; h(mods ? 'Mods' : 'Plugins'); sub(mods ? 'Mods come from Modrinth. Fabric API and other required add-ons are installed for you.' : 'Find plugins on Modrinth and SpigotMC. SKBox checks that they fit your Minecraft version, verifies the download and adds the add-ons they need.');
        add(row('Find ' + (mods ? 'mods' : 'plugins'), 'Search Modrinth' + (mods ? '' : ' and SpigotMC') + ', or browse the featured ones', '\u{1F50E}', () => K.go('plugins', { id })));
        const box = add(el('div')); const load = async () => { const r = await X('sksPlugins', { id }); if (!box.isConnected) return; box.innerHTML = ''; if (!r.ok) { box.appendChild(el('div', 'sub', r.error)); return; }
          box.appendChild(el('h3', '', 'Installed (' + r.list.length + ')'));
          if (!r.list.length) box.appendChild(el('div', 'sub', 'Nothing installed yet.'));
          r.list.forEach(p => box.appendChild(row((p.enabled ? '' : '\u23F8 ') + p.title, [p.version, fmtSize(p.size), p.src === 'modrinth' ? 'Modrinth' : p.src === 'spigot' ? 'SpigotMC' : 'added by hand', p.enabled ? '' : 'turned off'].filter(Boolean).join(' \u00B7 '), p.enabled ? 'On' : 'Off', () => menu(p.title, [
            { label: p.enabled ? 'Turn off' : 'Turn on', fn: async () => { const x = await X('sksPluginToggle', { id, file: p.file }); if (!x.ok) say(x); else load(); } },
            { label: 'Remove', fn: () => confirm('Remove ' + p.title + '?', 'Its settings folder stays, only the file is deleted.', 'Remove', async () => { const x = await X('sksPluginRemove', { id, file: p.file }); if (!x.ok) say(x); else load(); }, true) }].concat(p.url ? [{ label: 'Open its page', fn: () => X('storeOpen', { url: p.url }) }] : []).concat([{ label: 'Back', fn: () => {} }])))));
          if (r.list.length) { box.appendChild(row('Check for updates', 'Looks at Modrinth for newer versions of what you installed', '\u2192', async () => { toast('Checking\u2026'); const u = await X('sksPluginUpdates', { id }); if (!u.ok) return say(u); if (!u.list.length) return toast('Everything is up to date'); confirm(u.list.length + ' update' + (u.list.length === 1 ? '' : 's'), u.list.map(x => x.title + ' ' + x.from + ' \u2192 ' + x.to).join('\n'), 'Update all', async () => { const x = await withProgress('Updating', id, () => X('sksPluginUpdateAll', { id })); if (!x.ok) say(x); else { toast('Updated ' + x.updated.length + (x.failed.length ? ', ' + x.failed.length + ' failed' : '')); load(); } }); })); box.appendChild(row('Open the ' + (mods ? 'mods' : 'plugins') + ' folder', 'Drop your own .jar files in here', '\u{1F4C2}', () => X('sksOpen', { id, what: 'plugins' }))); }
          ensureFocus(pane, pane.querySelector('[data-nav]')); };
        ensureFocus(pane); load();
      } else if (cid === 'rules') {
        h('Game settings'); const can = () => { if (busyNow()) { toast('Stop the server first. It only reads these when it starts.'); return false; } return true; }; sub(busyNow() ? 'The server is running. Stop it to change these.' : 'Saved right away. They apply the next time the server starts.');
        const box = add(el('div')); X('sksProps', { id }).then(r => { if (!box.isConnected || !r.ok) return; const p = r.props; const sv = async (k, v) => { const x = await X('sksPropsSet', { id, props: { [k]: v } }); if (!x.ok) say(x); else p[k] = String(v); };
          const c = (title, subt, key, opts) => { const b2 = cyc(title, subt, opts, () => p[key], v => { if (can()) sv(key, v); }); return b2; };
          const t = (title, subt, key) => toggle(title, subt, p[key] === 'true', v => { if (can()) sv(key, String(v)); }); const num = (title, subt, key, vals) => c(title, subt, key, vals.map(v => [String(v), String(v)]));
          box.append(row('Message of the day', 'Shown under the server name in the list', esc(p.motd.slice(0, 22)), () => { if (can()) osk({ title: 'Message of the day', value: p.motd, submitLabel: 'Save', onDone: v => { sv('motd', v || ''); K.go('server', { id, cat: 'rules' }); } }); }),
            c('Game mode', 'For new players', 'gamemode', [['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure'], ['spectator', 'Spectator']]), c('Difficulty', '', 'difficulty', [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]),
            num('Max players', '', 'max-players', [2, 5, 10, 20, 30, 50, 100]), t('Players can fight each other (PvP)', '', 'pvp'), t('Whitelist', 'Only players you add can join (use Quick commands in the Console)', 'white-list'),
            toggle('Check accounts with Mojang (online mode)', 'Keep this on. Turning it off lets anyone join as anyone. Only needed for some tools.', p['online-mode'] === 'true', v => { if (!can()) return; if (v) sv('online-mode', 'true'); else confirm('Turn off online mode?', 'Anyone can join with any name, including as an operator. Only do this on a private network or behind a proxy.', 'Turn off', () => sv('online-mode', 'false')); }),
            num('View distance', 'Chunks players see. Lower is faster.', 'view-distance', [4, 6, 8, 10, 12, 16, 24, 32]), num('Simulation distance', 'Chunks that keep running. Lower is faster.', 'simulation-distance', [4, 6, 8, 10, 12]), num('Spawn protection', 'Radius only operators can build in', 'spawn-protection', [0, 4, 16, 32]),
            t('Allow flying (fly mods and plugins)', '', 'allow-flight'), t('Command blocks', '', 'enable-command-block'), t('Hardcore', 'One life. Only for new worlds.', 'hardcore'), t('Nether', '', 'allow-nether'), t('Monsters', '', 'spawn-monsters'), t('Animals', '', 'spawn-animals'),
            row('World seed', 'Only used when a new world is made. Delete the world folder to use a new seed.', esc(p['level-seed'] || 'random'), () => { if (can()) osk({ title: 'World seed', value: p['level-seed'], submitLabel: 'Save', onDone: v => { sv('level-seed', v || ''); K.go('server', { id, cat: 'rules' }); } }); }));
          ensureFocus(pane, pane.querySelector('[data-nav]')); });
      } else if (cid === 'backups') {
        h('Backups'); sub('A backup is a zip of the world (with the Nether and End). Stop the server first so the world is saved cleanly. SKBox keeps the newest five.'); const box = add(el('div'));
        const load = async () => { const r = await X('sksBackups', { id }); if (!box.isConnected) return; box.innerHTML = '';
          box.appendChild(row('Back up now', busyNow() ? 'Stop the server first' : 'Takes a few seconds', '\u{1F4BE}', async () => { if (busyNow()) return toast('Stop the server first'); toast('Backing up\u2026'); const x = await X('sksBackup', { id }); if (!x.ok) say(x); else { toast('Backup saved'); load(); } }));
          (r.list || []).forEach(b2 => box.appendChild(row(new Date(b2.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), fmtSize(b2.size), 'Options', () => menu('Backup', [
            { label: 'Restore this backup', fn: () => confirm('Restore this backup?', 'The current world is moved aside (not deleted) and this one takes its place.', 'Restore', async () => { const x = await X('sksRestore', { id, file: b2.file }); toast(x.ok ? 'Restored. Start the server.' : (x.error || 'That did not work')); }) },
            { label: 'Delete', fn: () => confirm('Delete this backup?', '', 'Delete', async () => { await X('sksBackupDelete', { id, file: b2.file }); load(); }, true) }, { label: 'Back', fn: () => {} }]))));
          box.appendChild(row('Open the backups folder', '', '\u{1F4C2}', () => X('sksOpen', { id, what: 'backups' }))); ensureFocus(pane, pane.querySelector('[data-nav]')); }; load();
      } else if (cid === 'options') {
        h('Server options'); const can = () => { if (busyNow()) { toast('Stop the server first'); return false; } return true; };
        add(row('Rename', 'Only changes the name in SKBox', esc(s.name), () => osk({ title: 'Server name', value: s.name, submitLabel: 'Save', onDone: async v => { if (v && v.trim()) { await X('sksSet', { id, name: v }); K.go('server', { id, cat: 'options' }); } } })));
        const rams = [1, 2, 3, 4, 6, 8, 12, 16]; add(cyc('Memory', 'More helps with many players or plugins. Needs a restart.', rams.map(g => [g * 1024, g + ' GB']).concat(rams.some(g => g * 1024 === s.ram) ? [] : [[s.ram, gb(s.ram)]]), () => s.ram, v => { if (can()) { s.ram = v; X('sksSet', { id, ram: v }); } }));
        add(toggle('Start with SKBox', 'Turns this server on when SKBox opens', !!s.autoStart, v => X('sksSet', { id, autoStart: v })));
        add(toggle('Restart if it crashes', 'Up to 3 times in 10 minutes', s.autoRestart !== false, v => X('sksSet', { id, autoRestart: v })));
        add(row('Extra Java options', s.jvm ? s.jvm : 'For experts. Leave empty if unsure.', '\u2192', () => { if (can()) osk({ title: 'Java options', value: s.jvm || '', submitLabel: 'Save', onDone: async v => { await X('sksSet', { id, jvm: v || '' }); K.go('server', { id, cat: 'options' }); } }); }));
        add(toggle('Back up when it stops', 'Saves a zip of the world every time the server stops', !!s.backupOnStop, v => X('sksSet', { id, backupOnStop: v })));
        add(toggle('Tell me when it is ready', 'A Windows notification when the server finishes starting', s.notifyReady !== false, v => X('sksSet', { id, notifyReady: v })));
        add(toggle('Tell me when someone joins', 'A Windows notification for each player who joins', !!s.notifyJoin, v => X('sksSet', { id, notifyJoin: v })));
        add(toggle('Hide addresses', 'Hide IP addresses and tunnel addresses on screen and in the console. Good for streaming.', hideOn(), v => { S.settings.hideAddresses = v; U.saveSettings(); }));
        add(row('Duplicate this server', 'Copies the world, plugins and settings to a new server on its own port', '\u29C9', async () => { if (busyNow()) return toast('Stop the server first'); toast('Copying\u2026'); const x = await X('sksDuplicate', { id }); if (!x.ok) say(x); else { toast('Copied as ' + x.server.name); K.go('server', { id: x.id, cat: 'overview' }); } }));
        add(row('Delete this server', 'Deletes the world and every file. Backups stay.', '\u{1F5D1}', () => { if (busyNow()) return toast('Stop the server first'); confirm('Delete ' + s.name + '?', 'This deletes the world, plugins and settings. Backups in the backups folder are kept.', 'Delete', async () => { const x = await X('sksDelete', { id }); if (!x.ok) say(x); else { toast('Deleted'); K.go('servers'); } }, true); }));
        ensureFocus(pane);
      }
    }
    if (!firstEl) firstEl = menuE.firstChild; firstEl.dataset.first = ''; panel(sel); ensureFocus(root, firstEl);
    X('sksList').then(r => { (r.list || []).forEach(x => { live[x.id] = x; }); head(); if (refs.refresh) refs.refresh(); });
  };

  // ---------- plugin and mod store ----------
  K.screens.plugins = async function (root, d) {
    const id = d.id, s = live[id]; if (!s) return K.go('servers'); const mods = s.pluginDir === 'mods';
    hints([['A', 'Open'], ['B', 'Back']]); S.backFn = () => K.go('server', { id, cat: 'plugins' });
    root.innerHTML = '<div class="page"><h1>' + (mods ? 'Find mods' : 'Find plugins') + ' <span class="schip s-off">' + esc(s.name + ' \u00B7 ' + s.typeName + ' ' + s.version) + '</span></h1></div>'; const page = root.querySelector('.page');
    let source = 'featured', q = '', sort = '', have = new Set(), offset = 0; const bar = el('div', 'btnrow'), box = el('div', 'plist'); page.append(bar, box);
    const srcs = [['featured', 'Featured'], ['modrinth', 'Modrinth']].concat(s.type === 'paper' || s.type === 'purpur' ? [['spigot', 'SpigotMC']] : []);
    const btn = (t, fn, cls) => { const b = nav(el('button', 'btn' + (cls ? ' ' + cls : ''), t)); b.onclick = fn; return b; };
    const drawBar = () => { bar.innerHTML = ''; srcs.forEach(([k, n]) => bar.appendChild(btn(n, () => { source = k; offset = 0; if (k === 'featured') q = ''; run(true); }, source === k ? 'p' : ''))); if (source !== 'featured') bar.append(btn(q ? 'Search: ' + q : 'Search\u2026', () => osk({ title: 'Search', value: q, submitLabel: 'Search', onDone: v => { q = (v || '').trim(); offset = 0; run(true); } })), btn(sort === 'downloads' ? 'Sort: most downloads' : 'Sort: best match', () => { sort = sort === 'downloads' ? 'relevance' : 'downloads'; offset = 0; run(true); })); };
    const label = h2 => (h2.src === 'spigot' ? 'SpigotMC' : 'Modrinth') + (h2.author ? ' \u00B7 by ' + h2.author : '');
    const hitRow = h2 => { const inst = have.has(h2.src + ':' + h2.pid), r = row(h2.title, (h2.desc || '').slice(0, 110), (inst ? '\u2713 ' : '') + '\u2B07 ' + fmtN(h2.downloads), () => detail(h2, inst)); r.classList.add('prow'); if (h2.icon) { const im = el('img', 'picon'); im.src = h2.icon; im.onerror = () => im.remove(); r.insertBefore(im, r.firstChild); } return r; };
    function detail(h2, inst) {
      const it = [{ label: inst ? 'Reinstall or update' : 'Install on ' + s.name, fn: () => install(h2, false) }]; if (h2.manual) it[0] = { label: 'Needs a manual download', fn: () => toast('The author hosts it elsewhere. Use Open its page.') };
      it.push({ label: 'Open its page', fn: () => X('storeOpen', { url: h2.url }) }, { label: 'Back', fn: () => {} }); menu(h2.title + '  (' + label(h2) + ')', it);
    }
    async function install(h2, any) {
      const r = await withProgress('Installing ' + h2.title, id, () => X('sksPluginInstall', { id, source: h2.src, pid: h2.pid, any }));
      if (r && r.ok) { have.add(h2.src + ':' + h2.pid); toast('Installed ' + r.installed.join(', ') + (r.restart ? '. Restart the server to load it.' : '')); run(false); }
      else if (r && r.noVersion && !any) confirm('Not made for ' + s.version, 'This ' + (mods ? 'mod' : 'plugin') + ' has no version for ' + s.typeName + ' ' + s.version + '. Install its newest version anyway? It may not work or may break the server.', 'Install anyway', () => install(h2, true), true);
      else say(r);
    }
    async function run(reset) {
      drawBar(); box.innerHTML = '<div class="sub">Loading\u2026</div>'; const inst = await X('sksPlugins', { id }); have = new Set(((inst && inst.list) || []).map(p => p.src + ':' + p.pid));
      let r; if (source === 'featured') r = await X('sksPluginFeatured', { id }); else r = await X('sksPluginSearch', { id, q, source, sort, offset });
      box.innerHTML = ''; if (!r || !r.ok) { box.innerHTML = '<div class="sub">' + esc((r && r.error) || 'Could not load.') + '</div>'; ensureFocus(root, bar.firstChild); return; }
      if (source === 'featured' && r.packs && r.packs.length) { box.appendChild(el('h3', '', 'Packs')); r.packs.forEach(p => box.appendChild(row(p.name, p.desc, 'Install all', () => confirm('Install ' + p.name + '?', p.desc, 'Install', async () => { const x = await withProgress('Installing ' + p.name, id, () => X('sksPluginPack', { id, pack: p.id })); if (!x || !x.ok) say(x); else { toast('Installed ' + x.installed.length + (x.failed && x.failed.length ? ', ' + x.failed.length + ' did not fit' : '') + (x.restart ? '. Restart the server.' : '')); run(false); } })))); box.appendChild(el('h3', '', 'Popular')); }
      if (!r.hits.length) box.appendChild(el('div', 'sub', source === 'featured' ? 'Nothing featured fits this version.' : 'Nothing found. Try other words' + (source === 'modrinth' && !mods ? ', or the SpigotMC button.' : '.')));
      r.hits.forEach(h2 => box.appendChild(hitRow(h2)));
      if (r.more) box.appendChild(row('Show more', '', '\u2192', () => { offset += 20; more(); })); ensureFocus(root, box.querySelector('[data-nav]') || bar.firstChild);
    }
    async function more() { const r = await X('sksPluginSearch', { id, q, source, sort, offset }); if (!r.ok) return say(r); const m = box.lastElementChild; if (m) m.remove(); r.hits.forEach(h2 => box.appendChild(hitRow(h2))); if (r.more) box.appendChild(row('Show more', '', '\u2192', () => { offset += 20; more(); })); }
    run(true);
  };
})();
