// SKBox screens
(function () {
  'use strict';
  const { sk, S, $, el, esc, nav, fileUrl, toast, hints, focus, ensureFocus, openLayer, closeLayer, confirm, menu, busy, osk, field, setBg } = window.K;
  const BUILTIN = [
    { id: 'skchat', name: 'SKchat', kind: 'web', url: 'https://sksmpchat.netlify.app/chat', art: 'assets/skchat.png', grad: 'linear-gradient(160deg,#0e4a5c,#0b1020)', tag: 'Chat, calls and friends' },
    { id: 'skmusic', name: 'SKMusic', kind: 'web', url: 'https://sksmpchat.netlify.app/skmusic', art: 'assets/skmusic.png', grad: 'linear-gradient(160deg,#6b1fa0,#14081f)', tag: 'Music, radios and playlists' }
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
    ({ boot, welcome, profiles, home, settings, addApp, web }[name])(root, data || {});
  }
  window.K.go = go;

  // ---------- boot ----------
  function boot(root) {
    hints([]); setBg('');
    root.innerHTML = '<div class="center"><div class="logo">SKBOX</div><div style="color:var(--dim)">Starting up\u2026</div></div>';
    (async () => {
      S.settings = (await sk.store.get('settings', {})) || {}; S.apps = (await sk.store.get('apps', [])) || [];
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
    root.innerHTML = '<div class="center"><h1 style="font-size:2.4rem">' + (slot ? 'Player 2: who\u2019s playing?' : 'Who\u2019s playing?') + '</h1></div>';
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
  const tiles = () => BUILTIN.concat(S.apps, [{ add: true }]);
  function tileEl(a) {
    const t = nav(el('button', 'tile' + (a.add ? ' add' : '')));
    let art;
    if (a.add) art = '<div class="art">+</div>';
    else if (a.cover) art = '<div class="art" style="background-image:url(\'' + fileUrl(a.cover) + '\')"></div>';
    else if (a.art) art = '<div class="art" style="background:' + a.grad + '"><img src="' + a.art + '" alt=""></div>';
    else art = '<div class="art" style="background:' + gradFor(a.name) + '"><span class="ltr">' + esc((a.name || '?')[0].toUpperCase()) + '</span></div>';
    t.innerHTML = art; return t;
  }
  function home(root) {
    hints([['A', 'Open'], ['Y', 'Options'], ['S', 'Settings']]);
    S.startFn = () => go('settings'); S.backFn = null;
    const top = el('div', 'top'), left = el('div', 'grp'), right = el('div', 'grp');
    [0, 1].forEach(i => {
      const p = S.players[i];
      if (p) { const c = nav(el('button', 'chip', avatar(p) + '<span>' + esc(p.nick || p.u) + '</span><span class="pn">P' + (i + 1) + '</span>')); c.onclick = () => go('settings', { cat: 'players' }); c._onopts = () => pfpPicker(i); left.appendChild(c); }
      else if (i === 1) { const c = nav(el('button', 'chip', '<div class="av">+</div><span>Add Player 2</span>')); c.onclick = () => go('profiles', { slot: 1 }); left.appendChild(c); }
    });
    const wifiB = nav(el('button', 'ibtn', '<span id="wf">\u{1F4F6}</span><span id="wfn" style="font-size:.85rem;color:var(--dim)"></span>')); wifiB.onclick = () => go('settings', { cat: 'wifi' });
    const pad = el('div', 'ibtn', '\u{1F3AE} <span id="padn">0</span>'); pad.style.cursor = 'default';
    const clk = el('div', 'clock'); const setB = nav(el('button', 'ibtn', '\u2699')); setB.onclick = () => go('settings'); const pw = nav(el('button', 'ibtn', '\u23FB')); pw.onclick = () => go('settings', { cat: 'power' });
    right.append(wifiB, pad, clk, setB, pw); top.append(left, right);
    const wrap = el('div', 'home'), row = el('div', 'row'), info = el('div', 'info');
    wrap.append(row, info); root.append(top, wrap);
    const list = tiles(), els = [];
    list.forEach((a, i) => {
      const t = tileEl(a); els.push(t);
      t._onfocus = () => {
        S.lastTile = i;
        if (a.add) { info.innerHTML = '<h1>Add an app</h1><p>Link a game or program from this PC. Cover art is found for you.</p>'; setBg(''); }
        else { info.innerHTML = '<h1>' + esc(a.name) + '</h1><p>' + esc(a.tag || a.exe || '') + '</p><div class="go"><i class="key k-A">A</i> ' + (a.kind === 'web' ? 'Open' : 'Play') + '</div>'; setBg(a.cover ? fileUrl(a.cover) : ''); }
      };
      t.onclick = () => a.add ? go('addApp') : openApp(a);
      if (!a.add && !a.kind) t._onopts = () => appOptions(a); else if (!a.add) t._onopts = () => toast('Built-in app');
      row.appendChild(t);
    });
    const tick = () => { clk.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); const n = (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean).length : 0); const e = $('#padn'); if (e) e.textContent = n; };
    tick(); clockTimer = setInterval(tick, 4000);
    const wf = async () => { const s = await sk.wifi.status(); const w = $('#wf'), n = $('#wfn'); if (!w) return; w.style.opacity = s.connected ? 1 : .4; n.textContent = s.connected ? s.ssid : 'Offline'; };
    wf(); wifiTimer = setInterval(wf, 25000);
    ensureFocus(root, els[Math.min(S.lastTile || 0, els.length - 1)]);
  }
  K.onPad = (a, idx) => { // Player 2 joins with Start
    if (S.screen === 'home' && idx === 1 && !S.players[1] && a === 'start') { go('profiles', { slot: 1 }); }
  };
  function appOptions(a) {
    menu(a.name, [
      { label: 'Play', fn: () => openApp(a) }, { label: 'Change cover art', fn: () => findCover(a, () => { saveApps(); go('home'); }) },
      { label: 'Edit name and path', fn: () => go('addApp', { app: a }) },
      { label: 'Remove', fn: () => confirm('Remove ' + a.name + '?', 'This only removes the tile. Your files are not touched.', 'Remove', () => { S.apps = S.apps.filter(x => x.id !== a.id); if (a.cover) sk.cover.remove(a.cover); saveApps(); go('home'); }, true) }
    ]);
  }
  async function openApp(a) {
    if (a.kind === 'web') { go('web', { app: a }); return; }
    const stop = busy('Launching ' + a.name + '\u2026'); const r = await sk.launch({ exe: a.exe, args: a.args }); setTimeout(stop, 700);
    if (!r.ok) toast(r.error || 'Could not launch.');
  }
  sk.on('launch-error', m => toast('Could not start: ' + m));
  sk.on('returned', () => { const e = window.K.current(); });
  sk.on('update-ready', v => confirm('Update ready', 'SKBox ' + v + ' has been downloaded.', 'Restart now', () => sk.installUpdate()));

  // ---------- add / edit app ----------
  const niceName = p => String(p || '').replace(/^.*[\\/]/, '').replace(/\.(exe|lnk|bat|cmd)$/i, '').replace(/[_\-.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  async function findCover(d, done) {
    const stop = busy('Looking for cover art\u2026'); const list = await sk.cover.candidates(d.name || niceName(d.exe)); stop();
    if (!list.length) { toast('No matches. Try renaming the app.'); return; }
    const L = el('div', 'layer'), b = el('div', 'box', '<h3>Choose cover art</h3>'), g = el('div', 'covers');
    list.slice(0, 8).forEach((c, i) => { const t = nav(el('button', 'cv', '<small>' + esc(c.name) + '</small>')); t.style.backgroundImage = 'url("' + c.preview + '")'; if (i === 0) t.dataset.first = ''; t.onclick = async () => { closeLayer(L); const s2 = busy('Downloading\u2026'); const r = await sk.cover.pick(c.id); s2(); if (r.ok) { if (d.cover && d.cover !== r.file) sk.cover.remove(d.cover); d.cover = r.file; done && done(); } else toast('Could not download that one.'); }; g.appendChild(t); });
    const img = nav(el('button', 'btn', 'Use my own image\u2026')); img.onclick = async () => { const f = await sk.pickFile('image'); if (!f) return; closeLayer(L); const r = await sk.cover.copy(f); if (r.ok) { d.cover = r.file; done && done(); } };
    b.append(g, img); L.appendChild(b); openLayer(L, () => closeLayer(L));
  }
  function addApp(root, data) {
    const editing = data.app, d = editing ? editing : { id: 'app_' + Date.now().toString(36), name: '', exe: '', args: '', cover: '' };
    hints([['A', 'Select'], ['B', 'Cancel']]); S.backFn = () => go('home');
    root.innerHTML = '<div class="page"><h1>' + (editing ? 'Edit app' : 'Add an app') + '</h1></div>';
    const form = el('div', 'form'), col = el('div', 'col'), prev = el('div', 'tile prev');
    const redraw = () => { prev.innerHTML = tileEl(d.cover ? d : { name: d.name || '?' }).innerHTML; };
    const fName = field('Name', d.name, { placeholder: 'e.g. Minecraft', onChange: v => { d.name = v; redraw(); } });
    const fPath = field('Path or link', d.exe, { placeholder: 'C:\\Games\\game.exe  or  steam://rungameid/...', onChange: v => { d.exe = v.replace(/^"|"$/g, ''); if (!d.name) { d.name = niceName(d.exe); fName.value = d.name; fName.innerHTML = '<span>Name</span><b>' + esc(d.name) + '</b>'; redraw(); } } });
    const fArgs = field('Launch options (optional)', d.args, { placeholder: 'e.g. -fullscreen', onChange: v => { d.args = v; } });
    const row1 = el('div', 'btnrow'), br = nav(el('button', 'btn', 'Browse for file\u2026')), fc = nav(el('button', 'btn', 'Find cover art'));
    br.onclick = async () => { const f = await sk.pickFile('exe'); if (f) { d.exe = f; fPath.value = f; fPath.innerHTML = '<span>Path or link</span><b>' + esc(f) + '</b>'; if (!d.name) { d.name = niceName(f); fName.innerHTML = '<span>Name</span><b>' + esc(d.name) + '</b>'; fName.value = d.name; redraw(); } } };
    fc.onclick = () => { if (!d.name && !d.exe) { toast('Enter a name first'); return; } findCover(d, redraw); };
    row1.append(br, fc);
    const row2 = el('div', 'btnrow'), save = nav(el('button', 'btn p', 'Save')), cancel = nav(el('button', 'btn', 'Cancel'));
    cancel.onclick = () => go('home');
    save.onclick = async () => {
      if (!d.exe.trim()) { toast('Add a path or link first'); return; }
      d.name = (d.name || niceName(d.exe)).trim();
      if (!d.cover) { const stop = busy('Finding cover art for ' + d.name + '\u2026'); let r = await sk.cover.auto(d.name); if (!r.ok) r = await sk.cover.icon(d.exe); stop(); if (r.ok) d.cover = r.file; else toast('No cover art found. You can add one later.'); }
      if (!editing) S.apps.push(d); saveApps(); toast(editing ? 'Saved' : d.name + ' added'); go('home');
    };
    row2.append(save, cancel);
    col.append(fName, fPath, fArgs, row1, row2); form.append(col, prev); root.querySelector('.page').appendChild(form); redraw(); ensureFocus(root);
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
  const CATS = [['wifi', '\u{1F4F6}', 'Wi-Fi'], ['controllers', '\u{1F3AE}', 'Controllers'], ['players', '\u{1F464}', 'Players'], ['apps', '\u{1F4E6}', 'Apps'], ['cozy', '\u2615', 'Backgrounds & sound'], ['display', '\u{1F3A8}', 'Display & startup'], ['sound', '\u{1F50A}', 'Sound & Bluetooth'], ['power', '\u23FB', 'Power'], ['about', '\u2139', 'About']];
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
    pane.innerHTML = ''; const h = t => { const x = el('h2', '', t); pane.appendChild(x); }, sub = t => pane.appendChild(el('div', 'sub', t));
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
      pane.appendChild(row('Pair a Bluetooth controller', 'Opens Windows Bluetooth settings. Hold the controller\u2019s pairing button until its light flashes.', '\u2192', () => { sk.sys.openSettings('bluetooth'); }));
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
      S.apps.forEach(a => { pane.appendChild(row(a.name, a.exe, 'Edit', () => go('addApp', { app: a }))); });
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
    } else if (id === 'sound') {
      h('Sound & Bluetooth');
      pane.appendChild(row('Volume up', '', '+', () => sk.sys.volume('up'))); pane.appendChild(row('Volume down', '', '\u2212', () => sk.sys.volume('down'))); pane.appendChild(row('Mute / unmute', '', '', () => sk.sys.volume('mute')));
      pane.appendChild(row('Windows sound settings', 'Choose speakers, TV or headphones', '\u2192', () => sk.sys.openSettings('sound')));
      pane.appendChild(row('Bluetooth devices', 'Pair controllers, headphones and more', '\u2192', () => sk.sys.openSettings('bluetooth')));
    } else if (id === 'power') {
      h('Power'); const P = [['Sleep', 'sleep'], ['Restart', 'restart'], ['Shut down', 'shutdown'], ['Sign out of Windows', 'logoff'], ['Exit SKBox to desktop', 'quit']];
      P.forEach(([n, k]) => pane.appendChild(row(n, '', '', () => confirm(n + '?', k === 'quit' ? 'Press Ctrl+Shift+B or use the tray icon to bring SKBox back.' : 'Anything unsaved will be lost.', n, () => sk.sys.power(k), k !== 'sleep'))));
    } else {
      h('About SKBox'); sk.info().then(i => { sub('Version ' + i.version + ' \u00B7 SKBox by SK'); });
      pane.appendChild(row('Return to SKBox from an app', 'Press Ctrl+Shift+B, or click the SKBox tray icon', '', null));
      pane.appendChild(row('Updates', 'SKBox updates itself when you are online', '', null));
    }
  }

  go('boot');
  window.K.startPads();
})();
