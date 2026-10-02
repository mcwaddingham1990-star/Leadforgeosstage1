package com.ownerslocal.missedcalltextback.account

import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.core.isoUtc
import com.ownerslocal.missedcalltextback.sync.OutboxEvent

/**
 * An individual subscriber with no OwnersLOCAL business. Not offered on the
 * sign-in screen yet (see Config.ENABLED_ACCOUNT_KINDS).
 *
 * Data model (rules in firestore.rules, "mctb_accounts"):
 *   mctb_accounts/{uid}                     settings + server-written subscription fields
 *   mctb_accounts/{uid}/call_events/{id}    one per call
 *   mctb_accounts/{uid}/text_messages/{id}  one per SMS
 *
 * subscriptionActive / subscriptionCurrentPeriodEnd / stripeCustomerId are
 * written only by the server (Admin SDK) from Stripe webhooks; the rules
 * reject any client write that touches them.
 */
class StandaloneAccountProvider(private val firestore: FirestoreRest) : AccountProvider {
    override val kind = AccountKind.STANDALONE

    private fun accountPath(uid: String) = "mctb_accounts/$uid"

    override fun resolveTenant(uid: String, email: String, idToken: String): TenantResult =
        when (val doc = firestore.get(accountPath(uid), idToken)) {
            is DocResult.Found -> TenantResult.Ok(uid, email)
            DocResult.Missing -> {
                val created = firestore.merge(
                    accountPath(uid),
                    mapOf("email" to email, "createdAt" to isoUtc(System.currentTimeMillis())),
                    idToken
                )
                if (created) TenantResult.Ok(uid, email) else TenantResult.Failure("Couldn't create your account. Try again.")
            }
            is DocResult.Error -> TenantResult.Failure("Couldn't load your account (${doc.code} ${doc.message}).")
        }

    override fun fetchSettings(tenantId: String, idToken: String): Fetch<RemoteSettings> =
        when (val doc = firestore.get(accountPath(tenantId), idToken)) {
            is DocResult.Found -> Fetch.Ok(
                RemoteSettings(
                    enabled = FirestoreRest.bool(doc.fields, "enabled") ?: true,
                    messageTemplate = FirestoreRest.string(doc.fields, "messageTemplate")
                        ?.takeIf { it.isNotBlank() } ?: Config.DEFAULT_MESSAGE,
                    watchedPackages = FirestoreRest.stringList(doc.fields, "watchedPackages").toSet()
                )
            )
            DocResult.Missing -> Fetch.Ok(RemoteSettings(true, Config.DEFAULT_MESSAGE, emptySet()))
            is DocResult.Error -> Fetch.Failed("Couldn't load settings (${doc.code}).")
        }

    override fun saveSettings(tenantId: String, settings: RemoteSettings, idToken: String): Boolean =
        firestore.merge(
            accountPath(tenantId),
            mapOf(
                "enabled" to settings.enabled,
                "messageTemplate" to settings.messageTemplate,
                "watchedPackages" to settings.watchedPackages.toList()
            ),
            idToken
        )

    override fun fetchEntitlement(tenantId: String, idToken: String): Fetch<Entitlement> =
        when (val doc = firestore.get(accountPath(tenantId), idToken)) {
            is DocResult.Found -> {
                val active = FirestoreRest.bool(doc.fields, "subscriptionActive") == true
                val periodEnd = FirestoreRest.timeMillis(doc.fields, "subscriptionCurrentPeriodEnd")
                val current = active && (periodEnd == null || periodEnd > System.currentTimeMillis())
                Fetch.Ok(
                    if (current) Entitlement(true, "Subscription active")
                    else Entitlement(false, "No active subscription. Auto-replies are paused.")
                )
            }
            DocResult.Missing -> Fetch.Ok(Entitlement(false, "No active subscription. Auto-replies are paused."))
            is DocResult.Error -> Fetch.Failed("Couldn't check subscription (${doc.code}).")
        }

    override fun deliver(event: OutboxEvent, tenantId: String, idToken: String): Boolean {
        val at = isoUtc(event.atMillis)
        val result = when (event) {
            is OutboxEvent.Call -> firestore.create(
                "${accountPath(tenantId)}/call_events", event.id,
                mapOf(
                    "phoneNumber" to event.phone,
                    "direction" to event.direction,
                    "autoReplyMessage" to (event.autoReplyMessage ?: ""),
                    "autoReplySent" to (event.autoReplyMessage != null),
                    "callTimestamp" to at,
                    "createdAt" to isoUtc(System.currentTimeMillis())
                ),
                idToken
            )
            is OutboxEvent.Text -> firestore.create(
                "${accountPath(tenantId)}/text_messages", event.id,
                mapOf(
                    "phoneNumber" to event.phone,
                    "direction" to event.direction,
                    "body" to event.body,
                    "timestamp" to at,
                    "createdAt" to isoUtc(System.currentTimeMillis())
                ),
                idToken
            )
        }
        return result != WriteResult.FAILED
    }
}
