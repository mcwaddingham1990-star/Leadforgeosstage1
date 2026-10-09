# Owners Local OS

Owners Local OS is a mobile-first business operations platform for local business owners. It combines customer and lead management, estimates, scheduling, jobs, inventory, documents, accounting, payroll, reporting, and reviewed AI-assisted data entry.

## Run locally

1. Install Node.js.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and configure the required services.
4. Run `npm run dev`.

Use `npm run lint` for TypeScript validation and `npm run build` for a production build.

## Google login

Google sign-in uses Firebase Auth on the web and the native Google account chooser in the Android APK. Before deploying, enable the Google provider, whitelist each app hostname in Firebase Authentication, and register the Android app's SHA fingerprints. See [GOOGLE_SIGNIN_SETUP.md](./GOOGLE_SIGNIN_SETUP.md) for complete instructions. A rebuilt APK is required for the native plugin; changing only the website will not update installed APKs.

## Android app

The `android/` folder is a [Capacitor](https://capacitorjs.com/) wrapper around this same web
app (same code, same Firebase project) — not a separate app to maintain. To rebuild the APK after
changes:

```
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`, meant to be hosted directly
on the website for download (sideloaded, not distributed through Google Play). For a release
build, use `assembleRelease` with a real signing config instead.

## iOS

No native iOS project yet (that requires a Mac + Apple Developer account to build/sign). iPhone
users install via Safari's "Add to Home Screen" — the PWA manifest, icons, and service worker
in `public/` already make that a full-screen, offline-capable install with no App Store needed.
Revisit a real Capacitor iOS project (`npx cap add ios`) once Xcode access exists; the web app
itself needs no changes to support it.

## Development requirements

Read [DEVELOPMENT_STANDARDS.md](./DEVELOPMENT_STANDARDS.md) before adding or redesigning data-entry workflows. Manual entry, reviewed AI Snapshot/autopopulate, and the shared financial taxonomy are required project standards.
