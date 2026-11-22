# واجهة الربط – بوابة الموظفين الميدانيين ↔ ALTAKA-ALWATANIYAH ERP

البوابة تعمل على جهاز الخادم نفسه (المنفذ الافتراضي `8780`). كل الطلبات والردود بصيغة JSON (UTF-8).

## 1) ربط منظومة ERP (مفتاح API)

يُرسل المفتاح في الترويسة `X-Api-Key` (يظهر عند تشغيل الخادم وفي «الإعدادات والربط» بلوحة الإدارة، ومحفوظ في `data/config.json`).

### سحب البيانات الجديدة
```
GET /api/erp/export?since=2026-11-01T00:00:00Z
```
يرجع: `events` (الحضور والخطوات)، `forms` (استمارات الكشف والتنفيذ)، `obstacles` (المعوقات)، `reports` (التقارير المرفوعة)، `tasks`.
احفظ قيمة `serverTime` في الرد واستعملها في `since` بالطلب التالي.

روابط الملفات: `GET /media/<files[].path>?key=<API_KEY>` (السيلفي، الصور، الفيديو، المستندات). لكل ملف بصمة `sha256`.

### دفع الموظفين والمهام من ERP
```
POST /api/erp/sync
{
  "employees":  [{ "code":"1001", "name":"...", "department":"الإدارة الهندسية", "jobTitle":"فني", "phone":"07..", "pin":"1234", "active":true }],
  "warehouses": [{ "id":"WH1", "name":"المخزن الرئيسي", "lat":32.46, "lng":44.42, "radiusM":300 }],
  "equipment":  [{ "id":"EQ1", "name":"ألواح شمسية", "unit":"قطعة" }],
  "tasks": [{
     "erpRef":"SO-2026-0041", "type":"inspection | execution",
     "customerName":"...", "customerPhone":"...", "address":"...", "lat":null, "lng":null,
     "contractNo":"", "systemCapacity":"", "date":"2026-11-20", "notes":"",
     "warehouseId":"WH1", "assigneeCodes":["1001","1002"],
     "equipmentPlan":[{"id":"EQ1","name":"ألواح شمسية","qty":16}]
  }]
}
```
المهمة تُحدَّث إذا وُجد نفس `erpRef`. الرمز السري `pin` يُخزن مُشفّراً (scrypt).

### الموظفون الميدانيون
```
GET /api/erp/employees
```
يرجع `code, name, department, jobTitle, phone, email, active, lastSeen` — تستعمله ERP لاختيار مستلمي الإشعارات ولإرسال البريد والواتساب.

### الإشعارات (من الإدارة الهندسية / الإدارة العليا)
```
POST /api/erp/notify
{ "erpId":"…", "title":"…", "body":"…", "priority":"normal|high", "audience":"all|list", "codes":["1001"], "from":"…", "fromUnit":"…" }
```
يظهر الإشعار في تطبيق كل موظف مستهدف (جرس + شاشة «الإشعارات» + إشعار في شريط الهاتف على أندرويد حتى والتطبيق مغلق — فحص كل 15 دقيقة).
تأكيدات القراءة ترجع في `notifications[].reads` ضمن `/api/erp/export`.
الهاتف: `GET /api/mobile/notifications` · `POST /api/mobile/notifications/read {ids:[…]}`.

### ربط التقارير بمسار المشروع في ERP
- المهام التي تدفعها ERP تحمل `erpRef` بصيغة `FP-2026-0001-S` (كشف) و `FP-2026-0001-E` (تنفيذ).
- استمارة الكشف (`formType=inspection`) أو تقرير «تطبيق الكشف» (`reportType=inspection`) ← قسم التصميم.
- استمارة التنفيذ (`formType=execution`) أو تقرير «تطبيق التنفيذ» (`reportType=execution`) ← قسم الإشراف والتنفيذ ثم الأرشيف.

## 2) سجل الخطوة (event)
```json
{
  "id":"ev_…", "clientId":"ev-…", "taskId":"T_…", "employeeId":"E1", "employeeName":"…",
  "step":"wh_in | wh_out | site_in | site_done | wh_return",
  "code":"NWWH1-8FB042B1",
  "gps":{"lat":32.4639,"lng":44.4199,"accuracy":12},
  "deviceTime":"…", "correctedTime":"… (حسب ساعة الخادم)", "receivedAt":"…",
  "equipment":[{"id":"EQ1","name":"…","qty":16,"taken":16,"condition":"سليمة"}],
  "integrity":{"source":"live-camera","autoTime":true,"mockLocation":false,"devOptions":false},
  "distanceM":36, "flags":["…تنبيهات التلاعب إن وجدت…"],
  "files":[{"field":"selfie","path":"2026-11/selfies/f_….jpg","sha256":"…"}]
}
```

| الخطوة | الباركود المطلوب | المعنى في ERP |
|---|---|---|
| `wh_in` | باركود المخزن | **حضور** (بداية الدوام) |
| `wh_out` | باركود المخزن | استلام معدات / مغادرة المخزن |
| `site_in` | باركود موقع الزبون | الوصول إلى الزبون |
| `site_done` | باركود موقع الزبون | إتمام العمل (بعد إرسال الاستمارة) |
| `wh_return` | باركود المخزن | إرجاع المعدات + **انصراف** |

### التنبيهات (flags) التي يضعها الخادم تلقائياً
باركود مزوّر (توقيع HMAC غير صحيح) · نوع باركود لا يطابق الخطوة · باركود زبون آخر · خارج النطاق الجغرافي · دقة موقع ضعيفة · لا يوجد موقع · ساعة الهاتف مختلفة عن الخادم · الوقت التلقائي مغلق · موقع وهمي · تخطّي خطوة · خطوة مكررة · بصمة ملف لا تطابق (تعديل الصورة) · سيلفي ليس من الكاميرا المباشرة.

## 3) صيغة الباركود
`NW<رقم المخزن>-<sig>` للمخزن (مثال `NWWH1-8FB042B1`)، و `NT<رقم المهمة>-<sig>` لموقع الزبون (مثال `NT1004-672F20CB`).
`sig` = أول 8 خانات من `HMAC-SHA256(secret, kind|key)` – السر في `data/config.json` ولا يغادر الخادم. النوع: Code 128.

## 4) واجهة الهاتف (للمرجع)
`POST /api/mobile/login` · `GET /api/mobile/bootstrap` · `POST /api/mobile/{events|forms|obstacles|reports}` (multipart: `meta` + ملفات) · `GET /api/mobile/ping`.
كل طلب يحمل `clientId` فريداً، لذلك إعادة الإرسال بعد انقطاع الإنترنت لا تُكرر السجل.
