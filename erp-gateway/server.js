/*
 * ALTAKA-ALWATANIYAH — Field Gateway (بوابة الموظفين الميدانيين)
 * ------------------------------------------------------------------
 * خادم يربط تطبيق الموظف الميداني (الهاتف) بمنظومة ERP للشركة.
 * يعمل على جهاز الخادم (Host machine) نفسه الذي تعمل عليه المنظومة.
 *
 *  - بدون أي مكتبات خارجية: يكفي تثبيت Node.js 18 أو أحدث.
 *  - التشغيل:   node server.js        (المنفذ الافتراضي 8780)
 *  - لوحة الإدارة: http://<عنوان-الخادم>:8780/admin
 *
 * كل البيانات تُحفظ في مجلد data/ :
 *   data/db.json        الموظفون، المخازن، المعدات، المهام، السجلات
 *   data/media/...      صور السيلفي، صور العمل، الفيديوهات، الملفات المرفوعة
 * يمكن لمنظومة ERP قراءة هذه البيانات مباشرة أو عبر واجهة /api/erp/* (انظر API.md).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const DATA = process.env.ALTAKA_DATA_DIR || path.join(ROOT, 'data');
const MEDIA = path.join(DATA, 'media');
const CONFIG_FILE = path.join(DATA, 'config.json');
const DB_FILE = path.join(DATA, 'db.json');
const MAX_BODY = 300 * 1024 * 1024; // 300MB لكل طلب (الفيديوهات)

fs.mkdirSync(MEDIA, { recursive: true });

/* ---------------- الإعدادات ---------------- */
function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
  let changed = false;
  if (!c.port) { c.port = Number(process.env.PORT) || 8780; changed = true; }
  if (!c.secret) { c.secret = crypto.randomBytes(32).toString('hex'); changed = true; }
  if (!c.adminUser) { c.adminUser = 'admin'; changed = true; }
  if (!c.adminPassHash) { c.adminPassHash = hashPin('admin123'); changed = true; c.mustChangeAdminPass = true; }
  if (c.maxClockSkewSec == null) { c.maxClockSkewSec = 300; changed = true; }
  if (c.defaultRadiusM == null) { c.defaultRadiusM = 300; changed = true; }
  if (!c.company) { c.company = { ar: 'الطاقة الوطنية للمقاولات والتجارة العامة والطاقة المتجددة', en: 'ALTAKA-ALWATANIYAH' }; changed = true; }
  if (!c.erpApiKey) { c.erpApiKey = crypto.randomBytes(18).toString('hex'); changed = true; }
  if (changed) fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
  return c;
}

/* ---------------- كلمات المرور ---------------- */
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return salt + ':' + h;
}
function checkPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const x = crypto.scryptSync(String(pin), salt, 32);
  const y = Buffer.from(h, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const config = loadConfig();

/* ---------------- قاعدة البيانات (ملف JSON) ---------------- */
const EMPTY_DB = {
  employees: [], warehouses: [], equipment: [], tasks: [],
  events: [], forms: [], obstacles: [], reports: [], sessions: [], adminSessions: [], notifications: []
};
let db;
let saveTimer = null;
try { db = Object.assign({}, EMPTY_DB, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); }
catch (_) { db = JSON.parse(JSON.stringify(EMPTY_DB)); seed(); save(); }
db.tasks.forEach(t => { if (!t.no) t.no = nextNo(db.tasks, 1001); });
if (!Array.isArray(db.notifications)) db.notifications = [];

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}
function saveNow() { clearTimeout(saveTimer); const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 1)); fs.renameSync(tmp, DB_FILE); }
process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });

function uid(p) { return p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }
function nowIso() { return new Date().toISOString(); }

function seed() {
  db.warehouses.push({ id: 'WH1', name: 'المخزن الرئيسي – الحلة', lat: null, lng: null, radiusM: 300, active: true });
  ['ألواح شمسية', 'انفرتر', 'بطارية', 'هيكل حديدي', 'كيبلات AC', 'كيبلات DC', 'قواطع وحمايات', 'منظومة تأريض', 'عدة يدوية', 'سلّم', 'مثقب', 'جهاز لحام', 'ملتيميتر']
    .forEach((n, i) => db.equipment.push({ id: 'EQ' + (i + 1), name: n, unit: i < 3 ? 'قطعة' : 'وحدة', active: true }));
  db.employees.push({ id: 'E1', code: '1001', name: 'موظف تجريبي', department: 'الإدارة الهندسية', jobTitle: 'فني ميداني', phone: '', pinHash: hashPin('1234'), active: true, createdAt: nowIso() });
}

