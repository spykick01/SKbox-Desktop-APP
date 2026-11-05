// ROM library and emulator manager: finds your games by system, finds (or downloads) the emulators, and builds ready-to-launch entries.
const fs = require('fs'), path = require('path'), https = require('https'), http = require('http'), crypto = require('crypto');

const SYSTEMS = {
  wiiu: { name: 'Wii U', exts: ['.wua', '.wud', '.wux', '.rpx'], alias: ['wiiu', 'wii u', 'wii-u', 'cemu'], emus: ['cemu'] },
  dolphin: { name: 'GameCube / Wii', exts: ['.iso', '.gcm', '.gcz', '.rvz', '.wbfs', '.wad', '.ciso', '.dol'], alias: ['gamecube', 'game cube', 'gc', 'wii', 'dolphin'], emus: ['dolphin'] },
  switch: { name: 'Switch', exts: ['.nsp', '.xci', '.nca', '.nro'], alias: ['switch', 'nsw', 'yuzu', 'ryujinx'], emus: ['ryujinx'] },
  ps2: { name: 'PlayStation 2', exts: ['.iso', '.chd', '.bin', '.cso', '.gz'], alias: ['ps2', 'playstation 2', 'playstation2', 'pcsx2'], emus: ['pcsx2'] },
  ps1: { name: 'PlayStation', exts: ['.cue', '.chd', '.pbp', '.m3u', '.ecm', '.iso', '.bin'], alias: ['ps1', 'psx', 'psone', 'playstation', 'duckstation'], emus: ['duckstation'] },
  psp: { name: 'PSP', exts: ['.iso', '.cso', '.pbp'], alias: ['psp', 'ppsspp'], emus: ['ppsspp'] },
  n3ds: { name: 'Nintendo 3DS', exts: ['.3ds', '.cia', '.cxi', '.3dsx'], alias: ['3ds', 'n3ds', 'citra', 'lime3ds'], emus: ['lime3ds'] },
  nds: { name: 'Nintendo DS', exts: ['.nds', '.dsi'], alias: ['nds', 'ds', 'nintendo ds', 'melonds'], emus: ['melonds'] },
  gba: { name: 'Game Boy Advance', exts: ['.gba'], alias: ['gba', 'game boy advance', 'mgba'], emus: ['mgba'] }
};
const EMUS = {
  cemu: { name: 'Cemu', exe: ['Cemu.exe'], args: '-g "{rom}"', gh: { repo: 'cemu-project/Cemu', asset: /windows-x64.*\.zip$/i }, site: 'https://cemu.info' },
  dolphin: { name: 'Dolphin', exe: ['Dolphin.exe'], args: '-b -e "{rom}"', site: 'https://dolphin-emu.org/download/' },
  ryujinx: { name: 'Ryujinx', exe: ['Ryujinx.exe'], args: '"{rom}"', site: 'https://ryujinx.app' },
  pcsx2: { name: 'PCSX2', exe: ['pcsx2-qt.exe', 'pcsx2.exe'], args: '-batch -fullscreen -- "{rom}"', site: 'https://pcsx2.net/downloads' },
  duckstation: { name: 'DuckStation', exe: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-qt.exe'], args: '-batch -fullscreen -- "{rom}"', gh: { repo: 'stenzek/duckstation', asset: /windows-x64.*\.zip$/i }, site: 'https://www.duckstation.org' },
  ppsspp: { name: 'PPSSPP', exe: ['PPSSPPWindows64.exe', 'PPSSPPWindows.exe'], args: '"{rom}"', site: 'https://www.ppsspp.org/download' },
  lime3ds: { name: 'Lime3DS', exe: ['lime3ds-gui.exe', 'lime3ds.exe', 'citra-qt.exe'], args: '"{rom}"', site: 'https://github.com/Lime3DS/lime3ds-archive' },
  melonds: { name: 'melonDS', exe: ['melonDS.exe'], args: '"{rom}"', gh: { repo: 'melonDS-emu/melonDS', asset: /win.*x64.*\.zip$/i }, site: 'https://melonds.kuribo64.net' },
  mgba: { name: 'mGBA', exe: ['mGBA.exe'], args: '-f "{rom}"', site: 'https://mgba.io/downloads.html' }
};
const EXT = {}; Object.keys(SYSTEMS).forEach(id => SYSTEMS[id].exts.forEach(e => { (EXT[e] = EXT[e] || []).push(id); }));
const SKIP_DIR = /^(\$recycle\.bin|system volume information|windows|node_modules|\.git|saves?|savestates?|bios|screenshots?|cheats?|shaders?|textures?|mlc01|mods?|updates?|dlc)$/i;

// ---- naming ----
function cleanTitle(file) {
  let t = path.basename(file, path.extname(file)).replace(/_/g, ' ');
  t = t.replace(/\[[^\]]*\]/g, ' ').replace(/\((?:usa|europe|eur|japan|jpn|world|en|fr|de|es|it|rev[^)]*|v[\d.]+[^)]*|disc \d+[^)]*|\d{4}[^)]*|[a-z]{2}(?:,[a-z]{2})*)\)/gi, ' ').replace(/\bv\d+(\.\d+)+\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return t || path.basename(file, path.extname(file));
}
function systemFor(file, root) {
  const ext = path.extname(file).toLowerCase(), cands = EXT[ext] || []; if (!cands.length) return null; if (cands.length === 1) return { system: cands[0], ambiguous: [] };
  const rel = path.relative(root || path.parse(file).root, path.dirname(file)).split(/[\\/]/).reverse().concat(path.basename(root || '')).map(s => s.toLowerCase());   // nearest folder first
  for (const seg of rel) for (const id of cands) if (SYSTEMS[id].alias.some(a => seg === a || seg.replace(/[^a-z0-9]+/g, '') === a.replace(/[^a-z0-9]+/g, ''))) return { system: id, ambiguous: [] };
  return { system: cands[0], ambiguous: cands };
}

