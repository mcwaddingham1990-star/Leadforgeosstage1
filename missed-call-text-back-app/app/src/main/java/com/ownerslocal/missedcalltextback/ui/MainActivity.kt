package com.ownerslocal.missedcalltextback.ui

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.auth.AuthResult
import com.ownerslocal.missedcalltextback.auth.FirebaseAuthClient
import com.ownerslocal.missedcalltextback.data.SettingsRepository
import com.ownerslocal.missedcalltextback.data.SyncResult
import com.ownerslocal.missedcalltextback.databinding.ActivityMainBinding
import com.ownerslocal.missedcalltextback.service.MissedCallMonitorService
import java.text.DateFormat
import java.util.Date

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val app get() = application as MissedCallApp

    private val runtimePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { refreshPermissionsStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.signInButton.setOnClickListener { onSignInTapped() }
        binding.signOutButton.setOnClickListener { onSignOutTapped() }
        binding.syncNowButton.setOnClickListener { onSyncNowTapped() }
        binding.grantPermissionsButton.setOnClickListener { requestRuntimePermissions() }
        binding.openNotificationAccessButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        binding.ignoreBatteryOptimizationButton.setOnClickListener { requestIgnoreBatteryOptimization() }

        renderSignedInState()
    }

    override fun onResume() {
        super.onResume()
        refreshPermissionsStatus()
    }

    private fun renderSignedInState() {
        val signedIn = app.sessionStore.isSignedIn
        binding.loginGroup.visibility = if (signedIn) android.view.View.GONE else android.view.View.VISIBLE
        binding.statusGroup.visibility = if (signedIn) android.view.View.VISIBLE else android.view.View.GONE
        if (signedIn) {
            binding.signedInAsText.text = "Signed in as ${app.sessionStore.email ?: app.sessionStore.businessId ?: "..."}"
            renderSettingsSummary()
            refreshPermissionsStatus()
            ContextCompat.startForegroundService(this, Intent(this, MissedCallMonitorService::class.java))
        }
    }

    private fun renderSettingsSummary() {
        val store = app.sessionStore
        val lastSync = store.lastSyncedAtMillis
        val lastSyncText = if (lastSync > 0) DateFormat.getDateTimeInstance().format(Date(lastSync)) else "never"
        binding.settingsSummaryText.text = buildString {
            append(if (store.enabled) "Auto text-back is ON.\n" else "Auto text-back is OFF (enable it on the web app's settings page).\n")
            append("Message: \"${store.messageTemplate}\"\n")
            append("Watching ${store.watchedPackages.size} extra app(s) for missed calls.\n")
            append("Last synced: $lastSyncText")
        }
    }

    private fun onSignInTapped() {
        val email = binding.emailInput.text?.toString()?.trim().orEmpty()
        val password = binding.passwordInput.text?.toString().orEmpty()
        if (email.isEmpty() || password.isEmpty()) {
            showLoginError("Enter your email and password.")
            return
        }
        setLoginLoading(true)
        Thread {
            val result = FirebaseAuthClient(app.httpClient).signIn(email, password)
            runOnUiThread {
                setLoginLoading(false)
                when (result) {
                    is AuthResult.Success -> {
                        app.sessionStore.idToken = result.idToken
                        app.sessionStore.refreshToken = result.refreshToken
                        app.sessionStore.uid = result.uid
                        app.sessionStore.email = result.email
                        renderSignedInState()
                        onSyncNowTapped()
                    }
                    is AuthResult.Failure -> showLoginError(result.message)
                }
            }
        }.start()
    }

    private fun onSignOutTapped() {
        stopService(Intent(this, MissedCallMonitorService::class.java))
        app.sessionStore.clear()
        renderSignedInState()
    }

    private fun onSyncNowTapped() {
        binding.syncProgress.visibility = android.view.View.VISIBLE
        Thread {
            val repository = SettingsRepository(app.sessionStore, app.httpClient)
            val result = repository.sync()
            runOnUiThread {
                binding.syncProgress.visibility = android.view.View.GONE
                when (result) {
                    is SyncResult.Success -> {
                        renderSettingsSummary()
                        binding.subscriptionStatusText.text = if (result.subscriptionActive) {
                            ""
                        } else {
                            "This business's subscription isn't active -- auto text-back is paused until it's reactivated."
                        }
                    }
                    is SyncResult.Failure -> {
                        binding.subscriptionStatusText.text = result.message
                        if (result.sessionExpired) {
                            app.sessionStore.clear()
                            renderSignedInState()
                        }
                    }
                }
            }
        }.start()
    }

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        runtimePermissionsLauncher.launch(permissions.toTypedArray())
    }

    private fun requestIgnoreBatteryOptimization() {
        val powerManager = getSystemService(PowerManager::class.java)
        if (powerManager.isIgnoringBatteryOptimizations(packageName)) return
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun refreshPermissionsStatus() {
        if (!app.sessionStore.isSignedIn) return
        val smsGranted = isGranted(Manifest.permission.SEND_SMS)
        val phoneStateGranted = isGranted(Manifest.permission.READ_PHONE_STATE)
        val callLogGranted = isGranted(Manifest.permission.READ_CALL_LOG)
        val notificationAccessGranted = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)
        val batteryExempt = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)

        binding.permissionsStatusText.text = buildString {
            append(if (smsGranted) "✓ " else "✗ ").append("SMS\n")
            append(if (phoneStateGranted) "✓ " else "✗ ").append("Phone state\n")
            append(if (callLogGranted) "✓ " else "✗ ").append("Call log\n")
            append(if (notificationAccessGranted) "✓ " else "✗ ").append("Notification access\n")
            append(if (batteryExempt) "✓ " else "✗ ").append("Background run allowed")
        }
    }

    private fun isGranted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun setLoginLoading(loading: Boolean) {
        binding.loginProgress.visibility = if (loading) android.view.View.VISIBLE else android.view.View.GONE
        binding.signInButton.isEnabled = !loading
    }

    private fun showLoginError(message: String) {
        binding.loginError.text = message
        binding.loginError.visibility = android.view.View.VISIBLE
    }
}
