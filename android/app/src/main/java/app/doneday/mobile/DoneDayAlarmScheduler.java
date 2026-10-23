package app.doneday.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.TimeZone;

public final class DoneDayAlarmScheduler {
    static final String PREFS = "doneday_smart_alarms";
    static final String STORED = "definitions";
    static final String TEMPORARY = "temporary_definitions";
    static final String EXTRA_ID = "alarm_id";
    static final String ACTION_RING = "app.doneday.mobile.RING";
    static final String ACTION_DISMISS_RINGING = "app.doneday.mobile.DISMISS_RINGING";
    private static final long TEST_ALARM_LIFETIME_MS = 60 * 60 * 1000L;

    private DoneDayAlarmScheduler() {}

    static void sync(Context context, JSArray alarms) throws Exception {
        cancelStored(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(STORED, alarms.toString()).apply();
        for (int index = 0; index < alarms.length(); index++) {
            schedule(context, JSObject.fromJSONObject(alarms.getJSONObject(index)));
        }
    }

    static void scheduleTest(Context context, JSObject test) throws Exception {
        Calendar at = Calendar.getInstance();
        at.add(Calendar.SECOND, 5);
        JSObject alarm = new JSObject();
        alarm.put("id", test.getString("id", "test"));
        alarm.put("title", test.getString("title", "DoneDay Smart Alarm"));
        alarm.put("body", test.getString("body", "This is a Smart Alarm test."));
        alarm.put("date", String.format("%04d-%02d-%02d", at.get(Calendar.YEAR), at.get(Calendar.MONTH) + 1, at.get(Calendar.DAY_OF_MONTH)));
        alarm.put("time", String.format("%02d:%02d", at.get(Calendar.HOUR_OF_DAY), at.get(Calendar.MINUTE)));
        alarm.put("timezone", TimeZone.getDefault().getID());
        alarm.put("recurrence", "none");
        alarm.put("ringtone", test.getString("ringtone", "alarm"));
        alarm.put("vibrate", test.getBoolean("vibrate", true));
        alarm.put("snoozeMinutes", test.getInteger("snoozeMinutes", 10));
        alarm.put("temporary", true);
        alarm.put("expiresAt", System.currentTimeMillis() + TEST_ALARM_LIFETIME_MS);
        storeTemporary(context, alarm);
        scheduleAt(context, alarm, System.currentTimeMillis() + 5000L);
    }

    static void rescheduleAfterFire(Context context, String id) {
        try {
            JSObject alarm = find(context, id);
            if (alarm == null || "none".equals(alarm.getString("recurrence", "none"))) return;
            schedule(context, alarm);
        } catch (Exception ignored) { }
    }

    static void snooze(Context context, String id, int minutes) {
        try {
            JSObject alarm = find(context, id);
            if (alarm != null) scheduleAt(context, alarm, System.currentTimeMillis() + minutes * 60_000L);
        } catch (Exception ignored) { }
    }

    /** Removes a completed test alarm without changing the user's saved alarm definitions. */
    static void dismiss(Context context, String id) {
        try {
            if (removeTemporary(context, id)) cancel(context, id);
        } catch (Exception ignored) { }
    }

    static JSObject find(Context context, String id) throws Exception {
        JSObject savedAlarm = findIn(context, STORED, id);
        return savedAlarm != null ? savedAlarm : findIn(context, TEMPORARY, id);
    }

    static Uri ringtoneUri(JSObject alarm) {
        String ringtone = alarm.getString("ringtone", "alarm");
        if ("notification".equals(ringtone)) return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if ("ringtone".equals(ringtone)) return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
    }

    private static JSObject findIn(Context context, String key, String id) throws Exception {
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, "[]");
        JSONArray alarms = new JSONArray(saved);
        for (int index = 0; index < alarms.length(); index++) {
            JSONObject value = alarms.getJSONObject(index);
            if (id.equals(value.optString("id"))) return JSObject.fromJSONObject(value);
        }
        return null;
    }

