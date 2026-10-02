package com.ownerslocal.missedcalltextback.team

import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.account.DocResult
import com.ownerslocal.missedcalltextback.account.FirestoreRest
import com.ownerslocal.missedcalltextback.account.WriteResult
import com.ownerslocal.missedcalltextback.store.Session
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The main app's Alert Center and team Messages, read and written with the
 * same shapes the web app uses (see MessagesPage.tsx / notificationsService.ts),
 * so anything sent from here shows up there and vice versa. OwnersLOCAL
 * logins only: standalone accounts have no team.
 *
 * "Unread" is per person: conversation_reads/{uid}.reads.{conversationId}
 * holds when this login last read each conversation. The shared isRead flag
 * on the conversation itself isn't used, since anyone opening it flips it.
 */
class TeamRepository(private val firestore: FirestoreRest, private val http: OkHttpClient) {

    // ---------------------------------------------------------------- identity

    /** The display name and role the main app uses for this login (user_profiles). */
    fun myProfile(session: Session): Pair<String?, String?> {
        val fields = (firestore.get("user_profiles/${session.uid}", session.idToken) as? DocResult.Found)?.fields
        return FirestoreRest.string(fields, "name")?.takeIf { it.isNotBlank() } to FirestoreRest.string(fields, "role")
    }

    // ---------------------------------------------------------------- notifications

    fun notifications(session: Session): List<AppNote>? =
        firestore.queryAllEqual(
            "notifications",
            mapOf("businessId" to session.tenantId, "recipientEmail" to session.email),
            session.idToken
        )?.map { (id, fields) ->
            val f = FirestoreRest.decodeFields(fields)
            AppNote(
                id = id,
                title = f["title"] as? String ?: "Notification",
                body = f["description"] as? String ?: "",
                atMillis = parseIso(f["createdAt"] as? String) ?: 0L,
                isRead = f["isRead"] == true
            )
        }?.sortedByDescending { it.atMillis }

    fun markNotificationRead(session: Session, id: String): Boolean =
        firestore.patch("notifications/$id", mapOf("isRead" to true), session.idToken)

    // ---------------------------------------------------------------- conversations

    private fun reads(session: Session): Map<String, Long> =
        (firestore.get("conversation_reads/${session.uid}", session.idToken) as? DocResult.Found)
            ?.let { FirestoreRest.decodeFields(it.fields)["reads"] as? Map<*, *> }
            ?.mapNotNull { (k, v) -> (v as? Number)?.let { k.toString() to it.toLong() } }
            ?.toMap()
            .orEmpty()

    fun markConversationRead(session: Session, conversationId: String): Boolean =
        firestore.merge(
            "conversation_reads/${session.uid}",
            mapOf("email" to session.email, "reads" to mapOf(conversationId to System.currentTimeMillis())),
            session.idToken,
            mask = listOf("email", "reads.`$conversationId`")
        )

    /**
     * Conversations this person is in, newest first. [baselineMillis] keeps
     * history from before they first signed in here from all counting as unread.
     */
    fun conversations(session: Session, myName: String?, baselineMillis: Long): List<ConversationSummary>? {
        val docs = firestore.queryEquals("conversations", "businessId", session.tenantId, session.idToken) ?: return null
        val reads = reads(session)
        return docs.mapNotNull { (id, fields) ->
            val f = FirestoreRest.decodeFields(fields)
            if (f["isArchived"] == true || f["type"] == "AI Conversation") return@mapNotNull null
            val participants = (f["participants"] as? List<*>)?.mapNotNull { it as? String }.orEmpty()
            if (myName != null && participants.isNotEmpty() && myName !in participants) return@mapNotNull null
            val messages = parseMessages(f["messages"])
            val last = messages.lastOrNull { !it.isSystem } ?: messages.lastOrNull()
            val readAt = maxOf(reads[id] ?: 0L, baselineMillis)
            val unread = messages.any { !it.isSystem && !isMine(it, session, myName) && it.atMillis > readAt }
            ConversationSummary(
                id = id,
                title = (f["title"] as? String)?.takeIf { it.isNotBlank() } ?: participants.joinToString(", "),
                participants = participants,
                lastMessage = last?.let { if (it.content.isBlank() && it.photos.isNotEmpty()) "📷 Photo" else it.content }
                    ?: (f["lastMessage"] as? String).orEmpty(),
                lastSender = last?.sender ?: (f["lastMessageSender"] as? String).orEmpty(),
                lastMillis = last?.atMillis ?: 0L,
                unreadForMe = unread
            )
        }.sortedByDescending { it.lastMillis }
    }

