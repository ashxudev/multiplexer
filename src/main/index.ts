import { app, BrowserWindow, nativeImage, nativeTheme, shell } from 'electron';
import { join } from 'path';
import { createIPCHandler } from 'trpc-electron/main';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { AppServices } from './services';
import { initTelemetry, trackEvent } from './services/telemetry';
import { createApplicationMenu } from './menu';

// Sentry + Aptabase: must install crash handlers before anything else
initTelemetry();

// Dev/Playwright: nohup & can lose macOS WindowServer dark mode detection.
// The dev.sh script detects dark mode and sets MULTIPLEXER_FORCE_DARK=1.
if (process.env.MULTIPLEXER_FORCE_DARK) {
  nativeTheme.themeSource = 'dark';
}

let mainWindow: BrowserWindow | null = null;
let services: AppServices | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151110' : '#ffffff',
    icon: join(__dirname, '../../build/icon.png'),
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
  // Set dock icon for macOS dev mode (in production, the bundled .icns handles it)
  if (process.platform === 'darwin' && !app.isPackaged) {
    const iconPath = join(__dirname, '../../build/icon.png');
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  app.name = 'Multiplexer';
  app.setAboutPanelOptions({
    applicationName: 'Multiplexer',
    applicationVersion: app.getVersion(),
    version: '',
    website: 'https://github.com/ashxudev/multiplexer',
    iconPath: join(__dirname, '../../build/icon.png'),
  });
  createApplicationMenu();

  services = AppServices.initialize();
  mainWindow = createWindow();

  trackEvent('app_launched', {
    version: app.getVersion(),
    os: process.platform,
  });

  const ipcHandler = createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    createContext: () => createContext(services!),
  });

  // macOS: re-create window when dock icon clicked and no windows exist
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      ipcHandler.attachWindow(mainWindow);
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
