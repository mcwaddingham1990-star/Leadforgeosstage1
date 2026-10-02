package com.ownerslocal.missedcalltextback.core

import android.Manifest
import android.content.Context
import android.provider.CallLog
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.sync.OutboxEvent

/**
 * Treats the phone's call log as the source of truth. Every trigger (call
 * ended broadcast, call-log change, 15-minute safety net, app start) runs
 * the same scan: handle every row newer than the last one processed. That
 * makes duplicate, late or missed broadcasts harmless -- nothing depends on
 * catching a specific broadcast at a specific moment.
 */
object CallLogScanner {
    private val PROJECTION = arrayOf(
        CallLog.Calls._ID,
        CallLog.Calls.NUMBER,
        CallLog.Calls.TYPE,
        CallLog.Calls.DATE
    )

    @Synchronized
    fun scan(context: Context) {
        val app = MissedCallApp.from(context)
        if (!app.sessions.isSignedIn) return
        if (!Permissions.granted(context, Manifest.permission.READ_CALL_LOG)) return

        try {
            val newest = newestId(context) ?: return
            val watermark = app.state.callLogWatermark
            // First run after sign-in: start from "now" so old calls never get texted.
            // Watermark above the newest row means the call log was cleared/restored: re-baseline.
            if (watermark < 0 || newest < watermark) {
                app.state.callLogWatermark = newest
                return
            }
            if (newest == watermark) return

            val since = System.currentTimeMillis() - Config.SCAN_LOOKBACK_MS
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                PROJECTION,
                "${CallLog.Calls._ID} > ? AND ${CallLog.Calls.DATE} > ?",
                arrayOf(watermark.toString(), since.toString()),
                "${CallLog.Calls._ID} ASC"
            )?.use { c ->
                val idCol = c.getColumnIndexOrThrow(CallLog.Calls._ID)
                val numberCol = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
                val typeCol = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
                val dateCol = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
                while (c.moveToNext()) {
                    val id = c.getLong(idCol)
                    handle(context, id, c.getString(numberCol), c.getInt(typeCol), c.getLong(dateCol))
                    app.state.callLogWatermark = id
                }
            }
            // Rows older than the lookback were skipped; don't re-query them next time.
            if (app.state.callLogWatermark < newest) app.state.callLogWatermark = newest
        } catch (e: SecurityException) {
            app.state.log("Couldn't read the call log: permission was removed.")
        } catch (e: Exception) {
            app.state.log("Call log scan failed: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
        }
    }

    private fun newestId(context: Context): Long? =
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls._ID), null, null, "${CallLog.Calls._ID} DESC"
        )?.use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }

    private fun handle(context: Context, id: Long, number: String?, type: Int, date: Long) {
        val eventId = "call-$date-$id"
        when (type) {
            // A declined call logs as REJECTED on many phones; to the caller it's still unanswered.
            CallLog.Calls.MISSED_TYPE, CallLog.Calls.REJECTED_TYPE ->
                AutoReplier.onMissedCall(context, eventId, number, date, "phone")
            CallLog.Calls.INCOMING_TYPE, CallLog.Calls.OUTGOING_TYPE -> {
                if (number.isNullOrBlank()) return
                val direction = if (type == CallLog.Calls.INCOMING_TYPE) "incoming" else "outgoing"
                MissedCallApp.from(context).outbox.add(OutboxEvent.Call(eventId, number, direction, date, null))
            }
            // BLOCKED, VOICEMAIL and anything vendor-specific: never text, never log.
        }
    }
}
