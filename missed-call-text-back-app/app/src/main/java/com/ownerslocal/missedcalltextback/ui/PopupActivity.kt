package com.ownerslocal.missedcalltextback.ui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.text.format.DateUtils
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.account.AccountKind
import com.ownerslocal.missedcalltextback.account.TokenProvider
import com.ownerslocal.missedcalltextback.core.PhoneNumbers
import com.ownerslocal.missedcalltextback.databinding.ActivityPopupBinding
import com.ownerslocal.missedcalltextback.databinding.ItemPopupRowBinding
import com.ownerslocal.missedcalltextback.databinding.ViewChatBinding
import com.ownerslocal.missedcalltextback.store.PhoneItem
import com.ownerslocal.missedcalltextback.store.Session
import com.ownerslocal.missedcalltextback.sync.InboxSync
import com.ownerslocal.missedcalltextback.team.AppNote
import com.ownerslocal.missedcalltextback.team.ChatMessage
import com.ownerslocal.missedcalltextback.team.ConversationSummary
import com.ownerslocal.missedcalltextback.team.Teammate
import com.ownerslocal.missedcalltextback.widget.PulseWidget
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/**
 * What the widget opens: a floating glass popup over whatever is on screen.
 * Counts for app notifications, missed calls & texts, and team messages;
 * the calls/texts list; and a smaller borderless popup on top for reading
 * notifications and team chat.
 */
class PopupActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPopupBinding
    private val app get() = MissedCallApp.from(this)

    /** Closes whatever the secondary popup is showing; null when it's hidden. */
    private var secondaryBack: (() -> Unit)? = null
    private var chatPoll: Job? = null
    private var teammates: List<Teammate>? = null

    private var pendingPhoto: String? = null
    private var onPhotoPicked: ((String?) -> Unit)? = null
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@registerForActivityResult
        lifecycleScope.launch {
            val dataUrl = withContext(Dispatchers.IO) { encodePhoto(uri) }
            if (dataUrl == null) toast("Couldn't attach that photo.")
            onPhotoPicked?.invoke(dataUrl)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!app.sessions.isSignedIn || app.state.sessionExpired) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }
        binding = ActivityPopupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val screen = resources.displayMetrics.heightPixels
        binding.mainCard.layoutParams.height = (screen * 0.74).toInt()
        binding.popupRoot.setOnClickListener { finish() }
        binding.closeButton.setOnClickListener { finish() }
        binding.preferencesButton.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
        }
        binding.clearPhoneButton.setOnClickListener {
            app.inbox.markAllHandled()
            renderMain()
        }
        binding.tileApp.setOnClickListener { showNotifications() }
        binding.tileMessages.setOnClickListener { showConversations() }
        binding.tileCalls.setOnClickListener { /* already listed below */ }
        binding.secondaryScrim.setOnClickListener { closeSecondary() }
        binding.secondaryBack.setOnClickListener { secondaryBack?.invoke() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                secondaryBack?.invoke() ?: finish()
            }
        })

        // Opening the popup is what stops the widget pulsing.
        app.state.popupOpenedAt = System.currentTimeMillis()
        PulseWidget.refresh(this)
        renderMain()
        refreshFromServer()
    }

    override fun onDestroy() {
        chatPoll?.cancel()
        super.onDestroy()
    }

    // ================================================================ main popup

    private fun refreshFromServer() {
        if (app.sessions.get()?.kind != AccountKind.OWNERSLOCAL) return
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { InboxSync.refresh(app, force = true) }
            app.state.popupOpenedAt = System.currentTimeMillis()
            PulseWidget.refresh(this@PopupActivity)
            renderMain()
        }
    }

    private fun renderMain() {
        val phone = app.inbox.phoneItems()
        binding.countApp.text = app.inbox.notes().count { !it.isRead }.toString()
        binding.countCalls.text = phone.count { !it.handled }.toString()
        binding.countMessages.text = app.inbox.conversations().count { it.unreadForMe }.toString()
        val teamAvailable = app.sessions.get()?.kind == AccountKind.OWNERSLOCAL
        binding.tileApp.alpha = if (teamAvailable) 1f else 0.4f
        binding.tileMessages.alpha = if (teamAvailable) 1f else 0.4f

        binding.phoneList.removeAllViews()
        if (phone.isEmpty()) {
            binding.phoneList.addView(emptyText("No missed calls or texts yet."))
        }
        phone.take(50).forEach { item ->
            row(
                binding.phoneList,
                icon = if (item.kind == "call") "📵" else "💬",
                title = PhoneNumbers.pretty(item.phone).ifBlank { item.phone },
                subtitle = if (item.kind == "call") "Missed call${sourceSuffix(item)}" else item.body,
                atMillis = item.atMillis,
                unread = !item.handled
            ) { openPhoneItem(item) }
        }
    }

    private fun sourceSuffix(item: PhoneItem) =
        if (item.body.isNotBlank() && item.body != "phone") " · ${item.body}" else ""

    /** Missed call -> the phone's dialer; text -> the phone's own Messages app. */
    private fun openPhoneItem(item: PhoneItem) {
        app.inbox.markHandled(item.id)
        val intent = if (item.kind == "call") {
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(item.phone)}"))
        } else {
            Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(item.phone)}"))
        }
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
        } catch (e: Exception) {
            toast("No app found to open that.")
            renderMain()
        }
    }

    // ================================================================ secondary popup

    private fun openSecondary(
        title: String,
        heightFraction: Double,
        content: View,
        actionLabel: String? = null,
        onAction: (() -> Unit)? = null,
        onBack: () -> Unit = { closeSecondary() }
    ) {
        chatPoll?.cancel()
        binding.secondaryTitle.text = title
        binding.secondaryAction.visibility = if (actionLabel != null) View.VISIBLE else View.GONE
        binding.secondaryAction.text = actionLabel
        binding.secondaryAction.setOnClickListener { onAction?.invoke() }
        binding.secondaryCard.layoutParams.height = (resources.displayMetrics.heightPixels * heightFraction).toInt()
        binding.secondaryCard.requestLayout()
        binding.secondaryContent.removeAllViews()
        binding.secondaryContent.addView(content)
        binding.secondaryScrim.visibility = View.VISIBLE
        binding.secondaryCard.visibility = View.VISIBLE
        setMainBlurred(true)
        secondaryBack = onBack
    }

    private fun closeSecondary() {
        chatPoll?.cancel()
        hideKeyboard()
        binding.secondaryCard.visibility = View.GONE
        binding.secondaryScrim.visibility = View.GONE
        setMainBlurred(false)
        binding.secondaryContent.removeAllViews()
        secondaryBack = null
        renderMain()
    }

    /** Frosts the main popup behind the secondary one (Android 12+), so the top one reads cleanly. */
    private fun setMainBlurred(blurred: Boolean) {
        if (android.os.Build.VERSION.SDK_INT < 31) return
        binding.mainCard.setRenderEffect(
            if (blurred) android.graphics.RenderEffect.createBlurEffect(18f, 18f, android.graphics.Shader.TileMode.CLAMP) else null
        )
    }

    private fun session(): Session? = (app.tokens.fresh() as? TokenProvider.Result.Ok)?.session

    // ---------------------------------------------------------------- app notifications

    private fun showNotifications() {
        if (app.sessions.get()?.kind != AccountKind.OWNERSLOCAL) return
        val list = verticalList()
        val notes = app.inbox.notes()
        if (notes.isEmpty()) list.addView(emptyText("No OwnersLOCAL notifications."))
        notes.take(60).forEach { note ->
            row(list, "🔔", note.title, note.body, note.atMillis, !note.isRead) { showNote(note) }
        }
        openSecondary("App notifications", 0.62, scroll(list))
    }

    private fun showNote(note: AppNote) {
        val body = verticalList().apply { setPadding(dp(6), dp(4), dp(6), dp(4)) }
        body.addView(text(note.title, 18f, R.color.glass_text, bold = true))
        body.addView(text(relative(note.atMillis), 12f, R.color.glass_subtext).apply { setPadding(0, dp(4), 0, dp(12)) })
        body.addView(text(note.body.ifBlank { "No details." }, 15f, R.color.glass_text))
        body.addView(
            com.google.android.material.button.MaterialButton(this).apply {
                text = "Open in OwnersLOCAL"
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                    .apply { topMargin = dp(20) }
                setOnClickListener {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.MAIN_APP_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        finish()
                    } catch (e: Exception) {
                        toast("No browser found.")
                    }
                }
            }
        )
        openSecondary("Notification", 0.5, scroll(body), onBack = { showNotifications() })

        if (!note.isRead) {
            app.inbox.saveServer(app.inbox.notes().map { if (it.id == note.id) it.copy(isRead = true) else it }, null)
            lifecycleScope.launch(Dispatchers.IO) { session()?.let { app.team.markNotificationRead(it, note.id) } }
        }
    }

    // ---------------------------------------------------------------- team messages

    private fun showConversations() {
        if (app.sessions.get()?.kind != AccountKind.OWNERSLOCAL) return
        val list = verticalList()
        val conversations = app.inbox.conversations()
        if (conversations.isEmpty()) list.addView(emptyText("No team conversations yet. Tap + New to message a teammate."))
        conversations.forEach { conv ->
            val sender = if (conv.lastSender.isNotBlank()) "${conv.lastSender}: " else ""
            row(list, "👥", conv.title, sender + conv.lastMessage, conv.lastMillis, conv.unreadForMe) { showChat(conv, null) }
        }
        openSecondary("Team messages", 0.66, scroll(list), actionLabel = "+ New", onAction = { showNewConversation() })
    }

    private fun showNewConversation() {
        val list = verticalList()
        list.addView(emptyText("Loading teammates…"))
        openSecondary("New message", 0.66, scroll(list), onBack = { showConversations() })
        lifecycleScope.launch {
            val people = withContext(Dispatchers.IO) { loadTeammates() }
            list.removeAllViews()
            when {
                people == null -> list.addView(emptyText("Couldn't load your team. Check your connection."))
                people.isEmpty() -> list.addView(emptyText("Nobody else on your team has signed up yet."))
                else -> people.forEach { mate ->
                    row(list, "👤", mate.name, mate.role, null, false) { showChat(null, mate) }
                }
            }
        }
    }

    private fun loadTeammates(): List<Teammate>? {
        teammates?.let { return it }
        val s = session() ?: return null
        return app.team.teammates(s, app.state.myName).also { teammates = it }
    }

    /** An existing conversation ([conv]) or a brand-new one with [newWith], created on the first send. */
    private fun showChat(conv: ConversationSummary?, newWith: Teammate?) {
        val chat = ViewChatBinding.inflate(layoutInflater)
        var conversationId = conv?.id
        val participants = conv?.participants ?: listOfNotNull(app.state.myName, newWith?.name)
        val title = conv?.title ?: "Chat with ${newWith?.name}"
        pendingPhoto = null

        fun renderMessages(messages: List<ChatMessage>) {
            val s = app.sessions.get() ?: return
            chat.chatMessages.removeAllViews()
            if (messages.isEmpty()) chat.chatMessages.addView(emptyText("Say hello 👋"))
            messages.forEach { chat.chatMessages.addView(bubble(it, app.team.isMine(it, s, app.state.myName))) }
            chat.chatScroll.post { chat.chatScroll.fullScroll(View.FOCUS_DOWN) }
        }

        var shownCount = -1
        fun load(markRead: Boolean) {
            val id = conversationId ?: return
            lifecycleScope.launch {
                val messages = withContext(Dispatchers.IO) {
                    val s = session() ?: return@withContext null
                    val list = app.team.messages(s, id) ?: return@withContext null
                    // Only write the read marker when there's actually something new.
                    if (markRead && list.size != shownCount) app.team.markConversationRead(s, id)
                    list
                } ?: return@launch
                if (messages.size != shownCount) {
                    shownCount = messages.size
                    renderMessages(messages)
                }
            }
        }

        onPhotoPicked = { dataUrl ->
            pendingPhoto = dataUrl
            chat.chatAttachment.visibility = if (dataUrl != null) View.VISIBLE else View.GONE
        }
        chat.chatAttachment.setOnClickListener { onPhotoPicked?.invoke(null) }
        chat.chatPhoto.setOnClickListener {
            pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
        chat.chatSend.setOnClickListener {
            val textToSend = chat.chatInput.text?.toString()?.trim().orEmpty()
            val photo = pendingPhoto
            if (textToSend.isEmpty() && photo == null) return@setOnClickListener
            chat.chatSend.isEnabled = false
            lifecycleScope.launch {
                val sentId = withContext(Dispatchers.IO) { sendMessage(conversationId, newWith, participants, title, textToSend, photo) }
                chat.chatSend.isEnabled = true
                if (sentId == null) {
                    toast("Couldn't send. Check your connection.")
                    return@launch
                }
                conversationId = sentId
                chat.chatInput.setText("")
                onPhotoPicked?.invoke(null)
                load(markRead = true)
            }
        }

        openSecondary(title, 0.8, chat.root, onBack = { showConversations() })
        if (conversationId == null) renderMessages(emptyList()) else load(markRead = true)

        // Live-ish updates while the chat is open.
        chatPoll = lifecycleScope.launch {
            while (isActive) {
                delay(6000)
                load(markRead = true)
            }
        }
        // openSecondary cancels the previous poll; this one belongs to this chat.
    }

    /** Returns the conversation id on success. Runs off the main thread. */
    private fun sendMessage(
        conversationId: String?,
        newWith: Teammate?,
        participants: List<String>,
        title: String,
        text: String,
        photo: String?
    ): String? {
        val s = session() ?: return null
        val myName = app.state.myName ?: s.email
        val role = app.state.myRole ?: "Team"
        val id = if (conversationId != null) {
            if (app.team.send(s, myName, role, conversationId, text, photo)) conversationId else null
        } else if (newWith != null) {
            app.team.startConversation(s, myName, role, newWith, text, photo)
        } else null
        if (id != null) {
            app.team.markConversationRead(s, id)
            val people = loadTeammates().orEmpty()
            val emails = participants.filter { it != myName }
                .mapNotNull { name -> people.firstOrNull { it.name == name }?.email }
                .plus(listOfNotNull(newWith?.email))
                .distinct()
            app.team.pushToParticipants(s, emails, "$myName · $title", text.ifBlank { "📷 Photo" })
        }
        return id
    }

    // ================================================================ view helpers

    private fun row(
        parent: LinearLayout,
        icon: String,
        title: String,
        subtitle: String,
        atMillis: Long?,
        unread: Boolean,
        onClick: () -> Unit
    ) {
        val r = ItemPopupRowBinding.inflate(layoutInflater, parent, true)
        r.rowIcon.text = icon
        r.rowTitle.text = title
        r.rowSubtitle.text = subtitle
        r.rowSubtitle.visibility = if (subtitle.isBlank()) View.GONE else View.VISIBLE
        r.rowTime.text = atMillis?.takeIf { it > 0 }?.let { relative(it) }.orEmpty()
        r.rowDot.visibility = if (unread) View.VISIBLE else View.INVISIBLE
        r.root.setOnClickListener { onClick() }
    }

    private fun bubble(message: ChatMessage, mine: Boolean): View {
        val wrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = if (message.isSystem) Gravity.CENTER_HORIZONTAL else if (mine) Gravity.END else Gravity.START
            setPadding(0, dp(4), 0, dp(4))
        }
        if (message.isSystem) {
            wrapper.addView(text(message.content, 12f, R.color.glass_subtext).apply { gravity = Gravity.CENTER })
            return wrapper
        }
        if (!mine) wrapper.addView(text(message.sender, 11f, R.color.glass_subtext).apply { setPadding(dp(6), 0, 0, dp(2)) })
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = ContextCompat.getDrawable(context, if (mine) R.drawable.bubble_mine else R.drawable.bubble_theirs)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        message.photos.forEach { dataUrl ->
            decodePhoto(dataUrl)?.let { bitmap ->
                body.addView(ImageView(this).apply {
                    setImageBitmap(bitmap)
                    adjustViewBounds = true
                    maxWidth = dp(220)
                    maxHeight = dp(260)
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    layoutParams = LinearLayout.LayoutParams(dp(220), ViewGroup.LayoutParams.WRAP_CONTENT)
                        .apply { bottomMargin = if (message.content.isNotBlank()) dp(6) else 0 }
                })
            }
        }
        if (message.content.isNotBlank()) {
            body.addView(text(message.content, 15f, R.color.glass_text).apply { maxWidth = dp(240) })
        }
        wrapper.addView(body)
        wrapper.addView(text(relative(message.atMillis), 10f, R.color.glass_subtext).apply { setPadding(dp(6), dp(2), dp(6), 0) })
        return wrapper
    }

    private fun verticalList() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    private fun scroll(child: View) = ScrollView(this).apply {
        layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        addView(child)
    }

    private fun text(value: String, sizeSp: Float, colorRes: Int, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = sizeSp
        setTextColor(ContextCompat.getColor(context, colorRes))
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun emptyText(value: String) =
        text(value, 13f, R.color.glass_subtext).apply { setPadding(dp(6), dp(16), dp(6), dp(16)) }

    private fun relative(millis: Long): String =
        DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE).toString()

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    private fun hideKeyboard() {
        val imm = getSystemService(android.view.inputmethod.InputMethodManager::class.java)
        imm?.hideSoftInputFromWindow(binding.root.windowToken, 0)
    }

    // ================================================================ photos

    /**
     * Shrinks a picked photo and inlines it as a data: URL, the way the web app
     * stores message photos. Kept under ~250 KB because every message lives
     * inside one conversation document, which Firestore caps at 1 MB.
     */
    private fun encodePhoto(uri: Uri): String? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_PHOTO_PX) sample *= 2
        val decoded = contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw IllegalStateException("unreadable")
        val scale = MAX_PHOTO_PX.toFloat() / maxOf(decoded.width, decoded.height)
        val bitmap = if (scale < 1f) {
            Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true)
        } else decoded
        var quality = 75
        var bytes: ByteArray
        do {
            bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
            quality -= 10
        } while (bytes.size > MAX_PHOTO_BYTES && quality >= 35)
        "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    } catch (e: Exception) {
        null
    }

    private fun decodePhoto(dataUrl: String): Bitmap? = try {
        val bytes = Base64.decode(dataUrl.substringAfter(","), Base64.DEFAULT)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 600) sample *= 2
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    } catch (e: Exception) {
        null
    }

    private companion object {
        const val MAX_PHOTO_PX = 1024
        const val MAX_PHOTO_BYTES = 250 * 1024
    }
}
