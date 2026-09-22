# protectmyphone

Android memory-breadcrumb app designed to help reconstruct browsing activity later.

## What this branch contains

- Standalone Android project.
- First-run consent prompt:
  **Do you want to monitor websites for URLs, emails, and phone numbers, all time stamped?**
- Local timeline storage.
- protectmyphone browser with Normal and Private modes.
- Inside the protectmyphone browser:
  - full URL history,
  - visible email/phone detection,
  - email/phone entered into supported fields,
  - Typed vs Seen labeling,
  - timestamps,
  - Private tagging.
- Device browser domain breadcrumbs for Chrome and Microsoft Edge through Android VpnService after the user grants Android's VPN permission.
- Optional Usage Access can improve the source label to Chrome or Microsoft Edge.
- Reboot receiver restarts the domain monitor when monitoring remains enabled and VPN permission is still granted.
- Password and one-time-code fields are excluded.
- Notification text:
  **protect my phone is protecting your phone.**

## Important technical limits

The Chrome/Edge layer records DNS/domain breadcrumbs, not decrypted page contents or full private address-bar URLs. Browser Secure DNS / DNS-over-HTTPS can prevent some domains from appearing in the DNS timeline.

## Extension point

Additional consent-based activity sources can implement:
`app/src/main/java/com/protectmyphone/app/core/ActivitySource.java`

Events are normalized into `TimelineEvent` and stored by `TimelineStore`.

## Build

`gradle --no-daemon assembleDebug`
