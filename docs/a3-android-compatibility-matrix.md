# DoneDay A3 Android Compatibility Matrix

This is the evidence plan for A3. It separates automated/static checks from physical-device results. A green build or emulator result never proves that a locked, battery-managed device will ring.

## Baseline environment

- App target: Android API 36; minimum: API 24.
- Current local emulator: AOSP/Play Store API 37 only.
- No ADB device was attached when this plan was created, so no physical result is recorded here.
- The app must keep using Android `AlarmManager`; when exact alarms are unavailable it must describe the schedule as inexact.

## Test matrix

| Device family | Android versions | Required evidence |
| --- | --- | --- |
| Pixel / AOSP | 8, 11, 14, 16 | Exact and inexact alarm, background, terminated, locked, Doze, Battery Saver, timezone change, reboot, Stop/Snooze, simultaneous alarms. |
| Samsung | 11, 14, 16 | Above plus Sleeping apps / battery protection and lock-screen notification controls. |
| Xiaomi / Redmi | 11, 14 | Above plus Autostart and MIUI/HyperOS battery restrictions. |
| Oppo / OnePlus | 11, 14 | Above plus auto-launch and background-activity controls. |
| Huawei | 10, 12 | Above plus Protected apps / battery manager. |
| Motorola | 11, 14 | Above plus Battery Saver and notification-channel controls. |

Record model, manufacturer, Android/API level, build number, exact-alarm state, notification state, full-screen-intent state, DND state, battery restrictions, scheduled local time, observed trigger time, and outcome for every row.

## Required scenarios

1. Schedule a one-time Smart Alarm with the app foregrounded, backgrounded, force-closed, and locked.
2. Deny, allow, then revoke notifications, exact alarms, and full-screen intents. Verify the capability message and inexact fallback.
3. Test Stop and Snooze from the activity and notification actions.
4. Schedule two tasks for the same minute. Confirm one ringer, visible waiting count, FIFO promotion, and no duplicate ringing.
5. Complete, delete, and reschedule both active and queued task alarms.
6. Reboot before a future alarm; change device timezone; change clock; enable Doze and Battery Saver.
7. Validate one repeating alarm for daily, weekly, selected-day, and annual birthday cases.
8. Verify the API 24–27 MediaPlayer loop fallback and ringtone/vibration Stop/Snooze cleanup.

## A3 exit criteria

- At least one successful physical result for every scenario on Pixel/AOSP and Samsung.
- No P0 missed, duplicate, or unstoppable alarm in two consecutive scheduled attempts per scenario.
- Known OEM restrictions are documented in user-facing support guidance before release.
- Results from the API 37 emulator are labelled emulator-only and do not substitute for physical/OEM evidence.
