// SKBox Plus: per-game profiles, play history, milestones, Up next, system info, after-game actions and a few helpers.
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
    try { logSession(g, ms); checkGoal(); } catch {}
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
    ['p3', 'Tuner', 'Set up game profiles for 3 games', 'profiles', 3], ['q3', 'Planner', 'Line up 3 games in Up next', 'queueMax', 3]
  ];
  function metrics() {
    const st = ctx.store.read('stats', {}), log = ctx.store.read('gamedays', {}), ap = apps(), ms = ctx.store.read('milestones', {}), r = report(7);
    const byDay = {}; Object.values(log).forEach(g => Object.keys(g).forEach(k => { byDay[k] = (byDay[k] || 0) + g[k]; }));
    const stats = Object.values(st);
    return { launches: stats.reduce((n, x) => n + (x.n || 0), 0), hours: Math.floor(stats.reduce((n, x) => n + (x.ms || 0), 0) / 3600000), played: stats.filter(x => (x.n || 0) > 0).length,
      bestStreak: Math.max(r.streak, ms.bestStreak || 0), bestDayH: Math.floor(Math.max(0, ...Object.values(byDay)) / 3600000), apps: ap.filter(a => !a.kind).length,
      profiles: ap.filter(a => a.profile && Object.keys(a.profile).length).length, queueMax: Math.max(ms.queueMax || 0, ctx.store.read('queue', []).length) };
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
  function queueTop(id) { const q = qIds(), i = q.indexOf(String(id)); if (i > 0) { q.splice(i, 1); q.unshift(String(id)); ctx.store.write('queue', q); } return { ok: true }; }
  const queuePeek = () => queueList()[0] || null;


  // ---------- play sessions, history, Wrapped ----------
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function logSession(g, ms) {
    const min = Math.max(0, +(S().minSession === undefined ? 2 : S().minSession)) * 60000; if (!g || !g.id || ms < min) return false;
    const l = ctx.store.read('sessions', []); l.push({ id: g.id, n: g.name || nameOf(g.id), s: (g.startedAt || (now() - ms)), ms: ms | 0 }); ctx.store.write('sessions', l.slice(-1000)); return true;
  }
  const sessionsIn = days => { const all = ctx.store.read('sessions', []); if (!days) return all; const from = now() - days * 86400000; return all.filter(x => x.s >= from); };
  function history(limit) { return { ok: true, list: ctx.store.read('sessions', []).slice().sort((a, b) => b.s - a.s).slice(0, limit || 60).map(x => ({ id: x.id, name: nameOf(x.id) || x.n, s: x.s, ms: x.ms })) }; }
  function gameHistory(id) {
    const all = ctx.store.read('sessions', []).filter(x => x.id === id), stats = ctx.store.read('stats', {})[id] || {}, log = (ctx.store.read('gamedays', {})[id]) || {}, t = new Date(now()), chart = [];
    for (let i = 13; i >= 0; i--) { const x = new Date(t); x.setDate(t.getDate() - i); chart.push({ k: dayKey(x), ms: log[dayKey(x)] || 0, wd: x.getDay() }); }
    const total = all.reduce((n, x) => n + x.ms, 0), longest = all.reduce((b, x) => (x.ms > b ? x.ms : b), 0);
    return { ok: true, sessions: all.slice(-8).reverse().map(x => ({ s: x.s, ms: x.ms })), count: all.length, avg: all.length ? Math.round(total / all.length) : 0, longest, first: all.length ? all[0].s : 0, last: all.length ? all[all.length - 1].s : (stats.last || 0), total: stats.ms || total, launches: stats.n || all.length, chart };
  }
  function wrapped(period) {
    period = ['week', 'month', 'year', 'all'].includes(period) ? period : 'month'; const days = { week: 7, month: 30, year: 365, all: 0 }[period], list = sessionsIn(days);
    const out = { ok: true, period, sessions: list.length, total: 0, games: [], longest: null, avg: 0, favDay: '', favTime: '', busiest: null, distinct: 0, streak: 0 };
    if (!list.length) return out;
    const by = {}, wd = new Array(7).fill(0), tod = { morning: 0, afternoon: 0, evening: 0, night: 0 }, byDay = {};
    list.forEach(x => { out.total += x.ms; const g = by[x.id] || (by[x.id] = { id: x.id, name: nameOf(x.id) || x.n, ms: 0, n: 0 }); g.ms += x.ms; g.n++; const d = new Date(x.s); wd[d.getDay()] += x.ms; const h = d.getHours(); tod[h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'] += x.ms; const k = dayKey(d); byDay[k] = (byDay[k] || 0) + x.ms; if (!out.longest || x.ms > out.longest.ms) out.longest = { name: nameOf(x.id) || x.n, ms: x.ms, s: x.s }; });
    out.games = Object.values(by).sort((a, b) => b.ms - a.ms).slice(0, 10); out.distinct = Object.keys(by).length; out.avg = Math.round(out.total / list.length);
    out.favDay = DAYS[wd.indexOf(Math.max(...wd))]; out.favTime = Object.keys(tod).sort((a, b) => tod[b] - tod[a])[0];
    const bk = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0]; out.busiest = { k: bk, ms: byDay[bk] };
    const keys = Object.keys(byDay).map(k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }).sort((a, b) => a - b); let run = 1, best = 1; for (let i = 1; i < keys.length; i++) { run = Math.round((keys[i] - keys[i - 1]) / 86400000) === 1 ? run + 1 : 1; best = Math.max(best, run); } out.streak = keys.length ? best : 0;
    return out;
  }
  function wrappedText(period) { const w = wrapped(period); if (!w.sessions) return 'No play recorded yet.'; return ['SKBox Wrapped (' + { week: 'this week', month: 'last 30 days', year: 'this year', all: 'all time' }[w.period] + ')', 'Played ' + fmt(w.total) + ' in ' + w.sessions + ' sessions across ' + w.distinct + ' game' + (w.distinct === 1 ? '' : 's'), 'Longest session: ' + w.longest.name + ' (' + fmt(w.longest.ms) + ')', 'Favourite day: ' + w.favDay + ', favourite time: ' + w.favTime, 'Best streak: ' + w.streak + ' day' + (w.streak === 1 ? '' : 's')].concat(w.games.slice(0, 5).map((g, i) => (i + 1) + '. ' + g.name + ' - ' + fmt(g.ms))).join('\n'); }
  function exportCsv() {
    if (!ctx.desktop) return { ok: false, error: 'No Desktop folder.' }; const q = v => '"' + String(v).replace(/"/g, '""') + '"', rows = ['Game,Started,Minutes'];
    ctx.store.read('sessions', []).forEach(x => rows.push([q(nameOf(x.id) || x.n), q(new Date(x.s).toISOString()), Math.round(x.ms / 60000)].join(',')));
    const f = path.join(ctx.desktop, 'SKBox-play-history.csv'); fs.writeFileSync(f, rows.join('\r\n') + '\r\n'); return { ok: true, file: f, n: rows.length - 1 };
  }

  // ---------- goals, quiet hours, notification log ----------
  const todayMs = () => { const k = dayKey(new Date(now())), log = ctx.store.read('gamedays', {}); let ms = 0; Object.values(log).forEach(g => { ms += g[k] || 0; }); return ms; };
  function checkGoal() {
    const s = S(), g = +s.dailyGoalH || 0, k = dayKey(new Date(now())); if (!g || s.goalDone === k) return false;
    if (todayMs() >= g * 3600000) { s.goalDone = k; ctx.store.write('settings', s); ctx.notify('Daily goal reached', 'You played ' + fmt(todayMs()) + ' today. Nice.'); return true; } return false;
  }
  function streakSaver() {   // evening nudge to keep a streak alive
    const s = S(), d = new Date(now()), k = dayKey(d); if (!s.streakSaver || d.getHours() < 20 || s.saverDone === k || todayMs() > 60000) return false;
    const st = report(7).streak; if (st < 3) return false; s.saverDone = k; ctx.store.write('settings', s); ctx.notify('Keep your streak alive', 'You are on a ' + st + ' day streak. A short session today keeps it going.'); return true;
  }
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : -1; };
  function quiet(date) {
    const s = S(); if (!s.quietOn) return false; const a = toMin(s.quietFrom || '23:00'), b = toMin(s.quietTo || '07:00'), d = new Date(date || now()), n = d.getHours() * 60 + d.getMinutes(); if (a < 0 || b < 0 || a === b) return false;
    return a < b ? (n >= a && n < b) : (n >= a || n < b);
  }
  function logNotif(title, body) { const l = ctx.store.read('notiflog', []); l.unshift({ t: now(), title: String(title || '').slice(0, 80), body: String(body || '').slice(0, 160) }); ctx.store.write('notiflog', l.slice(0, 50)); }

  // ---------- save backups ----------
  const SAVE_CAP = 2 * 1024 * 1024 * 1024, bdir = id => path.join(ctx.backupDir || os.tmpdir(), String(id));
  function dirSize(p, cap) { let n = 0; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { try { n += fs.statSync(f).size; } catch {} } if (n > cap) throw new Error('big'); } }; try { walk(p); } catch (e) { if (e.message === 'big') return cap + 1; } return n; }
  function saveCheck(app) {
    const sv = app && app.saves; if (!sv || !sv.path) return 'Set the save folder first.'; const p = path.resolve(sv.path);
    if (path.parse(p).root === p || p.split(path.sep).filter(Boolean).length < 2) return 'That folder is too broad. Pick the game\u2019s own save folder.';
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) return 'Save folder not found: ' + p; return '';
  }
  function backupSaves(app, why) {
    const err = saveCheck(app); if (err) return { ok: false, error: err }; why = String(why || 'manual').replace(/[^a-z-]/g, ''); const src = path.resolve(app.saves.path);
    if (dirSize(src, SAVE_CAP) > SAVE_CAP) return { ok: false, error: 'That folder is over 2 GB, so SKBox will not back it up.' };
    const name = now() + '_' + why, dst = path.join(bdir(app.id), name); fs.mkdirSync(dst, { recursive: true }); fs.cpSync(src, dst, { recursive: true });
    const keep = Math.max(1, Math.min(30, +(app.saves.keep || S().backupKeep || 5))); const all = listBackups(app.id); all.filter(b => b.why !== 'before-restore').slice(keep).forEach(b => { try { fs.rmSync(path.join(bdir(app.id), b.name), { recursive: true, force: true }); } catch {} });
    return { ok: true, name, size: dirSize(dst, SAVE_CAP) };
  }
  function listBackups(id) { let l = []; try { l = fs.readdirSync(bdir(id)).filter(n => /^\d+_[a-z-]+$/.test(n)); } catch {} return l.sort().reverse().map(n => ({ name: n, ts: +n.split('_')[0], why: n.split('_')[1], size: dirSize(path.join(bdir(id), n), SAVE_CAP) })); }
  function restoreBackup(app, name) {
    const err = saveCheck(app); if (err) return { ok: false, error: err }; if (!/^\d+_[a-z-]+$/.test(String(name))) return { ok: false, error: 'Unknown backup.' };
    if (ctx.running && ctx.running(app.id)) return { ok: false, error: 'Close the game first.' }; const src = path.join(bdir(app.id), name); if (!fs.existsSync(src)) return { ok: false, error: 'That backup is gone.' };
    const safe = backupSaves(app, 'before-restore'); if (!safe.ok) return safe; const dst = path.resolve(app.saves.path); fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true }); return { ok: true, safety: safe.name };
  }
  function deleteBackup(id, name) { if (!/^\d+_[a-z-]+$/.test(String(name))) return { ok: false }; try { fs.rmSync(path.join(bdir(id), name), { recursive: true, force: true }); } catch {} return { ok: true }; }

  // ---------- routines (scheduled actions) ----------
  const RTYPES = ['launch', 'remote', 'notify', 'pick', 'sleep', 'lock'];
  const routines = () => ctx.store.read('routines', []);
  function routineSave(r) {
    r = r || {}; const t = toMin(r.time); if (t < 0 || t > 1439) return { ok: false, error: 'Time must look like 19:30.' }; if (!RTYPES.includes(r.type)) return { ok: false, error: 'Unknown action.' };
    if (r.type === 'launch' && !apps().some(a => a.id === r.app)) return { ok: false, error: 'Pick an app to launch.' };
    const l = routines(), c = { id: r.id || 'r_' + now().toString(36) + Math.floor(Math.random() * 99), name: String(r.name || 'Routine').slice(0, 40), time: String(r.time), days: (Array.isArray(r.days) ? r.days : []).filter(d => d >= 0 && d <= 6), type: r.type, app: r.app || '', text: String(r.text || '').slice(0, 120), on: r.on !== false, last: '' };
    const i = l.findIndex(x => x.id === c.id); if (i >= 0) { c.last = l[i].last || ''; l[i] = c; } else l.push(c); ctx.store.write('routines', l.slice(0, 30)); return { ok: true, id: c.id };
  }
  function routineRemove(id) { ctx.store.write('routines', routines().filter(r => r.id !== id)); return { ok: true }; }
  function dueRoutines(date) {
    const d = new Date(date || now()), n = d.getHours() * 60 + d.getMinutes(), k = dayKey(d);
    return routines().filter(r => r.on !== false && r.last !== k && (!r.days.length || r.days.includes(d.getDay())) && n >= toMin(r.time) && n - toMin(r.time) <= 5);
  }
  async function fire(r) {
    const ap = apps();
    if (r.type === 'notify') ctx.notify(r.name, r.text || 'Routine'); else if (r.type === 'sleep') ctx.power('sleep'); else if (r.type === 'lock') ctx.lockPc();
    else if (r.type === 'remote') { if (ctx.remote) await ctx.remote(r.text !== 'off'); ctx.notify(r.name, 'Remote play turned ' + (r.text === 'off' ? 'off' : 'on')); }
    else if (r.type === 'launch') { const a = ap.find(x => x.id === r.app); if (!a) return { ok: false, error: 'App is gone.' }; if (ctx.busy && ctx.busy()) { ctx.notify(r.name, 'Skipped: a game is already running.'); return { ok: false, error: 'busy' }; } return await ctx.launch(a); }
    else if (r.type === 'pick') { const pool = ap.filter(a => !a.kind && !(ctx.running && ctx.running(a.id))); if (pool.length) { const a = pool[Math.floor(Math.random() * pool.length)]; ctx.notify(r.name || 'Tonight\u2019s pick', a.name); } }
    return { ok: true };
  }
  async function tick() {
    const due = dueRoutines(); if (due.length) { const l = routines(); due.forEach(r => { const x = l.find(y => y.id === r.id); if (x) x.last = dayKey(new Date(now())); }); ctx.store.write('routines', l); for (const r of due) { try { await fire(r); } catch {} } }
    try { streakSaver(); } catch {} return due.length;
  }
  async function routineRun(id) { const r = routines().find(x => x.id === id); if (!r) return { ok: false, error: 'Not found.' }; return (await fire(r)) || { ok: true }; }

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
        case 'milestones': return milestones();
        case 'milestoneCheck': return { ok: true, fresh: checkMilestones() };
        case 'queue': return { ok: true, list: queueList() };
        case 'queueAdd': return queueAdd(arg);
        case 'queueRemove': return queueRemove(arg);
        case 'queueMove': return queueMove(arg && arg.id, arg && arg.dir);
        case 'queueTop': return queueTop(String(arg || ''));
        case 'queueClear': ctx.store.write('queue', []); return { ok: true };
        case 'copyText': if (ctx.copy) ctx.copy(String(arg || '')); return { ok: true };
        case 'showFile': if (ctx.show) ctx.show(String(arg || '')); return { ok: true };
        case 'history': return history(arg);
        case 'gameHistory': return gameHistory(String(arg || ''));
        case 'wrapped': return wrapped(arg);
        case 'wrappedCopy': { const t = wrappedText(arg); if (ctx.copy) ctx.copy(t); return { ok: true, text: t }; }
        case 'exportCsv': return exportCsv();
        case 'notifLog': return { ok: true, list: ctx.store.read('notiflog', []) };
        case 'notifClear': ctx.store.write('notiflog', []); return { ok: true };
        case 'backupNow': { const a = apps().find(x => x.id === (arg && arg.id)); return a ? backupSaves(a, 'manual') : { ok: false, error: 'Unknown app.' }; }
        case 'backups': return { ok: true, list: listBackups(String(arg || '')) };
        case 'restore': { const a = apps().find(x => x.id === (arg && arg.id)); return a ? restoreBackup(a, arg.name) : { ok: false, error: 'Unknown app.' }; }
        case 'backupDelete': return deleteBackup(String(arg && arg.id || ''), arg && arg.name);
        case 'routines': return { ok: true, list: routines() };
        case 'routineSave': return routineSave(arg);
        case 'routineRemove': return routineRemove(String(arg || ''));
        case 'routineRun': return await routineRun(String(arg || ''));
        case 'goal': return { ok: true, goalH: +S().dailyGoalH || 0, today: todayMs() };
        case 'sysinfo': return await sysinfo();
        case 'sysCopy': { const t = sysText(await sysinfo()); if (ctx.copy) ctx.copy(t); return { ok: true, text: t }; }
        case 'cancelAfter': return { ok: cancelAfter() , error: 'Nothing is waiting to happen.' };
        case 'pending': return { ok: true, what: pending() };
      }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
    return null;
  }
  return { applyProfile, restoreProfile, recover, onGameEnd, report, resetGame, resetAll, weeklyReport, pre, post, after, cancelAfter, pending, battery, logSession, history, gameHistory, wrapped, wrappedText, exportCsv, checkGoal, streakSaver, quiet, logNotif, backupSaves, listBackups, restoreBackup, deleteBackup, routineSave, routineRemove, dueRoutines, tick, routineRun, todayMs, milestones, checkMilestones, queueList, queueAdd, queueRemove, queueMove, queueTop, queuePeek, sysinfo, sysText, summaryText, run, profileValues, QUALITY, PROFILE_KEYS };
}
module.exports = { create, dayKey, QUALITY };
