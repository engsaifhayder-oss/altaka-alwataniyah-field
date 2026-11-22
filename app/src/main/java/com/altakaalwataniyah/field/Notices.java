package com.altakaalwataniyah.field;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * إشعارات الإدارة الهندسية / الإدارة العليا:
 *  - تظهر في شريط إشعارات الهاتف حتى والتطبيق مغلق (فحص كل 15 دقيقة عبر WorkManager)
 *  - وفوراً حين يكون التطبيق مفتوحاً (من الواجهة عبر AndroidBridge.notify)
 */
public final class Notices {
    static final String PREFS = "field_notices";
    static final String CHANNEL = "notices";

    private Notices() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void setSession(Context c, String server, String token) {
        prefs(c).edit().putString("server", server == null ? "" : server).putString("token", token == null ? "" : token).apply();
        schedule(c);
    }

    static void schedule(Context c) {
        try {
            Constraints k = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest w = new PeriodicWorkRequest.Builder(PollWorker.class, 15, TimeUnit.MINUTES).setConstraints(k).build();
            WorkManager.getInstance(c).enqueueUniquePeriodicWork("field-notices", ExistingPeriodicWorkPolicy.KEEP, w);
        } catch (Exception ignored) { }
    }

    /** يعرض الإشعار مرة واحدة فقط لكل رقم إشعار */
    static synchronized void show(Context c, String id, String title, String body) {
        SharedPreferences sp = prefs(c);
        Set<String> seen = new HashSet<>(sp.getStringSet("seen", new HashSet<>()));
        if (id != null && !id.isEmpty()) {
            if (seen.contains(id)) return;
            seen.add(id);
            sp.edit().putStringSet("seen", seen).apply();
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "إشعارات الإدارة", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("إشعارات الإدارة الهندسية والإدارة العليا");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("openNotices", true);
        PendingIntent pi = PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title == null || title.isEmpty() ? "إشعار جديد" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        try {
            nm.notify(id == null ? (int) System.currentTimeMillis() : id.hashCode(), b.build());
        } catch (SecurityException ignored) { } // إذن الإشعارات غير ممنوح
    }

    public static class PollWorker extends Worker {
        public PollWorker(Context c, WorkerParameters p) { super(c, p); }

        @Override
        public Result doWork() {
            Context c = getApplicationContext();
            SharedPreferences sp = prefs(c);
            String server = sp.getString("server", ""), token = sp.getString("token", "");
            if (server.isEmpty() || token.isEmpty()) return Result.success();
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL(server + "/api/mobile/notifications").openConnection();
                con.setRequestProperty("Authorization", "Bearer " + token);
                con.setConnectTimeout(15000);
                con.setReadTimeout(20000);
                if (con.getResponseCode() != 200) return Result.success();
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONArray a = new JSONObject(sb.toString()).optJSONArray("notifications");
                if (a == null) return Result.success();
                for (int i = Math.min(a.length(), 5) - 1; i >= 0; i--) {
                    JSONObject n = a.getJSONObject(i);
                    if (n.optBoolean("read")) continue;
                    String from = n.optString("from", "");
                    show(c, n.optString("id"), n.optString("title"), (from.isEmpty() ? "" : from + ": ") + n.optString("body"));
                }
            } catch (Exception ignored) {
            } finally {
                if (con != null) con.disconnect();
            }
            return Result.success();
        }
    }
}
