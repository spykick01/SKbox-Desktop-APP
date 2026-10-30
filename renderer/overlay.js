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

  sk.on('overlay:open', s => open(s));
  sk.on('overlay:close', () => reset());
  sk.on('pads', n => { if (st) st.pads = n; });

  function reset() { clearTimers(); mode = 'menu'; S.screen = 'overlay'; const r = $('#screen'); r.innerHTML = ''; $('#layers').innerHTML = ''; S.osk = false; }
  function open(s) {
    reset(); st = s; S.settings = s.settings || {}; S.players = s.players || [null, null]; S.apps = s.apps || []; S.active = 0;
    document.documentElement.style.setProperty('--a', S.settings.accent || '#2dd4bf');
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
    head.innerHTML = '<div class="g">' + (st.game ? esc(st.game.name) : 'SKBox') + '</div><div class="t">' + (st.game ? 'Playing for ' + minutes() + ' min' : 'No game running') + ' \u00B7 ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</div>';
    [0, 1].forEach(i => { const p = S.players[i]; if (p) chips.insertAdjacentHTML('beforeend', '<div class="chip">' + avatar(p) + '<span>' + esc(p.nick || p.u) + '</span><span class="pn">P' + (i + 1) + '</span></div>'); });
    head.appendChild(chips); m.appendChild(head);
    const items = [
      ['resume', '\u25B6', st.game ? 'Resume game' : 'Close menu', () => sk.overlay.close(), 'Back to what you were doing.'],
      ['home', '\u2302', 'SKBox home', () => sk.overlay.home(), st.game ? 'Go to the home screen. Your game keeps running; pick Resume to come back.' : 'Go to the home screen.'],
      ['msg', '\u{1F4AC}', 'Messages', () => messages(), 'Open SKchat to read and send messages.'],
      ['music', '\u266A', 'Music', () => music(), 'Control SKMusic: skip, pause, volume and quick radios.'],
      ['quick', '\u{1F3AE}', 'Quick play', () => quick(), 'Switch to another game or app.'],
      ['players', '\u{1F465}', 'Players & controllers', () => players(false), 'See who is playing and set up Player 2.'],
      ['vol', '\u{1F50A}', 'Volume', () => sk.sys.volume('mute'), 'Left and right change the volume. Press A to mute.'],
      ['shot', '\u{1F4F8}', 'Screenshot', () => shot(), 'Saves a picture to Pictures\\SKBox.'],
      ['close', '\u2716', 'Close game', () => closeGame(), 'Quit the running game and go home.'],
      ['power', '\u23FB', 'Power', () => power(), 'Sleep, restart or shut down.']
    ].filter(x => x[0] !== 'close' || st.game);
    menuItems = {};
    items.forEach(([id, ic, label, fn, desc], i) => {
      const b = nav(el('button', 'mi' + (id === 'close' ? ' danger' : ''), '<span>' + ic + '</span>' + esc(label))); menuItems[id] = b;
      if (i === 0) b.dataset.first = '';
      b._onfocus = () => { if (mode === 'menu') preview(id, label, desc); };
      b.onclick = fn;
      if (id === 'vol') b._adjust = d => { sk.sys.volume(d < 0 ? 'down' : 'up'); sk.sys.volume(d < 0 ? 'down' : 'up'); K.snd && K.snd.play('move'); };
      m.appendChild(b);
    });
    root.append(m, panel); ensureFocus(root);
    timers.push(setInterval(() => { const t = head.querySelector('.t'); if (t && st.game) t.textContent = 'Playing for ' + minutes() + ' min \u00B7 ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }, 30000));
  }
  function preview(id, label, desc) { panel.innerHTML = '<h2>' + esc(label) + '</h2><p class="sub">' + esc(desc) + '</p>'; }
  function toMenu(id) { clearTimers(); if (mode === 'menu') return; const keep = menuItems[id]; build(); if (keep) { const b = $('#screen').querySelectorAll('.mi'); b.forEach(x => { if (x.textContent.trim().endsWith(keep.textContent.trim())) focus(x); }); } }
  function subView(id, title, sub) {
    mode = id; S.screen = 'overlay'; S.backFn = () => toMenu(id); S.startFn = () => toMenu(id);
    hints([['A', 'Select'], ['B', 'Back']]); panel.innerHTML = '<h2>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '');
  }

  // ---------- messages ----------
  function messages() {
    const u = user(); mode = 'msg'; S.screen = 'web'; S.backFn = () => toMenu('msg'); S.startFn = () => toMenu('msg');
    hints([['S', 'Back to menu'], ['A', 'Click'], ['Y', 'Keyboard']]);
    panel.innerHTML = ''; const wv = document.createElement('webview');
    wv.setAttribute('src', SITE + '/chat'); wv.setAttribute('partition', 'persist:skbox-' + u); wv.setAttribute('allowpopups', 'false'); panel.appendChild(wv);
    const setText = (t, send) => wv.executeJavaScript('(function(t,s){var e=document.activeElement;if(!e)return;if(e.isContentEditable){e.textContent=t;e.dispatchEvent(new Event("input",{bubbles:true}));}else{var pr=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,ds=Object.getOwnPropertyDescriptor(pr,"value");if(ds&&ds.set)ds.set.call(e,t);else e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}));}if(s){e.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));}})(' + JSON.stringify(t) + ',' + (send ? 'true' : 'false') + ')').catch(() => {});
    wv.addEventListener('dom-ready', async () => {
      wv.focus(); wv.send('active-pad', S.active);
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

  // ---------- quick play ----------
  function quick() {
    subView('quick', 'Quick play', st.game ? 'Starting another game closes ' + st.game.name + '.' : 'Pick something to play.');
    if (!S.apps.length) { panel.appendChild(el('p', 'sub', 'No games added yet. Add them from the SKBox home screen.')); return; }
    const grid = el('div', 'qgrid');
    S.apps.forEach((a, i) => {
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
