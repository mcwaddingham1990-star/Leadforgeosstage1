package com.ownerslocal.missedcalltextback.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.MissedCallApp

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val app = context.applicationContext as MissedCallApp
        if (!app.sessionStore.isSignedIn) return
        ContextCompat.startForegroundService(context, Intent(context, MissedCallMonitorService::class.java))
    }
}
