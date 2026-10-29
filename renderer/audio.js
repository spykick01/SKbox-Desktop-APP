// SKBox sound: UI sound effects + five original, generated "cozy" music moods. Everything is synthesized, no audio files.
(function (root) {
  'use strict';
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function Engine(ctx, dest) {
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = 1; this.out.connect(dest || ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(this.out);
    this.rev = ctx.createConvolver(); this.rev.buffer = this._impulse(2.8, 2.4);
    const rg = ctx.createGain(); rg.gain.value = 0.55; this.rev.connect(rg); rg.connect(this.out);
    this.bus = ctx.createGain(); this.bus.connect(this.dry); this.send = ctx.createGain(); this.send.gain.value = 0.38; this.bus.connect(this.send); this.send.connect(this.rev);
    this.noise = this._noise(2); this.beds = []; this.i = 0; this.next = 0; this.mood = null;
  }
  const P = Engine.prototype;
  P._impulse = function (sec, decay) { const sr = this.ctx.sampleRate, len = Math.floor(sr * sec), b = this.ctx.createBuffer(2, len, sr); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; };
  P._noise = function (sec) { const sr = this.ctx.sampleRate, len = Math.floor(sr * sec), b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; };
  // ---- voices ----
  P.osc = function (type, f, t, dur, g, a, r, dest, cut, det) {
    const c = this.ctx, o = c.createOscillator(), e = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det;
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.setValueAtTime(g, t + Math.max(a, dur - r)); e.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    let n = o; if (cut) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; o.connect(lp); n = lp; }
    n.connect(e); e.connect(dest || this.bus); o.start(t); o.stop(t + dur + 0.1); return e;
  };
  P.pad = function (f, t, dur, g, type, cut) { this.osc(type || 'triangle', f, t, dur, g, Math.min(1.4, dur * 0.4), Math.min(1.6, dur * 0.5), this.bus, cut || 900, -7); this.osc(type || 'triangle', f, t, dur, g, Math.min(1.4, dur * 0.4), Math.min(1.6, dur * 0.5), this.bus, cut || 900, 7); };
  P.pluck = function (f, t, g, dec, type, cut) { const c = this.ctx, o = c.createOscillator(), e = c.createGain(), lp = c.createBiquadFilter(); o.type = type || 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(cut || 2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + (dec || 1.2)); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + (dec || 1.2)); o.connect(lp); lp.connect(e); e.connect(this.bus); o.start(t); o.stop(t + (dec || 1.2) + 0.1); };
  P.bell = function (f, t, g, dec) { dec = dec || 1.8; [[1, 1], [2.01, 0.35], [3.02, 0.12]].forEach(([m, a]) => this.osc('sine', f * m, t, dec / (m > 1 ? m * 0.7 : 1), g * a, 0.004, dec * 0.8, this.bus)); };
  P.rhodes = function (f, t, g, dur) { this.osc('sine', f, t, dur, g, 0.01, dur * 0.8, this.bus); this.osc('sine', f * 2, t, dur * 0.5, g * 0.28, 0.005, dur * 0.4, this.bus); this.osc('triangle', f * 4, t, 0.18, g * 0.1, 0.002, 0.15, this.bus); };
  P.reed = function (f, t, dur, g) { const c = this.ctx, o = c.createOscillator(), e = c.createGain(), lp = c.createBiquadFilter(), l = c.createOscillator(), lg = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; l.frequency.value = 5; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(o.frequency); lp.type = 'lowpass'; lp.frequency.value = 1300; e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + 0.25); e.gain.setValueAtTime(g, t + dur * 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(lp); lp.connect(e); e.connect(this.bus); o.start(t); l.start(t); o.stop(t + dur + 0.1); l.stop(t + dur + 0.1); };
  P.kick = function (t, g) { const c = this.ctx, o = c.createOscillator(), e = c.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.connect(e); e.connect(this.dry); o.start(t); o.stop(t + 0.3); };
  P.hit = function (t, g, dur, type, freq, q, dest) { const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain(); s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(e); e.connect(dest || this.dry); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02); };
  P.snare = function (t, g) { this.hit(t, g, 0.16, 'bandpass', 1800, 0.8, this.bus); this.osc('triangle', 190, t, 0.1, g * 0.4, 0.002, 0.08, this.dry); };
  P.hat = function (t, g) { this.hit(t, g, 0.04, 'highpass', 7500, 0.7); };
  P.bed = function (kind) { // continuous background textures
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true;
    if (kind === 'rain') { f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 0.35; g.gain.value = 0.1; }
    else if (kind === 'wind') { f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.1; const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.09; lg.gain.value = 0.06; l.connect(lg); lg.connect(g.gain); l.start(); this.beds.push(l); }
    else { f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0.06; }
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(); this.beds.push(s); this.beds.push(g);
  };
  P.pop = function (t, g) { this.hit(t, g, rnd(0.015, 0.05), 'bandpass', rnd(1500, 4500), 1.5); };
  P.stopBeds = function () { const t = this.ctx.currentTime; this.beds.forEach(n => { try { if (n.gain) n.gain.setTargetAtTime(0, t, 0.4); else if (n.stop) n.stop(t + 1.5); } catch (e) {} }); this.beds = []; };

  // ---- moods ----
  const SW = (m, t, s, sw) => (s % 2 === 1 ? t + sw : t);
  const MOODS = {
    campfire: { name: 'Campfire', bpm: 66, beds: ['wind'], chords: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]], pent: [69, 72, 74, 76, 79, 81],
      step(m, t, i, ch, s) {
        if (s === 0) ch.forEach((n, k) => m.pad(midi(n), t, 3.9, 0.05, 'triangle', 700));
        if ([0, 3, 6, 8, 11, 14].includes(s) && Math.random() > 0.12) m.pluck(midi(ch[(s / 2 | 0) % ch.length] + (s > 7 ? 12 : 0)), t, rnd(0.07, 0.12), 1.5, 'triangle', 2400);
        if ((s === 4 || s === 12) && Math.random() < 0.33) m.pluck(midi(pick(this.pent)), t, 0.1, 2.2, 'triangle', 3000);
        if (Math.random() < 0.45) m.pop(t + rnd(0, 0.2), rnd(0.03, 0.09));
      } },
    lofi: { name: 'Rainy Lo-fi', bpm: 74, swing: 0.045, beds: ['rain'], chords: [[50, 57, 60, 64], [43, 59, 62, 65], [48, 55, 59, 62], [45, 55, 59, 64]], pent: [62, 65, 67, 69, 72, 74],
      step(m, t, i, ch, s) {
        const ts = SW(m, t, s, 0.045);
        if (s === 0 || s === 10) ch.forEach((n, k) => m.rhodes(midi(n + 12), ts + k * 0.022, 0.07, s === 0 ? 1.9 : 1.2));
        if (s === 0 || s === 10) m.osc('sine', midi(ch[0] - 12), ts, 1.2, 0.12, 0.01, 0.9, m.dry, 400);
        if (s === 0 || s === 10) m.kick(ts, 0.35); if (s === 4 || s === 12) m.snare(ts, 0.1);
        if (s % 2 === 0) m.hat(ts, rnd(0.02, 0.05)); if (Math.random() < 0.06) m.hat(ts + 0.12, 0.02);
        if ((s === 6 || s === 14) && Math.random() < 0.4) m.rhodes(midi(pick(this.pent) + 12), ts, 0.06, 0.9);
        if (Math.random() < 0.25) m.pop(ts + rnd(0, 0.2), rnd(0.012, 0.03));
      } },
    west: { name: 'Wild West Dusk', bpm: 58, beds: ['wind'], chords: [[40, 52, 59, 64], [48, 52, 55, 60], [43, 55, 59, 62], [50, 54, 57, 62]], pent: [64, 67, 69, 71, 74, 76],
      step(m, t, i, ch, s) {
        if (s === 0) { m.pad(midi(ch[0]), t, 4.2, 0.07, 'sawtooth', 380); ch.forEach((n, k) => m.pluck(midi(n), t + k * 0.035, 0.1, 1.9, 'sawtooth', 1700)); }
        if ([6, 10, 14].includes(s) && Math.random() > 0.2) m.pluck(midi(ch[1 + ((s / 4 | 0) % 3)] + 12), t, 0.08, 1.4, 'sawtooth', 1900);
        if (s === 8 && Math.random() < 0.55) m.reed(midi(pick(this.pent)), t, rnd(1.4, 2.8), 0.055);
      } },
    pixel: { name: 'Pixel Garden', bpm: 92, beds: [], chords: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 53, 57, 60], [43, 55, 59, 62]], pent: [72, 74, 76, 79, 81, 84],
      step(m, t, i, ch, s) {
        if (s === 0) ch.forEach(n => m.pad(midi(n), t, 3.2, 0.035, 'sine', 1500));
        if ([0, 6, 10].includes(s)) m.osc('sine', midi(ch[0] - 12), t, 0.5, 0.11, 0.01, 0.35, m.dry, 500);
        if (s % 2 === 0 && Math.random() < 0.62) { const n = pick(this.pent) - (Math.random() < 0.3 ? 12 : 0); m.bell(midi(n), t, 0.085, 1.5); }
        if (s === 15 && Math.random() < 0.3) { m.bell(midi(pick(this.pent) + 12), t, 0.05, 2.4); }
      } },
    neon: { name: 'Neon Night', bpm: 84, swing: 0, beds: [], chords: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]], pent: [69, 72, 74, 76, 79],
      step(m, t, i, ch, s) {
        if (s === 0) ch.forEach(n => m.pad(midi(n + 12), t, 3.3, 0.05, 'sawtooth', 1100));
        if (s % 2 === 0) m.pluck(midi(ch[(s / 2) % ch.length] + (s % 4 === 0 ? 24 : 12)), t, 0.07, 0.45, 'square', 1700);
        if ([0, 6, 10].includes(s)) m.osc('sine', midi(ch[0] - 12), t, 0.55, 0.14, 0.01, 0.4, m.dry, 380);
        if (s === 0 || s === 8) m.kick(t, 0.32); if (s === 8) m.snare(t, 0.09); if (s % 4 === 2) m.hat(t, 0.025);
        if ((s === 4 || s === 12) && Math.random() < 0.3) m.pluck(midi(pick(this.pent) + 12), t, 0.08, 1.6, 'triangle', 2800);
      } }
  };
  P.moods = MOODS;
  P.start = function (id, t0) { const m = MOODS[id]; if (!m) return; this.stopBeds(); this.mood = m; this.i = 0; this.next = t0 == null ? this.ctx.currentTime + 0.15 : t0; (m.beds || []).forEach(b => this.bed(b)); };
  P.schedule = function (until) { const m = this.mood; if (!m) return; const sd = 60 / m.bpm / 4; while (this.next < until) { const i = this.i++, bar = Math.floor(i / 16), ch = m.chords[bar % m.chords.length], s = i % 16; try { m.step(this, this.next, i, ch, s); } catch (e) {} this.next += sd; } };
  P.stop = function () { this.mood = null; this.stopBeds(); };

  // ---- UI sounds ----
  function ui(ctx, dest) {
    const tone = (f, t, d, type, g, to) => { const o = ctx.createOscillator(), e = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(e); e.connect(dest); o.start(t); o.stop(t + d + 0.03); };
    const bell = (f, t, g, d) => { tone(f, t, d, 'sine', g); tone(f * 2.01, t, d * 0.55, 'sine', g * 0.3); };
    return {
      move: t => tone(760, t, 0.045, 'triangle', 0.09, 560), ok: t => { bell(660, t, 0.13, 0.35); bell(990, t + 0.07, 0.11, 0.45); },
      back: t => { tone(520, t, 0.1, 'triangle', 0.1, 340); }, open: t => { bell(523, t, 0.09, 0.5); bell(784, t + 0.06, 0.08, 0.6); bell(1047, t + 0.12, 0.06, 0.7); },
      close: t => { tone(640, t, 0.12, 'triangle', 0.08, 380); }, key: t => tone(1500, t, 0.02, 'sine', 0.05), error: t => { tone(190, t, 0.18, 'triangle', 0.14); tone(150, t + 0.14, 0.24, 'triangle', 0.14); },
      toggle: t => { tone(880, t, 0.06, 'triangle', 0.09); tone(1175, t + 0.05, 0.08, 'triangle', 0.08); },
      boot: t => { [261.63, 329.63, 392, 523.25, 659.25].forEach((f, k) => { bell(f, t + k * 0.16, 0.12, 2.2); }); }
    };
  }
  const API = { Engine, MOODS, ui, midi };
  root.SKAudio = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  // ---- app wiring (browser only) ----
  if (typeof window === 'undefined' || !window.K) return;
  const K = window.K, S = K.S;
  let ctx = null, eng = null, uiFx = null, uiGain = null, mGain = null, timer = null, suspended = false, started = false;
  const st = () => S.settings;
  function init() {
    if (ctx) return true;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC(); } catch (e) { return false; }
    const master = ctx.createGain(); master.connect(ctx.destination);
    uiGain = ctx.createGain(); uiGain.connect(master); mGain = ctx.createGain(); mGain.gain.value = 0; mGain.connect(master);
    eng = new Engine(ctx, mGain); uiFx = ui(ctx, uiGain); return true;
  }
  function tick() { if (eng && ctx.state === 'running') eng.schedule(ctx.currentTime + 2.2); }
  function musicOn() { return st().music !== false && !suspended && !document.hidden; }
  function applyMusic() {
    if (!init()) return;
    const s = st(), want = musicOn(), vol = (s.musicVol == null ? 50 : s.musicVol) / 100;
    if (want) {
      if (ctx.state === 'suspended') ctx.resume();
      if (!eng.mood || eng.mood !== MOODS[s.mood || 'campfire']) { eng.start(s.mood || 'campfire'); }
      if (!timer) timer = setInterval(tick, 400);
      tick(); mGain.gain.cancelScheduledValues(ctx.currentTime); mGain.gain.setTargetAtTime(vol * 1.1, ctx.currentTime, 0.8);
    } else {
      mGain.gain.cancelScheduledValues(ctx.currentTime); mGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => { if (!musicOn()) { clearInterval(timer); timer = null; if (ctx.state === 'running') ctx.suspend(); if (eng) { eng.stop(); } } }, 900);
    }
  }
  K.audio = {
    moods: () => Object.keys(MOODS).map(id => [id, MOODS[id].name]),
    apply: applyMusic,
    setSuspended(v) { suspended = !!v; applyMusic(); },
    play(name) {
      if (st().sfx === false || !init()) return; if (ctx.state === 'suspended' && !musicOn()) ctx.resume();
      const v = (st().sfxVol == null ? 60 : st().sfxVol) / 100; uiGain.gain.value = v; const f = uiFx[name]; if (f) f(ctx.currentTime + 0.005);
    },
    boot() { this.play('boot'); }
  };
  K.snd = { play: n => K.audio.play(n) };
  document.addEventListener('visibilitychange', () => { if (ctx) applyMusic(); });
})(typeof window !== 'undefined' ? window : globalThis);
