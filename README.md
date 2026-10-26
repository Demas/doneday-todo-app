# DoneDay — Make Today Count

DoneDay is a React, TypeScript, and Vite task planner. It works immediately in guest mode using browser storage, with optional Supabase accounts, cloud synchronization, Web Push, and installable PWA support.

## Local development

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Run the automated checks with:

```bash
npm test
npm run build
```

The production files are written to `dist/`.

## Release preparation

Phase C launch materials are in [`docs/release-launch-checklist.md`](docs/release-launch-checklist.md), [`docs/store-listing-draft.md`](docs/store-listing-draft.md), and [`docs/privacy-policy-draft.md`](docs/privacy-policy-draft.md). They prepare a release but do not authorize publishing, store submission, or deployment. Complete the physical-device, legal, signing, and provider-validation blockers before release.

## Guest mode

No account or environment variables are required to use DoneDay. Guest tasks, birthdays, routines, settings, and in-app reminders remain in this browser’s local storage. Export a JSON backup from Settings before clearing browser data or switching browsers.

## Supabase setup

Cloud features are deliberately inactive until configured. Copy `.env.example` to `.env.local` and set only the public values:

```bash
VITE_SUPABASE_URL=https://yccyogdfwtisxgryfvik.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
VITE_VAPID_PUBLIC_KEY=YOUR_URL_SAFE_BASE64_PUBLIC_KEY
```

Never put a Supabase secret/service-role key, VAPID private key, scheduler secret, or database password in a `VITE_` variable.

1. Create a Supabase project.
2. Install the Supabase CLI and authenticate it locally.
3. Link the project, then apply the versioned database migration:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. In **Authentication → URL Configuration**, add `http://localhost:5173/` and `https://doneday-todo-app.vercel.app/` to redirect URLs. Enable email confirmation and configure your email sender/template.
5. Add the three public values above to Vercel’s Production and Preview environment settings, then redeploy.

The migration creates profiles, tasks, subtasks, categories, tags, task tags, routines, birthdays, user settings, schedules, push subscriptions, and delivery records. It enables Row Level Security for every user-facing table. The frontend only uses Supabase’s publishable key; row policies bind every owned row to `auth.uid()`.

## Auth and cloud data

Use the **Guest mode / Cloud synced** button in the lower-right corner to create an account, sign in, request a reset link, or sign out. Email verification is provided by Supabase Auth.

After sign-in, DoneDay offers to save existing browser data. It uploads tasks, categories, birthdays, routines, and settings only after the user confirms. Original local data is retained. Cloud rows use the existing stable item IDs, so retrying an upload updates the same records instead of creating duplicates.

## Background notifications

The repository includes a standards-based Service Worker, PushManager subscription client, VAPID-aware Edge Function source, and a secure scheduler endpoint.

1. Generate VAPID keys with a trusted tool and set `VITE_VAPID_PUBLIC_KEY` in Vercel/local `.env.local`.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SCHEDULER_SECRET`, and `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) as **Supabase Edge Function secrets**. These values are server-only.
3. Deploy the functions:

   ```bash
   supabase functions deploy reminder-dispatch
   supabase functions deploy send-test-push
   supabase functions deploy delete-account
   ```

4. Configure a Supabase Cron job using `pg_cron` and `pg_net` to invoke `reminder-dispatch` at the cadence supported by your plan. The request must include the `x-scheduler-secret` stored in Supabase Vault. Follow the [Supabase scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions) rather than placing the secret in SQL or frontend code.
5. Sign in, use **Enable push**, then **Send test** on a supported device. Check the Edge Function and cron logs for delivery results.

Push is not tested or claimed to be active until those provider steps are completed on a real device. Browser and OS settings can block or delay pushes. On iPhone, push requires a Home Screen installation and permission on supported iOS versions. DoneDay does not promise background alarm sounds or delivery while a device is offline.

## PWA installation

- **Chrome on Android:** open the site menu and choose **Install app** or **Add to Home screen**.
- **Desktop Chrome/Edge:** select the install icon in the address bar.
- **iPhone Safari:** Share → **Add to Home Screen**. Open the installed app, then allow notifications when prompted.