/* ---------------- الباركود الموقّع ---------------- */
// الصيغة المختصرة (لسهولة المسح بالكاميرا):  NW<رقم المخزن>-<توقيع>  أو  NT<رقم المهمة>-<توقيع>
// مثال: NWWH1-8FB042B1   NT1004-672F20CB
function sign(kind, key) {
  return crypto.createHmac('sha256', config.secret).update(kind + '|' + key).digest('hex').slice(0, 8).toUpperCase();
}
function makeCode(kind, key) { return 'N' + kind + key + '-' + sign(kind, key); }
function parseCode(code) {
  const m = /^N([WT])([A-Za-z0-9]+)-([0-9A-Fa-f]{8})$/.exec(String(code || '').trim());
  if (!m) return null;
  return { kind: m[1], id: m[2], valid: sign(m[1], m[2]) === m[3].toUpperCase() };
}
function taskKey(t) { return String(t.no || ''); }
function nextNo(arr, start) { return arr.reduce((m, x) => Math.max(m, Number(x.no) || 0), start - 1) + 1; }

/* ---------------- أدوات ---------------- */
function distM(a, b, c, d) {
  if ([a, b, c, d].some(v => v == null || isNaN(v))) return null;
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store'
  }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) { const b = await readBody(req); try { return JSON.parse(b.toString('utf8') || '{}'); } catch (_) { return {}; } }

// محلل multipart/form-data بسيط
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: [] };
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const fields = {}, files = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    pos += boundary.length;
    if (buf[pos] === 45 && buf[pos + 1] === 45) break; // --
    pos += 2; // CRLF
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd === -1) break;
    const head = buf.slice(pos, headEnd).toString('utf8');
    const next = buf.indexOf(boundary, headEnd + 4);
    if (next === -1) break;
    const data = buf.slice(headEnd + 4, next - 2);
    const name = (/name="([^"]*)"/i.exec(head) || [])[1];
    const filename = (/filename="([^"]*)"/i.exec(head) || [])[1];
    const ctype = (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || 'application/octet-stream';
    if (filename !== undefined) files.push({ field: name, filename, type: ctype.trim(), data });
    else fields[name] = data.toString('utf8');
    pos = next;
  }
  return { fields, files };
}
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/webm': '.webm', 'video/mp4': '.mp4', 'application/pdf': '.pdf', 'audio/webm': '.webm' };
function storeFile(f, sub) {
  const month = new Date().toISOString().slice(0, 7);
  const dir = path.join(MEDIA, month, sub);
  fs.mkdirSync(dir, { recursive: true });
  let ext = path.extname(f.filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  if (!ext) ext = EXT[f.type.split(';')[0]] || '.bin';
  const name = uid('f') + ext;
  fs.writeFileSync(path.join(dir, name), f.data);
  return {
    path: month + '/' + sub + '/' + name, field: f.field, original: f.filename, type: f.type, size: f.data.length,
    sha256: crypto.createHash('sha256').update(f.data).digest('hex')
  };
}

/* ---------------- المصادقة ---------------- */
function bearer(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : null; }
function mobileAuth(req) {
  const t = bearer(req); if (!t) return null;
  const s = db.sessions.find(x => x.token === t);
  if (!s) return null;
  const e = db.employees.find(x => x.id === s.employeeId && x.active !== false);
  if (!e) return null;
  s.lastSeen = nowIso();
  return { session: s, employee: e };
}
function adminAuth(req, url) {
  const t = bearer(req) || url.searchParams.get('t');
  return !!(t && db.adminSessions.find(x => x.token === t && Date.parse(x.expires) > Date.now()));
}
function erpAuth(req, url) {
  const k = req.headers['x-api-key'] || url.searchParams.get('key');
  return k && k === config.erpApiKey;
}
function pubEmployee(e) { return { id: e.id, code: e.code, name: e.name, department: e.department, jobTitle: e.jobTitle, phone: e.phone, email: e.email || '' }; }

/* ---------------- الإشعارات (من الإدارة الهندسية / الإدارة العليا عبر ERP) ---------------- */
function noticeFor(n, emp) { return n.active !== false && (n.audience === 'all' || (n.codes || []).includes(String(emp.code))); }
function noticesFor(emp) {
  return db.notifications.filter(n => noticeFor(n, emp)).slice(-60).reverse().map(n => ({
    id: n.id, title: n.title, body: n.body, from: n.from || '', fromUnit: n.fromUnit || '', priority: n.priority || 'normal', createdAt: n.createdAt,
    read: !!(n.reads || {})[emp.id]
  }));
}

/* ---------------- منطق المهام والخطوات ---------------- */
const STEPS = [
  { k: 'wh_in', t: 'الحضور – الوصول إلى المخزن', code: 'W' },
  { k: 'wh_out', t: 'استلام المعدات ومغادرة المخزن', code: 'W' },
  { k: 'site_in', t: 'الوصول إلى موقع الزبون', code: 'T' },
  { k: 'site_done', t: 'إتمام العمل عند الزبون', code: 'T' },
  { k: 'wh_return', t: 'إرجاع المعدات إلى المخزن – الانصراف', code: 'W' }
];
function taskForMobile(t) {
  return Object.assign({}, t, {
    siteCode: makeCode('T', taskKey(t)),
    progress: db.events.filter(e => e.taskId === t.id && e.employeeId).map(e => ({ step: e.step, employeeId: e.employeeId, at: e.deviceTime, serverAt: e.receivedAt }))
  });
}
function bootstrapFor(emp) {
  return {
    serverTime: nowIso(),
    employee: pubEmployee(emp),
    company: config.company,
    steps: STEPS,
    warehouses: db.warehouses.filter(w => w.active !== false).map(w => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, radiusM: w.radiusM || config.defaultRadiusM, code: makeCode('W', w.id) })),
    equipment: db.equipment.filter(x => x.active !== false),
    tasks: db.tasks.filter(t => t.status !== 'cancelled' && t.status !== 'closed' && (t.assignees || []).includes(emp.id)).map(taskForMobile),
    notifications: noticesFor(emp)
  };
}

