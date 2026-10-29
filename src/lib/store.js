const fs = require('fs'), path = require('path');
function make(dir) {
  const file = n => path.join(dir, n + '.json');
  return {
    read(n, d) { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } },
    write(n, v) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(n) + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(file(n) + '.tmp', file(n)); }
  };
}
module.exports = { make };
