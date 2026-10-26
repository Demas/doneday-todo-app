# DoneDay Phase B: iPhone, iPad, and AlarmKit Handoff

## Implemented foundation

- Capacitor iOS target: `ios/App/App.xcodeproj`.
- Matching `@capacitor/ios` runtime dependency.
- `ios:sync` and `ios:open` package scripts.
- `NSAlarmKitUsageDescription` in the application Info.plist.
- The existing TypeScript capability UI remains conservative: it does not claim iOS Smart Alarm support until a native implementation is built and validated.

## Platform contract

The Phase A1 alarm definition is the source of truth: `reminderId`, local date/time, IANA timezone, fixed or follow-device mode, recurrence, revision, tone, vibration preference, and snooze duration. The iOS bridge must consume this contract without converting a fixed local rule into a browser-local JavaScript date.

For iOS/iPadOS 26+, map a fixed DoneDay rule to an AlarmKit fixed schedule and a follow-device rule to an AlarmKit relative schedule. Preserve DoneDay's DST contract before scheduling. Use the native alarm identifier to track cancellation, editing, and system lifecycle callbacks.

For older iOS/iPadOS versions, use `UNUserNotificationCenter` as a clearly labelled notification reminder fallback. It must not be called a Smart Alarm or promise continuous ringing. Keep a rolling pending-notification horizon that stays below the operating system limit.

## Required macOS implementation work

This Windows workspace cannot compile Swift, resolve Xcode frameworks, sign an application, or test an iPhone/iPad. Complete these steps on a Mac with a current Xcode that includes the iOS/iPadOS 26 SDK:

1. Open `ios/App/App.xcodeproj` using `npm run ios:open`.
2. Configure a unique Apple bundle identifier and automatic signing for the enrolled Apple Developer team.
3. Add `DoneDayAlarmPlugin.swift` as a Capacitor plugin matching the Android bridge: capabilities, authorization request, synchronization, test, cancellation, and native status events.
4. Use AlarmKit `AlarmManager` only after checking or requesting authorization. Keep the Info.plist usage text in sync with the actual user-visible use case.
5. Add App Intents for Stop, Snooze, and Open DoneDay. Add a Live Activity/widget extension only when a countdown experience is implemented.
6. Implement a `UNUserNotificationCenter` fallback for pre-iOS-26 devices with truthful capability states.
7. Test on real iPhone and iPad: permission denied/granted, locked/terminated, Focus/Silent, fixed/follow-device timezones, DST, Stop/Snooze, recurrence, edits, deletion, account changes, and fallback behavior.

## Evidence boundary

AlarmKit is available on iOS and iPadOS 26. It requires per-app authorization and `NSAlarmKitUsageDescription`. Apple documents fixed schedules as absolute and relative schedules as responding to device timezone changes. The current repository contains only the target foundation; no AlarmKit scheduling, lock-screen alarm, App Intent, signing, or physical-device behavior is claimed as working.

## Commands

```sh
npm run ios:sync
npm run ios:open
```

Run `ios:open`, then build/sign/test in Xcode on macOS. Do not add Apple credentials, provisioning profiles, or signing keys to this repository.
