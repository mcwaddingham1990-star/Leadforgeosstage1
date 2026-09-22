package com.protectmyphone.app.core;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class TimelineStore {
    private static final String PREFS = "protectmyphone";
    private static final String KEY = "timeline";
    private static final int MAX_ROWS = 5000;

    private final SharedPreferences prefs;
    private final SimpleDateFormat stamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);

    public TimelineStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public synchronized void append(TimelineEvent event) {
        if (event == null || event.value.trim().isEmpty()) return;

        JSONArray rows = read();
        JSONObject row = new JSONObject();
        try {
            row.put("time", stamp.format(new Date(event.timestampMillis)));
            row.put("source", event.source);
            row.put("sourceType", event.sourceType);
            row.put("type", event.type);
            row.put("detection", event.detection);
            row.put("value", event.value);
            row.put("domain", event.domain);
            row.put("url", event.url);
            row.put("private", event.privateMode);
            rows.put(row);

            while (rows.length() > MAX_ROWS) rows.remove(0);
            prefs.edit().putString(KEY, rows.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    public JSONArray read() {
        try {
            return new JSONArray(prefs.getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public void clear() {
        prefs.edit().remove(KEY).apply();
    }
}
