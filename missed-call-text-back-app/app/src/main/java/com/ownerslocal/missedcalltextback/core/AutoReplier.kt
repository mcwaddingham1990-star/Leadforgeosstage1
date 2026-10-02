package com.ownerslocal.missedcalltextback.core

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.sync.OutboxEvent

/**
 * The one place that decides whether a missed call gets a text, and sends it.
 * Every path that detects a missed call (call log, other calling apps' notifications) ends here.
 */
object AutoReplier {
    /**
     * Handles one missed call: replies if allowed and queues the call for the
     * server either way. [eventId] must be stable for the same call so a
     * re-scan can't log it twice.
     */
    fun onMissedCall(context: Context, eventId: String, number: String?, atMillis: Long, source: String) {
        val app = MissedCallApp.from(context)
        if (!app.sessions.isSignedIn) return
        val reply = decideAndSend(context, number, atMillis, source)
        if (!number.isNullOrBlank()) {
            app.outbox.add(OutboxEvent.Call(eventId, number, "missed", atMillis, reply))
        }
    }

    /** Returns the message that was sent, or null (with the reason in the activity log). */
    private fun decideAndSend(context: Context, number: String?, atMillis: Long, source: String): String? {
        val app = MissedCallApp.from(context)
        val state = app.state
        val who = PhoneNumbers.pretty(number).ifBlank { "unknown caller" }
        val settings = state.settings
        val now = System.currentTimeMillis()

        if (!PhoneNumbers.isTextable(number)) {
            state.log("Missed call ($source) from $who: no textable number, skipped.")
            return null
        }
        if (!settings.enabled) {
            state.log("Missed call from $who: auto-reply is turned off.")
            return null
        }
        if (!state.entitlement.active) {
            state.log("Missed call from $who: no active plan, not texted.")
            return null
        }
        if (now - atMillis > Config.MAX_REPLY_DELAY_MS) {
            state.log("Missed call from $who found ${(now - atMillis) / 60000} min late: logged, not texted.")
            return null
        }
        if (!Permissions.granted(context, Manifest.permission.SEND_SMS)) {
            state.log("Missed call from $who: SMS permission is off, couldn't text.")
            Alerts.missingPermission(context, "SMS")
            return null
        }
        if (!state.tryClaimReply(PhoneNumbers.matchKey(number), now)) {
            state.log("Missed call from $who: already texted in the last 10 min.")
            return null
        }

        val message = settings.messageTemplate
        return if (send(context, number!!, message)) {
            state.log("Texted $who back ($source).")
            message
        } else {
            null
        }
    }

    /** Sends [text], splitting it into parts if it's over one SMS. */
    fun send(context: Context, number: String, text: String): Boolean {
        val app = MissedCallApp.from(context)
        return try {
            val sms = smsManager(context)
            val parts = sms.divideMessage(text)
            val sentIntent = PendingIntent.getBroadcast(
                context,
                (System.nanoTime() and 0x7fffffff).toInt(),
                Intent(context, SmsResultReceiver::class.java)
                    .putExtra(SmsResultReceiver.EXTRA_NUMBER, number),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
            )
            if (parts.size <= 1) {
                sms.sendTextMessage(number, null, text, sentIntent, null)
            } else {
                // Report the result once, on the last part.
                val intents = ArrayList<PendingIntent?>(List(parts.size - 1) { null } + sentIntent)
                sms.sendMultipartTextMessage(number, null, parts, intents, null)
            }
            true
        } catch (e: Exception) {
            app.state.log("Couldn't text ${PhoneNumbers.pretty(number)}: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
            false
        }
    }

    /** Uses the phone's default SMS SIM on dual-SIM devices. */
    @Suppress("DEPRECATION")
    private fun smsManager(context: Context): SmsManager {
        val subId = SubscriptionManager.getDefaultSmsSubscriptionId()
        return if (Build.VERSION.SDK_INT >= 31) {
            val base = context.getSystemService(SmsManager::class.java)
            if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) base.createForSubscriptionId(subId) else base
        } else {
            if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) SmsManager.getSmsManagerForSubscriptionId(subId)
            else SmsManager.getDefault()
        }
    }
}
