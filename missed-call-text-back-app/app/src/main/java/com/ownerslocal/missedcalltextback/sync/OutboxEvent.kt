package com.ownerslocal.missedcalltextback.sync

import org.json.JSONObject

/** A call or text waiting to be written to the server. [id] doubles as the Firestore doc ID. */
sealed class OutboxEvent {
    abstract val id: String
    abstract val phone: String
    abstract val direction: String
    abstract val atMillis: Long

    data class Call(
        override val id: String,
        override val phone: String,
        /** "missed" | "incoming" | "outgoing" */
        override val direction: String,
        override val atMillis: Long,
        val autoReplyMessage: String?
    ) : OutboxEvent()

    data class Text(
        override val id: String,
        override val phone: String,
        /** "incoming" | "outgoing" */
        override val direction: String,
        override val atMillis: Long,
        val body: String
    ) : OutboxEvent()

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("phone", phone)
        .put("direction", direction)
        .put("at", atMillis)
        .apply {
            when (this@OutboxEvent) {
                is Call -> put("type", "call").put("reply", autoReplyMessage ?: JSONObject.NULL)
                is Text -> put("type", "text").put("body", body)
            }
        }

    companion object {
        fun fromJson(obj: JSONObject): OutboxEvent? = try {
            when (obj.getString("type")) {
                "call" -> Call(
                    obj.getString("id"), obj.getString("phone"), obj.getString("direction"), obj.getLong("at"),
                    if (obj.isNull("reply")) null else obj.getString("reply")
                )
                "text" -> Text(
                    obj.getString("id"), obj.getString("phone"), obj.getString("direction"), obj.getLong("at"),
                    obj.getString("body")
                )
                else -> null
            }
        } catch (e: org.json.JSONException) {
            null
        }
    }
}
