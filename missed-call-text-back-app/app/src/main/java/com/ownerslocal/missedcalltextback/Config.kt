package com.ownerslocal.missedcalltextback

/**
 * Same Firebase project OwnersLOCAL's web app uses (see
 * firebase-applet-config.json in the main repo). This app talks to Firebase
 * Auth and Firestore purely over their public REST APIs using this API
 * key -- the same one already shipped in every browser that loads the web
 * app -- so there is no google-services.json to generate/register for this
 * separate app package, and nothing here is a secret.
 */
object Config {
    const val FIREBASE_API_KEY = "AIzaSyCrtpCjin92MUH1IJrIiHgLutDUIQoB7DI"
    const val FIREBASE_PROJECT_ID = "gen-lang-client-0834040446"
    const val FIRESTORE_DATABASE_ID = "ai-studio-leadforgelocalos-a91c76d6-18b0-4f96-b3fb-ef1e755e81f4"

    const val NOTIFICATION_CHANNEL_ID = "missed_call_monitor"
    const val FOREGROUND_NOTIFICATION_ID = 1001

    /** Don't re-text the same number more than once within this window, in
     *  case they call back-to-back or the call log delivers a duplicate. */
    const val PER_NUMBER_COOLDOWN_MS = 10 * 60 * 1000L

    const val DEFAULT_MESSAGE = "Sorry we missed your call! We'll get back to you shortly."
}
