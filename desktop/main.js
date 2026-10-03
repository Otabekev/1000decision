/*
 * 1000 Decisions — desktop shell (Electron).
 *
 * Loads the same app as the web version from ./app, with:
 *   - one window, one instance (opening it again focuses the window)
 *   - microphone allowed for voice notes, nothing else
 *   - links open in your normal browser
 *   - automatic updates from GitHub Releases (packaged builds only)
 *   - optional open-at-login
 * Data lives in this app's own storage (separate from Chrome). Move it with
 * Settings → Export JSON in the browser, then Import JSON here.
 */
'use strict';

const { app, BrowserWindow, Menu, shell, session, ipcMain, net } = require('electron');
const path = require('path');
const url = require('url');

const APP_DIR = path.join(__dirname, 'app');
let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(start);
}

function start() {
  if (process.platform === 'win32') app.setAppUserModelId('app.thousanddecisions.desktop');

  // Only the microphone (voice notes), clipboard writes and the backup-folder picker.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (permission === 'media') return callback(!details.mediaTypes || details.mediaTypes.every((t) => t === 'audio'));
    callback(['clipboard-sanitized-write', 'fileSystem'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => ['media', 'clipboard-sanitized-write', 'fileSystem'].includes(permission));

  buildMenu();
  createWindow();
  setupUpdates();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    show: false,
    title: '1000 Decisions',
    backgroundColor: '#F3F2EF',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  win.loadFile(path.join(APP_DIR, 'index.html'));
  win.once('ready-to-show', () => win.show());

  // External links → default browser. The app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // The window only ever shows the app itself (hash changes are fine).
  const home = url.pathToFileURL(path.join(APP_DIR, 'index.html')).href;
  win.webContents.on('will-navigate', (e, target) => {
    if (target.split('#')[0] === home) return;
    e.preventDefault();
    if (/^https?:/.test(target)) shell.openExternal(target);
  });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Check for updates', click: () => checkForUpdates(true) },
        {
          label: 'Open at login',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Updates ─────────────────────────────────────────────────────────────
let autoUpdater = null;
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => send('update', { state: 'downloading', version: info.version }));
  autoUpdater.on('update-downloaded', (info) => send('update', { state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => { if (manualCheck) send('update', { state: 'error', message: String(err && err.message || err) }); manualCheck = false; });
  checkForUpdates(false);
  setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
}
let manualCheck = false;
function checkForUpdates(manual) {
  manualCheck = !!manual;
  if (!autoUpdater) {
    if (manual) send('update', { state: 'dev' });
    return;
  }
  autoUpdater.checkForUpdates().then((r) => {
    if (manual && (!r || !r.isUpdateAvailable)) send('update', { state: 'latest', version: app.getVersion() });
  }).catch(() => { if (manual) send('update', { state: 'error' }); });
}
function send(channel, payload) { if (win) win.webContents.send(channel, payload); }

ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }));
ipcMain.handle('login:get', () => { try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; } });
ipcMain.handle('login:set', (e, on) => { app.setLoginItemSettings({ openAtLogin: !!on }); return app.getLoginItemSettings().openAtLogin; });

// License calls go through the main process so the page never deals with CORS.
const LICENSE_HOST = 'https://api.lemonsqueezy.com';
ipcMain.handle('license:call', async (e, { action, body }) => {
  if (!['activate', 'validate', 'deactivate'].includes(action)) throw new Error('bad action');
  const res = await net.fetch(LICENSE_HOST + '/v1/licenses/' + action, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  return { status: res.status, json: await res.json().catch(() => null) };
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
