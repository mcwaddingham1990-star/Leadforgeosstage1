package com.ownerslocal.missedcalltextback.account

import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.core.PhoneNumbers
import com.ownerslocal.missedcalltextback.core.isoUtc
import com.ownerslocal.missedcalltextback.sync.OutboxEvent

/**
 * An OwnersLOCAL owner/manager login. The tenant is the business (keyed by
 * the owner's email, user_profiles/{uid}.businessEmail), settings come from
 * the web app's Missed Call Text-Back page, and events land in the same
 * collections the web app's log, Inbox and Customer history read:
 * missed_call_settings, missed_call_events, text_messages, leads.
 */
class OwnersLocalAccountProvider(private val firestore: FirestoreRest) : AccountProvider {
    override val kind = AccountKind.OWNERSLOCAL

    override fun resolveTenant(uid: String, email: String, idToken: String): TenantResult =
        when (val profile = firestore.get("user_profiles/$uid", idToken)) {
            is DocResult.Found -> {
                val businessId = FirestoreRest.string(profile.fields, "businessEmail")
                if (businessId.isNullOrBlank()) {
                    TenantResult.Failure("This login isn't linked to a business yet. Finish setup in OwnersLOCAL first.")
                } else {
                    TenantResult.Ok(businessId, businessId)
                }
            }
            DocResult.Missing -> TenantResult.Failure("No OwnersLOCAL business found for this login.")
            is DocResult.Error -> TenantResult.Failure("Couldn't load your account (${error(profile)}). Try again.")
        }

    override fun fetchSettings(tenantId: String, idToken: String): Fetch<RemoteSettings> =
        when (val doc = firestore.get("missed_call_settings/$tenantId", idToken)) {
            is DocResult.Found -> Fetch.Ok(
                RemoteSettings(
                    enabled = FirestoreRest.bool(doc.fields, "enabled") ?: true,
                    messageTemplate = FirestoreRest.string(doc.fields, "messageTemplate")
                        ?.takeIf { it.isNotBlank() } ?: Config.DEFAULT_MESSAGE,
                    watchedPackages = FirestoreRest.stringList(doc.fields, "watchedPackages").toSet()
                )
            )
            DocResult.Missing -> Fetch.Ok(RemoteSettings(true, Config.DEFAULT_MESSAGE, emptySet()))
            is DocResult.Error -> Fetch.Failed("Couldn't load settings (${error(doc)}).")
        }

    override fun saveSettings(tenantId: String, settings: RemoteSettings, idToken: String): Boolean =
        firestore.merge(
            "missed_call_settings/$tenantId",
            mapOf(
                "enabled" to settings.enabled,
                "messageTemplate" to settings.messageTemplate,
                "watchedPackages" to settings.watchedPackages.toList()
            ),
            idToken
        )

    /**
     * Informational only: an OwnersLOCAL login is covered by that business's
     * OwnersLOCAL plan, and the web app owns that paywall. Never blocks here,
     * so a Stripe outage or unconfigured billing can't silently stop texts.
     */
    override fun fetchEntitlement(tenantId: String, idToken: String): Fetch<Entitlement> =
        when (val doc = firestore.get("business_profiles/$tenantId", idToken)) {
            is DocResult.Found -> {
                val subscribed = FirestoreRest.bool(doc.fields, "subscriptionActive") == true
                val bypassUntil = FirestoreRest.timeMillis(doc.fields, "bypassExpiresAt")
                val bypass = FirestoreRest.bool(doc.fields, "bypassActive") == true &&
                    (bypassUntil == null || bypassUntil > System.currentTimeMillis())
                Fetch.Ok(
                    Entitlement(
                        active = true,
                        summary = when {
                            subscribed -> "OwnersLOCAL plan active"
                            bypass -> "OwnersLOCAL free access"
                            else -> "Included with your OwnersLOCAL login"
                        }
                    )
                )
            }
            DocResult.Missing -> Fetch.Ok(Entitlement(true, "Included with your OwnersLOCAL login"))
            is DocResult.Error -> Fetch.Failed("Couldn't check plan (${error(doc)}).")
        }

