package com.altakaalwataniyah.field;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * تطبيق الموظف الميداني – ALTAKA-ALWATANIYAH
 * غلاف WebView يوفّر: الكاميرا والمايكروفون المباشرين، الموقع الجغرافي، ماسح الباركود (ZXing)،
 * عدّاد وقت لا يتأثر بتغيير ساعة الهاتف، وفحوصات سلامة الجهاز (الوقت التلقائي، الموقع الوهمي).
 */
public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final int REQ_FILE = 101;
    private static final int REQ_MEDIA_PERM = 102;
    private static final int REQ_GEO_PERM = 103;
    private static final int REQ_START_PERM = 104;
    private static final String AUTHORITY = "com.altakaalwataniyah.field.fileprovider";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private PermissionRequest pendingMedia;
    private String geoOrigin;
    private GeolocationPermissions.Callback geoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // خادم الشركة يعمل غالباً على http داخل الشبكة المحلية
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // الكاميرا والمايكروفون لـ getUserMedia (السيلفي والفيديو المباشر)
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> need = new ArrayList<>();
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !has(Manifest.permission.CAMERA))
                            need.add(Manifest.permission.CAMERA);
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !has(Manifest.permission.RECORD_AUDIO))
                            need.add(Manifest.permission.RECORD_AUDIO);
                    }
                    if (need.isEmpty()) {
                        request.grant(request.getResources());
                    } else {
                        if (pendingMedia != null) pendingMedia.deny();
                        pendingMedia = request;
                        requestPermissions(need.toArray(new String[0]), REQ_MEDIA_PERM);
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (has(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    callback.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO_PERM);
                }
            }

            // اختيار الملفات: مستندات التقارير، وصور تطبيقَي الكشف والتنفيذ (كاميرا أو معرض)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                cameraUri = null;
                boolean images = false;
                String[] acc = params.getAcceptTypes();
                if (acc != null) for (String a : acc) if (a != null && a.startsWith("image")) images = true;
                try {
                    if (images && params.isCaptureEnabled()) {
                        File dir = new File(getCacheDir(), "camera");
                        dir.mkdirs();
                        File f = new File(dir, "IMG_" + System.currentTimeMillis() + ".jpg");
                        cameraUri = FileProvider.getUriForFile(MainActivity.this, AUTHORITY, f);
                        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(cam, REQ_FILE);
                        return true;
                    }
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    if (images) {
                        intent.setType("image/*");
                    } else {
                        intent.setType("*/*");
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                                "application/pdf", "image/*", "application/msword",
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                "application/vnd.ms-excel",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"});
                    }
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE)
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(intent, images ? "اختيار صور" : "اختيار ملف"), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        // طلب الأذونات الأساسية عند أول تشغيل
        List<String> first = new ArrayList<>();
        for (String p : new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION})
            if (!has(p)) first.add(p);
        if (Build.VERSION.SDK_INT < 29 && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE))
            first.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (Build.VERSION.SDK_INT >= 33 && !has("android.permission.POST_NOTIFICATIONS"))
            first.add("android.permission.POST_NOTIFICATIONS");
        if (!first.isEmpty()) requestPermissions(first.toArray(new String[0]), REQ_START_PERM);
        Notices.schedule(this);

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL + (getIntent() != null && getIntent().getBooleanExtra("openNotices", false) ? "#notices" : ""));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("openNotices", false) && web != null)
            web.evaluateJavascript("window.openNotices&&window.openNotices()", null);
    }

    private boolean has(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_MEDIA_PERM && pendingMedia != null) {
            boolean ok = true;
            for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
            if (ok) pendingMedia.grant(pendingMedia.getResources());
            else pendingMedia.deny();
            pendingMedia = null;
        } else if (requestCode == REQ_GEO_PERM && geoCallback != null) {
            geoCallback.invoke(geoOrigin, has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION), false);
            geoCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            if (fileCallback == null) return;
            Uri[] result = null;
            if (cameraUri != null) {
                if (resultCode == RESULT_OK) result = new Uri[]{cameraUri};
                cameraUri = null;
            } else if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        IntentResult r = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (r != null) {
            String text = r.getContents();
            String js;
            if (text != null) {
                js = "window.__scanCb&&window.__scanCb(" + JSONObject.quote(text) + ",null)";
            } else {
                js = "window.__scanCb&&window.__scanCb(null,'cancel')";
            }
            web.evaluateJavascript(js, null);
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack?String(window.appBack()):'false'", value -> {
            if (value == null || !value.contains("true")) MainActivity.super.onBackPressed();
        });
    }

    private class Bridge {
        @JavascriptInterface
        public void scan(final String prompt) {
            runOnUiThread(() -> {
                IntentIntegrator ii = new IntentIntegrator(MainActivity.this);
                ii.setCaptureActivity(ScanActivity.class);
                ii.setDesiredBarcodeFormats(IntentIntegrator.CODE_128, IntentIntegrator.QR_CODE);
                ii.setPrompt(prompt == null ? "" : prompt);
                ii.setBeepEnabled(true);
                ii.setOrientationLocked(true);
                ii.setBarcodeImageEnabled(false);
                ii.initiateScan();
            });
        }

        /** حفظ تقرير PDF (تطبيقا الكشف والتنفيذ) في مجلد التنزيلات */
        @JavascriptInterface
        public String savePdf(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String name = cleanName(filename);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/الطاقة الوطنية");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "error: insert";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "error: stream";
                        os.write(bytes);
                    }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "الطاقة الوطنية");
                    dir.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(new File(dir, name))) { fos.write(bytes); }
                }
                return "ok";
            } catch (Exception e) {
                return "error: " + e.getMessage();
            }
        }

        /** مشاركة تقرير PDF (واتساب، بريد…) */
        @JavascriptInterface
        public String sharePdf(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File f = new File(dir, cleanName(filename));
                try (FileOutputStream fos = new FileOutputStream(f)) { fos.write(bytes); }
                final Uri uri = FileProvider.getUriForFile(MainActivity.this, AUTHORITY, f);
                final Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/pdf");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "مشاركة التقرير")));
                return "ok";
            } catch (Exception e) {
                return "error: " + e.getMessage();
            }
        }

        /** وقت منذ تشغيل الجهاز بالمللي ثانية – لا يتغير بتغيير ساعة الهاتف */
        /** إشعار في شريط الهاتف (مرة واحدة لكل إشعار) */
        @JavascriptInterface
        public void notify(String id, String title, String body) {
            Notices.show(MainActivity.this, id, title, body);
        }

        /** يحفظ عنوان الخادم والجلسة ليفحص الهاتف الإشعارات والتطبيق مغلق */
        @JavascriptInterface
        public void setSession(String server, String token) {
            Notices.setSession(MainActivity.this, server, token);
        }

        @JavascriptInterface
        public String elapsed() {
            return String.valueOf(SystemClock.elapsedRealtime());
        }

        @JavascriptInterface
        public String device() {
            return Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE;
        }

        @JavascriptInterface
        public void vibrate() {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(70);
            } catch (Exception ignored) { }
        }

        /** فحوصات سلامة الجهاز ضد التلاعب */
        @JavascriptInterface
        public String integrity() {
            JSONObject o = new JSONObject();
            try {
                o.put("autoTime", Settings.Global.getInt(getContentResolver(), Settings.Global.AUTO_TIME, 1) == 1);
                o.put("autoTimeZone", Settings.Global.getInt(getContentResolver(), Settings.Global.AUTO_TIME_ZONE, 1) == 1);
                o.put("devOptions", Settings.Global.getInt(getContentResolver(), Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1);
                o.put("bootCount", Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1));
                o.put("mockLocation", isMockLocation());
                o.put("appVersion", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
            } catch (Exception ignored) { }
            return o.toString();
        }
    }

    private static String cleanName(String n) {
        if (n == null || n.trim().isEmpty()) n = "تقرير.pdf";
        n = n.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
        return n;
    }

    @SuppressWarnings("deprecation")
    private boolean isMockLocation() {
        try {
            if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) return false;
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return false;
            for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                Location l = lm.getLastKnownLocation(p);
                if (l == null) continue;
                if (Build.VERSION.SDK_INT >= 31 ? l.isMock() : l.isFromMockProvider()) return true;
            }
        } catch (Exception ignored) { }
        return false;
    }
}
