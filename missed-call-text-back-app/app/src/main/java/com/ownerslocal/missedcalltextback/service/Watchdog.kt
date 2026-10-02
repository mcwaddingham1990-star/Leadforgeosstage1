package com.ownerslocal.missedcalltextback.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.core.CallLogScanner
import com.ownerslocal.missedcalltextback.core.SentSmsScanner
import java.util.concurrent.Executors

/**
 * An alarm that still fires while the phone is asleep (Doze), every ~15
 * minutes: restarts the monitor if Android killed it and catches up on
 * the call log. WorkManager alone can be held off for hours in deep sleep.
 */
class Watchdog : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = MissedCallApp.from(context)
        if (!app.sessions.isSignedIn) return
        schedule(context)
        MonitorService.start(context)
        val pending = goAsync()
        background.execute {
            try {
                CallLogScanner.scan(context.applicationContext)
                SentSmsScanner.scan(context.applicationContext)
                com.ownerslocal.missedcalltextback.sync.InboxSync.refresh(app)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private const val INTERVAL_MS = 15 * 60 * 1000L
        private val background = Executors.newSingleThreadExecutor()

        private fun intent(context: Context) = PendingIntent.getBroadcast(
            context, 0, Intent(context, Watchdog::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        fun schedule(context: Context) {
            context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + INTERVAL_MS,
                intent(context)
            )
        }

        fun cancel(context: Context) {
            context.getSystemService(AlarmManager::class.java).cancel(intent(context))
        }
    }
}
