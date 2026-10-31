// Preload for the hidden Remote play window (captures the screen and talks WebRTC). It can only talk to SKBox's main process.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('skremote', {
  on: (ch, fn) => { if (ch === 'offer' || ch === 'kick' || ch === 'toClient') ipcRenderer.on('remote:' + ch, (_e, ...a) => fn(...a)); },
  answer: (sid, d) => ipcRenderer.send('remote:answer', sid, d),
  ended: sid => ipcRenderer.send('remote:ended', sid),
  input: raw => { if (typeof raw === 'string' && raw.length < 600) ipcRenderer.send('remote:input', raw); },
  stats: s => ipcRenderer.send('remote:stats', s)
});
