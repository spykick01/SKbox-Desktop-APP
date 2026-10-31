// SKBox Remote (player app for Mac and Windows). Finds SKBox PCs on the Wi-Fi and shows the shared client page.
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path'), dgram = require('dgram'), os = require('os');
const DISC_PORT = 47821;

// Let the PC connect straight to us (no .local name hiding) and keep video decoding fast.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function broadcasts() {
  const out = new Set(['255.255.255.255']); const n = os.networkInterfaces();
  for (const k in n) for (const a of n[k] || []) { if (a.family !== 'IPv4' || a.internal) continue; const ip = a.address.split('.').map(Number), m = a.netmask.split('.').map(Number); out.add(ip.map((x, i) => (x | (~m[i] & 255))).join('.')); }
  return [...out];
}
function discover(ms) {
  return new Promise(resolve => {
    const found = {}; const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => { try { s.close(); } catch (_) {} resolve(Object.values(found)); };
    s.on('error', done);
    s.on('message', (m, ri) => { try { const j = JSON.parse(m.toString()); if (j && j.app === 'skbox' && Number.isInteger(j.port)) found[ri.address + ':' + j.port] = { name: String(j.name || 'SKBox PC').slice(0, 40), ip: ri.address, port: j.port, busy: !!j.busy }; } catch (_) {} });
    s.bind(0, () => { try { s.setBroadcast(true); } catch (_) {} const buf = Buffer.from('SKBOX?'); broadcasts().forEach(b => { try { s.send(buf, DISC_PORT, b); } catch (_) {} }); setTimeout(() => { try { broadcasts().forEach(b => s.send(buf, DISC_PORT, b)); } catch (_) {} }, 500); setTimeout(done, ms || 1500); });
  });
}
ipcMain.handle('discover', () => discover(1500));
ipcMain.on('fs', (_e, on) => { try { if (win && !win.isDestroyed()) win.setFullScreen(!!on); } catch (_) {} });

let win = null;
function create() {
  win = new BrowserWindow({ width: 1280, height: 760, minWidth: 720, minHeight: 480, backgroundColor: '#05060d', title: 'SKBox Remote', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.loadFile(path.join(__dirname, 'web', 'client.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed', () => { win = null; });
}
app.whenReady().then(() => {
  // a small menu so Cmd+Q / Cmd+W / full screen work on a Mac without the shortcuts getting in the way of the game
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'SKBox Remote', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }, { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }] }]));
  create(); app.on('activate', () => { if (!win) create(); });
});
app.on('window-all-closed', () => app.quit());
