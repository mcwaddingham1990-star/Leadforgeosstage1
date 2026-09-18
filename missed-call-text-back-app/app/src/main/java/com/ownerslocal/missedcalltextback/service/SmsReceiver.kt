package com.ownerslocal.missedcalltextback.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.data.CrmLinker
import com.ownerslocal.missedcalltextback.data.FirestoreRestClient

/**
 * Manifest-registered receiver for SMS_RECEIVED_ACTION -- one of the few
 * implicit broadcasts Android still delivers to a manifest receiver even
 * when the app's process isn't already running (same exemption
 * CallStateReceiver's PHONE_STATE registration relies on), which matters
 * here since a customer can text back at any time, not just while the app
 * happens to be in the foreground.
 *
 * A multi-part SMS (long messages get split by carriers) arrives as
 * multiple PDUs in one broadcast -- getMessagesFromIntent already groups
 * them per envelope, so concatenating their bodies in order reconstructs
 * the original single message rather than logging fragments separately.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val app = context.applicationContext as MissedCallApp
        if (!app.sessionStore.isSignedIn) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return
        val sender = messages[0].originatingAddress ?: return
        val body = messages.joinToString(separator = "") { it.messageBody ?: "" }
        if (body.isBlank()) return

        val businessId = app.sessionStore.businessId
        val idToken = app.sessionStore.idToken
        if (businessId.isNullOrBlank() || idToken.isNullOrBlank()) return

        Thread {
            try {
                val firestore = FirestoreRestClient(app.httpClient)
                CrmLinker.logTextMessage(firestore, businessId, idToken, sender, "incoming", body)
            } catch (e: Exception) {
                // Best-effort logging only -- the real SMS already arrived in the
                // user's own Messages app regardless of whether this succeeds.
            }
        }.start()
    }
}
