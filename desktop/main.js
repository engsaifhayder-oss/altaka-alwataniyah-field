// ALTAKA-ALWATANIYAH – التطبيق الموحد (نسخة ويندوز وماك): الأدوات الميدانية + منظومة ERP عبر Cloudflare
const { app, BrowserWindow, session, shell, Menu, systemPreferences } = require('electron');
const path = require('path');

// نطاقات الشركة التي تُفتح داخل التطبيق (منظومة ERP والبوابة عبر Cloudflare)
const COMPANY = /^https:\/\/([a-z0-9-]+\.)*(altaka-field\.com|altaka-alwatania\.iq)(:\d+)?(\/|$)/i;
let erpWin = null;
function openErp(url) {
  if (erpWin && !erpWin.isDestroyed()) { erpWin.loadURL(url); erpWin.focus(); return; }
  erpWin = new BrowserWindow({
    width: 1366, height: 860, minWidth: 900, minHeight: 600, title: 'منظومة ERP – الطاقة الوطنية',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  erpWin.loadURL(url);
  erpWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('blob:') || COMPANY.test(u)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    shell.openExternal(u); return { action: 'deny' };
  });
  erpWin.webContents.on('will-navigate', (e, u) => { if (!COMPANY.test(u) && !u.startsWith('blob:')) { e.preventDefault(); shell.openExternal(u); } });
  erpWin.on('closed', () => { erpWin = null; });
}

// استخدام خدمة الموقع في ويندوز (Windows Location) لتحديد الموقع الجغرافي
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');

function createWindow() {
  const win = new BrowserWindow({
    width: 480, height: 900, minWidth: 380, minHeight: 600,
    title: 'الطاقة الوطنية – التطبيق الموحد',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#002816',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // الروابط الخارجية (الخرائط، الهاتف) تُفتح في المتصفح
  win.webContents.setWindowOpenHandler(({ url }) => {
    // فتح تقارير PDF (تطبيقا الكشف والتنفيذ) داخل نافذة التطبيق
    if (url.startsWith('blob:')) return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 1000, autoHideMenuBar: true } };
    if (COMPANY.test(url)) { openErp(url); return { action: 'deny' }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  // التطبيق الموحد ينتقل إلى نسخته على خادم الشركة (https://app.altaka-field.com/app/) فتظهر منظومة ERP داخل النافذة نفسها
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://') && !url.startsWith('blob:') && !COMPANY.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  // بلا إنترنت عند التشغيل: تبقى النسخة المضمّنة تعمل للأدوات الميدانية
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain && COMPANY.test(url)) win.loadFile(path.join(__dirname, 'app', 'index.html')); });
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