    override fun deliver(event: OutboxEvent, tenantId: String, idToken: String): Boolean {
        val createLead = when (event) {
            is OutboxEvent.Call -> event.direction == "missed"
            is OutboxEvent.Text -> event.direction == "incoming"
        }
        val match = matchOrCreateLead(event, tenantId, idToken, createLead) ?: return false
        val at = isoUtc(event.atMillis)
        val result = when (event) {
            is OutboxEvent.Call -> firestore.create(
                "missed_call_events", event.id,
                mapOf(
                    "businessId" to tenantId,
                    "phoneNumber" to event.phone,
                    "direction" to event.direction,
                    "customerId" to match.customerId,
                    "leadId" to match.leadId,
                    "createdNewLead" to match.createdNewLead,
                    "autoReplyMessage" to (event.autoReplyMessage ?: ""),
                    "autoReplySent" to (event.autoReplyMessage != null),
                    "callTimestamp" to at,
                    "createdAt" to isoUtc(System.currentTimeMillis()),
                    "source" to "android"
                ),
                idToken
            )
            is OutboxEvent.Text -> firestore.create(
                "text_messages", event.id,
                mapOf(
                    "businessId" to tenantId,
                    "phoneNumber" to event.phone,
                    "direction" to event.direction,
                    "body" to event.body,
                    "customerId" to match.customerId,
                    "leadId" to match.leadId,
                    "createdNewLead" to match.createdNewLead,
                    "timestamp" to at,
                    "createdAt" to isoUtc(System.currentTimeMillis()),
                    "source" to "android"
                ),
                idToken
            )
        }
        // DENIED counts as handled: this login can't write the log, and retrying forever won't change that.
        return result != WriteResult.FAILED
    }

    // Customers/leads for this business, reused across the events in one upload run.
    private var cacheAt = 0L
    private var customers: List<Pair<String, org.json.JSONObject>> = emptyList()
    private var leads: MutableList<Pair<String, org.json.JSONObject>> = mutableListOf()

    /** False on a network error. */
    private fun loadDirectory(tenantId: String, idToken: String): Boolean {
        if (System.currentTimeMillis() - cacheAt < CACHE_MS) return true
        customers = firestore.queryEquals("customers", "businessId", tenantId, idToken) ?: return false
        leads = (firestore.queryEquals("leads", "businessId", tenantId, idToken) ?: return false).toMutableList()
        cacheAt = System.currentTimeMillis()
        return true
    }

    private class Match(val customerId: String?, val leadId: String?, val createdNewLead: Boolean)

    /** Null means a lookup failed: retry later rather than risk a duplicate lead. */
    private fun matchOrCreateLead(event: OutboxEvent, tenantId: String, idToken: String, createLead: Boolean): Match? {
        val digits = PhoneNumbers.matchKey(event.phone)
        if (digits.isEmpty()) return Match(null, null, false)

        if (!loadDirectory(tenantId, idToken)) return null
        findByPhone(customers, digits)?.let { return Match(it, null, false) }
        findByPhone(leads, digits)?.let { return Match(null, it, false) }

        if (!createLead) return Match(null, null, false)

        val label = if (event is OutboxEvent.Call) "Missed Call" else "Text Message"
        // Lead ID derives from the event ID so a retried delivery reuses it.
        val leadId = "mctb_${event.id}"
        val written = firestore.create(
            "leads", leadId,
            mapOf(
                "businessId" to tenantId,
                "name" to "$label (${PhoneNumbers.pretty(event.phone)})",
                "company" to "",
                "phone" to event.phone,
                "email" to "",
                "source" to "Phone Call",
                "salesRep" to "",
                "status" to "New",
                "estimatedValue" to 0,
                "dateAdded" to isoUtc(event.atMillis),
                "addedDaysAgo" to 0,
                "notes" to "Auto-created by Missed Call Text-Back: this number didn't match an existing customer or lead."
            ),
            idToken
        )
        return when (written) {
            WriteResult.WRITTEN, WriteResult.ALREADY_EXISTS -> {
                // So the auto-reply text that follows links to this same lead.
                leads.add(leadId to org.json.JSONObject().put("phone", org.json.JSONObject().put("stringValue", event.phone)))
                Match(null, leadId, true)
            }
            // This login can't create leads: still log the call, just unlinked.
            WriteResult.DENIED -> Match(null, null, false)
            WriteResult.FAILED -> null
        }
    }

    private fun findByPhone(docs: List<Pair<String, org.json.JSONObject>>, digits: String): String? =
        docs.firstOrNull { (_, fields) ->
            FirestoreRest.string(fields, "phone").orEmpty()
                .split(',', ';', '/')
                .any { PhoneNumbers.matchKey(it) == digits }
        }?.first

    private companion object {
        const val CACHE_MS = 60_000L
    }

    private fun error(e: DocResult.Error) = if (e.code == 0) e.message else "${e.code} ${e.message}"
}
