// UI modes: Cinema and Deck are full redesigns of Home and the screen chrome (Classic is the original). Also Spotlight search,
// Home widgets and the "Look & modes" and "Party" settings pages.
(function () {
  'use strict';
  const K = window.K, { sk, S, el, esc, nav, toast, hints, focus, ensureFocus, openLayer, closeLayer, confirm, menu, osk, fileUrl } = K, U = K.ui;
  const X = (n, a) => sk.extras.do(n, a);
  K.modes = {}; K.settingsPages = K.settingsPages || {};
  const MODES = [['classic', 'Classic', 'The original SKBox: one row of big tiles.'], ['deck', 'Deck', 'Handheld-style: a side rail, a big resume card, a tight grid and a status bar.']];
  const modeName = () => (MODES.some(m => m[0] === S.settings.uiMode) ? S.settings.uiMode : 'classic');   // anything else (older modes) counts as Classic
  const timers = fn => { K.modeTimers = K.modeTimers || []; K.modeTimers.push(fn); return fn; };
  const dests = [['home', '\u2302', 'Home'], ['library', '\u25A6', 'Library'], ['store', '\u{1F6D2}', 'Store'], ['servers', '\u{1F5A5}', 'Servers'], ['party', '\u{1F3A7}', 'Party'], ['search', '\u{1F50D}', 'Search'], ['settings', '\u2699', 'Settings']];
  const goDest = id => { if (id === 'party') openParty(); else if (id === 'search') K.spotlight.open(); else K.go(id); };

  // ---------- party in a window (used from Home) ----------
  function openParty() {
    const L = el('div', 'layer'), b = el('div', 'box wide'), pane = el('div', 'pane2'); b.appendChild(pane); L.appendChild(b);
    openLayer(L, () => { K.partyUI.detach(); closeLayer(L); }); K.partyUI.render(pane, { title: 'Party' });
    const bb = nav(el('button', 'btn', 'Close')); bb.onclick = () => { K.partyUI.detach(); closeLayer(L); }; b.appendChild(bb);
  }
  K.openParty = openParty;

  // ---------- widgets ----------
  const wd = { servers: [], today: 0 }; let widgetFns = [];
  const on = k => (S.settings.widgets || {})[k] !== false;
  const fmtMs = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); };
  async function pull() { try { const r = await X('sksList'); if (r && r.ok) wd.servers = r.list; } catch (_) {} try { const t = await X('today'); if (t) wd.today = t.ms || 0; } catch (_) {} widgetFns = widgetFns.filter(f => f.alive()); widgetFns.forEach(f => f.update()); }
  sk.on('sks:state', s => { if (!s || !s.id) return; if (s.removed) wd.servers = wd.servers.filter(x => x.id !== s.id); else { const i = wd.servers.findIndex(x => x.id === s.id); if (i >= 0) wd.servers[i] = s; else wd.servers.push(s); } widgetFns = widgetFns.filter(f => f.alive()); widgetFns.forEach(f => f.update()); });
  K.partyOnState = () => { widgetFns = widgetFns.filter(f => f.alive()); widgetFns.forEach(f => f.update()); };
  function widget(kind, cls) {
    const b = nav(el('button', cls || 'wdg')); const text = () => {
      if (kind === 'party') { const p = K.partyUI.state(); if (p.status === 'in') return ['\u{1F3A7}', (p.members.length + 1) + ' in party', p.me.muted ? 'muted' : p.code, true]; return ['\u{1F3A7}', 'Party', 'Not in one', false]; }
      if (kind === 'servers') { const run = wd.servers.filter(s => s.state === 'running'); const n = run.reduce((a, s) => a + s.players.length, 0); if (run.length) return ['\u{1F5A5}', run.length + ' server' + (run.length > 1 ? 's' : '') + ' on', n + ' online', true]; return ['\u{1F5A5}', 'Servers', wd.servers.length ? wd.servers.length + ' stopped' : 'None yet', false]; }
      return ['\u23F1', 'Today', wd.today ? fmtMs(wd.today) + ' played' : 'Nothing yet', false];
    };
    const update = () => { const [ic, a, c, hot] = text(); b.innerHTML = '<i>' + ic + '</i><span><b>' + esc(a) + '</b><small>' + esc(c) + '</small></span>'; b.classList.toggle('hot', hot); };
    b.onclick = () => { if (kind === 'party') openParty(); else if (kind === 'servers') K.go('servers'); else K.go('settings', { cat: 'stats' }); };
    update(); widgetFns.push({ update, alive: () => b.isConnected || !b._seen, mark: () => { b._seen = true; } }); setTimeout(() => { b._seen = true; }, 50); return b;
  }
  K.widgets = {
    list: () => ['party', 'servers', 'today'].filter(on).map(k => widget(k)),
    chips: () => { const out = []; const p = K.partyUI.state(); if (on('party') && p.status === 'in') out.push(widget('party', 'chip wchip')); if (on('servers') && wd.servers.some(s => s.state === 'running')) out.push(widget('servers', 'chip wchip')); return out; },
    pull
  };
  pull(); setInterval(pull, 20000);

  // ---------- Spotlight search ----------
  function commands() {
    const c = [], party = K.partyUI.state();
    c.push({ ic: '\u{1F3A7}', t: party.status === 'in' ? 'Open your party' : 'Start a party', s: 'Voice chat', k: 'party voice chat call talk friends', fn: openParty });
    if (party.status !== 'in') c.push({ ic: '\u{1F517}', t: 'Join a party with a code', s: 'Voice chat', k: 'party join code invite', fn: () => osk({ title: 'Party code or invite link', value: '', submitLabel: 'Join', onDone: async v => { if (!v) return; toast('Joining\u2026'); const r = await sk.party.cmd('join', { code: v, name: K.partyUI.myName() }); toast(r.ok ? 'Joined the party' : (r.error || 'Could not join')); } }) });
    else c.push({ ic: '\u{1F3A4}', t: party.me.muted ? 'Unmute your party microphone' : 'Mute your party microphone', s: 'Party', k: 'mute unmute mic microphone party', fn: () => sk.party.cmd('mute', { toggle: true }) });
    c.push({ ic: '\u{1F5A5}', t: 'Open SKServers', s: 'Minecraft servers', k: 'servers minecraft host plugins', fn: () => K.go('servers') }, { ic: '\u{1F6D2}', t: 'Open SKStore', s: 'Games and apps', k: 'store shop games apps steam epic free deals', fn: () => K.go('store') });
    wd.servers.forEach(s => c.push({ ic: s.state === 'running' ? '\u23F9' : '\u25B6', t: (s.state === 'running' ? 'Stop ' : 'Start ') + s.name, s: 'Server \u00B7 ' + s.typeName + ' ' + s.version, k: 'server minecraft ' + s.name, fn: async () => { const r = await X(s.state === 'running' ? 'sksStop' : 'sksStart', { id: s.id }); if (r && r.ok === false) toast(r.error); else toast(s.state === 'running' ? 'Stopping ' + s.name : 'Starting ' + s.name); } }));
    MODES.forEach(m => { if (m[0] !== modeName()) c.push({ ic: '\u{1F3A8}', t: 'Switch to ' + m[1] + ' mode', s: 'Look', k: 'mode theme look ui design layout ' + m[1], fn: () => setMode(m[0]) }); });
    { const games = U.allApps().filter(a => !a.kind && !(S.settings.hiddenApps || []).includes(a.id)); if (games.length > 1) c.push({ ic: '\u{1F3B2}', t: 'Surprise me: launch a random game', s: games.length + ' games to pick from', k: 'random surprise pick game lucky roulette', fn: () => { const g = games[Math.floor(Math.random() * games.length)]; toast('Launching ' + g.name); U.openApp(g); } }); }
    if (S.game) c.push({ ic: '\u2716', t: 'Close ' + S.game.name, s: 'Running game', k: 'close quit exit game', fn: () => U.closeRunning() });
    (U.CATS || []).forEach(([id, ic, name]) => c.push({ ic, t: 'Settings: ' + name, s: 'Settings', k: 'settings options ' + name, fn: () => K.go('settings', { cat: id }) }));
    return c;
  }
  function score(q, hay) { const h = hay.toLowerCase(); let sc = 0; for (const w of q) { const i = h.indexOf(w); if (i < 0) return 0; sc += i === 0 ? 4 : (h[i - 1] === ' ' ? 3 : 1); } return sc; }
  function search(q) {
    const ws = q.toLowerCase().split(/\s+/).filter(Boolean), st = S.stats || {};
    const apps = U.allApps().filter(a => !(S.settings.hiddenApps || []).includes(a.id)).map(a => ({ ic: null, a, t: a.name, s: U.isRunning(a) ? 'Running \u00B7 press to resume' : (a.tag || U.playInfo(a) || 'App'), k: a.name + ' ' + (a.tag || ''), last: (st[a.id] || {}).last || 0, fn: () => U.openApp(a) }));
    if (!ws.length) return apps.sort((x, y) => y.last - x.last).slice(0, 5).concat(commands().slice(0, 5));
    return apps.concat(commands()).map(r => ({ r, sc: score(ws, r.t + ' ' + (r.k || '')) * (r.a ? 1.4 : 1) })).filter(x => x.sc > 0).sort((x, y) => y.sc - x.sc || x.r.t.localeCompare(y.r.t)).slice(0, 8).map(x => x.r);
  }
  K.spotlight = { search, open() {
    if (document.querySelector('.spot')) return; let q = '';
    const L = el('div', 'layer'), b = el('div', 'box wide spot'), body = el('div'); b.appendChild(body); L.appendChild(b);
    const run = r => { cleanup(); closeLayer(L); setTimeout(r.fn, 60); };
    const cleanup = () => document.removeEventListener('keydown', onKey, true);
    function draw() {
      const res = search(q); body.innerHTML = ''; const f = nav(el('button', 'sfield', '<i>\u{1F50D}</i><span>' + (q ? esc(q) : '<em>Type to search games, settings, servers, commands\u2026</em>') + '</span>')); f.dataset.first = ''; f.onclick = () => osk({ title: 'Search SKBox', value: q, submitLabel: 'Search', onDone: v => { q = v || ''; draw(); } }); body.appendChild(f);
      const list = el('div', 'slist'); body.appendChild(list); if (!res.length) list.appendChild(el('p', 'sub', 'Nothing matches. Try a game name, "party", "servers" or "settings".'));
      res.forEach(r => { const x = nav(el('button', 'srow')); x.innerHTML = '<i>' + (r.ic || '\u25B6') + '</i><div><b>' + esc(r.t) + '</b><small>' + esc(r.s || '') + '</small></div>'; x.onclick = () => run(r); list.appendChild(x); });
      if (!body._first) { body._first = true; ensureFocus(L, res.length && q ? list.firstChild : f); } else ensureFocus(L, res.length && q ? list.firstChild : f);
    }
    function onKey(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return; if (e.key.length === 1 && !S.osk) { q += e.key; e.stopPropagation(); e.preventDefault(); draw(); }
      else if (e.key === 'Backspace' && q && !S.osk) { q = q.slice(0, -1); e.stopPropagation(); e.preventDefault(); draw(); }
    }
    document.addEventListener('keydown', onKey, true); openLayer(L, () => { cleanup(); closeLayer(L); }); draw();
    const obs = new MutationObserver(() => { if (!L.isConnected) { cleanup(); obs.disconnect(); } }); obs.observe(document.getElementById('layers'), { childList: true });
  } };
  document.addEventListener('keydown', e => { if (!S.settings || ['boot', 'start', 'welcome', 'profiles'].includes(S.screen) || S.osk) return; const typing = /input|textarea/i.test((e.target && e.target.tagName) || ''); if (!typing && ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && !e.ctrlKey && !e.altKey))) { e.preventDefault(); K.spotlight.open(); } });

  // ---------- switching modes ----------
  function setMode(m) { S.settings.uiMode = m; U.saveSettings(); U.applyTheme(); const nm = (MODES.find(x => x[0] === m) || [])[1]; toast(nm + ' mode'); if (['home', 'library', 'settings'].includes(S.screen)) K.go(S.screen === 'settings' ? 'settings' : 'home', S.screen === 'settings' ? { cat: 'looks' } : {}); }
  K.setMode = setMode;

  // ---------- shared pieces ----------
  const clockText = () => K.fmtTime(new Date());
  function statusIcons() { const d = el('div', 'cstat'); d.innerHTML = '<span id="mwf">\u{1F4F6}</span><span id="mpad">\u{1F3AE} 0</span><span id="mclk">' + clockText() + '</span>'; const tick = async () => { const n = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean).length : 0; const p = d.querySelector('#mpad'), c = d.querySelector('#mclk'); if (!p) return; p.textContent = '\u{1F3AE} ' + n + (n ? ' ' + U.batText() : ''); c.textContent = clockText(); try { const s = await sk.wifi.status(); const w = d.querySelector('#mwf'); if (w) { w.style.opacity = s.connected ? 1 : .4; w.title = s.connected ? s.ssid : 'Offline'; } } catch (_) {} }; tick(); K.modeTimers = K.modeTimers || []; K.modeTimers.push(setInterval(tick, 5000)); return d; }
  function lastPlayed() { const st = S.stats || {}; const all = U.allApps().filter(a => !a.kind || a.kind === 'web' || a.kind === 'music'); if (S.game) { const g = all.find(a => a.id === S.game.id); if (g) return g; } return all.filter(a => (st[a.id] || {}).last).sort((x, y) => st[y.id].last - st[x.id].last)[0] || null; }
  function bgFor(a) { return a && a.cover ? fileUrl(a.cover) : ''; }
  const posterTile = a => { const t = U.tileEl(a); t._app = a; t.onclick = () => (a.lib ? K.go('library') : U.openApp(a)); t._onopts = () => (a.lib ? toast('Press A to open your Library') : U.appMenu(a, 'home')); return t; };

  // ---------- Deck ----------
  function rail(active) { const r = el('div', 'drail'); r.appendChild(el('div', 'dlogo', 'SK')); dests.forEach(([id, ic, name]) => { const b = nav(el('button', 'dr' + (id === active ? ' act' : ''), '<i>' + ic + '</i><span>' + name + '</span>')); b.onclick = () => goDest(id); r.appendChild(b); }); return r; }
  K.modes.deck = {
    chrome(root, active) { if (root.querySelector(':scope > .dshell')) return; const sh = el('div', 'dshell'), main = el('div', 'dmain2'); while (root.firstChild) main.appendChild(root.firstChild); sh.append(rail(active), main); root.appendChild(sh); root.classList.add('deck-chrome'); },
    home(root) {
      hints([['A', 'Open'], ['Y', 'Options'], ['S', 'Settings']]); S.startFn = () => K.go('settings'); S.backFn = null; document.body.classList.add('m-deck'); K.setBg('');
      const sh = el('div', 'dshell'); sh.appendChild(rail('home')); const main = el('div', 'dmain'); sh.appendChild(main); root.appendChild(sh);
      const p = S.players[0] || S.players[S.active]; const top = el('div', 'dtop'); top.innerHTML = '<div><small>' + (new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening') + '</small><h1>' + esc(p ? (p.nick || p.u) : 'SKBox') + '</h1></div>'; top.appendChild(statusIcons()); main.appendChild(top);
      const lp = lastPlayed(), card = el('div', 'dhero'); if (lp) { const img = bgFor(lp); card.style.backgroundImage = img ? 'linear-gradient(90deg,rgba(6,8,18,.92) 30%,rgba(6,8,18,.35)),url("' + img + '")' : 'linear-gradient(120deg,#16213e,#0b1020)'; card.innerHTML = '<div><small>' + (U.isRunning(lp) ? 'Running now' : 'Jump back in') + '</small><h2>' + esc(lp.name) + '</h2><p>' + esc(U.playInfo(lp)) + '</p></div>'; const pb = nav(el('button', 'btn p', U.isRunning(lp) ? '\u25B6 Resume' : '\u25B6 Play')); pb.onclick = () => U.openApp(lp); pb._onopts = () => U.appMenu(lp, 'home'); card.appendChild(pb); pb.dataset.first = ''; if (S.game) { const x = nav(el('button', 'btn danger', 'Close game')); x.onclick = () => U.closeRunning(); card.appendChild(x); } }
      else card.innerHTML = '<div><small>Welcome</small><h2>Nothing played yet</h2><p>Open the Library and press X on an app to pin it, or visit the Store.</p></div>'; main.appendChild(card);
      const grid = el('div', 'dgrid'); const list = U.tiles(); const els = list.map(a => { const t = posterTile(a); t._app = a; grid.appendChild(t); return t; }); main.appendChild(grid);
      const bar = el('div', 'dbar'); K.widgets.list().forEach(w => bar.appendChild(w)); main.appendChild(bar);
      const pbtn = card.querySelector('.btn.p'); const want = els.find(t => (t._app.id || 'lib') === S.lastTileId) || pbtn || els[0]; els.forEach(t => { t._onfocus = () => { S.lastTileId = t._app.id || 'lib'; if (!t._app.lib) K.setBg(''); }; }); ensureFocus(root, want);
      K.modeTimers = K.modeTimers || []; K.modeTimers.push(setInterval(pull, 15000));
    }
  };

  // ---------- Settings: Themes ----------
  K.settingsPages.skins = pane => {
    const { toggle, saveSettings, applyTheme } = U; const h = t => pane.appendChild(el('h2', '', t)), sub = t => pane.appendChild(el('div', 'sub', t)); const cur = K.skinId(S.settings);
    h('Themes'); sub('A theme changes the whole look: colors, type, shapes and the background. SK Glass is the original and uses your own color theme and accent. Every other theme brings its own colors.');
    const colorBlock = () => {
    // color themes: the original Midnight/Ocean/Sakura look and more. Picking one switches to SK Glass with that color theme.
    pane.appendChild(el('h3', 'skmore', 'Color themes')); pane.appendChild(el('div', 'sub', 'These keep the SK Glass shapes and change the colors. Pick one and your accent color follows it (you can still change the accent in Display & brightness).'));
    const cg = el('div', 'skincards'), TH = K.colorThemes || {}, meta = K.themeMeta || {}, curT = S.settings.theme || 'midnight';
    Object.keys(meta).forEach(id => { const t = TH[id] || {}, bg = t['--bg'] || '#0b0f1c', pn = (t['--panel2'] || 'rgba(26,32,54,.95)'), tx = t['--text'] || '#f3f5ff', a = meta[id][1], c = nav(el('button', 'skcard' + (cur === 'glass' && curT === id ? ' sel' : '')));
      c.innerHTML = '<div class="skpv" style="background:' + bg + '"><div class="pvbar" style="background:' + pn + ';border-radius:10px;color:' + tx + '">SKBox</div><div class="pvrow"><i style="background:' + a + ';border-radius:10px"></i><i style="background:' + pn + ';border-radius:10px"></i><i style="background:' + pn + ';border-radius:10px"></i><i style="background:' + pn + ';border-radius:10px"></i></div></div><b>' + esc(meta[id][0]) + (cur === 'glass' && curT === id ? ' \u2713' : '') + '</b>';
      c.onclick = () => { S.settings.skin = 'glass'; S.settings.theme = id; S.settings.accent = a; saveSettings(); applyTheme(); toast(meta[id][0]); K.go('settings', { cat: 'skins' }); }; cg.appendChild(c); });
    pane.appendChild(cg);
    };
    let grid = el('div', 'skincards'); K.skins.forEach((sk, ix) => { if (ix === 2) { pane.appendChild(grid); colorBlock(); pane.appendChild(el('h3', 'skmore', 'More looks')); pane.appendChild(el('div', 'sub', 'These are rougher than SK Glass and Pixel Craft. Try them, and tell me which ones to improve or remove.')); grid = el('div', 'skincards'); } const p = sk.pv, c = nav(el('button', 'skcard' + (cur === sk.id ? ' sel' : '')));
      c.innerHTML = '<div class="skpv" style="background:' + p.bg + ';font-family:' + p.font.replace(/"/g, "'") + '"><div class="pvbar" style="background:' + p.panel + ';border-radius:' + p.r + ';color:' + p.text + '">SKBox</div><div class="pvrow"><i style="background:' + p.a + ';border-radius:' + p.r + '"></i><i style="background:' + p.b + ';border-radius:' + p.r + '"></i><i style="background:' + p.panel + ';border-radius:' + p.r + '"></i><i style="background:' + p.panel + ';border-radius:' + p.r + '"></i></div></div><b>' + esc(sk.name) + (cur === sk.id ? ' \u2713' : '') + '</b><small>' + esc(sk.desc) + '</small>';
      c.onclick = () => { S.settings.skin = sk.id; if (sk.id === 'glass' && !S.settings.theme) S.settings.theme = 'midnight'; saveSettings(); applyTheme(); toast(sk.name); K.go('settings', { cat: 'skins' }); }; grid.appendChild(c); }); pane.appendChild(grid);

    pane.appendChild(toggle('Animated backgrounds and effects', 'Drifting lights, scanlines and moving grids. Turn off for a calmer look or to save power.', S.settings.skinFx !== false, v => { S.settings.skinFx = v; saveSettings(); applyTheme(); }));
    if (cur === 'glass') sub('Colors for SK Glass: Settings > Display & brightness (color theme, accent, wallpaper).'); else sub('This theme sets its own colors, so the accent and color theme pickers are not used while it is on.');
    ensureFocus(pane, pane.querySelector('.skcard.sel') || pane.querySelector('[data-nav]'));
  };
  // ---------- Settings: Look & modes ----------
  K.settingsPages.looks = pane => {
    const { row, cyc, toggle, saveSettings } = U; const h = t => pane.appendChild(el('h2', '', t)), sub = t => pane.appendChild(el('div', 'sub', t));
    h('Look & modes'); sub('A mode changes the whole SKBox: Home, the Library frame and the Settings frame. Switch any time; nothing is lost.');
    const cards = el('div', 'modecards'); MODES.forEach(([id, name, desc]) => { const c = nav(el('button', 'mcard' + (modeName() === id ? ' sel' : ''))); c.innerHTML = '<div class="mprev mp-' + id + '"><i></i><i></i><i></i><i></i></div><b>' + name + (modeName() === id ? ' \u2713' : '') + '</b><small>' + esc(desc) + '</small>'; c.onclick = () => setMode(id); cards.appendChild(c); }); pane.appendChild(cards);
    h2s('Loading screen'); pane.appendChild(cyc('Loading screen', 'Shown while SKBox starts and while a game launches', K.loading.styles.map(s => [s.id, s.name]), () => S.settings.loadStyle || 'orbit', v => { S.settings.loadStyle = v; saveSettings(); }));
    pane.appendChild(row('Preview the loading screen', 'See it now for a few seconds', '\u25B6', () => K.loading.preview()));
    h2s('Home widgets'); [['party', 'Party', 'Who is in your voice party'], ['servers', 'Servers', 'Minecraft servers running and players online'], ['today', 'Today', 'How long you have played today']].forEach(([k, n, d]) => pane.appendChild(toggle(n, d, on(k), v => { S.settings.widgets = Object.assign({}, S.settings.widgets, { [k]: v }); saveSettings(); })));
    h2s('SK menu'); pane.appendChild(toggle('Quick bar in the SK menu', 'Volume, screenshot and party mute buttons at the top', S.settings.menuQuick !== false, v => { S.settings.menuQuick = v; saveSettings(); }));
    h2s('Move to another PC'); sub('Saves your settings, library, play stats and collections into one file. Passwords, PINs and sign-in tokens are never included.');
    pane.appendChild(row('Export my setup', 'Saves SKBox-setup.json to your Desktop', '\u2B07', async () => { const r = await X('setupExport'); toast(r.ok ? 'Saved to your Desktop: ' + r.name : (r.error || 'Could not save')); }));
    pane.appendChild(row('Import a setup file', 'Pick a SKBox-setup.json from another PC', '\u2B06', async () => { const f = await sk.pickFile('json'); if (!f) return; const p = await X('setupPreview', { file: f }); if (!p.ok) return toast(p.error); confirm('Import this setup?', p.summary + '\nThis replaces your current settings and library. A copy of what you have now is kept on your Desktop first.', 'Import', async () => { const r = await X('setupImport', { file: f }); if (!r.ok) return toast(r.error); toast('Imported. Restarting SKBox\u2026'); setTimeout(() => X('restart'), 1200); }); }));
    function h2s(t) { pane.appendChild(el('h3', '', t)); }
    ensureFocus(pane, pane.querySelector('.mcard.sel') || pane.querySelector('[data-nav]'));
  };
  // ---------- Settings: Party ----------
  K.settingsPages.party = pane => {
    const { row, toggle, saveSettings } = U; const h = t => pane.appendChild(el('h2', '', t)), sub = t => pane.appendChild(el('div', 'sub', t)), h3 = t => pane.appendChild(el('h3', '', t));
    h('Party'); sub('Voice parties run in the background while you play. Open the SK menu (Xbox / PlayStation button) and pick Party to start or join one. Friends without SKBox can join from the web page. Voices go straight between friends; only the handshake uses a free public service.');
    pane.appendChild(row('Open my party', K.partyUI.state().status === 'in' ? 'You are in party ' + K.partyUI.state().code : 'Start or join one now', '\u{1F3A7}', () => openParty()));
    pane.appendChild(toggle('Tell me when someone joins', 'A Windows notification, also while you are in a game', S.settings.partyNotify !== false, v => { S.settings.partyNotify = v; saveSettings(); }));
    sub('Mute your party microphone anywhere, even in a game: Ctrl + Alt + Shift + V.');
    h3('Advanced: party service'); sub('By default SKBox uses the free PeerJS service to introduce friends to each other. If it is ever down or blocked, you can run your own PeerJS server and enter it here. Leave empty for the default.');
    const hostLabel = S.settings.partyHost ? S.settings.partyHost + ':' + (S.settings.partyPort || 443) + (S.settings.partyPath || '/') : 'Default (PeerJS cloud)';
    pane.appendChild(row('Server address', hostLabel, '\u270E', () => osk({ title: 'Server like party.example.com:443/', value: S.settings.partyHost ? S.settings.partyHost + ':' + (S.settings.partyPort || 443) + (S.settings.partyPath || '/') : '', submitLabel: 'Save', onDone: v => { v = (v || '').trim(); if (!v) { delete S.settings.partyHost; delete S.settings.partyPort; delete S.settings.partyPath; } else { const m = /^([a-z0-9.-]+)(?::(\d{2,5}))?(\/.*)?$/i.exec(v.replace(/^https?:\/\//i, '')); if (!m) return toast('That does not look like an address'); S.settings.partyHost = m[1]; S.settings.partyPort = +(m[2] || 443); S.settings.partyPath = m[3] || '/'; S.settings.partySecure = true; } saveSettings(); K.go('settings', { cat: 'party' }); } })));
    sub('A custom server must use https. It only affects parties you start or join from SKBox.');
    ensureFocus(pane, pane.querySelector('[data-nav]'));
  };
})();