    fun messages(session: Session, conversationId: String): List<ChatMessage>? =
        when (val doc = firestore.get("conversations/$conversationId", session.idToken)) {
            is DocResult.Found -> parseMessages(FirestoreRest.decodeFields(doc.fields)["messages"])
            else -> null
        }

    fun isMine(message: ChatMessage, session: Session, myName: String?): Boolean =
        message.senderEmail?.equals(session.email, ignoreCase = true) == true ||
            (message.senderEmail == null && myName != null && message.sender == myName)

    fun send(session: Session, myName: String, role: String, conversationId: String, text: String, photoDataUrl: String?): Boolean {
        val now = System.currentTimeMillis()
        val message = buildMessage(myName, session.email, role, text, photoDataUrl, now)
        return firestore.updateAndAppend(
            "conversations/$conversationId",
            mapOf(
                "lastMessage" to previewOf(text, photoDataUrl),
                "lastMessageSender" to myName,
                "lastMessageTime" to webTimestamp(now),
                "isRead" to false,
                "updatedAt" to isoNow()
            ),
            "messages",
            listOf(message),
            session.idToken
        )
    }

    /** Starts a Direct Message the same way the web app does; returns the new conversation id. */
    fun startConversation(
        session: Session,
        myName: String,
        role: String,
        teammate: Teammate,
        text: String,
        photoDataUrl: String?
    ): String? {
        val now = System.currentTimeMillis()
        val id = "conv_$now"
        val messages = listOf(
            mapOf(
                "id" to "m_init_$now",
                "sender" to "System Event Node",
                "senderRole" to "System Notification",
                "content" to "Conversation started. Participants: $myName, ${teammate.name}",
                "timestamp" to webTimestamp(now)
            ),
            buildMessage(myName, session.email, role, text, photoDataUrl, now + 1)
        )
        val result = firestore.create(
            "conversations", id,
            mapOf(
                "id" to id,
                "businessId" to session.tenantId,
                "title" to "Chat with ${teammate.name}",
                "type" to "Direct Message",
                "participants" to listOf(myName, teammate.name),
                "unreadCount" to 0,
                "lastMessage" to previewOf(text, photoDataUrl),
                "lastMessageTime" to webTimestamp(now),
                "lastMessageSender" to myName,
                "isRead" to false,
                "isArchived" to false,
                "priority" to "Normal",
                "createdDate" to webTimestamp(now).substring(0, 10),
                "messages" to messages,
                "updatedAt" to isoNow()
            ),
            session.idToken
        )
        return if (result == WriteResult.WRITTEN) id else null
    }

    /** Everyone on the roster/employee list the web app's "Team member" picker shows, minus me. */
    fun teammates(session: Session, myName: String?): List<Teammate>? {
        val employees = firestore.queryEquals("employees", "businessEmail", session.tenantId, session.idToken) ?: return null
        val roster = firestore.queryEquals("roster", "businessId", session.tenantId, session.idToken).orEmpty()
        val byName = LinkedHashMap<String, Teammate>()
        roster.forEach { (_, fields) ->
            val f = FirestoreRest.decodeFields(fields)
            val name = (f["name"] as? String)?.trim().orEmpty()
            if (name.isEmpty() || (f["status"] as? String)?.equals("inactive", true) == true) return@forEach
            byName[name.lowercase()] = Teammate(name, f["email"] as? String, f["role"] as? String ?: "")
        }
        employees.forEach { (id, fields) ->
            val f = FirestoreRest.decodeFields(fields)
            val name = "${f["firstName"] as? String ?: ""} ${f["lastName"] as? String ?: ""}".trim()
            if (name.isEmpty()) return@forEach
            byName[name.lowercase()] = Teammate(name, (f["email"] as? String) ?: id, f["role"] as? String ?: "")
        }
        // Owners usually have no employee record; their name is on the business profile.
        if (!session.email.equals(session.tenantId, ignoreCase = true)) {
            val business = (firestore.get("business_profiles/${session.tenantId}", session.idToken) as? DocResult.Found)?.fields
            val ownerName = (FirestoreRest.decodeFields(business)["ownerNames"] as? List<*>)
                ?.mapNotNull { (it as? String)?.trim() }?.firstOrNull { it.isNotEmpty() }
            if (ownerName != null && byName.values.none { it.email.equals(session.tenantId, ignoreCase = true) }) {
                byName[ownerName.lowercase()] = Teammate(ownerName, session.tenantId, "Owner")
            }
        }
        return byName.values
            .filter { it.name != myName && !it.email.equals(session.email, ignoreCase = true) }
            .sortedBy { it.name.lowercase() }
    }

