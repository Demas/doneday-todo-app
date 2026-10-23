package app.doneday.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

public class DoneDayAlarmActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra(DoneDayAlarmScheduler.EXTRA_ID);
        if (id == null) return;
        NotificationManagerCompat.from(context).cancel(id.hashCode());
        boolean snoozed = "SNOOZE".equals(intent.getAction());
        if (snoozed) {
            DoneDayAlarmScheduler.snooze(context, id, intent.getIntExtra("minutes", 10));
        } else {
            DoneDayAlarmScheduler.dismiss(context, id);
        }
        Intent dismiss = new Intent(DoneDayAlarmScheduler.ACTION_DISMISS_RINGING)
            .setPackage(context.getPackageName())
            .putExtra(DoneDayAlarmScheduler.EXTRA_ID, id)
            .putExtra("snoozed", snoozed);
        context.sendBroadcast(dismiss);
    }
}
