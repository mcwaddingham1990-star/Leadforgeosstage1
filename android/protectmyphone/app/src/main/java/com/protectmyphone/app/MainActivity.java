package com.protectmyphone.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String NOTICE = "protect my phone is protecting your phone.";
    private static final String CONSENT = "Do you want to monitor websites for URLs, emails, and phone numbers, all time stamped?";
    private static final String CHANNEL_ID = "protectmyphone";
    private static final int NOTIFICATION_ID = 722;

    private static final Pattern EMAIL = Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PHONE = Pattern.compile("^[+()0-9 .-]{7,28}$");

    private SharedPreferences prefs;
    private WebView webView;
    private EditText addressBar;
    private LinearLayout contentHost;
    private TextView modeBadge;
    private Switch privateSwitch;
    private boolean privateMode;
    private boolean monitorEnabled;
    private boolean navigationFromAddressBar;
    private String bridgeName;
    private String pageToken;
    private final SimpleDateFormat stamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("protectmyphone", MODE_PRIVATE);
        monitorEnabled = prefs.getBoolean("monitor_enabled", false);
        bridgeName = "pmp" + UUID.randomUUID().toString().replace("-", "");
        createNotificationChannel();
        buildUi();
        requestNotificationPermission();
        showPersistentNotice();

        if (!prefs.contains("consent_answered")) {
            new AlertDialog.Builder(this)
                    .setTitle("protectmyphone")
                    .setMessage(CONSENT)
                    .setCancelable(false)
                    .setPositiveButton("Yes", (d, w) -> {
                        monitorEnabled = true;
                        prefs.edit().putBoolean("consent_answered", true).putBoolean("monitor_enabled", true).apply();
                        refreshModeBadge();
                        loadUrl("https://www.google.com");
                    })
                    .setNegativeButton("No", (d, w) -> {
                        monitorEnabled = false;
                        prefs.edit().putBoolean("consent_answered", true).putBoolean("monitor_enabled", false).apply();
                        refreshModeBadge();
                        loadUrl("https://www.google.com");
                    })
                    .show();
        } else {
            loadUrl("https://www.google.com");
        }
    }

    private int dp(int n) {
        return Math.round(n * getResources().getDisplayMetrics().density);
    }

    private TextView label(String s, float size, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(Color.rgb(31, 53, 87));
        if (bold) t.setTypeface(t.getTypeface(), 1);
        return t;
    }

    private Button button(String s) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(12);
        return b;
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(8), dp(8), dp(8), dp(8));
        root.setBackgroundColor(Color.rgb(245, 250, 255));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = label("protectmyphone", 20, true);
        modeBadge = label("", 11, true);
        modeBadge.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        top.addView(title, new LinearLayout.LayoutParams(0, dp(38), 1f));
        top.addView(modeBadge, new LinearLayout.LayoutParams(dp(160), dp(38)));
        root.addView(top);

        LinearLayout address = new LinearLayout(this);
        address.setOrientation(LinearLayout.HORIZONTAL);
        addressBar = new EditText(this);
        addressBar.setSingleLine(true);
        addressBar.setTextSize(13);
        addressBar.setHint("Website or search");
        addressBar.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addressBar.setOnEditorActionListener((v, actionId, event) -> {
            navigateAddress();
            return true;
        });
        Button go = button("Go");
        go.setOnClickListener(v -> navigateAddress());
        address.addView(addressBar, new LinearLayout.LayoutParams(0, dp(48), 1f));
        address.addView(go, new LinearLayout.LayoutParams(dp(65), dp(48)));
        root.addView(address);

        LinearLayout tools = new LinearLayout(this);
        tools.setOrientation(LinearLayout.HORIZONTAL);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        Button browser = button("Browser");
        Button timeline = button("Timeline");
        Button settings = button("Monitor");
        privateSwitch = new Switch(this);
        privateSwitch.setText("Private");
        privateSwitch.setTextSize(11);

        browser.setOnClickListener(v -> showBrowser());
        timeline.setOnClickListener(v -> showTimeline());
        settings.setOnClickListener(v -> showMonitorDialog());
        privateSwitch.setOnCheckedChangeListener((v, checked) -> setPrivateMode(checked));

        tools.addView(browser, new LinearLayout.LayoutParams(0, dp(44), 1f));
        tools.addView(timeline, new LinearLayout.LayoutParams(0, dp(44), 1f));
        tools.addView(settings, new LinearLayout.LayoutParams(0, dp(44), 1f));
        tools.addView(privateSwitch, new LinearLayout.LayoutParams(dp(105), dp(44)));
        root.addView(tools);

        contentHost = new LinearLayout(this);
        contentHost.setOrientation(LinearLayout.VERTICAL);
        root.addView(contentHost, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        webView = new WebView(this);
        configureWebView();
        showBrowser();
        refreshModeBadge();
        setContentView(root);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new PageBridge(), bridgeName);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                pageToken = UUID.randomUUID().toString();
                if (url != null && url.startsWith("https://")) {
                    addressBar.setText(url);
                    if (monitorEnabled) {
                        record("URL", navigationFromAddressBar ? "TYPED" : "SEEN", url, url);
                    }
                }
                navigationFromAddressBar = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith("https://")) addressBar.setText(url);
                if (monitorEnabled && url != null && url.startsWith("https://")) injectMonitor();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri u = request.getUrl();
                return !"https".equalsIgnoreCase(u.getScheme());
            }
        });
    }

    private void navigateAddress() {
        String raw = addressBar.getText().toString().trim();
        if (raw.isEmpty()) return;
        String url;
        if (raw.startsWith("https://")) {
            url = raw;
        } else if (raw.startsWith("http://")) {
            url = "https://" + raw.substring(7);
        } else if (raw.matches("^[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/.*)?$")) {
            url = "https://" + raw;
        } else {
            url = "https://www.google.com/search?q=" + URLEncoder.encode(raw, StandardCharsets.UTF_8);
        }
        navigationFromAddressBar = true;
        loadUrl(url);
    }

    private void loadUrl(String url) {
        showBrowser();
        webView.loadUrl(url);
        showPersistentNotice();
    }

    private void showBrowser() {
        contentHost.removeAllViews();
        if (webView.getParent() != null) ((ViewGroup) webView.getParent()).removeView(webView);
        contentHost.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void showMonitorDialog() {
        new AlertDialog.Builder(this)
                .setTitle("protectmyphone")
                .setMessage(CONSENT)
                .setPositiveButton("Yes", (d, w) -> {
                    monitorEnabled = true;
                    prefs.edit().putBoolean("monitor_enabled", true).putBoolean("consent_answered", true).apply();
                    refreshModeBadge();
                    String url = webView.getUrl();
                    if (url != null && url.startsWith("https://")) injectMonitor();
                    showPersistentNotice();
                })
                .setNegativeButton("No", (d, w) -> {
                    monitorEnabled = false;
                    prefs.edit().putBoolean("monitor_enabled", false).putBoolean("consent_answered", true).apply();
                    refreshModeBadge();
                    showPersistentNotice();
                })
                .show();
    }

    private void refreshModeBadge() {
        if (modeBadge == null) return;
        String state = monitorEnabled ? "MONITORING" : "MONITOR OFF";
        if (privateMode) state += " • PRIVATE";
        modeBadge.setText(state);
    }

    private void setPrivateMode(boolean enabled) {
        privateMode = enabled;
        clearBrowserSession();
        refreshModeBadge();
        String current = webView.getUrl();
        if (current == null || !current.startsWith("https://")) current = "https://www.google.com";
        webView.loadUrl(current);
        showPersistentNotice();
    }

    private void clearBrowserSession() {
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        WebStorage.getInstance().deleteAllData();
        webView.clearCache(true);
        webView.clearHistory();
    }

    private void injectMonitor() {
        if (!monitorEnabled) return;
        final String token = pageToken.replace("'", "");
        final String bridge = bridgeName.replace("'", "");

        String js = "(function(){" +
                "if(window.__pmpInstalled){return;}window.__pmpInstalled=true;" +
                "const B=window['" + bridge + "'];const T='" + token + "';const sent=new Set();" +
                "const email=/\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/ig;" +
                "const phone=/((?:\\+?1[ .-]?)?(?:\\(?[2-9][0-9]{2}\\)?[ .-]?)?[2-9][0-9]{2}[ .-]?[0-9]{4})/g;" +
                "function send(kind,val){try{val=(val||'').trim();if(!val)return;const k=kind+'|'+val;if(sent.has(k))return;sent.add(k);B.report(kind,val,location.href,T);}catch(e){}}" +
                "function scan(){" +
                "try{const text=(document.body&&document.body.innerText)||'';let m,c=0;" +
                "email.lastIndex=0;while((m=email.exec(text))&&c++<150)send('email_seen',m[0]);" +
                "phone.lastIndex=0;c=0;while((m=phone.exec(text))&&c++<150){const d=m[0].replace(/\\D/g,'');if(d.length>=7&&d.length<=15)send('phone_seen',m[0]);}" +
                "}catch(e){}" +
                "}" +
                "function entered(el){" +
                "try{if(!el||!('value' in el))return;const type=(el.type||'').toLowerCase();const ac=(el.autocomplete||'').toLowerCase();" +
                "if(type==='password'||ac.includes('password')||ac==='one-time-code')return;" +
                "const v=(el.value||'').trim();if(!v)return;" +
                "if(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$/i.test(v))send('email_typed',v);" +
                "const digits=v.replace(/\\D/g,'');const meta=((el.name||'')+' '+(el.id||'')+' '+(el.placeholder||'')+' '+type).toLowerCase();" +
                "if(digits.length>=7&&digits.length<=15&&(type==='tel'||/phone|mobile|telephone|tel/.test(meta)))send('phone_typed',v);" +
                "}catch(e){}" +
                "}" +
                "document.addEventListener('input',e=>entered(e.target),true);" +
                "document.addEventListener('change',e=>entered(e.target),true);" +
                "document.addEventListener('blur',e=>entered(e.target),true);" +
                "let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,900);}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});" +
                "scan();" +
                "})();";

        webView.evaluateJavascript(js, null);
    }

    public final class PageBridge {
        @JavascriptInterface
        public void report(String kind, String value, String reportedUrl, String token) {
            if (!monitorEnabled || token == null || !token.equals(pageToken)) return;
            String current = webView.getUrl();
            if (!sameOrigin(current, reportedUrl)) return;

            switch (kind) {
                case "email_seen": record("EMAIL", "SEEN", value, reportedUrl); break;
                case "email_typed": record("EMAIL", "TYPED", value, reportedUrl); break;
                case "phone_seen": record("PHONE", "SEEN", value, reportedUrl); break;
                case "phone_typed": record("PHONE", "TYPED", value, reportedUrl); break;
            }
        }
    }

    private boolean sameOrigin(String a, String b) {
        if (a == null || b == null) return false;
        Uri x = Uri.parse(a);
        Uri y = Uri.parse(b);
        return "https".equalsIgnoreCase(x.getScheme())
                && "https".equalsIgnoreCase(y.getScheme())
                && x.getHost() != null
                && x.getHost().equalsIgnoreCase(y.getHost());
    }

    private synchronized void record(String type, String detection, String value, String url) {
        if (!monitorEnabled || value == null || url == null) return;
        value = value.trim();
        if (value.isEmpty()) return;

        if ("EMAIL".equals(type) && !EMAIL.matcher(value).matches()) return;
        if ("PHONE".equals(type)) {
            if (!PHONE.matcher(value).matches()) return;
            int digits = value.replaceAll("\\D", "").length();
            if (digits < 7 || digits > 15) return;
        }
        if ("URL".equals(type)) {
            Uri u = Uri.parse(value);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null) return;
        }

        Uri page = Uri.parse(url);
        String host = page.getHost();
        if (host == null) host = "";

        JSONArray rows = readRows();
        JSONObject row = new JSONObject();
        try {
            row.put("time", stamp.format(new Date()));
            row.put("type", type);
            row.put("detection", detection);
            row.put("value", value);
            row.put("url", url);
            row.put("domain", host);
            row.put("private", privateMode);
            rows.put(row);

            while (rows.length() > 5000) rows.remove(0);
            prefs.edit().putString("timeline", rows.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    private JSONArray readRows() {
        try {
            return new JSONArray(prefs.getString("timeline", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private void showTimeline() {
        contentHost.removeAllViews();

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        TextView heading = label("Timeline", 18, true);
        Button clear = button("Clear all");
        clear.setOnClickListener(v -> {
            prefs.edit().remove("timeline").apply();
            showTimeline();
            showPersistentNotice();
        });
        actions.addView(heading, new LinearLayout.LayoutParams(0, dp(48), 1f));
        actions.addView(clear, new LinearLayout.LayoutParams(dp(100), dp(48)));
        shell.addView(actions);

        ScrollView scroll = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(4), dp(4), dp(4), dp(20));

        JSONArray rows = readRows();
        if (rows.length() == 0) {
            TextView empty = label("No monitored website activity yet.", 13, false);
            empty.setPadding(dp(8), dp(20), dp(8), dp(8));
            list.addView(empty);
        }

        for (int i = rows.length() - 1; i >= 0; i--) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null) continue;

            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(12), dp(10), dp(12), dp(10));
            card.setBackgroundColor(Color.rgb(227, 243, 255));

            String top = r.optString("time") + (r.optBoolean("private") ? " • PRIVATE" : "");
            card.addView(label(top, 10, false));
            card.addView(label(r.optString("type") + " • " + r.optString("detection"), 11, true));
            card.addView(label(r.optString("value"), 14, true));
            card.addView(label(r.optString("domain"), 11, false));
            card.addView(label(r.optString("url"), 9, false));

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(0, dp(4), 0, dp(4));
            list.addView(card, lp);
        }

        scroll.addView(list);
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        contentHost.addView(shell, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CHANNEL_ID, "protectmyphone", NotificationManager.IMPORTANCE_LOW);
            c.setDescription(NOTICE);
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 722);
        }
    }

    private void showPersistentNotice() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle(NOTICE)
                .setContentText(NOTICE)
                .setContentIntent(pi)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .build();
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, n);
    }

    @Override
    public void onBackPressed() {
        if (webView.getParent() == null) {
            showBrowser();
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (privateMode) clearBrowserSession();
        if (webView != null) {
            webView.removeJavascriptInterface(bridgeName);
            webView.destroy();
        }
        super.onDestroy();
    }
}
