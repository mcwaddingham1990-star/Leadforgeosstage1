package com.protectmyphone.app.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class SourceRegistry {
    private final List<ActivitySource> sources = new ArrayList<>();
    private ActivitySource.Listener listener;

    public void setListener(ActivitySource.Listener listener) {
        this.listener = listener;
    }

    public void register(ActivitySource source) {
        if (source != null) sources.add(source);
    }

    public List<ActivitySource> getSources() {
        return Collections.unmodifiableList(sources);
    }

    public void startAll() {
        for (ActivitySource source : sources) source.start(listener);
    }

    public void stopAll() {
        for (ActivitySource source : sources) source.stop();
    }
}
