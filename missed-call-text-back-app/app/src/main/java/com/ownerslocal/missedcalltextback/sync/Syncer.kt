package com.ownerslocal.missedcalltextback.sync

import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.account.Fetch
import com.ownerslocal.missedcalltextback.account.TokenProvider

/** Pulls settings + plan status into the local cache. */
object Syncer {
    sealed class Outcome {
        object Ok : Outcome()
        data class Failed(val message: String, val signedOut: Boolean = false) : Outcome()
    }

    fun syncSettings(app: MissedCallApp): Outcome {
        val token = app.tokens.fresh()
        if (token is TokenProvider.Result.Failed) return fail(app, token.message, token.signedOut)
        val session = (token as TokenProvider.Result.Ok).session
        val provider = app.provider() ?: return fail(app, "Not signed in.", true)

        val settings = provider.fetchSettings(session.tenantId, session.idToken)
        val entitlement = provider.fetchEntitlement(session.tenantId, session.idToken)
        if (settings is Fetch.Ok) app.state.settings = settings.value
        if (entitlement is Fetch.Ok) app.state.entitlement = entitlement.value

        val error = (settings as? Fetch.Failed)?.message ?: (entitlement as? Fetch.Failed)?.message
        if (error != null) return fail(app, error, false)
        app.state.lastSyncAt = System.currentTimeMillis()
        app.state.lastSyncError = null
        return Outcome.Ok
    }

    private fun fail(app: MissedCallApp, message: String, signedOut: Boolean): Outcome {
        app.state.lastSyncError = message
        return Outcome.Failed(message, signedOut)
    }
}
