package app.doneday.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
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
        NotificationManager notificationsManager = getContext().getSystemService(NotificationManager.class);
        boolean fullScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || notificationsManager.canUseFullScreenIntent();
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("smartAlarms", notifications);
        result.put("exactAlarms", exact);
        result.put("fullScreenIntents", fullScreen);
        result.put("notificationPermission", notifications ? "granted" : "prompt");
        if (!notifications) {
            result.put("message", "Allow notifications to show and ring Smart Alarms on this Android device.");
        } else if (!exact) {
            result.put("message", "Smart Alarms use Android's inexact fallback until exact-alarm access is allowed. Battery-saving modes can delay them.");
        } else if (!fullScreen) {
            result.put("message", "Smart Alarms will ring as notifications. Allow full-screen intents to show the alarm over the lock screen where Android permits it.");
        } else {
            result.put("message", "Smart Alarms can be scheduled on this Android device.");
        }
        return result;
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        call.resolve(capabilities());
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        boolean openedSettings = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7142);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager manager = (AlarmManager) getContext().getSystemService(getContext().ALARM_SERVICE);
            if (!manager.canScheduleExactAlarms()) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
                openedSettings = true;
            }
        }
        if (!openedSettings && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            if (!manager.canUseFullScreenIntent()) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
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
