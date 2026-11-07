const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('skbox', {
  store: { get: (n, d) => inv('store:get', n, d), set: (n, v) => inv('store:set', n, v) },
  info: () => inv('sys:info'),
  pickFile: k => inv('dialog:file', k),
  launch: a => inv('app:launch', a),
  cover: { candidates: t => inv('cover:candidates', t), auto: t => inv('cover:auto', t), pick: id => inv('cover:pick', id), pickUrl: u => inv('cover:pickUrl', u), copy: f => inv('cover:copy', f), icon: e => inv('cover:icon', e), remove: f => inv('cover:remove', f) },
  wifi: { scan: () => inv('wifi:scan'), status: () => inv('wifi:status'), connect: a => inv('wifi:connect', a), disconnect: () => inv('wifi:disconnect') },
  sys: { takeGuide: o => inv('sys:takeGuide', o), power: w => inv('sys:power', w), openSettings: p => inv('sys:openSettings', p), volume: d => inv('sys:volume', d), startup: o => inv('sys:startup', o), kiosk: o => inv('sys:kiosk', o) },
  auth: { list: () => inv('auth:list'), signin: (u, p) => inv('auth:signin', u, p), refresh: u => inv('auth:refresh', u), cred: u => inv('auth:cred', u), remove: u => inv('auth:remove', u) },
  game: { state: () => inv('game:state'), resume: () => inv('game:resume'), close: () => inv('game:close') },
  stats: { touch: id => inv('stats:touch', id) },
  perf: { get: () => inv('sys:stats') },
  remote: { state: () => inv('remote:state'), set: on => inv('remote:set', !!on), newPin: () => inv('remote:pin'), kick: () => inv('remote:kick'), cfg: p => inv('remote:cfg', p), fix: () => inv('remote:fix') },
  timer: { get: () => inv('timer:get'), set: (m, a) => inv('timer:set', m, a) },
  backup: { save: () => inv('backup:export'), load: () => inv('backup:import') },
  shots: { list: () => inv('shots:list'), remove: f => inv('shots:delete', f), folder: () => inv('shots:folder') },
  helper: { padTest: on => inv('helper:padTest', on), status: () => inv('helper:status'), testMenu: () => inv('helper:testMenu') },
  bt: { list: () => inv('bt:run', 'list'), scan: () => inv('bt:run', 'scan'), pair: id => inv('bt:run', 'pair', id), unpair: id => inv('bt:run', 'unpair', id) },
  overlay: { state: () => inv('overlay:state'), close: r => inv('overlay:close', r), home: () => inv('overlay:home'), screenshot: () => inv('overlay:screenshot'), setPlayer: (slot, u) => inv('overlay:setPlayer', slot, u), oskResult: r => inv('overlay:osk-result', r) },
  party: { cmd: (c, a) => inv('party:cmd', c, a), state: () => inv('party:get') },
  music: { open: u => inv('music:open', u), ensure: u => inv('music:ensure', u), status: () => inv('music:status'), cmd: (c, a) => inv('music:cmd', c, a) },
  companion: { state: () => inv('companion:state'), set: on => inv('companion:set', on), pin: () => inv('companion:pin'), kick: () => inv('companion:kick') },
  apps: { scan: () => inv('apps:scan'), launchers: () => inv('apps:launchers') },
  extras: { do: (n, a) => inv('extras:do', n, a) },
  installUpdate: () => inv('update:install'),
  on: (ch, fn) => { if (['returned', 'launch-error', 'update-ready', 'pads', 'game:state', 'apps:changed', 'input-lock', 'overlay:open', 'overlay:close', 'players-changed', 'music:visible', 'fs', 'padin', 'padtest', 'battery', 'timer:fired', 'remote:state', 'queue:next', 'companion:state', 'roms:progress', 'info:progress', 'party:state', 'playit:state', 'sks:log', 'sks:state', 'sks:progress', 'store:progress'].includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
});
