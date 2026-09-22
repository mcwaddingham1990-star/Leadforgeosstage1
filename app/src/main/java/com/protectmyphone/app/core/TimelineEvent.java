package com.protectmyphone.app.core;

public final class TimelineEvent {
    public final String source;
    public final String sourceType;
    public final String type;
    public final String detection;
    public final String value;
    public final String domain;
    public final String url;
    public final long timestampMillis;
    public final boolean privateMode;

    public TimelineEvent(
            String source,
            String sourceType,
            String type,
            String detection,
            String value,
            String domain,
            String url,
            long timestampMillis,
            boolean privateMode
    ) {
        this.source = source == null ? "" : source;
        this.sourceType = sourceType == null ? "" : sourceType;
        this.type = type == null ? "" : type;
        this.detection = detection == null ? "" : detection;
        this.value = value == null ? "" : value;
        this.domain = domain == null ? "" : domain;
        this.url = url == null ? "" : url;
        this.timestampMillis = timestampMillis;
        this.privateMode = privateMode;
    }
}
