// Preload for the SKBrowse bar / tabs / panels page. Gives it the controller cursor (same as web apps) and a tiny command API.
const { contextBridge, ipcRenderer } = require('electron');
try { require('./guestPreload.js'); } catch (e) {}
contextBridge.exposeInMainWorld('skb', {
  cmd: (c, a) => ipcRenderer.invoke('browse:cmd', c, a),
  on: fn => { ipcRenderer.on('browse:state', (_e, s) => fn(s)); },
  onFocusUrl: fn => { ipcRenderer.on('browse:focusUrl', () => fn()); }
});
