// Screen brightness (laptop / built-in screens, through Windows WMI), plus a software dimmer and a warm "night" filter
// that work on ANY monitor by laying a see-through click-through window over each screen.
const { BrowserWindow, screen } = require('electron');
const { execFile } = require('child_process');

const TINT = { amber: [255, 176, 70], orange: [255, 138, 40], red: [255, 80, 40] };
const WARM = [0, 0.13, 0.24, 0.36];
const PRESETS = { day: { brightness: 100, dim: 0, warm: 0 }, evening: { brightness: 70, dim: 0, warm: 2 }, night: { brightness: 35, dim: 10, warm: 3 } };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function create(ctx) {
  const S = () => ctx.store.read('settings', {});
  let wins = [], sig = '', lastB = null, supported = null, prevB = null, timer = null, busy = Promise.resolve();
  const ps = cmd => new Promise(res => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 10000 }, (e, out) => res(e ? null : String(out).trim())));

  async function getB() {
    if (!ctx.isWin) { supported = false; return null; }
    const o = await ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness');
    const n = parseInt(o, 10); supported = Number.isFinite(n); return supported ? n : null;
  }
  async function setB(n) {
    if (!ctx.isWin || supported === false) return;
    n = clamp(Math.round(n), 1, 100);
    await ps('$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue; if ($m) { $m | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{Timeout=1;Brightness=' + n + '} | Out-Null } }');
  }

  function nightNow(s) {
    const m = /^(\d+)-(\d+)$/.exec(s.nightAuto || ''); if (!m) return false;
    const h = new Date().getHours(), a = +m[1], b = +m[2]; return a > b ? (h >= a || h < b) : (h >= a && h < b);
  }
  function want() {
    const s = S(); let warm = clamp(+s.warm || 0, 0, 3); if (nightNow(s)) warm = Math.max(warm, 2);
    return { b: s.brightness == null ? null : clamp(+s.brightness, 1, 100), dim: Math.min(clamp(+s.dim || 0, 0, 90), clamp(+s.dimCap || 70, 30, 90)), warm, tint: TINT[s.warmTint] || TINT.amber };
  }
  const bg = w => { const t = w.tint, a = WARM[w.warm] || 0; return 'linear-gradient(rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',' + a + '),rgba(' + t[0] + ',' + t[1] + ',' + t[2] + ',' + a + ')),rgba(0,0,0,' + (w.dim / 100) + ')'; };

  function destroyAll() { wins.forEach(x => { try { if (!x.isDestroyed()) x.destroy(); } catch {} }); wins = []; sig = ''; }
  function ensureWins(w) {
    const ds = screen.getAllDisplays(), s2 = JSON.stringify(ds.map(d => d.bounds));
    if (s2 === sig && wins.length && wins.every(x => !x.isDestroyed())) return;
    destroyAll(); sig = s2;
    ds.forEach(d => {
      const win = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false, fullscreenable: false, webPreferences: { backgroundThrottling: false } });
      win.setAlwaysOnTop(true, 'screen-saver'); win.setIgnoreMouseEvents(true);
      win.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;overflow:hidden;background:' + bg(w) + '">'));
      win.once('ready-to-show', () => { try { win.showInactive(); } catch {} });
      wins.push(win);
    });
  }
  function paint(w) { const css = JSON.stringify(bg(w)); wins.forEach(x => { try { if (!x.isDestroyed()) x.webContents.executeJavaScript('document.body.style.background=' + css); } catch {} }); }

  function sync() {   // serialized so quick changes do not overlap
    busy = busy.then(async () => {
      try {
        const w = want();
        if (w.b != null && w.b !== lastB) { if (supported === null) await getB(); lastB = w.b; await setB(w.b); }
        if (w.dim > 0 || w.warm > 0) { ensureWins(w); paint(w); } else destroyAll();
      } catch {}
    });
    return busy;
  }
  const set = (k, v) => { const s = S(); s[k] = v; ctx.store.write('settings', s); return sync(); };
  const osd = t => { if (S().osd !== false) ctx.notify('Display', t, true); };

  async function step(dir) {
    if (supported === null) await getB();
    const stp = clamp(+S().brightStep || 10, 5, 25);
    if (supported) { const cur = S().brightness != null ? +S().brightness : (await getB()) || 100; const n = clamp(cur + dir * stp, 5, 100); await set('brightness', n); osd('Brightness ' + n + '%'); return n; }
    const d = clamp((+S().dim || 0) - dir * stp, 0, clamp(+S().dimCap || 70, 30, 90)); await set('dim', d); osd('Dimmer ' + d + '% (this screen has no brightness control)'); return d;
  }
  async function toggleDim() { const d = +S().dim > 0 ? 0 : 40; await set('dim', d); osd(d ? 'Dimmer on' : 'Dimmer off'); }
  async function toggleWarm() { const w = +S().warm > 0 ? 0 : 2; await set('warm', w); osd(w ? 'Night filter on' : 'Night filter off'); }
  async function preset(name) {
    const p = PRESETS[name]; if (!p) return; const s = S();
    if (supported === null) await getB();
    s.dim = p.dim; s.warm = p.warm; if (supported) s.brightness = p.brightness; ctx.store.write('settings', s); await sync(); osd(name[0].toUpperCase() + name.slice(1) + ' look');
  }
  async function reset() { const s = S(); s.dim = 0; s.warm = 0; if (s.brightness != null) s.brightness = 100; ctx.store.write('settings', s); lastB = null; await sync(); }
  async function status() { if (supported === null) await getB(); return { supported: !!supported, brightness: S().brightness == null ? null : +S().brightness }; }

  // Game brightness: set it when a game starts, give the old value back when it ends.
  async function gameBright(on) {
    const g = +S().gameBright || 0;
    if (on) { if (!g) return; if (supported === null) await getB(); if (!supported) return; prevB = await getB(); if (prevB != null) { await setB(g); lastB = g; } }
    else if (prevB != null) { const p = prevB; prevB = null; await setB(p); lastB = p; }
  }
  function start() {
    if (timer) return; sync();
    timer = setInterval(() => sync(), 30000);   // night schedule
    try { ['display-added', 'display-removed', 'display-metrics-changed'].forEach(e => screen.on(e, () => { sig = ''; sync(); })); } catch {}
  }
  function hotkeys(gs) {
    const on = () => S().hotkeysOn !== false && S().brightKeys !== false;
    try {
      gs.register('Control+Alt+Shift+Up', () => { if (on()) step(1); });
      gs.register('Control+Alt+Shift+Down', () => { if (on()) step(-1); });
      gs.register('Control+Alt+Shift+D', () => { if (on()) toggleDim(); });
      gs.register('Control+Alt+Shift+N', () => { if (on()) toggleWarm(); });
    } catch {}
  }
  return { start, sync, set, step, toggleDim, toggleWarm, preset, reset, status, gameBright, hotkeys, stop: destroyAll };
}
module.exports = { create };
