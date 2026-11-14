const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, safeStorage, Tray, Menu, Notification, nativeImage, screen, desktopCapturer, session } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path'), fs = require('fs'), crypto = require('crypto'), os = require('os');
const { RemoteHost } = require('./lib/remote'), { PadMapper } = require('./lib/padmap'), bt = require('./lib/bluetooth'), wifi = require('./lib/wifi'), covers = require('./lib/covers'), { HelperClient } = require('./lib/helperClient');
const store = require('./lib/store').make(app.getPath('userData'));

const API_KEY = 'AIzaSyAm2A3omt2z1dnK2Z_TdwPk1GTYuYQYdUQ', PROJECT = 'sksmpmc-e4682';
const SITE = 'https://sksmpchat.netlify.app', SITE_HOSTS = ['sksmpchat.netlify.app'];
const COVER_DIR = () => path.join(app.getPath('userData'), 'covers');
const isWin = process.platform === 'win32';
const RENDERER = (f) => path.join(__dirname, '..', 'renderer', f);

if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// speed: keep the hidden streaming window at full speed, use the GPU for capture and encoding
app.commandLine.appendSwitch('disable-renderer-backgrounding'); app.commandLine.appendSwitch('disable-background-timer-throttling'); app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); app.commandLine.appendSwitch('ignore-gpu-blocklist'); app.commandLine.appendSwitch('enable-zero-copy'); app.commandLine.appendSwitch('enable-gpu-rasterization');

const batteries = {};
let overlayOpaque = false, padTest = false, fgTarget = null, overlayTarget = null;
const helperInfo = { error: '', lastGuide: 0, guides: 0, lastKey: '', diag: [] };
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
const STORES = ['apps', 'settings', 'stats'];
ipcMain.handle('store:get', (_e, n, d) => STORES.includes(n) ? store.read(n, d) : d);
const MAIN_OWNED = ['brightness', 'dim', 'warm'];   // changed by hotkeys in the main process: never let a stale copy from the window overwrite them
ipcMain.handle('store:set', (_e, n, v) => {
  if (!STORES.includes(n)) return true;
  if (n === 'settings' && v && typeof v === 'object') { const cur = store.read('settings', {}); MAIN_OWNED.forEach(k => { if (cur[k] !== undefined) v[k] = cur[k]; else delete v[k]; }); }
  store.write(n, v);
  if (n === 'settings') setImmediate(() => { try { display.sync(); extras.applySystem(); } catch {} });
  return true;
});
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
// file pickers: make sure the window is up front and not "always on top", so the picker can never open hidden behind SKBox
const pickDlg = async opts => { let was = false; try { was = win.isAlwaysOnTop(); if (was) win.setAlwaysOnTop(false); win.show(); win.focus(); } catch {} try { return await dialog.showOpenDialog(win, opts); } finally { try { if (was) win.setAlwaysOnTop(true); win.focus(); } catch {} } };
ipcMain.handle('dialog:file', async (_e, kind) => {
  const filters = kind === 'zip' ? [{ name: 'Zip files', extensions: ['zip'] }] : kind === 'json' ? [{ name: 'SKBox setup', extensions: ['json'] }] : kind === 'image' ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] : [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk'] }, { name: 'All files', extensions: ['*'] }];
  try { const r = kind === 'folder' ? await pickDlg({ properties: ['openDirectory'] }) : await pickDlg({ properties: ['openFile'], filters }); return r.canceled ? null : r.filePaths[0]; } catch { return null; }
});
ipcMain.handle('dialog:files', async (_e, kind) => {   // several files at once, or a folder, for the file manager
  try { const r = kind === 'folder' ? await pickDlg({ properties: ['openDirectory'] }) : await pickDlg({ properties: ['openFile', 'multiSelections'] }); return r.canceled ? [] : r.filePaths; } catch { return []; }
});
const newCover = ext => path.join(COVER_DIR(), crypto.randomBytes(6).toString('hex') + (ext || '.jpg'));
// "fill" = portrait box art that fills the tile; "fit" = wide or square images shown whole on a blurred backdrop
function coverFit(file) { try { const z = nativeImage.createFromPath(file).getSize(); if (!z.width || !z.height) return 'fill'; return z.width / z.height <= 0.9 ? 'fill' : 'fit'; } catch { return 'fill'; } }
ipcMain.handle('cover:candidates', (_e, term) => covers.search(term).catch(() => []));
ipcMain.handle('cover:auto', async (_e, term) => { const dest = newCover('.jpg'); const r = await covers.auto(term, dest).catch(() => ({ ok: false })); return r.ok ? { ok: true, file: dest, fit: coverFit(dest), matched: r.matched, source: r.source } : { ok: false }; });
ipcMain.handle('cover:pick', async (_e, steamId) => { const dest = newCover('.jpg'); const r = await covers.download(steamId, dest).catch(() => ({ ok: false })); return r.ok ? { ok: true, file: dest, fit: coverFit(dest) } : { ok: false, error: r.error === 'offline' ? 'No internet connection.' : 'Could not download that one.' }; });
ipcMain.handle('cover:pickUrl', async (_e, url) => { const dest = newCover('.img'); const r = await covers.downloadUrl(String(url || '').trim(), dest); return r.ok ? { ok: true, file: dest, fit: coverFit(dest) } : { ok: false, error: r.error || 'Could not use that link.' }; });
ipcMain.handle('cover:copy', async (_e, src) => { try { const dest = newCover(path.extname(src) || '.jpg'); fs.mkdirSync(COVER_DIR(), { recursive: true }); fs.copyFileSync(src, dest); return { ok: true, file: dest, fit: coverFit(dest) }; } catch { return { ok: false }; } });
ipcMain.handle('cover:icon', async (_e, exe) => { try { if (!/^[a-z]:|^\\/i.test(exe)) return { ok: false }; const img = await app.getFileIcon(exe, { size: 'large' }); if (img.isEmpty()) return { ok: false }; const dest = newCover('.png'); fs.mkdirSync(COVER_DIR(), { recursive: true }); fs.writeFileSync(dest, img.toPNG()); return { ok: true, file: dest, fit: 'icon' }; } catch { return { ok: false }; } });
ipcMain.handle('cover:remove', (_e, f) => { try { if (f && path.dirname(f) === COVER_DIR()) fs.unlinkSync(f); } catch {} return true; });

