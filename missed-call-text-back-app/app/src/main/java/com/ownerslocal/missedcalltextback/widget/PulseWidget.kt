package com.ownerslocal.missedcalltextback.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.ui.PopupActivity

/**
 * The 1x1 home-screen icon. Pulsing is a ViewFlipper cycling brightness
 * frames, run by the launcher itself, so it keeps pulsing with this app's
 * process asleep or dead. Tapping it opens the notification popup.
 */
class PulseWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = refresh(context)

    override fun onEnabled(context: Context) = refresh(context)

    companion object {
        /** True when something arrived since the popup was last opened (per the two pulse switches). */
        fun shouldPulse(context: Context): Boolean {
            val app = MissedCallApp.from(context)
            if (!app.sessions.isSignedIn) return false
            val state = app.state
            val since = state.popupOpenedAt
            val calls = state.pulseForCalls && app.inbox.phoneItems().any { !it.handled && it.atMillis > since }
            val appSide = state.pulseForAppNotifications && (
                app.inbox.notes().any { !it.isRead && it.atMillis > since } ||
                    app.inbox.conversations().any { it.unreadForMe && it.lastMillis > since }
                )
            return calls || appSide
        }

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, PulseWidget::class.java))
            if (ids.isEmpty()) return
            val pulsing = shouldPulse(context)
            val views = RemoteViews(context.packageName, if (pulsing) R.layout.widget_pulse else R.layout.widget_still)
            val open = PendingIntent.getActivity(
                context, 0,
                Intent(context, PopupActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            views.setOnClickPendingIntent(R.id.widgetRoot, open)
            manager.updateAppWidget(ids, views)
        }
    }
}
