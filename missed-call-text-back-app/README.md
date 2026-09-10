# Missed Call Text-Back

Standalone Android companion app for OwnersLOCAL. Runs independently of the
main OwnersLOCAL app -- sign in once with your OwnersLOCAL owner/manager
account, grant a few permissions, and it auto-texts anyone whose call you
miss, running quietly in the background.

## How it works

1. **Sign in** with the same email/password you use for OwnersLOCAL. This
   talks directly to Firebase Auth's REST API using the same public web API
   key the main app already ships (see `Config.kt`) -- no separate account,
   no extra setup in the Firebase console for this app.
2. It looks up your account's business, then reads that business's
   **Missed Call Text-Back** settings (the message to send, whether it's
   turned on, and any extra apps to watch) from the same Firestore document
   the OwnersLOCAL web app's settings page writes to
   (`missed_call_settings/{businessId}`). A change saved there reaches this
   app within 15 minutes automatically, or immediately via "Sync Now."
3. A foreground service watches for missed calls two ways:
   - **Your phone's own dialer**: a `PHONE_STATE` broadcast receiver checks
     the call log whenever a call ends, for a fresh entry marked missed.
   - **Other calling apps** (TextNow, WhatsApp, Google Voice, etc., as
     configured on the web settings page): a `NotificationListenerService`
     reads that app's own missed-call notification and best-effort extracts
     a phone number from its text. Only works if that notification actually
     contains a number -- these apps don't give any other way to detect it.
4. Sends the configured message via `SmsManager`, with a 10-minute cooldown
   per number so a caller trying three times in a row gets one text, not
   three.

## Required permissions (all granted manually via the app's Setup checklist)

- **SMS** -- to send the auto-reply.
- **Phone state** + **Call log** -- to detect a missed call on the native dialer.
- **Notification access** -- special permission, granted via Settings (not
  a runtime dialog), needed for the "other calling apps" detection path.
- **Notifications** (Android 13+) -- to show the "running" foreground
  service notification, which Android requires for any persistent
  background service.
- **Ignore battery optimization** -- recommended so Android doesn't kill
  the background monitor; the app links directly to this Settings screen.

## Subscription gate (not wired up to anything real yet)

`SettingsRepository.sync()` reads a `subscriptionActive` field off
`business_profiles/{businessId}` and surfaces it in `SyncResult.Success`
(defaulting to `true` if the field doesn't exist, so the app works today
with nothing else changed). Nothing currently writes that field -- it's a
placeholder for the OwnersLOCAL paywall project. Once that work writes a
real `subscriptionActive: false` for a lapsed business, this app starts
honoring it with no app update needed. `MainActivity` doesn't currently
block usage on this flag being false, just displays a message -- add that
enforcement once the paywall actually exists.

## What's verified vs. not

Unlike a design sketch, this **does compile and package into a real,
installable debug APK** -- built and verified in this environment with the
Android SDK (compileSdk 34, AGP 8.5.2, Kotlin 1.9.24), not just written and
assumed correct. `./gradlew assembleDebug` succeeds with zero warnings; see
`releases/MissedCallTextBack-debug.apk`.

What is **not** verified, because this environment has no device/emulator:
- Actually installing and running on a phone -- permission-grant flows,
  real SMS sending, and the notification-listener/call-log detection logic
  all need a real device test pass.
- The phone-number regex against real notification text from TextNow/
  WhatsApp/etc. -- it's a reasonable best-effort pattern, not verified
  against those apps' actual notification formats.
- Battery/OEM background-kill behavior varies a lot by manufacturer
  (Samsung, Xiaomi, etc. are notoriously aggressive) -- the "ignore battery
  optimization" prompt covers stock Android's version of this, not every
  OEM's own separate battery-management UI.

## Building

1. Open this folder (`missed-call-text-back-app/`) in Android Studio
   (Koala/2024.1+) as its own project -- it's independent of the main
   OwnersLOCAL repo's own `android/` folder (that one is the Capacitor
   wrapper for the main app; this is a completely separate app/package).
2. Let Gradle sync.
3. Replace the placeholder launcher icon
   (`app/src/main/res/drawable/ic_launcher_foreground.xml`) with a real one
   via Android Studio's Image Asset tool before shipping.
4. Build & run on a physical device -- call/SMS/notification-listener
   behavior can't be meaningfully tested on most emulators.
