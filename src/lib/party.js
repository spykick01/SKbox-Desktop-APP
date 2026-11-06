// Main-process side of voice parties: owns the hidden engine window and relays state to the SKBox windows.
const ALLOWED = ['create', 'join', 'leave', 'mute', 'deaf', 'volume', 'master', 'name', 'chat', 'kick', 'lock', 'input', 'output', 'devices'];
const IDLE = { status: 'idle', code: '', host: false, locked: false, error: '', mic: 'unknown', inputId: '', outputId: '', master: 1, max: 8, chat: [], me: { id: '', name: '', muted: false, deaf: false, speaking: false }, members: [] };

function create(ctx) {
  let win = null, ready = null, state = null, seq = 0, idleT = null; const pend = new Map();
  const live = () => win && !win.isDestroyed();
  ctx.ipcMain.on('party:reply', (e, id, r) => { if (!live() || e.sender !== win.webContents) return; const f = pend.get(id); if (f) { pend.delete(id); f(r); } });
  ctx.ipcMain.on('party:evt', (e, s) => {
    if (!live() || e.sender !== win.webContents || !s || typeof s !== 'object') return;
    const prev = state; state = s; ctx.broadcast('party:state', s);
    if (prev && prev.status === 'in' && s.status === 'in' && ctx.notify) { const had = new Set(prev.members.map(m => m.id)); s.members.forEach(m => { if (!had.has(m.id)) ctx.notify('Party', m.name + ' joined your party'); }); }
    clearTimeout(idleT); if (s.status === 'idle') idleT = setTimeout(() => { if (state && state.status === 'idle') close(); }, 4000);   // let go of the microphone and the window
  });
  function ensure() {
    if (live()) return ready;
    win = new ctx.BrowserWindow({ show: false, width: 320, height: 200, skipTaskbar: true, webPreferences: { partition: 'skparty', preload: ctx.preload, contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
    win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    win.webContents.session.setPermissionCheckHandler((_wc, perm) => perm === 'media');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', e => e.preventDefault());
    ready = new Promise(res => win.webContents.once('did-finish-load', res)); win.loadFile(ctx.page);
    win.on('closed', () => { win = null; if (state && state.status !== 'idle') { state = null; ctx.broadcast('party:state', Object.assign({}, IDLE, { error: 'The voice engine stopped.' })); } else state = null; pend.forEach(f => f({ ok: false, error: 'The voice engine stopped.' })); pend.clear(); });
    return ready;
  }
  function close() { clearTimeout(idleT); if (live()) { try { win.destroy(); } catch (_) {} } win = null; }
  async function cmd(name, arg) {
    if (!ALLOWED.includes(name)) return { ok: false, error: 'Unknown command.' };
    if (!live() && (name === 'leave' || name === 'mute' || name === 'deaf')) return { ok: true };
    arg = Object.assign({}, arg || {}); if (name === 'create' || name === 'join') { const s = ctx.settings() || {}; arg.cfg = s.partyHost ? { host: s.partyHost, port: s.partyPort, path: s.partyPath, secure: s.partySecure !== false } : {}; arg.name = String(arg.name || s.partyName || 'Player').slice(0, 24); }
    await ensure(); clearTimeout(idleT);
    return new Promise(res => { const id = ++seq; pend.set(id, res); setTimeout(() => { if (pend.delete(id)) res({ ok: false, error: 'The voice engine did not answer.' }); }, 30000); try { win.webContents.send('party:cmd', id, name, arg); } catch (e) { pend.delete(id); res({ ok: false, error: 'The voice engine is not running.' }); } });
  }
  return { cmd, get: () => state || IDLE, toggleMute: () => (state && state.status === 'in' ? cmd('mute', { toggle: true }) : Promise.resolve({ ok: true })), active: () => !!(state && state.status === 'in'), close };
}
module.exports = { create, IDLE };
