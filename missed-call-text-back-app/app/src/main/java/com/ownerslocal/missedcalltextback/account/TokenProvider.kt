package com.ownerslocal.missedcalltextback.account

import com.ownerslocal.missedcalltextback.store.AppState
import com.ownerslocal.missedcalltextback.store.Session
import com.ownerslocal.missedcalltextback.store.SessionStore

/** Hands out a non-expired ID token, refreshing it when it's within 5 minutes of expiry. */
class TokenProvider(
    private val sessions: SessionStore,
    private val state: AppState,
    private val auth: FirebaseAuthRest
) {
    sealed class Result {
        data class Ok(val session: Session) : Result()
        data class Failed(val message: String, val signedOut: Boolean) : Result()
    }

    @Synchronized
    fun fresh(): Result {
        val session = sessions.get() ?: return Result.Failed("Not signed in.", signedOut = true)
        if (session.expiresAtMillis - System.currentTimeMillis() > REFRESH_MARGIN_MS) return Result.Ok(session)

        return when (val refreshed = auth.refresh(session.refreshToken, session.email)) {
            is AuthResult.Ok -> {
                sessions.updateTokens(refreshed.tokens)
                state.sessionExpired = false
                Result.Ok(sessions.get() ?: return Result.Failed("Not signed in.", signedOut = true))
            }
            is AuthResult.Failed -> {
                if (refreshed.revoked) state.sessionExpired = true
                Result.Failed(refreshed.message, signedOut = refreshed.revoked)
            }
        }
    }

    private companion object {
        const val REFRESH_MARGIN_MS = 5 * 60 * 1000L
    }
}
