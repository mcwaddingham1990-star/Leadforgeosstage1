package com.ownerslocal.missedcalltextback.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Holds the signed-in session (Firebase ID/refresh tokens, uid, and the
 * resolved businessId/tenant email) plus the last-synced missed-call
 * settings. Encrypted at rest since a stolen refresh token would let
 * someone impersonate this business's owner account indefinitely.
 */
class SessionStore(context: Context) {
    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            "missed_call_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    var idToken: String?
        get() = prefs.getString(KEY_ID_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_ID_TOKEN, value).apply()

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_REFRESH_TOKEN, value).apply()

    var uid: String?
        get() = prefs.getString(KEY_UID, null)
        set(value) = prefs.edit().putString(KEY_UID, value).apply()

    var email: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) = prefs.edit().putString(KEY_EMAIL, value).apply()

    /** The owner's business email -- the tenant key missed_call_settings is keyed by. */
    var businessId: String?
        get() = prefs.getString(KEY_BUSINESS_ID, null)
        set(value) = prefs.edit().putString(KEY_BUSINESS_ID, value).apply()

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    var messageTemplate: String
        get() = prefs.getString(KEY_MESSAGE, null) ?: com.ownerslocal.missedcalltextback.Config.DEFAULT_MESSAGE
        set(value) = prefs.edit().putString(KEY_MESSAGE, value).apply()

    var watchedPackages: Set<String>
        get() = prefs.getStringSet(KEY_WATCHED_PACKAGES, emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet(KEY_WATCHED_PACKAGES, value).apply()

    var lastSyncedAtMillis: Long
        get() = prefs.getLong(KEY_LAST_SYNC, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SYNC, value).apply()

    /** Dedupes CallStateReceiver against reprocessing the same call log row twice. */
    var lastProcessedCallLogId: Long
        get() = prefs.getLong(KEY_LAST_CALL_LOG_ID, -1L)
        set(value) = prefs.edit().putLong(KEY_LAST_CALL_LOG_ID, value).apply()

    val isSignedIn: Boolean
        get() = !refreshToken.isNullOrBlank() && !uid.isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_ID_TOKEN = "id_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_UID = "uid"
        private const val KEY_EMAIL = "email"
        private const val KEY_BUSINESS_ID = "business_id"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_MESSAGE = "message_template"
        private const val KEY_WATCHED_PACKAGES = "watched_packages"
        private const val KEY_LAST_SYNC = "last_sync_at"
        private const val KEY_LAST_CALL_LOG_ID = "last_call_log_id"
    }
}
