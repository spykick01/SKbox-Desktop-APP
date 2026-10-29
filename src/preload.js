const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('skbox', {
  store: { get: (n, d) => inv('store:get', n, d), set: (n, v) => inv('store:set', n, v) },
  info: () => inv('sys:info'),
  pickFile: k => inv('dialog:file', k),
  launch: a => inv('app:launch', a),
  cover: { candidates: t => inv('cover:candidates', t), auto: t => inv('cover:auto', t), pick: id => inv('cover:pick', id), copy: f => inv('cover:copy', f), icon: e => inv('cover:icon', e), remove: f => inv('cover:remove', f) },
  wifi: { scan: () => inv('wifi:scan'), status: () => inv('wifi:status'), connect: a => inv('wifi:connect', a), disconnect: () => inv('wifi:disconnect') },
  sys: { power: w => inv('sys:power', w), openSettings: p => inv('sys:openSettings', p), volume: d => inv('sys:volume', d), startup: o => inv('sys:startup', o), kiosk: o => inv('sys:kiosk', o) },
  auth: { list: () => inv('auth:list'), signin: (u, p) => inv('auth:signin', u, p), refresh: u => inv('auth:refresh', u), cred: u => inv('auth:cred', u), remove: u => inv('auth:remove', u) },
  installUpdate: () => inv('update:install'),
  on: (ch, fn) => { if (['returned', 'launch-error', 'update-ready'].includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
});
