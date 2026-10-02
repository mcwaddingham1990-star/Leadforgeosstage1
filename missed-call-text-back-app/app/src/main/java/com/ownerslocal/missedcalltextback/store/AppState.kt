package com.ownerslocal.missedcalltextback.store

import android.content.Context
import androidx.core.content.edit
import com.ownerslocal.missedcalltextback.Config
import com.ownerslocal.missedcalltextback.account.Entitlement
import com.ownerslocal.missedcalltextback.account.RemoteSettings
import com.ownerslocal.missedcalltextback.core.shortTime
import org.json.JSONArray
import org.json.JSONObject

/** Non-secret local state: cached settings, scan watermarks, cooldowns, activity log. */
class AppState(context: Context) {
    private val prefs = context.getSharedPreferences("mctb_state", Context.MODE_PRIVATE)

    var settings: RemoteSettings
        get() = RemoteSettings(
            enabled = prefs.getBoolean("enabled", true),
            messageTemplate = prefs.getString("message", null) ?: Config.DEFAULT_MESSAGE,
            watchedPackages = prefs.getStringSet("watched", emptySet()).orEmpty().toSet()
        )
        set(value) = prefs.edit {
            putBoolean("enabled", value.enabled)
            putString("message", value.messageTemplate)
            putStringSet("watched", value.watchedPackages)
        }

    var entitlement: Entitlement
        get() = Entitlement(
            active = prefs.getBoolean("entitled", true),
            summary = prefs.getString("entitlement_summary", null).orEmpty()
        )
        set(value) = prefs.edit {
            putBoolean("entitled", value.active)
            putString("entitlement_summary", value.summary)
        }

    var lastSyncAt: Long
        get() = prefs.getLong("last_sync_at", 0L)
        set(value) = prefs.edit { putLong("last_sync_at", value) }

    var lastSyncError: String?
        get() = prefs.getString("last_sync_error", null)
        set(value) = prefs.edit { putString("last_sync_error", value) }

    /** True once the refresh token is rejected; cleared on the next sign-in. */
    var sessionExpired: Boolean
        get() = prefs.getBoolean("session_expired", false)
        set(value) = prefs.edit { putBoolean("session_expired", value) }

    /** Highest call-log _ID already handled; -1 = not yet baselined. */
    var callLogWatermark: Long
        get() = prefs.getLong("call_log_watermark", -1L)
        set(value) = prefs.edit(commit = true) { putLong("call_log_watermark", value) }

    /** Highest SMS _ID already handled from the Sent folder; -1 = not yet baselined. */
    var sentSmsWatermark: Long
        get() = prefs.getLong("sent_sms_watermark", -1L)
        set(value) = prefs.edit(commit = true) { putLong("sent_sms_watermark", value) }

    // ---- Widget / notification popup ----

    var pulseForCalls: Boolean
        get() = prefs.getBoolean("pulse_calls", true)
        set(value) = prefs.edit { putBoolean("pulse_calls", value) }

    var pulseForAppNotifications: Boolean
        get() = prefs.getBoolean("pulse_app", true)
        set(value) = prefs.edit { putBoolean("pulse_app", value) }

    /** The widget stops pulsing for anything that arrived before the popup was last opened. */
    var popupOpenedAt: Long
        get() = prefs.getLong("popup_opened_at", 0L)
        set(value) = prefs.edit { putLong("popup_opened_at", value) }

    /** Team messages older than this (first sign-in here) never count as unread. */
    var inboxBaseline: Long
        get() = prefs.getLong("inbox_baseline", 0L).takeIf { it > 0 } ?: System.currentTimeMillis().also { inboxBaseline = it }
        set(value) = prefs.edit { putLong("inbox_baseline", value) }

    var lastInboxSyncAt: Long
        get() = prefs.getLong("last_inbox_sync_at", 0L)
        set(value) = prefs.edit { putLong("last_inbox_sync_at", value) }

    var myName: String?
        get() = prefs.getString("my_name", null)
        set(value) = prefs.edit { putString("my_name", value) }

    var myRole: String?
        get() = prefs.getString("my_role", null)
        set(value) = prefs.edit { putString("my_role", value) }

    /** The FCM token already registered in push_subscriptions. */
    var registeredPushToken: String?
        get() = prefs.getString("push_token", null)
        set(value) = prefs.edit { putString("push_token", value) }

    // ---- Per-number reply cooldown (persisted, so a process restart can't double-text) ----

    @Synchronized
    fun tryClaimReply(numberKey: String, now: Long): Boolean {
        val map = JSONObject(prefs.getString("cooldowns", "{}") ?: "{}")
        val last = map.optLong(numberKey, 0L)
        if (now - last < Config.PER_NUMBER_COOLDOWN_MS) return false
        map.keys().asSequence().toList().forEach { key ->
            if (now - map.optLong(key, 0L) > Config.PER_NUMBER_COOLDOWN_MS) map.remove(key)
        }
        map.put(numberKey, now)
        prefs.edit(commit = true) { putString("cooldowns", map.toString()) }
        return true
    }

    /** Dedupes notification-listener hits (apps repost the same notification). */
    @Synchronized
    fun markNotificationSeen(key: String): Boolean {
        val seen = JSONArray(prefs.getString("seen_notifications", "[]") ?: "[]")
        for (i in 0 until seen.length()) if (seen.optString(i) == key) return false
        seen.put(key)
        while (seen.length() > 50) seen.remove(0)
        prefs.edit { putString("seen_notifications", seen.toString()) }
        return true
    }

    // ---- Activity log shown on the dashboard ----

    @Synchronized
    fun log(message: String) {
        val entries = JSONArray(prefs.getString("activity", "[]") ?: "[]")
        entries.put("${shortTime(System.currentTimeMillis())}  $message")
        while (entries.length() > 40) entries.remove(0)
        prefs.edit { putString("activity", entries.toString()) }
    }

    fun activity(): List<String> {
        val entries = JSONArray(prefs.getString("activity", "[]") ?: "[]")
        return (entries.length() - 1 downTo 0).map { entries.optString(it) }
    }

    fun clearAll() = prefs.edit(commit = true) { clear() }
}
