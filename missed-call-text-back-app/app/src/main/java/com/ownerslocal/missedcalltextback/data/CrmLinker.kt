package com.ownerslocal.missedcalltextback.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Matches a phone number against this business's existing customers, then
 * leads (by normalized phone digits -- phone numbers are stored however the
 * owner originally typed them, so an exact string match would miss real
 * matches constantly), creates a new Lead when nobody matches and the event
 * is the kind that warrants one, and logs the real event --
 * linkAndLog for calls (missed_call_events), logTextMessage for real SMS
 * (text_messages, see SmsReceiver.kt/OutgoingSmsObserver.kt) -- so the web
 * app's Missed Call Text-Back log, business-wide Inbox, and the matched
 * customer's Call & Text History panel all reflect it.
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
    /** Shared by linkAndLog and logTextMessage: matches an existing customer, then lead, creating a new lead only when [createLeadIfUnmatched] and nobody matched -- a "someone reached out to us" event (a missed call, or an incoming text), never an answered/outgoing one (just as likely personal as business). */
    private class MatchResult(val customerId: String?, val leadId: String?, val createdNewLead: Boolean)

    private fun matchOrCreateLead(
        firestore: FirestoreRestClient,
        businessId: String,
        idToken: String,
        phoneNumber: String,
        createLeadIfUnmatched: Boolean,
        autoCreateNote: String
    ): MatchResult {
        val targetDigits = normalizePhone(phoneNumber)
        val customerId = findMatch(firestore, "customers", businessId, idToken, targetDigits)
        if (customerId != null) return MatchResult(customerId, null, false)

        var leadId = findMatch(firestore, "leads", businessId, idToken, targetDigits)
        var createdNewLead = false
        if (leadId == null && createLeadIfUnmatched) {
            leadId = firestore.createDocument(
                "leads",
                mapOf(
                    "businessId" to businessId,
                    "name" to "$autoCreateNote ($phoneNumber)",
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
        return MatchResult(customerId, leadId, createdNewLead)
    }

    fun linkAndLog(
        firestore: FirestoreRestClient,
        businessId: String,
        idToken: String,
        phoneNumber: String,
        direction: String,
        autoReplyMessage: String? = null
    ) {
        val match = matchOrCreateLead(firestore, businessId, idToken, phoneNumber, direction == "missed", "Missed Call")

        firestore.createDocument(
            "missed_call_events",
            mapOf(
                "businessId" to businessId,
                "phoneNumber" to phoneNumber,
                "direction" to direction,
                "customerId" to match.customerId,
                "leadId" to match.leadId,
                "createdNewLead" to match.createdNewLead,
                "autoReplyMessage" to (autoReplyMessage ?: ""),
                "autoReplySent" to (autoReplyMessage != null),
                "callTimestamp" to isoNow(),
                "createdAt" to isoNow()
            ),
            idToken
        )
    }

    /**
     * Logs one real SMS (either direction) to text_messages, matched against
     * the same customers/leads this business already has on file. An
     * unmatched INCOMING text creates a new Lead, same reasoning as an
     * unmatched missed call -- an unprompted inbound text is a real
     * inbound inquiry. An unmatched OUTGOING text never creates one: that's
     * the owner texting someone first from their own phone's native
     * Messages app, which is just as likely personal as it is business.
     */
    fun logTextMessage(
        firestore: FirestoreRestClient,
        businessId: String,
        idToken: String,
        phoneNumber: String,
        direction: String,
        body: String
    ) {
        val match = matchOrCreateLead(firestore, businessId, idToken, phoneNumber, direction == "incoming", "Text Message")

        firestore.createDocument(
            "text_messages",
            mapOf(
                "businessId" to businessId,
                "phoneNumber" to phoneNumber,
                "direction" to direction,
                "body" to body,
                "customerId" to match.customerId,
                "leadId" to match.leadId,
                "createdNewLead" to match.createdNewLead,
                "timestamp" to isoNow(),
                "createdAt" to isoNow()
            ),
            idToken
        )
    }
}
