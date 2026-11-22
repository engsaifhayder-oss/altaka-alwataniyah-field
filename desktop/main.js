// ALTAKA-ALWATANIYAH – تطبيق الموظف الميداني (نسخة ويندوز وماك)
const { app, BrowserWindow, session, shell, Menu, systemPreferences } = require('electron');
const path = require('path');

// استخدام خدمة الموقع في ويندوز (Windows Location) لتحديد الموقع الجغرافي
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');

function createWindow() {
  const win = new BrowserWindow({
    width: 480, height: 900, minWidth: 380, minHeight: 600,
    title: 'الموظف الميداني – الطاقة الوطنية',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#002816',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // الروابط الخارجية (الخرائط، الهاتف) تُفتح في المتصفح
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); } });
}

app.whenReady().then(async () => {
  // ماك: طلب إذن الكاميرا والمايكروفون من النظام
  if (process.platform === 'darwin') {
    try { await systemPreferences.askForMediaAccess('camera'); await systemPreferences.askForMediaAccess('microphone'); } catch (_) {}
  }
  const ok = ['media', 'geolocation', 'notifications', 'fullscreen'];
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(ok.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ok.includes(perm));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
