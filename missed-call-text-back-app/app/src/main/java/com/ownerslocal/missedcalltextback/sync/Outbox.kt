package com.ownerslocal.missedcalltextback.sync

import android.content.Context
import com.ownerslocal.missedcalltextback.MissedCallApp
import org.json.JSONArray
import java.io.File

/**
 * Durable queue of calls/texts waiting to reach the server. The phone-side
 * work (sending the reply) never waits on the network; everything that needs
 * the server goes through here and is retried by [OutboxWorker] until it lands.
 */
class Outbox(private val context: Context) {
    private val file = File(context.filesDir, "outbox.json")

    @Synchronized
    fun add(event: OutboxEvent) {
        val items = readAll().filterNot { it.id == event.id }.toMutableList()
        items.add(event)
        val cutoff = System.currentTimeMillis() - MAX_AGE_MS
        write(items.filter { it.atMillis >= cutoff }.takeLast(MAX_ITEMS))
        Work.flushOutbox(context)
    }

    @Synchronized
    fun snapshot(): List<OutboxEvent> = readAll()

    @Synchronized
    fun remove(ids: Set<String>) {
        if (ids.isEmpty()) return
        write(readAll().filterNot { it.id in ids })
    }

    @Synchronized
    fun clear() {
        file.delete()
    }

    val size: Int get() = snapshot().size

    private fun readAll(): List<OutboxEvent> = try {
        if (!file.exists()) emptyList()
        else JSONArray(file.readText()).let { arr ->
            (0 until arr.length()).mapNotNull { OutboxEvent.fromJson(arr.getJSONObject(it)) }
        }
    } catch (e: Exception) {
        MissedCallApp.from(context).state.log("Upload queue was unreadable and was reset.")
        file.delete()
        emptyList()
    }

    private fun write(items: List<OutboxEvent>) {
        val tmp = File(file.parentFile, "outbox.json.tmp")
        tmp.writeText(JSONArray().apply { items.forEach { put(it.toJson()) } }.toString())
        tmp.renameTo(file)
    }

    private companion object {
        const val MAX_ITEMS = 1000
        const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000
    }
}