// ---- scanning ----
function scanRoms(roots, o) {
  o = Object.assign({ maxDepth: 6, maxFiles: 30000 }, o); const out = [], seen = new Set(); let n = 0;
  const add = (file, root, forceSys) => { const k = file.toLowerCase(); if (seen.has(k) || /["]/.test(file)) return; const s = forceSys ? { system: forceSys, ambiguous: [] } : systemFor(file, root); if (!s) return; seen.add(k); out.push({ rom: file, name: cleanTitle(file), system: s.system, ambiguous: s.ambiguous }); };
  const walk = (dir, root, depth) => {
    if (depth > o.maxDepth || n > o.maxFiles) return; let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = new Set(ents.map(e => e.name.toLowerCase()));
    // a Wii U game folder: code/<title>.rpx next to meta/ and content/
    if (names.has('code') && (names.has('meta') || names.has('content'))) { try { const rpx = fs.readdirSync(path.join(dir, ents.find(e => e.name.toLowerCase() === 'code').name)).find(f => /\.rpx$/i.test(f)); if (rpx) { const f = path.join(dir, ents.find(e => e.name.toLowerCase() === 'code').name, rpx); if (!seen.has(f.toLowerCase())) { seen.add(f.toLowerCase()); out.push({ rom: f, name: cleanTitle(dir + '.x'), system: 'wiiu', ambiguous: [] }); } return; } } catch {} }
    for (const e of ents) {
      if (++n > o.maxFiles) return; const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('.') && !SKIP_DIR.test(e.name)) walk(f, root, depth + 1); continue; }
      const ext = path.extname(e.name).toLowerCase(); if (!EXT[ext]) continue;
      if (ext === '.bin' && (names.has(e.name.toLowerCase().replace(/\.bin$/, '.cue')) || /\(track \d+\)/i.test(e.name))) continue;   // a disc image's data file, the .cue is the game
      if (ext === '.rpx' && /[\\/]code$/i.test(dir)) continue;
      add(f, root);
    }
  };
  (roots || []).forEach(r => { try { if (fs.statSync(r).isDirectory()) walk(r, r, 0); } catch {} });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- finding emulators ----
function findExe(dirs, names, maxDepth) {
  const want = names.map(n => n.toLowerCase()); let hit = '';
  const walk = (dir, d) => { if (hit || d > maxDepth) return; let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) if (!e.isDirectory() && want.includes(e.name.toLowerCase())) { hit = path.join(dir, e.name); return; }
    for (const e of ents) if (e.isDirectory() && !SKIP_DIR.test(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), d + 1); };
  for (const d of dirs) { walk(d, 0); if (hit) break; } return hit;
}
function defaultDirs(env, extra) {
  env = env || process.env; const h = env.USERPROFILE || '', d = [].concat(extra || []);
  ['C:\\Emulators', 'D:\\Emulators', 'E:\\Emulators', 'C:\\Games', 'D:\\Games', env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)'], h && path.join(h, 'Downloads'), h && path.join(h, 'Desktop'), h && path.join(h, 'Documents')].forEach(x => x && d.push(x));
  return Array.from(new Set(d.filter(x => { try { return fs.statSync(x).isDirectory(); } catch { return false; } })));
}
function findEmulators(dirs, depth) { const out = {}; Object.keys(EMUS).forEach(id => { const f = findExe(dirs, EMUS[id].exe, depth === undefined ? 3 : depth); if (f) out[id] = f; }); return out; }

// ---- entries ----
const idFor = rom => 'rom_' + crypto.createHash('sha1').update(rom.toLowerCase()).digest('hex').slice(0, 10);
function buildApp(entry, exe, now) { const emu = EMUS[(SYSTEMS[entry.system] || {}).emus && SYSTEMS[entry.system].emus[0]]; return { id: idFor(entry.rom), name: entry.name, exe, args: (emu ? emu.args : '"{rom}"').replace('{rom}', entry.rom), cover: '', added: now || Date.now(), rom: { path: entry.rom, system: entry.system } }; }
function describe(entries, emuPaths, haveApps) {
  const have = new Set((haveApps || []).filter(a => a && a.rom && a.rom.path).map(a => a.rom.path.toLowerCase()));
  const opt = (e, sys) => { const s = SYSTEMS[sys], eid = s.emus[0], exe = (emuPaths || {})[eid] || ''; return { system: sys, systemName: s.name, emu: eid, emuName: EMUS[eid].name, exe, ready: !!exe, app: exe ? buildApp({ rom: e.rom, name: e.name, system: sys }, exe) : null }; };
  return entries.map(e => { const options = (e.ambiguous.length ? e.ambiguous : [e.system]).map(s => opt(e, s)), cur = options.find(o => o.system === e.system) || options[0]; return Object.assign({}, e, cur, { options, have: have.has(e.rom.toLowerCase()) }); });
}

// ---- downloading emulators (GitHub releases) ----
function getJson(url, headers) { return new Promise((res, rej) => { const m = /^http:/i.test(url) ? http : https; m.get(url, { headers: Object.assign({ 'User-Agent': 'SKBox', Accept: 'application/vnd.github+json' }, headers || {}) }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error('Bad answer from the server.')); } }); }).on('error', rej); }); }
function download(url, dest, onProgress, hops) {
  return new Promise((res, rej) => { hops = hops || 0; if (hops > 5) return rej(new Error('Too many redirects.')); const m = /^http:/i.test(url) ? http : https;
    m.get(url, { headers: { 'User-Agent': 'SKBox' } }, r => { if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return res(download(new URL(r.headers.location, url).href, dest, onProgress, hops + 1)); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('Download failed (' + r.statusCode + ').')); } const total = +r.headers['content-length'] || 0; let got = 0; const f = fs.createWriteStream(dest);
      r.on('data', c => { got += c.length; if (onProgress && total) onProgress(Math.round(got / total * 100)); }); r.pipe(f); f.on('finish', () => f.close(() => res(dest))); f.on('error', rej); }).on('error', rej); });
}
const pickAsset = (assets, re) => (assets || []).find(a => re.test(a.name || '')) || null;

