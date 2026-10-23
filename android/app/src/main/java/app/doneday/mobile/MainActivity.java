package app.doneday.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(DoneDayAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
