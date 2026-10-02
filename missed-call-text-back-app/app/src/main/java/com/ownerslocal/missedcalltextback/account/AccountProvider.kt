package com.ownerslocal.missedcalltextback.account

import com.ownerslocal.missedcalltextback.sync.OutboxEvent

enum class AccountKind(val label: String) {
    /** Signs in with an OwnersLOCAL owner/manager login; data lives in that business's CRM. */
    OWNERSLOCAL("OwnersLOCAL account"),

    /** An individual Missed Call Text-Back subscriber with no OwnersLOCAL business. */
    STANDALONE("Missed Call Text-Back account");

    companion object {
        fun fromName(name: String?): AccountKind? = values().firstOrNull { it.name == name }
    }
}

data class RemoteSettings(
    val enabled: Boolean,
    val messageTemplate: String,
    val watchedPackages: Set<String>
)

data class Entitlement(
    /** False blocks auto-replies. */
    val active: Boolean,
    /** Short line shown on the dashboard. */
    val summary: String
)

sealed class TenantResult {
    data class Ok(val tenantId: String, val displayName: String) : TenantResult()
    data class Failure(val message: String) : TenantResult()
}

sealed class Fetch<out T> {
    data class Ok<T>(val value: T) : Fetch<T>()
    data class Failed(val message: String) : Fetch<Nothing>()
}

/**
 * Everything that differs between an OwnersLOCAL login and a standalone
 * subscriber. Both sign in through the same Firebase Auth project; they
 * differ in which tenant the login maps to, where settings/entitlement live,
 * and where call/text events are written.
 */
interface AccountProvider {
    val kind: AccountKind

    fun resolveTenant(uid: String, email: String, idToken: String): TenantResult

    fun fetchSettings(tenantId: String, idToken: String): Fetch<RemoteSettings>

    fun saveSettings(tenantId: String, settings: RemoteSettings, idToken: String): Boolean

    fun fetchEntitlement(tenantId: String, idToken: String): Fetch<Entitlement>

    /** Idempotent: delivering the same event twice must not create a duplicate. */
    fun deliver(event: OutboxEvent, tenantId: String, idToken: String): Boolean

    companion object {
        fun forKind(kind: AccountKind, firestore: FirestoreRest): AccountProvider = when (kind) {
            AccountKind.OWNERSLOCAL -> OwnersLocalAccountProvider(firestore)
            AccountKind.STANDALONE -> StandaloneAccountProvider(firestore)
        }
    }
}
