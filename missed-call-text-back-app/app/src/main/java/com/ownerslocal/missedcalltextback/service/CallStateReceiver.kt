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
import com.ownerslocal.missedcalltextback.sms.AutoReplySender

/**
 * Fires on every call-state change. Rather than tracking RINGING -> IDLE
 * transitions by hand (fragile if the receiver's process was briefly
 * killed between the two broadcasts), this treats the device's own call
 * log as ground truth: whenever the phone goes IDLE, check whether the
 * most recent call log entry is a fresh, not-yet-handled missed call.
 */
class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        if (intent.getStringExtra(TelephonyManager.EXTRA_STATE) != TelephonyManager.EXTRA_STATE_IDLE) return

        val app = context.applicationContext as MissedCallApp
        if (!app.sessionStore.isSignedIn || !app.sessionStore.enabled) return

        val hasCallLogPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasCallLogPermission) return

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
            null
        } ?: return

        cursor.use {
            if (!it.moveToFirst()) return
            val id = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls._ID))
            val type = it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))
            val date = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))
            val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER))

            if (type != CallLog.Calls.MISSED_TYPE) return
            if (id == app.sessionStore.lastProcessedCallLogId) return
            if (System.currentTimeMillis() - date > STALE_ENTRY_WINDOW_MS) return

            app.sessionStore.lastProcessedCallLogId = id
            AutoReplySender(context, app.sessionStore).maybeSendAutoReply(number)
        }
    }

    companion object {
        private const val CALL_LOG_WRITE_DELAY_MS = 2000L
        private const val STALE_ENTRY_WINDOW_MS = 2 * 60 * 1000L
    }
}
