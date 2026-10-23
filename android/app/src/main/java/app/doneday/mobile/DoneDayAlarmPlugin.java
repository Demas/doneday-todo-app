package app.doneday.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DoneDayAlarm")
public class DoneDayAlarmPlugin extends Plugin {
    private JSObject capabilities() {
        AlarmManager manager = (AlarmManager) getContext().getSystemService(getContext().ALARM_SERVICE);
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms();
        boolean notifications = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("smartAlarms", exact && notifications);
        result.put("exactAlarms", exact);
        result.put("notificationPermission", notifications ? "granted" : "prompt");
        result.put("message", exact && notifications ? "Smart Alarms can be scheduled on this Android device." : "Allow notifications and exact alarms to use Smart Alarms. Battery-saving modes can still delay alarms on some devices.");
        return result;
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        call.resolve(capabilities());
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7142);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager manager = (AlarmManager) getContext().getSystemService(getContext().ALARM_SERVICE);
            if (!manager.canScheduleExactAlarms()) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            }
        }
        call.resolve(capabilities());
    }

    @PluginMethod
    public void syncAlarms(PluginCall call) {
        JSArray alarms = call.getArray("alarms", new JSArray());
        try {
            DoneDayAlarmScheduler.sync(getContext(), alarms);
            call.resolve();
        } catch (Exception error) {
            call.reject("DoneDay could not schedule Smart Alarms on this device.", error);
        }
    }

    @PluginMethod
    public void testAlarm(PluginCall call) {
        try {
            DoneDayAlarmScheduler.scheduleTest(getContext(), call.getData());
            call.resolve();
        } catch (Exception error) {
            call.reject("DoneDay could not schedule the Smart Alarm test.", error);
        }
    }
}
