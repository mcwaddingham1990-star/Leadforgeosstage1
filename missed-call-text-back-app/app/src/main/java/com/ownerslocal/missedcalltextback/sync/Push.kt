package com.ownerslocal.missedcalltextback.sync

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.account.AccountKind
import com.ownerslocal.missedcalltextback.account.TokenProvider

/**
 * Instant widget pulses: the OwnersLOCAL server sends a data-only push to
 * this phone when a main-app notification or team message is created, and
 * the app wakes (even asleep) to refresh the popup and widget. Off until
 * Config.FCM_APP_ID is filled in; the periodic checks cover it until then.
 */
object Push {
    val enabled: Boolean get() = Config.FCM_APP_ID.isNotBlank()

    fun init(context: Context) {
        if (!enabled || FirebaseApp.getApps(context).isNotEmpty()) return
        FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder()
                .setApplicationId(Config.FCM_APP_ID)
                .setApiKey(Config.FCM_API_KEY.ifBlank { Config.FIREBASE_API_KEY })
                .setProjectId(Config.FIREBASE_PROJECT_ID)
                .setGcmSenderId(Config.FCM_SENDER_ID)
                .build()
        )
    }

    /** Registers this phone's push token against the signed-in login. Call off the main thread. */
    fun register(context: Context) {
        if (!enabled) return
        init(context)
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            Thread { saveToken(MissedCallApp.from(context), token) }.start()
        }
    }

    fun saveToken(app: MissedCallApp, token: String) {
        val session = (app.tokens.fresh() as? TokenProvider.Result.Ok)?.session ?: return
        if (session.kind != AccountKind.OWNERSLOCAL) return
        if (app.state.registeredPushToken == token) return
        val saved = app.firestore.merge(
            "push_subscriptions/${session.email}__${token.take(24)}",
            mapOf(
                "email" to session.email,
                "businessId" to session.tenantId,
                "token" to token,
                "platform" to "android",
                "app" to "missed_call_text_back",
                "createdAt" to com.ownerslocal.missedcalltextback.core.isoUtc(System.currentTimeMillis())
            ),
            session.idToken
        )
        if (saved) app.state.registeredPushToken = token
    }
}

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val app = MissedCallApp.from(this)
        app.state.registeredPushToken = null
        Push.saveToken(app, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Runs on a background thread with ~20s to finish.
        InboxSync.refresh(MissedCallApp.from(this), force = true)
    }
}
