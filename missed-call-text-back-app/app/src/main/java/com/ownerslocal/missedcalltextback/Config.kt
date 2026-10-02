package com.ownerslocal.missedcalltextback

import com.ownerslocal.missedcalltextback.account.AccountKind

object Config {
    // Same Firebase project as the OwnersLOCAL web app (firebase-applet-config.json).
    // The web API key is public by design; Firestore rules do the access control.
    const val FIREBASE_API_KEY = "AIzaSyCrtpCjin92MUH1IJrIiHgLutDUIQoB7DI"
    const val FIREBASE_PROJECT_ID = "gen-lang-client-0834040446"
    const val FIRESTORE_DATABASE_ID = "ai-studio-leadforgelocalos-a91c76d6-18b0-4f96-b3fb-ef1e755e81f4"

    /**
     * Account types the sign-in screen offers. Standalone (individually
     * paying, no OwnersLOCAL business) accounts are fully wired through
     * [com.ownerslocal.missedcalltextback.account.StandaloneAccountProvider]
     * and firestore.rules, but stay hidden until their billing is live.
     */
    val ENABLED_ACCOUNT_KINDS: List<AccountKind> = listOf(AccountKind.OWNERSLOCAL)

    const val DEFAULT_MESSAGE = "Sorry we missed your call! We'll get back to you shortly."

    /** One auto-reply per number inside this window, however many times they call. */
    const val PER_NUMBER_COOLDOWN_MS = 10 * 60 * 1000L

    /** A missed call found later than this (phone was off, app was killed) is
     *  still logged, but not texted -- a reply hours later reads as spam. */
    const val MAX_REPLY_DELAY_MS = 20 * 60 * 1000L

    /** How far back a call-log / sent-SMS scan looks for unprocessed rows. */
    const val SCAN_LOOKBACK_MS = 6 * 60 * 60 * 1000L

    const val MONITOR_CHANNEL_ID = "monitor"
    const val ALERT_CHANNEL_ID = "alerts"
    const val MONITOR_NOTIFICATION_ID = 1001
    const val ALERT_NOTIFICATION_ID = 1002
}
