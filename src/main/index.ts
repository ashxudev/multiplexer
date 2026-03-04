import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { createIPCHandler } from 'electron-trpc/main';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { AppServices } from './services';

let mainWindow: BrowserWindow | null = null;
let services: AppServices | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  services = AppServices.initialize();
  mainWindow = createWindow();

  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    createContext: () => createContext(services!),
  });

  // macOS: re-create window when dock icon clicked and no windows exist
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      createIPCHandler({
        router: appRouter,
        windows: [mainWindow],
        createContext: () => createContext(services!),
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  services?.shutdown();
});
