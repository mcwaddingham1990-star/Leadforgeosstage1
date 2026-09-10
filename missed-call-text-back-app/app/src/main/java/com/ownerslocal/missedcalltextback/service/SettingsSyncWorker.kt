package com.ownerslocal.missedcalltextback.service

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.data.SettingsRepository
import com.ownerslocal.missedcalltextback.data.SyncResult

/** Periodic background refresh of missed_call_settings, so a change saved
 *  on the web app's settings page reaches this device without the owner
 *  having to open this app and tap "Sync Now" every time. */
class SettingsSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val app = applicationContext as MissedCallApp
        if (!app.sessionStore.isSignedIn) return Result.success()

        val repository = SettingsRepository(app.sessionStore, app.httpClient)
        return when (repository.sync()) {
            is SyncResult.Success -> Result.success()
            is SyncResult.Failure -> Result.retry()
        }
    }
}
