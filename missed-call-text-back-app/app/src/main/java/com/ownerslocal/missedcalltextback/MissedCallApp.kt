package com.ownerslocal.missedcalltextback

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.ownerslocal.missedcalltextback.auth.SessionStore
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class MissedCallApp : Application() {
    lateinit var sessionStore: SessionStore
        private set

    val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                Config.NOTIFICATION_CHANNEL_ID,
                "Missed Call Monitor",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Keeps Missed Call Text-Back running in the background."
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
