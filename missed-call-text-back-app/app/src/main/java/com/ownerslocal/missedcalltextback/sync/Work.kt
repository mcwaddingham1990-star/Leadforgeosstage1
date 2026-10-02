package com.ownerslocal.missedcalltextback.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.account.TokenProvider
import com.ownerslocal.missedcalltextback.core.Alerts
import com.ownerslocal.missedcalltextback.core.CallLogScanner
import com.ownerslocal.missedcalltextback.core.SentSmsScanner
import java.util.concurrent.TimeUnit

object Work {
    private const val OUTBOX = "outbox"
    private const val MAINTENANCE = "maintenance"

    private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun flushOutbox(context: Context) {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(network)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        // APPEND_OR_REPLACE: an event queued while a flush is running still gets its own run.
        WorkManager.getInstance(context).enqueueUniqueWork(OUTBOX, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<MaintenanceWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(MAINTENANCE, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(OUTBOX)
        WorkManager.getInstance(context).cancelUniqueWork(MAINTENANCE)
    }
}

/** Delivers queued calls/texts; retries with backoff until every one lands. */
class OutboxWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val app = MissedCallApp.from(applicationContext)
        val pending = app.outbox.snapshot()
        if (pending.isEmpty()) return Result.success()

        val token = app.tokens.fresh()
        if (token is TokenProvider.Result.Failed) {
            if (token.signedOut) {
                // Keep the queue; it flushes after the user signs back in.
                Alerts.signedOut(applicationContext)
                return Result.success()
            }
            return Result.retry()
        }
        val session = (token as TokenProvider.Result.Ok).session
        val provider = app.provider() ?: return Result.success()

        val delivered = mutableSetOf<String>()
        for (event in pending) {
            if (isStopped) break
            if (provider.deliver(event, session.tenantId, session.idToken)) delivered += event.id
        }
        app.outbox.remove(delivered)
        return if (delivered.size == pending.size) Result.success() else Result.retry()
    }
}

/**
 * Every 15 minutes: refresh settings, and re-scan the call log and Sent
 * folder in case Android killed the app and a broadcast was missed.
 */
class MaintenanceWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val app = MissedCallApp.from(applicationContext)
        if (!app.sessions.isSignedIn) return Result.success()
        val sync = Syncer.syncSettings(app)
        if (sync is Syncer.Outcome.Failed && sync.signedOut) Alerts.signedOut(applicationContext)
        com.ownerslocal.missedcalltextback.service.MonitorService.start(applicationContext)
        CallLogScanner.scan(applicationContext)
        SentSmsScanner.scan(applicationContext)
        if (app.outbox.size > 0) Work.flushOutbox(applicationContext)
        return Result.success()
    }
}
