package com.ownerslocal.missedcalltextback

import com.ownerslocal.missedcalltextback.sync.OutboxEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OutboxEventTest {
    @Test
    fun `call events survive a save and reload`() {
        val replied = OutboxEvent.Call("call-1-2", "+15551234567", "missed", 1700000000000, "Sorry we missed you")
        val notReplied = OutboxEvent.Call("call-3-4", "+15551234567", "incoming", 1700000000001, null)
        assertEquals(replied, OutboxEvent.fromJson(replied.toJson()))
        assertEquals(notReplied, OutboxEvent.fromJson(notReplied.toJson()))
    }

    @Test
    fun `text events survive a save and reload`() {
        val text = OutboxEvent.Text("sms-in-1-2", "+15551234567", "incoming", 1700000000000, "Can you come Tuesday?")
        assertEquals(text, OutboxEvent.fromJson(text.toJson()))
    }

    @Test
    fun `unknown or corrupt entries are dropped instead of crashing`() {
        assertNull(OutboxEvent.fromJson(org.json.JSONObject().put("type", "fax")))
        assertNull(OutboxEvent.fromJson(org.json.JSONObject().put("type", "call")))
    }
}
