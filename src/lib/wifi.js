// Wi-Fi control through Windows' built-in netsh tool (English Windows).
const { execFile } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const run = args => new Promise((res, rej) => execFile('netsh', args, { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (e, so) => (e && !so) ? rej(e) : res(so || '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseNetworks(out) {
  const nets = []; let cur = null;
  String(out).split(/\r?\n/).forEach(l => {
    let m = l.match(/^SSID\s+\d+\s*:\s*(.*)$/);
    if (m) { cur = { ssid: m[1].trim(), auth: '', signal: 0 }; nets.push(cur); return; }
    if (!cur) return;
    m = l.match(/^\s*Authentication\s*:\s*(.*)$/); if (m) { cur.auth = m[1].trim(); return; }
    m = l.match(/^\s*Signal\s*:\s*(\d+)%/); if (m) cur.signal = Math.max(cur.signal, +m[1]);
  });
  const by = {};
  nets.forEach(n => { if (!n.ssid) return; if (!by[n.ssid] || by[n.ssid].signal < n.signal) by[n.ssid] = n; });
  return Object.values(by).map(n => ({ ...n, secured: !/^open$/i.test(n.auth) })).sort((a, b) => b.signal - a.signal);
}
function parseProfiles(out) {
  return String(out).split(/\r?\n/).map(l => l.match(/(?:All User Profile|User Profile)\s*:\s*(.*)$/)).filter(Boolean).map(m => m[1].trim());
}
function parseInterface(out) {
  const o = { connected: false, ssid: '', signal: 0, state: '' };
  String(out).split(/\r?\n/).forEach(l => {
    let m = l.match(/^\s*State\s*:\s*(.*)$/); if (m) o.state = m[1].trim();
    m = l.match(/^\s*SSID\s*:\s*(.*)$/); if (m) o.ssid = m[1].trim();
    m = l.match(/^\s*Signal\s*:\s*(\d+)%/); if (m) o.signal = +m[1];
  });
  o.connected = /^connected$/i.test(o.state);
  return o;
}
const esc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
function profileXml(ssid, password, auth) {
  const open = !password;
  const wpa3 = /wpa3/i.test(auth || '') && !/wpa2/i.test(auth || '');
  return '<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>' + esc(ssid) + '</name><SSIDConfig><SSID><name>' + esc(ssid) + '</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>' + (open ? 'open' : (wpa3 ? 'WPA3SAE' : 'WPA2PSK')) + '</authentication><encryption>' + (open ? 'none' : 'AES') + '</encryption><useOneX>false</useOneX></authEncryption>' + (open ? '' : '<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>' + esc(password) + '</keyMaterial></sharedKey>') + '</security></MSM></WLANProfile>';
}
async function scan() {
  try { await run(['wlan', 'show', 'networks']); } catch {}
  const out = await run(['wlan', 'show', 'networks', 'mode=bssid']);
  const known = parseProfiles(await run(['wlan', 'show', 'profiles']).catch(() => ''));
  return parseNetworks(out).map(n => ({ ...n, known: known.includes(n.ssid) }));
}
async function status() { return parseInterface(await run(['wlan', 'show', 'interfaces']).catch(() => '')); }
async function connect(ssid, password, auth) {
  const known = parseProfiles(await run(['wlan', 'show', 'profiles']).catch(() => ''));
  let added = false;
  if (password || !known.includes(ssid)) {
    const f = path.join(os.tmpdir(), 'skbox-wifi-' + Date.now() + '.xml');
    fs.writeFileSync(f, profileXml(ssid, password, auth));
    try { await run(['wlan', 'add', 'profile', 'filename=' + f, 'user=current']); added = true; } finally { try { fs.unlinkSync(f); } catch {} }
  }
  await run(['wlan', 'connect', 'name=' + ssid]).catch(() => {});
  for (let i = 0; i < 14; i++) {
    await sleep(1000);
    const st = await status();
    if (st.connected && st.ssid === ssid) return { ok: true };
  }
  if (added) await run(['wlan', 'delete', 'profile', 'name=' + ssid]).catch(() => {});
  return { ok: false, error: 'Could not connect. Check the password and try again.' };
}
async function disconnect() { await run(['wlan', 'disconnect']).catch(() => {}); return { ok: true }; }
module.exports = { scan, status, connect, disconnect, parseNetworks, parseProfiles, parseInterface, profileXml };
