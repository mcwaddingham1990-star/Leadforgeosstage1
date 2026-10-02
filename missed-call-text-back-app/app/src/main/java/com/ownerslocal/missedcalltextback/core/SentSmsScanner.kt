package com.ownerslocal.missedcalltextback.core

import android.Manifest
import android.content.Context
import android.provider.Telephony
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.sync.OutboxEvent

/**
 * Logs texts sent from this phone (the auto-reply, and anything the owner
 * types in their normal Messages app) so the CRM shows both sides of the
 * conversation. Same watermark approach as [CallLogScanner].
 */
object SentSmsScanner {
    @Synchronized
    fun scan(context: Context) {
        val app = MissedCallApp.from(context)
        if (!app.sessions.isSignedIn) return
        if (!Permissions.granted(context, Manifest.permission.READ_SMS)) return

        try {
            val uri = Telephony.Sms.Sent.CONTENT_URI
            val newest = context.contentResolver.query(
                uri, arrayOf(Telephony.Sms._ID), null, null, "${Telephony.Sms._ID} DESC"
            )?.use { c -> if (c.moveToFirst()) c.getLong(0) else 0L } ?: return

            val watermark = app.state.sentSmsWatermark
            if (watermark < 0 || newest < watermark) {
                app.state.sentSmsWatermark = newest
                return
            }
            if (newest == watermark) return

            val since = System.currentTimeMillis() - Config.SCAN_LOOKBACK_MS
            context.contentResolver.query(
                uri,
                arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
                "${Telephony.Sms._ID} > ? AND ${Telephony.Sms.DATE} > ?",
                arrayOf(watermark.toString(), since.toString()),
                "${Telephony.Sms._ID} ASC"
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val address = c.getString(1)
                    val body = c.getString(2)
                    val date = c.getLong(3)
                    if (!address.isNullOrBlank() && !body.isNullOrBlank()) {
                        app.outbox.add(OutboxEvent.Text("sms-out-$date-$id", address, "outgoing", date, body))
                    }
                    app.state.sentSmsWatermark = id
                }
            }
            if (app.state.sentSmsWatermark < newest) app.state.sentSmsWatermark = newest
        } catch (e: SecurityException) {
            app.state.log("Couldn't read sent texts: permission was removed.")
        } catch (e: Exception) {
            app.state.log("Sent-text scan failed: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
        }
    }
}
