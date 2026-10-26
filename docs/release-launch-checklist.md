# DoneDay Phase C: Launch Readiness Checklist

This document prepares a release. It does not authorize publishing, store submission, deployment, or use of production credentials.

## Current release decision

**Do not submit yet.** The project builds, but the following launch evidence is missing: Android OEM testing, an iPhone/iPad AlarmKit implementation and build, signed release artifacts, live service validation, publisher legal details, and store-console declarations.

## Verified in source control

| Item | Status | Evidence |
| --- | --- | --- |
| Web production build | Ready to run | `npm run build` writes `dist/`. |
| Automated checks | CI prepared | `.github/workflows/verify.yml` runs build and the single-worker test suite. |
| Android debug build | Available | `npm run android:debug` creates a debug APK; it is not a store artifact. |
| iOS target | Foundation only | `npm run ios:sync` works; Xcode build and signing require macOS. |
| Account deletion | Implemented | Authenticated account panel calls the server-side delete-account function. |
| Data export | Implemented | JSON and CSV exports are available in Settings. |
| Cloud and push | Configuration-dependent | Do not enable a release claim until Supabase migrations, secrets, scheduler, and device delivery are verified. |

## Blocking evidence before a public launch

1. Complete the Android A3 matrix on physical Pixel/AOSP, Samsung, Xiaomi/Redmi, Oppo/OnePlus, Huawei, and Motorola devices. Record locked/background/terminated, Doze, battery saver, reboot, timezone, permission, Stop/Snooze, and simultaneous-alarm results.
2. Complete the iPhone/iPad native AlarmKit work on macOS and validate it on iOS/iPadOS 26 hardware. Clearly label earlier iOS versions as notification-only fallback.
3. Set a unique application ID, release version/code, release signing, and Play App Signing workflow. Build a signed AAB only in controlled CI or a secure release machine.
4. Configure Apple signing, capabilities, App Store Connect metadata, and TestFlight only after the iOS native bridge passes device validation.
5. Validate Supabase migrations and Edge Functions against a non-production environment, then verify production using real accounts and devices without logging secrets.
6. Supply a publisher legal name, support email, privacy-policy URL, terms URL, retention/deletion rules, and a support/incident owner. Replace every bracketed placeholder in the privacy draft.
7. Add crash/ANR monitoring with a privacy review, release rollback owner, backup/restore exercise, and incident escalation process.

## Google Play Console preparation

- Prepare App content answers: privacy policy URL, ads declaration, target audience, content rating, Data safety, permissions declaration if prompted, and reviewer access instructions.
- Explain that guest mode is available without an account. If testing cloud features, provide a review account through the Play Console rather than source control.
- Declare data handling from the app and all SDKs accurately. Supabase/cloud data, Web Push subscriptions, and WebView behavior need an owner-reviewed declaration.
- Prepare screenshots on actual supported devices. Do not imply reliable continuous alarms until A3 passes.

## Apple App Store preparation

- Configure App Privacy details only after reviewing actual cloud, push, crash-reporting, and analytics behavior.
- Provide a working support URL, privacy-policy URL, terms URL, and account-deletion support path.
- Give App Review the guest-mode path and any required review account instructions.
- Do not describe AlarmKit, Lock Screen alarms, or Focus/Silent behavior until the macOS build and physical device matrix pass.

## Release execution order

1. Create a release branch and freeze feature changes.
2. Run CI, web build, Android signed bundle build, and Xcode archive on clean machines.
3. Test internal tracks/TestFlight, review monitoring, and verify account deletion/export.
4. Complete store declarations and attach final device evidence.
5. Obtain release owner approval, then submit to staged/closed testing before any production rollout.
6. Monitor crashes, ANRs, authentication, cloud sync, and notification delivery; retain a rollback decision owner.
