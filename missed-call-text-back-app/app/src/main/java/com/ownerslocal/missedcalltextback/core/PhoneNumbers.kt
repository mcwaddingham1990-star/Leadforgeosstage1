package com.ownerslocal.missedcalltextback.core

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object PhoneNumbers {
    /** Last 10 digits: matches "+1 (555) 123-4567", "555.123.4567" and "15551234567" to each other. */
    fun matchKey(raw: String?): String {
        val digits = raw.orEmpty().filter { it.isDigit() }
        return if (digits.length > 10) digits.takeLast(10) else digits
    }

    /** Whether it's worth texting: real caller ID, not a short code or "Unknown"/"Private". */
    fun isTextable(raw: String?): Boolean = matchKey(raw).length >= 10

    fun pretty(raw: String?): String {
        val key = matchKey(raw)
        return if (key.length == 10) "(${key.substring(0, 3)}) ${key.substring(3, 6)}-${key.substring(6)}" else raw.orEmpty()
    }
}

fun isoUtc(millis: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(millis))

fun shortTime(millis: Long): String = SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(millis))
