package com.ownerslocal.missedcalltextback.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.sms.AutoReplySender

/**
 * Apps like TextNow, Google Voice, WhatsApp, etc. route calls entirely
 * inside themselves -- there's no PHONE_STATE broadcast to hook for those,
 * so this reads THEIR missed-call notification instead, for whichever
 * package names the owner listed on the web app's settings page. Only
 * works when that notification's text actually contains a phone number
 * (documented as a known limitation on that settings page too). Requires
 * the user to manually grant "Notification access" in Settings -- Android
 * does not allow this permission to be requested via a normal runtime
 * dialog, only via Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS.
 */
class NotificationCallListenerService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val app = applicationContext as MissedCallApp
        if (!app.sessionStore.isSignedIn || !app.sessionStore.enabled) return
        if (sbn.packageName !in app.sessionStore.watchedPackages) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val combined = "$title $text $bigText"

        val phoneNumber = PHONE_NUMBER_REGEX.find(combined)?.value ?: return
        val context = applicationContext
        Thread { AutoReplySender(context, app.sessionStore).maybeSendAutoReply(phoneNumber) }.start()
    }

    companion object {
        // Best-effort match for common US phone number formats printed in
        // free-form notification text: (123) 456-7890, 123-456-7890,
        // +11234567890, 123.456.7890, etc.
        private val PHONE_NUMBER_REGEX = Regex("""\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}""")
    }
}
