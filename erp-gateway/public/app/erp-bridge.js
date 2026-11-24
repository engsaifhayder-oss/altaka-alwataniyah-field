/* ALTAKA-ALWATANIYAH — جسر واجهة منظومة ERP داخل التطبيق الموحد.
   تحقنه البوابة في صفحة ERP المخدومة من /erp/ (الأصل نفسه للتطبيق):
   - الدخول الواحد: يأخذ رمز الدخول لمرة واحدة من التطبيق ويكمل دخول ERP تلقائياً (بلا كلمة مرور).
   - أندرويد: حفظ الملفات والتقارير التي تنزّلها المنظومة في مجلد التنزيلات عبر جسر التطبيق.
   - عند فتح المنظومة مباشرة (خارج التطبيق) يظهر زر للعودة إلى التطبيق. */
(function () {
  'use strict';
  var inApp = false, parentWin = null;
  try { if (window.parent !== window && window.parent.location.origin === location.origin) { inApp = true; parentWin = window.parent; } } catch (e) {}

  /* ---------- الدخول الواحد ---------- */
  var code = null;
  try { if (parentWin && parentWin.__takeErpSso) code = parentWin.__takeErpSso(); } catch (e) {}
  if (!code) {
    var m = /[#&]sso=([a-f0-9]{20,})/.exec(location.hash || '');
    if (m) { code = m[1]; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  }
  function setVal(el, v) {
    var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function veil(on) {
    var v = document.getElementById('ne-sso-veil');
    if (on && !v) {
      v = document.createElement('div'); v.id = 'ne-sso-veil';
      v.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f4f7f5;display:grid;place-items:center;font:600 16px system-ui,sans-serif;color:#194239';
      v.textContent = 'جارٍ فتح منظومة ERP…';
      (document.body || document.documentElement).appendChild(v);
    } else if (!on && v) v.remove();
  }
  function trySso(tries) {
    var u = document.querySelector('input[autocomplete="username"]'), p = document.querySelector('input[type="password"]');
    if (!u || !p) { if (tries < 200) return setTimeout(function () { trySso(tries + 1); }, 100); veil(false); return; }
    setVal(u, '__sso__'); setVal(p, code); code = null;
    var f = u.closest('form');
    setTimeout(function () {
      if (f && f.requestSubmit) f.requestSubmit(); else { var b = f && f.querySelector('button[type=submit]'); if (b) b.click(); }
      setTimeout(function () { setVal(u, ''); setVal(p, ''); veil(false); }, 1500);
    }, 50);
  }
  if (code) { veil(true); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { veil(true); trySso(0); }); else trySso(0); }

  // يعرف التطبيق أن جلسة المنظومة قائمة (تختفي شاشة الدخول)
  setInterval(function () {
    try { window.__erpSignedIn = !document.querySelector('input[autocomplete="current-password"]'); } catch (e) {}
  }, 1000);

  /* ---------- أندرويد: حفظ الملفات المنزّلة ---------- */
  var AB = window.AndroidBridge;
  function nameOf(opts, fb) { try { return decodeURIComponent(opts.headers['x-name']); } catch (e) { return fb; } }
  function mimeOf(n) { return /\.pdf$/i.test(n) ? 'application/pdf' : /\.csv$/i.test(n) ? 'text/csv' : /\.xlsx?$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : /\.docx?$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.(png|jpe?g)$/i.test(n) ? 'image/' + n.split('.').pop().toLowerCase().replace('jpg', 'jpeg') : 'application/octet-stream'; }
  function b64(bytes, cb) {
    var r = new FileReader();
    r.onload = function () { cb(String(r.result).split(',')[1] || ''); };
    r.readAsDataURL(bytes instanceof Blob ? bytes : new Blob([bytes]));
  }
  function nativeSave(bytes, name, share) {
    return new Promise(function (res, rej) {
      b64(bytes, function (d) {
        var out = share && AB.shareFile ? AB.shareFile(d, name, mimeOf(name)) : AB.saveFile ? AB.saveFile(d, name, mimeOf(name)) : AB.savePdf(d, name);
        if (out && String(out).indexOf('ok') === 0) {
          if (!share) try { (parentWin && parentWin.toast ? parentWin.toast : function () {})('حُفظ في التنزيلات: ' + name); } catch (e) {}
          res(name);
        } else rej(new Error(out || 'تعذّر الحفظ'));
      });
    });
  }
  if (AB && (AB.saveFile || AB.savePdf)) {
    var wrap = function () {
      var T = window.__TAURI_INTERNALS__; if (!T || T.__neWrapped) return;
      var orig = T.invoke;
      T.invoke = function (cmd, args, opts) {
        if (cmd === 'save_download') return nativeSave(args, nameOf(opts, 'file'), false);
        if (cmd === 'open_file') return nativeSave(args, nameOf(opts, 'file'), true).then(function () { return null; });
        return orig.apply(this, arguments);
      };
      T.__neWrapped = true;
    };
    wrap(); document.addEventListener('DOMContentLoaded', wrap);
    // روابط التنزيل العادية (a[download] بملف blob)
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('a[download]');
      if (!a || !/^blob:/.test(a.href)) return;
      ev.preventDefault();
      fetch(a.href).then(function (r) { return r.blob(); }).then(function (b) { nativeSave(b, a.getAttribute('download') || 'file', false); });
    }, true);
  }

  /* ---------- خارج التطبيق: زر العودة ---------- */
  if (!inApp) {
    window.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('a');
      b.href = '/app/'; b.textContent = '⬅ التطبيق الموحد';
      b.style.cssText = 'position:fixed;left:14px;bottom:18px;z-index:60;font:600 13px system-ui,sans-serif;background:#194239;color:#fff;border-radius:999px;padding:9px 14px;text-decoration:none;box-shadow:0 6px 18px rgba(13,38,32,.25);opacity:.9';
      document.body.appendChild(b);
    });
  }
})();
