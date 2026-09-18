package com.ownerslocal.missedcalltextback.service

import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.data.CrmLinker
import com.ownerslocal.missedcalltextback.data.FirestoreRestClient

/**
 * Watches the phone's own SMS Sent folder so a reply the owner types
 * manually into their phone's native Messages app (the "Reply" button on
 * the web app's Inbox/Customer Card just opens that native app pre-filled
 * -- there is no way to send FROM this app on the owner's behalf and have
 * it look like a normal text) still ends up in that customer's Call & Text
 * History. Without this, the stored conversation would only ever show the
 * customer's half.
 *
 * Registered once, for the life of the foreground service (see
 * MissedCallMonitorService) -- a ContentObserver only fires while something
 * is actively listening, so this can't be a one-shot manifest receiver the
 * way SmsReceiver/CallStateReceiver are.
 */
class OutgoingSmsObserver(private val context: Context) : ContentObserver(Handler(Looper.getMainLooper())) {
    private val app get() = context.applicationContext as MissedCallApp

    override fun onChange(selfChange: Boolean) {
        super.onChange(selfChange)
        if (!app.sessionStore.isSignedIn) return
        val hasReadSms = ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_SMS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!hasReadSms) return
        Thread { checkForNewSentMessage() }.start()
    }

    private fun checkForNewSentMessage() {
        val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
        val cursor = try {
            context.contentResolver.query(
                Telephony.Sms.Sent.CONTENT_URI, projection, null, null, "${Telephony.Sms.DATE} DESC LIMIT 1"
            )
        } catch (e: SecurityException) {
            null
        } ?: return

        cursor.use {
            if (!it.moveToFirst()) return
            val id = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms._ID))
            val date = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.DATE))
            val address = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: return
            val body = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: return

            if (id == app.sessionStore.lastProcessedSentSmsId) return
            if (System.currentTimeMillis() - date > STALE_ENTRY_WINDOW_MS) return
            if (body.isBlank()) return

            app.sessionStore.lastProcessedSentSmsId = id
            val businessId = app.sessionStore.businessId
            val idToken = app.sessionStore.idToken
            if (businessId.isNullOrBlank() || idToken.isNullOrBlank()) return

            try {
                val firestore = FirestoreRestClient(app.httpClient)
                CrmLinker.logTextMessage(firestore, businessId, idToken, address, "outgoing", body)
            } catch (e: Exception) {
                // Best-effort logging only -- the real text already sent via the
                // native Messages app regardless of whether this succeeds.
            }
        }
    }

    companion object {
        // The missed-call auto-reply itself also lands in the Sent folder
        // once SmsManager.sendTextMessage finishes, and this observer picks
        // it up too -- intentionally: it's already recorded on its own
        // missed_call_events row (autoReplyMessage), and ALSO belongs here
        // as the first message in that customer's real text_messages
        // thread, same as any later manual reply.
        private const val STALE_ENTRY_WINDOW_MS = 2 * 60 * 1000L
    }
}
