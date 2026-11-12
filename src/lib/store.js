// Small JSON store with protection against a torn or corrupt file: every write keeps the previous good copy as <name>.json.bak,
// and a file that cannot be read falls back to that copy (the broken file is kept aside, never silently overwritten).
const fs = require('fs'), path = require('path');
function make(dir) {
  const file = n => path.join(dir, n + '.json');
  const parse = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  return {
    read(n, d) {
      const f = file(n); let broken = false;
      try { return parse(f); } catch (e) { if (e && e.code === 'ENOENT') { try { return parse(f + '.bak'); } catch { return d; } } broken = true; }
      try { const v = parse(f + '.bak'); try { fs.renameSync(f, f + '.corrupt-' + Date.now()); fs.copyFileSync(f + '.bak', f); } catch {} return v; } catch {}
      if (broken) { try { fs.renameSync(f, f + '.corrupt-' + Date.now()); } catch {} }
      return d;
    },
    write(n, v) {
      fs.mkdirSync(dir, { recursive: true }); const f = file(n), tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(v, null, 1));
      try { parse(f); fs.copyFileSync(f, f + '.bak'); } catch {}   // keep the last good copy
      fs.renameSync(tmp, f);
    }
  };
}
module.exports = { make };
