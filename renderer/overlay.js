// SK menu: opens over a running game when you press the Xbox / PlayStation button (or Ctrl+Shift+O).
(function () {
  'use strict';
  const K = window.K, sk = K.sk, S = K.S, { $, el, esc, nav, toast, hints, focus, ensureFocus, confirm, menu, osk, fileUrl } = K;
  const SITE = 'https://sksmpchat.netlify.app';
  const GENRES = ['Pop', 'Hip-Hop', 'Rock', 'Lo-fi', 'Jazz', 'EDM', 'Country', 'Metal'];
  let st = null, mode = 'menu', timers = [], menuItems = {}, panel = null;
  const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
  const user = () => (S.players[S.active] || S.players[0] || { u: 'guest' }).u;
  const avatarUrl = p => { if (!p) return ''; const v = ((st && st.settings.pfp) || {})[p.u]; if (v && v.startsWith('builtin:')) return 'assets/pfp/' + v.slice(8) + '.png'; if (v && v.startsWith('file:')) return fileUrl(v.slice(5)); return p.av && /^(data:image|https?:)/.test(p.av) ? p.av : ''; };
  const avatar = p => { const u = avatarUrl(p); return '<div class="av"' + (u ? ' style="background-image:url(\'' + esc(u) + '\')"></div>' : '>' + (p ? esc((p.nick || p.u || '?')[0].toUpperCase()) : '+') + '</div>'); };
  const minutes = () => st && st.game ? Math.max(0, Math.round((Date.now() - st.game.startedAt) / 60000)) : 0;

  const OPAQUE = /[?&]opaque=1/.test(location.search); if (OPAQUE) document.body.classList.add('opaque');
  sk.on('padin', (slot, a) => K.padIn(slot, a));
  K.startPads();   // the menu window also reads the controller itself (the old build never started this, so only the mouse worked)
  // close the menu by itself after a while with no input (Extras > Close the SK menu when idle)
  let idleT = 0; const armIdle = () => { clearTimeout(idleT); const n = +(S.settings && S.settings.overlayIdle) || 0; if (n > 0) idleT = setTimeout(() => { try { sk.overlay.close(); } catch (_) {} }, n * 1000); };
  ['keydown', 'mousemove', 'mousedown', 'wheel'].forEach(ev => document.addEventListener(ev, armIdle, true));
  sk.on('padin', () => armIdle());
  sk.on('overlay:open', s => { try { window.focus(); } catch (_) {} open(s); armIdle(); });
  sk.on('overlay:close', () => { clearTimeout(idleT); reset(); });
  sk.on('pads', n => { if (st) st.pads = n; });

  function reset() { clearTimers(); mode = 'menu'; S.screen = 'overlay'; const r = $('#screen'); r.innerHTML = ''; $('#layers').innerHTML = ''; S.osk = false; }
  function open(s) {
    reset(); st = s; S.settings = s.settings || {}; S.players = s.players || [null, null]; S.apps = s.apps || []; S.active = 0;
    { const skin = K.applySkin ? K.applySkin(S.settings) : 'glass'; if (skin === 'glass') { document.documentElement.style.setProperty('--a', S.settings.accent || '#2dd4bf'); document.documentElement.style.removeProperty('font-size'); } else document.documentElement.style.fontSize = K.skinScale !== 1 ? 'calc(clamp(13px, 2vh, 26px) * ' + K.skinScale + ')' : ''; }   // the SK menu wears the same theme
    K.padFromHelper = !!s.helper;
    if (OPAQUE) { const b = S.settings.bg || 'dynamic'; K.setWall(b.startsWith('file:') ? fileUrl(b.slice(5)) : (b === 'dynamic' ? '' : 'assets/bg/' + b + '.jpg')); }
    if (s.opts && s.opts.osk) { oskMode(s.opts.osk); return; }
    build(); if (s.opts && s.opts.p2) { toast('Player 2 controller connected'); players(true); }
  }
  function oskMode(o) {
    hints([['A', 'Type'], ['X', 'Backspace'], ['Y', 'Done'], ['B', 'Cancel']]); S.backFn = null;
    osk({ title: 'Type', value: o.value, canSend: true, onDone: (t, send) => sk.overlay.oskResult({ target: o.target, text: t, send }), onCancel: () => sk.overlay.oskResult({ target: o.target, cancel: true }) });
  }

  // ---------- menu ----------
  function build() {
    const root = $('#screen'); root.innerHTML = ''; root.className = 'ov'; mode = 'menu'; S.screen = 'overlay';
    hints([['A', 'Select'], ['B', 'Close'], ['S', 'SKBox home']]);
    S.backFn = () => sk.overlay.close(); S.startFn = () => sk.overlay.home();
    const m = el('div', 'ovmenu'), head = el('div', 'ovhead'), chips = el('div', 'ovplayers'); panel = el('div', 'ovpanel');
    head.innerHTML = '<div class="g">' + (st.game ? esc(st.game.name) : 'SKBox') + '</div><div class="t">' + (st.game ? 'Playing for ' + minutes() + ' min' : 'No game running') + ' \u00B7 ' + K.fmtTime(new Date()) + '</div>';
    [0, 1].forEach(i => { const p = S.players[i]; if (p) chips.insertAdjacentHTML('beforeend', '<div class="chip">' + avatar(p) + '<span>' + esc(p.nick || p.u) + '</span><span class="pn">P' + (i + 1) + '</span></div>'); });
    head.appendChild(chips); m.appendChild(head);
    const qbar = el('div', 'qbar'), qb = {}; const qbtn = (key, text, fn) => { const b = nav(el('button', 'qb', text)); b.onclick = fn; qb[key] = b; qbar.appendChild(b); return b; };
    qbtn('vol', '\u{1F50A}', () => sk.sys.volume('mute')).title = 'Mute / unmute the PC'; qb.vol._adjust = d => { sk.sys.volume(d < 0 ? 'down' : 'up'); K.snd && K.snd.play('move'); };
    qbtn('shot', '\u{1F4F8}', () => shot()); qbtn('mic', '\u{1F3A4} Mic on', () => { sk.party.cmd('mute', { toggle: true }); }); qb.mic.style.display = 'none';
    if (S.settings.menuQuick !== false) m.appendChild(qbar);
    if (S.settings.hud) { const hud = el('div', 'hud', 'CPU \u2026'); head.appendChild(hud); const upd = async () => { try { const p = await sk.perf.get(); hud.textContent = 'CPU ' + p.cpu + '%  \u00B7  RAM ' + (p.ramUsed / 1073741824).toFixed(1) + ' / ' + (p.ramTotal / 1073741824).toFixed(0) + ' GB'; } catch (_) {} }; upd(); timers.push(setInterval(upd, 3000)); }
    const party = K.partyUI ? K.partyUI.state() : null, inParty = !!(party && party.status === 'in');
    const groups = [
      ['PLAY', [
        ['resume', '\u25B6', st.game ? 'Resume game' : 'Close menu', () => sk.overlay.close(), 'Back to what you were doing.'],
        ['home', '\u2302', 'SKBox home', () => sk.overlay.home(), st.game ? 'Go to the home screen. Your game keeps running; pick Resume to come back.' : 'Go to the home screen.'],
        ['quick', '\u{1F3AE}', 'Quick play', () => quick(), 'Switch to another game or app.'],
        ['close', '\u2716', 'Close game', () => closeGame(), 'Quit the running game and go home.']]],
      ['SOCIAL', [
        ['party', '\u{1F3A7}', 'Party', () => partyPanel(), 'Voice chat with friends while you play. Start a party, share the code, talk.'],
        ['msg', '\u{1F4AC}', 'Messages', () => messages(), 'Open SKchat to read and send messages.'],
        ['music', '\u266A', 'Music', () => music(), 'Control SKMusic: skip, pause, volume and quick radios.'],
        ['players', '\u{1F465}', 'Players & controllers', () => players(false), 'See who is playing and set up Player 2.']]],
      ['SYSTEM', [
        ['windows', '\u{1FA9F}', 'Windows', () => windows(), 'Switch to, fit, hide or close any open window without leaving SKBox.'],
        ...(st.remote && st.remote.on ? [['remote', '\u{1F4E1}', 'Remote play', () => remotePanel(), st.remote.client ? st.remote.client.name + ' is playing. Disconnect, fix the picture or change quality.' : 'Remote play is on. Nobody is connected.']] : []),
        ['vol', '\u{1F50A}', 'Volume', () => sk.sys.volume('mute'), 'Left and right change the volume. Press A to mute.'],
        ['shot', '\u{1F4F8}', 'Screenshot', () => shot(), 'Saves a picture to Pictures\\SKBox.'],
        ['power', '\u23FB', 'Power', () => power(), 'Sleep, restart or shut down.']]]
    ].map(g => [g[0], g[1].filter(x => x[0] !== 'close' || st.game)]);
    const items = []; groups.forEach(g => { items.push(['#', g[0]]); g[1].forEach(x => items.push(x)); });
    menuItems = {};
    let first = true;
    items.forEach(([id, ic, label, fn, desc]) => {
      if (id === '#') { m.appendChild(el('div', 'mgrp', ic)); return; }
      const b = nav(el('button', 'mi' + (id === 'close' ? ' danger' : ''), '<span>' + ic + '</span><em>' + esc(label) + '</em>')); menuItems[id] = b; b.dataset.id = id;
      if (id === 'party') { const badge = el('i', 'mbadge' + (inParty ? ' on' : '')); badge.textContent = inParty ? String(party.members.length + 1) : ''; b.appendChild(badge); b._badge = badge; }
      if (first) { b.dataset.first = ''; first = false; }
      b._onfocus = () => { if (mode === 'menu') preview(id, label, desc); };
      b.onclick = fn;
      if (id === 'vol') b._adjust = d => { sk.sys.volume(d < 0 ? 'down' : 'up'); sk.sys.volume(d < 0 ? 'down' : 'up'); K.snd && K.snd.play('move'); };
      m.appendChild(b);
    });
    K.partyOnState = s => { const bd = menuItems.party && menuItems.party._badge; if (bd && mode === 'menu') { const on = s.status === 'in'; bd.className = 'mbadge' + (on ? ' on' : ''); bd.textContent = on ? String(s.members.length + 1) : ''; } if (qb.mic) qb.mic.classList.toggle('on', s.status === 'in' && !s.me.muted); if (qb.mic) qb.mic.style.display = s.status === 'in' ? '' : 'none'; if (qb.mic) qb.mic.textContent = s.me && s.me.muted ? '\u{1F507} Muted' : '\u{1F3A4} Mic on'; };
    if (K.partyUI) K.partyOnState(K.partyUI.state());
    root.append(m, panel); ensureFocus(root);
    timers.push(setInterval(() => { const t = head.querySelector('.t'); if (t && st.game) t.textContent = 'Playing for ' + minutes() + ' min \u00B7 ' + K.fmtTime(new Date()); }, 30000));
  }
  function partyPanel() { subView('party', 'Party', ''); panel.innerHTML = ''; K.partyUI.render(panel, { title: 'Party' }); }
  function preview(id, label, desc) { if (K.partyUI) K.partyUI.detach(); panel.innerHTML = '<h2>' + esc(label) + '</h2><p class="sub">' + esc(desc) + '</p>'; }
  function toMenu(id) { clearTimers(); if (mode === 'menu') return; build(); const b = $('#screen').querySelector('.mi[data-id="' + id + '"]'); if (b) focus(b); }
  function subView(id, title, sub) {
    if (K.partyUI) K.partyUI.detach(); mode = id; S.screen = 'overlay'; S.backFn = () => toMenu(id); S.startFn = () => toMenu(id);
    hints([['A', 'Select'], ['B', 'Back']]); panel.innerHTML = '<h2>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '');
  }


  // ---------- windows: switch / fit / hide / close any window, no trip into Windows needed ----------
  async function windows() {
    subView('windows', 'Windows', 'Tap windows to select them, then close the selected ones. Or switch, fit and hide.');
    const wb = (label, fn) => { const b = nav(el('button', 'btn', esc(label))); b.onclick = fn; return b; }, X = (n, a) => sk.extras.do(n, a), bar = el('div', 'cbar'), box = el('div'), sel = new Map(); let last = [];
    box.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:58vh;overflow:auto;padding:2px';
    const closeSel = async force => { if (!sel.size) { toast('Select some windows first'); return; } const items = Array.from(sel.values()); toast((force ? 'Ending ' : 'Closing ') + items.length + '\u2026'); for (const w of items) await X('winClose', { h: w.h, pid: w.pid, force }); sel.clear(); setTimeout(draw, 900); };
    const draw = async () => {
      const r = await X('winList'); if (mode !== 'windows') return; box.innerHTML = ''; last = (r && r.wins) || []; Array.from(sel.keys()).forEach(k => { if (!last.some(w => w.h === k)) sel.delete(k); }); cb.textContent = 'Close selected (' + sel.size + ')';
      if (!r || !r.ok) { box.appendChild(el('p', 'sub', (r && r.error) || 'Could not read the windows.')); return; }
      if (!last.length) box.appendChild(el('p', 'sub', 'No other windows are open.'));
      last.forEach(w => {
        const row = el('div', 'cbar'); row.style.cssText = 'align-items:center;justify-content:space-between';
        const lab = el('div', 'sub', (sel.has(w.h) ? '\u2611 ' : '\u2610 ') + (w.game ? '\u2605 ' : '') + esc(w.n || w.t).slice(0, 30) + ' \u2014 ' + esc(w.t).slice(0, 36) + (w.min ? ' (minimized)' : '')); lab.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0';
        row.appendChild(lab);
        if (!w.prot) row.appendChild(wb(sel.has(w.h) ? 'Selected \u2713' : 'Select', () => { if (sel.has(w.h)) sel.delete(w.h); else sel.set(w.h, w); draw(); }));
        row.append(wb('Switch', async () => { await X('winSwitch', { h: w.h }); sk.overlay.close(false); }), wb('Fit', async () => { await X('winFit', { h: w.h }); sk.overlay.close(false); toast('Fitted to the screen'); }), wb(w.min ? 'Show' : 'Hide', async () => { await X(w.min ? 'winSwitch' : 'winMin', { h: w.h }); if (w.min) sk.overlay.close(false); else setTimeout(draw, 500); }));
        box.appendChild(row);
      });
      ensureFocus($('#screen'));
    };
    const cb = wb('Close selected (0)', () => closeSel(false));
    bar.append(cb, wb('Force close selected', () => closeSel(true)), wb('Select all others', () => { last.forEach(w => { if (!w.game && !w.prot) sel.set(w.h, w); }); draw(); }), wb('Select none', () => { sel.clear(); draw(); }), wb('Show desktop', () => X('minAll')), wb('Task Manager', () => X('taskmgr')));
    panel.append(bar, box); draw();
  }

  // ---------- messages ----------
  function messages() {
    const u = user(); mode = 'msg'; S.screen = 'web'; S.backFn = () => toMenu('msg'); S.startFn = () => toMenu('msg');
    hints([['S', 'Back to menu'], ['A', 'Click'], ['Y', 'Keyboard']]);
    panel.innerHTML = ''; const wv = document.createElement('webview');
    wv.setAttribute('src', SITE + '/chat'); wv.setAttribute('partition', 'persist:skbox-' + u); wv.setAttribute('allowpopups', 'false'); panel.appendChild(wv);
    const setText = (t, send) => wv.executeJavaScript('(function(t,s){var e=document.activeElement;if(!e)return;if(e.isContentEditable){e.textContent=t;e.dispatchEvent(new Event("input",{bubbles:true}));}else{var pr=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,ds=Object.getOwnPropertyDescriptor(pr,"value");if(ds&&ds.set)ds.set.call(e,t);else e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}));}if(s){e.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));}})(' + JSON.stringify(t) + ',' + (send ? 'true' : 'false') + ')').catch(() => {});
    wv.addEventListener('dom-ready', async () => {
      wv.focus(); wv.send('active-pad', Math.max(0, K.padIndexOf(S.active)));
      if (u !== 'guest') { const c = await sk.auth.cred(u); if (c) [1200, 3200, 6000].forEach(ms => setTimeout(() => { try { wv.executeJavaScript('(function(u,p){var a=document.getElementById("li-u"),b=document.getElementById("li-p");if(a&&b&&a.offsetParent&&!window._sessOn){a.value=u;b.value=p;["input","change"].forEach(function(t){a.dispatchEvent(new Event(t,{bubbles:true}));b.dispatchEvent(new Event(t,{bubbles:true}));});if(window.doLogin)window.doLogin();}})(' + JSON.stringify(c.u) + ',' + JSON.stringify(c.p) + ')').catch(() => {}); } catch (_) {} }, ms)); }
    });
    wv.addEventListener('ipc-message', e => {
      if (e.channel === 'home') toMenu('msg');
      else if (e.channel === 'osk') { S.screen = 'overlay'; osk({ title: 'Type', value: (e.args[0] && e.args[0].value) || '', canSend: true, onDone: (t, send) => { S.screen = 'web'; setText(t, send); wv.focus(); }, onCancel: () => { S.screen = 'web'; wv.focus(); } }); }
    });
  }

  // ---------- music ----------
  function music() {
    const u = user(); subView('music', 'Music', '');
    const np = el('div', 'np', '<div class="art"></div><div><b>Nothing playing</b><small>SKMusic is not started yet</small></div>'); panel.appendChild(np);
    const bar = el('div', 'cbar'), btn = (t, fn, first) => { const b = nav(el('button', 'btn', t)); if (first) b.dataset.first = ''; b.onclick = fn; return b; };
    bar.append(btn('\u23EE', () => sk.music.cmd('prev'), true), btn('\u23EF Play / pause', () => sk.music.cmd('toggle')), btn('\u23ED', () => sk.music.cmd('next')), btn('Vol \u2212', () => sk.music.cmd('voldown')), btn('Vol +', () => sk.music.cmd('volup')));
    panel.appendChild(bar);
    const start = btn('Start SKMusic', async () => { await sk.music.ensure(u); toast('Starting SKMusic\u2026'); setTimeout(poll, 2500); });
    const open = btn('Open full SKMusic', () => sk.music.open(u)); const row2 = el('div', 'cbar'); row2.append(start, open, btn('\u2600 Daily Mix', () => sk.music.cmd('daily')), btn('Stop radio', () => sk.music.cmd('stop'))); panel.appendChild(row2);
    panel.appendChild(el('p', 'sub', 'Start a radio'));
    const g = el('div', 'gchips'); GENRES.forEach(n => g.appendChild(btn(n, () => { sk.music.cmd('radio', n); toast(n + ' radio'); }))); panel.appendChild(g);
    async function poll() {
      const s = await sk.music.status(); if (mode !== 'music') return;
      if (s.ready && s.track) { np.innerHTML = '<div class="art" style="background-image:url(\'' + esc(s.track.thumb || '') + '\')"></div><div><b>' + esc(s.track.title) + '</b><small>' + esc(s.track.artist) + (s.playing ? ' \u00B7 playing' : ' \u00B7 paused') + (s.radio ? ' \u00B7 ' + esc(s.radio) + ' radio' : '') + '</small></div>'; }
      else np.innerHTML = '<div class="art"></div><div><b>' + (s.ready ? 'Nothing playing' : 'SKMusic is not started') + '</b><small>' + (s.ready ? 'Pick a radio below' : 'Press \u201CStart SKMusic\u201D') + '</small></div>';
    }
    poll(); timers.push(setInterval(poll, 3000)); ensureFocus(panel.parentNode.querySelector('.ovpanel'), bar.firstChild);
  }

  // ---------- remote play (controls live here, not in the player app) ----------
  function remotePanel() {
    subView('remote', 'Remote play', '');
    const QO = [['smooth', '720p \u00B7 60 fps (fastest)'], ['low', '720p \u00B7 30 fps'], ['balanced', '1080p \u00B7 30 fps'], ['high', '1080p \u00B7 60 fps'], ['sharp', '1080p \u00B7 60 fps, extra sharp']];
    let rs = st.remote || { cfg: {} };
    const info = el('div', 'np', ''); panel.appendChild(info);
    const btn = (fn, first) => { const b = nav(el('button', 'btn', '')); if (first) b.dataset.first = ''; b.onclick = fn; return b; };
    const bBye = btn(async () => { if (!rs.client) { toast('Nobody is connected'); return; } rs = await sk.remote.kick(); toast('Player disconnected'); draw(); }, true);
    const bFix = btn(() => { sk.remote.fix(); toast('Trying to fix the picture\u2026'); });
    const bPin = btn(async () => { rs = await sk.remote.newPin(); draw(); });
    const bQ = btn(async () => { const i = QO.findIndex(x => x[0] === rs.cfg.quality); rs = await sk.remote.cfg({ quality: QO[(i + 1) % QO.length][0] }); draw(); toast('Quality applies the next time a player connects'); });
    const bIn = btn(async () => { rs = await sk.remote.cfg({ allowInput: !rs.cfg.allowInput }); draw(); });
    const bAf = btn(async () => { rs = await sk.remote.cfg({ autoFix: rs.cfg.autoFix === false }); draw(); });
    const bOff = btn(async () => { const r = await sk.remote.set(false); st.remote = r && r.state ? r.state : { on: false }; toast('Remote play is off'); build(); });
    const r1 = el('div', 'cbar'), r2 = el('div', 'cbar'); r1.append(bBye, bFix, bPin); r2.append(bQ, bIn, bAf, bOff); panel.append(r1, r2);
    function draw() {
      const c = rs.client, q = QO.find(x => x[0] === rs.cfg.quality) || QO[0], t = rs.stats;
      const line = t ? [t.w && t.h ? t.w + 'x' + t.h : '', t.fps ? t.fps + ' fps' : '', t.rtt ? t.rtt + ' ms' : ''].filter(Boolean).join(' \u00B7 ') : '';
      info.innerHTML = '<div class="art"></div><div><b>' + (c ? esc(c.name) + ' is playing' : 'Waiting for a player') + '</b><small>PIN ' + esc((rs.pin || '').replace(/^(\d{3})(\d{3})$/, '$1 $2')) + (line ? ' \u00B7 ' + esc(line) : '') + '</small></div>';
      bBye.textContent = 'Disconnect player'; bFix.textContent = 'Fix black screen'; bPin.textContent = 'New PIN';
      bQ.textContent = 'Quality: ' + q[1]; bIn.textContent = 'Keyboard & mouse: ' + (rs.cfg.allowInput === false ? 'view only' : 'on'); bAf.textContent = 'Auto-fix games: ' + (rs.cfg.autoFix === false ? 'off' : 'on'); bOff.textContent = 'Turn Remote play off';
    }
    draw(); timers.push(setInterval(async () => { try { rs = await sk.remote.state(); if (mode === 'remote') draw(); } catch (_) {} }, 2000));
    ensureFocus(panel.parentNode.querySelector('.ovpanel'), r1.firstChild);
  }

  // ---------- quick play ----------
  function quick() {
    subView('quick', 'Quick play', st.game ? 'Starting another game closes ' + st.game.name + '.' : 'Pick something to play.');
    if (!S.apps.length) { panel.appendChild(el('p', 'sub', 'No games added yet. Add them from the SKBox home screen.')); return; }
    const grid = el('div', 'qgrid');
    const stt = st.stats || {}; S.apps.slice().sort((x, y) => ((stt[y.id] || {}).last || 0) - ((stt[x.id] || {}).last || 0)).forEach((a, i) => {
      const t = nav(el('button', 'qt', '<small>' + esc(a.name) + '</small>')); if (a.cover) t.style.backgroundImage = 'url("' + fileUrl(a.cover) + '")'; if (i === 0) t.dataset.first = '';
      t.onclick = () => { const go = async () => { const r = await sk.launch({ id: a.id, name: a.name, exe: a.exe, args: a.args, cover: a.cover, fs: a.fs || 'auto', compat: !!a.compat, replace: true }); if (!r.ok) toast(r.error || 'Could not start that.'); else sk.overlay.close(false); }; if (st.game) confirm('Switch games?', 'This closes ' + st.game.name + ' and starts ' + a.name + '.', 'Switch', go); else go(); };
      grid.appendChild(t);
    });
    panel.appendChild(grid); ensureFocus(panel.parentNode.querySelector('.ovpanel'), grid.firstChild);
  }

  // ---------- players ----------
  async function players(auto) {
    subView('players', auto ? 'Player 2 joined' : 'Players & controllers', auto ? 'Choose your profile and you are in.' : 'Controllers connected: ' + (st.pads || 0));
    const list = await sk.auth.list(); if (mode !== 'players') return;
    [0, 1].forEach(i => { const p = S.players[i]; panel.insertAdjacentHTML('beforeend', '<div class="item" style="cursor:default"><div>Player ' + (i + 1) + '<small>' + (p ? '@' + esc(p.u) : 'Empty') + '</small></div><div class="r">' + (p ? esc(p.nick || p.u) : '') + '</div></div>'); });
    const pick = (slot, label) => {
      panel.appendChild(el('p', 'sub', label)); const grid = el('div', 'gchips');
      list.concat([{ u: 'guest', guest: true, nick: 'Guest' }]).forEach((p, k) => {
        if (S.players[slot ? 0 : 1] && S.players[slot ? 0 : 1].u === p.u && !p.guest) return;
        const b = nav(el('button', 'chip', avatar(p) + '<span>' + esc(p.nick || p.u) + '</span>')); if (k === 0 && slot === 1) b.dataset.first = '';
        b.onclick = async () => { await sk.overlay.setPlayer(slot, p.u); S.players[slot] = p.guest ? { u: 'guest', guest: true } : p; K.snd && K.snd.play('ok'); toast((slot ? 'Player 2: ' : 'Player 1: ') + (p.nick || p.u) + ' is in!'); if (auto) { sk.overlay.close(); } else players(false); }; grid.appendChild(b);
      }); panel.appendChild(grid);
    };
    if (!S.players[1]) pick(1, 'Choose a profile for Player 2'); else { const rm = nav(el('button', 'btn', 'Remove Player 2')); rm.onclick = async () => { await sk.overlay.setPlayer(1, null); S.players[1] = null; players(false); }; panel.appendChild(rm); }
    if (!auto) pick(0, 'Switch Player 1');
    ensureFocus(panel.parentNode.querySelector('.ovpanel'));
    if (!panel.querySelector('[data-nav]')) ensureFocus();
  }

  // ---------- actions ----------
  async function shot() { toast('Taking screenshot\u2026'); const r = await sk.overlay.screenshot(); toast(r.ok ? 'Saved to Pictures\\SKBox' : 'Could not take a screenshot.'); }
  function closeGame() { confirm('Close ' + st.game.name + '?', 'Anything unsaved in the game will be lost.', 'Close game', async () => { const r = await sk.game.close(); if (r && r.found === false) toast('Could not find the game\u2019s window.'); }, true); }
  function power() {
    const P = [['Sleep', 'sleep'], ['Restart', 'restart'], ['Shut down', 'shutdown'], ['Exit SKBox', 'quit']];
    menu('Power', P.map(([n, k]) => ({ label: n, fn: () => confirm(n + '?', k === 'quit' ? 'SKBox and the game stay open until you close them.' : 'Anything unsaved will be lost.', n, () => sk.sys.power(k), k !== 'sleep') })));
  }
  S.screen = 'overlay';
})();
