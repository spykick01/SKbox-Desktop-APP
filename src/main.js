const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, safeStorage, Tray, Menu, Notification, nativeImage, screen, desktopCapturer } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const wifi = require('./lib/wifi'), covers = require('./lib/covers'), { HelperClient } = require('./lib/helperClient');
const store = require('./lib/store').make(app.getPath('userData'));

const API_KEY = 'AIzaSyAm2A3omt2z1dnK2Z_TdwPk1GTYuYQYdUQ', PROJECT = 'sksmpmc-e4682';
const SITE = 'https://sksmpchat.netlify.app', SITE_HOSTS = ['sksmpchat.netlify.app'];
const COVER_DIR = () => path.join(app.getPath('userData'), 'covers');
const isWin = process.platform === 'win32';
const RENDERER = (f) => path.join(__dirname, '..', 'renderer', f);

if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null, tray = null, kiosk = true, helper = null, game = null, backdrop = null, overlayWin = null, overlayOpen = false, musicWin = null, musicUser = '', musicVisible = false, padCount = 0;
const send = (ch, ...a) => { try { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); } catch {} try { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(ch, ...a); } catch {} };
const nativeHwnd = w => { try { const b = w.getNativeWindowHandle(); return b.length >= 8 ? String(b.readBigUInt64LE(0)) : String(b.readUInt32LE(0)); } catch { return ''; } };
const displayNow = () => { try { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); } catch { return screen.getPrimaryDisplay(); } };

// ================= main window =================
function createWindow() {
  const st = store.read('settings', {});
  kiosk = !st.windowed;
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 900, minHeight: 560,
    fullscreen: kiosk, kiosk, frame: !kiosk, backgroundColor: '#05060d', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, backgroundThrottling: true }
  });
  win.loadFile(RENDERER('index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}
function comeBack() {
  if (!win || win.isDestroyed()) return;
  try {
    hideMusic(false); closeOverlay(false);
    if (win.isMinimized()) win.restore(); win.setKiosk(kiosk); win.setFullScreen(kiosk); win.show(); win.focus();
    if (helper) helper.focus(nativeHwnd(win));
    win.webContents.send('returned');
  } catch {}
}
function stepAside() { try { win.setAlwaysOnTop(false); win.setKiosk(false); win.setFullScreen(false); win.minimize(); } catch {} }

// web apps (SKchat inside <webview>); only our own site is allowed
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (ev, prefs, params) => {
    try { if (!SITE_HOSTS.includes(new URL(params.src).host)) { ev.preventDefault(); return; } } catch { ev.preventDefault(); return; }
    prefs.preload = path.join(__dirname, 'guestPreload.js'); prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.sandbox = true;
  });
});

// ================= storage =================
const STORES = ['apps', 'settings'];
ipcMain.handle('store:get', (_e, n, d) => STORES.includes(n) ? store.read(n, d) : d);
ipcMain.handle('store:set', (_e, n, v) => { if (STORES.includes(n)) store.write(n, v); return true; });
ipcMain.handle('sys:info', () => ({ version: app.getVersion(), platform: process.platform, covers: COVER_DIR(), startup: isWin ? app.getLoginItemSettings().openAtLogin : false, helper: !!(helper && helper.ready) }));

