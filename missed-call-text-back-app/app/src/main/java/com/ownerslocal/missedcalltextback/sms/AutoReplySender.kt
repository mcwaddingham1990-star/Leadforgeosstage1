package com.ownerslocal.missedcalltextback.sms

import android.content.Context
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.auth.SessionStore
import com.ownerslocal.missedcalltextback.data.CrmLinker
import com.ownerslocal.missedcalltextback.data.FirestoreRestClient

/**
 * Sends the configured auto-reply text and enforces a per-number cooldown
 * so a caller who tries three times in five minutes gets one text, not
 * three. Cooldown state is process-local (a plain in-memory map) -- this
 * service's process is meant to stay alive continuously, and losing the
 * cooldown list on a rare process death just risks one extra duplicate
 * text rather than anything unsafe.
 *
 * [firestore] is optional so existing callers/tests that only care about
 * the SMS itself don't need one -- when present (the real app always
 * passes it, see MissedCallApp.httpClient), a successful send is also
 * matched against the business's CRM and logged (see CrmLinker). That part
 * runs on this same caller's thread and is called from a background
 * Thread already (CallStateReceiver), so it's fine for it to block.
 */
class AutoReplySender(
    private val context: Context,
    private val sessionStore: SessionStore,
    private val firestore: FirestoreRestClient? = null
) {
    private val lastTextedAt = HashMap<String, Long>()

    fun maybeSendAutoReply(phoneNumber: String?): Boolean {
        val number = phoneNumber?.trim()
        if (number.isNullOrEmpty() || number.equals("unknown", ignoreCase = true)) return false
        if (!sessionStore.enabled) return false

        val now = System.currentTimeMillis()
        val lastSent = lastTextedAt[number]
        if (lastSent != null && now - lastSent < Config.PER_NUMBER_COOLDOWN_MS) return false

        val hasSmsPermission = ContextCompat.checkSelfPermission(context, android.Manifest.permission.SEND_SMS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!hasSmsPermission) return false

        return try {
            @Suppress("DEPRECATION")
            val smsManager = if (android.os.Build.VERSION.SDK_INT >= 31) {
                context.getSystemService(SmsManager::class.java)
            } else {
                SmsManager.getDefault()
            }
            val messageSent = sessionStore.messageTemplate
            smsManager.sendTextMessage(number, null, messageSent, null, null)
            lastTextedAt[number] = now

            val businessId = sessionStore.businessId
            val idToken = sessionStore.idToken
            if (firestore != null && !businessId.isNullOrBlank() && !idToken.isNullOrBlank()) {
                try {
                    CrmLinker.linkAndLog(firestore, businessId, idToken, number, "missed", messageSent)
                } catch (e: Exception) {
                    // The text already sent successfully -- a CRM/log failure
                    // shouldn't be reported as the auto-reply itself failing.
                }
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}
