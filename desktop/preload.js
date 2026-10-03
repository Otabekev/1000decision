'use strict';
// The only bridge between the page and the desktop shell. Small on purpose.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TDDesktop', {
  info: () => ipcRenderer.invoke('app:info'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (fn) => ipcRenderer.on('update', (e, payload) => fn(payload)),
  getOpenAtLogin: () => ipcRenderer.invoke('login:get'),
  setOpenAtLogin: (on) => ipcRenderer.invoke('login:set', on),
  license: (action, body) => ipcRenderer.invoke('license:call', { action, body })
});
