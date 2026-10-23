package app.doneday.mobile;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;

public class DoneDayAlarmActivity extends Activity {
    private String id;
    private Ringtone ringtone;
    private Vibrator vibrator;
    private boolean actionReceiverRegistered;
    private final BroadcastReceiver actionReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (id != null && id.equals(intent.getStringExtra(DoneDayAlarmScheduler.EXTRA_ID))) {
                stopAlarm();
                finish();
            }
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        id = getIntent().getStringExtra(DoneDayAlarmScheduler.EXTRA_ID);
        JSObject loaded = null;
        try { loaded = DoneDayAlarmScheduler.find(this, id); } catch (Exception ignored) { }
        final JSObject alarm = loaded;
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(48, 96, 48, 48);
        TextView title = new TextView(this); title.setText(alarm == null ? "DoneDay Smart Alarm" : alarm.getString("title", "DoneDay Smart Alarm")); title.setTextSize(28); content.addView(title);
        TextView body = new TextView(this); body.setText(alarm == null ? "Time for your task." : alarm.getString("body", "Time for your task.")); body.setTextSize(18); content.addView(body);
        Button snooze = new Button(this); snooze.setText("Snooze"); snooze.setOnClickListener(view -> { stopAlarm(); if (alarm != null) DoneDayAlarmScheduler.snooze(this, id, alarm.getInteger("snoozeMinutes", 10)); finish(); }); content.addView(snooze);
        Button stop = new Button(this); stop.setText("Stop"); stop.setOnClickListener(view -> { stopAlarm(); DoneDayAlarmScheduler.dismiss(this, id); finish(); }); content.addView(stop);
        setContentView(content);
        start(alarm);
    }
    private void start(JSObject alarm) {
        ringtone = android.media.RingtoneManager.getRingtone(this, alarm == null ? android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM) : DoneDayAlarmScheduler.ringtoneUri(alarm));
        if (ringtone != null) { ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()); if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) ringtone.setLooping(true); ringtone.play(); }
        if (alarm == null || alarm.getBoolean("vibrate", true)) { vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (vibrator != null) { if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 600, 450}, 0)); else vibrator.vibrate(new long[]{0, 600, 450}, 0); } }
    }
    private void stopAlarm() { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); if (vibrator != null) vibrator.cancel(); if (id != null) NotificationManagerCompat.from(this).cancel(id.hashCode()); }
    @Override protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(DoneDayAlarmScheduler.ACTION_DISMISS_RINGING);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(actionReceiver, filter);
        actionReceiverRegistered = true;
    }
    @Override protected void onStop() {
        if (actionReceiverRegistered) {
            unregisterReceiver(actionReceiver);
            actionReceiverRegistered = false;
        }
        super.onStop();
    }
    @Override protected void onDestroy() { stopAlarm(); super.onDestroy(); }
}
