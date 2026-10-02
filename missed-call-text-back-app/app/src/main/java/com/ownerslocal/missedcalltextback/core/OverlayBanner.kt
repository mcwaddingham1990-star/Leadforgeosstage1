package com.ownerslocal.missedcalltextback.core

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.ui.MainActivity

/**
 * A small banner drawn over whatever app is on screen when a missed caller
 * gets texted back. Needs "Display over other apps"; silently does nothing
 * without it. Tapping opens the app; it disappears on its own after 5s.
 */
object OverlayBanner {
    private const val SHOW_MS = 5000L
    private val main = Handler(Looper.getMainLooper())

    fun canShow(context: Context) = Settings.canDrawOverlays(context)

    fun show(context: Context, title: String, detail: String) {
        val appContext = context.applicationContext
        if (!canShow(appContext)) return
        main.post {
            val windowManager = appContext.getSystemService(WindowManager::class.java)
            val view = LayoutInflater.from(appContext).inflate(R.layout.overlay_banner, null)
            view.findViewById<TextView>(R.id.bannerTitle).text = title
            view.findViewById<TextView>(R.id.bannerDetail).text = detail

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP
                y = (appContext.resources.displayMetrics.density * 32).toInt()
            }

            val remove = Runnable { removeQuietly(windowManager, view) }
            view.setOnClickListener {
                main.removeCallbacks(remove)
                removeQuietly(windowManager, view)
                appContext.startActivity(
                    Intent(appContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
            try {
                windowManager.addView(view, params)
                main.postDelayed(remove, SHOW_MS)
            } catch (e: Exception) {
                // Permission revoked between the check and the add; nothing to show.
            }
        }
    }

    private fun removeQuietly(windowManager: WindowManager, view: View) {
        if (view.isAttachedToWindow) {
            try {
                windowManager.removeView(view)
            } catch (e: Exception) {
                // Already gone.
            }
        }
    }
}
