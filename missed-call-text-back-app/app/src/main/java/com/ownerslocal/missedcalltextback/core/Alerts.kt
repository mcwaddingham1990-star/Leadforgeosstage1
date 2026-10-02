package com.ownerslocal.missedcalltextback.core

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.ui.MainActivity

/** User-visible "your auto-replies stopped working" notifications, at most one per kind per hour. */
object Alerts {
    private val lastShown = HashMap<String, Long>()

    fun signedOut(context: Context) =
        show(context, "signed_out", "Missed Call Text-Back signed out", "Sign in again to keep logging calls and texts.")

    fun missingPermission(context: Context, what: String) =
        show(context, "perm_$what", "Auto-reply couldn't send", "$what permission was removed. Tap to fix.")

    @SuppressLint("MissingPermission")
    @Synchronized
    private fun show(context: Context, kind: String, title: String, text: String) {
        val now = System.currentTimeMillis()
        if (now - (lastShown[kind] ?: 0L) < 60 * 60 * 1000L) return
        lastShown[kind] = now
        if (!Permissions.allGranted(context, Permissions.NOTIFICATIONS)) return
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, Config.ALERT_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(Config.ALERT_NOTIFICATION_ID, notification)
    }
}
