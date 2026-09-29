const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let shuttingDown = false;
let serverModule = null;
let port = null;

app.setAppUserModelId('com.nexuscontrol.minecraftaccountlauncher');
app.setName('MinecraftAccountLauncher');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#070b10',
    title: 'MinecraftAccountLauncher',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', event => {
    if (shuttingDown) return;
    event.preventDefault();
    app.quit();
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  process.env.MCAL_DATA_DIR = path.join(app.getPath('userData'), 'data');
  serverModule = require(path.join(__dirname, '..', 'server.js'));
  port = await serverModule.startServer(0);
  await createWindow();
}).catch(error => {
  console.error(error);
  app.quit();
});

app.on('before-quit', event => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  const shutdown = serverModule?.shutdownServer ? serverModule.shutdownServer() : Promise.resolve();
  shutdown.finally(() => app.exit(0));
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && port) createWindow();
});
