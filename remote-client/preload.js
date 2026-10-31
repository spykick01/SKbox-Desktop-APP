const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('skclient', { discover: () => ipcRenderer.invoke('discover'), deviceName: require('os').hostname().replace(/\.local$/, '').slice(0, 32) });
