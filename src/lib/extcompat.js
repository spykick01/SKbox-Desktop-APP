// Makes Chrome extensions that need features Electron lacks work in SKBrowse, by adding small shims to the unpacked copy:
//  - messages from websites (externally_connectable) are carried by a content script and replayed as onMessageExternal
//  - declarativeNetRequest / webRequest / declarativeContent exist (the rules are applied by dnr.js)
// Returns { patched, needs[], unsupported[] } so the installer can tell the person what is and is not covered.
const fs = require('fs'), path = require('path');
const SH = n => fs.readFileSync(path.join(__dirname, 'shim', n), 'utf8');

function analyse(man) {
  const perms = (man.permissions || []).concat(man.optional_permissions || []), has = p => perms.includes(p);
  const ec = man.externally_connectable && Array.isArray(man.externally_connectable.matches) && man.externally_connectable.matches.length ? man.externally_connectable.matches : null;
  const dnr = has('declarativeNetRequest') || has('declarativeNetRequestWithHostAccess') || has('declarativeNetRequestFeedback');
  const wr = has('webRequest') || has('webRequestBlocking') || has('webRequestAuthProvider');
  const dc = has('declarativeContent');
  return { ec, dnr, wr, wrBlock: has('webRequestBlocking'), dc };
}

function patch(dir, man) {
  const a = analyse(man), res = { patched: false, needs: [], unsupported: [] };
  if (a.ec) res.needs.push('website messages'); if (a.dnr) res.needs.push('request rewriting'); if (a.wr) res.needs.push('webRequest'); if (a.dc) res.needs.push('declarativeContent');
  if (a.wrBlock) res.unsupported.push('blocking webRequest listeners (only declarativeNetRequest rules can change requests)');
  if (!res.needs.length) return res;
  const bg = man.background || {}; let inject = false;
  try {
    if (man.sk_patched) { res.patched = true; return res; }
    fs.writeFileSync(path.join(dir, 'sk-shim-bg.js'), SH('bg.js'));
    if (man.manifest_version === 3 && bg.service_worker) {
      const mod = bg.type === 'module', orig = bg.service_worker.replace(/^\/+/, '');
      fs.writeFileSync(path.join(dir, 'sk-sw.js'), mod ? "import './sk-shim-bg.js';\nimport './" + orig + "';\n" : "importScripts('sk-shim-bg.js', '" + orig.replace(/'/g, "\\'") + "');\n");
      bg.service_worker = 'sk-sw.js'; inject = true;
    } else if (Array.isArray(bg.scripts) && bg.scripts.length) { bg.scripts.unshift('sk-shim-bg.js'); inject = true; }
    else if (bg.page) { try { const p = path.join(dir, bg.page); let h = fs.readFileSync(p, 'utf8'); h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, m => m + '<script src="/sk-shim-bg.js"></script>') : '<script src="/sk-shim-bg.js"></script>' + h; fs.writeFileSync(p, h); inject = true; } catch {} }
    if (inject) man.background = bg;
    if (a.ec && inject) {
      fs.writeFileSync(path.join(dir, 'sk-shim-cs.js'), SH('cs.js')); fs.writeFileSync(path.join(dir, 'sk-shim-page.js'), SH('page.js'));
      man.content_scripts = (man.content_scripts || []).concat([{ matches: a.ec, js: ['sk-shim-cs.js'], run_at: 'document_start', all_frames: true }]);
      if (man.manifest_version === 3) man.web_accessible_resources = (man.web_accessible_resources || []).concat([{ resources: ['sk-shim-page.js'], matches: a.ec }]);
      else man.web_accessible_resources = (man.web_accessible_resources || []).concat(['sk-shim-page.js']);
    }
    if (inject) { man.sk_patched = true; fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man)); res.patched = true; }
    else res.unsupported.push('its background could not be patched');
  } catch (e) { res.unsupported.push('patch failed: ' + String(e.message || e).slice(0, 80)); }
  return res;
}
module.exports = { patch, analyse };
