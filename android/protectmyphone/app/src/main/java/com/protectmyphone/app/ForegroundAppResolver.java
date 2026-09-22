package com.protectmyphone.app;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;

public final class ForegroundAppResolver {
    private ForegroundAppResolver() {}

    public static String recentBrowserLabel(Context context) {
        try {
            UsageStatsManager manager = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (manager == null) return "Browser";
            long now = System.currentTimeMillis();
            UsageEvents events = manager.queryEvents(now - 30L * 60L * 1000L, now + 1000L);
            if (events == null) return "Browser";

            UsageEvents.Event event = new UsageEvents.Event();
            String latest = null;
            long latestTime = -1L;

            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                int type = event.getEventType();
                if ((type == UsageEvents.Event.MOVE_TO_FOREGROUND || type == UsageEvents.Event.ACTIVITY_RESUMED)
                        && event.getTimeStamp() >= latestTime) {
                    latest = event.getPackageName();
                    latestTime = event.getTimeStamp();
                }
            }

            if (latest == null) return "Browser";
            if (latest.equals("com.android.chrome")
                    || latest.equals("com.chrome.beta")
                    || latest.equals("com.chrome.dev")
                    || latest.equals("com.chrome.canary")) return "Chrome";

            if (latest.equals("com.microsoft.emmx")
                    || latest.equals("com.microsoft.emmx.beta")
                    || latest.equals("com.microsoft.emmx.canary")
                    || latest.equals("com.microsoft.emmx.dev")) return "Microsoft Edge";

            if (latest.equals(context.getPackageName())) return "protectmyphone";
            return "Browser";
        } catch (Throwable ignored) {
            return "Browser";
        }
    }
}
