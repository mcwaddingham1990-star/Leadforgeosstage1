# Owner'sLOCAL — Google sign-in deployment checklist

This repository supports two distinct login environments:

- **Website/PWA** (such as `https://leadforgeosstage1.onrender.com`): Firebase Auth Google popup.
- **Android APK** (`com.ownerslocal.app`): native Google account chooser using `@capacitor-firebase/authentication`, with the signed Google ID token exchanged for a Firebase **JavaScript** Auth session. Firebase JS Auth must be signed in because all existing business profiles, customers, permissions, Firestore rules and API calls use the JS user.

## 1. Required Firebase Console settings (no code change can enable these)

Open **Firebase Console → project `gen-lang-client-0834040446` → Authentication → Sign-in method**.

1. Enable **Google** and select the required project support email, then save.
2. Open **Authentication → Settings → Authorized domains** and authorize each domain that actually serves the app:
   - `leadforgeosstage1.onrender.com`
   - `ownerslocal.com` (only if the app/login is actually served here)
   - `www.ownerslocal.com` (only if it serves the app/login)
   - Any other real staging hostname where Google sign-in is required.
3. The Firebase config currently uses `gen-lang-client-0834040446.firebaseapp.com` as `authDomain`. Keep it unless you intentionally configure a Firebase Hosting custom auth domain. If Google Cloud OAuth redirects were changed by hand, the standard Firebase handler is `https://gen-lang-client-0834040446.firebaseapp.com/__/auth/handler`.

**Never paste Google OAuth client secrets or Firebase service-account private keys into the repository.** The Firebase web API key is not a service-account secret.

## 2. Native Android-specific setup

The APK cannot use the Firebase web redirect flow in a WebView reliably. This branch replaces it with the Android native Google account picker.

1. In the *same* Firebase project, register the Android application with package name **`com.ownerslocal.app`**. If it already exists, update that Android app instead of creating another.
2. Add the Android signing certificate's **SHA-1** and **SHA-256** fingerprints in Firebase Project Settings → Your apps → Android app. The installed APK must be signed by a certificate whose fingerprints are registered. Debug and release fingerprints are different; add both when appropriate. If Google Play signs releases for you, also add its app-signing fingerprints.
3. Download the resulting **`google-services.json`** and place it at **`android/app/google-services.json`** in your build environment. Verify the package name is `com.ownerslocal.app`; do not commit personal service-account keys.
4. Rebuild a *new* APK from this updated branch:
   ```bash
   npm ci
   npm run lint
   npm run build
   npx cap sync android
   cd android && ./gradlew assembleDebug
   ```
5. Install the **new** APK. Existing APKs won't acquire new native plugins just from a website deployment.

The code configures `FirebaseAuthentication.providers = ["google.com"]`, `skipNativeAuth = true`, and the required Google/Credential Manager Gradle flags. The Google ID token is signed into the existing JS Firebase Auth instance; **no passwords are bypassed and no fake users are created**.

## 3. Smoke tests after deployment

- Web: click **Continue with Google**, choose an account, verify the Firebase user session resolves, then refresh. Repeat with Chrome on Android.
- Existing owner: should load the same `user_profiles/{uid}` and business data as before.
- New Google account: should go to owner onboarding rather than masquerading as an existing account.
- Employee Google account: should retain actual employee permissions, never receive owner's permissions.
- Native APK: choose account in the Android account chooser, return to the app, then reopen and check the session.
- Cancel the chooser: the app should recover without remaining stuck on a spinner.
- Test a missing authorized domain and disabled Google provider on staging: the login UI should explain the setup issue.
- Verify that signing out and signing back in as a different Google account does not mix business/tenant data.

## Troubleshooting

- **auth/unauthorized-domain**: add the live *app* hostname under Firebase Authentication → Settings → Authorized domains.
- **auth/operation-not-allowed**: enable the Google sign-in provider in the right Firebase project.
- **Native "plugin not implemented"**: install an APK rebuilt with `npm ci && npx cap sync android`.
- **Native Google chooser errors or missing ID token**: confirm `google-services.json`, Android app registration, and SHA fingerprints.
- **Web popup blocked**: allow popups or use a normal Chrome browser tab instead of an embedded browser.

**Status:** Source changes alone do not prove a working deployment. The Firebase Console settings, APK signing setup, and live device testing must be completed by the project administrator.
