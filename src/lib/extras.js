// Extras & QOL: small features that sit around the games and Remote play. Everything reads the "settings" store live,
// so a change made in Settings > Extras applies right away. ctx supplies the few things it needs from main.js.
const { powerSaveBlocker, clipboard, shell, app } = require('electron');
const os = require('os'), path = require('path');

const KEYS = ['remoteAutoQ', 'remoteAutoStart', 'remoteIdle', 'remoteAwake', 'remoteTaskbar', 'remoteFit', 'remoteLeave', 'breakMin', 'dailyLimit',
  'summary', 'panicKey', 'fitKey', 'remoteEncWarn', 'remoteNotices', 'notifications', 'remoteCursor', 'remoteNewPin'];

const fmt = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); };
const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

function create(ctx) {
  const S = () => ctx.store.read('settings', {});
  let blocker = null, breakKey = '', lastBreak = 0, warnedDay = '', timer = null;
  const today = () => (ctx.store.read('daily', {})[dayKey()] || 0);

  function tick() {
    const s = S(), g = ctx.getGame(), now = Date.now();
    if (g) {
      const daily = ctx.store.read('daily', {}), k = dayKey(); daily[k] = (daily[k] || 0) + 5000;
      const keys = Object.keys(daily); if (keys.length > 21) delete daily[keys[0]];
      ctx.store.write('daily', daily);
      const key = g.id + ':' + g.startedAt; if (breakKey !== key) { breakKey = key; lastBreak = g.startedAt; }
      if (+s.breakMin > 0 && now - lastBreak >= s.breakMin * 60000) { lastBreak = now; ctx.notify('Time for a break', 'You have been playing ' + g.name + ' for ' + fmt(now - g.startedAt) + '. Stretch and have some water.'); }
      if (+s.dailyLimit > 0 && warnedDay !== k && daily[k] >= s.dailyLimit * 3600000) { warnedDay = k; ctx.notify('Daily play limit reached', 'You have played ' + fmt(daily[k]) + ' today (limit ' + s.dailyLimit + ' h).'); }
    }
    if (ctx.remoteLive() && +s.remoteIdle > 0 && now - ctx.lastInput() > s.remoteIdle * 60000) ctx.remoteKick('Disconnected: nothing was touched for a while');
    const want = ctx.remoteLive() && s.remoteAwake !== false;
    try {
      if (want && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
      else if (!want && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
    } catch {}
  }
  function start() { if (!timer) timer = setInterval(() => { try { tick(); } catch {} }, 5000); }

  function onGameEnd(name, ms) {
    if (S().summary === false || ms < 60000) return;
    ctx.notify('Session over', name + ': ' + fmt(ms) + '. Today: ' + fmt(today()) + '.');
  }
  function onRemoteLeft() {
    const g = ctx.getGame(), act = S().remoteLeave || 'nothing', h = ctx.helper();
    if (S().remoteNewPin) ctx.newPin();
    if (!g) return;
    if (act === 'minimize' && h && h.ready && g.hwnd) h.minimize(g.hwnd);
    else if (act === 'close') ctx.closeGame();
  }
  function hotkeys(gs) {
    try {
      gs.register('Control+Alt+Shift+K', () => { if (S().panicKey !== false && ctx.getGame()) ctx.closeGame(); });
      gs.register('Control+Alt+Shift+F', () => { const h = ctx.helper(); if (S().fitKey !== false && h && h.ready) { h.remote(true, ctx.fitArgs().fit, ctx.fitArgs().taskbar); h.winFit(ctx.getGame() && ctx.getGame().hwnd ? ctx.getGame().hwnd : 0); } });
    } catch {}
  }

  async function run(name, arg) {
    try {
      switch (name) {
        case 'today': return { ms: today() };
        case 'copyAddr': {
          const st = ctx.remoteState(), ip = st && st.ips && st.ips[0];
          if (!st || !st.on || !ip) return { ok: false, error: 'Turn Remote play on first.' };
          const text = 'http://' + ip + ':' + st.port; clipboard.writeText(text); return { ok: true, text };
        }
        case 'folder': { const p = String(arg || ''); if (!p || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return { ok: false, error: 'This app is a link, not a file.' }; shell.showItemInFolder(p); return { ok: true }; }
        case 'restart': app.relaunch(); app.exit(0); return { ok: true };
        case 'update': {
          const { autoUpdater } = require('electron-updater'); const r = await autoUpdater.checkForUpdates();
          const v = r && r.updateInfo && r.updateInfo.version; return { ok: true, current: app.getVersion(), latest: v || app.getVersion() };
        }
        case 'testNotify': ctx.notify('SKBox', 'Notifications work.', true); return { ok: true };
        case 'openData': await shell.openPath(app.getPath('userData')); return { ok: true };
        case 'openLog': { const f = path.join(app.getPath('userData'), 'helper.log'); const e = await shell.openPath(f); return e ? { ok: false, error: 'No log yet. Nothing has gone wrong.' } : { ok: true }; }
        case 'diag': {
          const st = ctx.remoteState(), s = S(), pick = {}; KEYS.concat(['remoteQuality', 'remoteAutoFix', 'gameWindow']).forEach(k => { if (s[k] !== undefined) pick[k] = s[k]; });
          const text = ['SKBox ' + app.getVersion() + ' on ' + os.type() + ' ' + os.release() + ' (' + os.arch() + ')', 'Helper: ' + (st && st.helper ? 'running' : 'NOT running'),
            'Remote on: ' + !!(st && st.on) + '  stats: ' + JSON.stringify(st && st.stats || null), 'Settings: ' + JSON.stringify(pick), ctx.diag()].join('\n');
          clipboard.writeText(text); return { ok: true };
        }
        case 'undoFit': { const h = ctx.helper(); if (h && h.ready) { h.restoreWin(); return { ok: true }; } return { ok: false, error: 'The helper is not running.' }; }
        case 'reset': { const s = S(); KEYS.forEach(k => { delete s[k]; }); ctx.store.write('settings', s); return { ok: true }; }
      }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
    return { ok: false };
  }
  return { start, onGameEnd, onRemoteLeft, hotkeys, run, today, KEYS };
}
module.exports = { create };
