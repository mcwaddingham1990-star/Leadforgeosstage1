package com.ownerslocal.missedcalltextback

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import com.ownerslocal.missedcalltextback.account.AccountProvider
import com.ownerslocal.missedcalltextback.account.FirebaseAuthRest
import com.ownerslocal.missedcalltextback.account.FirestoreRest
import com.ownerslocal.missedcalltextback.account.TokenProvider
import com.ownerslocal.missedcalltextback.store.AppState
import com.ownerslocal.missedcalltextback.store.SessionStore
import com.ownerslocal.missedcalltextback.sync.Outbox
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class MissedCallApp : Application() {
    val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }
    val auth by lazy { FirebaseAuthRest(http) }
    val firestore by lazy { FirestoreRest(http) }
    val sessions by lazy { SessionStore(this) }
    val state by lazy { AppState(this) }
    val tokens by lazy { TokenProvider(sessions, state, auth) }
    val outbox by lazy { Outbox(this) }

    /** Provider for the signed-in account type, or null when signed out. */
    fun provider(): AccountProvider? = sessions.get()?.let { AccountProvider.forKind(it.kind, firestore) }

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(Config.MONITOR_CHANNEL_ID, "Running in background", NotificationManager.IMPORTANCE_MIN)
                .apply { description = "Required by Android to keep missed-call detection running." }
        )
        manager.createNotificationChannel(
            NotificationChannel(Config.ALERT_CHANNEL_ID, "Problems", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Tells you when auto-replies stop working (permission removed, signed out)." }
        )
    }

    companion object {
        fun from(context: Context) = context.applicationContext as MissedCallApp
    }
}
