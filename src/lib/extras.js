// Extras & QOL: small features around the games and Remote play. Everything reads the "settings" store live,
// so a change in Settings applies right away. ctx supplies the few things it needs from main.js.
const { powerSaveBlocker, clipboard, shell, app } = require('electron');
const os = require('os'), path = require('path'), fs = require('fs');
const { execFile } = require('child_process');

const KEYS = ['remoteAutoQ', 'remoteAutoStart', 'remoteIdle', 'remoteAwake', 'remoteTaskbar', 'remoteFit', 'remoteLeave', 'breakMin', 'dailyLimit',
  'summary', 'panicKey', 'fitKey', 'remoteEncWarn', 'remoteNotices', 'notifications', 'remoteCursor', 'remoteNewPin',
  'remoteFps', 'remoteRes', 'remoteKbps', 'remoteAudio', 'remotePref', 'remoteBoost', 'remoteMaxH', 'remoteGameEnd', 'remoteAutoApp',
  'gamePlan', 'gameQuiet', 'gameModeOn', 'noNexus', 'gameTaskbar', 'closeMode', 'gameMaxH', 'eyeMin', 'hotkeysOn', 'notifSilent',
  'winConfirm', 'winSort', 'winAuto', 'winHideSys', 'emuMax', 'winFitSwitch', 'remoteSmart'];

const fmt = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); };
const dayKey = d0 => { const d = d0 || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const HP = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const GB = 'HKCU\\Software\\Microsoft\\GameBar', PN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';
const run1 = (cmd, args) => new Promise(res => execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (e, out, err) => res({ e, out: String(out || ''), err: String(err || '') })));

