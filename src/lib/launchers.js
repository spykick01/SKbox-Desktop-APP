// Finds games installed through Steam and the Epic Games Launcher, so they can be added to SKBox with one tap.
// They launch through the launcher's own address (steam://rungameid/... and com.epicgames.launcher://...), so sign-in and updates keep working.
const fs = require('fs'), path = require('path');
const SKIP = /redistributable|steamworks|steam linux runtime|proton|steamvr|sdk|dedicated server|benchmark|wallpaper engine: |soundtrack/i;
const unesc = s => String(s).replace(/\\\\/g, '\\');

function steamRoots(extra) {
  const c = [].concat(extra || []);
  const pf86 = process.env['ProgramFiles(x86)'], pf = process.env['ProgramFiles'];
  if (pf86) c.push(path.join(pf86, 'Steam')); if (pf) c.push(path.join(pf, 'Steam')); c.push('C:\\Program Files (x86)\\Steam', 'D:\\Steam', 'D:\\Program Files (x86)\\Steam');
  return Array.from(new Set(c.filter(x => x && fs.existsSync(path.join(x, 'steamapps')))));
}
function steamLibraries(root) {
  const libs = [root];
  try { const t = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'); for (const m of t.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(unesc(m[1])); } catch {}
  return Array.from(new Set(libs)).filter(l => fs.existsSync(path.join(l, 'steamapps')));
}
function scanSteam(roots) {
  const out = [], seen = new Set();
  for (const root of steamRoots(roots)) for (const lib of steamLibraries(root)) {
    let files = []; try { files = fs.readdirSync(path.join(lib, 'steamapps')).filter(f => /^appmanifest_\d+\.acf$/.test(f)); } catch {}
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(lib, 'steamapps', f), 'utf8'), id = (/"appid"\s+"(\d+)"/.exec(t) || [])[1], name = (/"name"\s+"([^"]*)"/.exec(t) || [])[1];
        if (!id || !name || seen.has(id) || SKIP.test(name)) continue; seen.add(id);
        out.push({ name, target: 'steam://rungameid/' + id, args: '', src: 'Steam', appid: id });
      } catch {}
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function scanEpic(dir) {
  const d = dir || path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'), out = [];
  let files = []; try { files = fs.readdirSync(d).filter(f => /\.item$/i.test(f)); } catch { return out; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); if (!j.DisplayName || !j.AppName || j.bIsIncompleteInstall || !j.LaunchExecutable) continue;
      const id = j.CatalogNamespace && j.CatalogItemId ? [j.CatalogNamespace, j.CatalogItemId, j.AppName].map(encodeURIComponent).join('%3A') : encodeURIComponent(j.AppName);
      out.push({ name: j.DisplayName, target: 'com.epicgames.launcher://apps/' + id + '?action=launch&silent=true', args: '', src: 'Epic', exe: path.join(j.InstallLocation || '', j.LaunchExecutable) });
    } catch {}
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
module.exports = { scanSteam, scanEpic, steamRoots, steamLibraries };
