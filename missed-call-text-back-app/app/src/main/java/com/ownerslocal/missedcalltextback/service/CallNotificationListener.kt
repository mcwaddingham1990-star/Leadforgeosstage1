package com.ownerslocal.missedcalltextback.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.core.AutoReplier
import java.util.concurrent.Executors

/**
 * Apps like Google Voice, TextNow and WhatsApp handle calls themselves, so
 * nothing reaches the call log. For the apps the owner picked, this reads
 * their "missed call" notification and replies by SMS -- but only when the
 * notification actually says "missed" and shows a phone number, so a normal
 * chat message from those apps is never answered.
 */
class CallNotificationListener : NotificationListenerService() {
    private val background = Executors.newSingleThreadExecutor()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val app = MissedCallApp.from(this)
        if (sbn.packageName !in app.state.settings.watchedPackages) return
        if (!app.sessions.isSignedIn) return

        val extras = sbn.notification.extras
        val text = listOf(
            Notification.EXTRA_TITLE, Notification.EXTRA_TEXT, Notification.EXTRA_BIG_TEXT, Notification.EXTRA_SUB_TEXT
        ).joinToString(" ") { extras.getCharSequence(it)?.toString().orEmpty() }

        val number = missedCallNumber(text) ?: return
        val key = "${sbn.packageName}|${sbn.postTime}|${number.filter { it.isDigit() }}"
        if (!app.state.markNotificationSeen(key)) return

        val source = try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
        } catch (e: Exception) {
            sbn.packageName
        }
        val eventId = "notif-${sbn.postTime}-${key.hashCode().toUInt()}"
        background.execute { AutoReplier.onMissedCall(applicationContext, eventId, number, sbn.postTime, source) }
    }

    override fun onDestroy() {
        background.shutdown()
        super.onDestroy()
    }

    companion object {
        // (555) 123-4567, 555-123-4567, +1 555 123 4567, 5551234567 ...
        private val PHONE = Regex("""(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)""")

        /** The caller's number if [text] is a missed-call alert that shows one, else null. */
        fun missedCallNumber(text: String): String? {
            if (!text.contains("missed", ignoreCase = true)) return null
            return PHONE.find(text)?.value
        }
    }
}
