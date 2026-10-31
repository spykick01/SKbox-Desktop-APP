// Turns a remote controller (browser "standard" gamepad layout) into keyboard / mouse input on the host PC.
// Modes: 'menus' (arrows, Enter, Esc ... which SKBox understands) and 'keys' (a simple WASD + mouse preset for games).
// Real controller pass-through needs a virtual-controller driver, which SKBox does not install.
const K = { up: [0x48, 1], down: [0x50, 1], left: [0x4B, 1], right: [0x4D, 1], enter: [0x1C, 0], esc: [0x01, 0], back: [0x0E, 0], f2: [0x3C, 0], home: [0x47, 1], ins: [0x52, 1], tab: [0x0F, 0], shift: [0x2A, 0], ctrl: [0x1D, 0], o: [0x18, 0],
  w: [0x11, 0], a: [0x1E, 0], s: [0x1F, 0], d: [0x20, 0], e: [0x12, 0], q: [0x10, 0], r: [0x13, 0], f: [0x21, 0], space: [0x39, 0], lshift: [0x2A, 0], lctrl: [0x1D, 0] };
// standard layout: 0 A 1 B 2 X 3 Y 4 LB 5 RB 6 LT 7 RT 8 Back 9 Start 10 L3 11 R3 12 up 13 down 14 left 15 right 16 guide
const KEYS_MAP = { 0: 'space', 1: 'lshift', 2: 'e', 3: 'q', 4: 'r', 5: 'f', 9: 'esc', 10: 'lctrl', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

class PadMapper {
  constructor(io) { this.io = io; this.mode = 'menus'; this.f = null; this.held = {}; this.prev = 0; this.rep = {}; this.mouseBtn = { 0: false, 2: false }; }
  setMode(m) { this.reset(); this.mode = m === 'keys' || m === 'off' ? m : 'menus'; }
  frame(f) {
    if (!f || typeof f !== 'object') return; const c = v => Math.max(-100, Math.min(100, Math.round(+v) || 0));
    this.f = { b: (+f.b | 0) & 0x1FFFF, lx: c(f.lx), ly: c(f.ly), rx: c(f.rx), ry: c(f.ry), lt: Math.max(0, Math.min(100, Math.round(+f.lt) || 0)), rt: Math.max(0, Math.min(100, Math.round(+f.rt) || 0)) };
  }
  hold(name, down) { const k = K[name]; if (!k) return; const on = !!this.held[name]; if (down === on) return; this.held[name] = down; this.io.key(k[0], k[1], down ? 1 : 0); }
  tap(name) { const k = K[name]; if (k) { this.io.key(k[0], k[1], 1); this.io.key(k[0], k[1], 0); } }
  combo(names) { names.forEach(n => this.io.key(K[n][0], K[n][1], 1)); names.slice().reverse().forEach(n => this.io.key(K[n][0], K[n][1], 0)); }
  repeat(id, on, now, fn) { if (!on) { delete this.rep[id]; return; } const r = this.rep[id]; if (!r) { fn(); this.rep[id] = now + 380; } else if (now >= r) { fn(); this.rep[id] = now + 110; } }
  tick(now) {
    if (this.mode === 'off' || !this.f) return; const f = this.f, bit = i => ((f.b >> i) & 1) === 1, edge = i => bit(i) && !((this.prev >> i) & 1);
    if (edge(16) || edge(8)) this.combo(['ctrl', 'shift', 'o']);   // Xbox / PS button or Back opens the SK menu
    if (this.mode === 'menus') {
      const T = 55;
      this.repeat('u', bit(12) || f.ly < -T, now, () => this.tap('up')); this.repeat('d', bit(13) || f.ly > T, now, () => this.tap('down'));
      this.repeat('l', bit(14) || f.lx < -T, now, () => this.tap('left')); this.repeat('r', bit(15) || f.lx > T, now, () => this.tap('right'));
      if (edge(0)) this.tap('enter'); if (edge(1)) this.tap('esc'); if (edge(2)) this.tap('ins'); if (edge(3)) this.tap('f2'); if (edge(9)) this.tap('home');
      if (edge(5)) this.tap('tab'); if (edge(4)) this.combo(['shift', 'tab']);
    } else {
      const T = 45; this.hold('w', f.ly < -T); this.hold('s', f.ly > T); this.hold('a', f.lx < -T); this.hold('d', f.lx > T);
      for (const i in KEYS_MAP) this.hold(KEYS_MAP[i], bit(+i));
      const rt = f.rt > 40 || bit(7), lt = f.lt > 40 || bit(6);
      if (rt !== this.mouseBtn[0]) { this.mouseBtn[0] = rt; this.io.button(0, rt ? 1 : 0); } if (lt !== this.mouseBtn[2]) { this.mouseBtn[2] = lt; this.io.button(2, lt ? 1 : 0); }
      const dz = 14, mv = v => { const a = Math.abs(v); return a < dz ? 0 : Math.sign(v) * Math.pow((a - dz) / (100 - dz), 2) * 22; };
      const dx = Math.round(mv(f.rx)), dy = Math.round(mv(f.ry)); if (dx || dy) this.io.mouse(dx, dy);
    }
    this.prev = f.b;
  }
  reset() { for (const n in this.held) if (this.held[n]) { this.held[n] = false; try { this.io.key(K[n][0], K[n][1], 0); } catch (_) {} } for (const b in this.mouseBtn) if (this.mouseBtn[b]) { this.mouseBtn[b] = false; try { this.io.button(+b, 0); } catch (_) {} } this.rep = {}; this.prev = 0; this.f = null; }
}
module.exports = { PadMapper, K };
