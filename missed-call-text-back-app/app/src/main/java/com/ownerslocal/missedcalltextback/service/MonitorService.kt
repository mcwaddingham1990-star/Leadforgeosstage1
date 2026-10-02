package com.ownerslocal.missedcalltextback.service

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.provider.CallLog
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.core.CallLogScanner
import com.ownerslocal.missedcalltextback.core.SentSmsScanner
import com.ownerslocal.missedcalltextback.ui.MainActivity

/**
 * Keeps the process alive and watches the call log / SMS store directly, so
 * a missed call is handled the moment it's written -- even on phones whose
 * PHONE_STATE broadcast arrives late or not at all.
 */
class MonitorService : Service() {
    private lateinit var worker: HandlerThread
    private lateinit var handler: Handler
    private val observers = mutableListOf<ContentObserver>()

    private val scanCalls = Runnable { CallLogScanner.scan(this) }
    private val scanSms = Runnable { SentSmsScanner.scan(this) }

    override fun onCreate() {
        super.onCreate()
        worker = HandlerThread("mctb-monitor").apply { start() }
        handler = Handler(worker.looper)
        observe(CallLog.Calls.CONTENT_URI, scanCalls)
        observe(Telephony.Sms.CONTENT_URI, scanSms)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, Config.MONITOR_NOTIFICATION_ID, buildNotification(), type)
        if (!MissedCallApp.from(this).sessions.isSignedIn) {
            stopSelf()
            return START_NOT_STICKY
        }
        // Catch up on anything that happened while we weren't running.
        handler.post(scanCalls)
        handler.post(scanSms)
        return START_STICKY
    }

    /** Coalesces bursts of change notifications into one scan ~1.5s after the last. */
    private fun observe(uri: android.net.Uri, scan: Runnable) {
        val observer = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean) {
                handler.removeCallbacks(scan)
                handler.postDelayed(scan, 1500)
            }
        }
        try {
            contentResolver.registerContentObserver(uri, true, observer)
            observers += observer
        } catch (e: SecurityException) {
            // Permission not granted yet; the broadcast + periodic paths still cover us.
        }
    }

    private fun buildNotification() = NotificationCompat.Builder(this, Config.MONITOR_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle("Missed Call Text-Back is on")
        .setContentText(
            if (MissedCallApp.from(this).state.settings.enabled) "Watching for missed calls."
            else "Auto-reply is turned off. Calls are still logged."
        )
        .setContentIntent(
            PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        )
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .build()

    override fun onDestroy() {
        observers.forEach { contentResolver.unregisterContentObserver(it) }
        observers.clear()
        worker.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        /** Safe from the foreground (activity) and from boot/package-replaced receivers. */
        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, MonitorService::class.java))
            } catch (e: Exception) {
                // Android 12+ refuses background starts outside the exempt cases; the
                // manifest receivers and the periodic worker still cover detection.
                MissedCallApp.from(context).state.log("Couldn't start the background monitor: ${e.javaClass.simpleName}")
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MonitorService::class.java))
        }
    }
}
