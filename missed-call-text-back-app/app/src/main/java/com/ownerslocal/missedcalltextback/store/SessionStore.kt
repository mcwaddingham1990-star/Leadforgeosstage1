package com.ownerslocal.missedcalltextback.store

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.ownerslocal.missedcalltextback.account.AccountKind
import com.ownerslocal.missedcalltextback.account.AuthTokens

data class Session(
    val kind: AccountKind,
    val uid: String,
    val email: String,
    val tenantId: String,
    val tenantName: String,
    val idToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long
)

/** The signed-in session, encrypted at rest: a stolen refresh token is a long-lived login. */
class SessionStore(context: Context) {
    private val prefs: SharedPreferences = openEncrypted(context)

    @Synchronized
    fun get(): Session? {
        val kind = AccountKind.fromName(prefs.getString(KIND, null)) ?: return null
        return Session(
            kind = kind,
            uid = prefs.getString(UID, null) ?: return null,
            email = prefs.getString(EMAIL, null).orEmpty(),
            tenantId = prefs.getString(TENANT, null) ?: return null,
            tenantName = prefs.getString(TENANT_NAME, null).orEmpty(),
            idToken = prefs.getString(ID_TOKEN, null) ?: return null,
            refreshToken = prefs.getString(REFRESH_TOKEN, null) ?: return null,
            expiresAtMillis = prefs.getLong(EXPIRES_AT, 0L)
        )
    }

    @Synchronized
    fun save(session: Session) = prefs.edit(commit = true) {
        putString(KIND, session.kind.name)
        putString(UID, session.uid)
        putString(EMAIL, session.email)
        putString(TENANT, session.tenantId)
        putString(TENANT_NAME, session.tenantName)
        putString(ID_TOKEN, session.idToken)
        putString(REFRESH_TOKEN, session.refreshToken)
        putLong(EXPIRES_AT, session.expiresAtMillis)
    }

    @Synchronized
    fun updateTokens(tokens: AuthTokens) = prefs.edit(commit = true) {
        putString(ID_TOKEN, tokens.idToken)
        putString(REFRESH_TOKEN, tokens.refreshToken)
        putLong(EXPIRES_AT, tokens.expiresAtMillis)
    }

    @Synchronized
    fun clear() = prefs.edit(commit = true) { clear() }

    val isSignedIn: Boolean get() = get() != null

    companion object {
        private const val FILE = "mctb_session"
        private const val KIND = "kind"
        private const val UID = "uid"
        private const val EMAIL = "email"
        private const val TENANT = "tenant_id"
        private const val TENANT_NAME = "tenant_name"
        private const val ID_TOKEN = "id_token"
        private const val REFRESH_TOKEN = "refresh_token"
        private const val EXPIRES_AT = "expires_at"

        /**
         * Some devices corrupt the Keystore key after an OS update or backup
         * restore, which makes EncryptedSharedPreferences throw on open.
         * Recover by wiping the file (the user just signs in again) instead
         * of crash-looping on every launch and every broadcast.
         */
        private fun openEncrypted(context: Context): SharedPreferences {
            fun create(): SharedPreferences {
                val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
                return EncryptedSharedPreferences.create(
                    context, FILE, key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            }
            return try {
                create()
            } catch (e: Exception) {
                context.deleteSharedPreferences(FILE)
                create()
            }
        }
    }
}
