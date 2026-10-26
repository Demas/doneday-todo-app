# DoneDay Alarm Schedule Contract (Phase A1)

Phase A1 introduces the shared, versioned schedule representation used when DoneDay turns a task or birthday Smart Alarm into a native device schedule. It does not change cloud delivery, subscriptions, native ringing, Stop, Snooze, or simultaneous-alarm behavior.

## Version 1 definition

```ts
type AlarmScheduleDefinition = {
  version: 1
  reminderId: string
  localDate: 'YYYY-MM-DD'
  localTime: 'HH:mm'
  timezone: string // validated and canonicalized IANA identifier
  timezoneMode: 'fixed' | 'follow-device'
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'selected-days' | 'annual'
  recurrenceDays: number[] // Sunday = 0 through Saturday = 6
  scheduleRevision: number // positive integer
}
```

`reminderId` is stable for the task/birthday (`task:<id>` or `birthday:<id>`). `localDate` and `localTime` remain civil values; they are not converted to a browser-local JavaScript date before native scheduling. The native bridge adds display, sound, vibration, and snooze properties without changing this contract.

## Timezone rules

- **Fixed timezone is the default.** `timezone` must be a valid IANA identifier. A task at `09:00 Africa/Lagos` remains associated with that wall-clock time while a person travels.
- **Follow device is opt-in.** `timezoneMode: 'follow-device'` preserves the selected wall-clock time but resolves it in the Android device's current validated timezone. Android reschedules stored definitions after the system's timezone-change broadcast.
- An invalid saved timezone is preserved in app data so the person can repair it, but it produces no native definition and is never handed to `TimeZone.getTimeZone()`. This prevents Android's silent GMT fallback.
- The UI provides a browser-supported IANA timezone list and validates a manual entry. A Smart Alarm with an invalid fixed zone cannot be tested or scheduled.

## DST and recurrence rules

- When a local time is missing during a spring-forward change, DoneDay schedules the **first valid local minute after the gap**. For example, `01:30 Europe/London` on the 2026 spring transition resolves to `02:00` local.
- When a local time occurs twice during a fall-back change, DoneDay uses the **earlier occurrence**.
- Recurrence advances the civil date first, then resolves that occurrence with the same DST rule. Annual birthday alarms retain the existing February 29 policy before resolving time.
- Device timezone changes alter only `follow-device` definitions. Fixed definitions keep their named zone.

## Backward compatibility

Existing alarms were stored as `AlarmConfig` with a `timezone` only. On read, DoneDay now supplies:

- `scheduleVersion: 1`
- `scheduleRevision: 1`
- `timezoneMode: 'fixed'`

Valid legacy zones are canonicalized. Missing zones use the detected device zone. Invalid legacy zones remain visible but inactive until corrected. Existing task/birthday IDs, local data, and cloud rows are unchanged; no database migration is part of Phase A1.

Editing an alarm setting increments `scheduleRevision`. Editing a task's due date/time/recurrence or a birthday's date/reminder time also increments it. Completing or deleting a task removes its native definition during normal reconciliation.

## Simultaneous alarms and occurrence IDs

The next focused phase owns concurrency. Its contract is **one ringing alarm plus a visible queue of due alarms**. Phase A1 intentionally does not replace Android's existing `PendingIntent` request-code strategy because doing so safely requires persistent native schedule/occurrence storage and migration of existing pending intents.

The next phase must introduce a collision-safe occurrence ID derived from:

```
reminderId + scheduleRevision + resolved local occurrence + timezone mode + effective timezone
```

It must persist a generated request code/URI identity, queue simultaneous due alarms, migrate/cancel only known legacy handles, and prove that two different schedules cannot overwrite each other's pending intents.

## Current limitations

Android exact-alarm, notification, full-screen, DND, battery-optimization, OEM, and multi-device reliability limitations remain unchanged. Exact-alarm access can still be denied, in which case DoneDay accurately uses Android's inexact fallback. Physical-device validation remains required.