// ================= running a game =================
function notify(title, body, force) { try { try { plus.logNotif(title, body); } catch {} if (!force && (store.read('settings', {}).notifications === false || plus.quiet())) return; new Notification({ title, body, silent: !!store.read('settings', {}).notifSilent }).show(); } catch {} }
let lastRemoteInput = Date.now(), remoteSince = Date.now(), lastLvl = 0, swTicks = 0, swTold = false;
const fitArgs = () => { const s = store.read('settings', {}); return { fit: ['auto', 'stretch', 'aspect'].includes(s.remoteFit) ? s.remoteFit : 'auto', taskbar: s.remoteTaskbar !== false }; };
const display = require('./lib/display').create({ store, isWin, notify });
const winApi = { list: winList, close: winClose, min: async a => { if (helper && helper.ready) helper.minimize(String(a.h)); return { ok: true }; }, front: async a => { if (helper && helper.ready) helper.restore(String(a.h)); return { ok: true }; }, cleanup: winCleanup };
const extras = require('./lib/extras').create({
  store, notify, isWin, display, wins: winApi, getGame: () => game, helper: () => helper, remoteLive: () => remoteLive, lastInput: () => lastRemoteInput, sessionSince: () => remoteSince, fitArgs,
  remoteState: () => remoteState(), newPin: () => { try { if (remote && remote.on_) remote.newPin(); } catch {} },
  remoteKick: why => { try { if (remote) remote.endSession(why); } catch {} },
  closeGame: async () => { if (game) await closeGameResult(); }, closeGameResult: () => closeGameResult(),
  launchApp: id => { let apps = store.read('apps', []); if (!Array.isArray(apps)) apps = apps.apps || []; const a = apps.find(x => x.id === id); if (a) launchApp(a).catch(() => {}); },
  lockPc: () => { if (isWin) execFile('rundll32.exe', ['user32.dll,LockWorkStation'], () => {}); },
  restartHelper: () => restartHelper(),
  diag: () => ['Helper lines: ' + (helperInfo.diag || []).join(' | '), 'Helper error: ' + (helperInfo.error || 'none')].join('\n')
});
const plus = require('./lib/plus').create({
  store, notify, backupDir: path.join(app.getPath('userData'), 'save-backups'), desktop: app.getPath('desktop'), launch: a => launchApp(a), busy: () => !!game, running: id => !!(game && game.id === id), remote: on => setRemote(on), lockPc: () => { if (isWin) execFile('rundll32.exe', ['user32.dll,LockWorkStation'], () => {}); },
  power: w => { const p = POWER[w]; if (p && isWin) execFile(p[0], p[1], { windowsHide: true }, () => {}); },
  runDetached: cmd => { try { const t = splitArgs(cmd); if (!t.length) return; if (/\.lnk$/i.test(t[0])) { shell.openPath(t[0]); return; } const c = spawn(t[0], t.slice(1), { cwd: path.dirname(t[0]), detached: true, stdio: 'ignore', windowsHide: true }); c.on('error', () => {}); c.unref(); } catch {} },
  copy: t => { try { require('electron').clipboard.writeText(t); } catch {} }, show: p => { try { shell.showItemInFolder(p); } catch {} }, metrics: () => app.getAppMetrics(),
  gpu: async () => { const i = await app.getGPUInfo('complete'); return (i && i.auxAttributes && (i.auxAttributes.glRenderer || '')) || ''; }
});
const roms = require('./lib/roms').create({
  store, emuDir: path.join(app.getPath('userData'), 'emulators'), progress: (id, p) => send('roms:progress', { id, p }),
  extract: (zip, dir) => new Promise((res, rej) => { if (!isWin) return rej(new Error('Windows only.')); const q = x => String(x).replace(/'/g, "''"); execFile('powershell', ['-NoProfile', '-Command', "Expand-Archive -LiteralPath '" + q(zip) + "' -DestinationPath '" + q(dir) + "' -Force"], { windowsHide: true }, e => (e ? rej(e) : res())); })
});
const gameinfo = require('./lib/gameinfo').create({ store, progress: (f, t) => send('info:progress', { found: f, total: t }) });
// SKServers (Minecraft server hosting) and the App Store.
let playit = null;   // made right after the servers; the servers tell it when they start and stop
const servers = require('./lib/servers').create({ store, dir: app.getPath('userData'), send, roots: { shots: path.join(app.getPath('pictures'), 'SKBox'), downloads: app.getPath('downloads'), desktop: app.getPath('desktop'), documents: app.getPath('documents'), data: app.getPath('userData') }, openPath: p => shell.openPath(p), copy: t => { try { require('electron').clipboard.writeText(t); } catch {} }, desktop: () => app.getPath('desktop'),
  resizeIcon: async f => { const img = nativeImage.createFromPath(String(f)); if (img.isEmpty()) return null; const sz = img.getSize(), side = Math.min(sz.width, sz.height), sq = img.crop({ x: Math.floor((sz.width - side) / 2), y: Math.floor((sz.height - side) / 2), width: side, height: side }); return sq.resize({ width: 64, height: 64, quality: 'best' }).toPNG(); },   // Minecraft wants a 64x64 square PNG
  onState: v => { if (playit) playit.onServer(v); },
  notify: (t, b) => { try { if (Notification.isSupported()) new Notification({ title: t, body: b }).show(); } catch {} } });
playit = require('./lib/playit').create({ store, dir: app.getPath('userData'), version: app.getVersion(), send, openExternal: u => shell.openExternal(u), servers: () => servers._.list().list, getServer: id => servers._.list().list.find(x => x.id === id), setFlag: (id, v) => { servers.run('sksSet', { id, playit: v }); } });
const appstore = require('./lib/appstore').create({ store, progress: p => send('store:progress', p), openExternal: u => shell.openExternal(u) });
const party = require('./lib/party').create({ BrowserWindow, ipcMain, preload: path.join(__dirname, 'partyPreload.js'), page: RENDERER('party/engine.html'), broadcast: (ch, p) => send(ch, p), settings: () => store.read('settings', {}),
  notify: (t, b) => { try { if (store.read('settings', {}).partyNotify !== false && Notification.isSupported()) new Notification({ title: t, body: b }).show(); } catch {} } });
ipcMain.handle('party:cmd', (_e, c, a) => party.cmd(String(c || ''), a)); ipcMain.handle('party:get', () => party.get());
app.on('will-quit', () => { party.close(); try { playit.stop(); } catch {} });
const setupMod = require('./lib/setup').create({ store, version: app.getVersion(), desktop: () => app.getPath('desktop') });
let serversQuitting = false;
app.on('before-quit', e => { if (serversQuitting || !servers.anyRunning()) return; e.preventDefault(); serversQuitting = true; servers.stopAll(20000).finally(() => app.quit()); });   // let the servers save their worlds first
ipcMain.handle('extras:do', async (_e, n, a) => { n = String(n || ''); let r = await plus.run(n, a); if (r === null) r = await roms.run(n, a); if (r === null) r = await gameinfo.run(n, a); if (r === null) r = await servers.run(n, a); if (r === null) r = await playit.run(n, a); if (r === null) r = await appstore.run(n, a); if (r === null) r = await setupMod.run(n, a); return r !== null ? r : extras.run(n, a); });
// The main SKBox window must not react to the controller while the SK menu is in front.
function lockUI() { try { if (win && !win.isDestroyed()) win.webContents.send('input-lock', !!overlayOpen); if (helper && helper.ready) helper.padIn(padTest || overlayOpen); } catch {} }
const splitArgs = s => (String(s || '').match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, ''));
function applyCompat(exe) { // old-game fixes: Windows compatibility flags for this one program (current user only). Fullscreen optimizations stay ON so games can be streamed.
  if (!isWin) return;
  execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers', '/v', exe, '/t', 'REG_SZ', '/d', '~ WIN7RTM HIGHDPIAWARE', '/f'], { windowsHide: true }, () => {});
}
// Windowed fullscreen for every game: (1) remove the "disable fullscreen optimizations" flag so Windows turns exclusive fullscreen into a capturable
// borderless-style mode, and (2) switch on Windows' "optimizations for windowed games". Both are current-user settings only.
function prepWindowedFs(exe) {
  if (!isWin) return;
  const LAY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
  if (/\.exe$/i.test(exe)) execFile('reg', ['query', LAY, '/v', exe], { windowsHide: true }, (err, out) => {
    if (err || !/DISABLEDXMAXIMIZEDWINDOWEDMODE/.test(out || '')) return;
    const m = /REG_SZ\s+(.*)$/m.exec(out); if (!m) return;
    const flags = m[1].replace(/\s*DISABLEDXMAXIMIZEDWINDOWEDMODE/g, '').trim();
    execFile('reg', flags && flags !== '~' ? ['add', LAY, '/v', exe, '/t', 'REG_SZ', '/d', flags, '/f'] : ['delete', LAY, '/v', exe, '/f'], { windowsHide: true }, () => {});
  });
  const DX = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
  execFile('reg', ['query', DX, '/v', 'DirectXUserGlobalSettings'], { windowsHide: true }, (err, out) => {
    const m = !err && /REG_SZ\s+(.*)$/m.exec(out || ''), cur = m ? m[1].trim() : '';
    if (/SwapEffectUpgradeEnable=1/.test(cur)) return;
    const val = (cur.replace(/SwapEffectUpgradeEnable=\d;?/g, '').replace(/;?\s*$/, '') + (cur ? ';' : '') + 'SwapEffectUpgradeEnable=1;').replace(/^;/, '');
    execFile('reg', ['add', DX, '/v', 'DirectXUserGlobalSettings', '/t', 'REG_SZ', '/d', val, '/f'], { windowsHide: true }, () => {});
  });
}
// Every game starts in windowed fullscreen (borderless) unless the person turned that off, or set this one app to 'Leave it alone'.
// Windowing is applied by the helper ONLY while a Remote play player is connected (see helper.remote). Otherwise games are left exactly as they are.
let remoteLive = false;
const EMU_RE = /(^|[\\/])(cemu|yuzu|suyu|sudachi|ryujinx|citra|lime3ds|azahar|rpcs3|dolphin|pcsx2|duckstation|ppsspp|xemu|xenia[\w-]*|melonds|mgba|vita3k|shadps4|redream|flycast|bsnes|snes9x)[^\\/]*\.exe$/i;
const EMU_LIB = /(cemu|yuzu|suyu|sudachi|ryujinx|citra|lime3ds|azahar|rpcs3|dolphin|pcsx2|duckstation|xemu)/i;
// emulators get a clean full-screen window by themselves. 'emuw' = wait until a game is really running (the library window keeps its menu so you can load a game).
function emuMode(target, a) { const s = store.read('settings', {}); if (s.emuMax === false || s.emuStyle === 'own' || (a && a.fs === 'off') || !EMU_RE.test(target)) return ''; const hasGame = String((a && a.args) || '').replace(/(^|\s)-{1,2}(f|fullscreen|fs)\b/gi, '').trim().length > 0; return EMU_LIB.test(path.basename(target)) && !hasGame ? 'emuw' : 'emu'; }
// Cemu's own -f flag is real exclusive-style fullscreen, which Remote play cannot capture. So never pass it: the helper makes Cemu a
// borderless full-screen window instead (same look, streamable). Any -f / --fullscreen is removed unless "Cemu's own fullscreen" is chosen in Extras.
function emuArgs(target, args) {
  const s = store.read('settings', {}); args = String(args || '');
  if (s.emuMax === false || !/(^|[\\/])cemu[^\\/]*\.exe$/i.test(target)) return args;
  if (s.emuStyle === 'own') return args.trim() && !/(^|\s)(-f|--fullscreen)(\s|$)/i.test(args) ? args + ' -f' : args;   // the person chose Cemu's own fullscreen
  return args.replace(/(^|\s)(-f|--fullscreen)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
}
function gameMode(m) { m = m || 'auto'; if (m === 'off') return 'off'; if (store.read('settings', {}).gameWindow === 'off') return 'off'; return 'auto'; }
function setRemoteLive(on) { remoteLive = !!on; if (on) { lastRemoteInput = remoteSince = Date.now(); lastLvl = 0; swTicks = 0; swTold = false; } const fa = fitArgs(); if (helper && helper.ready) { helper.remote(on && store.read('settings', {}).gameWindow !== 'off', fa.fit, fa.taskbar); if (on && game && game.hwnd) setTimeout(() => helper.winFit(game && game.hwnd), 1500); } if (on && game && game.exe && store.read('settings', {}).gameWindow !== 'off') prepWindowedFs(game.exe); }
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
const alive = p => { try { process.kill(p, 0); return true; } catch { return false; } };
const waitDead = async (pids, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (!pids.some(alive)) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
const taskkill = pid => new Promise(res => execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => res()));
const taskkillE = pid => new Promise(res => execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (e, o, er) => res(String(er || o || ''))));
let killDenied = false;
const GENERIC_EXE = /^(cmd|powershell|pwsh|explorer|java|javaw|python|pythonw|node|wscript|conhost)\.exe$/i;
// Close the game: ask nicely (so it can save), then end every process that still belongs to it, then the program by name. Reports if Windows refuses.
async function killGame() {
  killDenied = false; if (!game || !isWin) return false;
  const force = store.read('settings', {}).closeMode === 'force', exeName = path.basename(String(game.exe || '')).toLowerCase(), gl = String(game.exe || '').toLowerCase();
  const pidsNow = () => [...new Set([game && game.pid, game && game.wpid].filter(x => x > 0))];
  const mine = async () => { const l = helper && helper.ready ? await listWins() : []; const ps = new Set(pidsNow()); return l.filter(w => ps.has(w.pid) || (gl && String(w.p).toLowerCase() === gl)); };
  let wins = await mine(); const found = pidsNow().length > 0 || wins.length > 0 || !!game.hwnd;
  if (!force && helper && helper.ready) {
    const hs = new Set(wins.map(w => w.h)); if (game.hwnd) hs.add(String(game.hwnd)); hs.forEach(hw => helper.closeWindow(hw));
    for (let i = 0; i < 8; i++) { await sleep(500); if (!pidsNow().some(alive) && !(await mine()).length) break; }
  }
  wins = await mine(); const kp = new Set([...pidsNow().filter(alive), ...wins.map(w => w.pid)]);
  await Promise.all([...kp].map(taskkillE)); await sleep(400);
  let left = await mine();
  if (left.length && exeName.endsWith('.exe') && !GENERIC_EXE.test(exeName)) { await new Promise(res => execFile('taskkill', ['/IM', exeName, '/F'], { windowsHide: true }, () => res())); await sleep(400); left = await mine(); }
  if (left.length) killDenied = true;
  return found;
}
async function closeGameResult() {
  if (!game) return { ok: false }; const name = game.name, found = await killGame();
  if (killDenied) return { ok: false, name, error: 'Windows would not let SKBox close it. It runs as administrator. Start SKBox as administrator, or close it yourself.' };
  endGame(); return { ok: true, found, name };
}
// ---- Settings > Windows opened apps ----
function listWins() {
  return new Promise(res => {
    if (!helper || !helper.ready) return res([]);
    const f = a => { clearTimeout(t); res(Array.isArray(a) ? a : []); }, t = setTimeout(() => { helper.off('wins', f); res([]); }, 3000);
    helper.once('wins', f); helper.listWins();
  });
}
const ownPids = () => new Set([process.pid].concat(app.getAppMetrics().map(m => m.pid)));
const PROTECTED_EXE = ['explorer.exe'];
async function winList() {
  if (!isWin) return { ok: false, error: 'Only on Windows.' };
  if (!helper || !helper.ready) return { ok: false, error: 'The helper is not running yet. Try Restart helper in Extras.' };
  const own = ownPids(), s = store.read('settings', {});
  const gp = new Set([game && game.pid, game && game.wpid].filter(x => x > 0)), gx = game ? String(game.exe).toLowerCase() : '';
  let l = (await listWins()).filter(w => !own.has(w.pid));
  if (s.winHideSys !== false) l = l.filter(w => !/^(Program Manager|Windows Input Experience|Microsoft Text Input Application)$/.test(w.t));
  l = l.map(w => ({ h: w.h, pid: w.pid, n: w.n, t: w.t, m: w.m, min: !!w.min, game: gp.has(w.pid) || (!!gx && String(w.p).toLowerCase() === gx), prot: PROTECTED_EXE.includes(String(w.n).toLowerCase()) }));
  l.sort(s.winSort === 'mem' ? (a, b) => b.m - a.m : (a, b) => String(a.n || a.t).localeCompare(String(b.n || b.t)) || String(a.t).localeCompare(String(b.t)));
  return { ok: true, wins: l, game: game ? game.name : '' };
}
async function winClose(a) {
  const h = String(a && a.h), pid = (a && a.pid) | 0; if (!/^-?\d+$/.test(h) || !helper || !helper.ready) return { ok: false, error: 'The helper is not running.' };
  if (ownPids().has(pid)) return { ok: false, error: 'That is SKBox itself.' };
  const w0 = (await listWins()).find(x => x.h === h), prot = !!w0 && PROTECTED_EXE.includes(String(w0.n).toLowerCase());
  if (!a.force) {
    helper.closeWindow(h); await sleep(2500);
    const l = await listWins(); if (!l.some(x => x.h === h)) return { ok: true, state: 'closed' };
    if (prot) return { ok: false, error: 'It did not close. It may be asking you something.' };
    if (l.filter(x => x.pid === pid).length > 1) return { ok: false, error: 'This app did not close that window and has others open. Use Force close to end the whole app.' };
  }
  if (prot) return { ok: false, error: 'Windows Explorer cannot be force closed.' };
  const r = await taskkillE(pid); await sleep(500);
  if (!(await listWins()).some(x => x.h === h)) return { ok: true, state: 'forced' };
  return { ok: false, error: /denied/i.test(r) ? 'Windows will not let SKBox end this app. It runs as administrator. Start SKBox as administrator to close it.' : 'It is still open.' };
}
async function winCleanup() {
  const r = await winList(); if (!r.ok) return r; let n = 0;
  for (const w of r.wins) { if (w.game || w.prot) continue; helper.closeWindow(w.h); n++; }
  return { ok: true, n };
}
function restartHelper() { try { helper && helper.stop(); } catch {} helper = null; startHelper(); }
function statsTouch(id, ms) { if (!id) return; const st = store.read('stats', {}), x = st[id] || (st[id] = { last: 0, ms: 0, n: 0 }); x.last = Date.now(); if (ms) { x.ms += ms; x.best = Math.max(x.best || 0, ms); } else x.n++; store.write('stats', st); }
function endGame() {
  if (!game) return; try { stopGameWatchers(game); } catch {} try { statsTouch(game.id, Math.max(0, Date.now() - game.startedAt)); } catch {} try { extras.onGameEnd(game.name, Date.now() - game.startedAt); } catch {} try { const g0 = game, ms0 = Date.now() - game.startedAt; plus.onGameEnd(g0, ms0); plus.post(g0.app); plus.restoreProfile(); plus.after(g0, ms0, g0.app); plus.checkMilestones(); try { if (g0.app && g0.app.saves && g0.app.saves.onClose) plus.backupSaves(g0.app, 'close'); } catch {} const nx = plus.queuePeek(); if (nx && store.read('settings', {}).queuePrompt !== false && !plus.pending()) setTimeout(() => send('queue:next', nx), 2500); } catch {} game = null; closeBackdrop(); closeOverlay(false); if (helper) helper.unwatch();
  send('game:state', null); comeBack();
}
ipcMain.handle('game:state', () => gameState());
ipcMain.handle('stats:touch', (_e, id) => { statsTouch(String(id || '').slice(0, 60), 0); return true; });
ipcMain.handle('game:resume', () => { if (!game) return false; hideMusic(false); closeOverlay(false); stepAside(); if (helper && game.hwnd) helper.restore(game.hwnd); return true; });
ipcMain.handle('game:close', () => closeGameResult());
// A .lnk shortcut is opened through Windows, which hides the real program from SKBox (no process to follow, Cemu not recognised, no full screen).
// So read the shortcut and start its target directly, with the shortcut's own arguments and "Start in" folder.
const winwatch = require('./lib/winwatch');
// Safety net for emulators: if the helper has not fitted the window shortly after the game starts, SKBox does it (and keeps it fitted).
function startEmuFit(g) {
  if (!g || g.emuProc || !isWin) return; const pid = g.wpid || g.pid; if (!pid) return;
  g.emuProc = winwatch.emuFit(pid, () => { if (!g.emuNoted) { g.emuNoted = true; try { notify('SKBox', 'Fitted the emulator window so Remote play can see it.'); } catch {} } });
}
function startGameWatchers(g) {
  if (!isWin || !g) return;
  if (store.read('settings', {}).padWatch !== false) g.padProc = winwatch.padWatch(() => { try { toggleOverlay(); } catch {} });
  if (g.mode === 'emu') g.emuTimer = setTimeout(() => { if (game === g && !g.emuFit) startEmuFit(g); }, 8000);
}
function stopGameWatchers(g) { if (!g) return; try { clearTimeout(g.emuTimer); } catch {} try { g.emuProc && g.emuProc.stop(); } catch {} try { g.padProc && g.padProc.stop(); } catch {} }
function resolveLnk(p) {
  try { if (process.platform === 'win32' && /\.lnk$/i.test(p)) { const l = shell.readShortcutLink(p); if (l && l.target && /\.exe$/i.test(l.target) && fs.existsSync(l.target)) return { target: l.target, args: l.args || '', cwd: l.cwd || '' }; } } catch {}
  return null;
}
async function launchApp(a) {
  let target = String(a.exe || '').trim().replace(/^"|"$/g, ''); let lnkCwd = '';
  const rl = resolveLnk(target); if (rl) { target = rl.target; lnkCwd = rl.cwd; a = Object.assign({}, a, { args: [rl.args, a.args].filter(Boolean).join(' ') }); }
  if (!target) return { ok: false, error: 'No file set for this app.' };
  if (game && !a.replace) return { ok: false, error: game.name + ' is already running.', running: true };
  if (game && a.replace) { await killGame(); endGame(); await new Promise(r => setTimeout(r, 600)); }
  try {
    const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
    if (!isUrl && !fs.existsSync(target)) return { ok: false, error: 'File not found: ' + target };
    game = { id: a.id, name: a.name || path.basename(target), exe: target, cover: a.cover || '', startedAt: Date.now(), pid: 0, wpid: 0, hwnd: '', mode: emuMode(target, a) || (store.read('settings', {}).emuMax === false && gameMode(a.fs) !== 'off' ? 'autox' : gameMode(a.fs)), noWindow: false, exited: false };
    game.app = a; try { plus.queueRemove(a.id); plus.applyProfile(a); } catch {}
    try { if (a.saves && a.saves.onLaunch) plus.backupSaves(a, 'launch'); } catch {}
    try { extras.onGameStart(); } catch {}
    statsTouch(a.id, 0);
    try { await plus.pre(a); } catch {}
    if (!isUrl && remoteLive && store.read('settings', {}).gameWindow !== 'off') prepWindowedFs(target);
    if (a.compat && !isUrl && /\.exe$/i.test(target)) applyCompat(target);
    showBackdrop(game); send('game:state', gameState());
    let child = null;
    if (isUrl) await shell.openExternal(target);
    else if (/\.exe$/i.test(target)) {
      child = spawn(target, splitArgs(emuArgs(target, a.args)), { cwd: (lnkCwd && fs.existsSync(lnkCwd)) ? lnkCwd : path.dirname(target), detached: true, stdio: 'ignore' });
      game.pid = child.pid || 0; try { startGameWatchers(game); } catch {}
      child.on('error', err => { const g = game; endGame(); win && win.webContents.send('launch-error', String(err.message || err)); });
      child.on('exit', () => { if (!game) return; game.exited = true; if (!helper || !helper.ready || game.noWindow) { if (Date.now() - game.startedAt > 15000) endGame(); } });
      child.unref();
    } else { const err = await shell.openPath(target); if (err) { endGame(); return { ok: false, error: err }; } }
    if (helper && helper.ready) helper.watch(game.pid, game.mode, process.pid);
    stepAside();
    return { ok: true };
  } catch (e) { endGame(); return { ok: false, error: String(e.message || e) }; }
}
ipcMain.handle('app:launch', (_e, a) => launchApp(a));
// Import apps: look through the Start Menu and Desktop shortcuts and offer the real programs behind them.
ipcMain.handle('apps:launchers', () => { try { const L = require('./lib/launchers'); return { ok: true, list: [].concat(L.scanSteam(), L.scanEpic()) }; } catch (e) { return { ok: false, list: [] }; } });
ipcMain.handle('apps:scan', () => {
  if (process.platform !== 'win32') return { ok: true, list: [] };
  const roots = [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), app.getPath('desktop'), 'C:\\Users\\Public\\Desktop'];
  const out = [], seen = new Set(), skip = /(uninstall|setup|installer|update|updater|crash|redist|vc_redist|helper|repair|readme|license|documentation|manual|support|website|release notes|changelog|configur|settings|command prompt|powershell|windows |administrative)/i;
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) { if (depth < 3) walk(f, depth + 1); } else if (/\.lnk$/i.test(e.name)) {
    const name = e.name.replace(/\.lnk$/i, ''); if (skip.test(name)) continue; const r = resolveLnk(f); if (!r || /^[a-z]:\\windows\\/i.test(r.target) || skip.test(path.basename(r.target, '.exe'))) continue;
    const key = (r.target + '|' + r.args).toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push({ name, target: r.target, args: r.args, emu: EMU_RE.test(r.target) }); } } };
  roots.forEach(r => walk(r, 0)); out.sort((a, b) => (b.emu - a.emu) || a.name.localeCompare(b.name));
  return { ok: true, list: out.slice(0, 300) };
});
function backdropFade() { try { if (backdrop && !backdrop.isDestroyed()) backdrop.webContents.executeJavaScript("document.body.classList.add('dim')").catch(() => {}); } catch {} }

