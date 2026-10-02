package com.ownerslocal.missedcalltextback.sync

import com.ownerslocal.missedcalltextback.MissedCallApp
import com.ownerslocal.missedcalltextback.account.AccountKind
import com.ownerslocal.missedcalltextback.account.TokenProvider
import com.ownerslocal.missedcalltextback.widget.PulseWidget

/** Pulls main-app notifications + team conversations into the popup cache, then refreshes the widget. */
object InboxSync {
    private const val MIN_INTERVAL_MS = 20_000L

    @Synchronized
    fun refresh(app: MissedCallApp, force: Boolean = false): Boolean {
        val now = System.currentTimeMillis()
        if (!force && now - app.state.lastInboxSyncAt < MIN_INTERVAL_MS) return true
        val token = app.tokens.fresh() as? TokenProvider.Result.Ok ?: return false
        val session = token.session
        if (session.kind != AccountKind.OWNERSLOCAL) return true

        if (app.state.myName == null) {
            val (name, role) = app.team.myProfile(session)
            app.state.myName = name
            app.state.myRole = role
        }
        val notes = app.team.notifications(session)
        val conversations = app.team.conversations(session, app.state.myName, app.state.inboxBaseline)
        app.inbox.saveServer(notes, conversations)
        app.state.lastInboxSyncAt = now
        PulseWidget.refresh(app)
        return notes != null && conversations != null
    }
}
