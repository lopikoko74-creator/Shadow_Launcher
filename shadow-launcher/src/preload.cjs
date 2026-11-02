const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shadow', {
  info: () => ipcRenderer.invoke('app:info'),
  windowControl: action => ipcRenderer.invoke('window:control', action),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: v => ipcRenderer.invoke('settings:save', v),
  listVersions: () => ipcRenderer.invoke('versions:list'),
  checkJava: p => ipcRenderer.invoke('java:check', p),
  addProfile: n => ipcRenderer.invoke('profiles:add', n),
  removeProfile: id => ipcRenderer.invoke('profiles:remove', id),
  open: url => ipcRenderer.invoke('shell:open', url)
});