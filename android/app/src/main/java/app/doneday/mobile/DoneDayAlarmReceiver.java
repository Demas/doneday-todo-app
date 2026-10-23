package app.doneday.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;

public class DoneDayAlarmReceiver extends BroadcastReceiver {
    static final String CHANNEL = "doneday_smart_alarms";
    @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra(DoneDayAlarmScheduler.EXTRA_ID);
        if (id == null) return;
        try {
            JSObject alarm = DoneDayAlarmScheduler.find(context, id);
            if (alarm == null) return;
            showNotification(context, id, alarm);
            DoneDayAlarmScheduler.rescheduleAfterFire(context, id);
        } catch (Exception ignored) { }
    }

    static void showNotification(Context context, String id, JSObject alarm) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "DoneDay Smart Alarms", NotificationManager.IMPORTANCE_HIGH));
        Intent display = new Intent(context, DoneDayAlarmActivity.class).putExtra(DoneDayAlarmScheduler.EXTRA_ID, id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullScreen = PendingIntent.getActivity(context, id.hashCode(), display, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(context, DoneDayAlarmActionReceiver.class).setAction("STOP").putExtra(DoneDayAlarmScheduler.EXTRA_ID, id);
        Intent snooze = new Intent(context, DoneDayAlarmActionReceiver.class).setAction("SNOOZE").putExtra(DoneDayAlarmScheduler.EXTRA_ID, id).putExtra("minutes", alarm.getInteger("snoozeMinutes", 10));
        NotificationCompat.Builder notice = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(alarm.getString("title", "DoneDay Smart Alarm"))
            .setContentText(alarm.getString("body", "Time for your task."))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .setSound(DoneDayAlarmScheduler.ringtoneUri(alarm))
            .addAction(0, "Snooze", PendingIntent.getBroadcast(context, id.hashCode() + 1, snooze, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .addAction(0, "Stop", PendingIntent.getBroadcast(context, id.hashCode() + 2, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        NotificationManagerCompat.from(context).notify(id.hashCode(), notice.build());
    }
}
