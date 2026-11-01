// SKBox core: helpers, focus navigation (controller / keyboard / mouse), dialogs, on-screen keyboard.
(function () {
  'use strict';
  const K = window.K = { sk: window.skbox, S: { profiles: [], players: [null, null], apps: [], settings: {}, active: 0, pads: [], screen: '', backFn: null, startFn: null, bumper: null, osk: false } };
  const S = K.S;
  K.$ = (s, r) => (r || document).querySelector(s);
  K.el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  K.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.fileUrl = p => p ? 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/^\/+/, '') : '';

  // ---------- toast / hints ----------
  let tt = null;
  K.toast = (msg) => { const t = K.$('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800); };
  const XB = { A: ['k-A', 'A'], B: ['k-B', 'B'], X: ['k-X', 'X'], Y: ['k-Y', 'Y'], S: ['k-S', '\u2630'], V: ['k-S', '\u29C9'], L: ['k-S', 'LB'], R: ['k-S', 'RB'] };
  const PS = { A: ['k-psx', '\u2715'], B: ['k-pso', '\u25CB'], X: ['k-pss', '\u25A1'], Y: ['k-pst', '\u25B3'], S: ['k-S', '\u2630'], V: ['k-S', '\u29C9'], L: ['k-S', 'L1'], R: ['k-S', 'R1'] };
  K.padType = 'xbox'; let lastHints = [];
  K.hints = list => { lastHints = list; const set = K.padType === 'ps' ? PS : XB; K.$('#hints').innerHTML = list.map(([k, t]) => { const g = set[k] || XB[k]; return '<span><i class="key ' + g[0] + '">' + g[1] + '</i>' + K.esc(t) + '</span>'; }).join(''); };

  // ---------- background ----------
  let bgFlip = false, bgCur = '', wall = '';
  K.setWall = u => { wall = u || ''; document.body.classList.toggle('hasWall', !!wall); K.setBg('', true); };
  K.setBg = (url, force) => {
    const eff = wall || url || '';
    if (eff === bgCur && !force) return; bgCur = eff;
    const a = K.$('#bgA'), b = K.$('#bgB'), on = bgFlip ? b : a, off = bgFlip ? a : b; bgFlip = !bgFlip;
    on.style.backgroundImage = eff ? 'url("' + eff + '")' : 'none'; on.classList.toggle('wall', !!wall); on.classList.add('on'); off.classList.remove('on');
  };

  // ---------- focus ----------
  let cur = null;
  const layers = () => K.$('#layers');
  const root = () => layers().lastElementChild || K.$('#screen');
  const navs = r => Array.from(r.querySelectorAll('[data-nav]')).filter(e => e.offsetParent !== null && !e.disabled && !e.hasAttribute('disabled'));
  K.focus = e => {
    if (cur && cur !== e) cur.classList.remove('focus');
    cur = e; if (!e) return;
    e.classList.add('focus'); whoTag(e);
    try { e.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (_) {}
    if (e._onfocus) e._onfocus(e);
  };
  K.ensureFocus = (r, prefer) => {
    r = r || root(); const l = navs(r); if (!l.length) { K.focus(null); return; }
    if (prefer && l.includes(prefer)) { K.focus(prefer); return; }
    if (!cur || !l.includes(cur)) K.focus(l.find(x => x.dataset.first !== undefined) || l[0]);
  };
  K.current = () => cur;
  function move(dir) {
    const r = root(), l = navs(r); if (!l.length) return;
    if (!cur || !l.includes(cur)) { K.ensureFocus(r); return; }
    const a = cur.getBoundingClientRect(), cx = a.left + a.width / 2, cy = a.top + a.height / 2; let best = null, bs = 1e12;
    for (const e of l) {
      if (e === cur) continue;
      const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      let ok, p, s;
      if (dir === 'left') { ok = dx < -4; p = -dx; s = Math.abs(dy); } else if (dir === 'right') { ok = dx > 4; p = dx; s = Math.abs(dy); }
      else if (dir === 'up') { ok = dy < -4; p = -dy; s = Math.abs(dx); } else { ok = dy > 4; p = dy; s = Math.abs(dx); }
      if (!ok) continue;
      const sc = p + s * 2.2; if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { K.focus(best); K.snd && K.snd.play('move'); }
  }
  K.nav = el => { el.setAttribute('data-nav', ''); el.addEventListener('mouseenter', () => { if (document.body.classList.contains('mouse')) K.focus(el); }); return el; };

  // ---------- layers (dialogs) ----------
  K.openLayer = (node, cancel) => {
    node._prev = cur; node._cancel = cancel; layers().appendChild(node); K.ensureFocus(node); K.snd && K.snd.play('open'); return node;
  };
  K.closeLayer = node => {
    const L = layers(); const n = node || L.lastElementChild; if (!n) return;
    const prev = n._prev; n.remove(); S.osk = !!L.querySelector('.osk'); K.snd && K.snd.play('close');
    if (prev && document.body.contains(prev)) K.focus(prev); else K.ensureFocus();
  };
  K.confirm = (title, body, yes, onYes, danger) => {
    const L = K.el('div', 'layer'), b = K.el('div', 'box', '<h3>' + K.esc(title) + '</h3><p>' + K.esc(body || '') + '</p>'), row = K.el('div', 'btnrow');
    const n = K.nav(K.el('button', 'btn', 'Cancel')), y = K.nav(K.el('button', 'btn ' + (danger ? 'd' : 'p'), K.esc(yes)));
    y.dataset.first = ''; n.onclick = () => K.closeLayer(L); y.onclick = () => { K.closeLayer(L); onYes(); };
    row.append(n, y); b.appendChild(row); L.appendChild(b); K.openLayer(L, () => K.closeLayer(L));
  };
  K.menu = (title, items) => {
    const L = K.el('div', 'layer'), b = K.el('div', 'box', '<h3>' + K.esc(title) + '</h3>'), m = K.el('div', 'menu');
    items.forEach((it, i) => { const e = K.nav(K.el('button', 'mi', K.esc(it.label))); if (i === 0) e.dataset.first = ''; e.onclick = () => { K.closeLayer(L); it.fn(); }; m.appendChild(e); });
    b.appendChild(m); L.appendChild(b); K.openLayer(L, () => K.closeLayer(L)); return L;
  };
  K.busy = text => { const L = K.el('div', 'layer'), b = K.el('div', 'box', '<div class="spin"></div><h3 style="text-align:center;margin:0">' + K.esc(text) + '</h3>'); L.appendChild(b); K.openLayer(L, () => {}); return () => K.closeLayer(L); };

  // ---------- on-screen keyboard ----------
  const ROWS = {
    lower: ['1234567890'.split(''), 'qwertyuiop'.split(''), 'asdfghjkl'.split(''), ['SHIFT'].concat('zxcvbnm'.split(''), ['BACK']), ['SYM', 'SPACE', '.', '@', '-', '_', 'DONE']],
    upper: ['1234567890'.split(''), 'QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), ['SHIFT'].concat('ZXCVBNM'.split(''), ['BACK']), ['SYM', 'SPACE', '.', '@', '-', '_', 'DONE']],
    sym: ['!@#$%^&*()'.split(''), '-_=+[]{}|\\'.split(''), [';', ':', '\'', '"', ',', '.', '<', '>', '?'], ['ABC', '/', '~', '`', '\u00E9', '\u00F1', 'BACK'], ['ABC', 'SPACE', 'DONE']]
  };
  K.OSK_ROWS = ROWS;
  K.osk = o => {
    let val = String(o.value || ''), mode = 'lower', oneShot = false;
    const L = K.el('div', 'layer'), b = K.el('div', 'box osk'), title = K.el('h3', '', K.esc(o.title || 'Type here')), disp = K.el('div', 'val'), kb = K.el('div');
    b.append(title, disp, kb); L.appendChild(b);
    const show = () => { disp.textContent = o.secret ? '\u2022'.repeat(val.length) : val; };
    const done = send => { K.closeLayer(L); o.onDone && o.onDone(val, !!send); };
    const cancel = () => { K.closeLayer(L); o.onCancel && o.onCancel(); };
    const press = k => {
      if (k === 'SHIFT') { oneShot = mode === 'lower'; mode = mode === 'lower' ? 'upper' : 'lower'; draw(); }
      else if (k === 'SYM') { mode = 'sym'; draw(); } else if (k === 'ABC') { mode = 'lower'; draw(); }
      else if (k === 'BACK') { val = val.slice(0, -1); show(); } else if (k === 'SPACE') { val += ' '; show(); }
      else if (k === 'DONE') done(false); else if (k === 'SEND') done(true);
      else { K.snd && K.snd.play('key'); val += k; show(); if (oneShot) { oneShot = false; mode = 'lower'; draw(); } }
    };
    function draw() {
      kb.innerHTML = '';
      const rows = ROWS[mode].map(r => r.slice());
      if (o.canSend) rows[rows.length - 1] = rows[rows.length - 1].concat(['SEND']);
      rows.forEach((r, ri) => {
        const row = K.el('div', 'krow');
        r.forEach(k => {
          const label = k === 'SPACE' ? 'space' : k === 'BACK' ? '\u232B' : k === 'SHIFT' ? '\u21E7' : k === 'DONE' ? (o.submitLabel || 'Done') : k === 'SEND' ? 'Send \u21B5' : k === 'SYM' ? '#+=' : k === 'ABC' ? 'ABC' : k;
          const e = K.nav(K.el('button', 'k' + (k === 'SPACE' ? ' sp' : '') + (k === 'DONE' || k === 'SEND' ? ' ac' : (k.length > 1 && /^[A-Z]+$/.test(k) && k !== 'SPACE' ? ' w' : '')), K.esc(label)));
          e.onclick = () => press(k); row.appendChild(e);
        });
        kb.appendChild(row);
      });
      const keep = (K.current() && K.current().textContent) || '';
      const l = navs(L); const same = l.find(x => x.textContent === keep) || l.find(x => x.textContent === 'q' || x.textContent === 'Q');
      if (same) K.focus(same);
    }
    L._key = e => { // physical keyboard
      if (e.key === 'Enter') { done(false); return true; } if (e.key === 'Escape') { cancel(); return true; }
      if (e.key === 'Backspace') { val = val.slice(0, -1); show(); return true; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { val += e.key; show(); return true; } return false;
    };
    L._alt = () => press('BACK'); L._opts = () => done(false);
    S.osk = true; show(); K.openLayer(L, cancel); draw();
    return L;
  };
  K.field = (label, value, o) => {
    o = o || {}; const f = K.nav(K.el('button', 'fld')), set = v => { f.innerHTML = '<span>' + K.esc(label) + '</span><b>' + (o.secret ? '\u2022'.repeat(String(v || '').length) : K.esc(v || o.placeholder || '')) + '</b>'; };
    f.value = value || ''; set(f.value);
    f.onclick = () => K.osk({ title: label, value: f.value, secret: o.secret, onDone: v => { f.value = v; set(v); o.onChange && o.onChange(v); } });
    return f;
  };

  // ---------- input: actions ----------
  K.act = a => {
    const top = layers().lastElementChild;
    if ((a === 'left' || a === 'right') && cur && cur._adjust) { cur._adjust(a === 'left' ? -1 : 1); return; }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') { move(a); return; }
    if (a === 'ok') { if (cur) { if (notMine()) { K.denied(cur); return; } K.snd && K.snd.play('ok'); cur.click(); } return; }
    if (a === 'back') { if (top) { if (top._cancel) top._cancel(); } else if (S.backFn) { K.snd && K.snd.play('back'); S.backFn(); } return; }
    if (a === 'alt') { if (top && top._alt) top._alt(); else if (!top && cur && cur._onalt) { if (notMine()) { K.denied(cur); return; } cur._onalt(cur); } return; }
    if (a === 'opts') { if (top && top._opts) top._opts(); else if (!top && cur && cur._onopts) { if (notMine()) { K.denied(cur); return; } cur._onopts(cur); } return; }
    if (a === 'prev' || a === 'next') { if (!top && S.bumper) S.bumper(a); return; }
    if (a === 'start') { if (!top && S.startFn) S.startFn(); return; }
  };
  K.fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: (S.settings && S.settings.clock24) ? false : undefined });
  window.addEventListener('keydown', e => {
    if (K.touch()) { e.preventDefault(); return; }
    const top = layers().lastElementChild;
    if (top && top._key && top.querySelector('.osk')) { if (top._key(e)) { e.preventDefault(); return; } }
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'WEBVIEW') return;
    document.body.classList.remove('padmode');
    const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', Tab: e.shiftKey ? 'prev' : 'next', F2: 'opts', ContextMenu: 'opts', Home: 'start', Insert: 'alt' }[e.key];
    if (m) { e.preventDefault(); K.act(m); }
  });
  window.addEventListener('mousemove', () => { document.body.classList.add('mouse'); K.touch(); });
  window.addEventListener('mousedown', () => { K.touch(); });
  window.addEventListener('keydown', () => document.body.classList.remove('mouse'));

  // ---------- gamepads ----------
  const ps = {}; let lastN = 0;
  // Two paths feed the controller: the browser (needs window focus) and the native helper (does not). Both go through
  // padEvent(); an event seen on both paths within 140 ms is only used once.
  // ---- every controller belongs to one player ----
  K.pads = () => (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []);
  K.twoPlayers = () => !!(S.players && S.players[1]);
  // gamepad index -> 0 (Player 1) | 1 (Player 2) | null (a third controller)
  K.owners = () => {
    const pads = K.pads(), out = {}; if (!K.twoPlayers()) { pads.forEach(p => { out[p.index] = 0; }); return out; }
    const ids = (S.settings && S.settings.padIds) || [], taken = [false, false];
    if (ids[0] && ids[1] && ids[0] !== ids[1]) pads.forEach(p => { const o = p.id === ids[0] ? 0 : p.id === ids[1] ? 1 : -1; if (o >= 0 && !taken[o]) { out[p.index] = o; taken[o] = true; } });
    const rest = pads.filter(p => out[p.index] === undefined); if (S.settings && S.settings.padSwap) rest.reverse();
    rest.forEach(p => { const o = !taken[0] ? 0 : !taken[1] ? 1 : null; if (o !== null) taken[o] = true; out[p.index] = o; });
    return out;
  };
  K.ownerOf = idx => { const o = K.owners()[idx]; return o === undefined ? 0 : o; };
  K.padIndexOf = player => {
    const o = K.owners(); for (const k in o) if (o[k] === player) return +k;
    if (player === 0) { const id = S.settings && S.settings.padIds && S.settings.padIds[0], p = id && K.pads().find(x => x.id === id); if (p) return p.index; }
    return player === 0 ? ((K.pads()[0] || {}).index || 0) : -1;
  };
  K.padName = idx => { const p = K.pads().find(x => x.index === idx); return p ? String(p.id || 'Controller').replace(/\s*\(.*$/, '').slice(0, 40) : 'Controller'; };
  // The player is shown in the top bar chips (P1 / P2), not on every tile.
  const whoTag = () => { document.body.classList.toggle('pl2', S.active === 1 && K.twoPlayers()); };
  K.whoRefresh = () => whoTag();
  let movingT = null;
  const markMoving = p => {
    document.querySelectorAll('.chip[data-owner]').forEach(c => c.classList.toggle('moving', c.dataset.owner === String(p) && K.twoPlayers()));
    clearTimeout(movingT); movingT = setTimeout(() => document.querySelectorAll('.chip.moving').forEach(c => c.classList.remove('moving')), 2200);
  };
  let deniedAt = 0;
  K.denied = el => { el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny'); setTimeout(() => el.classList.remove('deny'), 400); if (Date.now() - deniedAt > 1500) { deniedAt = Date.now(); K.toast && K.toast('That belongs to Player ' + (+el.dataset.owner + 1)); } };
  const notMine = () => K.fromPad && cur && cur.dataset && cur.dataset.owner !== undefined && cur.dataset.owner !== String(S.active);
  const seenAt = {}; K.padLog = []; K.padCount = { api: 0, helper: 0 };
  K.lastInput = Date.now();
  K.touch = () => { K.lastInput = Date.now(); if (K.saverOn && K.saverOff) { K.saverOff(); return true; } return false; };
  const SWAPS = { ok: 'back', back: 'ok', alt: 'opts', opts: 'alt' };
  K.rumble = idx => { try { if (S.settings && S.settings.rumble === false) return; const gp = navigator.getGamepads()[idx]; if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: 35, strongMagnitude: 0, weakMagnitude: 0.35 }).catch(() => {}); } catch (_) {} };
  function padEvent(src, a, idx) {
    const now = performance.now(), other = src === 'api' ? 'helper' : 'api';
    K.padCount[src]++; K.padLog.push({ src, a, t: Date.now() }); if (K.padLog.length > 14) K.padLog.shift(); if (K.onPadLog) K.onPadLog();
    if (seenAt[other + a] && now - seenAt[other + a] < 140) return;
    seenAt[src + a] = now;
    if (S.screen === 'web' && !layers().lastElementChild) return;
    if (K.touch()) return;   // woke the screensaver; swallow this press
    if (src === 'api' && K.twoPlayers() && K.owners()[idx] === null) return;   // a third controller does nothing while two people play
    if (src === 'api' && K.grab && K.grab(idx, a)) return;                      // "press A on the controller for Player N"
    document.body.classList.remove('mouse');
    S.active = src === 'api' ? K.ownerOf(idx) : (idx === 1 && S.players[1] ? 1 : 0);
    if (src === 'api') { try { const gp = navigator.getGamepads()[idx], t = gp && /054c|dualshock|dualsense|wireless controller|playstation/i.test(gp.id || '') ? 'ps' : 'xbox'; if (t !== K.padType) { K.padType = t; K.hints(lastHints); } } catch (_) {} }
    if (a === 'select') return;
    const st = S.settings || {}; let m = a;
    if (st.swapAB && (a === 'ok' || a === 'back')) m = SWAPS[a]; else if (st.swapXY && (a === 'alt' || a === 'opts')) m = SWAPS[a];
    if (K.onPad) K.onPad(m, idx);
    if (m === 'ok') K.rumble(idx);
    markMoving(S.active); K.fromPad = true; try { K.act(m); } finally { K.fromPad = false; } K.whoRefresh();
  }
  function fire(a, idx) { padEvent('api', a, idx); }
  function poll(ts) {
    requestAnimationFrame(poll);
    if (S.screen === 'web' && !layers().lastElementChild) return;
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    S.pads = pads.map(p => p.index);
    // Another SKBox window (SK menu, SKBrowse) is in front: do not react, but keep the button state so nothing fires when we come back.
    if (K.inputLock || (K.isMainWindow && !document.hasFocus())) { for (const p of pads) { const st = ps[p.index] || (ps[p.index] = { b: [], rep: {} }); st.b = p.buttons.map(x => x.pressed); st.rep = {}; } return; }
    if (pads.length !== lastN) { lastN = pads.length; if (K.onPadCount) K.onPadCount(lastN); }
    for (const p of pads) {
      const st = ps[p.index] || (ps[p.index] = { b: [], rep: {} });
      const b = p.buttons.map(x => x.pressed), ax = p.axes;
      const dirs = { up: b[12] || ax[1] < -0.6, down: b[13] || ax[1] > 0.6, left: b[14] || ax[0] < -0.6, right: b[15] || ax[0] > 0.6 };
      for (const d in dirs) { if (dirs[d]) { const r = st.rep[d]; if (!r) { fire(d, p.index); st.rep[d] = { t: ts + 380 }; } else if (ts > r.t) { fire(d, p.index); r.t = ts + 110; } } else delete st.rep[d]; }
      const edge = i => b[i] && !st.b[i];
      if (edge(0)) fire('ok', p.index); if (edge(1)) fire('back', p.index); if (edge(2)) fire('alt', p.index); if (edge(3)) fire('opts', p.index);
      if (edge(4)) fire('prev', p.index); if (edge(5)) fire('next', p.index); if (edge(9)) fire('start', p.index);
      if (edge(16) && K.sk) { if (S.screen === 'overlay') K.sk.overlay.close(); else K.sk.helper.testMenu(); }   // Xbox / PS button seen by the browser: open the SK menu
      st.b = b;
    }
  }
  // Controller input that arrives from the native helper (works without window focus, e.g. over a fullscreen game)
  K.padFromHelper = false;
  K.padIn = (slot, a) => padEvent('helper', a, slot);
  window.addEventListener('gamepadconnected', e => K.toast('Controller connected: ' + (e.gamepad.id || '').split('(')[0].trim().slice(0, 40)));
  window.addEventListener('gamepaddisconnected', () => K.toast('Controller disconnected'));
  K.startPads = () => requestAnimationFrame(poll);
  try { K.isMainWindow = !/overlay|backdrop/.test(location.pathname); if (window.sk && window.sk.on) window.sk.on('input-lock', v => { K.inputLock = !!v; }); } catch (_) {}
})();
