package com.ownerslocal.missedcalltextback.data

import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.auth.FirebaseAuthClient
import com.ownerslocal.missedcalltextback.auth.SessionStore
import okhttp3.OkHttpClient

sealed class SyncResult {
    data class Success(
        val enabled: Boolean,
        val messageTemplate: String,
        val watchedPackages: Set<String>,
        val subscriptionActive: Boolean
    ) : SyncResult()
    data class Failure(val message: String, val sessionExpired: Boolean = false) : SyncResult()
}

/**
 * Pulls this business's current missed_call_settings (written from the web
 * app's Missed Call Text-Back settings page) plus the tenant's own
 * subscriptionActive flag, refreshing the session's ID token first since
 * this often runs from a background sync with no user present to re-login.
 */
class SettingsRepository(
    private val sessionStore: SessionStore,
    private val authClient: FirebaseAuthClient,
    private val firestore: FirestoreRestClient
) {
    constructor(sessionStore: SessionStore, http: OkHttpClient) : this(
        sessionStore,
        FirebaseAuthClient(http),
        FirestoreRestClient(http)
    )

    fun sync(): SyncResult {
        val refreshToken = sessionStore.refreshToken ?: return SyncResult.Failure("Not signed in.", sessionExpired = true)

        val refreshed = authClient.refreshIdToken(refreshToken)
            ?: return SyncResult.Failure("Your session expired -- please sign in again.", sessionExpired = true)
        sessionStore.idToken = refreshed.idToken
        sessionStore.refreshToken = refreshed.refreshToken
        sessionStore.uid = refreshed.uid

        // businessId only needs resolving once, but re-checking is cheap and
        // self-heals if it was somehow never set (e.g. an interrupted first sync).
        var businessId = sessionStore.businessId
        if (businessId.isNullOrBlank()) {
            val profileFields = firestore.getDocumentFields("user_profiles", refreshed.uid, refreshed.idToken)
                ?: return SyncResult.Failure("Couldn't load your account -- check your connection and try again.")
            businessId = FirestoreRestClient.stringField(profileFields, "businessEmail")
            if (businessId.isNullOrBlank()) {
                return SyncResult.Failure("This account has no business linked yet -- finish onboarding in the OwnersLOCAL app first.")
            }
            sessionStore.businessId = businessId
        }

        val settingsFields = firestore.getDocumentFields("missed_call_settings", businessId, refreshed.idToken)
        val enabled = FirestoreRestClient.booleanField(settingsFields, "enabled", true)
        val messageTemplate = FirestoreRestClient.stringField(settingsFields, "messageTemplate")?.takeIf { it.isNotBlank() }
            ?: Config.DEFAULT_MESSAGE
        val watchedPackages = FirestoreRestClient.stringArrayField(settingsFields, "watchedPackages").toSet()

        // Paywall integration point: once the Stripe subscription paywall
        // writes a real subscriptionActive flag onto business_profiles/{businessId},
        // this will start honoring it automatically -- no app update needed.
        // Until that field exists, a missing value defaults to true so the
        // app keeps working exactly as it does today.
        val businessFields = firestore.getDocumentFields("business_profiles", businessId, refreshed.idToken)
        val subscriptionActive = FirestoreRestClient.booleanField(businessFields, "subscriptionActive", true)

        sessionStore.enabled = enabled
        sessionStore.messageTemplate = messageTemplate
        sessionStore.watchedPackages = watchedPackages
        sessionStore.lastSyncedAtMillis = System.currentTimeMillis()

        return SyncResult.Success(enabled, messageTemplate, watchedPackages, subscriptionActive)
    }
}
