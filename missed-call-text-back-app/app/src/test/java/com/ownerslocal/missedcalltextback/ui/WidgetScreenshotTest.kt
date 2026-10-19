package com.ownerslocal.missedcalltextback.ui

import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import com.ownerslocal.missedcalltextback.R
import org.junit.Rule
import org.junit.Test

/** Renders the home-screen widget and every pulse frame on dark and light wallpapers. */
class WidgetScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        theme = "Theme.MissedCallTextBack.Popup",
        renderingMode = SessionParams.RenderingMode.SHRINK
    )

    private val frames = listOf(
        R.drawable.pulse_0, R.drawable.pulse_1, R.drawable.pulse_2, R.drawable.pulse_3, R.drawable.pulse_4,
        R.drawable.pulse_5, R.drawable.pulse_6, R.drawable.pulse_7, R.drawable.pulse_8
    )

    private fun strip(wallpaper: Int): LinearLayout {
        val size = (36 * paparazzi.context.resources.displayMetrics.density).toInt()
        return LinearLayout(paparazzi.context).apply {
            setBackgroundColor(wallpaper)
            setPadding(16, 16, 16, 16)
            addView(paparazzi.inflate<FrameLayout>(R.layout.widget_still), LinearLayout.LayoutParams(size, size))
            frames.forEach { res ->
                addView(ImageView(context).apply { setImageResource(res) }, LinearLayout.LayoutParams(size, size))
            }
        }
    }

    @Test
    fun onDarkWallpaper() {
        paparazzi.snapshot(strip(0xFF000000.toInt()))
    }

    @Test
    fun onLightWallpaper() {
        paparazzi.snapshot(strip(0xFFF2F4F7.toInt()))
    }
}