function evaluateEvent(ev, emp) {
  const flags = [];
  const code = parseCode(ev.code);
  const task0 = db.tasks.find(t => t.id === ev.taskId);
  const step = STEPS.find(s => s.k === ev.step);
  if (!step) flags.push('خطوة غير معروفة');
  if (!code) flags.push('باركود بصيغة غير معروفة');
  else {
    if (!code.valid) flags.push('توقيع الباركود غير صحيح (باركود مزوّر)');
    if (step && code.kind !== step.code) flags.push('نوع الباركود لا يطابق الخطوة');
    if (step && step.code === 'T' && task0 && code.id !== taskKey(task0)) flags.push('باركود الزبون لا يعود لهذه المهمة');
  }
  const task = db.tasks.find(t => t.id === ev.taskId);
  if (!task) flags.push('المهمة غير موجودة');
  else if (!(task.assignees || []).includes(emp.id)) flags.push('الموظف غير مكلّف بهذه المهمة');
  // الموقع الجغرافي
  let target = null;
  if (code && code.kind === 'W') target = db.warehouses.find(w => w.id === code.id);
  if (code && code.kind === 'T') target = task;
  const g = ev.gps || {};
  if (g.lat == null) flags.push('لا يوجد موقع جغرافي');
  else {
    if (g.accuracy > 150) flags.push('دقة الموقع ضعيفة (' + Math.round(g.accuracy) + ' م)');
    if (target && target.lat != null) {
      const d = distM(g.lat, g.lng, target.lat, target.lng);
      ev.distanceM = d;
      const r = target.radiusM || config.defaultRadiusM;
      if (d != null && d > r) flags.push('خارج النطاق الجغرافي بمسافة ' + d + ' م');
    }
  }
  // الوقت
  const skew = Math.abs((Date.parse(ev.deviceTime) || 0) - (Date.parse(ev.correctedTime || ev.deviceTime) || 0)) / 1000;
  if (skew > config.maxClockSkewSec) flags.push('ساعة الهاتف مختلفة عن الخادم بـ ' + Math.round(skew / 60) + ' دقيقة');
  const integ = ev.integrity || {};
  if (integ.autoTime === false) flags.push('ضبط الوقت التلقائي مغلق في الهاتف');
  if (integ.mockLocation === true) flags.push('موقع وهمي (Mock location)');
  if (integ.source && integ.source !== 'live-camera') flags.push('السيلفي ليس من الكاميرا المباشرة');
  // التسلسل
  const prev = db.events.filter(e => e.taskId === ev.taskId && e.employeeId === emp.id).map(e => e.step);
  const idx = STEPS.findIndex(s => s.k === ev.step);
  if (idx > 0 && !prev.includes(STEPS[idx - 1].k)) flags.push('تم تخطي خطوة سابقة');
  if (prev.includes(ev.step)) flags.push('الخطوة مسجّلة مسبقاً');
  return flags;
}

