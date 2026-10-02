package com.ownerslocal.missedcalltextback.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.telephony.SmsMessage
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.materialswitch.MaterialSwitch
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.R
import com.ownerslocal.missedcalltextback.account.AccountKind
import com.ownerslocal.missedcalltextback.account.AccountProvider
import com.ownerslocal.missedcalltextback.account.AuthResult
import com.ownerslocal.missedcalltextback.account.RemoteSettings
import com.ownerslocal.missedcalltextback.account.TenantResult
import com.ownerslocal.missedcalltextback.account.TokenProvider
import com.ownerslocal.missedcalltextback.core.AutoReplier
import com.ownerslocal.missedcalltextback.core.CallLogScanner
import com.ownerslocal.missedcalltextback.core.KnownCallingApps
import com.ownerslocal.missedcalltextback.core.Permissions
import com.ownerslocal.missedcalltextback.core.PhoneNumbers
import com.ownerslocal.missedcalltextback.core.SentSmsScanner
import com.ownerslocal.missedcalltextback.core.shortTime
import com.ownerslocal.missedcalltextback.databinding.ActivityMainBinding
import com.ownerslocal.missedcalltextback.databinding.ItemSetupBinding
import com.ownerslocal.missedcalltextback.service.MonitorService
import com.ownerslocal.missedcalltextback.service.Watchdog
import com.ownerslocal.missedcalltextback.store.Session
import com.ownerslocal.missedcalltextback.sync.Syncer
import com.ownerslocal.missedcalltextback.sync.Work
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val app get() = MissedCallApp.from(this)
    private var selectedKind = Config.ENABLED_ACCOUNT_KINDS.first()

    /** The message form is only filled from the cache when it has no unsaved edits. */
    private var formDirty = false
    private var fillingForm = false

    private val permissionRequest = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        // Restart so the service re-registers its call-log/SMS observers with the new permissions.
        MonitorService.stop(this)
        MonitorService.start(this)
        lifecycleScope.launch(Dispatchers.IO) {
            CallLogScanner.scan(app)
            SentSmsScanner.scan(app)
        }
        render()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setUpAccountKinds()
        binding.signInButton.setOnClickListener { signIn() }
        binding.saveSettingsButton.setOnClickListener { saveSettings() }
        binding.sendTestButton.setOnClickListener { sendTest() }
        binding.syncButton.setOnClickListener { syncNow(showToast = true) }
        binding.signOutButton.setOnClickListener { confirmSignOut() }
        binding.messageInput.doAfterTextChanged {
            if (!fillingForm) formDirty = true
            updateMessageMeta()
        }
        binding.enabledSwitch.setOnCheckedChangeListener { _, _ ->
            if (!fillingForm) formDirty = true
            updateMessageMeta()
        }
    }

    override fun onResume() {
        super.onResume()
        render()
        if (isActive()) {
            MonitorService.start(this)
            Work.schedulePeriodic(this)
            Watchdog.schedule(this)
            syncNow(showToast = false)
        }
    }

    private fun isActive() = app.sessions.isSignedIn && !app.state.sessionExpired

    // ---------------------------------------------------------------- sign in

    private fun setUpAccountKinds() {
        val kinds = Config.ENABLED_ACCOUNT_KINDS
        if (kinds.size < 2) return
        binding.accountKindGroup.visibility = View.VISIBLE
        kinds.forEach { kind ->
            val button = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                id = View.generateViewId()
                text = kind.label
                tag = kind
            }
            binding.accountKindGroup.addView(button)
            if (kind == selectedKind) binding.accountKindGroup.check(button.id)
        }
        binding.accountKindGroup.addOnButtonCheckedListener { group, checkedId, isChecked ->
            if (isChecked) selectedKind = group.findViewById<View>(checkedId).tag as AccountKind
            binding.signInHint.text = hintFor(selectedKind)
        }
    }

    private fun hintFor(kind: AccountKind) = when (kind) {
        AccountKind.OWNERSLOCAL -> "Sign in with your OwnersLOCAL owner or manager login."
        AccountKind.STANDALONE -> "Sign in with your Missed Call Text-Back account."
    }

    private fun signIn() {
        val email = binding.emailInput.text?.toString()?.trim().orEmpty()
        val password = binding.passwordInput.text?.toString().orEmpty()
        if (email.isEmpty() || password.isEmpty()) {
            showSignInError("Enter your email and password.")
            return
        }
        val kind = selectedKind
        binding.signInButton.isEnabled = false
        binding.signInButton.text = "Signing in…"
        binding.signInError.visibility = View.GONE

        lifecycleScope.launch {
            val error = withContext(Dispatchers.IO) { performSignIn(kind, email, password) }
            binding.signInButton.isEnabled = true
            binding.signInButton.text = "Sign in"
            if (error != null) {
                showSignInError(error)
                return@launch
            }
            binding.passwordInput.setText("")
            formDirty = false
            Work.schedulePeriodic(this@MainActivity)
            Watchdog.schedule(this@MainActivity)
            MonitorService.start(this@MainActivity)
            render()
            if (!Permissions.allGranted(this@MainActivity, Permissions.CORE)) requestCorePermissions()
        }
    }

    /** Returns an error message, or null on success. Runs off the main thread. */
    private fun performSignIn(kind: AccountKind, email: String, password: String): String? {
        val tokens = when (val result = app.auth.signIn(email, password)) {
            is AuthResult.Ok -> result.tokens
            is AuthResult.Failed -> return result.message
        }
        val provider = AccountProvider.forKind(kind, app.firestore)
        val tenant = when (val result = provider.resolveTenant(tokens.uid, tokens.email, tokens.idToken)) {
            is TenantResult.Ok -> result
            is TenantResult.Failure -> return result.message
        }

        // Re-signing into the same account keeps queued uploads and scan positions;
        // a different account starts clean so nothing leaks between them.
        val previous = app.sessions.get()
        if (previous == null || previous.uid != tokens.uid || previous.kind != kind) {
            app.state.clearAll()
            app.outbox.clear()
        }
        app.sessions.save(
            Session(
                kind = kind,
                uid = tokens.uid,
                email = tokens.email,
                tenantId = tenant.tenantId,
                tenantName = tenant.displayName,
                idToken = tokens.idToken,
                refreshToken = tokens.refreshToken,
                expiresAtMillis = tokens.expiresAtMillis
            )
        )
        app.state.sessionExpired = false
        Syncer.syncSettings(app)
        // Baselines the scanners so calls from before sign-in are never texted.
        CallLogScanner.scan(app)
        SentSmsScanner.scan(app)
        app.state.log("Signed in as ${tokens.email}.")
        if (app.outbox.size > 0) Work.flushOutbox(app)
        return null
    }

    private fun showSignInError(message: String) {
        binding.signInError.text = message
        binding.signInError.visibility = View.VISIBLE
    }

    private fun confirmSignOut() {
        val pending = app.outbox.size
        val warning = if (pending > 0) "\n\n$pending call/text record(s) haven't uploaded yet and will be discarded." else ""
        MaterialAlertDialogBuilder(this)
            .setTitle("Sign out?")
            .setMessage("Missed calls will stop getting a text back on this phone.$warning")
            .setPositiveButton("Sign out") { _, _ -> signOut() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun signOut() {
        MonitorService.stop(this)
        Work.cancelAll(this)
        Watchdog.cancel(this)
        app.sessions.clear()
        app.state.clearAll()
        app.outbox.clear()
        formDirty = false
        render()
    }

    // ---------------------------------------------------------------- actions

    private fun syncNow(showToast: Boolean) {
        lifecycleScope.launch {
            val outcome = withContext(Dispatchers.IO) {
                val result = Syncer.syncSettings(app)
                CallLogScanner.scan(app)
                SentSmsScanner.scan(app)
                if (app.outbox.size > 0) Work.flushOutbox(app)
                result
            }
            if (showToast) {
                val text = when (outcome) {
                    Syncer.Outcome.Ok -> "Up to date"
                    is Syncer.Outcome.Failed -> outcome.message
                }
                Toast.makeText(this@MainActivity, text, Toast.LENGTH_SHORT).show()
            }
            render()
        }
    }

    private fun saveSettings() {
        val message = binding.messageInput.text?.toString()?.trim().orEmpty()
        if (message.isEmpty()) {
            Toast.makeText(this, "Message can't be empty.", Toast.LENGTH_SHORT).show()
            return
        }
        val updated = app.state.settings.copy(enabled = binding.enabledSwitch.isChecked, messageTemplate = message)
        binding.saveSettingsButton.isEnabled = false
        lifecycleScope.launch {
            val saved = withContext(Dispatchers.IO) { pushSettings(updated) }
            binding.saveSettingsButton.isEnabled = true
            if (saved) {
                app.state.settings = updated
                formDirty = false
                app.state.log(if (updated.enabled) "Auto-reply saved (on)." else "Auto-reply turned off.")
                Toast.makeText(this@MainActivity, "Saved", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this@MainActivity, "Couldn't save. Check your connection.", Toast.LENGTH_LONG).show()
            }
            render()
        }
    }

    /** Saves the calling-app picks right away (separate from the message form's Save button). */
    private fun setCallingAppWatched(packageName: String, watched: Boolean) {
        val current = app.state.settings
        val packages = if (watched) current.watchedPackages + packageName else current.watchedPackages - packageName
        val updated = current.copy(watchedPackages = packages)
        lifecycleScope.launch {
            val saved = withContext(Dispatchers.IO) { pushSettings(updated) }
            if (saved) {
                app.state.settings = updated
                if (watched && !Permissions.notificationAccess(this@MainActivity)) promptNotificationAccess()
            } else {
                Toast.makeText(this@MainActivity, "Couldn't save. Check your connection.", Toast.LENGTH_LONG).show()
            }
            render()
        }
    }

    private fun promptNotificationAccess() {
        val restrictedNote = if (Build.VERSION.SDK_INT >= 33) {
            "\n\nIf Android says the setting is restricted: open App info for Missed Call Text-Back, " +
                "tap ⋮ (top right) → \"Allow restricted settings\", then come back and try again."
        } else ""
        MaterialAlertDialogBuilder(this)
            .setTitle("Allow notification access")
            .setMessage("To catch missed calls from other calling apps, turn on Missed Call Text-Back on the next screen.$restrictedNote")
            .setPositiveButton("Open settings") { _, _ -> startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
            .setNeutralButton("App info") { _, _ ->
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
            .setNegativeButton("Later", null)
            .show()
    }

    private fun openOverlaySettings() {
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    }

    private fun pushSettings(settings: RemoteSettings): Boolean {
        val token = app.tokens.fresh() as? TokenProvider.Result.Ok ?: return false
        val provider = app.provider() ?: return false
        return provider.saveSettings(token.session.tenantId, settings, token.session.idToken)
    }

    private fun sendTest() {
        val number = binding.testNumberInput.text?.toString()?.trim().orEmpty()
        if (!PhoneNumbers.isTextable(number)) {
            Toast.makeText(this, "Enter a full 10-digit phone number.", Toast.LENGTH_SHORT).show()
            return
        }
        if (!Permissions.granted(this, android.Manifest.permission.SEND_SMS)) {
            requestCorePermissions()
            return
        }
        val message = binding.messageInput.text?.toString()?.trim().takeUnless { it.isNullOrEmpty() }
            ?: app.state.settings.messageTemplate
        lifecycleScope.launch(Dispatchers.IO) {
            if (AutoReplier.send(app, number, message)) app.state.log("Test text sent to ${PhoneNumbers.pretty(number)}.")
            withContext(Dispatchers.Main) {
                Toast.makeText(this@MainActivity, "Sending test…", Toast.LENGTH_SHORT).show()
                render()
            }
        }
    }

    private fun requestCorePermissions() =
        permissionRequest.launch(Permissions.CORE + Permissions.TEXT_HISTORY + Permissions.NOTIFICATIONS)

    @SuppressLint("BatteryLife")
    private fun openBatterySettings() {
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    // ---------------------------------------------------------------- render

    private fun render() {
        val session = app.sessions.get()
        if (session == null || app.state.sessionExpired) {
            binding.signInGroup.visibility = View.VISIBLE
            binding.dashboardGroup.visibility = View.GONE
            binding.signInHint.text = if (session != null) {
                "Your session expired. Sign in again to keep auto-replies running."
            } else {
                hintFor(selectedKind)
            }
            if (session != null && binding.emailInput.text.isNullOrEmpty()) binding.emailInput.setText(session.email)
            return
        }
        binding.signInGroup.visibility = View.GONE
        binding.dashboardGroup.visibility = View.VISIBLE

        val state = app.state
        val settings = state.settings
        val entitlement = state.entitlement
        val coreReady = Permissions.allGranted(this, Permissions.CORE)
        val needsListener = settings.watchedPackages.isNotEmpty() && !Permissions.notificationAccess(this)
        val canRunAsleep = Permissions.batteryUnrestricted(this)

        val (headline, color, detail) = when {
            !coreReady -> Triple("Needs setup", R.color.warn, "Allow calls & SMS below so the app can see missed calls and text back.")
            !entitlement.active -> Triple("Paused", R.color.warn, entitlement.summary)
            !settings.enabled -> Triple("Auto-reply is OFF", R.color.warn, "Missed calls are still logged, but nobody gets a text.")
            !canRunAsleep -> Triple("Mostly on", R.color.warn, "Allow \"Run in background\" below, or Android may pause the app while your phone sleeps.")
            needsListener -> Triple("Mostly on", R.color.warn, "Phone calls are covered. Allow notification access to cover your other calling apps.")
            else -> Triple(
                "Auto-reply is ON", R.color.ok,
                "Runs on its own in the background, even while your phone sleeps. You don't need the OwnersLOCAL app or a browser open."
            )
        }
        binding.statusHeadline.text = headline
        binding.statusHeadline.setTextColor(ContextCompat.getColor(this, color))
        binding.statusDetail.text = detail
        binding.accountLine.text = buildString {
            append(session.tenantName.ifBlank { session.email })
            if (session.email != session.tenantName) append(" · ").append(session.email)
            if (entitlement.summary.isNotBlank()) append("\n").append(entitlement.summary)
        }

        renderSetup(coreReady, settings)
        renderCallingApps(settings)

        if (!formDirty) {
            fillingForm = true
            binding.enabledSwitch.isChecked = settings.enabled
            if (binding.messageInput.text?.toString() != settings.messageTemplate) {
                binding.messageInput.setText(settings.messageTemplate)
            }
            fillingForm = false
        }
        updateMessageMeta()

        val pending = app.outbox.size
        binding.syncLine.text = buildString {
            append(if (state.lastSyncAt > 0) "Synced ${shortTime(state.lastSyncAt)}" else "Not synced yet")
            state.lastSyncError?.let { append(" · ").append(it) }
            if (pending > 0) append(" · $pending waiting to upload")
        }
        val log = state.activity()
        binding.activityLog.text = if (log.isEmpty()) "Nothing yet. Missed calls and replies will show up here." else log.joinToString("\n")
    }

    private fun renderSetup(coreReady: Boolean, settings: RemoteSettings) {
        binding.setupList.removeAllViews()
        fun row(done: Boolean, title: String, why: String, action: String, onClick: () -> Unit) {
            val item = ItemSetupBinding.inflate(layoutInflater, binding.setupList, true)
            item.setupIcon.text = if (done) "✅" else "⚠️"
            item.setupTitle.text = title
            item.setupWhy.text = why
            item.setupAction.visibility = if (done) View.GONE else View.VISIBLE
            item.setupAction.text = action
            item.setupAction.setOnClickListener { onClick() }
        }

        row(coreReady, "Calls & SMS", "See missed calls and send the reply.", "Allow") { requestCorePermissions() }
        row(
            Permissions.batteryUnrestricted(this), "Run in background",
            "Keeps working while your phone sleeps. On Samsung, also set Battery to \"Unrestricted\" in App info.",
            "Allow"
        ) { openBatterySettings() }
        row(
            Permissions.overlay(this), "Show over other apps",
            "Pops up a banner over whatever you're using when someone gets texted back.",
            "Allow"
        ) { openOverlaySettings() }
        row(
            Permissions.allGranted(this, Permissions.TEXT_HISTORY), "Text history",
            "Log customer replies to their record.", "Allow"
        ) { requestCorePermissions() }
        if (Build.VERSION.SDK_INT >= 33) {
            row(
                Permissions.allGranted(this, Permissions.NOTIFICATIONS), "Notifications",
                "Warns you if auto-replies stop working.", "Allow"
            ) { requestCorePermissions() }
        }
        if (settings.watchedPackages.isNotEmpty()) {
            row(
                Permissions.notificationAccess(this), "Notification access",
                "Needed to see missed calls in the calling apps you picked below.",
                "Allow"
            ) { promptNotificationAccess() }
        }
    }

    private fun renderCallingApps(settings: RemoteSettings) {
        binding.callingAppsList.removeAllViews()
        val installed = KnownCallingApps.installed(this)
        binding.callingAppsHint.text = if (installed.isEmpty()) {
            "None of the supported calling apps (Google Voice, TextNow, WhatsApp…) are installed. Regular phone calls are always covered."
        } else {
            "Calls to these apps don't show up in your phone's call log. Turn one on to text back its missed calls too. " +
                "Works when the app's missed-call notification shows the caller's number."
        }
        installed.forEach { entry ->
            val toggle = MaterialSwitch(this).apply {
                text = entry.label
                isChecked = entry.packageName in settings.watchedPackages
                setOnCheckedChangeListener { _, checked -> setCallingAppWatched(entry.packageName, checked) }
            }
            binding.callingAppsList.addView(toggle)
        }
    }

    private fun updateMessageMeta() {
        val text = binding.messageInput.text?.toString().orEmpty()
        val length = SmsMessage.calculateLength(text, false)
        val parts = length[0]
        binding.messageMeta.text = buildString {
            append("${text.length} characters")
            if (parts > 1) append(" · sends as $parts texts")
            if (formDirty) append(" · not saved")
        }
    }
}
