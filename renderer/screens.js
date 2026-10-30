// SKBox screens
(function () {
  'use strict';
  const { sk, S, $, el, esc, nav, fileUrl, toast, hints, focus, ensureFocus, openLayer, closeLayer, confirm, menu, busy, osk, field, setBg } = window.K;
  const BUILTIN = [
    { id: 'skchat', name: 'SKchat', kind: 'web', url: 'https://sksmpchat.netlify.app/chat', art: 'assets/skchat.png', grad: 'linear-gradient(160deg,#0e4a5c,#0b1020)', tag: 'Chat, calls and friends' },
    { id: 'skmusic', name: 'SKMusic', kind: 'music', url: 'https://sksmpchat.netlify.app/skmusic', art: 'assets/skmusic.png', grad: 'linear-gradient(160deg,#6b1fa0,#14081f)', tag: 'Keeps playing while you game' }
  ];
  const PACKS = [
    { id: 'west', name: 'Wild West', items: [['west_hat', 'Sunset Hat'], ['west_star', 'Sheriff Star'], ['west_shoe', 'Lucky Horseshoe'], ['west_cactus', 'Cactus'], ['west_mesa', 'Canyon'], ['west_boot', 'Boot']] },
    { id: 'blocks', name: 'Blocky World', items: [['blocks_grass', 'Grass Block'], ['blocks_pick', 'Pickaxe'], ['blocks_gem', 'Gem'], ['blocks_tree', 'Tree'], ['blocks_sword', 'Sword'], ['blocks_heart', 'Heart']] },
    { id: 'city', name: 'Neon City', items: [['city_palm', 'Neon Palm'], ['city_car', 'Night Drive'], ['city_shades', 'Shades'], ['city_sky', 'Skyline'], ['city_coin', 'Coin'], ['city_vinyl', 'Vinyl']] },
    { id: 'cozy', name: 'Cozy', items: [['cozy_fire', 'Campfire'], ['cozy_mug', 'Hot Cocoa'], ['cozy_cabin', 'Cabin'], ['cozy_cat', 'Moon Cat'], ['cozy_shroom', 'Mushroom'], ['cozy_plant', 'Plant']] }
  ];
  const BGS = [['dynamic', 'Dynamic'], ['west_dusk', 'Wild West Dusk'], ['blocks_day', 'Blocky Meadow'], ['neon_city', 'Neon City'], ['cabin_night', 'Cabin Night'], ['rainy_window', 'Rainy Window'], ['campfire', 'Campfire'], ['aurora', 'Aurora'], ['sunrise_hills', 'Sunrise Hills']];
  const BGMOOD = { west_dusk: 'west', blocks_day: 'pixel', neon_city: 'neon', cabin_night: 'campfire', rainy_window: 'lofi', campfire: 'campfire', aurora: 'lofi', sunrise_hills: 'pixel' };
  const FXCOL = { dynamic: '#ffe2a8', west_dusk: '#ffb870', blocks_day: '#ffffff', neon_city: '#ff6aa8', cabin_night: '#ffd98a', rainy_window: '#8fb4ff', campfire: '#ffae50', aurora: '#8fffd0', sunrise_hills: '#fff0c8' };
  const ACCENTS = ['#2dd4bf', '#818cf8', '#f472b6', '#fb923c', '#4ade80', '#60a5fa'];
  const gradFor = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return 'linear-gradient(160deg,hsl(' + h + ',55%,32%),hsl(' + ((h + 50) % 360) + ',60%,12%))'; };
  const saveApps = () => sk.store.set('apps', S.apps);
  const saveSettings = () => sk.store.set('settings', S.settings);
  const initial = p => esc((p.nick || p.u || '?')[0].toUpperCase());
  const avatarUrl = p => { if (!p) return ''; const v = (S.settings.pfp || {})[p.u]; if (v && v.startsWith('builtin:')) return 'assets/pfp/' + v.slice(8) + '.png'; if (v && v.startsWith('file:')) return fileUrl(v.slice(5)); return p.av && /^(data:image|https?:)/.test(p.av) ? p.av : ''; };
  const avatar = (p, big) => { const u = avatarUrl(p); return '<div class="av' + (big ? ' big' : '') + '"' + (u ? ' style="background-image:url(\'' + esc(u) + '\')"></div>' : '>' + (p ? initial(p) : '+') + '</div>'); };
  let clockTimer = null, wifiTimer = null;
  const clearTimers = () => { clearInterval(clockTimer); clearInterval(wifiTimer); };
  function go(name, data) {
    clearTimers(); S.screen = name; if (window.K.audio) window.K.audio.setSuspended(name === 'web'); S.backFn = null; S.startFn = null; S.bumper = null;
    const root = $('#screen'); root.innerHTML = ''; root.className = 'fade';
    ({ boot, welcome, profiles, home, library, settings, addApp, web }[name])(root, data || {});
  }
  window.K.go = go;

  // ---------- boot ----------
  function boot(root) {
    hints([]); setBg('');
    root.innerHTML = '<div class="center"><div class="logo">SKBOX</div><div style="color:var(--dim)">Starting up\u2026</div></div>';
    (async () => {
      S.settings = (await sk.store.get('settings', {})) || {}; S.apps = (await sk.store.get('apps', [])) || []; S.stats = (await sk.store.get('stats', {})) || {};
      if (!Array.isArray(S.settings.pinned)) { S.settings.pinned = allApps().map(a => a.id); saveSettings(); S.migratedPins = true; }
      try { S.game = await sk.game.state(); } catch (_) { S.game = null; }
      applyTheme(); if (window.K.audio) { window.K.audio.apply(); window.K.audio.boot(); } S.profiles = await sk.auth.list();
      await new Promise(r => setTimeout(r, 900));
      const last = S.settings.players || [];
      S.players = [S.profiles.find(p => p.u === last[0]) || (last[0] === 'guest' ? { u: 'guest', guest: true } : null), S.profiles.find(p => p.u === last[1]) || null];
      if (S.players[0]) { go('home'); S.players[0].u !== 'guest' && sk.auth.refresh(S.players[0].u).then(m => { if (m) { S.players[0] = m; const i = S.profiles.findIndex(p => p.u === m.u); if (i >= 0) S.profiles[i] = m; } }); }
      else if (S.profiles.length) go('profiles', { slot: 0 }); else go('welcome');
    })();
  }
  function applyTheme() {
    const a = S.settings.accent || ACCENTS[0]; document.documentElement.style.setProperty('--a', a);
    document.body.classList.toggle('calm', !!S.settings.calm);
    buildFx(); applyWall();
  }
  function buildFx() {
    const fx = $('#fx'); if (!fx) return; fx.classList.toggle('off', S.settings.fx === false || !!S.settings.calm);
    if (fx.children.length) return;
    for (let i = 0; i < 20; i++) { const d = document.createElement('i'), sz = (3 + Math.random() * 5).toFixed(1); d.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;--s:' + sz + 'px;--d:' + (14 + Math.random() * 16).toFixed(1) + 's;--l:-' + (Math.random() * 30).toFixed(1) + 's;--x:' + ((Math.random() - .5) * 18).toFixed(1) + 'vw'; fx.appendChild(d); }
  }
  function applyWall() {
    const b = S.settings.bg || 'dynamic'; let url = '';
    if (b.startsWith('file:')) url = fileUrl(b.slice(5)); else if (b !== 'dynamic') url = 'assets/bg/' + b + '.jpg';
    window.K.setWall(url); const fx = $('#fx'); if (fx) fx.style.setProperty('--fx', FXCOL[b] || FXCOL.dynamic);
  }
  function setBgChoice(key) {
    S.settings.bg = key; saveSettings(); applyWall();
    if (S.settings.autoMood !== false && BGMOOD[key]) { S.settings.mood = BGMOOD[key]; saveSettings(); window.K.audio && window.K.audio.apply(); }
  }
  function setPfp(u, val) {
    S.settings.pfp = S.settings.pfp || {}; if (val) S.settings.pfp[u] = val; else delete S.settings.pfp[u]; saveSettings();
    if (S.screen === 'settings') go('settings', { cat: 'players' }); else go('home');
  }
  function pfpPicker(slot) {
    const p = S.players[slot]; if (!p) return; let pack = 0;
    const L = el('div', 'layer'), b = el('div', 'box'), tabs = el('div', 'packtabs'), grid = el('div', 'pfpgrid'), foot = el('div', 'btnrow'), cur = (S.settings.pfp || {})[p.u] || '';
    b.style.minWidth = '48rem'; b.innerHTML = '<h3>Choose a picture for ' + esc(p.nick || p.u) + '</h3>';
    function draw(keepTab) {
      tabs.innerHTML = ''; grid.innerHTML = '';
      PACKS.forEach((pk, i) => { const t = nav(el('button', 'tab' + (i === pack ? ' sel' : ''), esc(pk.name))); t.onclick = () => { pack = i; draw(i); }; tabs.appendChild(t); });
      PACKS[pack].items.forEach(([id, name], k) => { const e = nav(el('button', 'pfp' + (cur === 'builtin:' + id ? ' sel' : ''), '<div class="av" style="background-image:url(\'assets/pfp/' + id + '.png\')"></div>' + esc(name))); e.onclick = () => { closeLayer(L); setPfp(p.u, 'builtin:' + id); }; grid.appendChild(e); });
      if (keepTab != null) focus(tabs.children[keepTab]);
    }
    const mine = nav(el('button', 'btn', 'Use my SKchat picture')), own = nav(el('button', 'btn', 'Choose an image\u2026'));
    mine.onclick = () => { closeLayer(L); setPfp(p.u, ''); };
    own.onclick = async () => { const f = await sk.pickFile('image'); if (!f) return; const r = await sk.cover.copy(f); if (r.ok) { closeLayer(L); setPfp(p.u, 'file:' + r.file); } };
    foot.append(mine, own); b.append(tabs, grid, foot); L.appendChild(b); draw(); openLayer(L, () => closeLayer(L));
  }
  window.K.pfpPicker = pfpPicker;
  const rememberPlayers = () => { S.settings.players = S.players.map(p => p ? p.u : null); saveSettings(); };

  // ---------- sign in ----------
  function signInFlow(slot) {
    osk({ title: 'SKchat username', onDone: u => {
      if (!u.trim()) return;
      osk({ title: 'Password for ' + u.trim(), secret: true, onDone: async p => {
        const stop = busy('Signing in\u2026'); const r = await sk.auth.signin(u.trim(), p); stop();
        if (!r.ok) { confirm('Could not sign in', r.error, 'Try again', () => signInFlow(slot)); return; }
        const i = S.profiles.findIndex(x => x.u === r.profile.u); if (i >= 0) S.profiles[i] = r.profile; else S.profiles.push(r.profile);
        S.players[slot] = r.profile; rememberPlayers(); toast('Welcome, ' + (r.profile.nick || r.profile.u)); go('home');
      } });
    } });
  }
  function welcome(root) {
    hints([['A', 'Select']]);
    root.innerHTML = '<div class="center"><div class="logo">SKBOX</div><p style="color:var(--dim);max-width:34rem;line-height:1.6">Sign in with your SKchat account. Your profile, SKchat and SKMusic come with you.</p></div>';
    const row = el('div', 'btnrow'), a = nav(el('button', 'btn p', 'Sign in')), g = nav(el('button', 'btn', 'Continue as guest'));
    a.dataset.first = ''; a.onclick = () => signInFlow(0);
    g.onclick = () => { S.players[0] = { u: 'guest', guest: true }; rememberPlayers(); go('home'); };
    row.append(a, g); root.querySelector('.center').appendChild(row); ensureFocus(root);
  }
  function profiles(root, d) {
    const slot = d.slot || 0;
    hints([['A', 'Select'], ['B', 'Back']]); S.backFn = S.players[0] ? () => go('home') : null;
    root.innerHTML = '<div class="center"><h1 style="font-size:2.4rem">' + (slot ? (d.auto ? 'Player 2 joined! Pick your profile' : 'Player 2: who\u2019s playing?') : 'Who\u2019s playing?') + '</h1></div>';
    const grid = el('div', 'grid'); grid.style.cssText = 'width:min(70vw,60rem);margin-top:2vh';
    S.profiles.forEach((p, i) => {
      const c = nav(el('button', 'pcard', avatar(p, true) + '<b>' + esc(p.nick || p.u) + '</b><small>@' + esc(p.u) + '</small>'));
      if (i === 0) c.dataset.first = '';
      c.onclick = () => { S.players[slot] = p; if (slot === 1 && S.players[0] && S.players[0].u === p.u) { toast('That profile is already Player 1'); S.players[1] = null; return; } rememberPlayers(); sk.auth.refresh(p.u).then(m => { if (m) S.players[slot] = m; }); go('home'); };
      grid.appendChild(c);
    });
    const add = nav(el('button', 'pcard', '<div class="av big">+</div><b>Add profile</b><small>Sign in with SKchat</small>')); add.onclick = () => signInFlow(slot); grid.appendChild(add);
    if (!slot) { const g = nav(el('button', 'pcard', '<div class="av big">?</div><b>Guest</b><small>No account</small>')); g.onclick = () => { S.players[0] = { u: 'guest', guest: true }; rememberPlayers(); go('home'); }; grid.appendChild(g); }
    root.querySelector('.center').appendChild(grid); ensureFocus(root);
  }

  // ---------- home ----------
  const allApps = () => BUILTIN.concat(S.apps);
  const pinnedIds = () => S.settings.pinned || [];
  const isPinned = a => pinnedIds().includes(a.id);
  const homeApps = () => pinnedIds().map(id => allApps().find(a => a.id === id)).filter(Boolean);
  const tiles = () => homeApps().concat([{ lib: true, name: 'Library', tag: 'All your apps and games' }]);
  const isRunning = a => !!(S.game && a && S.game.id === a.id);
  function setPinned(a, on) { const p = pinnedIds().filter(x => x !== a.id); if (on) p.push(a.id); S.settings.pinned = p; saveSettings(); }
  function movePin(a, d) { const p = pinnedIds().slice(), i = p.indexOf(a.id), j = i + d; if (i < 0 || j < 0 || j >= p.length) return false; [p[i], p[j]] = [p[j], p[i]]; S.settings.pinned = p; saveSettings(); return true; }
  const fmtPlay = ms => { const m = Math.round((ms || 0) / 60000); if (m < 1) return 'Not played yet'; if (m < 60) return m + ' min played'; const h = Math.floor(m / 60); return h + ' h ' + (m % 60 ? (m % 60) + ' min ' : '') + 'played'; };
  const fmtAgo = t => { if (!t) return ''; const d = Date.now() - t, m = Math.floor(d / 60000); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.floor(m / 60); if (h < 24) return h + ' h ago'; const dd = Math.floor(h / 24); return dd === 1 ? 'yesterday' : dd + ' days ago'; };
  const playInfo = a => { const x = (S.stats || {})[a.id]; if (!x || (!x.ms && !x.last)) return a.kind ? '' : 'Not played yet'; return [x.ms ? fmtPlay(x.ms) : '', x.last ? 'last ' + fmtAgo(x.last) : ''].filter(Boolean).join(' \u00B7 '); };
  function tileEl(a) {
    const t = nav(el('button', 'tile' + (a.add ? ' add' : '') + (a.lib ? ' lib' : '')));
    let art;
    if (a.lib) art = '<div class="art libart"><div class="libico"><i></i><i></i><i></i><i></i></div><b>Library</b></div>';
    else if (a.add) art = '<div class="art">+</div>';
    else if (a.cover && a.fit === 'icon') art = '<div class="art" style="background:' + gradFor(a.name) + '"><img src="' + esc(fileUrl(a.cover)) + '" alt="" style="width:34%;image-rendering:auto"></div>';
    else if (a.cover && a.fit === 'fit') art = '<div class="art fitart" style="--img:url(\'' + fileUrl(a.cover) + '\')"><img src="' + esc(fileUrl(a.cover)) + '" alt=""></div>';
    else if (a.cover) art = '<div class="art" style="background-image:url(\'' + fileUrl(a.cover) + '\')"></div>';
    else if (a.art) art = '<div class="art" style="background:' + a.grad + '"><img src="' + a.art + '" alt=""></div>';
    else art = '<div class="art" style="background:' + gradFor(a.name) + '"><span class="ltr">' + esc((a.name || '?')[0].toUpperCase()) + '</span></div>';
    if (!a.add && !a.lib && isRunning(a)) art += '<span class="badge run">\u25CF Running</span>';
    t.innerHTML = art; return t;
  }
  function closeRunning() {
    if (!S.game) return;
    confirm('Close ' + S.game.name + '?', 'SKBox asks it to close first so it can save, then forces it if it does not. Anything unsaved may be lost.', 'Close game', async () => {
      const stop = busy('Closing ' + S.game.name + '\u2026'); const r = await sk.game.close(); stop();
      toast(r && r.found === false ? 'Could not find the game\u2019s window. If it is still open, close it from the game itself.' : 'Game closed');
    }, true);
  }
  function home(root) {
    hints([['A', 'Open'], ['Y', 'Options'], ['S', 'Settings']]);
    S.startFn = () => go('settings'); S.backFn = null;
    const top = el('div', 'top'), left = el('div', 'grp'), right = el('div', 'grp');
    if (S.game) {
      const g = nav(el('button', 'chip game', '<div class="av">\u25B6</div><span>Resume ' + esc(S.game.name) + '</span>')); g.dataset.first = ''; g.onclick = () => sk.game.resume(); g._onopts = closeRunning; left.appendChild(g);
      const x = nav(el('button', 'chip danger', '<div class="av">\u2716</div><span>Close game</span>')); x.onclick = closeRunning; left.appendChild(x);
    }
    [0, 1].forEach(i => {
      const p = S.players[i];
      if (p) { const c = nav(el('button', 'chip', avatar(p) + '<span>' + esc(p.nick || p.u) + '</span><span class="pn">P' + (i + 1) + '</span>')); c.onclick = () => go('settings', { cat: 'players' }); c._onopts = () => pfpPicker(i); left.appendChild(c); }
      else if (i === 1) { const c = nav(el('button', 'chip', '<div class="av">+</div><span>Add Player 2</span>')); c.onclick = () => go('profiles', { slot: 1 }); left.appendChild(c); }
    });
    const npB = nav(el('button', 'chip np', '<div class="av">\u266A</div><span id="npt">SKMusic</span>')); npB.style.display = 'none';
    npB.onclick = () => sk.music.cmd('toggle').then(() => setTimeout(tick, 400)); npB._onopts = () => sk.music.open(activeUser()); left.appendChild(npB);
    const wifiB = nav(el('button', 'ibtn', '<span id="wf">\u{1F4F6}</span><span id="wfn" style="font-size:.85rem;color:var(--dim)"></span>')); wifiB.onclick = () => go('settings', { cat: 'wifi' });
    const btB = nav(el('button', 'ibtn', '<span style="font-size:.85rem">\u16D2 Bluetooth</span>')); btB.onclick = () => go('settings', { cat: 'bluetooth' });
    const pad = el('div', 'ibtn', '\u{1F3AE} <span id="padn">0</span><span id="bat" style="font-size:.8rem;color:var(--dim);margin-left:.4rem"></span>'); pad.style.cursor = 'default';
    const clk = el('div', 'clock'); const setB = nav(el('button', 'ibtn', '\u2699')); setB.onclick = () => go('settings'); const pw = nav(el('button', 'ibtn', '\u23FB')); pw.onclick = () => go('settings', { cat: 'power' });
    right.append(wifiB, btB, pad, clk, setB, pw); top.append(left, right);
    const wrap = el('div', 'home'), row = el('div', 'row'), info = el('div', 'info');
    wrap.append(row, info); root.append(top, wrap);
    const list = tiles(), els = [];
    list.forEach((a, i) => {
      const t = tileEl(a); t._id = a.lib ? 'lib' : a.id; els.push(t);
      t._onfocus = () => {
        S.lastTile = i; S.lastTileId = a.id || 'lib';
        if (a.lib) { info.innerHTML = '<h1>Library</h1><p>' + (allApps().length) + ' apps and games. Pin the ones you want on this screen.</p><div class="go"><i class="key k-A">A</i> Open</div>'; setBg(''); }
        else { info.innerHTML = '<h1>' + esc(a.name) + '</h1><p>' + esc([a.tag || a.exe || '', playInfo(a)].filter(Boolean).join(' \u00B7 ')) + '</p><div class="go"><i class="key k-A">A</i> ' + (isRunning(a) ? 'Resume' : a.kind === 'web' ? 'Open' : 'Play') + '</div>'; setBg(a.cover ? fileUrl(a.cover) : ''); }
      };
      t.onclick = () => a.lib ? go('library') : openApp(a);
      if (!a.lib) t._onopts = () => appMenu(a, 'home'); else t._onopts = () => toast('Press A to open your Library');
      row.appendChild(t);
    });
    if (S.migratedPins) { S.migratedPins = false; setTimeout(() => toast('Your apps are now in the Library. Pin or unpin them from there.'), 600); }
    if (!S.newsChecked) { S.newsChecked = true; sk.info().then(i => { if (i && i.version && S.settings.seenVersion !== i.version) { S.settings.seenVersion = i.version; saveSettings(); setTimeout(() => { if (S.screen === 'home') showNews(); }, 900); } }); }
    if (list.length === 1) setTimeout(() => toast('Nothing pinned yet. Open the Library and press X on an app to pin it.'), 700);
    const tick = async () => {
      clk.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); const n = (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean).length : 0); const e = $('#padn'); if (e) e.textContent = n; const be = $('#bat'); if (be) be.textContent = n ? batText() : '';
      try { const m = await sk.music.status(); if (S.screen !== 'home') return; if (m && m.ready && m.track) { npB.style.display = ''; $('#npt').textContent = (m.playing ? '\u23F8 ' : '\u25B6 ') + String(m.track.title || 'SKMusic').slice(0, 28); } else npB.style.display = 'none'; } catch (_) {}
    };
    tick(); clockTimer = setInterval(tick, 4000);
    const wf = async () => { const s = await sk.wifi.status(); const w = $('#wf'), n = $('#wfn'); if (!w) return; w.style.opacity = s.connected ? 1 : .4; n.textContent = s.connected ? s.ssid : 'Offline'; };
    wf(); wifiTimer = setInterval(wf, 25000);
    const want = els.find(e => e._id === S.lastTileId) || els[Math.min(S.lastTile || 0, els.length - 1)];
    ensureFocus(root, want);
  }

  // ---------- Library: every app lives here; pin the ones you want on Home ----------
  let libSort = 'az', libQuery = '';
  const SORTS = [['az', 'A\u2013Z'], ['recent', 'Recently played'], ['most', 'Most played']];
  function libList() {
    let l = allApps().filter(a => !libQuery || a.name.toLowerCase().includes(libQuery.toLowerCase())); const st = S.stats || {}, g = a => st[a.id] || { last: 0, ms: 0 };
    if (libSort === 'az') l.sort((x, y) => x.name.localeCompare(y.name)); else if (libSort === 'recent') l.sort((x, y) => g(y).last - g(x).last || x.name.localeCompare(y.name)); else l.sort((x, y) => g(y).ms - g(x).ms || x.name.localeCompare(y.name));
    return l;
  }
  function library(root, d) {
    hints([['A', 'Open'], ['X', 'Pin / Unpin'], ['Y', 'Options'], ['L', 'Sort'], ['B', 'Home']]);
    S.backFn = () => go('home'); S.startFn = () => go('settings');
    root.innerHTML = '<div class="page lib"><h1>Library</h1></div>';
    const page = root.querySelector('.page'), bar = el('div', 'libbar');
    const sortB = nav(el('button', 'chip', '<span>Sort: ' + esc(SORTS.find(x => x[0] === libSort)[1]) + '</span>')), findB = nav(el('button', 'chip', '<span>\u{1F50D} ' + (libQuery ? esc(libQuery) : 'Search') + '</span>')), addB = nav(el('button', 'chip', '<div class="av">+</div><span>Add an app</span>'));
    const cycle = dir => { const i = SORTS.findIndex(x => x[0] === libSort); libSort = SORTS[(i + (dir || 1) + SORTS.length) % SORTS.length][0]; go('library', { focus: S.lastLibId }); };
    sortB.onclick = () => cycle(1); S.bumper = a => cycle(a === 'prev' ? -1 : 1);
    findB.onclick = () => osk({ title: 'Search your library', value: libQuery, submitLabel: 'Search', onDone: v => { libQuery = (v || '').trim(); go('library'); } });
    if (libQuery) findB._onopts = () => { libQuery = ''; go('library'); };
    addB.onclick = () => go('addApp');
    bar.append(sortB, findB, addB); page.appendChild(bar);
    const grid = el('div', 'libgrid'), info = el('div', 'libinfo'), list = libList(), els = [];
    if (!list.length) grid.appendChild(el('div', 'sub', libQuery ? 'Nothing matches \u201C' + esc(libQuery) + '\u201D.' : 'Nothing here yet. Press \u201CAdd an app\u201D.'));
    list.forEach((a, i) => {
      const t = tileEl(a); t._id = a.id; els.push(t);
      if (isPinned(a)) t.insertAdjacentHTML('beforeend', '<span class="badge pin">\u{1F4CC} Home</span>');
      t._onfocus = () => { S.lastLibId = a.id; info.innerHTML = '<b>' + esc(a.name) + '</b><span>' + esc([isPinned(a) ? 'On Home' : 'Not on Home', playInfo(a)].filter(Boolean).join(' \u00B7 ')) + '</span>'; };
      t.onclick = () => openApp(a);
      t._onopts = () => appMenu(a, 'lib');
      t._onalt = () => { setPinned(a, !isPinned(a)); toast(isPinned(a) ? a.name + ' pinned to Home' : a.name + ' removed from Home'); go('library', { focus: a.id }); };
      grid.appendChild(t);
    });
    page.append(grid, info);
    const want = els.find(e => e._id === (d.focus || S.lastLibId)) || els[0];
    if (want) ensureFocus(root, want); else ensureFocus(root, addB);
  }
  function appMenu(a, ctx) {
    const run = isRunning(a), it = [{ label: run ? 'Resume' : (a.kind === 'web' ? 'Open' : 'Play'), fn: () => openApp(a) }];
    const back = () => ctx === 'lib' ? go('library', { focus: a.id }) : go('home');
    if (run) it.push({ label: 'Close game', fn: closeRunning });
    if (isPinned(a)) { it.push({ label: 'Unpin from Home', fn: () => { setPinned(a, false); back(); } }); if (ctx === 'home') { it.push({ label: 'Move left', fn: () => { movePin(a, -1); S.lastTileId = a.id; go('home'); } }); it.push({ label: 'Move right', fn: () => { movePin(a, 1); S.lastTileId = a.id; go('home'); } }); } }
    else it.push({ label: 'Pin to Home', fn: () => { setPinned(a, true); toast(a.name + ' pinned to Home'); back(); } });
    if (!a.kind) {
      it.push({ label: 'Change cover art', fn: () => findCover(a, () => { saveApps(); back(); }) });
      it.push({ label: 'Edit name and path', fn: () => go('addApp', { app: a }) });
      it.push({ label: 'Remove', fn: () => confirm('Remove ' + a.name + '?', 'This only removes it from SKBox. Your files are not touched.', 'Remove', () => { S.apps = S.apps.filter(x => x.id !== a.id); setPinned(a, false); if (a.cover) sk.cover.remove(a.cover); saveApps(); back(); }, true) });
    } else it.push({ label: 'Built-in app', fn: () => toast('SKchat and SKMusic are built in') });
    menu(a.name, it);
  }
  K.onPad = (a, idx) => { // Player 2 joins with Start
    if (S.screen === 'home' && idx === 1 && !S.players[1] && a === 'start') { go('profiles', { slot: 1 }); }
  };
  const activeUser = () => (S.players[S.active] || S.players[0] || { u: 'guest' }).u;
  async function openApp(a) {
    if (a.kind) { sk.stats.touch(a.id); (S.stats = S.stats || {})[a.id] = Object.assign({ ms: 0, n: 0 }, S.stats[a.id], { last: Date.now() }); }
    if (a.kind === 'music') { sk.music.open(activeUser()); return; }
    if (a.kind === 'web') { go('web', { app: a }); return; }
    const payload = replace => ({ id: a.id, name: a.name, exe: a.exe, args: a.args, cover: a.cover, fs: a.fs || 'auto', compat: !!a.compat, replace: !!replace });
    const run = async replace => { const stop = busy('Launching ' + a.name + '\u2026'); const r = await sk.launch(payload(replace)); setTimeout(stop, 700); if (!r.ok) toast(r.error || 'Could not launch.'); };
    if (S.game && S.game.id !== a.id) confirm('Switch games?', S.game.name + ' is running. Close it and start ' + a.name + '?', 'Switch', () => run(true));
    else if (S.game) sk.game.resume(); else run(false);
  }
  sk.on('launch-error', m => toast('Could not start: ' + m));
  sk.on('game:state', async g => { S.game = g; try { S.stats = (await sk.store.get('stats', {})) || S.stats; } catch (_) {} if (S.screen === 'home') go('home'); else if (S.screen === 'library') go('library', { focus: S.lastLibId }); });
  // Player 2: a second controller connects, they pick a profile, done
  function p2Check(n) {
    if (n >= 2 && S.players[0] && !S.players[1] && !['boot', 'welcome', 'profiles', 'web'].includes(S.screen) && !S.p2busy) { S.p2busy = true; toast('Player 2 controller connected'); go('profiles', { slot: 1, auto: true }); }
    if (n < 2) S.p2busy = false;
  }
  window.K.onPadCount = p2Check; sk.on('pads', p2Check);
  sk.on('players-changed', async () => {
    S.settings = (await sk.store.get('settings', {})) || S.settings; S.profiles = await sk.auth.list(); const last = S.settings.players || [];
    S.players = [S.profiles.find(p => p.u === last[0]) || (last[0] === 'guest' ? { u: 'guest', guest: true } : S.players[0]), S.profiles.find(p => p.u === last[1]) || (last[1] === 'guest' ? { u: 'guest', guest: true } : null)];
    if (S.players[1]) S.p2busy = true; if (S.screen === 'home') go('home');
  });
  sk.on('music:visible', v => { window.K.audio && window.K.audio.setExternal(!!v); });
  setInterval(async () => { try { const m = await sk.music.status(); window.K.audio && window.K.audio.setExternal(!!(m && m.ready && m.playing)); } catch (_) {} }, 6000);
  sk.on('returned', () => { const e = window.K.current(); });
  sk.on('battery', (slot, type, level) => { (S.bat = S.bat || {})[slot] = { type, level }; });
  sk.on('update-ready', v => confirm('Update ready', 'SKBox ' + v + ' has been downloaded.', 'Restart now', () => sk.installUpdate()));

  // ---------- add / edit app ----------
  const niceName = p => String(p || '').replace(/^.*[\\/]/, '').replace(/\.(exe|lnk|bat|cmd)$/i, '').replace(/[_\-.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  async function findCover(d, done, opts) {
    opts = opts || {}; let term = (d.name || niceName(d.exe) || '').trim(), closed = false;
    const L = el('div', 'layer'), b = el('div', 'box'); b.style.minWidth = '40rem';
    const finish = ok => { if (closed) return; closed = true; closeLayer(L); if (ok) done && done(); else opts.onCancel && opts.onCancel(); };
    const setCover = (r, msg) => { if (!r || !r.ok) { toast((r && r.error) || 'Could not use that image.'); return; } if (d.cover && d.cover !== r.file) sk.cover.remove(d.cover); d.cover = r.file; d.fit = r.fit || 'fill'; finish(true); };
    function draw(list, searching) {
      b.innerHTML = '<h3>' + esc(opts.note || 'Choose cover art') + '</h3><p style="margin-bottom:.8rem">' + (searching ? 'Searching for \u201C' + esc(term) + '\u201D\u2026' : list.length ? 'Results for \u201C' + esc(term) + '\u201D. Pick one, or use your own picture below.' : 'Nothing found for \u201C' + esc(term) + '\u201D. Search with another name, paste an image link, or use your own picture.') + '</p>';
      if (list.length) {
        const g = el('div', 'covers');
        list.slice(0, 8).forEach(c => { const t = nav(el('button', 'cv', '<small>' + esc(c.name) + (c.src === 'wiki' ? ' (Wikipedia)' : '') + '</small>')); t.style.backgroundImage = 'url("' + c.preview + '")';
          t.onclick = async () => { const stop = busy('Downloading\u2026'); const r = c.src === 'wiki' ? await sk.cover.pickUrl(c.url) : await sk.cover.pick(c.id); stop(); setCover(r); }; g.appendChild(t); });
        b.appendChild(g);
      }
      const row = el('div', 'btnrow'), mk = (label, fn, first) => { const x = nav(el('button', 'btn', label)); if (first) x.dataset.first = ''; x.onclick = fn; row.appendChild(x); return x; };
      mk('Use my own image\u2026', async () => { const f = await sk.pickFile('image'); if (!f) return; setCover(await sk.cover.copy(f)); }, !list.length);
      mk('Search again\u2026', () => osk({ title: 'Search for cover art', value: term, submitLabel: 'Search', onDone: v => { term = (v || '').trim() || term; run(); } }));
      mk('Paste image link\u2026', () => osk({ title: 'Image link (https://\u2026)', value: '', submitLabel: 'Download', onDone: async v => { if (!v.trim()) return; const stop = busy('Downloading\u2026'); const r = await sk.cover.pickUrl(v.trim()); stop(); setCover(r); } }));
      if (d.cover && d.fit !== 'icon') mk('Remove cover', () => { sk.cover.remove(d.cover); d.cover = ''; d.fit = ''; finish(true); });
      mk(opts.onCancel ? 'Skip' : 'Cancel', () => finish(false));
      b.appendChild(row);
      const f = b.querySelector('[data-first]') || b.querySelector('[data-nav]'); if (f && !searching) focus(f);
    }
    async function run() { draw([], true); const list = await sk.cover.candidates(term).catch(() => []); if (!closed) draw(list || [], false); }
    L.appendChild(b); openLayer(L, () => finish(false)); run();
  }
  function addApp(root, data) {
    const editing = data.app, d = editing ? editing : { id: 'app_' + Date.now().toString(36), name: '', exe: '', args: '', cover: '' };
    hints([['A', 'Select'], ['B', 'Cancel']]); S.backFn = () => go('library');
    root.innerHTML = '<div class="page"><h1>' + (editing ? 'Edit app' : 'Add an app') + '</h1></div>';
    const form = el('div', 'form'), col = el('div', 'col'), prev = el('div', 'tile prev');
    const redraw = () => { prev.innerHTML = tileEl(d.cover ? d : { name: d.name || '?' }).innerHTML; };
    const fName = field('Name', d.name, { placeholder: 'e.g. Minecraft', onChange: v => { d.name = v; redraw(); } });
    const fPath = field('Path or link', d.exe, { placeholder: 'C:\\Games\\game.exe  or  steam://rungameid/...', onChange: v => { d.exe = v.replace(/^"|"$/g, ''); if (!d.name) { d.name = niceName(d.exe); fName.value = d.name; fName.innerHTML = '<span>Name</span><b>' + esc(d.name) + '</b>'; redraw(); } } });
    const fArgs = field('Launch options (optional)', d.args, { placeholder: 'e.g. -fullscreen', onChange: v => { d.args = v; } });
    const FSM = [['auto', 'Auto (recommended)'], ['stretch', 'Fill the screen'], ['aspect', 'Keep shape, black bars'], ['altenter', 'Press Alt+Enter'], ['f11', 'Press F11'], ['off', 'Leave it alone']];
    d.fs = d.fs || 'auto'; d.compat = !!d.compat;
    const fFs = nav(el('button', 'fld')), setFs = () => { fFs.innerHTML = '<span>Fullscreen</span><b>' + esc(FSM.find(x => x[0] === d.fs)[1]) + '</b>'; }; setFs();
    fFs.onclick = () => { const i = FSM.findIndex(x => x[0] === d.fs); d.fs = FSM[(i + 1) % FSM.length][0]; setFs(); };
    const fCo = nav(el('button', 'fld')), setCo = () => { fCo.innerHTML = '<span>Old game fixes</span><b>' + (d.compat ? 'On' : 'Off') + '</b>'; }; setCo();
    fCo.onclick = () => { d.compat = !d.compat; setCo(); };
    const row1 = el('div', 'btnrow'), br = nav(el('button', 'btn', 'Browse for file\u2026')), fc = nav(el('button', 'btn', 'Find cover art'));
    br.onclick = async () => { const f = await sk.pickFile('exe'); if (f) { d.exe = f; fPath.value = f; fPath.innerHTML = '<span>Path or link</span><b>' + esc(f) + '</b>'; if (!d.name) { d.name = niceName(f); fName.innerHTML = '<span>Name</span><b>' + esc(d.name) + '</b>'; fName.value = d.name; redraw(); } } };
    fc.onclick = () => findCover(d, redraw);
    row1.append(br, fc);
    const row2 = el('div', 'btnrow'), save = nav(el('button', 'btn p', 'Save')), cancel = nav(el('button', 'btn', 'Cancel'));
    cancel.onclick = () => go('library');
    save.onclick = async () => {
      if (!d.exe.trim()) { toast('Add a path or link first'); return; }
      d.name = (d.name || niceName(d.exe)).trim();
      const finish = () => { if (!editing) S.apps.push(d); saveApps(); toast(editing ? 'Saved' : d.name + ' added to your Library. Press X to pin it to Home.'); go('library', { focus: d.id }); };
      if (d.cover) { finish(); return; }
      const stop = busy('Finding cover art for ' + d.name + '\u2026'); const r = await sk.cover.auto(d.name);
      if (r.ok) { d.cover = r.file; d.fit = r.fit || 'fill'; stop(); finish(); return; }
      const ic = await sk.cover.icon(d.exe); if (ic.ok) { d.cover = ic.file; d.fit = 'icon'; } stop();
      findCover(d, finish, { note: 'No cover art found for ' + d.name, onCancel: finish });
    };
    row2.append(save, cancel);
    const tip = el('div', 'sub', 'Auto makes the game fullscreen for you, even older titles. If a game looks wrong, try another Fullscreen choice, or turn on Old game fixes for very old games.'); tip.style.cssText = 'color:var(--dim);font-size:.82rem;line-height:1.45';
    col.append(fName, fPath, fArgs, fFs, fCo, row1, tip, row2); form.append(col, prev); root.querySelector('.page').appendChild(form); redraw(); ensureFocus(root);
  }

  // ---------- web apps (SKchat / SKMusic) ----------
  function web(root, d) {
    const a = d.app, slot = S.players[S.active] ? S.active : 0, p = S.players[slot] || { u: 'guest' };
    hints([['S', 'Home (View)'], ['A', 'Click'], ['Y', 'Keyboard']]); S.backFn = () => go('home');
    const wrap = el('div', 'webwrap'), wv = document.createElement('webview');
    wv.setAttribute('src', a.url); wv.setAttribute('partition', 'persist:skbox-' + p.u); wv.setAttribute('allowpopups', 'false');
    wrap.appendChild(wv); root.appendChild(wrap);
    const setText = (t, send) => wv.executeJavaScript('(function(t,s){var e=document.activeElement;if(!e)return;if(e.isContentEditable){e.textContent=t;e.dispatchEvent(new Event("input",{bubbles:true}));}else{var pr=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,ds=Object.getOwnPropertyDescriptor(pr,"value");if(ds&&ds.set)ds.set.call(e,t);else e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}));}if(s){e.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));}})(' + JSON.stringify(t) + ',' + (send ? 'true' : 'false') + ')').catch(() => {});
    wv.addEventListener('dom-ready', async () => {
      wv.focus(); wv.send('active-pad', S.active);
      if (p.u !== 'guest') { const c = await sk.auth.cred(p.u); if (c) [1200, 3200, 6000].forEach(ms => setTimeout(() => { try { wv.executeJavaScript('(function(u,p){var a=document.getElementById("li-u"),b=document.getElementById("li-p");if(a&&b&&a.offsetParent&&!window._sessOn){a.value=u;b.value=p;["input","change"].forEach(function(t){a.dispatchEvent(new Event(t,{bubbles:true}));b.dispatchEvent(new Event(t,{bubbles:true}));});if(window.doLogin)window.doLogin();}})(' + JSON.stringify(c.u) + ',' + JSON.stringify(c.p) + ')').catch(() => {}); } catch (_) {} }, ms)); }
    });
    wv.addEventListener('ipc-message', e => {
      if (e.channel === 'home') go('home');
      else if (e.channel === 'osk') { const v = (e.args[0] && e.args[0].value) || ''; osk({ title: 'Type', value: v, canSend: true, onDone: (t, send) => { setText(t, send); wv.focus(); }, onCancel: () => wv.focus() }); }
    });
    wv.addEventListener('did-fail-load', ev => { if (ev.errorCode === -3 || !ev.isMainFrame) return; confirm('Can\u2019t reach ' + a.name, 'Check your Wi-Fi connection.', 'Retry', () => wv.reload()); });
    wv.addEventListener('console-message', () => {});
  }

  // ---------- settings ----------
  const NEWS = [
    ['SK menu over any fullscreen game', 'Press the Xbox / PS button in a game and the menu now opens as a full page, so it works with every kind of fullscreen. The controller works in it too. Want to see the game behind it? Settings > Xbox / PS button > Menu style.'],
    ['Library', 'On Home, open the Library tile. Press X on any app to pin or unpin it from Home. LB / RB changes the sort. Y has more options.'],
    ['Close a game', 'A red Close game button shows on Home while a game runs. It also lives in the SK menu and on Y.'],
    ['Bluetooth', 'Settings > Bluetooth (or the Bluetooth button on Home): scan, pair and forget devices without leaving SKBox.'],
    ['Screenshots', 'Take one from the SK menu, then look at them in Settings > Screenshots.'],
    ['Controller battery', 'Shown next to the controller icon on Home (Xbox controllers).'],
    ['Xbox / PS button help', 'Settings > Xbox / PS button shows if the button is being seen, and can take it back from Game Bar.']
  ];
  const BATLV = ['Empty', 'Low', 'Medium', 'Full'];
  const batText = () => { const b = (S.bat || {})[0]; if (!b || b.type === 0) return ''; if (b.type === 1) return 'Wired'; if (b.type === 255) return ''; return BATLV[b.level] || ''; };
  function showNews(root) {
    const L = el('div', 'layer'), b = el('div', 'box', '<h3>What\u2019s new in SKBox</h3>'), ul = el('ul', 'newlist');
    NEWS.forEach(([t, d]) => { const li = document.createElement('li'); li.innerHTML = '<b>' + esc(t) + '</b>: ' + esc(d); ul.appendChild(li); });
    const row = el('div', 'btnrow'), ok = nav(el('button', 'btn p', 'Got it')); ok.dataset.first = ''; ok.onclick = () => closeLayer(L); row.appendChild(ok); b.append(ul, row); L.appendChild(b); openLayer(L, () => closeLayer(L));
  }
  const CATS = [['wifi', '\u{1F4F6}', 'Wi-Fi'], ['controllers', '\u{1F3AE}', 'Controllers'], ['guide', '\u24E7', 'Xbox / PS button'], ['players', '\u{1F464}', 'Players'], ['apps', '\u{1F4E6}', 'Apps'], ['cozy', '\u2615', 'Backgrounds & sound'], ['display', '\u{1F3A8}', 'Display & startup'], ['bluetooth', '\u16D2', 'Bluetooth'], ['shots', '\u{1F4F8}', 'Screenshots'], ['sound', '\u{1F50A}', 'Sound'], ['power', '\u23FB', 'Power'], ['new', '\u2728', 'What\u2019s new'], ['about', '\u2139', 'About']];
  function settings(root, d) {
    hints([['A', 'Select'], ['B', 'Back']]); S.backFn = () => go('home');
    root.innerHTML = '<div class="page"><h1>Settings</h1></div>';
    const split = el('div', 'split'), menuE = el('div', 'menu'), pane = el('div', 'pane');
    split.append(menuE, pane); root.querySelector('.page').appendChild(split);
    let sel = d.cat || 'wifi', firstEl = null;
    const items = {};
    CATS.forEach(([id, ic, name]) => {
      const m = nav(el('button', 'mi', '<span>' + ic + '</span>' + name)); items[id] = m; if (id === sel) { m.classList.add('sel'); firstEl = m; }
      m._onfocus = () => { if (sel !== id || !pane.firstChild) { sel = id; Object.values(items).forEach(x => x.classList.remove('sel')); m.classList.add('sel'); panel(id, pane); } };
      m.onclick = () => { const f = pane.querySelector('[data-nav]'); if (f) focus(f); };
      menuE.appendChild(m);
    });
    firstEl.dataset.first = ''; panel(sel, pane); ensureFocus(root, firstEl);
  }
  const row = (title, sub, right, fn) => { const b = nav(el('button', 'item', '<div>' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div><div class="r">' + (right || '') + '</div>')); if (fn) b.onclick = fn; return b; };
  const toggle = (title, sub, on, fn) => { const b = row(title, sub, '<div class="tog' + (on ? ' on' : '') + '"></div>'); b.onclick = () => { on = !on; b.querySelector('.tog').classList.toggle('on', on); fn(on); }; return b; };
  const bars = s => '<span class="bars">' + [25, 50, 75, 100].map(t => '<i class="' + (s >= t - 12 ? 'on' : '') + '" style="height:' + (t / 100 * 16) + 'px"></i>').join('') + '</span>';
  function panel(id, pane) {
    clearInterval(clockTimer); pane.innerHTML = ''; const h = t => { const x = el('h2', '', t); pane.appendChild(x); }, sub = t => pane.appendChild(el('div', 'sub', t));
    if (id === 'wifi') {
      h('Wi-Fi'); const st = el('div', 'sub', 'Checking\u2026'); pane.appendChild(st); const list = el('div');
      const refresh = async () => { const s = await sk.wifi.status(); st.textContent = s.connected ? 'Connected to ' + s.ssid + ' (' + s.signal + '%)' : 'Not connected'; };
      const scan = async () => {
        list.innerHTML = '<div class="sub">Scanning for networks\u2026</div>'; const r = await sk.wifi.scan(); list.innerHTML = '';
        if (!r.ok) { list.innerHTML = '<div class="sub">' + esc(r.error) + '</div>'; return; }
        if (!r.nets.length) { list.innerHTML = '<div class="sub">No networks found.</div>'; return; }
        r.nets.forEach(n => list.appendChild(row(n.ssid, (n.secured ? 'Secured' : 'Open') + (n.known ? ' \u00B7 Saved' : ''), bars(n.signal) + (n.secured ? ' \u{1F512}' : ''), () => {
          const go2 = async pw => { const stop = busy('Connecting to ' + n.ssid + '\u2026'); const x = await sk.wifi.connect({ ssid: n.ssid, password: pw, auth: n.auth }); stop(); toast(x.ok ? 'Connected to ' + n.ssid : x.error); refresh(); };
          if (n.secured && !n.known) osk({ title: 'Password for ' + n.ssid, secret: true, submitLabel: 'Connect', onDone: pw => pw && go2(pw) }); else go2('');
        })));
      };
      const top = el('div', 'btnrow'), sb = nav(el('button', 'btn p', 'Scan again')), db = nav(el('button', 'btn', 'Disconnect'));
      sb.onclick = scan; db.onclick = async () => { await sk.wifi.disconnect(); toast('Disconnected'); refresh(); }; top.append(sb, db); pane.append(top, el('div', '', '<div style="height:1rem"></div>'), list); refresh(); scan();
    } else if (id === 'controllers') {
      h('Controllers'); sub('Press any button on a controller to wake it. Controller 1 is Player 1, controller 2 is Player 2.');
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      if (!pads.length) pane.appendChild(el('div', 'sub', 'No controllers detected yet.'));
      pads.forEach(p => { pane.appendChild(row('Controller ' + (p.index + 1) + ' \u00B7 Player ' + (p.index < 2 ? p.index + 1 : '-'), (p.id || '').slice(0, 70), 'Test rumble', () => { try { const a = p.vibrationActuator; a && a.playEffect('dual-rumble', { duration: 500, strongMagnitude: 1, weakMagnitude: .6 }); toast('Rumble sent'); } catch (_) { toast('This controller has no rumble.'); } })); });
      pane.appendChild(el('div', '', '<div style="height:1rem"></div>'));
      pane.appendChild(row('Pair a Bluetooth controller', 'Pair it right here in SKBox. Hold the controller\u2019s pairing button until its light flashes.', '\u2192', () => go('settings', { cat: 'bluetooth' })));
      pane.appendChild(row('Xbox / PlayStation controller by cable', 'USB controllers work instantly.', ''));
    } else if (id === 'players') {
      h('Players'); sub('Player 1 uses controller 1. Player 2 uses controller 2 and presses Start to join.');
      [0, 1].forEach(i => { const p = S.players[i];
        pane.appendChild(row('Player ' + (i + 1), p ? '@' + p.u + (p.stats ? ' \u00B7 ' + p.stats.playlists + ' playlists \u00B7 ' + p.stats.loved + ' liked songs' : '') : 'Empty', p ? esc(p.nick || p.u) : 'Add', () => go('profiles', { slot: i })));
        if (p) pane.appendChild(row('Change picture for Player ' + (i + 1), 'Wild West, Blocky World, Neon City and Cozy icons, or your own image', '\u{1F5BC}', () => pfpPicker(i)));
        if (p && i === 1) pane.appendChild(row('Remove Player 2', '', '', () => { S.players[1] = null; S.active = 0; saveSettings(); go('settings', { cat: 'players' }); })); });
      pane.appendChild(row('Add a profile', 'Sign in with another SKchat account', '+', () => signInFlow(S.players[0] ? 1 : 0)));
      S.profiles.forEach(p => pane.appendChild(row('Remove @' + p.u, 'Signs this profile out of SKBox', '', () => confirm('Remove @' + p.u + '?', 'You can add it again any time.', 'Remove', async () => { await sk.auth.remove(p.u); S.profiles = S.profiles.filter(x => x.u !== p.u); S.players = S.players.map(x => x && x.u === p.u ? null : x); rememberPlayers(); go(S.players[0] ? 'settings' : 'profiles', { cat: 'players', slot: 0 }); }, true))));
    } else if (id === 'apps') {
      h('Apps'); sub('Add a game or program by its file path. SKBox finds cover art for you.');
      pane.appendChild(row('Add an app', '', '+', () => go('addApp')));
      S.apps.forEach(a => { pane.appendChild(row(a.name, a.exe + (isPinned(a) ? ' \u00B7 on Home' : ''), 'Edit', () => go('addApp', { app: a }))); });
      pane.appendChild(row('Open Library', 'Pin or unpin apps on the Home screen', '\u2192', () => go('library')));
      if (!S.apps.length) pane.appendChild(el('div', 'sub', 'No apps yet.'));
    } else if (id === 'cozy') {
      h('Backgrounds & sound'); sub('Pick a wallpaper. The music and sounds are made inside SKBox, so they work offline.');
      const grid = el('div', 'bgrid'), cur = S.settings.bg || 'dynamic';
      BGS.forEach(([key, name]) => {
        const b = nav(el('button', 'bgt' + (key === 'dynamic' ? ' dyn' : '') + (cur === key ? ' sel' : ''), key === 'dynamic' ? 'Dynamic<br>(follows the app you pick)' : '<small>' + esc(name) + '</small>'));
        if (key !== 'dynamic') b.style.backgroundImage = 'url("assets/bg/' + key + '.jpg")';
        b.onclick = () => { setBgChoice(key); [...grid.children].forEach(x => x.classList.remove('sel')); b.classList.add('sel'); refreshMoods && refreshMoods(); };
        grid.appendChild(b);
      });
      const own = nav(el('button', 'bgt dyn', 'Use my own image\u2026')); own.onclick = async () => { const f = await sk.pickFile('image'); if (!f) return; const r = await sk.cover.copy(f); if (r.ok) { setBgChoice('file:' + r.file); [...grid.children].forEach(x => x.classList.remove('sel')); own.classList.add('sel'); } };
      grid.appendChild(own); pane.appendChild(grid);
      const A = window.K.audio; let refreshMoods = null;
      pane.appendChild(toggle('Cozy music', 'Soft generated music while you browse', S.settings.music !== false, v => { S.settings.music = v; saveSettings(); A && A.apply(); }));
      const slider = (title, key, def, fn) => { const b = row(title, '', ''); b.querySelector('.r').innerHTML = '<span class="val"></span><div class="slider"><i></i></div>'; const get = () => S.settings[key] == null ? def : S.settings[key], upd = () => { b.querySelector('.val').textContent = get() + '%'; b.querySelector('i').style.width = get() + '%'; }; b._adjust = d => { S.settings[key] = Math.max(0, Math.min(100, get() + d * 10)); saveSettings(); upd(); fn(S.settings[key]); }; b.onclick = () => b._adjust(get() >= 100 ? -10 : 1); upd(); return b; };
      pane.appendChild(slider('Music volume', 'musicVol', 50, () => A && A.apply()));
      const moodRows = [];
      (A ? A.moods() : []).forEach(([mid, mname]) => { const r = row(mname, '', '', () => { S.settings.mood = mid; S.settings.music = true; saveSettings(); A.apply(); toast('\u266A ' + mname); refreshMoods(); }); moodRows.push([mid, r]); pane.appendChild(r); });
      refreshMoods = () => moodRows.forEach(([mid, r]) => { r.querySelector('.r').textContent = (S.settings.mood || 'campfire') === mid && S.settings.music !== false ? '\u266A Playing' : ''; }); refreshMoods();
      pane.appendChild(toggle('Match music to the background', 'Picking a wallpaper picks music to go with it', S.settings.autoMood !== false, v => { S.settings.autoMood = v; saveSettings(); }));
      pane.appendChild(toggle('Sound effects', 'Soft clicks and chimes when you move around', S.settings.sfx !== false, v => { S.settings.sfx = v; saveSettings(); A && A.play('toggle'); }));
      pane.appendChild(slider('Sound effects volume', 'sfxVol', 60, () => A && A.play('ok')));
      pane.appendChild(toggle('Floating sparkles', 'Slow drifting lights over the background', S.settings.fx !== false, v => { S.settings.fx = v; saveSettings(); buildFx(); }));
    } else if (id === 'display') {
      h('Display & startup'); sub('Accent color');
      const sw = el('div', 'swrow'); ACCENTS.forEach(c => { const b = nav(el('button', 'sw' + (c === (S.settings.accent || ACCENTS[0]) ? ' sel' : ''))); b.style.background = c; b.onclick = () => { S.settings.accent = c; saveSettings(); applyTheme(); [...sw.children].forEach(x => x.classList.remove('sel')); b.classList.add('sel'); }; sw.appendChild(b); }); pane.appendChild(sw);
      sk.info().then(i => { pane.appendChild(toggle('Start SKBox when Windows starts', 'Boots straight into SKBox like a console', i.startup !== false && S.settings.startup !== false, v => { sk.sys.startup(v); S.settings.startup = v; })); });
      pane.appendChild(toggle('Fullscreen console mode', 'Turn off to use SKBox in a window', !S.settings.windowed, v => { S.settings.windowed = !v; sk.sys.kiosk(v); }));
      pane.appendChild(toggle('Reduce motion', 'Turns off animations', !!S.settings.calm, v => { S.settings.calm = v; saveSettings(); applyTheme(); }));
    } else if (id === 'bluetooth') {
      h('Bluetooth'); sub('Pair controllers, headphones, speakers and keyboards without leaving SKBox. Put the device in pairing mode first (hold its pairing button until the light flashes).');
      const mine = el('div'), near = el('div'), msg = el('div', 'sub', ''); let busyNow = false;
      const kindIcon = n => /controller|gamepad|xbox|dualsense|dualshock|wireless controller|pro con|joy-con/i.test(n) ? '\u{1F3AE}' : /head|buds|pods|speaker|audio|sound|jbl|bose|sony wh|wf-|airpod/i.test(n) ? '\u{1F3A7}' : /keyboard|mouse|k\d/i.test(n) ? '\u2328' : '\u16D2';
      const draw = (box, devs, paired) => {
        box.innerHTML = ''; if (!devs.length) { box.appendChild(el('div', 'sub', paired ? 'No paired devices yet.' : 'Nothing new found. Make sure the device is in pairing mode, then Scan again.')); return; }
        devs.forEach(d => box.appendChild(row(kindIcon(d.name) + '  ' + d.name, d.paired ? (d.connected ? 'Connected' : 'Paired \u00B7 not connected right now') : 'Ready to pair', d.paired ? 'Forget' : 'Pair', () => {
          if (busyNow) return;
          if (d.paired) confirm('Forget ' + d.name + '?', 'You will need to pair it again to use it.', 'Forget', async () => { busyNow = true; const stop = busy('Removing ' + d.name + '\u2026'); const r = await sk.bt.unpair(d.id); stop(); busyNow = false; toast(r.ok ? d.name + ' removed' : (r.message || r.error || 'Could not remove it.')); loadMine(); }, true);
          else (async () => { busyNow = true; const stop = busy('Pairing with ' + d.name + '\u2026'); const r = await sk.bt.pair(d.id); stop(); busyNow = false; toast(r.ok ? d.name + ' paired!' : (r.message || r.error || 'Could not pair.')); if (r.ok) { loadMine(); scan(); } })();
        })));
      };
      const loadMine = async () => { mine.innerHTML = '<div class="sub">Looking for paired devices\u2026</div>'; const r = await sk.bt.list(); if (S.screen !== 'settings') return; if (!r.ok) { mine.innerHTML = ''; mine.appendChild(el('div', 'sub', r.error || 'Could not read Bluetooth.')); return; } draw(mine, r.devices || [], true); };
      const scan = async () => { if (busyNow) return; busyNow = true; near.innerHTML = '<div class="sub">Scanning nearby devices (about 10 seconds)\u2026</div>'; const r = await sk.bt.scan(); busyNow = false; if (S.screen !== 'settings') return; if (!r.ok) { near.innerHTML = ''; near.appendChild(el('div', 'sub', r.error || 'Scan failed.')); return; } draw(near, (r.devices || []).filter(d => !d.paired), false); };
      const bar = el('div', 'btnrow'), sb = nav(el('button', 'btn p', 'Scan for devices')), wb = nav(el('button', 'btn', 'Open Windows Bluetooth'));
      sb.onclick = scan; wb.onclick = () => sk.sys.openSettings('bluetooth'); bar.append(sb, wb); pane.appendChild(bar);
      pane.appendChild(el('h2', '', 'Paired')); pane.appendChild(mine); pane.appendChild(el('h2', '', 'Nearby')); pane.appendChild(near); pane.appendChild(el('div', 'sub', 'Devices that need a PIN (some keyboards) must be paired with \u201COpen Windows Bluetooth\u201D.'));
      loadMine(); near.innerHTML = '<div class="sub">Press \u201CScan for devices\u201D to look for new ones.</div>';
    } else if (id === 'shots') {
      h('Screenshots'); sub('Take one from the SK menu while you play. They are saved in Pictures\\SKBox.');
      const bar = el('div', 'btnrow'), fb = nav(el('button', 'btn', 'Open folder')); fb.onclick = () => sk.shots.folder(); bar.appendChild(fb); pane.appendChild(bar);
      const grid = el('div', 'shots'); pane.appendChild(grid);
      sk.shots.list().then(list => {
        if (!grid.isConnected) return; if (!list.length) { grid.replaceWith(el('div', 'sub', 'No screenshots yet.')); return; }
        list.forEach(f => {
          const t = nav(el('button', 'shot', '<small>' + esc(new Date(f.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</small>')); t.style.backgroundImage = 'url("' + fileUrl(f.file) + '")';
          t.onclick = () => {
            const L = el('div', 'layer'), b = el('div', 'box'), img = el('div', 'bigshot'), row = el('div', 'btnrow'), c = nav(el('button', 'btn p', 'Close')), d = nav(el('button', 'btn d', 'Delete'));
            img.style.backgroundImage = 'url("' + fileUrl(f.file) + '")'; c.dataset.first = ''; c.onclick = () => closeLayer(L);
            d.onclick = () => { closeLayer(L); confirm('Delete this screenshot?', 'It will be removed from your PC.', 'Delete', async () => { await sk.shots.remove(f.file); go('settings', { cat: 'shots' }); }, true); };
            row.append(c, d); b.append(img, row); L.appendChild(b); openLayer(L, () => closeLayer(L));
          };
          grid.appendChild(t);
        });
      });
    } else if (id === 'new') {
      h('What\u2019s new'); NEWS.forEach(([t, d]) => pane.appendChild(row(t, d, '', null)));
    } else if (id === 'guide') {
      h('Xbox / PlayStation button'); sub('This button opens the SK menu over your game. If it does nothing, check the list below.');
      const box = el('div'); pane.appendChild(box);
      const show = async () => {
        const hs = await sk.helper.status(); if (S.screen !== 'settings' || !box.isConnected) return; box.innerHTML = '';
        box.appendChild(row('Controller helper', hs.ready ? 'Running' : (hs.error ? 'Not running: ' + hs.error : 'Not running yet. It needs Windows with PowerShell.'), hs.ready ? '\u2714' : '\u26A0', null));
        box.appendChild(row('Controllers seen', 'Xbox and PlayStation controllers', String(hs.pads || 0), null));
        const bt0 = (hs.batteries || {})[0]; if (bt0 && bt0.type !== 0 && bt0.type !== 255) box.appendChild(row('Controller battery', bt0.type === 1 ? 'Plugged in' : 'Battery level', bt0.type === 1 ? '' : (BATLV[bt0.level] || ''), null));
        box.appendChild(row('Button presses seen', hs.guides ? 'Last press ' + fmtAgo(hs.lastGuide) : 'Press the Xbox / PS button now. This number should go up.', String(hs.guides || 0), null));
        (hs.diag || []).slice(-3).forEach(l => box.appendChild(row('Debug', l, '', null)));
      };
      box.appendChild(el('div', 'sub', 'Checking\u2026')); show(); clockTimer = setInterval(show, 1200);
      const MODES = [['auto', 'Automatic', 'Full page while a game runs. Works with every kind of fullscreen.'], ['full', 'Always a full page', 'Never see-through.'], ['over', 'Over the game', 'See-through, like an overlay. Only works if the game is Borderless or Windowed.']];
      const mrow = row('Menu style', '', 'Change', null); const setMode = () => { const m = MODES.find(x => x[0] === (S.settings.ovMode || 'auto')) || MODES[0]; mrow.firstChild.innerHTML = esc('Menu style: ' + m[1]) + '<small>' + esc(m[2]) + '</small>'; };
      mrow.onclick = () => { const i = MODES.findIndex(x => x[0] === (S.settings.ovMode || 'auto')); S.settings.ovMode = MODES[(i + 1) % MODES.length][0]; saveSettings(); setMode(); }; setMode(); pane.appendChild(mrow);
      pane.appendChild(row('Open the SK menu now', 'Test that the menu works, without the button', '\u2192', () => sk.helper.testMenu()));
      sk.helper.status().then(hs => pane.appendChild(toggle('Take the Xbox button from Game Bar', 'Turns off \u201COpen Xbox Game Bar using this button\u201D in Windows so SKBox gets the press. Turn off to give it back.', hs.takeGuide !== false, v => { S.settings.takeGuide = v; sk.sys.takeGuide(v); toast(v ? 'Done. If it still opens Game Bar, restart SKBox.' : 'Game Bar has the button again.'); })));
      pane.appendChild(row('No guide button on your controller?', 'Hold Start + Back (Xbox) or Share + Options (PlayStation) for 1 second. LB + RB + Back also works. Keyboard: Ctrl+Shift+O.', '', null));
      pane.appendChild(row('Menu does not show over a game?', 'The game must not use \u201Cexclusive fullscreen\u201D. Set the game to Borderless or Windowed, or leave SKBox Fullscreen on Auto.', '', null));
    } else if (id === 'sound') {
      h('Sound');
      pane.appendChild(row('Volume up', '', '+', () => sk.sys.volume('up'))); pane.appendChild(row('Volume down', '', '\u2212', () => sk.sys.volume('down'))); pane.appendChild(row('Mute / unmute', '', '', () => sk.sys.volume('mute')));
      pane.appendChild(row('Windows sound settings', 'Choose speakers, TV or headphones', '\u2192', () => sk.sys.openSettings('sound')));
      pane.appendChild(row('Bluetooth headphones & speakers', 'Pair them in SKBox, then pick them in Windows sound settings', '\u2192', () => go('settings', { cat: 'bluetooth' })));
    } else if (id === 'power') {
      h('Power'); const P = [['Sleep', 'sleep'], ['Restart', 'restart'], ['Shut down', 'shutdown'], ['Sign out of Windows', 'logoff'], ['Exit SKBox to desktop', 'quit']];
      P.forEach(([n, k]) => pane.appendChild(row(n, '', '', () => confirm(n + '?', k === 'quit' ? 'Press Ctrl+Shift+B or use the tray icon to bring SKBox back.' : 'Anything unsaved will be lost.', n, () => sk.sys.power(k), k !== 'sleep'))));
    } else {
      h('About SKBox'); sk.info().then(i => { sub('Version ' + i.version + ' \u00B7 SKBox by SK. If this is older than the version you expect, your update has not been published or installed yet.'); });
      sk.info().then(i => { pane.appendChild(row('Game helper', i.helper ? 'Running: fullscreen and the SK menu are active' : 'Not running. Fullscreen and the SK menu need Windows', '', null)); });
      pane.appendChild(row('SK menu in a game', 'Press the Xbox button or PlayStation button (or Ctrl+Shift+O)', '', null));
      pane.appendChild(row('Return to SKBox from an app', 'Press Ctrl+Shift+B, or click the SKBox tray icon', '', null));
      pane.appendChild(row('Updates', 'SKBox updates itself when you are online', '', null));
    }
  }

  go('boot');
  window.K.startPads();
})();
