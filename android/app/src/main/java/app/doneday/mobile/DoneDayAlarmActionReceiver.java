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
        if ("SNOOZE".equals(intent.getAction())) DoneDayAlarmScheduler.snooze(context, id, intent.getIntExtra("minutes", 10));
    }
}
