package com.ownerslocal.missedcalltextback

import com.ownerslocal.missedcalltextback.core.PhoneNumbers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {
    @Test
    fun `formats of the same number share a match key`() {
        val key = "5551234567"
        listOf("+1 (555) 123-4567", "555.123.4567", "15551234567", "555-123-4567", " 555 123 4567 ")
            .forEach { assertEquals(it, key, PhoneNumbers.matchKey(it)) }
    }

    @Test
    fun `short codes, blanks and hidden callers are not textable`() {
        assertFalse(PhoneNumbers.isTextable(null))
        assertFalse(PhoneNumbers.isTextable(""))
        assertFalse(PhoneNumbers.isTextable("Unknown"))
        assertFalse(PhoneNumbers.isTextable("-2"))
        assertFalse(PhoneNumbers.isTextable("72345"))
        assertTrue(PhoneNumbers.isTextable("+15551234567"))
    }

    @Test
    fun `pretty prints US numbers`() {
        assertEquals("(555) 123-4567", PhoneNumbers.pretty("+15551234567"))
    }
}
