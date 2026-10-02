package com.ownerslocal.missedcalltextback.team

import org.json.JSONArray
import org.json.JSONObject

/** One entry in the main app's Alert Center (`notifications`, addressed to this login). */
data class AppNote(
    val id: String,
    val title: String,
    val body: String,
    val atMillis: Long,
    val isRead: Boolean
) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("title", title).put("body", body)
        .put("at", atMillis).put("read", isRead)

    companion object {
        fun fromJson(o: JSONObject) = AppNote(
            o.optString("id"), o.optString("title"), o.optString("body"), o.optLong("at"), o.optBoolean("read")
        )
    }
}

data class ChatMessage(
    val id: String,
    val sender: String,
    val senderEmail: String?,
    val senderRole: String,
    val content: String,
    val atMillis: Long,
    /** data: URLs of attached photos (the main app stores photos inline this way). */
    val photos: List<String>
) {
    val isSystem: Boolean get() = senderRole == "System Notification"
}

/** A team conversation from the main app's Messages page. */
data class ConversationSummary(
    val id: String,
    val title: String,
    val participants: List<String>,
    val lastMessage: String,
    val lastSender: String,
    val lastMillis: Long,
    val unreadForMe: Boolean
) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("title", title)
        .put("participants", JSONArray(participants)).put("lastMessage", lastMessage)
        .put("lastSender", lastSender).put("lastAt", lastMillis).put("unread", unreadForMe)

    companion object {
        fun fromJson(o: JSONObject) = ConversationSummary(
            o.optString("id"), o.optString("title"),
            o.optJSONArray("participants")?.let { arr -> (0 until arr.length()).map { arr.optString(it) } }.orEmpty(),
            o.optString("lastMessage"), o.optString("lastSender"), o.optLong("lastAt"), o.optBoolean("unread")
        )
    }
}

data class Teammate(val name: String, val email: String?, val role: String)
