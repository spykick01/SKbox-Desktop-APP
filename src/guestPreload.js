// Runs inside the SKchat / SKMusic web page. Lets a controller drive it: left stick = cursor, A = click,
// D-pad = jump between buttons and links (console style), right stick = scroll, B = back, View = return to SKBox, Y = keyboard.
const { ipcRenderer } = require('electron');
let ACTIVE = 0;
const toHost = (ch, arg) => { try { ipcRenderer.sendToHost(ch, arg); } catch (e) {} try { ipcRenderer.send('guest:' + ch, arg); } catch (e) {} };
ipcRenderer.on('active-pad', (_e, i) => { ACTIVE = i | 0; });
window.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) toHost('home'); });
window.addEventListener('DOMContentLoaded', () => {
  const cur = document.createElement('div');
  cur.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #2dd4bf;background:rgba(45,212,191,.25);box-shadow:0 0 14px #2dd4bf;display:none;left:0;top:0';
  document.documentElement.appendChild(cur);
  let cx = innerWidth / 2, cy = innerHeight / 2, last = 0, prev = [], idle = 0, mode = 'cursor', fe = null, rep = {};
  // ---- D-pad navigation: finds the buttons / links / fields on screen and jumps between them ----
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=link],[role=option],[role=switch],[onclick],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const ring = document.createElement('div');
  ring.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #2dd4bf;border-radius:10px;box-shadow:0 0 0 2px rgba(0,0,0,.6),0 0 18px #2dd4bf;display:none;left:0;top:0;transition:transform .09s,width .09s,height .09s';
  document.documentElement.appendChild(ring);
  function candidates() {
    return Array.from(document.querySelectorAll(SEL)).filter(e => {
      if (e.disabled) return false;
      const r = e.getBoundingClientRect(); if (r.width < 10 || r.height < 10 || r.bottom < 2 || r.top > innerHeight - 2 || r.right < 2 || r.left > innerWidth - 2) return false;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || +cs.opacity === 0) return false;
      const px = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), py = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), t = document.elementFromPoint(px, py);
      return !!t && (e === t || e.contains(t) || t.contains(e));
    });
  }
  function showRing() {
    if (!fe || !document.contains(fe)) { ring.style.display = 'none'; return; }
    const r = fe.getBoundingClientRect(); ring.style.display = 'block';
    ring.style.width = Math.max(14, r.width + 6) + 'px'; ring.style.height = Math.max(14, r.height + 6) + 'px'; ring.style.transform = 'translate(' + (r.left - 3) + 'px,' + (r.top - 3) + 'px)';
  }
  function focusMove(dir) {
    mode = 'focus'; const list = candidates(); if (!list.length) { scrollAt(dir === 'up' ? -160 : dir === 'down' ? 160 : 0); return; }
    if (!fe || !document.contains(fe) || !list.includes(fe)) {
      const hit = document.elementFromPoint(cx, cy); const near = hit && list.find(e => e === hit || e.contains(hit));
      fe = near || list.reduce((b, e) => { const r = e.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); return !b || d < b.d ? { e, d } : b; }, null).e; showRing(); return;
    }
    const a = fe.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2; let best = null, bs = 1e12;
    for (const e of list) {
      if (e === fe || fe.contains(e) || e.contains(fe)) continue;
      const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - ax, dy = q.top + q.height / 2 - ay; let ok, p, o;
      if (dir === 'left') { ok = dx < -4; p = -dx; o = Math.abs(dy); } else if (dir === 'right') { ok = dx > 4; p = dx; o = Math.abs(dy); } else if (dir === 'up') { ok = dy < -4; p = -dy; o = Math.abs(dx); } else { ok = dy > 4; p = dy; o = Math.abs(dx); }
      if (!ok) continue; const sc = p + o * 2.2; if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { fe = best; const r = fe.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; showRing(); }
    else { if (dir === 'up' || dir === 'down') scrollAt(dir === 'up' ? -180 : 180); setTimeout(showRing, 120); }
  }
  const dz = v => Math.abs(v) < 0.18 ? 0 : v;
  const fire = (el, type, x, y, extra) => { try { el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }, extra || {}))); } catch (e) {} };
  const isField = el => el && (el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]),textarea,[contenteditable="true"]'));
  function click(right) {
    if (mode === 'focus' && fe && document.contains(fe)) { const r = fe.getBoundingClientRect(); cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)); cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); }
    const el = document.elementFromPoint(cx, cy); if (!el) return;
    ['pointerdown', 'mousedown'].forEach(t => fire(el, t, cx, cy, { button: right ? 2 : 0 }));
    ['pointerup', 'mouseup'].forEach(t => fire(el, t, cx, cy, { button: right ? 2 : 0 }));
    if (right) { fire(el, 'contextmenu', cx, cy, { button: 2 }); return; }
    fire(el, 'click', cx, cy);
    const f = isField(el) ? el : (el.closest && el.closest('input,textarea,[contenteditable="true"]'));
    if (f && isField(f)) { f.focus(); toHost('osk', { type: f.type || 'text', value: f.value || f.textContent || '' }); }
  }
  function scrollAt(dy) {
    let el = document.elementFromPoint(cx, cy);
    while (el && el !== document.body) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop += dy; return; } el = el.parentElement; }
    window.scrollBy(0, dy);
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const g = pads.find(p => p.index === ACTIVE) || pads[0]; if (!g) { cur.style.display = 'none'; return; }
    const dt = Math.min(50, ts - last || 16) / 16; last = ts;
    const lx = dz(g.axes[0] || 0), ly = dz(g.axes[1] || 0), ry = dz(g.axes[3] || 0);
    if (lx || ly) { cx = Math.max(0, Math.min(innerWidth - 1, cx + lx * Math.abs(lx) * 20 * dt)); cy = Math.max(0, Math.min(innerHeight - 1, cy + ly * Math.abs(ly) * 20 * dt)); idle = 0; if (mode !== 'cursor') { mode = 'cursor'; ring.style.display = 'none'; } fire(document.elementFromPoint(cx, cy) || document.body, 'mousemove', cx, cy); }
    else idle += dt;
    cur.style.display = mode === 'cursor' ? 'block' : 'none'; if (mode === 'focus') showRing(); cur.style.transform = 'translate(' + cx + 'px,' + cy + 'px)'; cur.style.opacity = idle > 300 ? '0.45' : '1';
    if (ry) scrollAt(ry * 24 * dt);
    const b = g.buttons.map(x => x.pressed), edge = i => b[i] && !prev[i];
    [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']].forEach(([i, d]) => { if (b[i]) { const r = rep[i]; if (!r) { focusMove(d); rep[i] = ts + 380; } else if (ts > r) { focusMove(d); rep[i] = ts + 120; } } else delete rep[i]; });
    if (edge(0)) click(false);
    if (edge(2)) click(true);
    if (edge(1)) { if (history.length > 1) history.back(); }
    if (edge(4)) history.back(); if (edge(5)) history.forward();
    if (edge(3)) { const a = document.activeElement; toHost('osk', { type: (a && a.type) || 'text', value: (a && a.value) || '' }); }
    if (edge(8) || edge(16)) toHost('home');
    if (edge(9)) toHost('menu');
    prev = b;
  }
  requestAnimationFrame(loop);
});
