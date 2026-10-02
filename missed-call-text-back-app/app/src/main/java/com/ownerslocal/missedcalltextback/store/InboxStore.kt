package com.ownerslocal.missedcalltextback.store

import android.content.Context
import com.ownerslocal.missedcalltextback.team.AppNote
import com.ownerslocal.missedcalltextback.team.ConversationSummary
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** A missed call or an incoming text, as shown in the notification popup. */
data class PhoneItem(
    val id: String,
    /** "call" | "text" */
    val kind: String,
    val phone: String,
    val body: String,
    val atMillis: Long,
    /** Tapped from the popup (opened the dialer / Messages). */
    val handled: Boolean
) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("kind", kind).put("phone", phone)
        .put("body", body).put("at", atMillis).put("handled", handled)

    companion object {
        fun fromJson(o: JSONObject) = PhoneItem(
            o.optString("id"), o.optString("kind"), o.optString("phone"), o.optString("body"),
            o.optLong("at"), o.optBoolean("handled")
        )
    }
}

/**
 * Everything the widget popup shows, cached on disk so the popup opens
 * instantly and the widget can decide whether to pulse without the network.
 * Phone items are recorded here as they happen; app notifications and team
 * conversations are replaced wholesale on every server refresh.
 */
class InboxStore(context: Context) {
    private val phoneFile = File(context.filesDir, "inbox_phone.json")
    private val serverFile = File(context.filesDir, "inbox_server.json")

    @Synchronized
    fun addPhoneItem(item: PhoneItem) {
        val items = phoneItems().filterNot { it.id == item.id }.toMutableList()
        items.add(0, item)
        writeArray(phoneFile, items.sortedByDescending { it.atMillis }.take(MAX_PHONE_ITEMS).map { it.toJson() })
    }

    @Synchronized
    fun phoneItems(): List<PhoneItem> = readArray(phoneFile).map { PhoneItem.fromJson(it) }

    @Synchronized
    fun markHandled(id: String) =
        writeArray(phoneFile, phoneItems().map { if (it.id == id) it.copy(handled = true) else it }.map { it.toJson() })

    @Synchronized
    fun markAllHandled() = writeArray(phoneFile, phoneItems().map { it.copy(handled = true).toJson() })

    @Synchronized
    fun saveServer(notes: List<AppNote>?, conversations: List<ConversationSummary>?) {
        val current = readServer()
        val obj = JSONObject()
            .put("notes", JSONArray().apply { (notes ?: current.first).forEach { put(it.toJson()) } })
            .put("conversations", JSONArray().apply { (conversations ?: current.second).forEach { put(it.toJson()) } })
        serverFile.writeText(obj.toString())
    }

    @Synchronized
    fun notes(): List<AppNote> = readServer().first

    @Synchronized
    fun conversations(): List<ConversationSummary> = readServer().second

    @Synchronized
    fun clear() {
        phoneFile.delete()
        serverFile.delete()
    }

    private fun readServer(): Pair<List<AppNote>, List<ConversationSummary>> = try {
        if (!serverFile.exists()) emptyList<AppNote>() to emptyList()
        else {
            val obj = JSONObject(serverFile.readText())
            val notes = obj.optJSONArray("notes") ?: JSONArray()
            val convs = obj.optJSONArray("conversations") ?: JSONArray()
            (0 until notes.length()).map { AppNote.fromJson(notes.getJSONObject(it)) } to
                (0 until convs.length()).map { ConversationSummary.fromJson(convs.getJSONObject(it)) }
        }
    } catch (e: Exception) {
        emptyList<AppNote>() to emptyList()
    }

    private fun readArray(file: File): List<JSONObject> = try {
        if (!file.exists()) emptyList()
        else JSONArray(file.readText()).let { arr -> (0 until arr.length()).map { arr.getJSONObject(it) } }
    } catch (e: Exception) {
        emptyList()
    }

    private fun writeArray(file: File, items: List<JSONObject>) {
        file.writeText(JSONArray().apply { items.forEach { put(it) } }.toString())
    }

    private companion object {
        const val MAX_PHONE_ITEMS = 100
    }
}
