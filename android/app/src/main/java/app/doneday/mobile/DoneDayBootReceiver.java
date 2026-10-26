package app.doneday.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSArray;

public class DoneDayBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
                DoneDayAlarmCoordinator.resetAfterDeviceRestart(context);
            }
            String saved = context.getSharedPreferences(DoneDayAlarmScheduler.PREFS, Context.MODE_PRIVATE).getString(DoneDayAlarmScheduler.STORED, "[]");
            DoneDayAlarmScheduler.sync(context, new JSArray(saved));
        } catch (Exception ignored) { }
    }
}
