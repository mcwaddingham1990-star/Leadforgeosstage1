package com.ownerslocal.missedcalltextback.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.provider.Telephony
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
    private var outgoingSmsObserver: OutgoingSmsObserver? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(Config.FOREGROUND_NOTIFICATION_ID, buildNotification())
        schedulePeriodicSync()
        registerOutgoingSmsObserver()
        return START_STICKY
    }

    // A ContentObserver only fires while something holds a live registration
    // -- unlike SmsReceiver's manifest-registered broadcast, this has to be
    // (re-)registered here every time the service (re)starts. contentObserver
    // registration is idempotent-safe to call more than once, but avoid
    // leaking a second registration on every onStartCommand (START_STICKY
    // can call this repeatedly) by clearing any previous one first.
    private fun registerOutgoingSmsObserver() {
        outgoingSmsObserver?.let { contentResolver.unregisterContentObserver(it) }
        val observer = OutgoingSmsObserver(this)
        outgoingSmsObserver = observer
        contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, observer)
    }

    override fun onDestroy() {
        outgoingSmsObserver?.let { contentResolver.unregisterContentObserver(it) }
        outgoingSmsObserver = null
        super.onDestroy()
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
