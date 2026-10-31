// Copies the shared client page from the SKBox renderer folder, so the app and the browser version are always identical.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'renderer', 'remote'), dst = path.join(__dirname, 'web');
fs.mkdirSync(dst, { recursive: true });
['client.html', 'client.js', 'client.css'].forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
console.log('copied client files to web/');