/* ---------------- الملفات الثابتة ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not_found' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      let [s, e] = range.replace('bytes=', '').split('-').map(Number);
      if (isNaN(e) || !e) e = st.size - 1; if (isNaN(s)) s = 0;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(file, { start: s, end: e }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(file).pipe(res);
    }
  });
}

/* ---------------- CSV ---------------- */
function csv(rows) {
  const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
}
function attendanceRows() {
  const rows = [['التاريخ', 'الوقت (الهاتف)', 'وقت الاستلام (الخادم)', 'كود الموظف', 'اسم الموظف', 'القسم', 'المهمة', 'الزبون', 'الخطوة', 'خط العرض', 'خط الطول', 'الدقة م', 'المسافة م', 'الملاحظات الأمنية', 'رابط الخريطة']];
  db.events.slice().sort((a, b) => (a.deviceTime > b.deviceTime ? 1 : -1)).forEach(e => {
    const emp = db.employees.find(x => x.id === e.employeeId) || {};
    const t = db.tasks.find(x => x.id === e.taskId) || {};
    const st = STEPS.find(s => s.k === e.step) || {};
    const g = e.gps || {};
    const d = new Date(e.correctedTime || e.deviceTime);
    rows.push([d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }), d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad' }), e.receivedAt, emp.code, emp.name, emp.department, t.title || t.id, t.customerName, st.t, g.lat, g.lng, g.accuracy, e.distanceM, (e.flags || []).join(' | '), g.lat != null ? `https://maps.google.com/?q=${g.lat},${g.lng}` : '']);
  });
  return rows;
}

/* ---------------- الموجّه ---------------- */
const routes = [];
function route(method, pattern, handler) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
}

/* ===== واجهة الهاتف ===== */
route('GET', '/api/mobile/ping', (req, res) => send(res, 200, { ok: true, serverTime: nowIso(), company: config.company, app: 'altaka-field-gateway', version: 1 }));

route('POST', '/api/mobile/login', async (req, res) => {
  const b = await readJson(req);
  const e = db.employees.find(x => String(x.code) === String(b.code || '').trim() && x.active !== false);
  if (!e || !checkPin(b.pin || '', e.pinHash)) return send(res, 401, { error: 'invalid_credentials', message: 'رقم الموظف أو الرمز السري غير صحيح' });
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions.push({ token, employeeId: e.id, deviceId: b.deviceId || null, device: b.device || null, createdAt: nowIso(), lastSeen: nowIso() });
  save();
  send(res, 200, Object.assign({ token }, bootstrapFor(e)));
});

route('GET', '/api/mobile/bootstrap', (req, res) => {
  const a = mobileAuth(req); if (!a) return send(res, 401, { error: 'unauthorized' });
  send(res, 200, bootstrapFor(a.employee));
});

route('POST', '/api/mobile/logout', (req, res) => {
  const t = bearer(req); db.sessions = db.sessions.filter(s => s.token !== t); save(); send(res, 200, { ok: true });
});

function mobileUpload(kind, sub, build) {
  return async (req, res) => {
    const a = mobileAuth(req); if (!a) return send(res, 401, { error: 'unauthorized' });
    let body;
    try { body = await readBody(req); } catch (e) { return send(res, 413, { error: 'too_large' }); }
    const mp = parseMultipart(body, req.headers['content-type']);
    let meta = {};
    try { meta = JSON.parse(mp.fields.meta || '{}'); } catch (_) { return send(res, 400, { error: 'bad_meta' }); }
    if (!meta.clientId) return send(res, 400, { error: 'missing_clientId' });
    const exist = db[kind].find(x => x.clientId === meta.clientId && x.employeeId === a.employee.id);
    if (exist) return send(res, 200, { ok: true, id: exist.id, duplicate: true, flags: exist.flags || [] });
    const files = mp.files.map(f => storeFile(f, sub));
    // تحقق من بصمة الملفات (SHA-256) المحسوبة على الهاتف
    const hashes = meta.hashes || {};
    const hashFlags = [];
    files.forEach(f => { const h = hashes[f.original]; if (h && h !== f.sha256) hashFlags.push('بصمة الملف ' + f.original + ' لا تطابق (تم تعديله)'); });
    const rec = Object.assign({}, meta, { id: uid(kind.slice(0, 2)), employeeId: a.employee.id, employeeName: a.employee.name, files, receivedAt: nowIso(), deviceId: a.session.deviceId });
    const extra = build ? build(rec, a.employee) : [];
    rec.flags = hashFlags.concat(extra || []);
    db[kind].push(rec);
    save();
    send(res, 200, { ok: true, id: rec.id, flags: rec.flags });
  };
}

