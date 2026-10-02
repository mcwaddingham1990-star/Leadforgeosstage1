package com.ownerslocal.missedcalltextback

import com.ownerslocal.missedcalltextback.service.CallNotificationListener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MissedCallNotificationTest {
    @Test
    fun `reads the number out of missed call alerts`() {
        assertEquals("(555) 123-4567", CallNotificationListener.missedCallNumber("Missed call (555) 123-4567"))
        assertEquals("+1 555 123 4567", CallNotificationListener.missedCallNumber("+1 555 123 4567 Missed voice call"))
        assertEquals("555-123-4567", CallNotificationListener.missedCallNumber("2 missed calls from 555-123-4567"))
    }

    @Test
    fun `ignores ordinary chat messages that contain a number`() {
        assertNull(CallNotificationListener.missedCallNumber("John: call me at 555-123-4567"))
    }

    @Test
    fun `ignores missed calls with no number shown`() {
        assertNull(CallNotificationListener.missedCallNumber("Missed call from Mom"))
    }

    @Test
    fun `does not match a longer digit run like an order number`() {
        assertNull(CallNotificationListener.missedCallNumber("Missed call. Ref 1234555123456789"))
    }
}