    private static void cancelStored(Context context) throws Exception {
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(STORED, "[]");
        JSONArray alarms = new JSONArray(saved);
        for (int index = 0; index < alarms.length(); index++) cancel(context, alarms.getJSONObject(index).optString("id"));
    }

    private static void storeTemporary(Context context, JSObject alarm) throws Exception {
        JSONArray current = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TEMPORARY, "[]"));
        JSONArray retained = new JSONArray();
        long now = System.currentTimeMillis();
        String id = alarm.getString("id");
        for (int index = 0; index < current.length(); index++) {
            JSONObject value = current.getJSONObject(index);
            String existingId = value.optString("id");
            if (id.equals(existingId) || value.optLong("expiresAt", Long.MAX_VALUE) <= now) {
                cancel(context, existingId);
            } else {
                retained.put(value);
            }
        }
        retained.put(new JSONObject(alarm.toString()));
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TEMPORARY, retained.toString()).commit()) {
            throw new IllegalStateException("DoneDay could not save the Smart Alarm test.");
        }
    }

    private static boolean removeTemporary(Context context, String id) throws Exception {
        JSONArray current = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TEMPORARY, "[]"));
        JSONArray retained = new JSONArray();
        boolean removed = false;
        for (int index = 0; index < current.length(); index++) {
            JSONObject value = current.getJSONObject(index);
            if (id.equals(value.optString("id"))) {
                removed = true;
            } else {
                retained.put(value);
            }
        }
        if (removed && !context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TEMPORARY, retained.toString()).commit()) {
            throw new IllegalStateException("DoneDay could not clear the Smart Alarm test.");
        }
        return removed;
    }

    static void cancel(Context context, String id) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        manager.cancel(pendingIntent(context, id));
    }

    private static void schedule(Context context, JSObject alarm) throws Exception {
        String[] date = alarm.getString("date").split("-");
        String[] time = alarm.getString("time").split(":");
        TimeZone zone = TimeZone.getTimeZone(alarm.getString("timezone", TimeZone.getDefault().getID()));
        Calendar next = Calendar.getInstance(zone);
        next.set(Calendar.YEAR, Integer.parseInt(date[0]));
        next.set(Calendar.MONTH, Integer.parseInt(date[1]) - 1);
        next.set(Calendar.DAY_OF_MONTH, Integer.parseInt(date[2]));
        next.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time[0]));
        next.set(Calendar.MINUTE, Integer.parseInt(time[1]));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        String recurrence = alarm.getString("recurrence", "none");
        while (next.getTimeInMillis() <= System.currentTimeMillis() && !"none".equals(recurrence)) advance(next, recurrence, alarm.getJSONArray("recurrenceDays"));
        if (next.getTimeInMillis() > System.currentTimeMillis()) scheduleAt(context, alarm, next.getTimeInMillis());
    }

    private static void advance(Calendar next, String recurrence, JSONArray selectedDays) throws Exception {
        if ("daily".equals(recurrence)) next.add(Calendar.DAY_OF_YEAR, 1);
        else if ("weekly".equals(recurrence)) next.add(Calendar.WEEK_OF_YEAR, 1);
        else if ("monthly".equals(recurrence)) next.add(Calendar.MONTH, 1);
        else if ("annual".equals(recurrence)) next.add(Calendar.YEAR, 1);
        else {
            next.add(Calendar.DAY_OF_YEAR, 1);
            while ("weekdays".equals(recurrence) ? next.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY || next.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY : !containsDay(selectedDays, next.get(Calendar.DAY_OF_WEEK) - 1)) next.add(Calendar.DAY_OF_YEAR, 1);
        }
    }

    private static boolean containsDay(JSONArray days, int day) throws Exception {
        for (int index = 0; index < days.length(); index++) if (days.getInt(index) == day) return true;
        return false;
    }

    private static void scheduleAt(Context context, JSObject alarm, long at) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pending = pendingIntent(context, alarm.getString("id"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    private static PendingIntent pendingIntent(Context context, String id) {
        Intent intent = new Intent(context, DoneDayAlarmReceiver.class).setAction(ACTION_RING).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