// ================= accounts (profiles) =================
function dv(v) { if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return +v.integerValue; if ('doubleValue' in v) return v.doubleValue; if ('booleanValue' in v) return v.booleanValue; if ('arrayValue' in v) return (v.arrayValue.values || []).map(dv); if ('mapValue' in v) return df(v.mapValue.fields || {}); return null; }
const df = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, dv(v)]));
async function fsGet(p, token) { const r = await fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/' + p, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) return null; return df((await r.json()).fields || {}); }
async function signIn(u, p) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u + '@users.sksmpmc.local', password: p, returnSecureToken: true }) });
  const j = await r.json();
  if (!r.ok) { const m = (j.error && j.error.message) || ''; throw new Error(/INVALID|NOT_FOUND|PASSWORD|USER_DISABLED/.test(m) ? 'Wrong username or password.' : 'Could not sign in. Check your internet connection.'); }
  return j;
}
async function loadProfile(u, p) {
  const a = await signIn(u, p);
  const d = (await fsGet('users/' + u, a.idToken)) || {}, m = (await fsGet('userData/' + u + '/music/state', a.idToken)) || {};
  if (d.banned) throw new Error('This account is banned.');
  return { u, nick: d.nick || '', bio: d.bio || '', av: typeof d.av === 'string' ? d.av : '', admin: !!d.isAdmin, stats: { playlists: (m.playlists || []).length, loved: (m.loved || []).length, history: (m.history || []).length } };
}
const enc = s => safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(s).toString('base64') : 'p:' + Buffer.from(s).toString('base64');
const dec = s => s.startsWith('e:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : Buffer.from(s.slice(2), 'base64').toString();
const readProfiles = () => store.read('profiles', []);
ipcMain.handle('auth:list', () => readProfiles().map(p => ({ ...p.meta })));
ipcMain.handle('auth:signin', async (_e, u, p) => {
  u = String(u || '').trim().toLowerCase();
  try { const meta = await loadProfile(u, p); const L = readProfiles().filter(x => x.meta.u !== u); L.push({ meta, pw: enc(p) }); store.write('profiles', L); return { ok: true, profile: meta }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('auth:refresh', async (_e, u) => { const L = readProfiles(), x = L.find(y => y.meta.u === u); if (!x) return null; try { x.meta = await loadProfile(u, dec(x.pw)); store.write('profiles', L); return x.meta; } catch { return x.meta; } });
ipcMain.handle('auth:cred', (_e, u) => { const x = readProfiles().find(y => y.meta.u === u); return x ? { u, p: dec(x.pw) } : null; });
ipcMain.handle('auth:remove', (_e, u) => { store.write('profiles', readProfiles().filter(x => x.meta.u !== u)); return true; });
function playersMeta() {
  const st = store.read('settings', {}), L = readProfiles();
  return [0, 1].map(i => { const u = (st.players || [])[i]; if (!u) return null; if (u === 'guest') return { u: 'guest', guest: true }; const p = L.find(x => x.meta.u === u); return p ? { ...p.meta } : { u }; });
}
function loginScript(u, p) { return '(function(u,p){var a=document.getElementById("li-u"),b=document.getElementById("li-p");if(a&&b&&a.offsetParent&&!window._sessOn){a.value=u;b.value=p;["input","change"].forEach(function(t){a.dispatchEvent(new Event(t,{bubbles:true}));b.dispatchEvent(new Event(t,{bubbles:true}));});if(window.doLogin)window.doLogin();}})(' + JSON.stringify(u) + ',' + JSON.stringify(p) + ')'; }
function autologin(wc, u) { const x = readProfiles().find(y => y.meta.u === u); if (!x) return; let p; try { p = dec(x.pw); } catch { return; } [1200, 3200, 6500].forEach(ms => setTimeout(() => { try { if (!wc.isDestroyed()) wc.executeJavaScript(loginScript(u, p)).catch(() => {}); } catch {} }, ms)); }

// ================= apps / covers =================
ipcMain.handle('dialog:file', async (_e, kind) => {
  const filters = kind === 'image' ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] : [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk'] }, { name: 'All files', extensions: ['*'] }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('cover:candidates', (_e, term) => covers.search(term).catch(() => []));
ipcMain.handle('cover:auto', async (_e, term) => { const id = crypto.randomBytes(6).toString('hex'), dest = path.join(COVER_DIR(), id + '.jpg'); const r = await covers.auto(term, dest).catch(() => ({ ok: false })); return r.ok ? { ok: true, file: dest, portrait: r.portrait, matched: r.matched } : { ok: false }; });
ipcMain.handle('cover:pick', async (_e, steamId) => { const id = crypto.randomBytes(6).toString('hex'), dest = path.join(COVER_DIR(), id + '.jpg'); const r = await covers.download(steamId, dest); return r.ok ? { ok: true, file: dest, portrait: r.portrait } : { ok: false }; });
ipcMain.handle('cover:copy', async (_e, src) => { try { const dest = path.join(COVER_DIR(), crypto.randomBytes(6).toString('hex') + path.extname(src)); fs.mkdirSync(COVER_DIR(), { recursive: true }); fs.copyFileSync(src, dest); return { ok: true, file: dest, portrait: true }; } catch { return { ok: false }; } });
ipcMain.handle('cover:icon', async (_e, exe) => { try { if (!/^[a-z]:|^\\\\/i.test(exe)) return { ok: false }; const img = await app.getFileIcon(exe, { size: 'large' }); if (img.isEmpty()) return { ok: false }; const dest = path.join(COVER_DIR(), crypto.randomBytes(6).toString('hex') + '.png'); fs.mkdirSync(COVER_DIR(), { recursive: true }); fs.writeFileSync(dest, img.toPNG()); return { ok: true, file: dest, icon: true }; } catch { return { ok: false }; } });
ipcMain.handle('cover:remove', (_e, f) => { try { if (f && path.dirname(f) === COVER_DIR()) fs.unlinkSync(f); } catch {} return true; });

// ================= running a game =================
const splitArgs = s => (String(s || '').match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, ''));
function applyCompat(exe) { // old-game fixes: Windows compatibility flags for this one program (current user only)
  if (!isWin) return;
  execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers', '/v', exe, '/t', 'REG_SZ', '/d', '~ WIN7RTM HIGHDPIAWARE DISABLEDXMAXIMIZEDWINDOWEDMODE', '/f'], { windowsHide: true }, () => {});
}
function showBackdrop(a) {
  closeBackdrop(); const d = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  backdrop = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, backgroundColor: '#000000', show: false, skipTaskbar: true, focusable: false, movable: false, resizable: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  backdrop.loadFile(RENDERER('backdrop.html'), { query: { name: a.name || '', cover: a.cover || '' } });
  backdrop.once('ready-to-show', () => { try { backdrop.showInactive(); } catch {} });
  setTimeout(() => backdropFade(), 9000);
  backdrop.on('closed', () => { backdrop = null; });
}
function closeBackdrop() { try { if (backdrop && !backdrop.isDestroyed()) backdrop.destroy(); } catch {} backdrop = null; }
function gameState() { return game ? { id: game.id, name: game.name, startedAt: game.startedAt, cover: game.cover || '', hasWindow: !!game.hwnd } : null; }
function killGame() {
  return new Promise(res => {
    const pids = [...new Set([game && game.pid, game && game.wpid].filter(x => x > 0))];
    if (!pids.length || !isWin) { res(); return; }
    let n = pids.length; pids.forEach(p => execFile('taskkill', ['/PID', String(p), '/T', '/F'], { windowsHide: true }, () => { if (--n === 0) res(); }));
  });
}
function endGame() {
  if (!game) return; game = null; closeBackdrop(); closeOverlay(false); if (helper) helper.unwatch();
  send('game:state', null); comeBack();
}
ipcMain.handle('game:state', () => gameState());
ipcMain.handle('game:resume', () => { if (!game) return false; hideMusic(false); closeOverlay(false); stepAside(); if (helper && game.hwnd) helper.focus(game.hwnd); return true; });
ipcMain.handle('game:close', async () => { if (!game) return false; await killGame(); endGame(); return true; });
ipcMain.handle('app:launch', async (_e, a) => {
  const target = String(a.exe || '').trim().replace(/^"|"$/g, '');
  if (!target) return { ok: false, error: 'No file set for this app.' };
  if (game && !a.replace) return { ok: false, error: game.name + ' is already running.', running: true };
  if (game && a.replace) { await killGame(); endGame(); await new Promise(r => setTimeout(r, 600)); }
  try {
    const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
    if (!isUrl && !fs.existsSync(target)) return { ok: false, error: 'File not found: ' + target };
    game = { id: a.id, name: a.name || path.basename(target), exe: target, cover: a.cover || '', startedAt: Date.now(), pid: 0, wpid: 0, hwnd: '', mode: a.fs || 'auto', noWindow: false, exited: false };
    if (a.compat && !isUrl && /\.exe$/i.test(target)) applyCompat(target);
    showBackdrop(game); send('game:state', gameState());
    let child = null;
    if (isUrl) await shell.openExternal(target);
    else if (/\.exe$/i.test(target)) {
      child = spawn(target, splitArgs(a.args), { cwd: path.dirname(target), detached: true, stdio: 'ignore' });
      game.pid = child.pid || 0;
      child.on('error', err => { const g = game; endGame(); win && win.webContents.send('launch-error', String(err.message || err)); });
      child.on('exit', () => { if (!game) return; game.exited = true; if (!helper || !helper.ready || game.noWindow) { if (Date.now() - game.startedAt > 15000) endGame(); } });
      child.unref();
    } else { const err = await shell.openPath(target); if (err) { endGame(); return { ok: false, error: err }; } }
    if (helper && helper.ready) helper.watch(game.pid, game.mode, process.pid);
    stepAside();
    return { ok: true };
  } catch (e) { endGame(); return { ok: false, error: String(e.message || e) }; }
});
function backdropFade() { try { if (backdrop && !backdrop.isDestroyed()) backdrop.webContents.executeJavaScript("document.body.classList.add('dim')").catch(() => {}); } catch {} }

// ================= helper (controller guide button, controller count, fullscreen) =================
const helperScript = () => path.join(__dirname, 'native', 'helper.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
function startHelper() {
  if (!isWin) return;
  helper = new HelperClient({ script: helperScript() });
  helper.on('guide', () => toggleOverlay());
  helper.on('pads', n => { padCount = n; send('pads', n); const pl = playersMeta(); if (n >= 2 && !pl[1] && game && !overlayOpen) openOverlay({ p2: true }); });
  helper.on('win', w => { if (game) { game.hwnd = w.hwnd; game.wpid = w.pid; send('game:state', gameState()); } });
  helper.on('fs', t => { backdropFade(); send('fs', t); });
  helper.on('gone', () => endGame());
  helper.on('nowin', () => { if (game) { game.noWindow = true; if (game.exited || !game.pid) endGame(); } });
  helper.on('error-line', l => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'helper.log'), new Date().toISOString() + ' ' + l + '\n'); } catch {} });
  helper.start();
}

// ================= SK overlay (the "guide" menu) =================
function ensureOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  const d = displayNow();
  overlayWin = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, transparent: true, frame: false, show: false, skipTaskbar: true, hasShadow: false, resizable: false, movable: false, alwaysOnTop: true, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, backgroundThrottling: false } });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.loadFile(RENDERER('overlay.html'));
  overlayWin.on('closed', () => { overlayWin = null; overlayOpen = false; });
  return overlayWin;
}
function overlayStateObj(opts) {
  return { game: gameState(), players: playersMeta(), apps: store.read('apps', []), settings: store.read('settings', {}), pads: padCount, music: !!(musicWin && !musicWin.isDestroyed()), opts: opts || {}, helper: !!(helper && helper.ready), covers: COVER_DIR() };
}
function openOverlay(opts) {
  const w = ensureOverlay(), d = displayNow(); try { w.setBounds(d.bounds); } catch {}
  overlayOpen = true;
  const show = () => { try { w.setAlwaysOnTop(true, 'screen-saver'); w.show(); w.moveTop(); w.focus(); if (helper) helper.focus(nativeHwnd(w)); w.webContents.send('overlay:open', overlayStateObj(opts)); } catch {} };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', show); else show();
}
function closeOverlay(refocus) {
  if (!overlayWin || overlayWin.isDestroyed() || !overlayOpen) { overlayOpen = false; return; }
  overlayOpen = false; try { overlayWin.webContents.send('overlay:close'); overlayWin.hide(); } catch {}
  if (refocus) { if (musicVisible && musicWin && !musicWin.isDestroyed()) { musicWin.focus(); if (helper) helper.focus(nativeHwnd(musicWin)); } else if (game && game.hwnd && helper) helper.focus(game.hwnd); }
}
function toggleOverlay() { if (overlayOpen) closeOverlay(true); else openOverlay({}); }
ipcMain.handle('overlay:state', () => overlayStateObj({}));
ipcMain.handle('overlay:close', (_e, refocus) => { closeOverlay(refocus !== false); return true; });
ipcMain.handle('overlay:home', () => { closeOverlay(false); hideMusic(false); comeBack(); return true; });
ipcMain.handle('overlay:setPlayer', (_e, slot, u) => {
  const st = store.read('settings', {}); st.players = st.players || [null, null]; st.players[slot === 1 ? 1 : 0] = u || null; store.write('settings', st); send('players-changed'); return true;
});
ipcMain.handle('overlay:screenshot', async () => {
  try {
    const wasOpen = overlayOpen; if (wasOpen && overlayWin) overlayWin.hide(); await new Promise(r => setTimeout(r, 350));
    const d = displayNow(), srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor } });
    const s = srcs.find(x => String(x.display_id) === String(d.id)) || srcs[0];
    const dir = path.join(app.getPath('pictures'), 'SKBox'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, (game ? game.name.replace(/[^\w\- ]+/g, '') + ' ' : 'SKBox ') + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png');
    fs.writeFileSync(file, s.thumbnail.toPNG());
    if (wasOpen && overlayWin) { overlayWin.show(); overlayWin.focus(); }
    return { ok: true, file };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

// ================= music host (SKMusic keeps playing while you game) =================
function ensureMusic(u) {
  if (musicWin && !musicWin.isDestroyed() && musicUser === u) return musicWin;
  if (musicWin && !musicWin.isDestroyed()) musicWin.destroy();
  musicUser = u || 'guest';
  musicWin = new BrowserWindow({ show: false, frame: false, backgroundColor: '#000000', skipTaskbar: true, webPreferences: { partition: 'persist:skbox-' + musicUser, preload: path.join(__dirname, 'guestPreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  musicWin.loadURL(SITE + '/skmusic');
  musicWin.webContents.on('did-finish-load', () => { if (musicUser !== 'guest') autologin(musicWin.webContents, musicUser); });
  musicWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  musicWin.on('closed', () => { musicWin = null; musicVisible = false; });
  return musicWin;
}
function showMusic(u) {
  const w = ensureMusic(u); closeOverlay(false); musicVisible = true; send('music:visible', true);
  try { w.setFullScreen(true); w.show(); w.focus(); if (helper) helper.focus(nativeHwnd(w)); } catch {}
}
function hideMusic(refocus) {
  if (!musicWin || musicWin.isDestroyed() || !musicVisible) { musicVisible = false; return; }
  musicVisible = false; send('music:visible', false); try { musicWin.setFullScreen(false); musicWin.hide(); } catch {}
  if (refocus) { if (game && game.hwnd && helper && !win.isVisible()) helper.focus(game.hwnd); else comeBack(); }
}
const MUSIC = { toggle: 'SKMusic.playPause()', next: 'SKMusic.next()', prev: 'SKMusic.prev()', daily: 'SKMusic.dailyMix()', stop: 'SKMusic.stopRadio()',
  volup: '(function(){var s=SKMusic.state();SKMusic.setVol(Math.min(100,(s.vol==null?80:s.vol)+10))})()', voldown: '(function(){var s=SKMusic.state();SKMusic.setVol(Math.max(0,(s.vol==null?80:s.vol)-10))})()' };
ipcMain.handle('music:open', (_e, u) => { showMusic(u || 'guest'); return true; });
ipcMain.handle('music:ensure', (_e, u) => { ensureMusic(u || 'guest'); return true; });
ipcMain.handle('music:status', async () => {
  if (!musicWin || musicWin.isDestroyed()) return { ready: false };
  try { const s = await musicWin.webContents.executeJavaScript('(window.SKMusic&&SKMusic.state)?JSON.stringify(SKMusic.state()):null'); return s ? { ready: true, ...JSON.parse(s) } : { ready: false }; } catch { return { ready: false }; }
});
ipcMain.handle('music:cmd', async (_e, c, arg) => {
  if (!musicWin || musicWin.isDestroyed()) return false;
  let js = MUSIC[c]; if (c === 'radio') js = 'SKMusic.startRadio("genre",' + JSON.stringify(String(arg || '').slice(0, 30)) + ')';
  if (!js) return false; try { await musicWin.webContents.executeJavaScript('(function(){try{' + js + '}catch(e){}})()'); return true; } catch { return false; }
});
ipcMain.on('guest:home', e => { if (musicWin && !musicWin.isDestroyed() && e.sender === musicWin.webContents) hideMusic(true); });
ipcMain.on('guest:osk', (e, o) => { if (musicWin && !musicWin.isDestroyed() && e.sender === musicWin.webContents) openOverlay({ osk: { value: (o && o.value) || '', target: 'music' } }); });
ipcMain.handle('overlay:osk-result', (_e, r) => {
  closeOverlay(false);
  if (r && r.target === 'music' && musicWin && !musicWin.isDestroyed()) {
    if (!r.cancel) musicWin.webContents.executeJavaScript('(function(t,s){var e=document.activeElement;if(!e)return;if(e.isContentEditable){e.textContent=t;e.dispatchEvent(new Event("input",{bubbles:true}));}else{var pr=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,ds=Object.getOwnPropertyDescriptor(pr,"value");if(ds&&ds.set)ds.set.call(e,t);else e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}));}if(s){e.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));}})(' + JSON.stringify(String(r.text || '')) + ',' + (r.send ? 'true' : 'false') + ')').catch(() => {});
    musicWin.focus(); if (helper) helper.focus(nativeHwnd(musicWin));
  } else if (game && game.hwnd && helper) helper.focus(game.hwnd);
  return true;
});

// ================= wifi / system =================
ipcMain.handle('wifi:scan', async () => { try { return { ok: true, nets: await wifi.scan() }; } catch (e) { return { ok: false, error: 'Wi-Fi is not available on this PC.' }; } });
ipcMain.handle('wifi:status', async () => { try { return await wifi.status(); } catch { return { connected: false, ssid: '', signal: 0 }; } });
ipcMain.handle('wifi:connect', async (_e, a) => { try { return await wifi.connect(a.ssid, a.password || '', a.auth || ''); } catch (e) { return { ok: false, error: 'Could not connect.' }; } });
ipcMain.handle('wifi:disconnect', () => wifi.disconnect());
const POWER = { shutdown: ['shutdown', ['/s', '/t', '0']], restart: ['shutdown', ['/r', '/t', '0']], logoff: ['shutdown', ['/l']], sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']] };
ipcMain.handle('sys:power', (_e, what) => { if (what === 'quit') { app.quit(); return true; } const p = POWER[what]; if (p && isWin) execFile(p[0], p[1], { windowsHide: true }, () => {}); return !!p; });
ipcMain.handle('sys:openSettings', (_e, page) => { const ok = { bluetooth: 'ms-settings:bluetooth', sound: 'ms-settings:sound', wifi: 'ms-settings:network-wifi', devices: 'ms-settings:connecteddevices' }[page]; if (!ok) return false; stepAside(); shell.openExternal(ok); try { new Notification({ title: 'SKBox is still running', body: 'Press Ctrl+Shift+B or use the tray icon to come back.', silent: true }).show(); } catch {} return true; });
ipcMain.handle('sys:volume', (_e, dir) => { if (!isWin) return false; const k = { up: 175, down: 174, mute: 173 }[dir]; if (!k) return false; execFile('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]' + k + ')'], { windowsHide: true }, () => {}); return true; });
ipcMain.handle('sys:startup', (_e, on) => { if (isWin || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: !!on }); const s = store.read('settings', {}); s.startup = !!on; store.write('settings', s); return !!on; });
ipcMain.handle('sys:kiosk', (_e, on) => { kiosk = !!on; const s = store.read('settings', {}); s.windowed = !on; store.write('settings', s); try { win.setKiosk(kiosk); win.setFullScreen(kiosk); } catch {} return kiosk; });

// ================= tray, shortcuts, updates =================
function setupTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 20, height: 20 });
    tray = new Tray(img); tray.setToolTip('SKBox');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open SKBox', click: comeBack }, { label: 'Open the SK menu', click: () => openOverlay({}) }, { label: 'Exit SKBox', click: () => app.quit() }]));
    tray.on('click', comeBack);
  } catch {}
}
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', i => send('update-ready', i.version)); autoUpdater.on('error', () => {});
    autoUpdater.checkForUpdates().catch(() => {}); setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3 * 3600 * 1000);
    ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); return true; });
  } catch {}
}
app.on('second-instance', comeBack);
app.whenReady().then(() => {
  const st = store.read('settings', {});
  if (st.startup === undefined && (isWin || process.platform === 'darwin')) { app.setLoginItemSettings({ openAtLogin: true }); st.startup = true; store.write('settings', st); }
  createWindow(); setupTray(); setupUpdates(); startHelper();
  globalShortcut.register('Control+Shift+B', comeBack);
  globalShortcut.register('Control+Shift+O', toggleOverlay);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { helper && helper.stop(); } catch {} });
app.on('window-all-closed', () => app.quit());