route('POST', '/api/mobile/events', mobileUpload('events', 'selfies', (rec, emp) => {
  const flags = evaluateEvent(rec, emp);
  if (!rec.files.some(f => f.field === 'selfie')) flags.push('لا توجد صورة سيلفي');
  const t = db.tasks.find(x => x.id === rec.taskId);
  if (t) {
    // إذا لم تُحدَّد إحداثيات الزبون، يُعتمد موقع أول وصول مرجعاً لخطوة إتمام العمل
    if (rec.step === 'site_in' && t.lat == null && rec.gps && rec.gps.lat != null && !flags.length) {
      t.lat = rec.gps.lat; t.lng = rec.gps.lng; t.locationFrom = 'first_visit';
    }
    if (rec.step === 'wh_in' && t.status === 'assigned') t.status = 'in_progress';
    if (rec.step === 'site_done') t.status = 'work_done';
    if (rec.step === 'wh_return') { t.status = 'completed'; t.completedAt = nowIso(); }
    t.updatedAt = nowIso();
  }
  return flags;
}));
route('POST', '/api/mobile/forms', mobileUpload('forms', 'forms'));
route('POST', '/api/mobile/obstacles', mobileUpload('obstacles', 'obstacles', rec => {
  const t = db.tasks.find(x => x.id === rec.taskId);
  if (t) { t.hasObstacle = true; t.updatedAt = nowIso(); }
  return [];
}));
route('POST', '/api/mobile/reports', mobileUpload('reports', 'reports'));

// الإشعارات: جلب خفيف (كل دقيقة من التطبيق) وتأكيد القراءة
route('GET', '/api/mobile/notifications', (req, res) => {
  const a = mobileAuth(req); if (!a) return send(res, 401, { error: 'unauthorized' });
  send(res, 200, { serverTime: nowIso(), notifications: noticesFor(a.employee) });
});
route('POST', '/api/mobile/notifications/read', async (req, res) => {
  const a = mobileAuth(req); if (!a) return send(res, 401, { error: 'unauthorized' });
  const b = await readJson(req); const ids = Array.isArray(b.ids) ? b.ids : [];
  let n = 0;
  db.notifications.forEach(x => { if (ids.includes(x.id) && noticeFor(x, a.employee)) { x.reads = x.reads || {}; if (!x.reads[a.employee.id]) { x.reads[a.employee.id] = nowIso(); x.updatedAt = nowIso(); n++; } } });
  if (n) save();
  send(res, 200, { ok: true, marked: n });
});

route('GET', '/api/mobile/history', (req, res) => {
  const a = mobileAuth(req); if (!a) return send(res, 401, { error: 'unauthorized' });
  const mine = k => db[k].filter(x => x.employeeId === a.employee.id).map(x => ({ id: x.id, clientId: x.clientId, step: x.step, taskId: x.taskId, at: x.deviceTime || x.createdAt, flags: x.flags, title: x.title }));
  send(res, 200, { events: mine('events'), forms: mine('forms'), obstacles: mine('obstacles'), reports: mine('reports') });
});

