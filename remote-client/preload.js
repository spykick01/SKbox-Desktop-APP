const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('skclient', { discover: () => ipcRenderer.invoke('discover'), fullscreen: on => ipcRenderer.send('fs', !!on), deviceName: require('os').hostname().replace(/\.local$/, '').slice(0, 32) });
