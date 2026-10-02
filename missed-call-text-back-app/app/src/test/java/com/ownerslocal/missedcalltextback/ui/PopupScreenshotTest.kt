package com.ownerslocal.missedcalltextback.ui

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.databinding.ActivityPopupBinding
import com.ownerslocal.missedcalltextback.databinding.ItemPopupRowBinding
import com.ownerslocal.missedcalltextback.databinding.ViewChatBinding
import org.junit.Rule
import org.junit.Test

/** Renders the widget popup with sample data so its look can be reviewed without a phone. */
class PopupScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        theme = "Theme.MissedCallTextBack.Popup",
        renderingMode = SessionParams.RenderingMode.NORMAL
    )

    private fun popup(): ActivityPopupBinding {
        val b = ActivityPopupBinding.inflate(paparazzi.layoutInflater)
        b.popupRoot.setBackgroundColor(0xFF3A3F4A.toInt()) // stand-in for the home screen behind
        b.mainCard.layoutParams.height = (2400 * 0.74 / 2.625 * paparazzi.context.resources.displayMetrics.density).toInt()
        b.countApp.text = "3"
        b.countCalls.text = "2"
        b.countMessages.text = "1"
        fun row(parent: LinearLayout, icon: String, title: String, sub: String, time: String, unread: Boolean) {
            val r = ItemPopupRowBinding.inflate(paparazzi.layoutInflater, parent, true)
            r.rowIcon.text = icon; r.rowTitle.text = title; r.rowSubtitle.text = sub; r.rowTime.text = time
            r.rowDot.visibility = if (unread) View.VISIBLE else View.INVISIBLE
        }
        row(b.phoneList, "📵", "(555) 123-4567", "Missed call", "2 min ago", true)
        row(b.phoneList, "💬", "(555) 987-6543", "Hey, can you come look at my AC tomorrow?", "14 min ago", true)
        row(b.phoneList, "📵", "(555) 222-0199", "Missed call · Google Voice", "1 hr ago", false)
        return b
    }

    @Test
    fun mainPopup() {
        paparazzi.snapshot(popup().root)
    }

    @Test
    fun teamChatOnTop() {
        val b = popup()
        b.secondaryScrim.visibility = View.VISIBLE
        b.secondaryCard.visibility = View.VISIBLE
        b.secondaryCard.layoutParams.height = (b.mainCard.layoutParams.height * 1.05).toInt()
        b.secondaryTitle.text = "Chat with Jordan Lee"
        val chat = ViewChatBinding.inflate(paparazzi.layoutInflater)
        fun bubble(text: String, mine: Boolean) {
            val wrap = LinearLayout(paparazzi.context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = if (mine) android.view.Gravity.END else android.view.Gravity.START
                setPadding(0, 8, 0, 8)
            }
            wrap.addView(TextView(paparazzi.context).apply {
                this.text = text
                textSize = 15f
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundResource(if (mine) R.drawable.bubble_mine else R.drawable.bubble_theirs)
                setPadding(30, 20, 30, 20)
            })
            chat.chatMessages.addView(wrap)
        }
        bubble("Running 10 min late to the Hendricks job", false)
        bubble("No problem, I'll let them know 👍", true)
        b.secondaryContent.addView(chat.root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        paparazzi.snapshot(b.root)
    }
}
