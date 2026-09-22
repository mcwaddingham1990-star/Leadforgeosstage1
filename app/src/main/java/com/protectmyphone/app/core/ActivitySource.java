package com.protectmyphone.app.core;

/**
 * Plug-in boundary for consent-based breadcrumb sources.
 *
 * Examples: protectmyphone's own browser, a local VPN/DNS domain source,
 * Android call/SMS metadata, or another source that exposes data through
 * a supported API. Implementations should emit only the minimum data needed
 * for the user's timeline.
 */
public interface ActivitySource {
    interface Listener {
        void onEvent(TimelineEvent event);
    }

    String getName();
    void start(Listener listener);
    void stop();
}
