package com.ownerslocal.missedcalltextback.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.TelephonyManager
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.core.CallLogScanner
import com.ownerslocal.missedcalltextback.sync.OutboxEvent
import com.ownerslocal.missedcalltextback.sync.Work
import java.util.concurrent.Executors

private val background = Executors.newSingleThreadExecutor()

/**
 * PHONE_STATE is still delivered to manifest receivers while the app isn't
 * running, so this is what wakes us when Android has killed the process.
 * goAsync() keeps the process alive while we wait for the call log row.
 */
class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        if (intent.getStringExtra(TelephonyManager.EXTRA_STATE) != TelephonyManager.EXTRA_STATE_IDLE) return
        if (!MissedCallApp.from(context).sessions.isSignedIn) return

        val pending = goAsync()
        val appContext = context.applicationContext
        background.execute {
            try {
                // The dialer writes the call log row a moment after the call ends.
                Thread.sleep(1500)
                CallLogScanner.scan(appContext)
                Thread.sleep(3000)
                CallLogScanner.scan(appContext)
            } finally {
                pending.finish()
            }
        }
    }
}

/** Logs a customer's text to the CRM. Also wakes a killed process. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val app = MissedCallApp.from(context)
        if (!app.sessions.isSignedIn) return

        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (parts.isNullOrEmpty()) return
        val sender = parts[0].originatingAddress ?: return
        val body = parts.joinToString("") { it.messageBody.orEmpty() }
        if (body.isBlank()) return
        val at = parts[0].timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis()

        val pending = goAsync()
        background.execute {
            try {
                val id = "sms-in-$at-${(sender + body).hashCode().toUInt()}"
                app.outbox.add(OutboxEvent.Text(id, sender, "incoming", at, body))
            } finally {
                pending.finish()
            }
        }
    }
}

/** Restarts monitoring after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (!MissedCallApp.from(context).sessions.isSignedIn) return
        Work.schedulePeriodic(context)
        MonitorService.start(context)
    }
}
