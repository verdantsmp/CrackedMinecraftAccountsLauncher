const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('desktopApp', {
  name: 'MinecraftAccountLauncher',
  platform: process.platform,
  isDesktop: true
});
