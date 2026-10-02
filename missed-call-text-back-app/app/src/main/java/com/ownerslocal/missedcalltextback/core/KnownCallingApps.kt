package com.ownerslocal.missedcalltextback.core

import android.content.Context
import android.content.pm.PackageManager

/**
 * Calling apps that keep calls out of the phone's call log, so their missed
 * calls can only be caught from their notifications. Each package is also
 * listed under <queries> in the manifest; Android 11+ hides other apps'
 * install status without that.
 */
object KnownCallingApps {
    data class Entry(val label: String, val packageName: String)

    val ENTRIES = listOf(
        Entry("Google Voice", "com.google.android.apps.googlevoice"),
        Entry("TextNow", "com.enflick.android.TextNow"),
        Entry("WhatsApp", "com.whatsapp"),
        Entry("WhatsApp Business", "com.whatsapp.w4b"),
        Entry("Telegram", "org.telegram.messenger"),
        Entry("Skype", "com.skype.raider"),
        Entry("Facebook Messenger", "com.facebook.orca"),
        Entry("Viber", "com.viber.voip"),
        Entry("Signal", "org.thoughtcrime.securesms"),
        Entry("RingCentral", "com.glip.mobile"),
        Entry("Microsoft Teams", "com.microsoft.teams")
    )

    val PACKAGES: Set<String> = ENTRIES.map { it.packageName }.toSet()

    fun installed(context: Context): List<Entry> = ENTRIES.filter { isInstalled(context, it.packageName) }

    private fun isInstalled(context: Context, packageName: String): Boolean = try {
        context.packageManager.getApplicationInfo(packageName, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }
}