function create(ctx) {
  const S = () => ctx.store.read('settings', {}), save = s => ctx.store.write('settings', s), paths = () => Object.assign({}, S().emuPaths || {});
  const apps = () => { const a = ctx.store.read('apps', []); return Array.isArray(a) ? a : (a.apps || []); };
  const root = () => ctx.emuDir || path.join(require('os').tmpdir(), 'skbox-emus');
  const emuList = () => { const p = paths(), tags = S().emuTags || {}; return Object.keys(EMUS).map(id => ({ id, name: EMUS[id].name, systems: Object.keys(SYSTEMS).filter(s => SYSTEMS[s].emus.includes(id)).map(s => SYSTEMS[s].name), path: p[id] && fs.existsSync(p[id]) ? p[id] : '', canDownload: !!EMUS[id].gh, site: EMUS[id].site, tag: tags[id] || '' })); };
  async function install(id) {
    const e = EMUS[id]; if (!e || !e.gh) return { ok: false, error: 'This emulator has to be downloaded from its website.' };
    const rel = await (ctx.getJson || getJson)((ctx.apiBase || 'https://api.github.com') + '/repos/' + e.gh.repo + '/releases/latest'); const a = pickAsset(rel.assets, e.gh.asset); if (!a) return { ok: false, error: 'No Windows download found in the latest release.' };
    const dir = path.join(root(), id), zip = path.join(root(), id + '.zip'); fs.mkdirSync(root(), { recursive: true }); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await download(a.browser_download_url, zip, p => ctx.progress && ctx.progress(id, p)); await ctx.extract(zip, dir); try { fs.rmSync(zip, { force: true }); } catch {}
    const exe = findExe([dir], e.exe, 3); if (!exe) return { ok: false, error: 'Downloaded, but the program was not found inside.' };
    const s = S(); s.emuPaths = Object.assign({}, s.emuPaths, { [id]: exe }); s.emuTags = Object.assign({}, s.emuTags, { [id]: rel.tag_name || '' }); save(s); return { ok: true, exe, tag: rel.tag_name || '' };
  }
  async function run(name, arg) {
    try {
      switch (name) {
        case 'emus': return { ok: true, list: emuList() };
        case 'emuSet': { if (!EMUS[arg && arg.id]) return { ok: false }; const s = S(); s.emuPaths = Object.assign({}, s.emuPaths); if (arg.path) s.emuPaths[arg.id] = String(arg.path); else delete s.emuPaths[arg.id]; save(s); return { ok: true, list: emuList() }; }
        case 'emuFind': { const f = findEmulators(defaultDirs(ctx.env, [root()].concat(S().romFolders || []))), s = S(); s.emuPaths = Object.assign({}, s.emuPaths); let n = 0; Object.keys(f).forEach(id => { if (!s.emuPaths[id] || !fs.existsSync(s.emuPaths[id])) { s.emuPaths[id] = f[id]; n++; } }); save(s); return { ok: true, found: n, list: emuList() }; }
        case 'emuInstall': { const r = await install(String(arg || '')); return Object.assign(r, { list: emuList() }); }
        case 'folders': return { ok: true, list: S().romFolders || [] };
        case 'folderAdd': { const s = S(); s.romFolders = Array.from(new Set((s.romFolders || []).concat([String(arg || '')]).filter(Boolean))).slice(0, 12); save(s); return { ok: true, list: s.romFolders }; }
        case 'folderRemove': { const s = S(); s.romFolders = (s.romFolders || []).filter(x => x !== arg); save(s); return { ok: true, list: s.romFolders }; }
        case 'scan': { const e = scanRoms(S().romFolders || []); return { ok: true, entries: describe(e, paths(), apps()), systems: Object.keys(SYSTEMS).map(id => ({ id, name: SYSTEMS[id].name })) }; }
      }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
    return null;
  }
  return { run, install, emuList };
}
module.exports = { create, SYSTEMS, EMUS, scanRoms, systemFor, cleanTitle, findExe, findEmulators, defaultDirs, describe, buildApp, download, getJson, pickAsset, idFor };
