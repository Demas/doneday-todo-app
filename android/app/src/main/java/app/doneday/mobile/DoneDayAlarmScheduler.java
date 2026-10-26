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
import java.util.Arrays;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

public final class DoneDayAlarmScheduler {
    static final String PREFS = "doneday_smart_alarms";
    static final String STORED = "definitions";
    static final String TEMPORARY = "temporary_definitions";
    static final String EXTRA_ID = "alarm_id";
    static final String ACTION_RING = "app.doneday.mobile.RING";
    static final String ACTION_DISMISS_RINGING = "app.doneday.mobile.DISMISS_RINGING";
    static final String ACTION_QUEUE_CHANGED = "app.doneday.mobile.QUEUE_CHANGED";
    private static final long TEST_ALARM_LIFETIME_MS = 60 * 60 * 1000L;
    private static final Set<String> KNOWN_TIME_ZONES = new HashSet<>(Arrays.asList(TimeZone.getAvailableIDs()));

    private DoneDayAlarmScheduler() {}

    static void sync(Context context, JSArray alarms) throws Exception {
        JSONArray previous = storedDefinitions(context);
        Map<String, JSONObject> previousById = definitionsById(previous);
        JSONArray retained = new JSONArray();
        Set<String> retainedIds = new HashSet<>();

        for (int index = 0; index < alarms.length(); index++) {
            JSONObject candidate = alarms.getJSONObject(index);
            String id = candidate.optString("id");
            if (id.isEmpty() || retainedIds.contains(id)) continue;
            try {
                // AlarmManager replaces the PendingIntent for an unchanged ID. Scheduling first
                // keeps the existing alarm alive if a later replacement is malformed or fails.
                schedule(context, JSObject.fromJSONObject(candidate));
                retained.put(candidate);
                retainedIds.add(id);
            } catch (IllegalArgumentException ignored) {
                // Preserve a prior valid alarm if a new legacy definition cannot be resolved.
                // Never use TimeZone.getTimeZone's silent GMT fallback for the bad definition.
                JSONObject existing = previousById.get(id);
                if (existing != null) {
                    retained.put(existing);
                    retainedIds.add(id);
                }
            }
        }

        // Commit before cancelling removed alarms. If storage is unavailable, old definitions and
        // their scheduled PendingIntents are left intact instead of silently losing reminders.
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(STORED, retained.toString()).commit()) {
            throw new IllegalStateException("DoneDay could not save Smart Alarm schedules.");
        }
        for (int index = 0; index < previous.length(); index++) {
            String id = previous.getJSONObject(index).optString("id");
            if (!retainedIds.contains(id)) cancel(context, id);
        }
    }

    static void scheduleTest(Context context, JSObject test) throws Exception {
        Calendar at = Calendar.getInstance();
        at.add(Calendar.SECOND, 5);
        JSObject alarm = new JSObject();
        alarm.put("id", test.getString("id", "test"));
        alarm.put("title", test.getString("title", "DoneDay Smart Alarm"));
        alarm.put("body", test.getString("body", "This is a Smart Alarm test."));
        alarm.put("localDate", String.format("%04d-%02d-%02d", at.get(Calendar.YEAR), at.get(Calendar.MONTH) + 1, at.get(Calendar.DAY_OF_MONTH)));
        alarm.put("localTime", String.format("%02d:%02d", at.get(Calendar.HOUR_OF_DAY), at.get(Calendar.MINUTE)));
        alarm.put("timezone", TimeZone.getDefault().getID());
        alarm.put("timezoneMode", "fixed");
        alarm.put("version", 1);
        alarm.put("scheduleRevision", 1);
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

    private static JSONArray storedDefinitions(Context context) throws Exception {
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(STORED, "[]");
        return new JSONArray(saved);
    }

    private static Map<String, JSONObject> definitionsById(JSONArray alarms) throws Exception {
        Map<String, JSONObject> byId = new HashMap<>();
        for (int index = 0; index < alarms.length(); index++) {
            JSONObject alarm = alarms.getJSONObject(index);
            String id = alarm.optString("id");
            if (!id.isEmpty()) byId.put(id, alarm);
        }
        return byId;
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
        // Migration cleanup for pre-A2 schedules, whose PendingIntent identity
        // was only a hash code and could collide with a different alarm.
        manager.cancel(legacyPendingIntent(context, id));
    }

    private static void schedule(Context context, JSObject alarm) throws Exception {
        String[] date = alarm.getString("localDate", alarm.getString("date", "")).split("-");
        String[] time = alarm.getString("localTime", alarm.getString("time", "")).split(":");
        if (date.length != 3 || time.length != 2) throw new IllegalArgumentException("DoneDay alarm has an invalid local date or time.");
        TimeZone zone = timezoneFor(alarm);
        Calendar next = wallClock(date, time);
        String recurrence = alarm.getString("recurrence", "none");
        JSONArray selectedDays = alarm.optJSONArray("recurrenceDays");
        if (selectedDays == null) selectedDays = new JSONArray();
        long when = resolveWallClock(next, zone);
        while (when <= System.currentTimeMillis() && !"none".equals(recurrence)) {
            advance(next, recurrence, selectedDays);
            when = resolveWallClock(next, zone);
        }
        if (when > System.currentTimeMillis()) {
            scheduleAt(context, alarm, when);
        } else {
            // A one-time alarm already in the past must replace any old PendingIntent with
            // no alarm at all. This matters when an edit changes a future reminder to a
            // past date while sync is deliberately preserving schedules until replacement.
            cancel(context, alarm.getString("id"));
        }
    }

    private static TimeZone timezoneFor(JSObject alarm) {
        if ("follow-device".equals(alarm.getString("timezoneMode", "fixed"))) return TimeZone.getDefault();
        String id = alarm.getString("timezone", "");
        if (!KNOWN_TIME_ZONES.contains(id)) throw new IllegalArgumentException("DoneDay alarm timezone is not a valid IANA timezone.");
        return TimeZone.getTimeZone(id);
    }

    private static Calendar wallClock(String[] date, String[] time) {
        Calendar wall = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        wall.clear();
        wall.setLenient(false);
        wall.set(Integer.parseInt(date[0]), Integer.parseInt(date[1]) - 1, Integer.parseInt(date[2]), Integer.parseInt(time[0]), Integer.parseInt(time[1]), 0);
        wall.set(Calendar.MILLISECOND, 0);
        // Force date/time validation before passing values into a timezone.
        wall.getTimeInMillis();
        return wall;
    }

    /** DST policy: a spring-forward gap moves to its first valid local minute; a fall-back fold uses the earlier instant. */
    private static long resolveWallClock(Calendar wall, TimeZone zone) {
        Long direct = strictMillis(wall, zone);
        if (direct != null) return earliestMatchingOccurrence(wall, zone, direct);
        Calendar afterGap = (Calendar) wall.clone();
        for (int minute = 1; minute <= 180; minute++) {
            afterGap.add(Calendar.MINUTE, 1);
            Long shifted = strictMillis(afterGap, zone);
            if (shifted != null) return earliestMatchingOccurrence(afterGap, zone, shifted);
        }
        throw new IllegalArgumentException("DoneDay could not resolve this alarm time in the selected timezone.");
    }

    private static Long strictMillis(Calendar wall, TimeZone zone) {
        Calendar local = Calendar.getInstance(zone);
        local.clear();
        local.setLenient(false);
        local.set(wall.get(Calendar.YEAR), wall.get(Calendar.MONTH), wall.get(Calendar.DAY_OF_MONTH), wall.get(Calendar.HOUR_OF_DAY), wall.get(Calendar.MINUTE), 0);
        local.set(Calendar.MILLISECOND, 0);
        try { return local.getTimeInMillis(); }
        catch (IllegalArgumentException ignored) { return null; }
    }

    private static long earliestMatchingOccurrence(Calendar wall, TimeZone zone, long candidate) {
        long earliest = candidate;
        for (int minute = 1; minute <= 180; minute++) {
            long earlier = candidate - minute * 60_000L;
            Calendar actual = Calendar.getInstance(zone);
            actual.setTimeInMillis(earlier);
            if (sameWallClock(actual, wall)) earliest = earlier;
        }
        return earliest;
    }

    private static boolean sameWallClock(Calendar left, Calendar right) {
        return left.get(Calendar.YEAR) == right.get(Calendar.YEAR)
            && left.get(Calendar.MONTH) == right.get(Calendar.MONTH)
            && left.get(Calendar.DAY_OF_MONTH) == right.get(Calendar.DAY_OF_MONTH)
            && left.get(Calendar.HOUR_OF_DAY) == right.get(Calendar.HOUR_OF_DAY)
            && left.get(Calendar.MINUTE) == right.get(Calendar.MINUTE);
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
        Intent intent = new Intent(context, DoneDayAlarmReceiver.class)
            .setAction(ACTION_RING)
            .setData(alarmUri("ring", id))
            .putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent legacyPendingIntent(Context context, String id) {
        Intent intent = new Intent(context, DoneDayAlarmReceiver.class).setAction(ACTION_RING).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Uri alarmUri(String purpose, String id) {
        return new Uri.Builder().scheme("doneday").authority("alarm").appendPath(purpose).appendPath(id).build();
    }
}