    /**
     * Asks the server to push this message to the other participants' phones
     * and browsers. Best effort: the message is already saved either way.
     */
    fun pushToParticipants(session: Session, recipientEmails: List<String>, title: String, body: String) {
        if (recipientEmails.isEmpty()) return
        val payload = JSONObject()
            .put("recipientEmails", JSONArray(recipientEmails))
            .put("title", title)
            .put("body", body.take(180))
            .put("data", JSONObject().put("kind", "message"))
        val request = Request.Builder()
            .url("${Config.MAIN_APP_URL}/api/notifications/send-push")
            .header("Authorization", "Bearer ${session.idToken}")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()
        try {
            http.newCall(request).execute().close()
        } catch (e: Exception) {
            // Recipients still see it on their next refresh.
        }
    }

    // ---------------------------------------------------------------- helpers

    private fun buildMessage(
        name: String,
        email: String,
        role: String,
        text: String,
        photoDataUrl: String?,
        atMillis: Long
    ): Map<String, Any?> {
        val message = linkedMapOf<String, Any?>(
            "id" to "m_$atMillis",
            "sender" to name,
            "senderEmail" to email,
            "senderRole" to role,
            "content" to text,
            "timestamp" to webTimestamp(atMillis)
        )
        if (photoDataUrl != null) {
            message["attachments"] = listOf(
                mapOf(
                    "id" to "att_$atMillis",
                    "type" to "Photo",
                    "name" to "photo_$atMillis.jpg",
                    "size" to "${photoDataUrl.length * 3 / 4 / 1024} KB",
                    "meta" to mapOf("dataUrl" to photoDataUrl)
                )
            )
        }
        return message
    }

    private fun previewOf(text: String, photo: String?) =
        text.ifBlank { if (photo != null) "[Sent Photo]" else "" }

    private fun parseMessages(raw: Any?): List<ChatMessage> =
        (raw as? List<*>).orEmpty().mapNotNull { item ->
            val m = item as? Map<*, *> ?: return@mapNotNull null
            val id = m["id"] as? String ?: return@mapNotNull null
            val photos = (m["attachments"] as? List<*>).orEmpty()
                .mapNotNull { it as? Map<*, *> }
                .filter { it["type"] == "Photo" }
                .mapNotNull { ((it["meta"] as? Map<*, *>)?.get("dataUrl") as? String)?.takeIf { url -> url.startsWith("data:image") } }
            ChatMessage(
                id = id,
                sender = m["sender"] as? String ?: "",
                senderEmail = m["senderEmail"] as? String,
                senderRole = m["senderRole"] as? String ?: "",
                content = m["content"] as? String ?: "",
                atMillis = messageMillis(id, m["timestamp"] as? String),
                photos = photos
            )
        }.sortedBy { it.atMillis }

    companion object {
        /** Message ids are "m_<epoch ms>" (or "m_init_<ms>"); the display timestamp is the fallback. */
        fun messageMillis(id: String, timestamp: String?): Long {
            Regex("""(\d{12,})""").find(id)?.value?.toLongOrNull()?.let { return it }
            return try {
                SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
                    .parse(timestamp.orEmpty())?.time ?: 0L
            } catch (e: Exception) {
                0L
            }
        }

        /** The web app's message timestamp: ISO, UTC, trimmed to minutes ("2026-07-06 14:32"). */
        fun webTimestamp(millis: Long): String =
            SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(millis))

        private fun isoNow(): String = com.ownerslocal.missedcalltextback.core.isoUtc(System.currentTimeMillis())

        fun parseIso(raw: String?): Long? = try {
            raw?.let { java.time.Instant.parse(it).toEpochMilli() }
        } catch (e: Exception) {
            null
        }
    }
}
