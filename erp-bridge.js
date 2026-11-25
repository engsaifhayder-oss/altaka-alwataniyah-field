/* ALTAKA-ALWATANIYAH — جسر منظومة ERP (تحقنه البوابة في صفحة ERP المخدومة من /erp/).
   ERP هو البرنامج الوحيد: يدخل الموظف باسم المستخدم وكلمة المرور، ويجد داخله:
   - قسم «العمل الميداني» (الحضور بالباركود والسيلفي، الكشف، التنفيذ، المعوقات، التقارير، الإشعارات)
     حسب صفته وصلاحياته المحددة على الحاسبة الأم — بلا دخول ثانٍ.
   - واجهة مناسبة للهاتف (قائمة جانبية منزلقة) — مع erp-mobile.css.
   - أندرويد: حفظ وفتح الملفات المنزّلة عبر جسر التطبيق، وزر الرجوع.
   - الدخول الواحد من التطبيق القديم (رمز sso لمرة واحدة) ما زال مدعوماً. */
(function () {
  'use strict';
  var NE = window.__NE = window.__NE || {};
  if (!document.querySelector('link[href^="/app/erp-mobile.css"]')) {
    var me_ = document.currentScript && document.currentScript.src || '', v_ = (/[?&]v=([\w]+)/.exec(me_) || [])[1] || String(Date.now());
    var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = '/app/erp-mobile.css?v=' + v_; (document.head || document.documentElement).appendChild(lk);
  }
  var parentWin = null;
  try { if (window.parent !== window && window.parent.location.origin === location.origin) parentWin = window.parent; } catch (e) {}

  /* ---------- 1) الدخول الواحد برمز sso (للتوافق) ---------- */
  var code = null;
  try { if (parentWin && parentWin.__takeErpSso) code = parentWin.__takeErpSso(); } catch (e) {}
  if (!code) {
    var m = /[#&]sso=([a-f0-9]{20,})/.exec(location.hash || '');
    if (m) { code = m[1]; try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) {} }
  }
  function setVal(el, v) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function veil(on) {
    var v = document.getElementById('ne-sso-veil');
    if (on && !v) { v = document.createElement('div'); v.id = 'ne-sso-veil'; v.textContent = 'جارٍ فتح منظومة ERP…'; (document.body || document.documentElement).appendChild(v); }
    else if (!on && v) v.remove();
  }
  function trySso(n) {
    var u = document.querySelector('input[autocomplete="username"]'), p = document.querySelector('input[type="password"]');
    if (!u || !p) { if (n < 200) return setTimeout(function () { trySso(n + 1); }, 100); return veil(false); }
    setVal(u, '__sso__'); setVal(p, code); code = null;
    var f = u.closest('form');
    setTimeout(function () {
      if (f && f.requestSubmit) f.requestSubmit(); else { var b = f && f.querySelector('button[type=submit]'); if (b) b.click(); }
      setTimeout(function () { setVal(u, ''); setVal(p, ''); veil(false); }, 1500);
    }, 50);
  }
  if (code) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { veil(true); trySso(0); }); else { veil(true); trySso(0); } }

  /* ---------- 2) جلسة ERP ← جلسة العمل الميداني ---------- */
  var origPrefs = window.neLoadPrefs;
  window.neLoadPrefs = function (me, getToken) {
    NE.me = me; NE.getToken = getToken;
    try { fieldLogin(); } catch (e) {}
    return typeof origPrefs === 'function' ? origPrefs.apply(this, arguments) : undefined;
  };
  function deviceId() {
    try { var d = localStorage.getItem('ne.field.device'); if (!d) { d = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('ne.field.device', d); } return d; } catch (e) { return null; }
  }
  var loginBusy = null;
  function fieldLogin(force) {
    if (NE.field && !force) return Promise.resolve(NE.field);
    if (loginBusy) return loginBusy;
    var tok = NE.getToken && NE.getToken();
    if (!tok) return Promise.reject(new Error('سجّل الدخول إلى منظومة ERP أولاً'));
    loginBusy = fetch('/api/mobile/login-erp-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ erpToken: tok, deviceId: deviceId(), device: navigator.userAgent.slice(0, 120) }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'تعذّر فتح العمل الميداني'); return j; }); })
      .then(function (j) { NE.field = j; loginBusy = null; render(); return j; }, function (e) { loginBusy = null; NE.fieldError = e.message; render(); throw e; });
    return loginBusy;
  }
  // للإطار الداخلي (تطبيق العمل الميداني /app/?embed=1)
  window.__neFieldSession = function (force) { return fieldLogin(force); };
  window.__neFieldClose = function () { closeField(); };

  /* ---------- 3) قسم «العمل الميداني» داخل ERP (القائمة الجانبية + بطاقات الشاشة الرئيسية) ---------- */
  var SV = function (d) { return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var TOOLS = [
    { k: 'attendance', h: 'tasks', t: 'الحضور والمهام الميدانية', i: SV('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M11 8v8M15 8v8M18 8v8"/>') },
    { k: 'survey', h: 'survey', t: 'تطبيق الكشف', i: SV('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>') },
    { k: 'execution', h: 'execution', t: 'تطبيق التنفيذ', i: SV('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>') },
    { k: 'obstacles', h: 'obstacles', t: 'الإبلاغ عن معوّق', i: SV('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>') },
    { k: 'attadmin', h: 'attadm', t: 'إدارة رموز الحضور', i: SV('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M9 15v2M12 15v2M15 15v2"/>') },
    { k: 'reports', h: 'reports', t: 'رفع تقرير / استمارة', i: SV('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>') }
  ];
  var FIELD_PERMS = TOOLS.map(function (x) { return x.k; });
  function myTools() { var p = (NE.field && NE.field.perms) || []; return TOOLS.filter(function (x) { return p.indexOf(x.k) >= 0; }); }
  function hasField() { return myTools().length > 0; }
  function signedIn() { return !!document.querySelector('#root') && !document.querySelector('input[autocomplete="current-password"]') && !!document.querySelector('#root button, #root aside'); }
  function navGroup() {
    var nav = document.querySelector('#root aside nav'); var mine = document.getElementById('ne-field-nav');
    if (!nav || !hasField()) { if (mine) mine.remove(); return; }
    if (mine && nav.contains(mine)) { [].forEach.call(mine.querySelectorAll('a'), function (a) { a.classList.toggle('ne-on', isOpen() && curTool === a.getAttribute('data-h')); }); return; }
    var groups = nav.querySelectorAll(':scope > div'); if (!groups.length) return;
    var tpl = [].slice.call(nav.querySelectorAll('a[href^="#/"]')).filter(function (a) { return !/shadow-lift/.test(a.className); })[0] || nav.querySelector('a[href^="#/"]');
    var titleTpl = groups[0].firstElementChild;
    if (!tpl || !titleTpl) return;
    var g = document.createElement('div'); g.id = 'ne-field-nav';
    var title = titleTpl.cloneNode(false); title.textContent = 'العمل الميداني'; g.appendChild(title);
    var list = document.createElement('div'); list.className = (groups[0].children[1] && groups[0].children[1].className) || 'space-y-1'; g.appendChild(list);
    myTools().forEach(function (x) {
      var a = tpl.cloneNode(true); a.removeAttribute('aria-current'); a.setAttribute('href', '#/'); a.setAttribute('data-h', x.h); a.title = x.t;
      var bar = a.querySelector('.absolute'); if (bar) bar.remove();
      var spans = a.querySelectorAll(':scope > span');
      if (spans[0]) spans[0].innerHTML = x.i; if (spans[1]) spans[1].textContent = x.t; else a.appendChild(document.createTextNode(x.t));
      a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); openField(x.h); }, true);
      list.appendChild(a);
    });
    groups[0].parentNode.insertBefore(g, groups[0].nextSibling);
  }
  // بطاقات الشاشة الرئيسية (شبكة البطاقات بعد الدخول)
  function homeTiles() {
    var grid = [].slice.call(document.querySelectorAll('#root .grid')).filter(function (x) { return x.children.length >= 2 && [].every.call(x.children, function (c) { return c.tagName === 'BUTTON' || c.classList.contains('ne-ftile'); }); })[0];
    var old = document.querySelectorAll('.ne-ftile');
    if (!grid || !hasField()) { [].forEach.call(old, function (t) { t.remove(); }); return; }
    if (grid.querySelector('.ne-ftile')) return;
    var tpl = [].slice.call(grid.children).filter(function (c) { return c.tagName === 'BUTTON'; })[0]; if (!tpl) return;
    myTools().forEach(function (x, n) {
      var b = tpl.cloneNode(true); b.classList.add('ne-ftile'); b.style.animationDelay = (80 + n * 40) + 'ms';
      var sp = b.querySelectorAll(':scope > span');
      if (sp[0]) sp[0].innerHTML = x.i.replace(/width="19" height="19"/, 'width="42" height="42"').replace('stroke-width="2"', 'stroke-width="1.6"');
      if (sp[1]) sp[1].textContent = x.t;
      b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); openField(x.h); }, true);
      grid.appendChild(b);
    });
    grid.classList.add('ne-grid');
  }
  function navLink() { navGroup(); homeTiles(); }
  var curTool = null;
  var wrap = null;
  function isOpen() { return !!(wrap && !wrap.classList.contains('ne-hide')); }
  function openField(hash) {
    curTool = hash || 'tasks'; hash = curTool;
    if (!wrap) {
      wrap = document.createElement('div'); wrap.id = 'ne-field';
      wrap.innerHTML = '<div class="ne-fbar"><button type="button" id="ne-fback">→ رجوع</button><b id="ne-ftitle">العمل الميداني</b></div><iframe id="ne-fframe" allow="camera; microphone; geolocation; clipboard-write; fullscreen; web-share"></iframe>';
      document.body.appendChild(wrap);
      wrap.querySelector('#ne-fback').onclick = closeField;
      wrap.querySelector('#ne-fframe').src = '/app/?embed=1' + (hash ? '#' + hash : '');
    } else if (hash) { try { wrap.querySelector('#ne-fframe').contentWindow.location.hash = hash; } catch (e) {} }
    var t = TOOLS.filter(function (x) { return x.h === hash; })[0]; wrap.querySelector('#ne-ftitle').textContent = t ? t.t : 'العمل الميداني';
    wrap.classList.remove('ne-hide'); place(); closeNav(); navLink();
  }
  function closeField() { if (wrap) wrap.classList.add('ne-hide'); navLink(); }
  function place() {
    if (!wrap) return;
    var aside = document.querySelector('#root aside');
    var w = aside && window.innerWidth > 900 ? aside.getBoundingClientRect().width : 0;
    wrap.style.insetInlineStart = w + 'px';
  }
  window.addEventListener('resize', place);

  /* ---------- 4) الهاتف: قائمة جانبية منزلقة ---------- */
  function closeNav() { document.documentElement.classList.remove('ne-nav-open'); }
  function menuBtn() {
    var ex = document.getElementById('ne-menu'); if (ex && document.contains(ex) && ex.parentNode && ex.parentNode.tagName === 'HEADER') return; if (ex) ex.remove();
    var hdr = document.querySelector('#root header'); if (!hdr) return;
    var b = document.createElement('button'); b.id = 'ne-menu'; b.type = 'button'; b.setAttribute('aria-label', 'القائمة'); b.innerHTML = '☰';
    b.onclick = function () { document.documentElement.classList.toggle('ne-nav-open'); };
    if (!document.getElementById('ne-shade')) { var sh = document.createElement('div'); sh.id = 'ne-shade'; sh.onclick = closeNav; document.body.appendChild(sh); }
    hdr.insertBefore(b, hdr.firstChild);
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('#root aside nav a, #root .grid > button');
    if (a && !a.hasAttribute('data-h') && !a.classList.contains('ne-ftile')) { closeNav(); closeField(); }
  }, true);

  /* ---------- مراقبة الواجهة ---------- */
  var tick = null;
  function render() {
    var on = signedIn();
    document.documentElement.classList.toggle('ne-in', on);
    if (on) { menuBtn(); navLink(); place(); if (!NE.field && NE.getToken && !loginBusy && !NE.fieldError) fieldLogin().catch(function () {}); }
    else {
      // خرج من ERP ← إنهاء جلسة العمل الميداني
      if (NE.field || wrap) { NE.field = null; NE.fieldError = null; if (wrap) { wrap.remove(); wrap = null; } }
      closeNav();
    }
  }
  function schedule() { if (tick) return; tick = setTimeout(function () { tick = null; render(); }, 120); }
  function boot() { new MutationObserver(schedule).observe(document.getElementById('root') || document.body, { childList: true, subtree: true }); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  /* ---------- زر الرجوع (أندرويد) ---------- */
  window.appBack = function () {
    if (isOpen()) {
      try { var w = wrap.querySelector('#ne-fframe').contentWindow; if (w.appBack && w.appBack()) return true; } catch (e) {}
      closeField(); return true;
    }
    if (document.documentElement.classList.contains('ne-nav-open')) { closeNav(); return true; }
    var o = document.querySelector('.fixed.inset-0'); // نافذة منبثقة في ERP
    if (o) { var c = o.querySelector('button'); if (c) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } }
    if ((location.hash || '#/') !== '#/' && location.hash !== '#/dashboard') { history.back(); return true; }
    return false;
  };

  /* ---------- 5) أندرويد: حفظ وفتح الملفات ---------- */
  var AB = window.AndroidBridge;
  function nameOf(opts, fb) { try { return decodeURIComponent(opts.headers['x-name']); } catch (e) { return fb; } }
  function mimeOf(n) { return /\.pdf$/i.test(n) ? 'application/pdf' : /\.csv$/i.test(n) ? 'text/csv' : /\.xlsx?$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : /\.docx?$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.pptx?$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : /\.(png|jpe?g)$/i.test(n) ? 'image/' + n.split('.').pop().toLowerCase().replace('jpg', 'jpeg') : 'application/octet-stream'; }
  function b64(bytes, cb) { var r = new FileReader(); r.onload = function () { cb(String(r.result).split(',')[1] || ''); }; r.readAsDataURL(bytes instanceof Blob ? bytes : new Blob([bytes])); }
  function nativeSave(bytes, name, open) {
    return new Promise(function (res, rej) {
      b64(bytes, function (d) {
        var out = open && AB.shareFile ? AB.shareFile(d, name, mimeOf(name)) : AB.saveFile ? AB.saveFile(d, name, mimeOf(name)) : AB.savePdf(d, name);
        if (out && String(out).indexOf('ok') === 0) res(name); else rej(new Error(out || 'تعذّر الحفظ'));
      });
    });
  }
  if (AB && (AB.saveFile || AB.savePdf)) {
    var wrapT = function () {
      var T = window.__TAURI_INTERNALS__; if (!T || T.__neWrapped) return;
      var orig = T.invoke;
      T.invoke = function (cmd, args, opts) {
        if (cmd === 'save_download') return nativeSave(args, nameOf(opts, 'file'), false);
        if (cmd === 'open_file') return nativeSave(args, nameOf(opts, 'file'), true).then(function () { return null; });
        return orig.apply(this, arguments);
      };
      T.__neWrapped = true;
    };
    wrapT(); document.addEventListener('DOMContentLoaded', wrapT);
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('a[download]');
      if (!a || !/^blob:/.test(a.href)) return;
      ev.preventDefault();
      fetch(a.href).then(function (r) { return r.blob(); }).then(function (b) { nativeSave(b, a.getAttribute('download') || 'file', false); });
    }, true);
  }
})();
