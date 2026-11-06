// Move SKBox to another PC: one file with settings, library, stats and collections. Secrets (PINs, tokens, passwords) never go in it.
const fs = require('fs'), path = require('path'), os = require('os');
const SECRET = /(^pin$|pin$|pincode|token|secret|passw|apikey|api_key|cookie|sessionid|hash$|salt$|^auth$)/i;   // keys ending in pin (remotePin) but not pinned / pinOrder
const KEEP = ['settings', 'apps', 'stats', 'daily', 'history'];   // store files that make up "my setup"
const VERSION = 1;

function scrub(v, depth) {   // drop anything that looks like a secret, at any depth
  depth = depth || 0; if (depth > 8) return undefined;
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (!SECRET.test(k)) { const x = scrub(v[k], depth + 1); if (x !== undefined) o[k] = x; } }); return o; }
  return v;
}
function create(ctx) {
  const desktop = () => ctx.desktop ? ctx.desktop() : path.join(os.homedir(), 'Desktop');
  const stamp = () => { const d = new Date(ctx.now ? ctx.now() : Date.now()), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); };
  const snapshot = () => { const data = {}; KEEP.forEach(k => { const v = ctx.store.read(k, null); if (v != null) data[k] = scrub(v); }); return { skbox: 'setup', version: VERSION, appVersion: ctx.version || '', made: new Date(ctx.now ? ctx.now() : Date.now()).toISOString(), data }; };
  function exportSetup() {
    try { const f = path.join(desktop(), 'SKBox-setup-' + stamp() + '.json'); fs.mkdirSync(desktop(), { recursive: true }); fs.writeFileSync(f, JSON.stringify(snapshot(), null, 1)); return { ok: true, file: f, name: path.basename(f) }; }
    catch (e) { return { ok: false, error: 'Could not save to the Desktop: ' + String((e && e.message) || e).slice(0, 100) }; }
  }
  function load(file) {
    let t; try { const st = fs.statSync(String(file || '')); if (!st.isFile() || st.size > 20 * 1048576) return { ok: false, error: 'That file is not a SKBox setup.' }; t = fs.readFileSync(file, 'utf8'); } catch { return { ok: false, error: 'Could not read that file.' }; }
    let j; try { j = JSON.parse(t); } catch { return { ok: false, error: 'That file is not a SKBox setup (it is not valid JSON).' }; }
    if (!j || j.skbox !== 'setup' || !j.data || typeof j.data !== 'object') return { ok: false, error: 'That file is not a SKBox setup.' };
    if (j.version > VERSION) return { ok: false, error: 'This setup was made by a newer SKBox. Update SKBox first.' };
    return { ok: true, j };
  }
  function preview(a) {
    const r = load(a && a.file); if (!r.ok) return r; const d = r.j.data, apps = Array.isArray(d.apps) ? d.apps : [], missing = apps.filter(x => x && x.exe && /^[a-z]:\\/i.test(x.exe) && !fs.existsSync(x.exe)).length;
    return { ok: true, summary: apps.length + ' apps and games' + (missing ? ' (' + missing + ' point to programs that are not on this PC yet, so they will need a new path)' : '') + ', ' + Object.keys((d.settings && d.settings.collections) || {}).length + ' collections, saved ' + String(r.j.made || '').slice(0, 10) + '.' };
  }
  function importSetup(a) {
    const r = load(a && a.file); if (!r.ok) return r; const d = r.j.data;
    try {   // keep a copy of the current setup first so nothing is lost
      const cur = snapshot(); fs.mkdirSync(desktop(), { recursive: true }); fs.writeFileSync(path.join(desktop(), 'SKBox-setup-BEFORE-IMPORT-' + stamp() + '.json'), JSON.stringify(cur, null, 1));
      KEEP.forEach(k => { if (d[k] == null) return; let v = d[k]; if (k === 'settings') { const own = ctx.store.read('settings', {}); const keepOwn = {}; Object.keys(own).forEach(x => { if (SECRET.test(x)) keepOwn[x] = own[x]; }); v = Object.assign({}, scrub(v), keepOwn); } if (k === 'apps' && !Array.isArray(v)) return; ctx.store.write(k, v); });
    } catch (e) { return { ok: false, error: 'The import did not work: ' + String((e && e.message) || e).slice(0, 100) }; }
    return { ok: true };
  }
  async function run(name, a) {
    if (typeof name !== 'string' || !name.startsWith('setup')) return null;
    switch (name) { case 'setupExport': return exportSetup(); case 'setupPreview': return preview(a); case 'setupImport': return importSetup(a); } return null;
  }
  return { run, _: { scrub, snapshot } };
}
module.exports = { create, scrub, SECRET };
