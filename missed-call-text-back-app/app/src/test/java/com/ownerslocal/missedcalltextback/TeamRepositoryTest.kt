package com.ownerslocal.missedcalltextback

import com.ownerslocal.missedcalltextback.team.TeamRepository
import org.junit.Assert.assertEquals
import org.junit.Test

class TeamRepositoryTest {
    @Test
    fun `message time comes from the m_ id the web app writes`() {
        assertEquals(1751812320123L, TeamRepository.messageMillis("m_1751812320123", "2025-07-06 14:32"))
        assertEquals(1751812320123L, TeamRepository.messageMillis("m_init_1751812320123", null))
    }

    @Test
    fun `falls back to the display timestamp, read as UTC`() {
        assertEquals(1751812320000L, TeamRepository.messageMillis("seed-1", "2025-07-06 14:32"))
        assertEquals(0L, TeamRepository.messageMillis("seed-2", "garbage"))
    }

    @Test
    fun `web timestamp format round-trips`() {
        val ts = TeamRepository.webTimestamp(1751812320000L)
        assertEquals("2025-07-06 14:32", ts)
        assertEquals(1751812320000L, TeamRepository.messageMillis("x", ts))
    }
}
