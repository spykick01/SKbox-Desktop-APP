const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, safeStorage, Tray, Menu, Notification, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const wifi = require('./lib/wifi'), covers = require('./lib/covers');
const store = require('./lib/store').make(app.getPath('userData'));

const API_KEY = 'AIzaSyAm2A3omt2z1dnK2Z_TdwPk1GTYuYQYdUQ', PROJECT = 'sksmpmc-e4682';
const SITE_HOSTS = ['sksmpchat.netlify.app'];
const COVER_DIR = () => path.join(app.getPath('userData'), 'covers');
const isWin = process.platform === 'win32';

if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null, tray = null, kiosk = true;

function createWindow() {
  const st = store.read('settings', {});
  kiosk = !st.windowed;
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 900, minHeight: 560,
    fullscreen: kiosk, kiosk, frame: !kiosk ? true : false, backgroundColor: '#05060d', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, backgroundThrottling: true }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}
function comeBack() {
  if (!win) return;
  try { if (win.isMinimized()) win.restore(); win.setKiosk(kiosk); win.setFullScreen(kiosk); win.show(); win.focus(); win.webContents.send('returned'); } catch {}
}
function stepAside() { try { win.setAlwaysOnTop(false); win.setKiosk(false); win.setFullScreen(false); win.minimize(); } catch {} }

// web apps (SKchat / SKMusic) run inside <webview>; only our own site is allowed
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (ev, prefs, params) => {
    try { if (!SITE_HOSTS.includes(new URL(params.src).host)) { ev.preventDefault(); return; } } catch { ev.preventDefault(); return; }
    prefs.preload = path.join(__dirname, 'guestPreload.js');
    prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.sandbox = true;
  });
});

// ---- storage ----
const STORES = ['apps', 'settings'];
ipcMain.handle('store:get', (_e, n, d) => STORES.includes(n) ? store.read(n, d) : d);
ipcMain.handle('store:set', (_e, n, v) => { if (STORES.includes(n)) store.write(n, v); return true; });
ipcMain.handle('sys:info', () => ({ version: app.getVersion(), platform: process.platform, covers: COVER_DIR(), startup: isWin ? app.getLoginItemSettings().openAtLogin : false }));