/* ===== لوحة الإدارة ===== */
route('POST', '/api/admin/login', async (req, res) => {
  const b = await readJson(req);
  if (b.user !== config.adminUser || !checkPin(b.pass || '', config.adminPassHash)) return send(res, 401, { error: 'invalid' });
  const token = crypto.randomBytes(24).toString('hex');
  db.adminSessions = db.adminSessions.filter(s => Date.parse(s.expires) > Date.now());
  db.adminSessions.push({ token, expires: new Date(Date.now() + 12 * 3600e3).toISOString() });
  save();
  send(res, 200, { token, mustChangePass: !!config.mustChangeAdminPass });
});
route('POST', '/api/admin/password', async (req, res, url) => {
  if (!adminAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  const b = await readJson(req);
  if (!b.pass || String(b.pass).length < 6) return send(res, 400, { error: 'short', message: 'كلمة المرور 6 أحرف على الأقل' });
  config.adminPassHash = hashPin(b.pass); config.mustChangeAdminPass = false;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  send(res, 200, { ok: true });
});
route('GET', '/api/admin/all', (req, res, url) => {
  if (!adminAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  send(res, 200, {
    serverTime: nowIso(), steps: STEPS, company: config.company, erpApiKey: config.erpApiKey,
    employees: db.employees.map(e => Object.assign(pubEmployee(e), { active: e.active !== false, hasPin: !!e.pinHash })),
    warehouses: db.warehouses.map(w => Object.assign({}, w, { code: makeCode('W', w.id) })),
    equipment: db.equipment,
    tasks: db.tasks.map(t => Object.assign({}, t, { siteCode: makeCode('T', taskKey(t)) })),
    events: db.events, forms: db.forms, obstacles: db.obstacles, reports: db.reports
  });
});

function crud(coll, prefix, clean) {
  route('POST', '/api/admin/' + coll, async (req, res, url) => {
    if (!adminAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
    const b = await readJson(req);
    let item = b.id ? db[coll].find(x => x.id === b.id) : null;
    const isNew = !item;
    if (isNew) { item = { id: b.customId || (coll === 'warehouses' ? 'WH' + (db.warehouses.length + 1) : uid(prefix)), createdAt: nowIso() }; if (coll === 'tasks') item.no = nextNo(db.tasks, 1001); }
    const err = clean(item, b, isNew);
    if (err) return send(res, 400, { error: 'invalid', message: err });
    item.updatedAt = nowIso();
    if (isNew) db[coll].push(item);
    save();
    send(res, 200, { ok: true, item });
  });
  route('DELETE', '/api/admin/' + coll + '/:id', (req, res, url, p) => {
    if (!adminAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
    const it = db[coll].find(x => x.id === p.id);
    if (it) it.active = false; // تعطيل بدلاً من الحذف للحفاظ على السجلات
    if (coll === 'tasks' && it) it.status = 'cancelled';
    save(); send(res, 200, { ok: true });
  });
}
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
crud('employees', 'E', (it, b, isNew) => {
  if (!b.code || !b.name) return 'رقم الموظف والاسم مطلوبان';
  if (db.employees.some(e => e.code === String(b.code) && e.id !== it.id)) return 'رقم الموظف مستخدم مسبقاً';
  if (isNew && !b.pin) return 'الرمز السري مطلوب للموظف الجديد';
  Object.assign(it, { code: String(b.code).trim(), name: b.name.trim(), department: b.department || '', jobTitle: b.jobTitle || '', phone: b.phone || '', email: String(b.email || '').trim(), active: b.active !== false });
  if (b.pin) { if (String(b.pin).length < 4) return 'الرمز السري 4 أرقام على الأقل'; it.pinHash = hashPin(b.pin); db.sessions = db.sessions.filter(s => s.employeeId !== it.id); }
});
crud('warehouses', 'WH', (it, b) => {
  if (!b.name) return 'اسم المخزن مطلوب';
  Object.assign(it, { name: b.name, lat: num(b.lat), lng: num(b.lng), radiusM: num(b.radiusM) || config.defaultRadiusM, active: b.active !== false });
});
crud('equipment', 'EQ', (it, b) => {
  if (!b.name) return 'اسم المعدّة مطلوب';
  Object.assign(it, { name: b.name, unit: b.unit || 'وحدة', active: b.active !== false });
});
crud('tasks', 'T', (it, b, isNew) => {
  if (!b.customerName) return 'اسم الزبون مطلوب';
  if (!['inspection', 'execution'].includes(b.type)) return 'نوع المهمة مطلوب (كشف / تنفيذ)';
  Object.assign(it, {
    type: b.type, title: b.title || ((b.type === 'inspection' ? 'كشف ميداني – ' : 'تنفيذ – ') + b.customerName),
    customerName: b.customerName, customerPhone: b.customerPhone || '', address: b.address || '',
    lat: num(b.lat), lng: num(b.lng), radiusM: num(b.radiusM) || config.defaultRadiusM,
    contractNo: b.contractNo || '', systemCapacity: b.systemCapacity || '', date: b.date || '', notes: b.notes || '',
    warehouseId: b.warehouseId || (db.warehouses[0] || {}).id, assignees: Array.isArray(b.assignees) ? b.assignees : [],
    equipmentPlan: Array.isArray(b.equipmentPlan) ? b.equipmentPlan : [], erpRef: b.erpRef || it.erpRef || ''
  });
  if (isNew) it.status = 'assigned'; else if (b.status) it.status = b.status;
});

route('GET', '/api/admin/attendance.csv', (req, res, url) => {
  if (!adminAuth(req, url)) return send(res, 401, 'unauthorized');
  send(res, 200, csv(attendanceRows()), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ALTAKA-ALWATANIYAH_attendance.csv"' });
});
route('POST', '/api/admin/review', async (req, res, url) => {
  if (!adminAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  const b = await readJson(req);
  const it = (db[b.coll] || []).find(x => x.id === b.id);
  if (!it) return send(res, 404, { error: 'not_found' });
  it.review = { status: b.status, note: b.note || '', at: nowIso() };
  save(); send(res, 200, { ok: true });
});

/* ===== واجهة ERP (مفتاح API) ===== */
// تسمح لمنظومة ERP بسحب البيانات ودفع المهام والموظفين آلياً
route('GET', '/api/erp/export', (req, res, url) => {
  if (!erpAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  const since = url.searchParams.get('since') || '';
  const f = arr => arr.filter(x => !since || (x.receivedAt || x.updatedAt || '') > since);
  send(res, 200, { serverTime: nowIso(), events: f(db.events), forms: f(db.forms), obstacles: f(db.obstacles), reports: f(db.reports), tasks: db.tasks.filter(t => !since || (t.updatedAt || '') > since),
    notifications: db.notifications.filter(n => !since || (n.updatedAt || n.createdAt || '') > since).map(n => ({ id: n.id, erpId: n.erpId, reads: n.reads || {} })) });
});
// الموظفون الميدانيون (لاختيار المستلمين في ERP: الاسم، الهاتف، البريد)
route('GET', '/api/erp/employees', (req, res, url) => {
  if (!erpAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  send(res, 200, { employees: db.employees.map(e => Object.assign(pubEmployee(e), { active: e.active !== false, lastSeen: (db.sessions.filter(s => s.employeeId === e.id).map(s => s.lastSeen).sort().pop()) || null })) });
});
// إرسال إشعار إلى التطبيق: عام (audience=all) أو لموظفين محددين (codes)
route('POST', '/api/erp/notify', async (req, res, url) => {
  if (!erpAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  const b = await readJson(req);
  if (!String(b.title || '').trim() && !String(b.body || '').trim()) return send(res, 400, { error: 'empty', message: 'الإشعار فارغ' });
  let n = b.erpId ? db.notifications.find(x => x.erpId === b.erpId) : null;
  if (!n) { n = { id: uid('N'), createdAt: nowIso(), reads: {} }; db.notifications.push(n); }
  Object.assign(n, { erpId: b.erpId || '', title: String(b.title || '').slice(0, 200), body: String(b.body || '').slice(0, 4000), from: b.from || '', fromUnit: b.fromUnit || '',
    priority: b.priority === 'high' ? 'high' : 'normal', audience: b.audience === 'all' ? 'all' : 'list', codes: (b.codes || []).map(String), active: b.active !== false, updatedAt: nowIso() });
  if (db.notifications.length > 2000) db.notifications = db.notifications.slice(-2000);
  save();
  const recipients = db.employees.filter(e => e.active !== false && noticeFor(n, e)).length;
  send(res, 200, { ok: true, id: n.id, recipients });
});
route('POST', '/api/erp/sync', async (req, res, url) => {
  if (!erpAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
  const b = await readJson(req); const out = { employees: 0, tasks: 0, warehouses: 0, equipment: 0 };
  (b.employees || []).forEach(x => {
    let e = db.employees.find(y => y.code === String(x.code));
    if (!e) { e = { id: x.id || uid('E'), createdAt: nowIso() }; db.employees.push(e); }
    Object.assign(e, { code: String(x.code), name: x.name, department: x.department || '', jobTitle: x.jobTitle || '', phone: x.phone || '', email: x.email != null ? String(x.email) : (e.email || ''), active: x.active !== false, updatedAt: nowIso() });
    if (x.pin) e.pinHash = hashPin(x.pin);
    out.employees++;
  });
  ['warehouses', 'equipment'].forEach(k => (b[k] || []).forEach(x => {
    let it = db[k].find(y => y.id === x.id);
    if (!it) { it = { id: String(x.id || (k === 'warehouses' ? 'WH' + (db.warehouses.length + 1) : 'EQ' + (db.equipment.length + 1))).replace(/[^A-Za-z0-9]/g, ''), createdAt: nowIso() }; db[k].push(it); }
    Object.assign(it, x, { updatedAt: nowIso() }); out[k]++;
  }));
  (b.tasks || []).forEach(x => {
    let t = db.tasks.find(y => (x.erpRef && y.erpRef === x.erpRef) || y.id === x.id);
    if (!t) { t = { id: x.id || uid('T'), no: nextNo(db.tasks, 1001), status: 'assigned', createdAt: nowIso() }; db.tasks.push(t); }
    const assignees = (x.assigneeCodes || []).map(c => (db.employees.find(e => e.code === String(c)) || {}).id).filter(Boolean);
    Object.assign(t, x, { assignees: x.assignees || assignees, updatedAt: nowIso() });
    delete t.assigneeCodes; out.tasks++;
  });
  save(); send(res, 200, { ok: true, upserted: out });
});

/* ---------------- الخادم ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method === 'OPTIONS') return send(res, 204, '');
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(p); if (!m) continue;
      const params = {}; r.keys.forEach((k, i) => params[k] = m[i + 1]);
      return await r.handler(req, res, url, params);
    }
    if (req.method === 'GET' && p.startsWith('/media/')) {
      if (!adminAuth(req, url) && !erpAuth(req, url)) return send(res, 401, { error: 'unauthorized' });
      const f = path.normalize(path.join(MEDIA, p.slice(7)));
      if (!f.startsWith(MEDIA)) return send(res, 403, { error: 'forbidden' });
      return serveFile(req, res, f);
    }
    if (req.method === 'GET' && (p === '/' || p === '/admin' || p === '/admin/')) return serveFile(req, res, path.join(ROOT, 'public', 'admin.html'));
    // نسخة الويب من تطبيق الموظف (للآيفون والويندوز): http(s)://<الخادم>:8780/app
    if (req.method === 'GET' && (p === '/app' || p.startsWith('/app/'))) {
      let rel = p.replace(/^\/app\/?/, '') || 'index.html';
      const base = path.join(ROOT, 'public', 'app');
      const f = path.normalize(path.join(base, rel));
      if (!f.startsWith(base)) return send(res, 403, {});
      if (p === '/app') { res.writeHead(302, { Location: '/app/' }); return res.end(); }
      return serveFile(req, res, f);
    }
    if (req.method === 'GET' && p.startsWith('/public/')) {
      const f = path.normalize(path.join(ROOT, p)); if (!f.startsWith(path.join(ROOT, 'public'))) return send(res, 403, {});
      return serveFile(req, res, f);
    }
    send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server_error', message: String(e.message || e) });
  }
});

if (require.main === module) {
  // HTTPS اختياري: ضع cert.pem و key.pem في data/https/ (مطلوب لتشغيل الكاميرا من متصفح الآيفون/الويندوز)
  const certDir = path.join(DATA, 'https');
  if (fs.existsSync(path.join(certDir, 'cert.pem')) && fs.existsSync(path.join(certDir, 'key.pem'))) {
    const https = require('https');
    const hp = config.httpsPort || 8443;
    https.createServer({ cert: fs.readFileSync(path.join(certDir, 'cert.pem')), key: fs.readFileSync(path.join(certDir, 'key.pem')) }, server.listeners('request')[0])
      .listen(hp, '0.0.0.0', () => console.log(' HTTPS يعمل على المنفذ ' + hp));
  }
  server.listen(config.port, '0.0.0.0', () => {
    const os = require('os');
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log('\n ALTAKA-ALWATANIYAH Field Gateway');
    console.log(' بوابة الموظفين الميدانيين تعمل الآن\n');
    console.log(' لوحة الإدارة:  http://localhost:' + config.port + '/admin');
    ips.forEach(ip => console.log(' عنوان الخادم للهواتف:  http://' + ip + ':' + config.port));
    console.log(' نسخة الويب (آيفون / ويندوز):  /app');
    if (config.mustChangeAdminPass) console.log('\n ⚠ دخول الإدارة الأولي: admin / admin123 — غيّره فوراً من اللوحة');
    console.log(' مفتاح ربط ERP (X-Api-Key): ' + config.erpApiKey + '\n');
  });
}
module.exports = { server, makeCode, parseCode, STEPS };
