# DoneDay Phase B1: iPhone native alarm foundation

## What this branch adds

The iOS target supports iOS 15 and later with a local-notification alarm fallback.

- Capacitor 8 iOS target with an iOS 15 deployment target.
- A local Capacitor bridge named **DoneDayAlarm**.
- Local notification authorization, a default notification sound, and Stop/Snooze actions.
- Safe replacement: candidate notifications are added before stale DoneDay notifications are removed.
- IANA timezone validation, fixed-zone versus follow-device behavior, stable reminder IDs, revisioned definitions, and recurrence data from the shared TypeScript contract.
- An active-app DoneDay screen with Stop and Snooze controls when a local notification arrives while the app is running.
- A manually triggered macOS GitHub Actions source build with signing disabled.

## iOS 15–18 behavior

This is a notification fallback, not a continuous native alarm clock.

| Capability | State |
| --- | --- |
| Local alert and default notification sound | Implemented in source |
| Stop and Snooze notification actions | Implemented in source |
| Active-app DoneDay Stop/Snooze screen | Implemented in source |
| Fixed IANA timezone scheduling | Implemented in source |
| Follow-device timezone rescheduling | Rebuilds after a significant system time change |
| Persistent continuous ringing while app is closed | Not available on iOS 15–18 |
| Selectable system alarm tones or guaranteed vibration | Not available; iOS uses the default notification sound and OS behavior |
| Device verification | Not performed |

iOS limits the number of pending local notifications. Repeating calendar notifications reduce pressure on that limit, but complex monthly, annual, and calendar edge cases still need real-device testing. The TypeScript contract chooses the first occurrence in a fall-back fold and shifts a spring-forward gap forward. The native bridge uses the corresponding calendar policies for one-time notifications and system calendar triggers for repeats.

## AlarmKit design

The source contains an availability-gated **DoneDayAlarmKit.swift** file:

- It is excluded when the SDK cannot import AlarmKit.
- It is annotated for iOS/iPadOS 26 and later.
- It is intentionally disabled until a Mac build, capability review, authorization flow, and physical-device tests establish the correct integration.

Do not represent AlarmKit as available in the product until that work is complete.

## macOS and iPhone requirements

A Windows computer cannot compile this Swift source, run Xcode, resolve Apple frameworks, or install an iPhone app.

1. Use a Mac with a current Xcode version compatible with Capacitor 8.
2. Clone this branch, run `npm ci`, then run `npm run ios:sync`.
3. Open `ios/App/App.xcodeproj` in Xcode.
4. Select a unique bundle identifier before device installation.
5. Sign in to Xcode with a free Apple Account to test directly on a personal iPhone. Paid Apple Developer Program membership is required for TestFlight or App Store distribution.
6. Request notification permission in DoneDay, then test a task five minutes ahead with the app open, backgrounded, locked, and terminated.
7. Verify Stop, Snooze, denial/re-enable permission, recurring edits, deletion, timezone travel, DST transitions, and February 29 birthday policy.

No Apple credentials, provisioning profiles, or signing keys belong in this repository.

## GitHub Actions

Run **iOS source build** manually from the Actions tab. It performs `npm ci`, synchronizes Capacitor iOS assets, and runs an unsigned iPhone Simulator compilation. It does not sign, install, deploy, submit, or publish the app.

A successful GitHub Actions source build only validates compilation. It does not prove that an iPhone will deliver a notification, play a sound, or handle Stop/Snooze on the lock screen.

