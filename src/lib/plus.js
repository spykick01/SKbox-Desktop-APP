// SKBox Plus: per-game profiles, play history, Continue Watching, system info, after-game actions and a few helpers.
// Everything reads and writes through ctx.store, so it is easy to test without Electron.
const os = require('os'), fs = require('fs'), path = require('path');

const dayKey = d0 => { const d = d0 || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const QUALITY = {   // profile "stream quality" -> the Remote play settings it sets
  smooth: { remoteFps: 60, remoteRes: 720, remotePref: 'framerate' },
  sharp: { remoteFps: 30, remoteRes: 1080, remotePref: 'resolution' },
  lowlag: { remoteFps: 60, remoteRes: 540, remoteKbps: 5000, remotePref: 'framerate' },
  ultra: { remoteFps: 60, remoteRes: 1080, remoteKbps: 20000, remotePref: 'resolution' }
};
const PROFILE_KEYS = ['remoteFps', 'remoteRes', 'remoteKbps', 'remotePref', 'gameBright', 'closeMode', 'gameMaxH', 'afterGame'];
const AFTER = ['', 'lock', 'sleep', 'shutdown'];

function create(ctx) {
  const S = () => ctx.store.read('settings', {}), now = () => (ctx.now ? ctx.now() : Date.now());
  const apps = () => { let a = ctx.store.read('apps', []); if (!Array.isArray(a)) a = a.apps || []; return a; };
  const nameOf = id => { const a = apps().find(x => x.id === id); return a ? a.name : id; };
  let afterTimer = null, afterWhat = '';

  // ---------- per-game profiles ----------
  // Applied when a game starts: the profile's values replace the global settings, the originals are kept and put back afterwards.
  function profileValues(p) {
    const v = {}; if (!p) return v;
    if (p.quality && QUALITY[p.quality]) Object.assign(v, QUALITY[p.quality]);
    if (p.bright > 0) v.gameBright = +p.bright; if (p.closeMode) v.closeMode = p.closeMode; if (p.maxH > 0) v.gameMaxH = +p.maxH; if (AFTER.includes(p.after) && p.after) v.afterGame = p.after;
    return v;
  }
  function applyProfile(app) {
    const v = profileValues(app && app.profile); if (!Object.keys(v).length) return false;
    const s = S(); if (!s.profileBackup) { const b = { id: app.id, vals: {} }; Object.keys(v).forEach(k => { b.vals[k] = s[k] === undefined ? null : s[k]; }); s.profileBackup = b; }
    Object.assign(s, v); ctx.store.write('settings', s); return true;
  }
  function restoreProfile() {
    const s = S(), b = s.profileBackup; if (!b) return false;
    Object.keys(b.vals).forEach(k => { if (b.vals[k] === null) delete s[k]; else s[k] = b.vals[k]; }); delete s.profileBackup; ctx.store.write('settings', s); return true;
  }
  function recover(gameRunning) { if (!gameRunning) return restoreProfile(); return false; }   // a crash must not leave a game's settings behind

  // ---------- play history ----------
  function onGameEnd(g, ms) {
    if (!g || !g.id) return; const log = ctx.store.read('gamedays', {}), id = g.id, k = dayKey(new Date(now()));
    const d = log[id] || (log[id] = {}); d[k] = (d[k] || 0) + Math.max(0, ms | 0);
    const keys = Object.keys(d); if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(x => delete d[x]);
    ctx.store.write('gamedays', log);
  }
  function report(range) {
    range = [7, 14, 30].includes(+range) ? +range : 14;
    const log = ctx.store.read('gamedays', {}), stats = ctx.store.read('stats', {}), daily = ctx.store.read('daily', {}), days = [], t = new Date(now());
    for (let i = range - 1; i >= 0; i--) { const x = new Date(t); x.setDate(t.getDate() - i); const k = dayKey(x); let ms = 0; Object.values(log).forEach(g => { ms += g[k] || 0; }); if (!ms && daily[k]) ms = daily[k]; days.push({ k, ms, wd: x.getDay(), dom: x.getDate() }); }
    const keys = days.map(d => d.k), games = [];
    Object.keys(Object.assign({}, stats, log)).forEach(id => { const s = stats[id] || {}, g = log[id] || {}; let r = 0; keys.forEach(k => { r += g[k] || 0; }); games.push({ id, name: nameOf(id), ms: s.ms || 0, plays: s.n || 0, last: s.last || 0, best: s.best || 0, range: r }); });
    games.sort((a, b) => (b.range - a.range) || (b.ms - a.ms));
    const played = k => (daily[k] || 0) > 60000 || Object.values(log).some(g => (g[k] || 0) > 60000);
    let streak = 0; for (let i = 0; i < 365; i++) { const x = new Date(t); x.setDate(t.getDate() - i); if (played(dayKey(x))) streak++; else if (i > 0) break; }   // today may still be empty
    const sum = a => a.reduce((n, d) => n + d.ms, 0), month = (() => { let m = 0; for (let i = 0; i < 30; i++) { const x = new Date(t); x.setDate(t.getDate() - i); const k = dayKey(x); let ms = 0; Object.values(log).forEach(g => { ms += g[k] || 0; }); m += ms || daily[k] || 0; } return m; })();
    return { ok: true, range, days, games: games.filter(g => g.ms || g.range).slice(0, 30), today: days[days.length - 1] ? days[days.length - 1].ms : 0, rangeTotal: sum(days), month, streak, total: games.reduce((n, g) => n + g.ms, 0), best: days.reduce((b, d) => (d.ms > b.ms ? d : b), { ms: 0, k: '' }) };
  }
  function resetGame(id) { const st = ctx.store.read('stats', {}), lg = ctx.store.read('gamedays', {}); delete st[id]; delete lg[id]; ctx.store.write('stats', st); ctx.store.write('gamedays', lg); return { ok: true }; }
  function resetAll() { ctx.store.write('stats', {}); ctx.store.write('gamedays', {}); ctx.store.write('daily', {}); return { ok: true }; }
  const fmt = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  function summaryText(range) { const r = report(range); return ['SKBox play summary (last ' + r.range + ' days)', 'Total: ' + fmt(r.rangeTotal), 'Today: ' + fmt(r.today), 'Streak: ' + r.streak + ' day' + (r.streak === 1 ? '' : 's')].concat(r.games.filter(g => g.range).slice(0, 8).map((g, i) => (i + 1) + '. ' + g.name + ' - ' + fmt(g.range))).join('\n'); }
  // a short report on Monday about last week (once)
  function weeklyReport() {
    const s = S(); if (s.weeklyReport === false) return false; const t = new Date(now()); if (t.getDay() !== 1) return false;
    const k = dayKey(t); if (s.weeklyDone === k) return false; s.weeklyDone = k; ctx.store.write('settings', s);
    const r = report(7); if (!r.rangeTotal) return false; const top = r.games.find(g => g.range);
    ctx.notify('Your week in games', 'You played ' + fmt(r.rangeTotal) + ' this week' + (top ? ', mostly ' + top.name : '') + '.'); return true;
  }

  // ---------- Continue Watching (SKBrowse apps) and Watch later ----------
  function watchNote(appId, url, title) {
    if (!appId || !/^https?:/i.test(url || '')) return; const w = ctx.store.read('watch', {}), o = w[appId] || {};
    const t = String(title || '').trim().slice(0, 120); if (o.url === url && (!t || o.title === t)) return;
    w[appId] = { url: String(url).slice(0, 600), title: t || o.title || '', t: now() }; ctx.store.write('watch', w);
  }
  function watchList() {
    const w = ctx.store.read('watch', {}), list = [];
    apps().forEach(a => { const x = w[a.id]; if (x && (a.kind === 'bapp' || a.kind === 'web' || a.kind === 'browse')) list.push({ id: a.id, name: a.name, cover: a.cover || '', url: x.url, title: x.title, t: x.t }); });
    return list.sort((a, b) => b.t - a.t);
  }
  function watchClear(id) { if (!id) { ctx.store.write('watch', {}); return { ok: true }; } const w = ctx.store.read('watch', {}); delete w[id]; ctx.store.write('watch', w); return { ok: true }; }
  function laterAdd(url, title) {
    if (!/^https?:/i.test(url || '')) return { ok: false, error: 'Only web pages can be saved.' }; const l = ctx.store.read('later', []).filter(x => x.url !== url);
    l.unshift({ url: String(url).slice(0, 600), title: String(title || url).slice(0, 120), t: now() }); ctx.store.write('later', l.slice(0, 60)); return { ok: true, n: Math.min(l.length, 60) };
  }
  const laterList = () => ctx.store.read('later', []);
  function laterRemove(url) { ctx.store.write('later', ctx.store.read('later', []).filter(x => x.url !== url)); return { ok: true }; }

  // ---------- before / after a game ----------
  function pre(app) {   // start a helper program before the game (for example a controller mapper) and wait a few seconds for it
    const p = app && app.profile && app.profile.pre; if (!p || !ctx.runDetached) return Promise.resolve(false);
    ctx.runDetached(p); const w = Math.max(0, Math.min(30, +(app.profile.preWait || 0)));
    return w ? new Promise(r => setTimeout(() => r(true), w * 1000)) : Promise.resolve(true);
  }
  function post(app) { const p = app && app.profile && app.profile.post; if (p && ctx.runDetached) { ctx.runDetached(p); return true; } return false; }
  function after(game, ms, app) {
    const what = (app && app.profile && app.profile.after) || S().afterGame || ''; if (!what || !AFTER.includes(what) || ms < 60000) return false;
    cancelAfter(); afterWhat = what; const label = { lock: 'lock', sleep: 'go to sleep', shutdown: 'shut down' }[what];
    ctx.notify('This PC will ' + label + ' in 45 seconds', 'To stop it, open SKBox > Settings > Power > Cancel the automatic PC action.');
    afterTimer = setTimeout(() => { afterTimer = null; const w = afterWhat; afterWhat = ''; if (w === 'lock') ctx.lockPc(); else ctx.power(w === 'sleep' ? 'sleep' : 'shutdown'); }, ctx.afterDelay || 45000); return true;
  }
  function cancelAfter() { if (afterTimer) { clearTimeout(afterTimer); afterTimer = null; afterWhat = ''; return true; } return false; }
  const pending = () => (afterTimer ? afterWhat : '');

  // ---------- controller battery ----------
  const lowSeen = {};
  function battery(slot, type, level) {   // level 0..3 (empty, low, medium, full) as reported by the helper
    if (S().padBatteryWarn === false || !(type > 0)) return false;
    if (level <= 1 && !lowSeen[slot]) { lowSeen[slot] = true; ctx.notify('Controller battery low', 'Player ' + (slot + 1) + '\u2019s controller is almost empty.'); return true; }
    if (level >= 2) lowSeen[slot] = false; return false;
  }


  // ---------- milestones ----------
  const MS = [
    ['first', 'First launch', 'Start your first game', 'launches', 1], ['l10', 'Getting started', '10 launches', 'launches', 10], ['l50', 'Regular', '50 launches', 'launches', 50], ['l250', 'Always on', '250 launches', 'launches', 250],
    ['h1', 'Warmed up', 'Play for 1 hour in total', 'hours', 1], ['h10', 'Dedicated', '10 hours in total', 'hours', 10], ['h50', 'Veteran', '50 hours in total', 'hours', 50], ['h100', 'Centurion', '100 hours in total', 'hours', 100], ['h250', 'Legend', '250 hours in total', 'hours', 250],
    ['s3', 'On a roll', 'Play 3 days in a row', 'bestStreak', 3], ['s7', 'Full week', 'Play 7 days in a row', 'bestStreak', 7], ['s14', 'Two weeks', 'Play 14 days in a row', 'bestStreak', 14], ['s30', 'Unstoppable', 'Play 30 days in a row', 'bestStreak', 30],
    ['v5', 'Explorer', 'Play 5 different apps', 'played', 5], ['v10', 'Collector\u2019s taste', 'Play 10 different apps', 'played', 10],
    ['m4', 'Marathon', 'Play 4 hours in one day', 'bestDayH', 4], ['m8', 'Ultra marathon', 'Play 8 hours in one day', 'bestDayH', 8],
    ['c10', 'Shelf started', 'Add 10 apps', 'apps', 10], ['c25', 'Full shelf', 'Add 25 apps', 'apps', 25],
    ['w3', 'Channel surfer', 'Watch something in 3 streaming apps', 'watchApps', 3], ['wl5', 'Plenty to watch', 'Save 5 pages with Watch later', 'later', 5],
    ['p3', 'Tuner', 'Set up game profiles for 3 games', 'profiles', 3], ['q3', 'Planner', 'Line up 3 games in Up next', 'queueMax', 3]
  ];
  function metrics() {
    const st = ctx.store.read('stats', {}), log = ctx.store.read('gamedays', {}), ap = apps(), ms = ctx.store.read('milestones', {}), r = report(7);
    const byDay = {}; Object.values(log).forEach(g => Object.keys(g).forEach(k => { byDay[k] = (byDay[k] || 0) + g[k]; }));
    const stats = Object.values(st);
    return { launches: stats.reduce((n, x) => n + (x.n || 0), 0), hours: Math.floor(stats.reduce((n, x) => n + (x.ms || 0), 0) / 3600000), played: stats.filter(x => (x.n || 0) > 0).length,
      bestStreak: Math.max(r.streak, ms.bestStreak || 0), bestDayH: Math.floor(Math.max(0, ...Object.values(byDay)) / 3600000), apps: ap.filter(a => !a.kind).length,
      watchApps: Object.keys(ctx.store.read('watch', {})).length, later: ctx.store.read('later', []).length, profiles: ap.filter(a => a.profile && Object.keys(a.profile).length).length, queueMax: Math.max(ms.queueMax || 0, ctx.store.read('queue', []).length) };
  }
  function milestones() {
    const m = metrics(), st = ctx.store.read('milestones', {}), done = st.done || {};
    const list = MS.map(([id, name, desc, key, goal]) => ({ id, name, desc, goal, cur: Math.min(m[key] || 0, goal), done: (m[key] || 0) >= goal || !!done[id], t: done[id] || 0 }));
    return { ok: true, list, done: list.filter(x => x.done).length, total: list.length, bestStreak: m.bestStreak };
  }
  function checkMilestones() {   // unlock what is newly reached, remember it forever, tell the person
    const m = metrics(), st = ctx.store.read('milestones', {}); st.done = st.done || {}; st.bestStreak = m.bestStreak; st.queueMax = m.queueMax; const fresh = [];
    MS.forEach(([id, name, desc, key, goal]) => { if (!st.done[id] && (m[key] || 0) >= goal) { st.done[id] = now(); fresh.push({ id, name, desc }); } });
    ctx.store.write('milestones', st);
    // the very first run only records what you already earned, so you are not buried in notifications
    const first = !st.seen; if (first) { st.seen = true; ctx.store.write('milestones', st); return []; }
    fresh.slice(0, 3).forEach(f => ctx.notify('Milestone unlocked: ' + f.name, f.desc)); if (fresh.length > 3) ctx.notify('And ' + (fresh.length - 3) + ' more milestones', 'See Settings > Milestones.');
    return fresh;
  }

  // ---------- Up next queue ----------
  const qIds = () => ctx.store.read('queue', []);
  function queueList() { const ap = apps(), out = []; qIds().forEach(id => { const a = ap.find(x => x.id === id); if (a) out.push({ id: a.id, name: a.name, cover: a.cover || '', kind: a.kind || '' }); }); return out; }
  function queueAdd(id) { id = String(id || ''); if (!apps().some(a => a.id === id)) return { ok: false, error: 'That app is not in your Library.' }; const q = qIds().filter(x => x !== id); if (q.length >= 20) return { ok: false, error: 'Up next is full (20).' }; q.push(id); ctx.store.write('queue', q); return { ok: true, n: q.length }; }
  function queueRemove(id) { ctx.store.write('queue', qIds().filter(x => x !== String(id))); return { ok: true }; }
  function queueMove(id, dir) { const q = qIds(), i = q.indexOf(String(id)); const j = i + (dir < 0 ? -1 : 1); if (i < 0 || j < 0 || j >= q.length) return { ok: true }; [q[i], q[j]] = [q[j], q[i]]; ctx.store.write('queue', q); return { ok: true }; }
  const queuePeek = () => queueList()[0] || null;

  // ---------- system info ----------
  let lastCpu = null;
  function cpuLoad() {
    const t = os.cpus().reduce((a, c) => { const x = c.times; a.idle += x.idle; a.all += x.user + x.nice + x.sys + x.idle + x.irq; return a; }, { idle: 0, all: 0 });
    const prev = lastCpu; lastCpu = t; if (!prev) return null; const di = t.idle - prev.idle, da = t.all - prev.all; return da > 0 ? Math.round((1 - di / da) * 100) : null;
  }
  async function sysinfo() {
    cpuLoad(); await new Promise(r => setTimeout(r, ctx.cpuWait === undefined ? 600 : ctx.cpuWait)); const load = cpuLoad(), c = os.cpus(), total = os.totalmem(), free = os.freemem();
    let disk = null; try { const p = path.parse(process.execPath).root || '/'; const st = fs.statfsSync(p); disk = { path: p, free: st.bavail * st.bsize, total: st.blocks * st.bsize }; } catch {}
    let gpu = ''; try { if (ctx.gpu) gpu = await ctx.gpu(); } catch {}
    let mem = 0; try { if (ctx.metrics) mem = ctx.metrics().reduce((n, m) => n + ((m.memory && m.memory.workingSetSize) || 0), 0) * 1024; } catch {}
    return { ok: true, cpu: (c[0] && c[0].model || 'Unknown').replace(/\s+/g, ' ').trim(), cores: c.length, load, ramTotal: total, ramUsed: total - free, disk, gpu, uptime: os.uptime(), host: os.hostname(), os: os.type() + ' ' + os.release(), skbox: mem };
  }
  const gb = n => (n / 1073741824).toFixed(1) + ' GB';
  function sysText(i) { return ['CPU: ' + i.cpu + ' (' + i.cores + ' threads)' + (i.load != null ? ', ' + i.load + '% busy' : ''), 'Memory: ' + gb(i.ramUsed) + ' of ' + gb(i.ramTotal), i.disk ? 'Disk ' + i.disk.path + ': ' + gb(i.disk.free) + ' free of ' + gb(i.disk.total) : '', i.gpu ? 'Graphics: ' + i.gpu : '', 'Up for ' + Math.floor(i.uptime / 3600) + ' h ' + Math.floor(i.uptime % 3600 / 60) + ' min', 'SKBox uses ' + gb(i.skbox)].filter(Boolean).join('\n'); }

  async function run(name, arg) {
    try {
      switch (name) {
        case 'report': return report(arg);
        case 'resetGame': return resetGame(String(arg || ''));
        case 'resetAll': return resetAll();
        case 'summary': { const t = summaryText(arg); if (ctx.copy) ctx.copy(t); return { ok: true, text: t }; }
        case 'watchList': return { ok: true, list: watchList(), later: laterList() };
        case 'watchClear': return watchClear(arg ? String(arg) : '');
        case 'laterAdd': return laterAdd(arg && arg.url, arg && arg.title);
        case 'laterRemove': return laterRemove(String(arg || ''));
        case 'milestones': return milestones();
        case 'milestoneCheck': return { ok: true, fresh: checkMilestones() };
        case 'queue': return { ok: true, list: queueList() };
        case 'queueAdd': return queueAdd(arg);
        case 'queueRemove': return queueRemove(arg);
        case 'queueMove': return queueMove(arg && arg.id, arg && arg.dir);
        case 'queueClear': ctx.store.write('queue', []); return { ok: true };
        case 'sysinfo': return await sysinfo();
        case 'sysCopy': { const t = sysText(await sysinfo()); if (ctx.copy) ctx.copy(t); return { ok: true, text: t }; }
        case 'cancelAfter': return { ok: cancelAfter() , error: 'Nothing is waiting to happen.' };
        case 'pending': return { ok: true, what: pending() };
      }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
    return null;
  }
  return { applyProfile, restoreProfile, recover, onGameEnd, report, resetGame, resetAll, weeklyReport, watchNote, watchList, watchClear, laterAdd, laterList, laterRemove, pre, post, after, cancelAfter, pending, battery, milestones, checkMilestones, queueList, queueAdd, queueRemove, queueMove, queuePeek, sysinfo, sysText, summaryText, run, profileValues, QUALITY, PROFILE_KEYS };
}
module.exports = { create, dayKey, QUALITY };
