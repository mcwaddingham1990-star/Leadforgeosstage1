package com.ownerslocal.missedcalltextback.core

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import com.ownerslocal.missedcalltextback.MissedCallApp

/** Records whether the carrier actually accepted an auto-reply. */
class SmsResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val who = PhoneNumbers.pretty(intent.getStringExtra(EXTRA_NUMBER))
        val state = MissedCallApp.from(context).state
        when (resultCode) {
            Activity.RESULT_OK -> state.log("Carrier accepted the text to $who.")
            SmsManager.RESULT_ERROR_NO_SERVICE -> state.log("Text to $who FAILED: no cell service.")
            SmsManager.RESULT_ERROR_RADIO_OFF -> state.log("Text to $who FAILED: airplane mode / radio off.")
            else -> state.log("Text to $who FAILED (carrier error $resultCode).")
        }
    }

    companion object {
        const val EXTRA_NUMBER = "number"
    }
}
