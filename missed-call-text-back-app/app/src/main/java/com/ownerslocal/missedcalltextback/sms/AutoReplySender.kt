package com.ownerslocal.missedcalltextback.sms

import android.content.Context
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.auth.SessionStore

/**
 * Sends the configured auto-reply text and enforces a per-number cooldown
 * so a caller who tries three times in five minutes gets one text, not
 * three. Cooldown state is process-local (a plain in-memory map) -- this
 * service's process is meant to stay alive continuously, and losing the
 * cooldown list on a rare process death just risks one extra duplicate
 * text rather than anything unsafe.
 */
class AutoReplySender(private val context: Context, private val sessionStore: SessionStore) {
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
            smsManager.sendTextMessage(number, null, sessionStore.messageTemplate, null, null)
            lastTextedAt[number] = now
            true
        } catch (e: Exception) {
            false
        }
    }
}
