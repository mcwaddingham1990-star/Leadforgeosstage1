package com.ownerslocal.missedcalltextback.service

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.data.CrmLinker
import com.ownerslocal.missedcalltextback.data.FirestoreRestClient
import com.ownerslocal.missedcalltextback.sms.AutoReplySender
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun debugStamp(app: MissedCallApp, message: String) {
    val time = SimpleDateFormat("MM/dd HH:mm:ss", Locale.US).format(Date())
    app.sessionStore.lastCallCheckDebug = "[$time] $message"
}

/**
 * Fires on every call-state change. Rather than tracking RINGING -> IDLE
 * transitions by hand (fragile if the receiver's process was briefly
 * killed between the two broadcasts), this treats the device's own call
 * log as ground truth: whenever the phone goes IDLE, check what the most
 * recent call log entry is -- a fresh, not-yet-handled missed/rejected call
 * (auto-reply + CRM log) or an ordinary answered incoming/outgoing call
 * (CRM log only, no text, no new Lead -- see CrmLinker.linkAndLog).
 */
class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        if (intent.getStringExtra(TelephonyManager.EXTRA_STATE) != TelephonyManager.EXTRA_STATE_IDLE) return

        val app = context.applicationContext as MissedCallApp
        if (!app.sessionStore.isSignedIn || !app.sessionStore.enabled) {
            debugStamp(app, "Skipped: not signed in or auto text-back is turned off")
            return
        }

        val hasCallLogPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasCallLogPermission) {
            debugStamp(app, "Skipped: Call Log permission not granted")
            return
        }

        // The call log row for the call that just ended isn't always written
        // the instant IDLE fires -- give it a moment before reading it back.
        val appContext = context.applicationContext
        Handler(Looper.getMainLooper()).postDelayed({
            Thread { checkForMissedCall(appContext, app) }.start()
        }, CALL_LOG_WRITE_DELAY_MS)
    }

    private fun checkForMissedCall(context: Context, app: MissedCallApp) {
        val projection = arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE)
        val cursor = try {
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI, projection, null, null, "${CallLog.Calls.DATE} DESC LIMIT 1"
            )
        } catch (e: SecurityException) {
            debugStamp(app, "Skipped: reading the call log threw a permission error")
            null
        } ?: run {
            debugStamp(app, "Skipped: call log query returned nothing (null cursor)")
            return
        }

        cursor.use {
            if (!it.moveToFirst()) {
                debugStamp(app, "Skipped: call log is empty")
                return
            }
            val id = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls._ID))
            val type = it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))
            val date = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))
            val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER))

            if (id == app.sessionStore.lastProcessedCallLogId) {
                debugStamp(app, "Skipped: most recent call log entry (id=$id) was already processed")
                return
            }
            val ageMs = System.currentTimeMillis() - date
            if (ageMs > STALE_ENTRY_WINDOW_MS) {
                debugStamp(app, "Skipped: most recent call log entry is ${ageMs / 1000}s old (over the ${STALE_ENTRY_WINDOW_MS / 1000}s window) -- the phone-state broadcast may have fired late, or this wasn't the call being tested")
                return
            }

            // A call the user declines (swipes away without answering) logs
            // as REJECTED_TYPE on many devices/Android versions rather than
            // MISSED_TYPE -- from a business's perspective that's still an
            // unanswered call that should get the auto-reply, so both count
            // as "missed" here. Answered INCOMING_TYPE/OUTGOING_TYPE calls
            // never get an auto-text, but are still worth a Call & Text
            // History entry.
            val direction = when (type) {
                CallLog.Calls.MISSED_TYPE, CallLog.Calls.REJECTED_TYPE -> "missed"
                CallLog.Calls.INCOMING_TYPE -> "incoming"
                CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                else -> {
                    debugStamp(app, "Skipped: most recent call log entry has an unrecognized type ($type) -- not missed/rejected/incoming/outgoing")
                    return
                }
            }
            app.sessionStore.lastProcessedCallLogId = id
            val firestore = FirestoreRestClient(app.httpClient)
            if (direction == "missed") {
                // maybeSendAutoReply writes the specific outcome (sent, or
                // exactly why not -- permission, cooldown, bad number, send
                // threw) into sessionStore.lastCallCheckDebug itself.
                AutoReplySender(context, app.sessionStore, firestore).maybeSendAutoReply(number)
                return
            }
            debugStamp(app, "Detected answered $direction call -- logging to CRM (no auto-text)")
            val businessId = app.sessionStore.businessId
            val idToken = app.sessionStore.idToken
            if (!businessId.isNullOrBlank() && !idToken.isNullOrBlank()) {
                try {
                    CrmLinker.linkAndLog(firestore, businessId, idToken, number, direction)
                } catch (e: Exception) {
                    debugStamp(app, "CRM log failed for answered $direction call: ${e.message}")
                }
            }
        }
    }

    companion object {
        private const val CALL_LOG_WRITE_DELAY_MS = 2000L
        private const val STALE_ENTRY_WINDOW_MS = 2 * 60 * 1000L
    }
}