// ---- apps ----
ipcMain.handle('dialog:file', async (_e, kind) => {
  const filters = kind === 'image' ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] : [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk'] }, { name: 'All files', extensions: ['*'] }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});
const splitArgs = s => (String(s || '').match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, ''));
ipcMain.handle('app:launch', async (_e, a) => {
  const target = String(a.exe || '').trim().replace(/^"|"$/g, '');
  if (!target) return { ok: false, error: 'No file set for this app.' };
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) { await shell.openExternal(target); stepAside(); notifyBack(); return { ok: true }; }
    if (!fs.existsSync(target)) return { ok: false, error: 'File not found: ' + target };
    if (/\.exe$/i.test(target)) {
      const child = spawn(target, splitArgs(a.args), { cwd: path.dirname(target), detached: true, stdio: 'ignore' });
      const t0 = Date.now();
      child.on('error', err => { comeBack(); win && win.webContents.send('launch-error', String(err.message || err)); });
      child.on('exit', () => { if (Date.now() - t0 > 15000) comeBack(); else notifyBack(); });
      child.unref();
    } else { const err = await shell.openPath(target); if (err) return { ok: false, error: err }; notifyBack(); }
    stepAside();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
function notifyBack() { try { new Notification({ title: 'SKBox is still running', body: 'Press Ctrl+Shift+B or use the tray icon to come back.', silent: true }).show(); } catch {} }
ipcMain.handle('cover:candidates', (_e, term) => covers.search(term).catch(() => []));
ipcMain.handle('cover:auto', async (_e, term) => {
  const id = crypto.randomBytes(6).toString('hex'), dest = path.join(COVER_DIR(), id + '.jpg');
  const r = await covers.auto(term, dest).catch(() => ({ ok: false }));
  return r.ok ? { ok: true, file: dest, portrait: r.portrait, matched: r.matched } : { ok: false };
});
ipcMain.handle('cover:pick', async (_e, steamId) => {
  const id = crypto.randomBytes(6).toString('hex'), dest = path.join(COVER_DIR(), id + '.jpg');
  const r = await covers.download(steamId, dest);
  return r.ok ? { ok: true, file: dest, portrait: r.portrait } : { ok: false };
});
ipcMain.handle('cover:copy', async (_e, src) => {
  try { const dest = path.join(COVER_DIR(), crypto.randomBytes(6).toString('hex') + path.extname(src)); fs.mkdirSync(COVER_DIR(), { recursive: true }); fs.copyFileSync(src, dest); return { ok: true, file: dest, portrait: true }; } catch { return { ok: false }; }
});
ipcMain.handle('cover:icon', async (_e, exe) => {
  try { if (!/^[a-z]:|^\\\\/i.test(exe)) return { ok: false }; const img = await app.getFileIcon(exe, { size: 'large' }); if (img.isEmpty()) return { ok: false };
    const dest = path.join(COVER_DIR(), crypto.randomBytes(6).toString('hex') + '.png'); fs.mkdirSync(COVER_DIR(), { recursive: true }); fs.writeFileSync(dest, img.toPNG()); return { ok: true, file: dest, icon: true }; } catch { return { ok: false }; }
});
ipcMain.handle('cover:remove', (_e, f) => { try { if (f && path.dirname(f) === COVER_DIR()) fs.unlinkSync(f); } catch {} return true; });

// ---- wifi ----
ipcMain.handle('wifi:scan', async () => { try { return { ok: true, nets: await wifi.scan() }; } catch (e) { return { ok: false, error: 'Wi-Fi is not available on this PC.' }; } });
ipcMain.handle('wifi:status', async () => { try { return await wifi.status(); } catch { return { connected: false, ssid: '', signal: 0 }; } });
ipcMain.handle('wifi:connect', async (_e, a) => { try { return await wifi.connect(a.ssid, a.password || '', a.auth || ''); } catch (e) { return { ok: false, error: 'Could not connect.' }; } });
ipcMain.handle('wifi:disconnect', () => wifi.disconnect());

// ---- system ----
const POWER = { shutdown: ['shutdown', ['/s', '/t', '0']], restart: ['shutdown', ['/r', '/t', '0']], logoff: ['shutdown', ['/l']], sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']] };
ipcMain.handle('sys:power', (_e, what) => { if (what === 'quit') { app.quit(); return true; } const p = POWER[what]; if (p && isWin) execFile(p[0], p[1], { windowsHide: true }, () => {}); return !!p; });
ipcMain.handle('sys:openSettings', (_e, page) => { const ok = { bluetooth: 'ms-settings:bluetooth', sound: 'ms-settings:sound', wifi: 'ms-settings:network-wifi', devices: 'ms-settings:connecteddevices' }[page]; if (!ok) return false; stepAside(); shell.openExternal(ok); notifyBack(); return true; });
ipcMain.handle('sys:volume', (_e, dir) => { if (!isWin) return false; const k = { up: 175, down: 174, mute: 173 }[dir]; if (!k) return false; execFile('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys([char]' + k + ')'], { windowsHide: true }, () => {}); return true; });
ipcMain.handle('sys:startup', (_e, on) => { if (isWin || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: !!on }); const s = store.read('settings', {}); s.startup = !!on; store.write('settings', s); return !!on; });
ipcMain.handle('sys:kiosk', (_e, on) => { kiosk = !!on; const s = store.read('settings', {}); s.windowed = !on; store.write('settings', s); try { win.setKiosk(kiosk); win.setFullScreen(kiosk); } catch {} return kiosk; });

// ---- SK accounts (profiles) via Firebase REST ----
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
const pub = p => ({ ...p.meta });
ipcMain.handle('auth:list', () => readProfiles().map(pub));
ipcMain.handle('auth:signin', async (_e, u, p) => {
  u = String(u || '').trim().toLowerCase();
  try { const meta = await loadProfile(u, p); const L = readProfiles().filter(x => x.meta.u !== u); L.push({ meta, pw: enc(p) }); store.write('profiles', L); return { ok: true, profile: meta }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('auth:refresh', async (_e, u) => {
  const L = readProfiles(), x = L.find(y => y.meta.u === u); if (!x) return null;
  try { x.meta = await loadProfile(u, dec(x.pw)); store.write('profiles', L); return x.meta; } catch { return x.meta; }
});
ipcMain.handle('auth:cred', (_e, u) => { const x = readProfiles().find(y => y.meta.u === u); return x ? { u, p: dec(x.pw) } : null; });
ipcMain.handle('auth:remove', (_e, u) => { store.write('profiles', readProfiles().filter(x => x.meta.u !== u)); return true; });

// ---- tray, shortcuts, updates ----
function setupTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 20, height: 20 });
    tray = new Tray(img); tray.setToolTip('SKBox');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open SKBox', click: comeBack }, { label: 'Exit SKBox', click: () => app.quit() }]));
    tray.on('click', comeBack);
  } catch {}
}
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', i => win && win.webContents.send('update-ready', i.version));
    autoUpdater.on('error', () => {});
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3 * 3600 * 1000);
    ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); return true; });
  } catch {}
}
app.on('second-instance', comeBack);
app.whenReady().then(() => {
  const st = store.read('settings', {});
  if (st.startup === undefined && (isWin || process.platform === 'darwin')) { app.setLoginItemSettings({ openAtLogin: true }); st.startup = true; store.write('settings', st); }
  createWindow(); setupTray(); setupUpdates();
  globalShortcut.register('Control+Shift+B', comeBack);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
