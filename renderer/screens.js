// SKBox screens
(function () {
  'use strict';
  const K = window.K, { sk, S, $, el, esc, nav, fileUrl, toast, hints, focus, ensureFocus, openLayer, closeLayer, confirm, menu, busy, osk, field, setBg } = window.K;
  const BUILTIN = [
    { id: 'skchat', name: 'SKchat', kind: 'web', url: 'https://sksmpchat.netlify.app/chat', art: 'assets/skchat.png', grad: 'linear-gradient(160deg,#0e4a5c,#0b1020)', tag: 'Chat, calls and friends' },
    { id: 'skmusic', name: 'SKMusic', kind: 'music', url: 'https://sksmpchat.netlify.app/skmusic', art: 'assets/skmusic.png', grad: 'linear-gradient(160deg,#6b1fa0,#14081f)', tag: 'Keeps playing while you game' },
    { id: 'skbrowse', name: 'SKBrowse', kind: 'browse', url: '', art: 'assets/skbrowse.png', grad: 'linear-gradient(160deg,#0b6e8f,#081425)', tag: 'Web, shows, ad block and extensions' }
  ];
  const PACKS = [
    { id: 'west', name: 'Wild West', items: [['west_hat', 'Sunset Hat'], ['west_star', 'Sheriff Star'], ['west_shoe', 'Lucky Horseshoe'], ['west_cactus', 'Cactus'], ['west_mesa', 'Canyon'], ['west_boot', 'Boot']] },
    { id: 'blocks', name: 'Blocky World', items: [['blocks_grass', 'Grass Block'], ['blocks_pick', 'Pickaxe'], ['blocks_gem', 'Gem'], ['blocks_tree', 'Tree'], ['blocks_sword', 'Sword'], ['blocks_heart', 'Heart']] },
    { id: 'city', name: 'Neon City', items: [['city_palm', 'Neon Palm'], ['city_car', 'Night Drive'], ['city_shades', 'Shades'], ['city_sky', 'Skyline'], ['city_coin', 'Coin'], ['city_vinyl', 'Vinyl']] },
    { id: 'cozy', name: 'Cozy', items: [['cozy_fire', 'Campfire'], ['cozy_mug', 'Hot Cocoa'], ['cozy_cabin', 'Cabin'], ['cozy_cat', 'Moon Cat'], ['cozy_shroom', 'Mushroom'], ['cozy_plant', 'Plant']] }
  ];
  const BGS = [['dynamic', 'Dynamic'], ['west_dusk', 'Wild West Dusk'], ['blocks_day', 'Blocky Meadow'], ['neon_city', 'Neon City'], ['cabin_night', 'Cabin Night'], ['rainy_window', 'Rainy Window'], ['campfire', 'Campfire'], ['aurora', 'Aurora'], ['sunrise_hills', 'Sunrise Hills']];
  const BGMOOD = { west_dusk: 'west', blocks_day: 'pixel', neon_city: 'neon', cabin_night: 'campfire', rainy_window: 'lofi', campfire: 'campfire', aurora: 'lofi', sunrise_hills: 'pixel', grad_dusk: 'dream', grad_ocean: 'ocean', grad_ember: 'jazz', grad_mint: 'forest', grad_violet: 'space', grad_slate: 'lofi' };
  const FXCOL = { dynamic: '#ffe2a8', west_dusk: '#ffb870', blocks_day: '#ffffff', neon_city: '#ff6aa8', cabin_night: '#ffd98a', rainy_window: '#8fb4ff', campfire: '#ffae50', aurora: '#8fffd0', sunrise_hills: '#fff0c8', grad_dusk: '#ffc9d6', grad_ocean: '#a6f0ff', grad_ember: '#ffb35c', grad_mint: '#d6ffe4', grad_violet: '#e3c9ff', grad_slate: '#cfd8ea' };
  const ACCENTS = ['#2dd4bf', '#818cf8', '#f472b6', '#fb923c', '#4ade80', '#60a5fa', '#f87171', '#facc15', '#a78bfa', '#22d3ee', '#e879f9', '#34d399'];
  const GRADS = { grad_dusk: ['#2b1055', '#7a3b8f', '#ff9a8b'], grad_ocean: ['#031a33', '#0a5a8a', '#38d0c9'], grad_ember: ['#1a0a0a', '#7a1f1f', '#ff9b3d'], grad_mint: ['#06201a', '#12805f', '#b8f5c9'], grad_violet: ['#0a0720', '#3d1f8a', '#c18bff'], grad_slate: ['#0d1117', '#2a3341', '#7d8aa3'] };
  const GRADN = { grad_dusk: 'Dusk Glow', grad_ocean: 'Deep Ocean', grad_ember: 'Ember', grad_mint: 'Mint Haze', grad_violet: 'Violet Night', grad_slate: 'Slate' };
  const gradUrl = k => { const c = GRADS[k]; if (!c) return ''; const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='" + c[0] + "'/><stop offset='.55' stop-color='" + c[1] + "'/><stop offset='1' stop-color='" + c[2] + "'/></linearGradient><radialGradient id='r' cx='.78' cy='.18' r='.65'><stop offset='0' stop-color='#fff' stop-opacity='.22'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient><radialGradient id='q' cx='.1' cy='.95' r='.7'><stop offset='0' stop-color='" + c[2] + "' stop-opacity='.35'/><stop offset='1' stop-color='" + c[2] + "' stop-opacity='0'/></radialGradient></defs><rect width='1600' height='900' fill='url(#g)'/><rect width='1600' height='900' fill='url(#r)'/><rect width='1600' height='900' fill='url(#q)'/></svg>"; return 'data:image/svg+xml,' + encodeURIComponent(svg); };
  const bgUrl = k => k.startsWith('grad_') ? gradUrl(k) : 'assets/bg/' + k + '.jpg';
  Object.keys(GRADN).forEach(k => BGS.push([k, GRADN[k]]));
  const gradFor = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return 'linear-gradient(160deg,hsl(' + h + ',55%,32%),hsl(' + ((h + 50) % 360) + ',60%,12%))'; };
  const saveApps = () => sk.store.set('apps', S.apps);
  const saveSettings = () => sk.store.set('settings', S.settings);
  const initial = p => esc((p.nick || p.u || '?')[0].toUpperCase());
  const avatarUrl = p => { if (!p) return ''; const v = (S.settings.pfp || {})[p.u]; if (v && v.startsWith('builtin:')) return 'assets/pfp/' + v.slice(8) + '.png'; if (v && v.startsWith('file:')) return fileUrl(v.slice(5)); return p.av && /^(data:image|https?:)/.test(p.av) ? p.av : ''; };
  const avatar = (p, big) => { const u = avatarUrl(p); return '<div class="av' + (big ? ' big' : '') + '"' + (u ? ' style="background-image:url(\'' + esc(u) + '\')"></div>' : '>' + (p ? initial(p) : '+') + '</div>'); };
  let clockTimer = null, wifiTimer = null;
  const clearTimers = () => { clearInterval(clockTimer); clearInterval(wifiTimer); if (S.padTestOn) { S.padTestOn = false; sk.helper.padTest(false); K.onPadLog = null; } };
  function go(name, data) {
    clearTimers(); S.screen = name; if (window.K.audio) window.K.audio.setSuspended(name === 'web'); S.backFn = null; S.startFn = null; S.bumper = null;
    const root = $('#screen'); root.innerHTML = ''; root.className = 'fade';
    ({ boot, start, welcome, profiles, home, library, settings, addApp, web }[name])(root, data || {});
  }
  window.K.go = go;

  // ---------- idle screen: a fancy clock with soft music (moves slowly so a TV does not burn in) ----------
  let saverEl = null, saverAnim = null;
  const p2 = n => String(n).padStart(2, '0');
  const greet = h => h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  K.saverOff = () => { if (saverEl) { saverEl.remove(); saverEl = null; } clearInterval(saverAnim); K.saverOn = false; K.lastInput = Date.now(); if (K.audio && K.audio.idle) K.audio.idle(null); };
  function saverShow() {
    K.saverOn = true; const style = S.settings.saverStyle || 'ambient';
    if (style === 'minimal') {
      saverEl = el('div', 'saver', '<div class="sv"><b></b><span></span></div>'); document.body.appendChild(saverEl);
      const sv = saverEl.firstChild, upd = () => { const n = new Date(); sv.querySelector('b').textContent = K.fmtTime(n); sv.querySelector('span').textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); sv.style.left = (5 + Math.random() * 50) + '%'; sv.style.top = (8 + Math.random() * 60) + '%'; };
      upd(); saverAnim = setInterval(upd, 20000); return;
    }
    let stars = ''; for (let i = 0; i < 46; i++) stars += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;top:' + (Math.random() * 100).toFixed(1) + '%;--d:' + (3 + Math.random() * 6).toFixed(1) + 's;--l:-' + (Math.random() * 8).toFixed(1) + 's;--s:' + (1 + Math.random() * 2.2).toFixed(1) + 'px"></i>';
    saverEl = el('div', 'saver amb', '<div class="ab a1"></div><div class="ab a2"></div><div class="ab a3"></div><div class="stars">' + stars + '</div>' +
      '<div class="ambclock"><div class="hello"></div><div class="dial"><svg viewBox="0 0 200 200"><circle class="trk" cx="100" cy="100" r="94"/><circle class="prg" cx="100" cy="100" r="94" transform="rotate(-90 100 100)"/></svg><div class="tm"><b></b><em></em></div></div><div class="dt"></div><div class="np"></div></div>');
    document.body.appendChild(saverEl);
    const q = x => saverEl.querySelector(x), prg = q('.prg'), C = 2 * Math.PI * 94; prg.style.strokeDasharray = C;
    const upd = () => {
      const n = new Date(), h = n.getHours(), c24 = !!S.settings.clock24;
      q('.tm b').textContent = (c24 ? p2(h) : (h % 12 || 12)) + ':' + p2(n.getMinutes()); q('.tm em').textContent = c24 ? '' : (h < 12 ? 'AM' : 'PM');
      q('.dt').textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); q('.hello').textContent = greet(h);
      prg.style.strokeDashoffset = C * (1 - (n.getSeconds() + 1) / 60);
      const hue = Math.round(((h * 60 + n.getMinutes()) / 1440) * 360); saverEl.style.setProperty('--h', hue);
    };
    upd(); saverAnim = setInterval(upd, 1000);
    const im = S.settings.idleMood == null ? 'twilight' : S.settings.idleMood;
    if (K.audio && K.audio.idle && im !== 'off') { K.audio.idle(im); const nm = (K.audio.moods().find(x => x[0] === im) || [])[1]; if (nm) saverEl.querySelector('.np').textContent = '\u266A ' + nm; }
  }
  setInterval(() => { const m = +S.settings.saver || 0; if (!m || K.saverOn || S.game || !['home', 'library', 'settings', 'start'].includes(S.screen)) return; if (Date.now() - K.lastInput > m * 60000) saverShow(); }, 5000);

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
      const last = S.settings.players || []; S.lastP0 = last[0] || '';
      const mem = [S.profiles.find(p => p.u === last[0]) || (last[0] === 'guest' ? { u: 'guest', guest: true } : null), S.profiles.find(p => p.u === last[1]) || null];
      if (S.settings.askWho === false && mem[0]) { S.players = mem; go('home'); mem[0].u !== 'guest' && sk.auth.refresh(mem[0].u).then(m => { if (m) { S.players[0] = m; const i = S.profiles.findIndex(p => p.u === m.u); if (i >= 0) S.profiles[i] = m; } }); return; }
      S.players = [null, null]; go('start');
    })();
  }
  function applyTheme() {
    const a = S.settings.accent || ACCENTS[0]; document.documentElement.style.setProperty('--a', a);
    document.body.classList.toggle('calm', !!S.settings.calm);
    const TH = { midnight: {}, oled: { '--bg': '#000', '--panel': 'rgba(10,10,14,.9)', '--panel2': 'rgba(22,22,28,.95)' }, daylight: { '--bg': '#e9edf7', '--panel': 'rgba(255,255,255,.86)', '--panel2': 'rgba(240,243,252,.96)', '--line': 'rgba(10,15,40,.14)', '--text': '#101428', '--dim': '#4a5170' },
      sunset: { '--bg': '#1a0f24', '--panel': 'rgba(42,22,52,.86)', '--panel2': 'rgba(58,30,66,.95)', '--line': 'rgba(255,190,150,.16)', '--text': '#fff1e8', '--dim': '#c9a4b8' },
      ocean: { '--bg': '#061a2b', '--panel': 'rgba(10,36,58,.86)', '--panel2': 'rgba(14,52,80,.95)', '--line': 'rgba(140,210,255,.16)', '--text': '#eaf7ff', '--dim': '#8fb4cc' },
      forest: { '--bg': '#0a1a12', '--panel': 'rgba(16,40,28,.86)', '--panel2': 'rgba(22,56,38,.95)', '--line': 'rgba(160,230,180,.15)', '--text': '#eefaf0', '--dim': '#93b8a0' },
      rose: { '--bg': '#1d0c16', '--panel': 'rgba(46,18,34,.86)', '--panel2': 'rgba(64,24,46,.95)', '--line': 'rgba(255,160,200,.16)', '--text': '#fff0f6', '--dim': '#c99ab2' },
      cyber: { '--bg': '#0b0720', '--panel': 'rgba(24,14,56,.86)', '--panel2': 'rgba(34,18,78,.95)', '--line': 'rgba(170,120,255,.2)', '--text': '#f2ecff', '--dim': '#a99bd6' },
      graphite: { '--bg': '#121316', '--panel': 'rgba(30,32,38,.9)', '--panel2': 'rgba(42,45,53,.95)', '--line': 'rgba(255,255,255,.1)', '--text': '#eceef2', '--dim': '#9096a4' },
      sakura: { '--bg': '#fbeef3', '--panel': 'rgba(255,255,255,.86)', '--panel2': 'rgba(255,240,246,.96)', '--line': 'rgba(80,20,50,.14)', '--text': '#2a1020', '--dim': '#7a5468' } };
    ['--bg', '--panel', '--panel2', '--line', '--text', '--dim'].forEach(k => document.documentElement.style.removeProperty(k));
    Object.entries(TH[S.settings.theme] || {}).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    document.documentElement.style.fontSize = 'calc(clamp(13px, 2vh, 26px) * ' + ({ small: .9, normal: 1, large: 1.15, huge: 1.3 }[S.settings.uiSize] || 1) + ')';
    buildFx(); applyWall();
  }
  function buildFx() {
    const fx = $('#fx'); if (!fx) return; fx.classList.toggle('off', S.settings.fx === false || !!S.settings.calm);
    if (fx.children.length) return;
    for (let i = 0; i < 20; i++) { const d = document.createElement('i'), sz = (3 + Math.random() * 5).toFixed(1); d.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;--s:' + sz + 'px;--d:' + (14 + Math.random() * 16).toFixed(1) + 's;--l:-' + (Math.random() * 30).toFixed(1) + 's;--x:' + ((Math.random() - .5) * 18).toFixed(1) + 'vw'; fx.appendChild(d); }
  }
  function applyWall() {
    const b = S.settings.bg || 'dynamic'; let url = '';
    if (b.startsWith('file:')) url = fileUrl(b.slice(5)); else if (b !== 'dynamic') url = bgUrl(b);
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
  // ---------- press A to start, then pick Player 1 ----------
  function start(root) {
    hints([['A', 'Start']]); S.backFn = null; S.startFn = null; setBg('');
    root.innerHTML = '<div class="startscr amb"><div class="ab a1"></div><div class="ab a2"></div><div class="ab a3"></div><div class="stc"><div class="logo">SKBOX</div><div class="sclock"><b></b><span></span></div></div></div>';
    const wrap = root.firstChild, stc = wrap.querySelector('.stc');
    const go1 = nav(el('button', 'pressa', '<span class="pa"></span>')); go1.dataset.first = ''; stc.appendChild(go1);
    const upd = () => { const n = new Date(), h = n.getHours(), c24 = !!S.settings.clock24; wrap.querySelector('.sclock b').textContent = (c24 ? p2(h) : (h % 12 || 12)) + ':' + p2(n.getMinutes()) + (c24 ? '' : ' ' + (h < 12 ? 'AM' : 'PM')); wrap.querySelector('.sclock span').textContent = greet(h) + ' \u00B7 ' + n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); go1.firstChild.textContent = K.padType === 'ps' ? 'Press \u2715 to start' : 'Press A to start'; };
    upd(); clockTimer = setInterval(upd, 1000);
    go1.onclick = () => { if (S.profiles.length) go('profiles', { slot: 0 }); else go('welcome'); };
    ensureFocus(root);
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
    root.innerHTML = '<div class="center"><h1 style="font-size:2.4rem">' + (slot ? (d.auto ? 'Player 2 joined! Pick your profile' : 'Player 2: who\u2019s playing?') : 'Player 1: who\u2019s playing?') + '</h1></div>';
    const grid = el('div', 'grid'); grid.style.cssText = 'width:min(70vw,60rem);margin-top:2vh';
    S.profiles.forEach((p, i) => {
      const c = nav(el('button', 'pcard', avatar(p, true) + '<b>' + esc(p.nick || p.u) + '</b><small>@' + esc(p.u) + '</small>'));
      if (i === 0 || (slot === 0 && p.u === S.lastP0)) { grid.querySelectorAll('[data-first]').forEach(x => delete x.dataset.first); c.dataset.first = ''; }
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
      if (p) { const c = nav(el('button', 'chip', avatar(p) + '<span>' + esc(p.nick || p.u) + '</span><span class="pn">P' + (i + 1) + '</span>')); c.dataset.owner = String(i); c.onclick = () => go('settings', { cat: 'players' }); c._onopts = () => menu('Player ' + (i + 1), [{ label: 'Change picture', fn: () => pfpPicker(i) }, { label: 'Use a different controller\u2026', fn: () => assignFlow(i) }].concat(S.players[1] ? [{ label: 'Swap Player 1 and Player 2 controllers', fn: () => { swapPads(); go('home'); } }] : [])); left.appendChild(c); }
      else if (i === 1) { const c = nav(el('button', 'chip', '<div class="av">+</div><span>Add Player 2</span>')); c.onclick = () => go('profiles', { slot: 1 }); left.appendChild(c); }
    });
    if (S.remote && S.remote.on) { const rc = nav(el('button', 'chip', '<div class="av">\u{1F4E1}</div><span>' + (S.remote.client ? esc(S.remote.client.name) + ' is playing' : 'Remote play on') + '</span>')); rc.onclick = () => go('settings', { cat: 'remote' }); left.appendChild(rc); }
    const npB = nav(el('button', 'chip np', '<div class="av">\u266A</div><span id="npt">SKMusic</span>')); npB.style.display = 'none';
    npB.onclick = () => sk.music.cmd('toggle').then(() => setTimeout(tick, 400)); npB._onopts = () => sk.music.open(activeUser()); left.appendChild(npB);
    const wifiB = nav(el('button', 'ibtn', '<span id="wf">\u{1F4F6}</span><span id="wfn" style="font-size:.85rem;color:var(--dim)"></span>')); wifiB.onclick = () => go('settings', { cat: 'wifi' });
    const btB = nav(el('button', 'ibtn', '<span style="font-size:.85rem">\u16D2 Bluetooth</span>')); btB.onclick = () => go('settings', { cat: 'bluetooth' });
    const pad = el('div', 'ibtn', '\u{1F3AE} <span id="padn">0</span><span id="bat" style="font-size:.8rem;color:var(--dim);margin-left:.4rem"></span>'); pad.style.cursor = 'default';
    const clk = el('div', 'clock'); const setB = nav(el('button', 'ibtn', '\u2699')); setB.onclick = () => go('settings'); const pw = nav(el('button', 'ibtn', '\u23FB')); pw.onclick = () => go('settings', { cat: 'power' });
    const hud = el('div', 'ibtn', ''); hud.style.display = 'none'; hud.style.cursor = 'default'; right.append(hud, wifiB, btB, pad, clk, setB, pw); top.append(left, right);
    const wrap = el('div', 'home'), row = el('div', 'row'), info = el('div', 'info');
    wrap.append(row, info); root.append(top, wrap);
    const list = tiles(), els = [];
    list.forEach((a, i) => {
      const t = tileEl(a); t._id = a.lib ? 'lib' : a.id; els.push(t);
      t._onfocus = () => {
        S.lastTile = i; S.lastTileId = a.id || 'lib';
        if (a.lib) { info.innerHTML = '<h1>Library</h1><p>' + (allApps().length) + ' apps and games. Pin the ones you want on this screen.</p><div class="go"><i class="key k-A">A</i> Open</div>'; setBg(''); }
        else { info.innerHTML = '<h1>' + esc(a.name) + '</h1><p>' + esc([a.tag || a.exe || '', playInfo(a)].filter(Boolean).join(' \u00B7 ')) + '</p><div class="go"><i class="key k-A">A</i> ' + (isRunning(a) ? 'Resume' : ['web', 'browse', 'bapp'].includes(a.kind) ? 'Open' : 'Play') + '</div>'; setBg(a.cover ? fileUrl(a.cover) : ''); }
      };
      t.onclick = () => a.lib ? go('library') : openApp(a);
      if (!a.lib) t._onopts = () => appMenu(a, 'home'); else t._onopts = () => toast('Press A to open your Library');
      row.appendChild(t);
    });
    if (!S.autoDone) { S.autoDone = true; const au = S.settings.autoApp && allApps().find(x => x.id === S.settings.autoApp); if (au && !S.game) setTimeout(() => { if (S.screen === 'home') openApp(au); }, 1200); }
    if (S.migratedPins) { S.migratedPins = false; setTimeout(() => toast('Your apps are now in the Library. Pin or unpin them from there.'), 600); }
    if (!S.newsChecked) { S.newsChecked = true; sk.info().then(i => { if (i && i.version && S.settings.seenVersion !== i.version) { S.settings.seenVersion = i.version; saveSettings(); setTimeout(() => { if (S.screen === 'home') showNews(); }, 900); } }); }
    if (list.length === 1) setTimeout(() => toast('Nothing pinned yet. Open the Library and press X on an app to pin it.'), 700);
    const tick = async () => {
      clk.textContent = K.fmtTime(new Date()); const n = (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean).length : 0); const e = $('#padn'); if (e) e.textContent = n; const be = $('#bat'); if (be) be.textContent = n ? batText() : '';
      try { const m = await sk.music.status(); if (S.screen !== 'home') return; if (m && m.ready && m.track) { npB.style.display = ''; $('#npt').textContent = (m.playing ? '\u23F8 ' : '\u25B6 ') + String(m.track.title || 'SKMusic').slice(0, 28); } else npB.style.display = 'none'; } catch (_) {}
    };
    const perf = async () => { if (!S.settings.hud) { hud.style.display = 'none'; return; } try { const p = await sk.perf.get(); hud.style.display = ''; hud.textContent = 'CPU ' + p.cpu + '%  \u00B7  RAM ' + (p.ramUsed / 1073741824).toFixed(1) + '/' + (p.ramTotal / 1073741824).toFixed(0) + ' GB'; } catch (_) {} };
    tick(); perf(); clockTimer = setInterval(() => { tick(); perf(); }, 4000);
    const wf = async () => { const s = await sk.wifi.status(); const w = $('#wf'), n = $('#wfn'); if (!w) return; w.style.opacity = s.connected ? 1 : .4; n.textContent = s.connected ? s.ssid : 'Offline'; };
    wf(); wifiTimer = setInterval(wf, 25000);
    const want = els.find(e => e._id === S.lastTileId) || els[Math.min(S.lastTile || 0, els.length - 1)];
    ensureFocus(root, want);
  }

  // ---------- Library: every app lives here; pin the ones you want on Home ----------
  let libSort = 'az', libQuery = '', libFilter = 'all';
  const SORTS = [['az', 'A\u2013Z'], ['recent', 'Recently played'], ['most', 'Most played']];
  function libList() {
    const cols = S.settings.collections || {}; let l = allApps().filter(a => !libQuery || a.name.toLowerCase().includes(libQuery.toLowerCase())); const st = S.stats || {}, g = a => st[a.id] || { last: 0, ms: 0 };
    if (libFilter === 'pinned') l = l.filter(isPinned); else if (libFilter === 'recent') l = l.filter(a => g(a).last > Date.now() - 14 * 864e5); else if (cols[libFilter]) l = l.filter(a => cols[libFilter].includes(a.id));
    if (libSort === 'az') l.sort((x, y) => x.name.localeCompare(y.name)); else if (libSort === 'recent') l.sort((x, y) => g(y).last - g(x).last || x.name.localeCompare(y.name)); else l.sort((x, y) => g(y).ms - g(x).ms || x.name.localeCompare(y.name));
    return l;
  }
  function library(root, d) {
    hints([['A', 'Open'], ['X', 'Pin / Unpin'], ['Y', 'Options'], ['L', 'Sort'], ['B', 'Home']]);
    S.backFn = () => go('home'); S.startFn = () => go('settings'); if (!S.libInit) { S.libInit = true; libSort = S.settings.libSort || libSort; libFilter = S.settings.libFilter || libFilter; }
    if (libFilter !== 'all' && libFilter !== 'pinned' && libFilter !== 'recent' && !(S.settings.collections || {})[libFilter]) libFilter = 'all';
    root.innerHTML = '<div class="page lib"><h1>Library</h1></div>';
    const page = root.querySelector('.page'), bar = el('div', 'libbar');
    const sortB = nav(el('button', 'chip', '<span>Sort: ' + esc(SORTS.find(x => x[0] === libSort)[1]) + '</span>')), findB = nav(el('button', 'chip', '<span>\u{1F50D} ' + (libQuery ? esc(libQuery) : 'Search') + '</span>')), addB = nav(el('button', 'chip', '<div class="av">+</div><span>Add an app</span>'));
    const cycle = dir => { const i = SORTS.findIndex(x => x[0] === libSort); libSort = SORTS[(i + (dir || 1) + SORTS.length) % SORTS.length][0]; S.settings.libSort = libSort; saveSettings(); go('library', { focus: S.lastLibId }); };
    const FILTERS = ['all', 'pinned', 'recent'].concat(Object.keys(S.settings.collections || {})), fname = f => ({ all: 'All', pinned: 'On Home', recent: 'Played lately' }[f] || f);
    const filtB = nav(el('button', 'chip', '<span>Show: ' + esc(fname(libFilter)) + '</span>'));
    filtB.onclick = () => { libFilter = FILTERS[(FILTERS.indexOf(libFilter) + 1) % FILTERS.length]; S.settings.libFilter = libFilter; saveSettings(); go('library'); };
    if (!['all', 'pinned', 'recent'].includes(libFilter)) filtB._onopts = () => confirm('Delete the collection \u201C' + libFilter + '\u201D?', 'Your apps stay in the Library. Only the group is removed.', 'Delete', () => { delete S.settings.collections[libFilter]; libFilter = 'all'; S.settings.libFilter = 'all'; saveSettings(); go('library'); }, true);
    sortB.onclick = () => cycle(1); S.bumper = a => cycle(a === 'prev' ? -1 : 1);
    findB.onclick = () => osk({ title: 'Search your library', value: libQuery, submitLabel: 'Search', onDone: v => { libQuery = (v || '').trim(); go('library'); } });
    if (libQuery) findB._onopts = () => { libQuery = ''; go('library'); };
    addB.onclick = () => go('addApp');
    bar.append(filtB, sortB, findB, addB); page.appendChild(bar);
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
    const run = isRunning(a), it = [{ label: run ? 'Resume' : (['web', 'browse', 'bapp'].includes(a.kind) ? 'Open' : 'Play'), fn: () => openApp(a) }];
    const back = () => ctx === 'lib' ? go('library', { focus: a.id }) : go('home');
    if (run) it.push({ label: 'Close game', fn: closeRunning });
    if (isPinned(a)) { it.push({ label: 'Unpin from Home', fn: () => { setPinned(a, false); back(); } }); if (ctx === 'home') { it.push({ label: 'Move left', fn: () => { movePin(a, -1); S.lastTileId = a.id; go('home'); } }); it.push({ label: 'Move right', fn: () => { movePin(a, 1); S.lastTileId = a.id; go('home'); } }); } }
    else it.push({ label: 'Pin to Home', fn: () => { setPinned(a, true); toast(a.name + ' pinned to Home'); back(); } });
    const cols = S.settings.collections || {}, inCols = Object.keys(cols).filter(c => cols[c].includes(a.id));
    it.push({ label: 'Add to collection\u2026', fn: () => {
      const opts = Object.keys(cols).filter(c => !cols[c].includes(a.id)).map(c => ({ label: c, fn: () => { cols[c].push(a.id); S.settings.collections = cols; saveSettings(); toast(a.name + ' added to ' + c); back(); } }));
      opts.push({ label: 'New collection\u2026', fn: () => osk({ title: 'Name your collection', value: '', submitLabel: 'Create', onDone: v => { v = (v || '').trim().slice(0, 24); if (!v) return; S.settings.collections = Object.assign({}, cols, { [v]: (cols[v] || []).concat(cols[v] && cols[v].includes(a.id) ? [] : [a.id]) }); saveSettings(); toast(a.name + ' added to ' + v); back(); } }) });
      menu('Add ' + a.name + ' to', opts);
    } });
    inCols.forEach(c => it.push({ label: 'Remove from ' + c, fn: () => { cols[c] = cols[c].filter(x => x !== a.id); S.settings.collections = cols; saveSettings(); back(); } }));
    if (a.kind === 'bapp') {
      it.push({ label: 'Edit browser app\u2026', fn: () => bappMenu(a, back) });
    } else if (!a.kind) {
      it.push({ label: 'Change cover art', fn: () => findCover(a, () => { saveApps(); back(); }) });
      it.push({ label: 'Edit name and path', fn: () => go('addApp', { app: a }) });
      it.push({ label: 'Remove', fn: () => confirm('Remove ' + a.name + '?', 'This only removes it from SKBox. Your files are not touched.', 'Remove', () => { S.apps = S.apps.filter(x => x.id !== a.id); setPinned(a, false); if (a.cover) sk.cover.remove(a.cover); saveApps(); back(); }, true) });
    } else it.push({ label: 'Built-in app', fn: () => toast('SKchat and SKMusic are built in') });
    menu(a.name, it);
  }
  // Which controller is Player 1 / Player 2. Saved by controller name; two identical controllers are told apart by a swap flag.
  K.assignPads = (i1, i2) => {
    const pads = K.pads(), a = pads.find(p => p.index === i1), b = pads.find(p => p.index === i2), old = S.settings.padIds || [];
    S.settings.padIds = [a ? a.id : old[0] || '', b ? b.id : old[1] || ''];
    S.settings.padSwap = !!(a && b && a.id === b.id && i1 > i2); saveSettings();
  };
  const swapPads = () => {
    if (!S.players[1]) { toast('Swap needs two players'); return; } const i1 = K.padIndexOf(0), i2 = K.padIndexOf(1);
    if (i1 < 0 || i2 < 0 || i1 === i2 || K.pads().length < 2) { toast('Connect both controllers first'); return; }
    K.assignPads(i2, i1); toast('Player 1 and Player 2 swapped controllers');
  };
  function assignFlow(first) {
    const two = !!S.players[1], order = two ? [first || 0, 1 - (first || 0)] : [0], picked = [];
    const L = el('div', 'layer'), b = el('div', 'box'), t = el('h3', '', ''), p = el('p', 'sub', ''), cancel = nav(el('button', 'btn', 'Cancel')), row2 = el('div', 'btnrow');
    let done = false; const close = () => { if (done) return; done = true; K.grab = null; closeLayer(L); };
    const ask = () => { const pl = order[picked.length]; t.textContent = 'Player ' + (pl + 1) + ': press A'; p.textContent = 'Press A on the controller you want to use as Player ' + (pl + 1) + (picked.length ? '. Use the other controller.' : '.'); };
    K.grab = (idx, a) => {
      if (a === 'back') { close(); return true; } if (a !== 'ok') return true;
      if (picked.includes(idx)) { toast('That controller is already taken'); return true; }
      picked.push(idx); if (picked.length < order.length) { ask(); return true; }
      const at = pl => picked[order.indexOf(pl)]; K.assignPads(at(0), two ? at(1) : undefined); close(); toast('Controllers assigned'); S.active = 0;
      if (S.screen === 'settings') go('settings', { cat: 'controllers' }); else if (S.screen === 'home') go('home'); return true;
    };
    cancel.onclick = close; cancel.dataset.first = ''; row2.appendChild(cancel); b.append(t, p, row2); L.appendChild(b); ask(); openLayer(L, close);
  }
  K.onPad = (a, idx) => { // Player 2 joins by pressing Start on a second controller
    if (S.screen === 'home' && !S.players[1] && a === 'start') { const p1 = K.padIndexOf(0); if (idx !== p1 && K.pads().length > 1) { K.assignPads(p1, idx); go('profiles', { slot: 1 }); } }
  };
  const activeUser = () => (S.players[S.active] || S.players[0] || { u: 'guest' }).u;
  async function openApp(a) {
    if (a.kind) { sk.stats.touch(a.id); (S.stats = S.stats || {})[a.id] = Object.assign({ ms: 0, n: 0 }, S.stats[a.id], { last: Date.now() }); }
    if (a.kind === 'music') { sk.music.open(activeUser()); return; }
    if (a.kind === 'browse') { sk.browse.open({ pad: Math.max(0, K.padIndexOf(S.active)) }); return; }
    if (a.kind === 'bapp') {
      const go2 = async rep => { const stop = busy('Opening ' + a.name + '\u2026'); const r = await sk.browse.launchApp({ id: a.id, name: a.name, url: a.url, adblock: a.adblock !== false, auth: a.auth !== false, engine: a.engine || 'built', cover: a.cover, resume: a.resume !== false, muted: !!a.muted, barHidden: !!a.barHidden, windowed: !!a.windowed, dark: !!a.dark, zoom: a.zoom || 0, pad: Math.max(0, K.padIndexOf(S.active)) }); setTimeout(stop, 600); if (r && r.ok === false) toast(r.error || 'Could not open it'); };
      if (S.game && S.game.id !== a.id && a.engine === 'edge') confirm('Switch?', S.game.name + ' is running. Close it and open ' + a.name + '?', 'Switch', () => go2()); else if (S.game && S.game.id === a.id) sk.game.resume(); else go2(); return;
    }
    if (a.kind === 'web') { go('web', { app: a }); return; }
    const payload = replace => ({ id: a.id, name: a.name, exe: a.exe, args: a.args, cover: a.cover, fs: a.fs || 'auto', compat: !!a.compat, replace: !!replace });
    const run = async replace => { const stop = busy('Launching ' + a.name + '\u2026'); const r = await sk.launch(payload(replace)); setTimeout(stop, 700); if (!r.ok) toast(r.error || 'Could not launch.'); };
    if (S.game && S.game.id !== a.id) confirm('Switch games?', S.game.name + ' is running. Close it and start ' + a.name + '?', 'Switch', () => run(true));
    else if (S.game) sk.game.resume(); else run(false);
  }
  sk.on('launch-error', m => toast('Could not start: ' + m));
  sk.on('apps:changed', async () => { try { const a = await sk.store.get('apps', []); S.apps = Array.isArray(a) ? a : ((a && a.apps) || []); if (['home', 'library'].includes(S.screen)) go(S.screen); } catch (_) {} });
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
  sk.on('battery', (slot, type, level) => { (S.bat = S.bat || {})[slot] = { type, level }; if ((type === 2 || type === 3) && level <= 1 && Date.now() - (S.lowBatAt || 0) > 600000) { S.lowBatAt = Date.now(); toast('Controller battery is ' + (level === 0 ? 'empty' : 'low') + '. Plug it in or change the batteries.'); } });
  sk.on('padtest', (slot, a) => { if (!S.padTestOn) return; K.padCount.helper++; K.padLog.push({ src: 'helper', a, t: Date.now() }); if (K.padLog.length > 14) K.padLog.shift(); if (K.onPadLog) K.onPadLog(); });
  sk.on('remote:state', s => {
    const sig = (s.on ? 'on' : 'off') + '|' + (s.client ? s.client.name : ''), old = S.remoteSig; S.remote = s; S.remoteSig = sig;
    if (S.remoteUpd) S.remoteUpd(s);
    if (old !== undefined && old !== sig) { const was = (old.split('|')[1] || ''), now = s.client ? s.client.name : ''; if (now && now !== was) toast(now + ' connected (Remote play)'); else if (was && !now) toast(was + ' disconnected'); if (S.screen === 'home') go('home'); }
  });
  sk.remote.state().then(s => { S.remote = s; S.remoteSig = (s.on ? 'on' : 'off') + '|' + (s.client ? s.client.name : ''); }).catch(() => {});
  sk.on('timer:fired', a => toast(a === 'closegame' ? 'Timer finished: closing your game' : 'Timer finished'));
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
    const ofd = nav(el('button', 'btn', 'Open game folder')); ofd.onclick = async () => { const r = await sk.extras.do('folder', d.exe); if (r && !r.ok) toast(r.error || 'Could not open it'); };
    row1.append(br, fc, ofd);
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
      wv.focus(); wv.send('active-pad', Math.max(0, K.padIndexOf(S.active)));
      if (p.u !== 'guest') { const c = await sk.auth.cred(p.u); if (c) [1200, 3200, 6000].forEach(ms => setTimeout(() => { try { wv.executeJavaScript('(function(u,p){var a=document.getElementById("li-u"),b=document.getElementById("li-p");if(a&&b&&a.offsetParent&&!window._sessOn){a.value=u;b.value=p;["input","change"].forEach(function(t){a.dispatchEvent(new Event(t,{bubbles:true}));b.dispatchEvent(new Event(t,{bubbles:true}));});if(window.doLogin)window.doLogin();}})(' + JSON.stringify(c.u) + ',' + JSON.stringify(c.p) + ')').catch(() => {}); } catch (_) {} }, ms)); }
    });
    wv.addEventListener('ipc-message', e => {
      if (e.channel === 'home') go('home');
      else if (e.channel === 'osk') { const v = (e.args[0] && e.args[0].value) || ''; osk({ title: 'Type', value: v, canSend: true, onDone: (t, send) => { setText(t, send); wv.focus(); }, onCancel: () => wv.focus() }); }
    });
    wv.addEventListener('did-fail-load', ev => { if (ev.errorCode === -3 || !ev.isMainFrame) return; confirm('Can\u2019t reach ' + a.name, 'Check your Wi-Fi connection.', 'Retry', () => wv.reload()); });
    wv.addEventListener('console-message', () => {});
  }


  // ---------- browser apps: one website as its own app ----------
  const bapps = () => S.apps.filter(a => a.kind === 'bapp');
  async function bappCover(d) { const r = await sk.browse.favicon(d.url); if (r && r.ok) { if (d.cover && d.cover !== r.file) sk.cover.remove(d.cover); d.cover = r.file; d.fit = 'icon'; d.coverAuto = true; return true; } return false; }
  async function createBapp(done) {
    osk({ title: 'Website address (for example youtube.com)', value: '', submitLabel: 'Next', onDone: async v0 => {
      let v = String(v0 || '').trim(); if (!v) return; if (!/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
      let u; try { u = new URL(v); if (!u.hostname.includes('.')) throw 0; } catch (_) { toast('That does not look like a web address'); return; }
      const stop = busy('Looking at the site\u2026'); const info = await sk.browse.info(u.href).catch(() => ({})); const drm = await sk.browse.drm(u.href); const eng = await sk.browse.engines(); stop();
      const host = u.hostname.replace(/^www\./, ''), guess = ((info && info.title) || '').split(/\s[|\u2013\u2014\-\u00B7:]\s/)[0].trim().slice(0, 28) || host.split('.')[0].replace(/^./, c => c.toUpperCase());
      osk({ title: 'Name for this app', value: guess, submitLabel: 'Next', onDone: name => {
        name = (name || '').trim().slice(0, 28) || guess;
        const d = { id: 'bapp_' + Date.now().toString(36), kind: 'bapp', name, url: u.origin + (u.pathname === '/' ? '/' : u.pathname) + u.search, adblock: true, engine: 'built', auth: true, cover: '', fit: '', coverAuto: true };
        const finish = async () => { const stop2 = busy('Getting the site icon\u2026'); await bappCover(d); stop2(); S.apps.push(d); saveApps(); toast(name + ' added to your Library. Press X to pin it to Home.'); done && done(d); };
        const askEngine = () => { if (drm) d.adblock = d.adblock; finish(); };
        menu('Ad blocker for ' + name, [{ label: 'On (recommended)', fn: askEngine }, { label: 'Off for this app', fn: () => { d.adblock = false; askEngine(); } }]);
      } });
    } });
  }
  function bappMenu(a, back) {
    const redo = () => { saveApps(); back && back(); };
    menu(a.name + ' (' + new URL(a.url).hostname + ')', [
      { label: 'Ad blocker: ' + (a.adblock !== false ? 'On' : 'Off') + ' (tap to change)', fn: () => { a.adblock = a.adblock === false; redo(); toast('Ad blocker ' + (a.adblock !== false ? 'on' : 'off') + ' for ' + a.name); } },
      { label: 'Resume where I left off: ' + (a.resume !== false ? 'On' : 'Off'), fn: () => { a.resume = a.resume === false; redo(); } },
      { label: 'Start muted: ' + (a.muted ? 'On' : 'Off'), fn: () => { a.muted = !a.muted; redo(); } },
      { label: 'Start with the bar hidden: ' + (a.barHidden ? 'On' : 'Off') + ' (F10 shows it)', fn: () => { a.barHidden = !a.barHidden; redo(); } },
      { label: 'Open in a window instead of fullscreen: ' + (a.windowed ? 'On' : 'Off'), fn: () => { a.windowed = !a.windowed; redo(); } },
      { label: 'Dark pages: ' + (a.dark ? 'On' : 'Off'), fn: () => { a.dark = !a.dark; redo(); } },
      { label: 'Page zoom: ' + (a.zoom || 100) + '% (tap to change)', fn: () => { const L = [100, 110, 125, 150, 175]; a.zoom = L[(L.indexOf(a.zoom || 100) + 1) % L.length]; redo(); } },
      { label: 'Rename', fn: () => osk({ title: 'Name', value: a.name, submitLabel: 'Save', onDone: v => { v = (v || '').trim().slice(0, 28); if (v) { a.name = v; redo(); } } }) },
      { label: 'Cover: use the site icon (auto)', fn: async () => { const stop = busy('Getting the site icon\u2026'); const ok = await bappCover(a); stop(); toast(ok ? 'Icon updated' : 'Could not get the site icon'); redo(); } },
      { label: 'Cover: pick other art\u2026', fn: () => findCover(a, () => { a.coverAuto = false; redo(); }) },
      { label: 'Engine: ' + (a.engine === 'edge' ? 'Edge window (plays Netflix etc.)' : 'SKBrowse') + ' (tap to change)', fn: async () => { const e = await sk.browse.engines(); if (!e.edge) { toast('Edge or Chrome was not found on this PC'); return; } a.engine = a.engine === 'edge' ? 'built' : 'edge'; redo(); toast('Now opens in ' + (a.engine === 'edge' ? 'an Edge window' : 'SKBrowse')); } },
      { label: 'Allow sign-in pages (Google, Microsoft\u2026): ' + (a.auth !== false ? 'On' : 'Off'), fn: () => { a.auth = a.auth === false; redo(); } },
      { label: 'Clear this app\u2019s logins and cache', fn: () => confirm('Clear ' + a.name + ' data?', 'You will be signed out of this site.', 'Clear', async () => { await sk.browse.clearApp(a.id); toast('Cleared'); }, true) },
      { label: 'Remove', fn: () => confirm('Remove ' + a.name + '?', 'Only the app is removed. Its saved logins stay until you clear them.', 'Remove', () => { S.apps = S.apps.filter(x => x.id !== a.id); setPinned(a, false); if (a.cover) sk.cover.remove(a.cover); saveApps(); back && back(); }, true) }
    ]);
  }


  // ---------- BIG: Streaming services hub. One tap adds a service as a browser app; each one resumes where you left off. ----------
  const SERVICES = [
    ['YouTube', 'https://www.youtube.com/', 'Free', 0], ['Twitch', 'https://www.twitch.tv/', 'Free', 0], ['Kick', 'https://kick.com/', 'Free', 0], ['Pluto TV', 'https://pluto.tv/', 'Free live TV', 0], ['Tubi', 'https://tubitv.com/', 'Free movies', 0],
    ['Plex', 'https://watch.plex.tv/', 'Free', 0], ['Rumble', 'https://rumble.com/', 'Free', 0], ['Vimeo', 'https://vimeo.com/watch', 'Free', 0], ['Dailymotion', 'https://www.dailymotion.com/', 'Free', 0], ['Roku Channel', 'https://therokuchannel.roku.com/', 'Free', 0],
    ['SoundCloud', 'https://soundcloud.com/', 'Music', 0], ['Crunchyroll', 'https://www.crunchyroll.com/', 'Anime', 1], ['Netflix', 'https://www.netflix.com/browse', 'Subscription', 1], ['Disney+', 'https://www.disneyplus.com/', 'Subscription', 1], ['Hulu', 'https://www.hulu.com/', 'Subscription', 1],
    ['Max', 'https://www.max.com/', 'Subscription', 1], ['Prime Video', 'https://www.primevideo.com/', 'Subscription', 1], ['Peacock', 'https://www.peacocktv.com/', 'Subscription', 1], ['Paramount+', 'https://www.paramountplus.com/', 'Subscription', 1], ['Apple TV+', 'https://tv.apple.com/', 'Subscription', 1], ['YouTube TV', 'https://tv.youtube.com/', 'Live TV', 1], ['Spotify', 'https://open.spotify.com/', 'Music', 1]
  ];
  const svHas = u => { try { const h = new URL(u).hostname; return S.apps.find(a => a.kind === 'bapp' && new URL(a.url).hostname === h); } catch (_) { return null; } };
  async function addService(sv, eng) {
    const u = new URL(sv[1]), d = { id: 'bapp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'bapp', name: sv[0], tag: sv[2] + ' \u00B7 ' + u.hostname, url: sv[1], adblock: !sv[3], engine: 'built', auth: true, resume: true, cover: '', fit: '', coverAuto: true };
    await bappCover(d); S.apps.push(d); saveApps(); return d;
  }

  // ---------- settings ----------
  const NEWS = [
    ['Streaming services hub', 'Settings > Streaming services adds YouTube, Twitch, Netflix, Disney+ and more as apps in one tap. Each one remembers where you were.'],
    ['SKBrowse', 'A built-in browser with tabs, ad block and Chrome Web Store extensions. Settings > SKBrowse & browser apps turns any website into its own app, locked to that site.'],
    ['Cemu and other emulators', 'Start in a clean, full-screen window with the menu bar hidden, even when Remote play is off.'],
    ['Windows without leaving SKBox', 'The SK menu has a Windows page: switch to, fit, hide or close any window with the controller.'],
    ['Player controllers', 'Each controller now belongs to one player: Player 1\u2019s controller cannot use Player 2\u2019s things and the other way round. The highlight turns orange with a P2 tag when Player 2 is moving. Change who is who in Settings > Controllers, or press Y on a player chip on Home.'],
    ['Xbox button over fullscreen games', 'The menu now steps in front of any fullscreen game (even exclusive fullscreen) by minimizing it, and brings it back when you press Resume.'],
    ['Remote play: Fix black screen', 'If a fullscreen game looks black when streaming, use Fix black screen in the player\u2019s top bar.'],
    ['Remote play', 'Settings > Remote play: turn it on, then play your PC from a Mac or another PC on the same Wi-Fi with the SKBox Remote app (or just a web browser). It only runs while you have it turned on.'],
    ['Controller in the SK menu, fixed', 'The menu could look fine but ignore your controller. It now listens through two paths. Settings > Controller test shows what SKBox sees.'],
    ['Collections', 'In the Library press Y on an app > Add to collection. The Show chip at the top filters by All, On Home, Played lately, or a collection.'],
    ['Sleep timer', 'Settings > Power > Sleep timer: sleep, shut down or close your game after 30 min to 2 hours.'],
    ['Play stats', 'Settings > Play stats: total time, most played, longest session and launches.'],
    ['Preferences', 'Settings > Preferences: look (OLED black, Daylight), text size, 24-hour clock, screensaver, vibration, swap A/B, boost game priority, CPU and memory display, open an app at start.'],
    ['Back up and restore', 'Settings > About: save your apps, pins, settings and play time to a file, and restore them later.'],
    ['Screenshot shortcut', 'Press Ctrl+Shift+S any time to save a screenshot to Pictures\\SKBox.'],
    ['Earlier: Library, Close game, Bluetooth, screenshots, battery', 'Library tile on Home. Red Close game button. Settings > Bluetooth and > Screenshots. Controller battery next to the controller icon.']
  ];
  const BATLV = ['Empty', 'Low', 'Medium', 'Full'];
  const batText = () => { const b = (S.bat || {})[0]; if (!b || b.type === 0) return ''; if (b.type === 1) return 'Wired'; if (b.type === 255) return ''; return BATLV[b.level] || ''; };
  function showNews(root) {
    const L = el('div', 'layer'), b = el('div', 'box', '<h3>What\u2019s new in SKBox</h3>'), ul = el('ul', 'newlist');
    NEWS.forEach(([t, d]) => { const li = document.createElement('li'); li.innerHTML = '<b>' + esc(t) + '</b>: ' + esc(d); ul.appendChild(li); });
    const row = el('div', 'btnrow'), ok = nav(el('button', 'btn p', 'Got it')); ok.dataset.first = ''; ok.onclick = () => closeLayer(L); row.appendChild(ok); b.append(ul, row); L.appendChild(b); openLayer(L, () => closeLayer(L));
  }
  const CATS = [['wifi', '\u{1F4F6}', 'Wi-Fi'], ['controllers', '\u{1F3AE}', 'Controllers'], ['guide', '\u24E7', 'Xbox / PS button'], ['players', '\u{1F464}', 'Players'], ['apps', '\u{1F4E6}', 'Apps'], ['cozy', '\u2615', 'Backgrounds & sound'], ['display', '\u{1F3A8}', 'Display & startup'], ['shows', '\u{1F37F}', 'Streaming services'], ['browser', '\u{1F310}', 'SKBrowse & browser apps'], ['remote', '\u{1F4E1}', 'Remote play'], ['bluetooth', '\u16D2', 'Bluetooth'], ['shots', '\u{1F4F8}', 'Screenshots'], ['sound', '\u{1F50A}', 'Sound'], ['prefs', '\u{1F39B}', 'Preferences'], ['extras', '\u26A1', 'Extras & QOL'], ['bright', '\u{1F506}', 'Display & brightness'], ['windows', '\u{1FA9F}', 'Windows opened apps'], ['stats', '\u{1F4CA}', 'Play stats'], ['padtest', '\u{1F579}', 'Controller test'], ['power', '\u23FB', 'Power'], ['new', '\u2728', 'What\u2019s new'], ['about', '\u2139', 'About']];
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
  // a row that cycles through choices when you press A
  const cyc = (title, sub, opts, get, set) => { const b = row(title, sub, ''); const draw = () => { const o = opts.find(x => x[0] === get()) || opts[0]; b.querySelector('.r').textContent = o[1]; }; b.onclick = () => { const i = opts.findIndex(x => x[0] === get()); set(opts[(i + 1) % opts.length][0]); draw(); }; draw(); return b; };
  const toggle = (title, sub, on, fn) => { const b = row(title, sub, '<div class="tog' + (on ? ' on' : '') + '"></div>'); b.onclick = () => { on = !on; b.querySelector('.tog').classList.toggle('on', on); fn(on); }; return b; };
  const bars = s => '<span class="bars">' + [25, 50, 75, 100].map(t => '<i class="' + (s >= t - 12 ? 'on' : '') + '" style="height:' + (t / 100 * 16) + 'px"></i>').join('') + '</span>';
  function panel(id, pane) {
    clearInterval(clockTimer); S.remoteUpd = null; pane.innerHTML = ''; const h = t => { const x = el('h2', '', t); pane.appendChild(x); }, sub = t => pane.appendChild(el('div', 'sub', t));
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
      h('Controllers'); sub('Each controller belongs to one player. Player 1\u2019s controller can only act for Player 1, and Player 2\u2019s only for Player 2. Moving a controller highlights who is doing it.');
      const pads = K.pads(), own = K.owners();
      if (!pads.length) pane.appendChild(el('div', 'sub', 'No controllers detected yet. Press a button on one to wake it.'));
      pads.forEach(p => { const o = own[p.index]; const who = o === 0 ? 'Player 1' : o === 1 ? 'Player 2' : 'not used'; pane.appendChild(row(K.padName(p.index), (p.id || '').slice(0, 70), who, () => { try { const ac = p.vibrationActuator; ac && ac.playEffect('dual-rumble', { duration: 500, strongMagnitude: 1, weakMagnitude: .6 }); toast('Rumble sent to ' + who); } catch (_) {} })); });
      pane.appendChild(row('Choose which controller is Player ' + (S.players[1] ? '1 and 2' : '1'), 'Press A on the controller you want, one player at a time', '\u2192', () => assignFlow(0)));
      if (S.players[1]) pane.appendChild(row('Swap Player 1 and Player 2 controllers', 'One press, no need to pick again', '\u21C4', () => { swapPads(); go('settings', { cat: 'controllers' }); }));
      pane.appendChild(el('div', '', '<div style="height:1rem"></div>'));
      pane.appendChild(row('Pair a Bluetooth controller', 'Pair it right here in SKBox. Hold the controller\u2019s pairing button until its light flashes.', '\u2192', () => go('settings', { cat: 'bluetooth' })));
      pane.appendChild(row('Xbox / PlayStation controller by cable', 'USB controllers work instantly.', ''));
    } else if (id === 'players') {
      h('Players'); sub('Player 2 joins by pressing Start on a second controller. Each player\u2019s controller can only change that player\u2019s own things.');
      [0, 1].forEach(i => { const p = S.players[i], own = r => { r.dataset.owner = String(i); return r; };
        pane.appendChild(own(row('Player ' + (i + 1), p ? '@' + p.u + (p.stats ? ' \u00B7 ' + p.stats.playlists + ' playlists \u00B7 ' + p.stats.loved + ' liked songs' : '') : 'Empty', p ? esc(p.nick || p.u) : 'Add', () => go('profiles', { slot: i }))));
        if (p) pane.appendChild(own(row('Change picture for Player ' + (i + 1), 'Wild West, Blocky World, Neon City and Cozy icons, or your own image', '\u{1F5BC}', () => pfpPicker(i))));
        if (p && i === 1) pane.appendChild(own(row('Remove Player 2', '', '', () => { S.players[1] = null; S.active = 0; saveSettings(); go('settings', { cat: 'players' }); }))); });
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
        if (key !== 'dynamic') b.style.backgroundImage = 'url("' + bgUrl(key) + '")';
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
    } else if (id === 'prefs') {
      h('Preferences'); sub('Press A on a row to change it.');
      const sv = (k, v) => { S.settings[k] = v; saveSettings(); };
      pane.appendChild(cyc('Look', 'Midnight is the default. OLED black saves power on OLED TVs.', [['midnight', 'Midnight'], ['oled', 'OLED black'], ['daylight', 'Daylight'], ['sunset', 'Sunset'], ['ocean', 'Ocean'], ['forest', 'Forest'], ['rose', 'Rose'], ['cyber', 'Cyber'], ['graphite', 'Graphite'], ['sakura', 'Sakura']], () => S.settings.theme || 'midnight', v => { sv('theme', v); applyTheme(); }));
      pane.appendChild(cyc('Text and tile size', 'Bigger is easier to read from the couch.', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large'], ['huge', 'Huge']], () => S.settings.uiSize || 'normal', v => { sv('uiSize', v); applyTheme(); }));
      pane.appendChild(cyc('Clock', '', [['12', '12-hour'], ['24', '24-hour']], () => S.settings.clock24 ? '24' : '12', v => sv('clock24', v === '24')));
      pane.appendChild(toggle('Clean window for Remote play', 'Only while someone is connected with Remote play, games become a borderless window with no title bar, menu or taskbar in the way. Normal fullscreen is never touched when nobody is connected.', S.settings.gameWindow !== 'off', v => sv('gameWindow', v ? 'on' : 'off')));
      pane.appendChild(toggle('Ask who is playing at startup', 'Press A, then pick Player 1\u2019s profile every time SKBox opens', S.settings.askWho !== false, v => sv('askWho', v)));
      pane.appendChild(cyc('Idle screen', 'What shows when SKBox is left alone. Any button wakes it.', [['0', 'Off'], ['1', 'After 1 min'], ['2', 'After 2 min'], ['5', 'After 5 min'], ['10', 'After 10 min'], ['20', 'After 20 min']], () => String(S.settings.saver || 0), v => sv('saver', +v)));
      pane.appendChild(cyc('Idle screen style', 'A fancy clock with a soft glow, or a tiny drifting clock.', [['ambient', 'Fancy clock'], ['minimal', 'Simple clock']], () => S.settings.saverStyle || 'ambient', v => sv('saverStyle', v)));
      const IA = window.K.audio; pane.appendChild(cyc('Idle screen music', 'Plays softly while the idle screen is up.', [['off', 'Off']].concat(IA ? IA.moods() : []), () => S.settings.idleMood == null ? 'twilight' : S.settings.idleMood, v => { sv('idleMood', v); if (K.saverOn && IA && IA.idle) IA.idle(v === 'off' ? null : v); }));
      pane.appendChild(row('Show the idle screen now', 'Try it out. Press any button to leave it.', '\u2192', () => { K.lastInput = Date.now(); setTimeout(() => { if (!K.saverOn) saverShow(); }, 150); }));
      pane.appendChild(toggle('Controller vibration', 'A tiny buzz when you press A', S.settings.rumble !== false, v => sv('rumble', v)));
      pane.appendChild(toggle('Swap A and B', 'For Nintendo-style layout: B selects, A goes back', !!S.settings.swapAB, v => sv('swapAB', v)));
      pane.appendChild(toggle('Swap X and Y', 'X opens options, Y pins', !!S.settings.swapXY, v => sv('swapXY', v)));
      pane.appendChild(toggle('Boost game priority', 'Gives the game more CPU time while it runs (Windows, High priority)', !!S.settings.boost, v => sv('boost', v)));
      pane.appendChild(toggle('Show CPU and memory', 'On Home and in the SK menu', !!S.settings.hud, v => sv('hud', v)));
      const autoOpts = [['', 'Nothing']].concat(allApps().map(a => [a.id, a.name]));
      pane.appendChild(cyc('Open an app when SKBox starts', 'For example SKMusic', autoOpts, () => S.settings.autoApp || '', v => sv('autoApp', v)));


    } else if (id === 'shows') {
      h('Streaming services'); sub('Tap a service to add it to your Library as an app. Apps remember where you left off. Protected services (Netflix and others) play inside SKBrowse.');
      const eng0 = { edge: '' }; sk.browse.engines().then(e => { eng0.edge = e.edge; });
      pane.appendChild(row('Add all free services', 'YouTube, Twitch, Kick, Pluto TV, Tubi, Plex, Rumble, Vimeo, Dailymotion, Roku Channel, SoundCloud', '+', async () => {
        const stop = busy('Adding services\u2026'); let n = 0; for (const sv of SERVICES.filter(x => !x[3])) if (!svHas(sv[1])) { await addService(sv, eng0); n++; } stop(); toast(n ? n + ' services added. Press X on one to pin it to Home.' : 'They are all added already'); go('settings', { cat: 'shows' });
      }));
      [['Free and music', x => !x[3]], ['Subscription and protected video', x => x[3]]].forEach(([title, f]) => {
        pane.appendChild(el('h3', '', title));
        SERVICES.filter(f).forEach(sv => { const have = svHas(sv[1]);
          pane.appendChild(row(sv[0], sv[2] + '', have ? 'Added \u2713' : 'Add', () => {
            if (have) { menu(sv[0], [{ label: 'Open', fn: () => openApp(have) }, { label: 'Pin to Home', fn: () => { setPinned(have, true); toast(sv[0] + ' pinned to Home'); } }, { label: 'Edit\u2026', fn: () => bappMenu(have, () => go('settings', { cat: 'shows' })) }]); return; }
            (async () => { const e = await sk.browse.engines(); const stop = busy('Adding ' + sv[0] + '\u2026'); const d = await addService(sv, e); stop(); toast(sv[0] + ' added. Press X to pin it to Home.'); go('settings', { cat: 'shows', focus: d.id }); })();
          })); });
      });
    } else if (id === 'browser') {
      h('SKBrowse & browser apps'); sub('SKBrowse is a full browser with tabs, an ad blocker and Chrome extensions. Browser apps turn one website into its own app.');
      const sv = (k, v) => { S.settings[k] = v; saveSettings(); };
      const pad = () => Math.max(0, K.padIndexOf(S.active));
      pane.appendChild(el('h3', '', 'SKBrowse'));
      pane.appendChild(row('Open SKBrowse', 'Tabs, bookmarks, history and extensions. Start button opens its menu', '\u2192', () => sk.browse.open({ pad: pad() })));
      pane.appendChild(row('Open the Chrome Web Store', 'Browse extensions, then press Add to SKBrowse in the bar', '\u2192', () => sk.browse.open({ pad: pad(), url: 'https://chromewebstore.google.com/' })));
      const drmRow = row('Protected video (Netflix, Disney+, Hulu, Max\u2026)', 'Checking\u2026', '', null); pane.appendChild(drmRow);
      sk.browse.drmStatus().then(r => { if (!drmRow.isConnected) return; drmRow.querySelector('small').textContent = r.ok ? 'Ready. Widevine ' + (r.version || '') + ' is installed' : (r.why || 'Widevine is ' + (r.status || 'still downloading') + '. Restart SKBox if this stays like this'); });
      pane.appendChild(row('Install VidAngel for Chrome', 'Adds the VidAngel extension to SKBrowse. Sign in at vidangel.com afterwards', '+', async () => { toast('Installing VidAngel\u2026'); const r = await sk.browse.installExt('mbpfipleganodbgndfadpokojibnfhjb'); toast(r && r.ok ? 'VidAngel installed. Open vidangel.com in SKBrowse' : (r && r.error) || 'Could not install it'); }));
      const ad = row('Ad blocker', 'Blocks ad and tracker hosts, hides ad boxes, skips YouTube ads', '', null); pane.appendChild(ad);
      pane.appendChild(toggle('Ad blocker on', 'The default for SKBrowse. Browser apps have their own switch', S.settings.sbAdblock !== false, v => sv('sbAdblock', v)));
      const lst = row('Update the filter list', 'Downloads a larger ad and tracker list', '\u2193', async () => { toast('Downloading\u2026'); const r = await sk.browse.updateList(); toast(r.ok ? r.n + ' hosts blocked (' + r.added + ' new)' : r.error || 'Could not update'); });
      pane.appendChild(lst);
      sk.browse.engines().then(e => { if (!ad.isConnected) return; ad.querySelector('.r').textContent = e.stats.hosts + ' hosts'; });
      pane.appendChild(toggle('Dark pages', 'Turns bright websites dark', !!S.settings.sbDark, v => sv('sbDark', v)));
      pane.appendChild(toggle('Hide cookie banners', 'Removes consent pop-ups', S.settings.sbCookies !== false, v => sv('sbCookies', v)));
      pane.appendChild(toggle('Strip tracking from links', 'Removes utm_, fbclid, gclid and similar', S.settings.sbClean !== false, v => sv('sbClean', v)));
      pane.appendChild(toggle('Send Do Not Track', 'Asks sites not to track you', S.settings.sbDnt !== false, v => sv('sbDnt', v)));
      pane.appendChild(toggle('Block permission pop-ups', 'Location, notifications, camera and mic requests are refused', S.settings.sbPerms !== false, v => sv('sbPerms', v)));
      pane.appendChild(toggle('Always use https', 'Upgrades http links', !!S.settings.sbHttpsAll, v => sv('sbHttpsAll', v)));
      pane.appendChild(toggle('Skip intro, recap and next-episode buttons', 'Clicks them for you while you watch', S.settings.sbSkipIntro !== false, v => sv('sbSkipIntro', v)));
      pane.appendChild(toggle('Hide the mouse over videos', 'Disappears after 3 seconds', S.settings.sbHideCursor !== false, v => sv('sbHideCursor', v)));
      pane.appendChild(toggle('Video speed keys', '[ slower, ] faster, \\ normal', S.settings.sbSpeedKeys !== false, v => sv('sbSpeedKeys', v)));
      pane.appendChild(toggle('Clock in the bar', '', S.settings.sbClock !== false, v => sv('sbClock', v)));
      pane.appendChild(toggle('Reopen my tabs next time', 'SKBrowse restores the tabs you had', !!S.settings.sbRestore, v => sv('sbRestore', v)));
      pane.appendChild(toggle('Forget cookies when SKBrowse closes', 'Signs you out each time', !!S.settings.sbClearExit, v => sv('sbClearExit', v)));
      pane.appendChild(toggle('Upgrade typed addresses to https', 'youtube.com opens as https://youtube.com', S.settings.sbHttps !== false, v => sv('sbHttps', v)));
      pane.appendChild(toggle('Open SKBrowse fullscreen', 'Off gives a normal window', S.settings.sbFullscreen !== false, v => sv('sbFullscreen', v)));
      pane.appendChild(toggle('Remember history', 'Sites you visited, shown in the History page', S.settings.sbHistory !== false, v => sv('sbHistory', v)));
      pane.appendChild(toggle('Closing the last tab leaves SKBrowse', 'Off opens a new tab instead', S.settings.sbCloseLast === 'exit', v => sv('sbCloseLast', v ? 'exit' : 'home')));
      pane.appendChild(cyc('Search engine', 'Used when you type words instead of an address', [['google', 'Google'], ['duckduckgo', 'DuckDuckGo'], ['bing', 'Bing'], ['brave', 'Brave'], ['youtube', 'YouTube']], () => S.settings.sbSearch || 'google', v => sv('sbSearch', v)));
      pane.appendChild(cyc('Page zoom', 'Default size of web pages', [100, 110, 125, 150, 175, 200].map(n => [String(n), n + '%']), () => String(S.settings.sbZoom || 100), v => sv('sbZoom', +v)));
      pane.appendChild(row('Home page', (S.settings.sbHome || 'A new-tab page with shortcuts'), '\u2192', () => osk({ title: 'Home page (empty = new-tab page)', value: S.settings.sbHome || '', submitLabel: 'Save', onDone: v => { sv('sbHome', (v || '').trim()); go('settings', { cat: 'browser' }); } })));
      pane.appendChild(toggle('Update the filter list by itself', 'About once a week, in the background', S.settings.sbAutoList !== false, v => sv('sbAutoList', v)));
      pane.appendChild(el('h3', '', 'Tidy up'));
      [['Clear cookies', 'cookies', 'Signs you out of sites in SKBrowse'], ['Clear the cache', 'cache', 'Frees space'], ['Clear history', 'history', 'The History page'], ['Clear bookmarks', 'bookmarks', 'All of them'], ['Clear the downloads list', 'downloads', 'The list only, not the files']].forEach(([t, k, d0]) => pane.appendChild(row(t, d0, '', () => confirm(t + '?', d0 + '.', 'Clear', async () => { await sk.browse.clear(k); toast('Done'); }, true))));
      pane.appendChild(row('Open the Downloads folder', '', '\u2192', () => sk.browse.openDownloads()));
      pane.appendChild(row('Export bookmarks to the Desktop', 'A standard bookmarks file other browsers can import', '\u2192', async () => { const r = await sk.browse.exportBookmarks(); toast(r.ok ? r.n + ' bookmarks exported' : 'Could not export'); }));
      pane.appendChild(row('Reset SKBrowse options', 'Puts every SKBrowse switch back to its default', '', () => confirm('Reset SKBrowse options?', 'Your bookmarks, history and apps stay.', 'Reset', async () => { await sk.browse.resetOpts(); S.settings = (await sk.store.get('settings', {})) || S.settings; toast('Reset'); go('settings', { cat: 'browser' }); })));
      pane.appendChild(el('div', 'sub', 'Hotkeys: Ctrl+Alt+Shift+B opens SKBrowse, +H hides it and returns to SKBox, +M shows the desktop, +T opens Task Manager. In SKBrowse: Ctrl+T new tab, Ctrl+L address, Ctrl+W close tab, F10 hides the bar, [ and ] change video speed.'));
      pane.appendChild(el('h3', '', 'Browser apps'));
      pane.appendChild(row('Create a browser app', 'Type a website. It becomes an app that only opens that site, with its icon as the cover', '+', () => createBapp(() => go('settings', { cat: 'browser' }))));
      const bl = bapps();
      if (!bl.length) pane.appendChild(el('div', 'sub', 'No browser apps yet. Try youtube.com or twitch.tv.'));
      bl.forEach(a => pane.appendChild(row(a.name, (new URL(a.url).hostname) + ' \u00B7 ads ' + (a.adblock !== false ? 'blocked' : 'allowed') + ' \u00B7 ' + (a.engine === 'edge' ? 'Edge window' : 'SKBrowse'), '\u2026', () => bappMenu(a, () => go('settings', { cat: 'browser' })))));
      pane.appendChild(el('h3', '', 'Extensions'));
      const ex = row('Manage extensions', 'Install from the Chrome Web Store with a link or the Add button', '\u2192', () => sk.browse.open({ pad: pad() })); pane.appendChild(ex);
      sk.browse.engines().then(e => { if (ex.isConnected) ex.querySelector('.r').textContent = (e.ext || []).length + ' installed'; });
      pane.appendChild(el('div', 'sub', 'Open SKBrowse > Start > Extensions to install, turn off or remove them. SKBrowse runs many Chrome extensions but not all of them.'));
    } else if (id === 'windows') {
      h('Windows opened apps'); sub('Everything open on this PC. Close asks the app to close, and ends it if it will not.');
      const X = (n, a) => sk.extras.do(n, a), sv = (k, v) => { S.settings[k] = v; saveSettings(); };
      const say = (r, ok) => toast(r && r.ok ? (ok || 'Done') : ((r && r.error) || 'That did not work'));
      const info = el('div', 'sub', 'Loading\u2026'); pane.appendChild(info);
      const box = el('div'), sel = new Map(); let last = [];
      const bar = el('div', 'btnrow'), mkb = (label, fn) => { const b = nav(el('button', 'btn', label)); b.onclick = fn; bar.appendChild(b); return b; };
      const upd = () => { cs.textContent = 'Close selected (' + sel.size + ')'; fs2.textContent = 'Force close selected'; };
      const closeSel = force => { if (!sel.size) { toast('Tap windows in the list to select them first'); return; } const run = async () => { const items = Array.from(sel.values()); toast((force ? 'Ending ' : 'Closing ') + items.length + '\u2026'); for (const w of items) await X('winClose', { h: w.h, pid: w.pid, force }); sel.clear(); setTimeout(draw, 900); }; if (S.settings.winConfirm === false) run(); else confirm((force ? 'Force close ' : 'Close ') + sel.size + ' selected?', Array.from(sel.values()).map(w => w.n || w.t).slice(0, 6).join(', ') + (sel.size > 6 ? '\u2026' : ''), force ? 'Force close' : 'Close them', run, true); };
      const cs = mkb('Close selected (0)', () => closeSel(false)), fs2 = mkb('Force close selected', () => closeSel(true));
      mkb('Select all others', () => { last.forEach(w => { if (!w.game && !w.prot) sel.set(w.h, w); }); draw(); }); mkb('Select none', () => { sel.clear(); draw(); });
      pane.appendChild(bar);
      const draw = async () => {
        const r = await X('winList'); if (!pane.isConnected) return; box.innerHTML = ''; last = (r && r.wins) || []; Array.from(sel.keys()).forEach(k => { if (!last.some(w => w.h === k)) sel.delete(k); }); upd();
        if (!r || !r.ok) { info.textContent = (r && r.error) || 'Could not read the windows.'; return; }
        info.textContent = r.wins.length + ' open' + (r.game ? ' \u00B7 \u2605 is ' + r.game : '');
        r.wins.forEach(w => {
          const it = el('div', 'item'); it.innerHTML = '<div>' + (sel.has(w.h) ? '\u2611 ' : '\u2610 ') + (w.game ? '\u2605 ' : '') + esc(w.t) + '<small>' + esc(w.n || 'unknown program') + ' \u00B7 ' + w.m + ' MB' + (w.min ? ' \u00B7 minimized' : '') + '</small></div>';
          const act = el('div', 'btnrow'); act.style.margin = '0';
          const mk = (label, fn) => { const b = nav(el('button', 'btn', label)); b.onclick = fn; act.appendChild(b); };
          const doClose = force => { const go2 = async () => { toast(force ? 'Ending it\u2026' : 'Closing\u2026'); const rr = await X('winClose', { h: w.h, pid: w.pid, force }); say(rr, rr && rr.state === 'forced' ? 'Ended' : 'Closed'); draw(); };
            if (S.settings.winConfirm === false) go2(); else confirm((force ? 'Force close ' : 'Close ') + (w.n || w.t) + '?', force ? 'It ends at once and may lose unsaved work. All windows of this app close.' : 'If it does not close in a few seconds, SKBox ends it.', force ? 'Force close' : 'Close', go2, true); };
          if (!w.prot) mk(sel.has(w.h) ? 'Selected \u2713' : 'Select', () => { if (sel.has(w.h)) sel.delete(w.h); else sel.set(w.h, w); draw(); });
          mk('Switch', async () => { await X('winSwitch', { h: w.h }); }); mk('Fit', async () => { await X('winFit', { h: w.h }); toast('Fitted to the screen'); });
          mk('Close', () => doClose(false)); if (!w.prot) mk('Force', () => doClose(true));
          mk(w.min ? 'Show' : 'Hide', async () => { await X(w.min ? 'winFront' : 'winMin', { h: w.h }); setTimeout(draw, 500); });
          it.appendChild(act); box.appendChild(it);
        });
      };
      pane.appendChild(row('Close the running game', 'Ends the game SKBox started', '', async () => { toast('Closing\u2026'); say(await X('closeGame'), 'Closed'); draw(); }));
      pane.appendChild(row('Refresh the list', '', '\u21BB', () => draw()));
      pane.appendChild(row('Show the desktop', 'Minimizes every window. Ctrl+Alt+Shift+M', '', () => X('minAll')));
      pane.appendChild(row('Open Task Manager', 'Ctrl+Alt+Shift+T', '', () => X('taskmgr')));
      pane.appendChild(row('Open File Explorer', 'Your home folder', '', () => X('openExplorer')));
      pane.appendChild(row('Close all other apps', 'Asks every open window to close, except SKBox and the game', '', () => confirm('Close all other apps?', 'Anything unsaved may ask to be saved first.', 'Close them', async () => { const r = await X('winCleanup'); say(r, (r.n || 0) + ' windows asked to close'); setTimeout(draw, 3000); }, true)));
      pane.appendChild(toggle('Refresh by itself', 'Updates the list every few seconds', S.settings.winAuto !== false, v => sv('winAuto', v)));
      pane.appendChild(toggle('Hide system windows', 'Keeps Windows\u2019 own background windows out of the list', S.settings.winHideSys !== false, v => sv('winHideSys', v)));
      pane.appendChild(toggle('Ask before closing', 'A confirmation for Close and Force', S.settings.winConfirm !== false, v => sv('winConfirm', v)));
      pane.appendChild(cyc('Sort by', '', [['name', 'Name'], ['mem', 'Memory used']], () => S.settings.winSort || 'name', v => { sv('winSort', v); draw(); }));
      pane.appendChild(box); draw();
      const tm = setInterval(() => { if (!pane.isConnected) return clearInterval(tm); if (S.settings.winAuto !== false && !document.querySelector('.layer')) draw(); }, 4000);
    } else if (id === 'bright') {
      h('Display & brightness'); sub('Brightness works on laptop and built-in screens. The dimmer and night filter work on any monitor.');
      const X = (n, a) => sk.extras.do(n, a), sv = (k, v) => { S.settings[k] = v; saveSettings(); };
      const dv = async (k, v) => { S.settings[k] = v; await X('display', { k, v }); };
      const act = async (a, v, msg) => { const r = await X('displayAction', { a, v }); if (r && r.settings) ['brightness', 'dim', 'warm'].forEach(k => { S.settings[k] = r.settings[k]; }); toast(msg || 'Done'); };
      const st = row('Brightness control', 'Checking this screen\u2026', '', null); pane.appendChild(st);
      X('displayStatus').then(r => { if (!st.isConnected) return; st.querySelector('small').textContent = r.supported ? 'This screen supports brightness control' : 'No brightness control on this screen. Use the dimmer instead'; st.querySelector('.r').textContent = r.supported ? 'Available' : 'Dimmer only'; });
      pane.appendChild(el('h3', '', 'Brightness'));
      const bo = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => [String(n), n + '%']), bc = String(S.settings.brightness == null ? 100 : S.settings.brightness); if (!bo.some(o => o[0] === bc)) bo.push([bc, bc + '%']);
      pane.appendChild(cyc('Brightness', 'Built-in screens only', bo, () => String(S.settings.brightness == null ? 100 : S.settings.brightness), v => dv('brightness', +v)));
      pane.appendChild(row('Brighter', 'Ctrl+Alt+Shift+Up', '+', () => act('step', 1, 'Brighter')));
      pane.appendChild(row('Darker', 'Ctrl+Alt+Shift+Down', '\u2212', () => act('step', -1, 'Darker')));
      pane.appendChild(el('h3', '', 'Quick looks'));
      pane.appendChild(row('Day', 'Full brightness, no filter', '', () => act('preset', 'day', 'Day look')));
      pane.appendChild(row('Evening', 'A little dimmer with a warm filter', '', () => act('preset', 'evening', 'Evening look')));
      pane.appendChild(row('Night', 'Dim and warm, easy on the eyes', '', () => act('preset', 'night', 'Night look')));
      pane.appendChild(row('Reset the screen', 'Brightness 100%, dimmer and filter off', '', () => act('reset', 0, 'Screen reset')));
      pane.appendChild(el('h3', '', 'Dimmer and night filter (any monitor)'));
      pane.appendChild(cyc('Screen dimmer', 'Ctrl+Alt+Shift+D', [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(n => [String(n), n ? n + '%' : 'Off']), () => String(S.settings.dim || 0), v => dv('dim', +v)));
      pane.appendChild(cyc('Night filter', 'Warm light. Ctrl+Alt+Shift+N', [['0', 'Off'], ['1', 'Soft'], ['2', 'Medium'], ['3', 'Strong']], () => String(S.settings.warm || 0), v => dv('warm', +v)));
      pane.appendChild(cyc('Filter color', '', [['amber', 'Soft amber'], ['orange', 'Orange'], ['red', 'Red']], () => S.settings.warmTint || 'amber', v => { sv('warmTint', v); X('display', { k: 'warmTint', v }); }));
      pane.appendChild(cyc('Night schedule', 'Medium filter turns on by itself', [['off', 'Off'], ['20-7', '8 pm to 7 am'], ['21-6', '9 pm to 6 am'], ['22-6', '10 pm to 6 am']], () => S.settings.nightAuto || 'off', v => { sv('nightAuto', v); X('display', { k: 'nightAuto', v }); }));
      pane.appendChild(cyc('Dimmer limit', 'The screen never gets darker than this', [50, 60, 70, 80, 90].map(n => [String(n), n + '%']), () => String(S.settings.dimCap || 70), v => { sv('dimCap', +v); X('display', { k: 'dimCap', v: +v }); }));
      pane.appendChild(el('h3', '', 'While gaming'));
      pane.appendChild(cyc('Game brightness', 'Set when a game starts, put back afterwards', [['0', 'Off'], ['40', '40%'], ['60', '60%'], ['80', '80%'], ['100', '100%']], () => String(S.settings.gameBright || 0), v => sv('gameBright', +v)));
      pane.appendChild(el('h3', '', 'Keys'));
      pane.appendChild(cyc('Brightness step', 'For the hotkeys and Brighter / Darker', [['5', '5%'], ['10', '10%'], ['20', '20%']], () => String(S.settings.brightStep || 10), v => sv('brightStep', +v)));
      pane.appendChild(toggle('Display hotkeys', 'Ctrl+Alt+Shift with Up, Down, D and N', S.settings.brightKeys !== false, v => sv('brightKeys', v)));
      pane.appendChild(toggle('Show a small notice when it changes', 'A quiet notification', S.settings.osd !== false, v => sv('osd', v)));
    } else if (id === 'extras') {
      h('Extras & QOL'); sub('Remote play tuning, reminders and helpers. Changes apply right away.');
      const sv = (k, v) => { S.settings[k] = v; saveSettings(); };
      const sec = t => pane.appendChild(el('h3', '', t));
      const X = (n, a) => sk.extras.do(n, a);
      const say = (r, ok) => toast(r && r.ok ? (ok || 'Done') : ((r && r.error) || 'That did not work'));
      sec('Remote play: speed and quality');
      pane.appendChild(toggle('Auto quality', 'Lowers quality when the connection is weak, raises it again when it recovers', S.settings.remoteAutoQ !== false, v => sv('remoteAutoQ', v)));
      pane.appendChild(toggle('Tell the player when quality changes', 'Small notices on the player: weak connection, recovered', S.settings.remoteNotices !== false, v => sv('remoteNotices', v)));
      pane.appendChild(toggle('Warn about CPU video encoding', 'Software encoding adds delay. Shows a tip on the player', S.settings.remoteEncWarn !== false, v => sv('remoteEncWarn', v)));
      pane.appendChild(toggle('Show the mouse cursor in the stream', 'Turn off if the cursor is in the way', S.settings.remoteCursor !== false, v => sv('remoteCursor', v)));
      sec('Remote play: the game window');
      pane.appendChild(toggle('Hide the taskbar while streaming', 'It comes back when the player disconnects', S.settings.remoteTaskbar !== false, v => sv('remoteTaskbar', v)));
      pane.appendChild(cyc('Game window fit', 'How the game fills the screen while streaming', [['auto', 'Auto'], ['stretch', 'Fill the screen'], ['aspect', 'Keep shape, black bars']], () => S.settings.remoteFit || 'auto', v => sv('remoteFit', v)));
      pane.appendChild(row('Fit the game window now', 'Same as Ctrl+Alt+Shift+F', '\u2192', async () => { sk.remote.fix(); toast('Fitting the window\u2026'); }));
      pane.appendChild(row('Undo window fit', 'Gives the game its normal window and menu back', '\u2192', async () => say(await X('undoFit'), 'Window restored')));
      pane.appendChild(toggle('Fit hotkey (Ctrl+Alt+Shift+F)', 'Fits the game window from the keyboard', S.settings.fitKey !== false, v => sv('fitKey', v)));
      sec('Emulators (Cemu and friends)');
      pane.appendChild(toggle('Auto full-screen for emulators', 'Cemu, Dolphin, Yuzu, RPCS3 and others start in a clean full-screen window with no title bar or menu. Works with Remote play on or off', S.settings.emuMax !== false, v => sv('emuMax', v)));
      pane.appendChild(toggle('Sharper stream for emulators', 'Remote play uses 1080p at 60 fps while an emulator runs. Auto quality still steps down on weak Wi-Fi', S.settings.remoteSmart !== false, v => sv('remoteSmart', v)));
      sec('Remote play: safety and power');
      pane.appendChild(toggle('Turn Remote play on when SKBox starts', 'Off by default. The PIN is still required', !!S.settings.remoteAutoStart, v => sv('remoteAutoStart', v)));
      pane.appendChild(cyc('Disconnect when nobody uses it', 'Ends the session if no key, mouse or button is used', [['0', 'Never'], ['5', 'After 5 min'], ['15', 'After 15 min'], ['30', 'After 30 min'], ['60', 'After 1 hour']], () => String(S.settings.remoteIdle || 0), v => sv('remoteIdle', +v)));
      pane.appendChild(cyc('When the player disconnects', 'What happens to the game that is running', [['nothing', 'Keep playing'], ['minimize', 'Minimize the game'], ['close', 'Close the game'], ['lock', 'Lock this PC']], () => S.settings.remoteLeave || 'nothing', v => sv('remoteLeave', v)));
      pane.appendChild(toggle('New PIN after every session', 'Someone who saw the old PIN cannot reuse it', !!S.settings.remoteNewPin, v => sv('remoteNewPin', v)));
      pane.appendChild(toggle('Keep this PC awake while streaming', 'No screen sleep during a session', S.settings.remoteAwake !== false, v => sv('remoteAwake', v)));
      pane.appendChild(row('Copy the Remote play address', 'Paste it in a browser on the other device', '\u2192', async () => say(await X('copyAddr'), 'Address copied')));
      sec('Playing');
      const tr = row('Played today', 'Counts only while a game started from SKBox is running', '', null); pane.appendChild(tr);
      X('today').then(r => { if (tr.isConnected) tr.querySelector('.r').textContent = Math.round((r.ms || 0) / 60000) + ' min'; });
      pane.appendChild(cyc('Break reminder', 'A notification while a game runs', [['0', 'Off'], ['30', 'Every 30 min'], ['60', 'Every hour'], ['90', 'Every 90 min'], ['120', 'Every 2 hours']], () => String(S.settings.breakMin || 0), v => sv('breakMin', +v)));
      pane.appendChild(cyc('Daily play limit', 'One notification when you pass it', [['0', 'Off'], ['1', '1 hour'], ['2', '2 hours'], ['3', '3 hours'], ['4', '4 hours'], ['6', '6 hours']], () => String(S.settings.dailyLimit || 0), v => sv('dailyLimit', +v)));
      pane.appendChild(toggle('Session summary', 'A notification with your time when a game closes', S.settings.summary !== false, v => sv('summary', v)));
      pane.appendChild(toggle('Panic hotkey (Ctrl+Alt+Shift+K)', 'Closes the running game right away', S.settings.panicKey !== false, v => sv('panicKey', v)));
      sec('Remote play: stream tuning (for lag)');
      pane.appendChild(cyc('Frame rate', 'Lower can feel smoother on weak Wi-Fi', [['0', 'Preset'], ['30', '30 fps'], ['45', '45 fps'], ['60', '60 fps']], () => String(S.settings.remoteFps || 0), v => sv('remoteFps', +v)));
      pane.appendChild(cyc('Resolution', 'Lower means less delay', [['0', 'Preset'], ['540', '540p'], ['720', '720p'], ['900', '900p'], ['1080', '1080p']], () => String(S.settings.remoteRes || 0), v => sv('remoteRes', +v)));
      pane.appendChild(cyc('Top bitrate', 'Mbps. Lower is safer on Wi-Fi', [['0', 'Preset'], ['3000', '3 Mbps'], ['5000', '5 Mbps'], ['8000', '8 Mbps'], ['12000', '12 Mbps'], ['20000', '20 Mbps'], ['30000', '30 Mbps']], () => String(S.settings.remoteKbps || 0), v => sv('remoteKbps', +v)));
      pane.appendChild(cyc('When it struggles', 'What to give up first', [['framerate', 'Keep it smooth'], ['resolution', 'Keep it sharp'], ['balanced', 'Balance both']], () => S.settings.remotePref || 'framerate', v => sv('remotePref', v)));
      pane.appendChild(toggle('Stream sound', 'Turn off to test whether sound adds delay', S.settings.remoteAudio !== false, v => sv('remoteAudio', v)));
      pane.appendChild(toggle('Boost SKBox while streaming', 'Higher priority for the streaming parts', S.settings.remoteBoost !== false, v => sv('remoteBoost', v)));
      pane.appendChild(row('Test the link to my router', 'Shows if Wi-Fi is the cause of lag', '\u2192', async () => { toast('Testing\u2026'); const r = await X('ping'); r && r.ok ? confirm('Router test', r.text, 'OK', () => {}, false) : say(r); }));
      sec('Remote play: more safety and automation');
      pane.appendChild(cyc('Session time limit', 'Ends the session after this long', [['0', 'None'], ['1', '1 hour'], ['2', '2 hours'], ['4', '4 hours'], ['8', '8 hours']], () => String(S.settings.remoteMaxH || 0), v => sv('remoteMaxH', +v)));
      pane.appendChild(cyc('When the game closes', 'What happens to the connected player', [['nothing', 'Stay connected'], ['disconnect', 'Disconnect the player']], () => S.settings.remoteGameEnd || 'nothing', v => sv('remoteGameEnd', v)));
      pane.appendChild(cyc('Start this app when a player connects', 'Pick one of your apps', [['', 'None']].concat((S.apps || []).map(a => [a.id, a.name])), () => S.settings.remoteAutoApp || '', v => sv('remoteAutoApp', v)));
      pane.appendChild(row('Copy the PIN', '', '\u2192', async () => say(await X('copyPin'), 'PIN copied')));
      pane.appendChild(row('Copy address and PIN', 'Ready to send to yourself', '\u2192', async () => say(await X('copyConnect'), 'Copied')));
      sec('Game performance');
      pane.appendChild(toggle('High performance power plan while gaming', 'Switched back when the game closes', !!S.settings.gamePlan, v => sv('gamePlan', v)));
      pane.appendChild(toggle('Silence Windows notifications while gaming', 'No pop-ups over the game. Turned back on afterwards', !!S.settings.gameQuiet, v => sv('gameQuiet', v)));
      pane.appendChild(toggle('Windows Game Mode', 'Lets Windows favor the game', !!S.settings.gameModeOn, v => sv('gameModeOn', v)));
      pane.appendChild(toggle('Stop the Xbox button opening Game Bar', 'Fixes the controller button fighting SKBox', !!S.settings.noNexus, v => sv('noNexus', v)));
      pane.appendChild(toggle('Hide the taskbar while a game runs', 'Not only during Remote play', !!S.settings.gameTaskbar, v => sv('gameTaskbar', v)));
      pane.appendChild(cyc('Closing a game', 'Used by every Close button', [['polite', 'Ask first, then force'], ['force', 'Force at once']], () => S.settings.closeMode || 'polite', v => sv('closeMode', v)));
      pane.appendChild(cyc('Close a game after', 'Ends it when the time is up', [['0', 'Never'], ['1', '1 hour'], ['2', '2 hours'], ['3', '3 hours'], ['4', '4 hours']], () => String(S.settings.gameMaxH || 0), v => sv('gameMaxH', +v)));
      pane.appendChild(cyc('Rest your eyes reminder', '20 feet, 20 seconds', [['0', 'Off'], ['20', 'Every 20 min'], ['30', 'Every 30 min'], ['45', 'Every 45 min']], () => String(S.settings.eyeMin || 0), v => sv('eyeMin', +v)));
      const wk = row('Played in the last 7 days', '', '', null); pane.appendChild(wk);
      X('week').then(r => { if (wk.isConnected) wk.querySelector('.r').textContent = Math.round((r.ms || 0) / 60000) + ' min'; });
      pane.appendChild(row('Clear today\u2019s playtime', '', '\u2192', async () => say(await X('clearToday'), 'Cleared')));
      pane.appendChild(row('Close the running game', 'Ends the game SKBox started', '\u2192', async () => { toast('Closing\u2026'); say(await X('closeGame'), 'Closed'); }));
      sec('Helpers');
      pane.appendChild(toggle('Hotkeys', 'Master switch for every Ctrl+Alt+Shift hotkey', S.settings.hotkeysOn !== false, v => sv('hotkeysOn', v)));
      pane.appendChild(row('Hotkey list', '', '\u2192', () => confirm('Hotkeys', 'Ctrl+Alt+Shift with:  F fit the game window  \u00B7  K close the game  \u00B7  Up / Down brightness  \u00B7  D dimmer  \u00B7  N night filter.  Ctrl+Shift+S takes a screenshot.', 'OK', () => {}, false)));
      pane.appendChild(toggle('Quiet notifications', 'No sound with SKBox notifications', !!S.settings.notifSilent, v => sv('notifSilent', v)));
      pane.appendChild(row('Open Display settings', 'Windows', '\u2192', () => X('open', 'display')));
      pane.appendChild(row('Open Graphics settings', 'Windows: per-game GPU and windowed-game options', '\u2192', () => X('open', 'graphics')));
      pane.appendChild(row('Open Network settings', 'Windows', '\u2192', () => X('open', 'network')));
      pane.appendChild(row('Open Task Manager', '', '\u2192', () => X('open', 'taskmgr')));
      pane.appendChild(row('Restart the helper', 'If the controller or window features stop working', '\u2192', async () => { await X('restartHelper'); toast('Helper restarting\u2026'); }));
      pane.appendChild(row('Save diagnostics to the Desktop', 'A text file you can send', '\u2192', async () => say(await X('exportDiag'), 'Saved')));
      pane.appendChild(toggle('Windows notifications', 'Turn off to silence everything SKBox shows', S.settings.notifications !== false, v => sv('notifications', v)));
      pane.appendChild(row('Send a test notification', '', '\u2192', async () => say(await X('testNotify'), 'Sent')));
      pane.appendChild(row('Check for updates now', 'SKBox also checks every few hours', '\u2192', async () => { toast('Checking\u2026'); const r = await X('update'); say(r, r && r.latest && r.latest !== r.current ? 'Update ' + r.latest + ' is downloading' : 'You have the newest version'); }));
      pane.appendChild(row('Restart SKBox', 'Closes and opens SKBox again', '\u2192', () => confirm('Restart SKBox?', 'A running game keeps running.', 'Restart', () => X('restart'), false)));
      pane.appendChild(row('Copy diagnostics', 'Version, helper status, Remote play stats. Paste it when asking for help', '\u2192', async () => say(await X('diag'), 'Copied')));
      pane.appendChild(row('Open the SKBox data folder', 'Settings, covers and logs', '\u2192', async () => say(await X('openData'))));
      pane.appendChild(row('Open the helper log', 'Shows errors from the controller / window helper', '\u2192', async () => say(await X('openLog'))));
      pane.appendChild(row('Reset Extras to defaults', '', '\u2192', () => confirm('Reset Extras?', 'Every setting on this page goes back to its default.', 'Reset', async () => { await X('reset'); S.settings = await sk.store.get('settings', {}) || S.settings; toast('Extras reset'); go('settings', { cat: 'extras' }); }, false)));
    } else if (id === 'stats') {
      h('Play stats'); const st = S.stats || {}, rows = allApps().map(a => ({ a, x: st[a.id] || { ms: 0, n: 0, last: 0, best: 0 } })).filter(o => o.x.ms || o.x.n);
      const total = rows.reduce((t, o) => t + (o.x.ms || 0), 0), opens = rows.reduce((t, o) => t + (o.x.n || 0), 0), fh = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
      if (!rows.length) { sub('Nothing yet. Play something and it shows up here.'); }
      else {
        sub('Games track time while they run. Apps like SKchat count how often you open them.');
        pane.appendChild(row('Total play time', 'Across all games', fh(total), null)); pane.appendChild(row('Times you launched something', '', String(opens), null));
        const top = rows.filter(o => o.x.ms).sort((p, q) => q.x.ms - p.x.ms)[0]; if (top) pane.appendChild(row('Most played', top.a.name, fh(top.x.ms), null));
        const longest = rows.filter(o => o.x.best).sort((p, q) => q.x.best - p.x.best)[0]; if (longest) pane.appendChild(row('Longest session', longest.a.name, fh(longest.x.best), null));
        pane.appendChild(el('h2', '', 'By game'));
        rows.sort((p, q) => (q.x.ms || 0) - (p.x.ms || 0)).slice(0, 12).forEach(o => pane.appendChild(row(o.a.name, (o.x.n || 0) + ' launches \u00B7 last ' + (o.x.last ? fmtAgo(o.x.last) : 'never'), o.x.ms ? fh(o.x.ms) : '', null)));
      }
    } else if (id === 'padtest') {
      h('Controller test'); sub('Press buttons and move the D-pad. \u201CBrowser\u201D works while SKBox is in front. \u201CHelper\u201D also works over a game. If Helper counts up, the SK menu will see your controller.');
      const LBL = { up: 'D-pad up', down: 'D-pad down', left: 'D-pad left', right: 'D-pad right', ok: 'A / Cross', back: 'B / Circle', alt: 'X / Square', opts: 'Y / Triangle', prev: 'LB / L1', next: 'RB / R1', start: 'Start / Options', select: 'View / Share' };
      const live = el('div', 'sub'); live.style.lineHeight = '1.9'; pane.appendChild(live);
      const draw = () => { if (!live.isConnected) return; live.innerHTML = '<b>Browser:</b> ' + K.padCount.api + ' presses &nbsp;&nbsp; <b>Helper:</b> ' + K.padCount.helper + ' presses<br>' + (K.padLog.length ? K.padLog.slice().reverse().slice(0, 8).map(e => esc((LBL[e.a] || e.a) + '  (' + (e.src === 'helper' ? 'helper' : 'browser') + ')')).join('<br>') : 'Waiting for a button\u2026'); };
      K.onPadLog = draw; draw(); if (!S.padTestOn) { S.padTestOn = true; sk.helper.padTest(true); }
      pane.appendChild(row('Reset counters', '', '\u21BA', () => { K.padCount.api = 0; K.padCount.helper = 0; K.padLog.length = 0; draw(); }));
    } else if (id === 'remote') {
      h('Remote play'); sub('Play this PC from a Mac or another PC on the same Wi-Fi. It only runs while you turn it on here, and it turns itself off when SKBox closes.');
      const box = el('div'); pane.appendChild(box); let st = null;
      const fmtSt = s => s ? [s.w && s.h ? s.w + 'x' + s.h : '', s.fps ? s.fps + ' fps' : '', s.kbps ? (s.kbps / 1000).toFixed(1) + ' Mbps' : '', s.rtt ? s.rtt + ' ms' : '', s.codec || '', s.hw === false && s.codec ? 'software encode' : ''].filter(Boolean).join(' \u00B7 ') : '';
      const QO = [['instant', '540p \u00B7 60 fps (lowest delay)'], ['smooth', '720p \u00B7 60 fps (fastest)'], ['low', '720p \u00B7 30 fps'], ['balanced', '1080p \u00B7 30 fps'], ['high', '1080p \u00B7 60 fps']], PO = [['menus', 'Menus (arrows, Enter)'], ['keys', 'Keyboard and mouse preset'], ['off', 'Off'], ['sharp', '1080p \u00B7 60 fps, extra sharp (strong Wi-Fi)']];
      const render = s => {
        st = s; const fk = K.current && K.current() && K.current().dataset ? K.current().dataset.rk : ''; box.innerHTML = '';
        if (!s.supported) { box.appendChild(row('Remote play host needs Windows', 'Use SKBox on your Windows PC as the host. This device can still be the player.', '', null)); return; }
        const t = toggle('Remote play', s.on ? 'ON. Other devices on your Wi-Fi can see this PC.' : 'OFF. Nothing is listening.', !!s.on, async v => { const r = await sk.remote.set(v); if (!r.ok) { toast(r.error || 'Could not change Remote play'); sk.remote.state().then(render); } else if (v) toast('Remote play is on'); });
        t.dataset.rk = 'tog'; t.dataset.first = ''; box.appendChild(t);
        if (s.on) {
          const addr = (s.ips[0] || 'this-pc') + ':' + s.port;
          box.appendChild(row('Connect from your Mac or PC', 'Open SKBox Remote and pick this PC, or type this address in any browser: http://' + addr, addr, null));
          const pr = row('PIN', 'Type this on the other device. Press A for a new PIN.', (s.pin || '').replace(/^(\d{3})(\d{3})$/, '$1 $2'), () => sk.remote.newPin()); pr.dataset.rk = 'pin'; pr.querySelector('.r').style.cssText = 'font-size:1.6rem;font-weight:800;letter-spacing:.12em'; box.appendChild(pr);
          const cr = s.client ? row(s.client.name + ' is playing', (fmtSt(s.stats) || 'Starting stream\u2026') + '. Press A to disconnect.', 'Disconnect', () => sk.remote.kick()) : row('Waiting for a player', 'Nobody is connected.', '', null); cr.dataset.rk = 'client'; box.appendChild(cr);
          if (!s.helper) box.appendChild(row('Keyboard and mouse control is not available', 'The controller helper is not running (see Xbox / PS button). You can still watch and hear the game.', '\u26A0', null));
        }
        const q = cyc('Quality', 'Lower is smoother on weak Wi-Fi. 1080p 60 needs 5 GHz Wi-Fi or a cable on the PC.', QO, () => s.cfg.quality, v => { s.cfg.quality = v; sk.remote.cfg({ quality: v }); }); q.dataset.rk = 'q'; box.appendChild(q);
        const ai = toggle('Let the other device use keyboard and mouse', 'Off = view only', !!s.cfg.allowInput, v => { s.cfg.allowInput = v; sk.remote.cfg({ allowInput: v }); }); ai.dataset.rk = 'ai'; box.appendChild(ai);
        const pm = cyc('Controller on the other device', 'It becomes keyboard and mouse input here. Real controller pass-through needs a virtual controller driver.', PO, () => s.cfg.padMode, v => { s.cfg.padMode = v; sk.remote.cfg({ padMode: v }); }); pm.dataset.rk = 'pm'; box.appendChild(pm);
        const af = toggle('Fix fullscreen games automatically', 'If a game looks black or frozen on the other device, SKBox switches how it captures the game and takes it out of exclusive fullscreen.', s.cfg.autoFix !== false, v => { s.cfg.autoFix = v; sk.remote.cfg({ autoFix: v }); }); af.dataset.rk = 'af'; box.appendChild(af);
        if (s.on) { const fx = row('Fix the picture now', 'Black or frozen picture on the other device? Press A.', '\u2192', () => { sk.remote.fix(); toast('Trying to fix the picture\u2026'); }); fx.dataset.rk = 'fx'; box.appendChild(fx); }
        box.appendChild(row('First time?', 'Windows may ask to let SKBox use private networks. Choose Allow. Both devices must be on the same Wi-Fi.', '', null));
        box.appendChild(row('Get the SKBox Remote app', 'Mac and Windows downloads are on the SKBox GitHub releases page (look for \u201Cremote-v\u201D). Or open the address above in a browser.', '', null));
        if (fk) { const n = box.querySelector('[data-rk="' + fk + '"]'); if (n) focus(n); }
      };
      S.remoteUpd = render; sk.remote.state().then(s => { if (box.isConnected) render(s); });
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
      const trow = row('Sleep timer', 'Sleep, shut down or close your game after a while', '', null); pane.appendChild(trow);
      const tdraw = async () => { const t = await sk.timer.get(); if (!trow.isConnected) return; trow.querySelector('.r').textContent = t ? ({ sleep: 'Sleep', shutdown: 'Shut down', closegame: 'Close game' }[t.action]) + ' in ' + Math.max(1, Math.round((t.at - Date.now()) / 60000)) + ' min' : 'Off'; }; tdraw();
      trow.onclick = () => {
        const set = (m, a, label) => ({ label, fn: async () => { await sk.timer.set(m, a); toast('Timer set: ' + label); tdraw(); } });
        menu('Sleep timer', [set(30, 'sleep', 'Sleep in 30 min'), set(60, 'sleep', 'Sleep in 1 hour'), set(120, 'sleep', 'Sleep in 2 hours'), set(60, 'shutdown', 'Shut down in 1 hour'), set(30, 'closegame', 'Close game in 30 min'), set(60, 'closegame', 'Close game in 1 hour'), { label: 'Turn timer off', fn: async () => { await sk.timer.set(0, 'sleep'); toast('Timer off'); tdraw(); } }]);
      };
      pane.appendChild(row('Restart SKBox', 'Closes and opens SKBox again', '', () => confirm('Restart SKBox?', 'A running game keeps running.', 'Restart', () => sk.extras.do('restart'), false)));
      P.forEach(([n, k]) => pane.appendChild(row(n, '', '', () => confirm(n + '?', k === 'quit' ? 'Press Ctrl+Shift+B or use the tray icon to bring SKBox back.' : 'Anything unsaved will be lost.', n, () => sk.sys.power(k), k !== 'sleep'))));
    } else {
      h('About SKBox'); sk.info().then(i => { sub('Version ' + i.version + ' \u00B7 SKBox by SK. If this is older than the version you expect, your update has not been published or installed yet.'); });
      sk.info().then(i => { pane.appendChild(row('Game helper', i.helper ? 'Running: fullscreen and the SK menu are active' : 'Not running. Fullscreen and the SK menu need Windows', '', null)); });
      pane.appendChild(row('SK menu in a game', 'Press the Xbox button or PlayStation button (or Ctrl+Shift+O)', '', null));
      pane.appendChild(row('Return to SKBox from an app', 'Press Ctrl+Shift+B, or click the SKBox tray icon', '', null));
      pane.appendChild(row('Updates', 'SKBox updates itself when you are online', '', null));
      pane.appendChild(row('Back up my SKBox', 'Saves your apps, pins, settings and play time to a file', '\u2192', async () => { const r = await sk.backup.save(); if (r.ok) toast('Backup saved'); else if (!r.canceled) toast(r.error || 'Could not save the backup'); }));
      pane.appendChild(row('Restore from a backup', 'Replaces your apps, pins and settings with the ones in the file', '\u2192', () => confirm('Restore a backup?', 'This replaces your current apps, pins and settings. Cover art files stay where they are.', 'Choose file', async () => { const r = await sk.backup.load(); if (r.ok) toast('Restored ' + r.apps + ' apps. Reloading\u2026'); else if (!r.canceled) toast(r.error || 'Could not restore'); }, true)));
    }
  }

  go('boot');
  window.K.startPads();
})();