The service worker caches only navigation documents for an offline fallback. It does not cache Supabase API responses or authenticated private data.

## Smart Alarm architecture (DoneDay 4.0)

DoneDay now includes an opt-in **Smart Alarm** definition for timed tasks and birthdays. Alarm definitions live in the existing task and birthday data payloads, so authenticated users sync them with the same Supabase records already used for tasks and birthdays. Each authorized device independently turns those definitions into local schedules; device schedules and permissions are never synced or shared.

| Platform | Current behavior |
| --- | --- |
| Android app | Capacitor native bridge schedules opt-in alarms with `AlarmManager`. When Android grants exact-alarm and notification access, it uses an exact wake-up alarm, a high-priority alarm notification, a lock-screen capable alarm activity, vibration, Stop, Snooze, repeat scheduling, and reboot/timezone rescheduling. |
| iPhone iOS 26+ | The web app does not claim AlarmKit support. A native iOS target, current AlarmKit entitlement/API review, Xcode build, and physical-device validation are still required. |
| Earlier iPhone/iPad | Use regular local-notification behavior when an iOS target is added. Continuous Clock-style ringing is unavailable. |
| Web/PWA | DoneDay uses regular notifications and existing Web Push where configured. A browser cannot guarantee continuous ringing while closed. |

### Android development

The Capacitor Android host lives in `android/`. Its local `DoneDayAlarm` bridge keeps only enabled Smart Alarm definitions scheduled on that device. Updating, completing, or deleting a task updates the shared data and the bridge removes stale device schedules on the next reconciliation. No service-role or VAPID secrets are included in the app.

Install **JDK 21** and Android Studio with Android SDK Platform 36, then set `JAVA_HOME` and ensure `java` is on `PATH`. Build and open the native app with:

```bash
npm run android:sync
npm run android:debug
npm run android:open
```

On a physical Android device, choose **Smart Alarm** while editing a timed task or birthday, enable it, then select **Allow Smart Alarms**. Android may ask for notification permission and special exact-alarm access. DoneDay requests `SCHEDULE_EXACT_ALARM`, notification, vibration, reboot-rescheduling, and full-screen intent access only for the Smart Alarm feature. Google Play release review must confirm that the final app continues to qualify for its full-screen alarm use case.

### Smart Alarm validation still required

The native code has not been built or exercised on this workstation because no JDK is installed. Before store submission, test on physical devices with the app open, closed, and locked; denied permissions; battery-saving modes; reboot; time-zone/DST changes; Stop/Snooze; repeated schedules; editing/deleting/completing tasks; duplicate prevention; offline operation; and multiple devices. Test iOS AlarmKit separately on compatible hardware before describing it as available.

## Vercel deployment

Keep the existing Vercel project and domain. Use the **Vite** preset, build command `npm run build`, and output directory `dist`. Configure public Supabase and VAPID values as Vercel environment variables; configure all privileged values only in Supabase Edge Function secrets.

## Troubleshooting

- **Cloud button says setup required:** verify `.env.local` has the URL and publishable key, restart Vite, and confirm Vercel environment variables are set.
- **Account email does not arrive:** check Supabase Auth email confirmation, SMTP sender settings, and redirect URL allow-list.
- **Push is unavailable:** confirm HTTPS, PWA/service-worker registration, VAPID public key, browser permission, an authenticated account, and deployed functions.
- **Sync needs attention / `42501 permission denied`:** apply every migration, including `202610130002_grant_authenticated_cloud_access.sql`, with `supabase db push` (or run that file in the Supabase SQL Editor). It grants the authenticated browser role table access while the existing RLS policies still restrict every row to `auth.uid()`. Then sign in and select **Retry Sync**. Guest data remains locally stored and is uploaded only after selecting **Save existing local data**.

## Security notes

`.env.local`, `node_modules`, build output, and generated local files are excluded by `.gitignore`. Do not commit provider credentials. The application does not include a custom password system: authentication, email verification, password resets, and session persistence are handled by Supabase Auth.
