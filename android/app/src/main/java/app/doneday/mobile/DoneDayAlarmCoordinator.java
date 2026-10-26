package app.doneday.mobile;

import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;

/**
 * Coordinates due Smart Alarms. Android can deliver multiple AlarmManager
 * broadcasts together; DoneDay rings one alarm and keeps the others in a
 * persistent FIFO queue until the active alarm is stopped or snoozed.
 */
final class DoneDayAlarmCoordinator {
    private static final String ACTIVE = "active_ringing_alarm_id";
    private static final String QUEUE = "queued_ringing_alarm_ids";
    private static final Object LOCK = new Object();

    private DoneDayAlarmCoordinator() {}

    /** @return true only when this ID became the one alarm allowed to ring. */
    static boolean enqueue(Context context, String id) {
        synchronized (LOCK) {
            String active = preferences(context).getString(ACTIVE, "");
            JSONArray queue = readQueue(context);
            if (id.equals(active) || contains(queue, id)) return false;
            if (active.isEmpty()) {
                save(context, id, queue);
                notifyQueueChanged(context, id);
                return true;
            }
            queue.put(id);
            save(context, active, queue);
            notifyQueueChanged(context, active);
            return false;
        }
    }

    /** Removes an active alarm and returns the next queued ID, if any. */
    static String finish(Context context, String id) {
        synchronized (LOCK) {
            String active = preferences(context).getString(ACTIVE, "");
            JSONArray queue = readQueue(context);
            if (!id.equals(active)) {
                remove(queue, id);
                save(context, active, queue);
                notifyQueueChanged(context, active);
                return "";
            }
            String next = queue.length() == 0 ? "" : queue.optString(0, "");
            JSONArray remaining = new JSONArray();
            for (int index = 1; index < queue.length(); index++) remaining.put(queue.optString(index));
            save(context, next, remaining);
            notifyQueueChanged(context, next);
            return next;
        }
    }

    static int queuedCount(Context context) {
        synchronized (LOCK) { return readQueue(context).length(); }
    }

    /** A restarted process has no ringtone/activity to resume, so stale runtime state must not block future alarms. */
    static void resetAfterDeviceRestart(Context context) {
        synchronized (LOCK) {
            save(context, "", new JSONArray());
            notifyQueueChanged(context, "");
        }
    }

    private static android.content.SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(DoneDayAlarmScheduler.PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readQueue(Context context) {
        try { return new JSONArray(preferences(context).getString(QUEUE, "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static void save(Context context, String active, JSONArray queue) {
        if (!preferences(context).edit().putString(ACTIVE, active).putString(QUEUE, queue.toString()).commit()) {
            throw new IllegalStateException("DoneDay could not save the Smart Alarm queue.");
        }
    }

    private static boolean contains(JSONArray queue, String id) {
        for (int index = 0; index < queue.length(); index++) if (id.equals(queue.optString(index))) return true;
        return false;
    }

    private static void remove(JSONArray queue, String id) {
        for (int index = queue.length() - 1; index >= 0; index--) if (id.equals(queue.optString(index))) queue.remove(index);
    }

    private static void notifyQueueChanged(Context context, String activeId) {
        context.sendBroadcast(new Intent(DoneDayAlarmScheduler.ACTION_QUEUE_CHANGED)
            .setPackage(context.getPackageName())
            .putExtra(DoneDayAlarmScheduler.EXTRA_ID, activeId));
    }
}
