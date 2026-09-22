package com.protectmyphone.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;

public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        boolean enabled = context.getSharedPreferences("protectmyphone", Context.MODE_PRIVATE)
                .getBoolean("monitor_enabled", false);
        if (!enabled) return;
        if (VpnService.prepare(context) != null) return;

        Intent service = new Intent(context, DomainVpnService.class);
        service.setAction(DomainVpnService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
        else context.startService(service);
    }
}