function create(ctx) {
  const S = () => ctx.store.read('settings', {});
  let blocker = null, breakKey = '', lastBreak = 0, lastEye = 0, warnedDay = '', maxKey = '', timer = null, boosted = false, sysSig = '';
  let prevPlan = null, prevToast = null;
  const today = () => (ctx.store.read('daily', {})[dayKey()] || 0);
  const setPrio = prio => { try { app.getAppMetrics().forEach(m => { try { os.setPriority(m.pid, prio); } catch {} }); } catch {} };

  function tick() {
    const s = S(), g = ctx.getGame(), now = Date.now();
    if (g) {
      const daily = ctx.store.read('daily', {}), k = dayKey(); daily[k] = (daily[k] || 0) + 5000;
      const keys = Object.keys(daily); if (keys.length > 21) delete daily[keys[0]];
      ctx.store.write('daily', daily);
      const key = g.id + ':' + g.startedAt; if (breakKey !== key) { breakKey = key; lastBreak = lastEye = g.startedAt; }
      if (+s.breakMin > 0 && now - lastBreak >= s.breakMin * 60000) { lastBreak = now; ctx.notify('Time for a break', 'You have been playing ' + g.name + ' for ' + fmt(now - g.startedAt) + '. Stretch and have some water.'); }
      if (+s.eyeMin > 0 && now - lastEye >= s.eyeMin * 60000) { lastEye = now; ctx.notify('Rest your eyes', 'Look at something 20 feet away for 20 seconds.'); }
      if (+s.dailyLimit > 0 && warnedDay !== k && daily[k] >= s.dailyLimit * 3600000) { warnedDay = k; ctx.notify('Daily play limit reached', 'You have played ' + fmt(daily[k]) + ' today (limit ' + s.dailyLimit + ' h).'); }
      if (+s.gameMaxH > 0 && maxKey !== key && now - g.startedAt >= s.gameMaxH * 3600000) { maxKey = key; ctx.notify('Time is up', g.name + ' has been running for ' + s.gameMaxH + ' h. Closing it.'); ctx.closeGame(); }
    }
    const live = ctx.remoteLive();
    if (live && +s.remoteIdle > 0 && now - ctx.lastInput() > s.remoteIdle * 60000) ctx.remoteKick('Disconnected: nothing was touched for a while');
    if (live && +s.remoteMaxH > 0 && now - ctx.sessionSince() > s.remoteMaxH * 3600000) ctx.remoteKick('Session time limit reached');
    const want = live && s.remoteAwake !== false;
    try {
      if (want && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
      else if (!want && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
    } catch {}
    const boost = live && s.remoteBoost !== false;
    if (boost && !boosted) { boosted = true; setPrio(os.constants.priority.PRIORITY_HIGH); }
    else if (!boost && boosted) { boosted = false; setPrio(os.constants.priority.PRIORITY_NORMAL); }
  }

  // ---- system tweaks (current user only; each one is undone) ----
  const reg = (key, name, data) => { if (ctx.isWin) run1('reg', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(data), '/f']); };
  function applySystem() {
    const s = S(), sig = JSON.stringify([s.noNexus, s.gameModeOn]); if (sig === sysSig || !ctx.isWin) return; sysSig = sig;
    if (s.noNexus !== undefined) reg(GB, 'UseNexusForGameBarEnabled', s.noNexus ? 0 : 1);   // "open Xbox Game Bar with the controller button"
    if (s.gameModeOn !== undefined) { reg(GB, 'AutoGameModeEnabled', s.gameModeOn ? 1 : 0); reg(GB, 'AllowAutoGameMode', s.gameModeOn ? 1 : 0); }
  }
  async function powerPlan(on) {
    if (!ctx.isWin) return;
    if (on) {
      const r = await run1('powercfg', ['/getactivescheme']); const m = /([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(r.out);
      if (m && m[1].toLowerCase() !== HP) { prevPlan = m[1]; ctx.store.write('sysprev', Object.assign(ctx.store.read('sysprev', {}), { plan: prevPlan })); await run1('powercfg', ['/setactive', HP]); }
    } else if (prevPlan) { const p = prevPlan; prevPlan = null; await run1('powercfg', ['/setactive', p]); const sp = ctx.store.read('sysprev', {}); delete sp.plan; ctx.store.write('sysprev', sp); }
  }
  async function toasts(off) {
    if (!ctx.isWin) return;
    if (off) {
      const r = await run1('reg', ['query', PN, '/v', 'ToastEnabled']); prevToast = /0x0\b/.test(r.out) ? 0 : 1;
      if (prevToast === 1) { ctx.store.write('sysprev', Object.assign(ctx.store.read('sysprev', {}), { toast: 1 })); reg(PN, 'ToastEnabled', 0); }
    } else if (prevToast === 1) { prevToast = null; reg(PN, 'ToastEnabled', 1); const sp = ctx.store.read('sysprev', {}); delete sp.toast; ctx.store.write('sysprev', sp); }
  }
  function recover() {   // if SKBox was closed while a game was running, give the PC its normal settings back
    if (!ctx.isWin) return; const sp = ctx.store.read('sysprev', {});
    if (sp.plan) run1('powercfg', ['/setactive', sp.plan]); if (sp.toast) reg(PN, 'ToastEnabled', 1); ctx.store.write('sysprev', {});
  }
  function onGameStart() {
    const s = S();
    if (s.gamePlan) powerPlan(true); if (s.gameQuiet) toasts(true); ctx.display.gameBright(true);
    if (s.gameModeOn) applySystem();
    if (s.gameTaskbar && ctx.helper() && ctx.helper().ready) ctx.helper().taskbar(true);
  }
  function onGameEnd(name, ms) {
    const s = S();
    powerPlan(false); toasts(false); ctx.display.gameBright(false);
    if (s.gameTaskbar && !ctx.remoteLive() && ctx.helper() && ctx.helper().ready) ctx.helper().taskbar(false);
    if (ctx.remoteLive() && s.remoteGameEnd === 'disconnect') ctx.remoteKick('The game closed');
    if (s.summary !== false && ms >= 60000) ctx.notify('Session over', name + ': ' + fmt(ms) + '. Today: ' + fmt(today()) + '.');
  }
  function onRemoteJoin() { const id = S().remoteAutoApp; if (id && !ctx.getGame()) ctx.launchApp(id); }
  function onRemoteLeft() {
    const g = ctx.getGame(), act = S().remoteLeave || 'nothing', h = ctx.helper();
    if (S().remoteNewPin) ctx.newPin();
    if (act === 'lock') ctx.lockPc();
    if (!g) return;
    if (act === 'minimize' && h && h.ready && g.hwnd) h.minimize(g.hwnd);
    else if (act === 'close') ctx.closeGame();
  }
  function start() { recover(); applySystem(); if (!timer) timer = setInterval(() => { try { tick(); } catch {} }, 5000); }
  function hotkeys(gs) {
    const on = k => S().hotkeysOn !== false && S()[k] !== false;
    try {
      gs.register('Control+Alt+Shift+K', () => { if (on('panicKey') && ctx.getGame()) ctx.closeGame(); });
      gs.register('Control+Alt+Shift+F', () => { const h = ctx.helper(); if (on('fitKey') && h && h.ready) { h.remote(true, ctx.fitArgs().fit, ctx.fitArgs().taskbar); h.winFit(ctx.getGame() && ctx.getGame().hwnd ? ctx.getGame().hwnd : 0); } });
    } catch {}
  }

  const OPEN = { display: 'ms-settings:display', graphics: 'ms-settings:display-advancedgraphics', network: 'ms-settings:network', sound: 'ms-settings:sound' };
  async function ping() {
    const r = await run1('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$g=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop; if($g){ 'GW ' + $g; ping -n 6 $g }"]);
    const gw = /GW\s+(\S+)/.exec(r.out), av = /Average = (\d+)ms/.exec(r.out), lo = /\((\d+)% loss\)/.exec(r.out);
    if (!gw || !av) return { ok: false, error: 'Could not reach the router. Are you on a network?' };
    const ms = +av[1], loss = lo ? +lo[1] : 0;
    return { ok: true, text: 'Router ' + gw[1] + ': ' + ms + ' ms average, ' + loss + '% lost. ' + (ms > 20 || loss > 0 ? 'The Wi-Fi link is slow or unstable. Use a cable or 5 GHz Wi-Fi for Remote play.' : 'The link to your router is fine.') };
  }
  function diagText() {
    const st = ctx.remoteState(), s = S(), pick = {}; KEYS.concat(['remoteQuality', 'remoteAutoFix', 'gameWindow', 'brightness', 'dim', 'warm']).forEach(k => { if (s[k] !== undefined) pick[k] = s[k]; });
    return ['SKBox ' + app.getVersion() + ' on ' + os.type() + ' ' + os.release() + ' (' + os.arch() + ')', 'Helper: ' + (st && st.helper ? 'running' : 'NOT running'),
      'Remote on: ' + !!(st && st.on) + '  stats: ' + JSON.stringify(st && st.stats || null), 'Settings: ' + JSON.stringify(pick), ctx.diag()].join('\n');
  }

  async function run(name, arg) {
    try {
      switch (name) {
        case 'today': return { ms: today() };
        case 'week': { const d = ctx.store.read('daily', {}); let t = 0; for (let i = 0; i < 7; i++) { const x = new Date(); x.setDate(x.getDate() - i); t += d[dayKey(x)] || 0; } return { ms: t }; }
        case 'clearToday': { const d = ctx.store.read('daily', {}); delete d[dayKey()]; ctx.store.write('daily', d); return { ok: true }; }
        case 'copyAddr': {
          const st = ctx.remoteState(), ip = st && st.ips && st.ips[0];
          if (!st || !st.on || !ip) return { ok: false, error: 'Turn Remote play on first.' };
          const text = 'http://' + ip + ':' + st.port; clipboard.writeText(text); return { ok: true, text };
        }
        case 'copyPin': { const st = ctx.remoteState(); if (!st || !st.on || !st.pin) return { ok: false, error: 'Turn Remote play on first.' }; clipboard.writeText(String(st.pin)); return { ok: true }; }
        case 'copyConnect': {
          const st = ctx.remoteState(), ip = st && st.ips && st.ips[0]; if (!st || !st.on || !ip) return { ok: false, error: 'Turn Remote play on first.' };
          clipboard.writeText('Address: http://' + ip + ':' + st.port + '\nPIN: ' + st.pin); return { ok: true };
        }
        case 'folder': { const p = String(arg || ''); if (!p || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return { ok: false, error: 'This app is a link, not a file.' }; shell.showItemInFolder(p); return { ok: true }; }
        case 'open': {
          if (arg === 'taskmgr') { execFile('taskmgr.exe', [], () => {}); return { ok: true }; }
          if (OPEN[arg]) { await shell.openExternal(OPEN[arg]); return { ok: true }; } return { ok: false };
        }
        case 'restart': app.relaunch(); app.exit(0); return { ok: true };
        case 'restartHelper': ctx.restartHelper(); return { ok: true };
        case 'closeGame': { if (!ctx.getGame()) return { ok: false, error: 'No game is running.' }; return await ctx.closeGameResult(); }
        case 'update': {
          const { autoUpdater } = require('electron-updater'); const r = await autoUpdater.checkForUpdates();
          const v = r && r.updateInfo && r.updateInfo.version; return { ok: true, current: app.getVersion(), latest: v || app.getVersion() };
        }
        case 'testNotify': ctx.notify('SKBox', 'Notifications work.', true); return { ok: true };
        case 'openData': await shell.openPath(app.getPath('userData')); return { ok: true };
        case 'openLog': { const f = path.join(app.getPath('userData'), 'helper.log'); const e = await shell.openPath(f); return e ? { ok: false, error: 'No log yet. Nothing has gone wrong.' } : { ok: true }; }
        case 'diag': clipboard.writeText(diagText()); return { ok: true };
        case 'exportDiag': { const f = path.join(app.getPath('desktop'), 'SKBox-diagnostics.txt'); fs.writeFileSync(f, diagText()); shell.showItemInFolder(f); return { ok: true }; }
        case 'ping': return await ping();
        case 'undoFit': { const h = ctx.helper(); if (h && h.ready) { h.restoreWin(); return { ok: true }; } return { ok: false, error: 'The helper is not running.' }; }
        case 'reset': { const s = S(); KEYS.forEach(k => { delete s[k]; }); ctx.store.write('settings', s); sysSig = ''; return { ok: true }; }
        case 'display': { await ctx.display.set(String(arg.k), arg.v); return { ok: true }; }
        case 'displayAction': {
          if (arg.a === 'step') await ctx.display.step(+arg.v || 1); else if (arg.a === 'preset') await ctx.display.preset(String(arg.v)); else if (arg.a === 'reset') await ctx.display.reset();
          else if (arg.a === 'dim') await ctx.display.toggleDim(); else if (arg.a === 'warm') await ctx.display.toggleWarm();
          return { ok: true, settings: S() };
        }
        case 'displayStatus': return Object.assign({ ok: true }, await ctx.display.status());
        case 'winList': return await ctx.wins.list();
        case 'winClose': return await ctx.wins.close(arg);
        case 'winMin': return await ctx.wins.min(arg);
        case 'winFront': return await ctx.wins.front(arg);
        case 'winCleanup': return await ctx.wins.cleanup();
        case 'winFit': { const h = ctx.helper(); if (!h || !h.ready) return { ok: false, error: 'The helper is not running.' }; h.restore(String(arg.h)); setTimeout(() => h.winFit(String(arg.h)), 400); return { ok: true }; }
        case 'winSwitch': { const h = ctx.helper(); if (!h || !h.ready) return { ok: false, error: 'The helper is not running.' }; h.restore(String(arg.h)); return { ok: true }; }
        case 'minAll': { if (!ctx.isWin) return { ok: false, error: 'Only on Windows.' }; run1('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject Shell.Application).MinimizeAll()']); return { ok: true }; }
        case 'taskmgr': { if (!ctx.isWin) return { ok: false, error: 'Only on Windows.' }; run1('taskmgr.exe', []); return { ok: true }; }
        case 'openExplorer': { await shell.openPath(String(arg && arg.path ? arg.path : app.getPath('home'))); return { ok: true }; }
        case 'emuStatus': return { ok: true, on: S().emuMax !== false };
      }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
    return { ok: false };
  }
  return { start, applySystem, onGameStart, onGameEnd, onRemoteJoin, onRemoteLeft, hotkeys, run, today, KEYS };
}
module.exports = { create };
