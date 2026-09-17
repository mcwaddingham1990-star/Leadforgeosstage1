package com.ownerslocal.missedcalltextback.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Runs after a missed-call auto-reply is sent: matches the caller against
 * this business's existing customers, then leads (by normalized phone
 * digits -- phone numbers are stored however the owner originally typed
 * them, so an exact string match would miss real matches constantly);
 * creates a new Lead if neither matches; and logs the event to
 * missed_call_events, so the web app's Missed Call Text-Back log and the
 * matched customer's Call & Text History panel both reflect it.
 *
 * Deliberately does NOT write into the web app's `notifications` collection
 * -- that collection is populated through a local-array-sync hook
 * (useFirestoreCollection) on the web side with a specific per-document
 * shape this Kotlin code has no reliable way to replicate exactly, and a
 * malformed doc there risks breaking the Alert Center's rendering for
 * every other notification type too. missed_call_events is its own,
 * purpose-built collection instead; the web app surfaces it directly
 * (Missed Call Text-Back page + Customer Details) rather than through the
 * bell.
 */
object CrmLinker {
    private fun normalizePhone(raw: String?): String {
        val digits = raw.orEmpty().filter { it.isDigit() }
        return if (digits.length > 10) digits.takeLast(10) else digits
    }

    private fun isoNow(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }

    /** First document in [collection] (for this business) whose comma-separated `phone` field contains a number matching [targetDigits]. */
    private fun findMatch(
        firestore: FirestoreRestClient,
        collection: String,
        businessId: String,
        idToken: String,
        targetDigits: String
    ): String? {
        if (targetDigits.isEmpty()) return null
        val docs = firestore.queryByField(collection, "businessId", businessId, idToken)
        for ((id, fields) in docs) {
            val phoneField = FirestoreRestClient.stringField(fields, "phone").orEmpty()
            val isMatch = phoneField.split(",").any { normalizePhone(it) == targetDigits }
            if (isMatch) return id
        }
        return null
    }

    /**
     * Best-effort: when [autoReplyMessage] is non-null the SMS already sent
     * successfully before this runs, so a failure here (network hiccup,
     * expired token) only means the event doesn't show up in the log/CRM
     * this time, not that the caller never got texted back.
     *
     * [direction] is "missed" (a missed/rejected call -- the only kind that
     * ever gets a [autoReplyMessage] and can create a brand-new Lead when
     * nobody matches) or "incoming"/"outgoing" (an ordinary answered call,
     * logged for the customer's Call & Text History with no auto-text and
     * no new-Lead creation -- an answered call to/from an unknown number is
     * just as likely personal as it is business).
     */
    fun linkAndLog(
        firestore: FirestoreRestClient,
        businessId: String,
        idToken: String,
        phoneNumber: String,
        direction: String,
        autoReplyMessage: String? = null
    ) {
        val targetDigits = normalizePhone(phoneNumber)
        val customerId = findMatch(firestore, "customers", businessId, idToken, targetDigits)
        var leadId: String? = null
        var createdNewLead = false

        if (customerId == null) {
            leadId = findMatch(firestore, "leads", businessId, idToken, targetDigits)
            if (leadId == null && direction == "missed") {
                leadId = firestore.createDocument(
                    "leads",
                    mapOf(
                        "businessId" to businessId,
                        "name" to "Missed Call ($phoneNumber)",
                        "company" to "",
                        "phone" to phoneNumber,
                        "email" to "",
                        "source" to "Phone Call",
                        "salesRep" to "",
                        "status" to "New",
                        "estimatedValue" to 0,
                        "dateAdded" to isoNow(),
                        "addedDaysAgo" to 0,
                        "notes" to "Auto-created by Missed Call Text-Back -- this number didn't match an existing customer or lead."
                    ),
                    idToken
                )
                createdNewLead = leadId != null
            }
        }

        firestore.createDocument(
            "missed_call_events",
            mapOf(
                "businessId" to businessId,
                "phoneNumber" to phoneNumber,
                "direction" to direction,
                "customerId" to customerId,
                "leadId" to leadId,
                "createdNewLead" to createdNewLead,
                "autoReplyMessage" to (autoReplyMessage ?: ""),
                "autoReplySent" to (autoReplyMessage != null),
                "callTimestamp" to isoNow(),
                "createdAt" to isoNow()
            ),
            idToken
        )
    }
}
