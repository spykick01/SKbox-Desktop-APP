// Preload for the hidden voice party window: a tiny bridge to the main process.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('skparty', {
  onCmd: fn => ipcRenderer.on('party:cmd', (_e, id, name, arg) => fn(id, name, arg)),
  emit: s => ipcRenderer.send('party:evt', s),
  reply: (id, r) => ipcRenderer.send('party:reply', id, r)
});
