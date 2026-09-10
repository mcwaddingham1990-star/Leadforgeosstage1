package com.ownerslocal.missedcalltextback.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.ui.MainActivity
import java.util.concurrent.TimeUnit

/**
 * Keeps the app's process alive so CallStateReceiver and
 * NotificationCallListenerService reliably fire, and schedules periodic
 * settings sync. Android requires a persistent notification for any
 * long-running background work like this (as of Android 8+) -- it cannot
 * run invisibly, same tradeoff NightGuard documents for its own foreground
 * services.
 */
class MissedCallMonitorService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(Config.FOREGROUND_NOTIFICATION_ID, buildNotification())
        schedulePeriodicSync()
        return START_STICKY
    }

    private fun buildNotification() = NotificationCompat.Builder(this, Config.NOTIFICATION_CHANNEL_ID)
        .setContentTitle("Missed Call Text-Back is active")
        .setContentText("Watching for missed calls to auto-reply to.")
        .setSmallIcon(R.drawable.ic_notification)
        .setContentIntent(
            android.app.PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java),
                android.app.PendingIntent.FLAG_IMMUTABLE
            )
        )
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .build()

    private fun schedulePeriodicSync() {
        // 15 minutes is WorkManager's minimum periodic interval.
        val request = PeriodicWorkRequestBuilder<SettingsSyncWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "settings_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
