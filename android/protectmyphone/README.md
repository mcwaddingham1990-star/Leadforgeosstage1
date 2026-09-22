# protectmyphone modular base

This branch contains the standalone Android `protectmyphone` browser/timeline app.

## Current behavior

- First-run consent question:
  **Do you want to monitor websites for URLs, emails, and phone numbers, all time stamped?**
- Local-only timestamped timeline.
- Normal and private browsing inside protectmyphone.
- URL, email, and phone events from protectmyphone's own browser.
- Typed vs. Seen labels.
- Password and one-time-code fields are excluded.
- Persistent notification text:
  **protect my phone is protecting your phone.**

## Extension boundary

New consent-based sources implement:

`com.protectmyphone.app.core.ActivitySource`

They emit `TimelineEvent` objects and can be registered in `SourceRegistry`. The UI/storage layer does not need to know how a source gathered its permitted metadata.

Good fits include:
- local VPN/DNS domain breadcrumbs,
- browser-owned navigation events,
- Android call/SMS metadata when the user grants the relevant permission,
- other supported APIs that expose activity metadata.

This base intentionally does not include an Accessibility/keylogging or arbitrary cross-app screen-reading module.

## Build

GitHub Actions builds a debug APK with:

`gradle -p android/protectmyphone --no-daemon assembleDebug`

The workflow uploads `protectmyphone.apk` as an artifact.
