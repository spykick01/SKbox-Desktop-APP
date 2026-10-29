// Runs inside the SKchat / SKMusic web page. Lets a controller drive it: left stick = cursor, A = click,
// right stick / D-pad = scroll, B = back, Select (View) = return to SKBox, Y = keyboard.
const { ipcRenderer } = require('electron');
let ACTIVE = 0;
ipcRenderer.on('active-pad', (_e, i) => { ACTIVE = i | 0; });
window.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) ipcRenderer.sendToHost('home'); });
window.addEventListener('DOMContentLoaded', () => {
  const cur = document.createElement('div');
  cur.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #2dd4bf;background:rgba(45,212,191,.25);box-shadow:0 0 14px #2dd4bf;display:none;left:0;top:0';
  document.documentElement.appendChild(cur);
  let cx = innerWidth / 2, cy = innerHeight / 2, last = 0, prev = [], idle = 0;
  const dz = v => Math.abs(v) < 0.18 ? 0 : v;
  const fire = (el, type, x, y, extra) => { try { el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }, extra || {}))); } catch (e) {} };
  const isField = el => el && (el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]),textarea,[contenteditable="true"]'));
  function click(right) {
    const el = document.elementFromPoint(cx, cy); if (!el) return;
    ['pointerdown', 'mousedown'].forEach(t => fire(el, t, cx, cy, { button: right ? 2 : 0 }));
    ['pointerup', 'mouseup'].forEach(t => fire(el, t, cx, cy, { button: right ? 2 : 0 }));
    if (right) { fire(el, 'contextmenu', cx, cy, { button: 2 }); return; }
    fire(el, 'click', cx, cy);
    const f = isField(el) ? el : (el.closest && el.closest('input,textarea,[contenteditable="true"]'));
    if (f && isField(f)) { f.focus(); ipcRenderer.sendToHost('osk', { type: f.type || 'text', value: f.value || f.textContent || '' }); }
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
    if (lx || ly) { cx = Math.max(0, Math.min(innerWidth - 1, cx + lx * Math.abs(lx) * 20 * dt)); cy = Math.max(0, Math.min(innerHeight - 1, cy + ly * Math.abs(ly) * 20 * dt)); idle = 0; fire(document.elementFromPoint(cx, cy) || document.body, 'mousemove', cx, cy); }
    else idle += dt;
    cur.style.display = 'block'; cur.style.transform = 'translate(' + cx + 'px,' + cy + 'px)'; cur.style.opacity = idle > 300 ? '0.45' : '1';
    if (ry) scrollAt(ry * 24 * dt);
    const b = g.buttons.map(x => x.pressed), edge = i => b[i] && !prev[i];
    if (b[12]) scrollAt(-14 * dt); if (b[13]) scrollAt(14 * dt);
    if (edge(0)) click(false);
    if (edge(2)) click(true);
    if (edge(1)) { if (history.length > 1) history.back(); }
    if (edge(4)) history.back(); if (edge(5)) history.forward();
    if (edge(3)) { const a = document.activeElement; ipcRenderer.sendToHost('osk', { type: (a && a.type) || 'text', value: (a && a.value) || '' }); }
    if (edge(8) || edge(16)) ipcRenderer.sendToHost('home');
    prev = b;
  }
  requestAnimationFrame(loop);
});