// ================= helper (controller guide button, controller count, fullscreen) =================
const helperScript = () => path.join(__dirname, 'native', 'helper.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
function startHelper() {
  if (!isWin) return;
  helper = new HelperClient({ script: helperScript() });
  helper.on('guide', (k, hwnd, pid, fsFlag) => {
    helperInfo.lastGuide = Date.now(); helperInfo.guides++; helperInfo.lastKey = k;
    fgTarget = hwnd && hwnd !== '0' && pid && pid !== process.pid ? { hwnd, pid, fs: !!fsFlag, at: Date.now() } : null;
    toggleOverlay();
  });
  helper.on('diag', l => { helperInfo.diag.push(l); if (helperInfo.diag.length > 12) helperInfo.diag.shift(); });
  helper.on('ready', () => { helperInfo.error = ''; if (remoteLive) helper.remote(store.read('settings', {}).gameWindow !== 'off', fitArgs().fit, fitArgs().taskbar); if (overlayOpen) helper.padIn(true); });
  helper.on('padin', (slot, act) => {
    try { if (overlayWin && !overlayWin.isDestroyed() && (overlayOpen || overlayWin.isVisible())) overlayWin.webContents.send('padin', slot, act); else if (padTest) send('padtest', slot, act); } catch {}
  });
  helper.on('battery', (slot, type, level) => { batteries[slot] = { type, level }; try { plus.battery(slot, type, level); } catch {} send('battery', slot, type, level); });
  helper.on('pads', n => { padCount = n; send('pads', n); const pl = playersMeta(); if (n >= 2 && !pl[1] && game && !overlayOpen) openOverlay({ p2: true }); });
  helper.on('win', w => {
    if (!game) return; game.hwnd = w.hwnd; game.wpid = w.pid; send('game:state', gameState());
    if (isWin && store.read('settings', {}).boost && w.pid > 0 && game.boosted !== w.pid) { game.boosted = w.pid; execFile('powershell', ['-NoProfile', '-Command', '$p = Get-Process -Id ' + (w.pid | 0) + ' -ErrorAction SilentlyContinue; if ($p) { $p.PriorityClass = "High" }'], { windowsHide: true }, () => {}); }
  });
  helper.on('fs', t => { if (remoteLive && /^(remote|fail|exclusive|restored)/.test(String(t))) toClient({ t: 'notice', text: /^remote window/.test(t) ? 'Game window fitted.' : /^remote offset/.test(t) ? 'Game window fitted (bars pushed off-screen).' : /^fail/.test(t) ? 'Could not fit the game window. Press Fix the picture.' : 'Leaving exclusive fullscreen\u2026' }); backdropFade(); if (game) { game.fsOk = /^(already|borderless)/.test(String(t)); if (/^remote (window|offset)/.test(String(t))) game.emuFit = true; else if (/^fail/.test(String(t)) && game.mode === 'emu') startEmuFit(game); } send('fs', t); });
  helper.on('gone', () => endGame());
  helper.on('nowin', () => { if (game) { game.noWindow = true; if (game.exited || !game.pid) endGame(); } });
  helper.on('error-line', l => { helperInfo.error = String(l).slice(0, 200); try { fs.appendFileSync(path.join(app.getPath('userData'), 'helper.log'), new Date().toISOString() + ' ' + l + '\n'); } catch {} });
  helper.start();
}

// ================= SK overlay (the "guide" menu) =================
// While a game runs, the menu is a full opaque page by default: this works with every kind of fullscreen, because a game in
// exclusive fullscreen simply minimizes when the menu takes focus. "Over the game" (see-through) is optional.
function wantOpaque() { const m = store.read('settings', {}).ovMode || 'auto'; if (m === 'over') return false; if (m === 'full') return true; return !!game; }
function ensureOverlay() {
  const opaque = wantOpaque();
  if (overlayWin && !overlayWin.isDestroyed()) { if (opaque === overlayOpaque) return overlayWin; const old = overlayWin; overlayWin = null; try { old.destroy(); } catch {} }
  overlayOpaque = opaque;
  const d = displayNow();
  overlayWin = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, transparent: !opaque, frame: false, show: false, skipTaskbar: true, hasShadow: false, resizable: false, movable: false, alwaysOnTop: true, backgroundColor: opaque ? '#05060d' : '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, backgroundThrottling: false } });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.loadFile(RENDERER('overlay.html'), { query: { opaque: opaque ? '1' : '' } });
  const mine = overlayWin;
  mine.on('closed', () => { if (overlayWin === mine) { overlayWin = null; overlayOpen = false; } });
  return overlayWin;
}
function overlayStateObj(opts) {
  return { game: gameState(), players: playersMeta(), apps: store.read('apps', []), settings: store.read('settings', {}), pads: padCount, music: !!(musicWin && !musicWin.isDestroyed()), opts: opts || {}, helper: !!(helper && helper.ready), covers: COVER_DIR(), stats: store.read('stats', {}), batteries, opaque: overlayOpaque, remote: remoteState() };
}
function openOverlay(opts) {
  setTimeout(() => lockUI(), 0);
  const w = ensureOverlay(), d = displayNow(); try { w.setBounds(d.bounds); } catch {}
  overlayOpen = true; if (helper) helper.padIn(true);
  // Whatever fullscreen thing is in front (a game SKBox started, or any other): minimize it so even exclusive fullscreen lets go of the screen.
  overlayTarget = fgTarget && Date.now() - fgTarget.at < 1500 ? fgTarget : (game && game.hwnd ? { hwnd: String(game.hwnd), fs: true } : null); fgTarget = null;
  const moveAside = !!(overlayTarget && overlayTarget.fs && overlayOpaque && helper && helper.ready);
  if (moveAside) helper.minimize(overlayTarget.hwnd);
  const grab = () => { w.setAlwaysOnTop(true, 'screen-saver'); w.show(); w.moveTop(); w.focus(); try { w.webContents.focus(); } catch {} if (helper) { try { helper.focus(nativeHwnd(w)); } catch {} } };
  const show = () => { try { grab(); w.webContents.send('overlay:open', overlayStateObj(opts)); } catch {}
    // a fullscreen game (Cemu and other emulators especially) can keep the keyboard focus for a while: keep asking, both at the
    // window level and for the page inside it, until the menu really has it. Stops as soon as it has focus or the menu closes.
    let n = 0; const keep = setInterval(() => { try {
      if (!overlayOpen || !overlayWin || overlayWin.isDestroyed() || overlayWin !== w || ++n > 28) return clearInterval(keep);
      if (!w.isFocused() || !w.webContents.isFocused()) grab(); else if (n > 6) clearInterval(keep);
    } catch { clearInterval(keep); } }, 150); };
  const go = () => { if (w.webContents.isLoading()) w.webContents.once('did-finish-load', show); else show(); };
  if (moveAside) setTimeout(go, 220); else go();
}
function closeOverlay(refocus) {
  setTimeout(() => lockUI(), 50);
  if (helper) helper.padIn(padTest);
  if (!overlayWin || overlayWin.isDestroyed()) { overlayOpen = false; return; }
  if (!overlayOpen && !overlayWin.isVisible()) return;
  overlayOpen = false; try { overlayWin.webContents.send('overlay:close'); overlayWin.hide(); } catch {}
  const tgt = overlayTarget; overlayTarget = null;
  if (refocus) { if (musicVisible && musicWin && !musicWin.isDestroyed()) { musicWin.focus(); if (helper) helper.focus(nativeHwnd(musicWin)); } else if (tgt && helper && helper.ready) helper.restore(tgt.hwnd); else if (game && game.hwnd && helper) helper.focus(game.hwnd); }
}
let overlayStamp = 0;
// Both the native helper and the browser can see the same Xbox / PS press; ignore the second one.
function toggleOverlay() { if (Date.now() - overlayStamp < 700) return; overlayStamp = Date.now(); if (overlayOpen) closeOverlay(true); else openOverlay({}); }
ipcMain.handle('overlay:state', () => overlayStateObj({}));
ipcMain.handle('overlay:close', (_e, refocus) => { closeOverlay(refocus !== false); return true; });
ipcMain.handle('overlay:home', () => { closeOverlay(false); hideMusic(false); comeBack(); return true; });
ipcMain.handle('overlay:setPlayer', (_e, slot, u) => {
  const st = store.read('settings', {}); st.players = st.players || [null, null]; st.players[slot === 1 ? 1 : 0] = u || null; store.write('settings', st); send('players-changed'); return true;
});
async function takeShot(notify) {
  try {
    const wasOpen = overlayOpen, giveBack = wasOpen && overlayOpaque && !!game;
    if (giveBack) { closeOverlay(true); await new Promise(r => setTimeout(r, 1600)); } else { if (wasOpen && overlayWin) overlayWin.hide(); await new Promise(r => setTimeout(r, 350)); }
    const d = displayNow(), srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor } });
    const s = srcs.find(x => String(x.display_id) === String(d.id)) || srcs[0];
    const dir = path.join(app.getPath('pictures'), 'SKBox'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, (game ? game.name.replace(/[^\w\- ]+/g, '') + ' ' : 'SKBox ') + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png');
    fs.writeFileSync(file, s.thumbnail.toPNG());
    if (giveBack || notify) { try { new Notification({ title: 'Screenshot saved', body: 'Pictures\\SKBox', silent: true }).show(); } catch {} }
    else if (wasOpen && overlayWin) { overlayWin.show(); overlayWin.focus(); }
    return { ok: true, file };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
ipcMain.handle('overlay:screenshot', () => takeShot(false));

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

// ================= Xbox button: take it back from Game Bar =================
// Windows opens Xbox Game Bar when you press the controller's Xbox button, and then SKBox never sees it.
// This turns off just that one shortcut (Windows Settings > Gaming > Xbox Game Bar) for the current user.
function takeGuide(on) { if (!isWin) return; for (const v of ['UseNexusForGameBarEnabled', 'GamepadNexusChordEnabled']) execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\GameBar', '/v', v, '/t', 'REG_DWORD', '/d', on ? '0' : '1', '/f'], { windowsHide: true }, () => {}); }
ipcMain.handle('helper:status', () => ({ ready: !!(helper && helper.ready), error: helperInfo.error, lastGuide: helperInfo.lastGuide, guides: helperInfo.guides, lastKey: helperInfo.lastKey, diag: helperInfo.diag.slice(), pads: padCount, batteries, ovMode: store.read('settings', {}).ovMode || 'auto', takeGuide: store.read('settings', {}).takeGuide !== false }));
ipcMain.handle('helper:padTest', (_e, on) => { padTest = !!on; if (helper) helper.padIn(padTest || overlayOpen); return padTest; });
ipcMain.handle('helper:testMenu', () => { if (!overlayOpen) toggleOverlay(); return true; });
ipcMain.handle('sys:takeGuide', (_e, on) => { const s = store.read('settings', {}); s.takeGuide = !!on; store.write('settings', s); takeGuide(!!on); return !!on; });

// ================= performance stats, sleep timer, backup =================
let lastCpu = null;
function cpuPct() { let idle = 0, tot = 0; os.cpus().forEach(c => { for (const k in c.times) tot += c.times[k]; idle += c.times.idle; }); const r = lastCpu ? 1 - (idle - lastCpu.idle) / Math.max(1, tot - lastCpu.tot) : 0; lastCpu = { idle, tot }; return Math.round(Math.max(0, Math.min(1, r)) * 100); }
ipcMain.handle('sys:stats', () => ({ cpu: cpuPct(), ramUsed: os.totalmem() - os.freemem(), ramTotal: os.totalmem() }));
let sleepT = null;
async function fireTimer() {
  const a = sleepT && sleepT.action; sleepT = null; send('timer:fired', a);
  try { new Notification({ title: 'SKBox timer', body: a === 'closegame' ? 'Closing your game.' : a === 'shutdown' ? 'Shutting down.' : 'Going to sleep.' }).show(); } catch {}
  if (a === 'closegame') { if (game) await closeGameResult(); } else if (POWER[a] && isWin) setTimeout(() => execFile(POWER[a][0], POWER[a][1], { windowsHide: true }, () => {}), 4000);
}
const timerInfo = () => sleepT ? { at: sleepT.at, action: sleepT.action } : null;
ipcMain.handle('timer:get', () => timerInfo());
ipcMain.handle('timer:set', (_e, min, action) => {
  if (sleepT) { clearTimeout(sleepT.h); sleepT = null; }
  min = Math.round(Number(min) || 0); if (min < 1 || min > 600 || !['sleep', 'shutdown', 'closegame'].includes(action)) return null;
  sleepT = { at: Date.now() + min * 60000, action, h: setTimeout(fireTimer, min * 60000) }; return timerInfo();
});
ipcMain.handle('backup:export', async () => {
  try {
    const r = await dialog.showSaveDialog(win, { title: 'Save SKBox backup', defaultPath: path.join(app.getPath('documents'), 'SKBox-backup-' + new Date().toISOString().slice(0, 10) + '.json'), filters: [{ name: 'SKBox backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, JSON.stringify({ skbox: 1, version: app.getVersion(), settings: store.read('settings', {}), apps: store.read('apps', []), stats: store.read('stats', {}) }, null, 2));
    return { ok: true, file: r.filePath };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('backup:import', async () => {
  try {
    const r = await dialog.showOpenDialog(win, { title: 'Open SKBox backup', properties: ['openFile'], filters: [{ name: 'SKBox backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const raw = fs.readFileSync(r.filePaths[0], 'utf8'); if (raw.length > 5e6) return { ok: false, error: 'That file is too big to be an SKBox backup.' };
    const d = JSON.parse(raw);
    if (!d || d.skbox !== 1 || !d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings) || !Array.isArray(d.apps)) return { ok: false, error: 'That file is not an SKBox backup.' };
    const apps = d.apps.filter(a => a && typeof a === 'object' && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.exe === 'string').slice(0, 500);
    const stats = d.stats && typeof d.stats === 'object' && !Array.isArray(d.stats) ? d.stats : {};
    store.write('settings', d.settings); store.write('apps', apps); store.write('stats', stats);
    setTimeout(() => { try { win.webContents.reload(); } catch {} }, 400);
    return { ok: true, apps: apps.length };
  } catch (e) { return { ok: false, error: 'Could not read that file.' }; }
});

// ================= screenshots =================
const shotDir = () => path.join(app.getPath('pictures'), 'SKBox');
ipcMain.handle('shots:list', () => { try { return fs.readdirSync(shotDir()).filter(f => /\.png$/i.test(f)).map(f => { const p = path.join(shotDir(), f); return { file: p, name: f.replace(/\.png$/i, ''), t: fs.statSync(p).mtimeMs }; }).sort((a, b) => b.t - a.t).slice(0, 60); } catch { return []; } });
ipcMain.handle('shots:delete', (_e, f) => { try { if (f && path.dirname(f) === shotDir() && /\.png$/i.test(f)) { fs.unlinkSync(f); return true; } } catch {} return false; });
ipcMain.handle('shots:folder', () => { try { fs.mkdirSync(shotDir(), { recursive: true }); shell.openPath(shotDir()); return true; } catch { return false; } });

// ================= Bluetooth (inside SKBox) =================
const btScript = () => path.join(__dirname, 'native', 'bluetooth.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
let btBusy = false;
ipcMain.handle('bt:run', async (_e, action, id) => {
  if (!['list', 'scan', 'pair', 'unpair'].includes(action)) return { ok: false, error: 'Unknown action.' };
  if (btBusy) return { ok: false, error: 'Bluetooth is busy. Wait a moment.' };
  btBusy = true; try { return await bt.run(btScript(), action, id ? String(id) : '', { timeout: action === 'scan' ? 100000 : 90000 }); } finally { btBusy = false; }
});

// ================= wifi / system =================
ipcMain.handle('wifi:scan', async () => { try { return { ok: true, nets: await wifi.scan() }; } catch (e) { return { ok: false, error: 'Wi-Fi is not available on this PC.' }; } });
ipcMain.handle('wifi:status', async () => { try { return await wifi.status(); } catch { return { connected: false, ssid: '', signal: 0 }; } });
ipcMain.handle('wifi:connect', async (_e, a) => { try { return await wifi.connect(a.ssid, a.password || '', a.auth || ''); } catch (e) { return { ok: false, error: 'Could not connect.' }; } });
ipcMain.handle('wifi:disconnect', () => wifi.disconnect());
const POWER = { shutdown: ['shutdown', ['/s', '/t', '0']], restart: ['shutdown', ['/r', '/t', '0']], logoff: ['shutdown', ['/l']], sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']] };
ipcMain.handle('sys:power', (_e, what) => { if (what === 'quit') { app.quit(); return true; } const p = POWER[what]; if (p && isWin) execFile(p[0], p[1], { windowsHide: true }, () => {}); return !!p; });
ipcMain.handle('sys:openSettings', (_e, page) => { const ok = { bluetooth: 'ms-settings:bluetooth', sound: 'ms-settings:sound', wifi: 'ms-settings:network-wifi', devices: 'ms-settings:connecteddevices' }[page]; if (!ok) return false; stepAside(); shell.openExternal(ok); try { new Notification({ title: 'SKBox is still running', body: 'Press Ctrl+Shift+B or use the tray icon to come back.', silent: true }).show(); } catch {} return true; });
const sysVolume = dir => { if (!isWin) return false; const k = { up: 175, down: 174, mute: 173 }[dir]; if (!k) return false; execFile('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]' + k + ')'], { windowsHide: true }, () => {}); return true; };
ipcMain.handle('sys:volume', (_e, dir) => sysVolume(dir));
ipcMain.handle('sys:startup', (_e, on) => { if (isWin || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: !!on }); const s = store.read('settings', {}); s.startup = !!on; store.write('settings', s); return !!on; });
ipcMain.handle('sys:kiosk', (_e, on) => { kiosk = !!on; const s = store.read('settings', {}); s.windowed = !on; store.write('settings', s); try { win.setKiosk(kiosk); win.setFullScreen(kiosk); } catch {} return kiosk; });

// ================= Remote play (host) =================
// Off until the user turns it on in Settings > Remote play. While off there is no server, no open port and no broadcast reply.
let remote = null, remoteWin = null, remoteLoaded = null, remoteStats = null, mapper = null, mapperT = null, inCount = 0, inWindow = 0;
const answers = {};
let remoteSrc = 'screen', lastDisp = null, fixStage = 0, badCount = 0, fixBusy = false, fixTold = false, modeTick = 0, fixGame = '';
const remoteDisplay = () => { try { if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) { lastDisp = screen.getDisplayMatching(win.getBounds()); return lastDisp; } } catch {} return lastDisp || screen.getPrimaryDisplay(); };
setInterval(() => { try { if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) lastDisp = screen.getDisplayMatching(win.getBounds()); } catch {} }, 1500);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ---- SKBox Companion: the phone remote ----
let companion = null;
function companionInit() {
  if (companion) return companion;
  const { Companion } = require('./lib/companion'), appsNow = () => { const a = store.read('apps', []); return (Array.isArray(a) ? a : a.apps || []).filter(x => x && x.kind !== 'bapp'); };
  companion = new Companion({
    webFile: path.join(__dirname, '..', 'renderer', 'companion', 'index.html'), hin,
    state: () => ({ name: os.hostname(), game: game ? { id: game.id, name: game.name, startedAt: game.startedAt } : null, apps: appsNow().map(a => ({ id: a.id, name: a.name, cover: !!a.cover, kind: a.kind || '' })), queue: plus.queueList().map(q => ({ id: q.id, name: q.name })), power: store.read('settings', {}).companionPower === true }),
    launch: async id => { const a = appsNow().find(x => x.id === id); if (!a) return { ok: false, error: 'That app is gone.' }; if (game) return { ok: false, error: 'A game is already running.' }; return await launchApp(a); },
    close: () => closeGameResult(), menu: () => { try { toggleOverlay(); } catch {} },
    queue: async (op, id) => { if (op === 'add') return plus.queueAdd(id); if (op === 'remove') return plus.queueRemove(id); if (op === 'top') { const r = plus.queueAdd(id); if (!r.ok) return r; await plus.run('queueTop', id); return { ok: true }; } return { ok: false }; },
    volume: d => sysVolume(d), powerAllowed: () => store.read('settings', {}).companionPower === true,
    power: w => { if (w === 'lock') plus.lockPc(); else plus.power('sleep'); },
    coverFile: id => { const a = appsNow().find(x => x.id === id); if (!a || !a.cover) return ''; const f = path.resolve(String(a.cover).replace(/^file:\/\/\/?/i, '')); return f.startsWith(path.resolve(COVER_DIR()) + path.sep) && /\.(png|jpe?g|webp)$/i.test(f) && fs.existsSync(f) ? f : ''; },
    onChange: () => send('companion:state', companion.state())
  });
  return companion;
}
ipcMain.handle('companion:state', () => (companion ? companion.state() : { on: false, port: 0, pin: '', ips: [], devices: [] }));
ipcMain.handle('companion:set', async (_e, on) => { try { if (on) await companionInit().start(); else if (companion) companion.stop(); send('companion:state', companion ? companion.state() : { on: false }); return { ok: true, state: companion ? companion.state() : { on: false } }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('companion:pin', () => (companion ? companion.newPin() : null));
ipcMain.handle('companion:kick', () => (companion ? companion.kickAll() : null));
const REMOTE_DIR = () => path.join(__dirname, '..', 'renderer', 'remote');
const rset = () => { const s = store.read('settings', {}); return { trusted: s.remoteTrusted === true, audioKbps: +s.remoteAudioKbps || 192, quality: (() => { const q = ['instant', 'smooth', 'low', 'balanced', 'high', 'sharp'].includes(s.remoteQuality) ? s.remoteQuality : 'smooth'; return (s.remoteSmart !== false && q === 'smooth' && game && /^emu/.test(game.mode || '')) ? 'high' : q; })(), autoFix: s.remoteAutoFix !== false, autoQ: s.remoteAutoQ !== false, cursor: s.remoteCursor !== false, fps: +s.remoteFps || 0, res: +s.remoteRes || 0, kbps: +s.remoteKbps || 0, audio: s.remoteAudio !== false, pref: ['framerate', 'resolution', 'balanced'].includes(s.remotePref) ? s.remotePref : 'framerate', allowInput: s.remoteInput !== false, padMode: ['menus', 'keys', 'off'].includes(s.remotePad) ? s.remotePad : 'menus' }; };
const remoteState = () => Object.assign(remote ? remote.state() : { on: false, port: 0, pin: '', ips: [], client: null }, { stats: remoteStats, cfg: rset(), helper: !!(helper && helper.ready), supported: isWin });
const pushRemote = () => send('remote:state', remoteState());
const hin = line => { if (helper && helper.ready) helper.send(line); };
function ensureRemoteWin() {
  if (remoteWin && !remoteWin.isDestroyed()) return remoteLoaded;
  const ses = session.fromPartition('skremote');
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'display-capture'));
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      // Streams the screen SKBox is on (not wherever the mouse happens to be). If a game hides from screen capture,
      // the auto-fix switches to capturing the game window itself.
      if (remoteSrc === 'window' && game && game.hwnd) { const ws = await desktopCapturer.getSources({ types: ['window'] }); const w = ws.find(x => String(x.id).split(':')[1] === String(game.hwnd)); if (w) { cb({ video: w, audio: 'loopback' }); return; } }
      const d = remoteDisplay(), srcs = await desktopCapturer.getSources({ types: ['screen'] }); const s0 = srcs.find(x => String(x.display_id) === String(d.id)) || (srcs.length > 1 ? srcs.find(x => String(x.display_id) === String(screen.getPrimaryDisplay().id)) : null) || srcs[0]; cb(s0 ? { video: s0, audio: 'loopback' } : {});
    } catch { cb({}); }
  });
  remoteWin = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { preload: path.join(__dirname, 'remotePreload.js'), partition: 'skremote', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  remoteWin.on('closed', () => { remoteWin = null; remoteLoaded = null; });
  remoteLoaded = new Promise(res => remoteWin.webContents.once('did-finish-load', res)); remoteWin.loadFile(path.join(REMOTE_DIR(), 'host.html'));
  return remoteLoaded;
}
function startMapper() {
  stopMapper();
  mapper = new PadMapper({ key: (sc, ext, d) => hin('IK ' + sc + ' ' + ext + ' ' + d), mouse: (dx, dy) => hin('IM ' + dx + ' ' + dy), button: (b, d) => hin('IB ' + b + ' ' + d) });
  mapper.setMode(rset().padMode); mapperT = setInterval(() => { try { mapper && mapper.tick(Date.now()); } catch {} }, 16);
}
function stopMapper() { clearInterval(mapperT); mapperT = null; if (mapper) { try { mapper.reset(); } catch {} mapper = null; } }
async function remoteCreateSession({ sid, name, offer }) {
  remoteDisplay(); remoteSrc = 'screen'; fixStage = 0; badCount = 0; fixTold = false; modeTick = 0;
  await ensureRemoteWin(); const cfg = rset();
  const p = new Promise((resolve, reject) => { const t = setTimeout(() => { delete answers[sid]; reject(new Error('The PC took too long to start the stream.')); }, 20000); answers[sid] = { resolve: d => { clearTimeout(t); delete answers[sid]; d && d.error ? reject(new Error(d.error)) : resolve(d); } }; });
  remoteWin.webContents.executeJavaScript('window.__skhostOffer(' + JSON.stringify({ sid, offer, cfg }) + ')', true).catch(() => {});
  const ans = await p; startMapper(); remoteStats = null; setRemoteLive(true);
  try { notify('Remote play', name + ' connected to SKBox'); try { extras.onRemoteJoin(); } catch {}; } catch {}
  return ans;
}
const toClient = o => { try { if (remoteWin && !remoteWin.isDestroyed()) remoteWin.webContents.send('remote:toClient', JSON.stringify(o)); } catch {} };
let frozenCount = 0, frozenTold = false;
const recapture = () => (remoteWin && !remoteWin.isDestroyed() ? remoteWin.webContents.executeJavaScript('window.__skhostRecap && window.__skhostRecap()', true).catch(() => false) : Promise.resolve(false));
// Black or frozen picture while a game runs. Steps: capture the game window instead of the screen, then take the game out of
// exclusive fullscreen and capture the screen again, then try the window again, then tell the player what to change in the game.
async function remoteLadder(auto) {
  if (fixBusy || !game) return; if (auto && fixStage > 0) return; fixBusy = true; badCount = 0;
  try {
    if (fixStage === 0) { fixStage = 1; remoteSrc = 'window'; toClient({ t: 'notice', text: 'Fixing the picture (step 1)\u2026' }); await recapture(); }
    else if (fixStage === 1) { fixStage = 2; remoteSrc = 'screen'; toClient({ t: 'notice', text: 'Fixing the picture (step 2)\u2026 leaving exclusive fullscreen.' }); if (helper && helper.ready) helper.fixFullscreen(game && game.hwnd ? game.hwnd : 0); await sleep(3800); await recapture(); }
    else if (fixStage === 2) { fixStage = 3; remoteSrc = 'window'; toClient({ t: 'notice', text: 'Fixing the picture (step 3)\u2026' }); await recapture(); }
    else if (!fixTold) { fixTold = true; toClient({ t: 'notice', text: 'Still black. In the game\u2019s video settings, set Display mode to Borderless or Windowed.' }); }
  } finally { fixBusy = false; }
}
function remoteFixFs() {   // manual: fit the window, then the same ladder, from the SKBox menu
  if (helper && helper.ready) { helper.remote(true); helper.winFit(game && game.hwnd ? game.hwnd : 0); }
  if (!game) { toClient({ t: 'notice', text: 'Fitted the window in front. (No game started from SKBox.)' }); return; }
  fixStage = Math.min(fixStage, 1); fixTold = false; remoteLadder();
}
function remoteEndSession() {
  const wasLive = remoteLive; setRemoteLive(false); if (wasLive && game && store.read('settings', {}).gameTaskbar && helper && helper.ready) setTimeout(() => helper.taskbar(true), 400); if (wasLive) { try { extras.onRemoteLeft(); } catch {} }
  frozenCount = 0; frozenTold = false; fixStage = 0; badCount = 0; remoteSrc = 'screen'; stopMapper(); remoteStats = null; hin('IR');
  try { if (remoteWin && !remoteWin.isDestroyed()) remoteWin.webContents.send('remote:kick'); } catch {}
}
function remoteInit() {
  if (remote) return remote;
  remote = new RemoteHost({ name: os.hostname(), version: app.getVersion(), trusted: () => store.read('settings', {}).remoteTrusted === true, webDir: REMOTE_DIR(), createSession: remoteCreateSession, endSession: () => remoteEndSession() });
  remote.on('state', pushRemote);
  remote.on('ended', (c, why) => { try { notify('Remote play', (c && c.name ? c.name + ' disconnected' : 'Disconnected')); } catch {} });
  return remote;
}
ipcMain.handle('remote:state', () => remoteState());
const setRemote = async on => {
  if (!isWin) return { ok: false, error: 'Remote play host needs Windows.' };
  try {
    if (on) await remoteInit().start(); else { if (remote) remote.stop(); if (remoteWin && !remoteWin.isDestroyed()) { try { remoteWin.destroy(); } catch {} } remoteWin = null; remoteLoaded = null; }
    pushRemote(); return { ok: true, state: remoteState() };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
};
ipcMain.handle('remote:set', (_e, on) => setRemote(on));
ipcMain.handle('remote:pin', () => { if (remote && remote.on_) remote.newPin(); return remoteState(); });
ipcMain.handle('remote:fix', () => { remoteFixFs(); return true; });
ipcMain.handle('remote:kick', () => { if (remote) remote.endSession('Disconnected from SKBox'); return remoteState(); });
ipcMain.handle('remote:cfg', (_e, patch) => {
  const s = store.read('settings', {}); patch = patch || {};
  if (['instant', 'smooth', 'low', 'balanced', 'high', 'sharp'].includes(patch.quality)) s.remoteQuality = patch.quality;
  if ([96, 128, 192, 256, 320].includes(+patch.audioKbps)) s.remoteAudioKbps = +patch.audioKbps;
  if (typeof patch.autoFix === 'boolean') s.remoteAutoFix = patch.autoFix;
  if (typeof patch.trusted === 'boolean') s.remoteTrusted = patch.trusted;
  if (typeof patch.allowInput === 'boolean') s.remoteInput = patch.allowInput;
  if (['menus', 'keys', 'off'].includes(patch.padMode)) { s.remotePad = patch.padMode; if (mapper) mapper.setMode(patch.padMode); }
  store.write('settings', s); pushRemote(); return remoteState();
});
const fromRemoteWin = e => remoteWin && !remoteWin.isDestroyed() && e.sender === remoteWin.webContents;
ipcMain.on('remote:answer', (e, sid, d) => { if (fromRemoteWin(e) && answers[sid]) answers[sid].resolve(d); });
ipcMain.on('remote:ended', (e, sid) => { if (fromRemoteWin(e) && remote) remote.sessionEnded(sid); });
ipcMain.on('remote:stats', (e, st) => { if (!fromRemoteWin(e) || !st || typeof st !== 'object') return;
  if (game && fixGame !== game.id) { fixGame = game.id; fixStage = 0; fixTold = false; remoteSrc = 'screen'; }
  const bad = !!game && !fixBusy && !!st.black;
  if (bad) { if (++badCount >= 4) { if (rset().autoFix) remoteLadder(true); else if (!frozenTold) { frozenTold = true; toClient({ t: 'notice', text: 'Picture black or frozen? Turn on \u201CFix fullscreen games automatically\u201D in SKBox Remote play settings.' }); } badCount = 0; } } else if (!fixBusy) badCount = 0;
  { const st2 = store.read('settings', {}), lv = st.lvl | 0;
    if (st2.remoteNotices !== false) { if (lv > lastLvl) toClient({ t: 'notice', text: 'Connection is weak: lowering quality to keep it smooth.' }); else if (lv < lastLvl) toClient({ t: 'notice', text: 'Connection recovered: quality raised.' }); }
    lastLvl = lv;
    if (st2.remoteEncWarn !== false && st.hw === false && (st.w | 0) > 0 && ++swTicks === 6 && !swTold) { swTold = true; toClient({ t: 'notice', text: 'This PC is encoding video on the CPU, which adds delay. Updating the graphics driver usually fixes it.' }); } }
  if (++modeTick % 3 === 1) toClient({ t: 'mode', game: !!game });
  remoteStats = { fps: st.fps | 0, kbps: st.kbps | 0, rtt: st.rtt | 0, codec: String(st.codec || '').slice(0, 12), w: st.w | 0, h: st.h | 0, limit: String(st.limit || '').slice(0, 12), hw: !!st.hw }; pushRemote(); });
ipcMain.on('remote:input', (e, raw) => {
  if (!fromRemoteWin(e) || !remote || !remote.session || remote.session.pending || typeof raw !== 'string' || raw.length > 600) return;
  lastRemoteInput = Date.now(); const cfg = rset(); if (!cfg.allowInput || !helper || !helper.ready) return;
  const now = Date.now(); if (now - inWindow > 1000) { inWindow = now; inCount = 0; } if (++inCount > 3000) return;   // flood guard
  let m; try { m = JSON.parse(raw); } catch { return; } if (!m || typeof m.t !== 'string') return;
  const I = v => Math.round(+v) || 0, cl = (v, a, b) => Math.max(a, Math.min(b, I(v)));
  switch (m.t) {
    case 'ma': hin('IA ' + cl(+m.x * 65535, 0, 65535) + ' ' + cl(+m.y * 65535, 0, 65535)); break;
    case 'mm': hin('IM ' + cl(m.dx, -2000, 2000) + ' ' + cl(m.dy, -2000, 2000)); break;
    case 'mb': hin('IB ' + cl(m.b, 0, 4) + ' ' + (m.d ? 1 : 0)); break;
    case 'mw': hin('IW ' + cl(m.dy, -2400, 2400)); break;
    case 'mh': hin('IH ' + cl(m.dx, -2400, 2400)); break;
    case 'k': { const sc = I(m.sc); if (sc > 0 && sc < 0x80) hin('IK ' + sc + ' ' + (m.ext ? 1 : 0) + ' ' + (m.d ? 1 : 0)); break; }
    case 'ra': hin('IR'); if (mapper) mapper.reset(); break;
    case 'fixfs': remoteFixFs(); break;
    case 'p': if (mapper && cfg.padMode !== 'off') mapper.frame(m); break;
  }
});
app.on('before-quit', () => { try { stopGameWatchers(game); } catch {} try { remote && remote.stop(); } catch {} try { companion && companion.stop(); } catch {} });

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
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion');
app.whenReady().then(() => { try { const raw = store.read('apps', []), list = Array.isArray(raw) ? raw : (raw.apps || []), keep = list.filter(a => a && a.kind !== 'bapp'); if (keep.length !== list.length) { store.write('apps', Array.isArray(raw) ? keep : Object.assign({}, raw, { apps: keep })); } } catch {} try { plus.recover(false); } catch {} try { servers.autoStart(); } catch {} setTimeout(() => { try { plus.weeklyReport(); plus.checkMilestones(); } catch {} }, 25000); setInterval(() => { plus.tick().catch(() => {}); }, 30000); });
app.whenReady().then(async () => {
  // Widevine (protected video: Netflix, Disney+, ...) comes with the castLabs Electron build. Wait for it before opening any window that might play video.
  try { const { components } = require('electron'); if (components && components.whenReady) await Promise.race([components.whenReady().catch(() => {}), new Promise(r => setTimeout(r, 30000))]); } catch (e) {}
  const st = store.read('settings', {});
  if (st.startup === undefined && (isWin || process.platform === 'darwin')) { app.setLoginItemSettings({ openAtLogin: true }); st.startup = true; store.write('settings', st); }
  if (st.takeGuide !== false) takeGuide(true);
  createWindow(); setupTray(); setupUpdates(); startHelper(); extras.start(); display.start();
  if (isWin && store.read('settings', {}).remoteAutoStart) setTimeout(async () => { try { await remoteInit().start(); pushRemote(); } catch {} }, 4000);
  globalShortcut.register('Control+Shift+B', comeBack);
  globalShortcut.register('Control+Shift+O', toggleOverlay);
  globalShortcut.register('Control+Shift+S', () => { takeShot(true); });
  const hk = (acc, fn) => { try { globalShortcut.register(acc, () => { if (store.read('settings', {}).hotkeysOn === false) return; fn(); }); } catch {} };
  hk('Control+Alt+Shift+V', () => { party.toggleMute(); });                                // mute / unmute your party microphone
  hk('Control+Alt+Shift+M', () => extras.run('minAll'));                                   // show the desktop
  hk('Control+Alt+Shift+T', () => extras.run('taskmgr'));                                  // Task Manager
  extras.hotkeys(globalShortcut); display.hotkeys(globalShortcut);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { helper && helper.stop(); } catch {} });
app.on('window-all-closed', () => app.quit());
