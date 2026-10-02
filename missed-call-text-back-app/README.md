# Missed Call Text-Back (Android)

A standalone Android app: when you miss a call, the caller automatically
gets a text from your phone's own number. It is separate from the main
OwnersLOCAL app (`/android` is the Capacitor wrapper for that one).

**Install:** the OwnersLOCAL web app's Missed Call Text-Back page is now a
"Download APK for Android" button (served from `public/downloads/MissedCallTextBack.apk`
in the main repo). The same file is in `releases/`. If version 1 is already on
the phone, uninstall it first: this build is signed with a different key, so
Android won't install it as an update.

**All setup happens in this app.** That covers sign-in with an OwnersLOCAL
login, permissions, the message, on/off, and which other calling apps to
watch. The web page only offers the download and shows the call log. After
setup the app runs by itself. The phone can be asleep or in use, and neither
the browser nor the OwnersLOCAL app needs to be open.

**When you update the app:** copy the new `app-debug.apk` to both
`public/downloads/MissedCallTextBack.apk` and `releases/`, and bump
`APK_VERSION` in `src/components/MissedCallTextBackPage.tsx`.

## Accounts

The app signs in through the same Firebase project as OwnersLOCAL. Each
account type is an `AccountProvider` (`account/`), so detection, sending and
the UI never care which kind of account is signed in.

| Kind | Status | Tenant | Settings | Call/text logs |
|---|---|---|---|---|
| `OWNERSLOCAL` | **Live.** Owner or manager login | the business (`user_profiles/{uid}.businessEmail`) | `missed_call_settings/{businessId}`, the same doc as the web app's Missed Call Text-Back page | `missed_call_events`, `text_messages`, with new `leads` for unknown callers. Shows up in the web log, Inbox and Customer history |
| `STANDALONE` | **Built but hidden.** Individual paying subscriber, no OwnersLOCAL business | their own uid | `mctb_accounts/{uid}` | `mctb_accounts/{uid}/call_events`, `.../text_messages` |

The OwnersLOCAL plan covers OwnersLOCAL logins, so the app only *shows*
that plan's status. It never blocks on it. Standalone accounts are blocked
unless `mctb_accounts/{uid}.subscriptionActive` is true and
`subscriptionCurrentPeriodEnd` (if set) is in the future.

### Turning on standalone subscriptions later

Already done:
- `StandaloneAccountProvider`: account creation, settings, entitlement and event logging
- `FirebaseAuthRest.signUp`
- `firestore.rules` for `mctb_accounts`, with tests in `tests/firestoreRules.security.test.ts`. Clients can't write the billing fields.
- The sign-in screen grows an account-type toggle automatically once a second kind is enabled

Still to build:
1. **Server:** a Stripe Checkout endpoint for the standalone price, and a webhook branch that writes `subscriptionActive`, `subscriptionStatus`, `subscriptionCurrentPeriodEnd`, `stripeCustomerId` and `stripeSubscriptionId` onto `mctb_accounts/{uid}` with the Admin SDK (same pattern as `server/subscriptionRoutes.ts` / `server/stripeWebhook.ts`).
2. **App:** a "Create account" button calling `signUp`, and a "Subscribe" button that opens the Checkout URL.
3. Add `AccountKind.STANDALONE` to `Config.ENABLED_ACCOUNT_KINDS`.

## How detection works

The phone's call log is the source of truth. `CallLogScanner.scan()`
handles every row newer than the last one it processed, and these triggers
all call that same scan:

- the call log changing (a `ContentObserver` in the foreground `MonitorService`)
- a call ending (the manifest `PHONE_STATE` receiver, which also wakes the app if Android killed it)
- every ~15 minutes, **even in deep sleep** (`Watchdog`, an `setAndAllowWhileIdle` alarm), which also restarts the monitor if Android killed it
- every 15 minutes when not asleep (`MaintenanceWorker`), which also re-syncs settings
- opening the app, rebooting, or updating the app

So a late, duplicated or missing broadcast can't make the app skip a call or
text someone twice. On first sign-in the scanner starts from "now", so old
calls are never texted.

Rules for when a missed call gets a reply (`AutoReplier`):

- Missed and declined calls get a reply. Blocked, voicemail and answered calls don't.
- The number must be a real 10+ digit number (not private, unknown or a short code).
- Auto-reply must be on, and (standalone only) the subscription must be active.
- The call must be less than 20 minutes old. Older ones are logged but not texted.
- Each number gets at most one reply per 10 minutes. This limit survives app restarts.
- Long messages are sent as multi-part texts from the default SMS SIM, and the carrier's accept/fail result is shown in the activity log.

Other calling apps (Google Voice, TextNow, WhatsApp, etc., switched on in the
app's "Other calling apps" section; see `core/KnownCallingApps.kt`) don't write to the call log. For those, `CallNotificationListener`
replies only when that app's notification says "missed" **and** shows a phone
number. Ordinary chat messages are ignored.

Uploading never holds up a reply. Calls and texts go into a file-backed
queue (`sync/Outbox`) that `OutboxWorker` drains whenever there's a network
connection, refreshing the login token as needed. Each upload uses a fixed
document ID, so a retry can't create a duplicate record or a duplicate lead.

## Permissions (Setup checklist in the app)

- **Calls & SMS**: phone state, call log, send SMS. Required.
- **Text history**: receive and read SMS, so customer replies and your own texts show up in their record.
- **Notifications** (Android 13+): warns you if auto-replies stop working.
- **Run in background**: battery-optimization exemption. Keeps it alive while asleep, and lets Android restart the monitor from the background. On Samsung, also set Battery to "Unrestricted".
- **Show over other apps**: shows a "Texted back (555) 123-4567" banner over whatever app is open.
- **Notification access**: only needed if you turned on other calling apps. Android 13+ blocks this for sideloaded apps until you open App info → ⋮ → "Allow restricted settings"; the app explains this when it asks.

## iPhone

There is no iPhone version, and one isn't possible as an app. iOS doesn't let
any app read call history, detect a missed call, see another app's
notifications, or send an SMS without the user tapping Send. That includes
Google Voice and TextNow on iPhone. The only way to text back iPhone users'
missed calls is outside the phone: forward unanswered calls (carrier
conditional call forwarding) to a cloud number such as Twilio that sends the
text. The reply would then come from that cloud number, not the owner's own.

## Building

```
cd missed-call-text-back-app
echo "sdk.dir=/path/to/Android/sdk" > local.properties   # or open in Android Studio
./gradlew testDebugUnitTest assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`.

## What's verified

- Compiles with no warnings, Android lint finds no errors, 10 unit tests pass (phone matching, queue persistence, missed-call notification parsing).
- Firestore rules suite passes (92 tests, including the new `mctb_accounts` ones).
- **Not yet tested on a real phone.** Installing, granting permissions, actually detecting a missed call and sending the text all still need a device test. Behavior can differ by manufacturer, especially Samsung and Xiaomi battery management.
