package com.protectmyphone.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import com.protectmyphone.app.core.TimelineEvent;
import com.protectmyphone.app.core.TimelineStore;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class DomainVpnService extends VpnService {
    public static final String ACTION_START = "com.protectmyphone.app.START_DOMAIN_MONITOR";
    public static final String ACTION_STOP = "com.protectmyphone.app.STOP_DOMAIN_MONITOR";

    private static final String NOTICE = "protect my phone is protecting your phone.";
    private static final String CHANNEL_ID = "protectmyphone";
    private static final int NOTIFICATION_ID = 722;
    private static final String VPN_DNS = "10.77.0.1";
    private static final String VPN_ADDRESS = "10.77.0.2";
    private static final String UPSTREAM_DNS = "1.1.1.1";

    private ParcelFileDescriptor tunnel;
    private Thread worker;
    private volatile boolean running;
    private TimelineStore store;
    private final Map<String, Long> recent = new ConcurrentHashMap<>();

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutdown();
            stopSelf();
            return START_NOT_STICKY;
        }

        createChannel();
        startForeground(NOTIFICATION_ID, notification());
        if (!running) startTunnel();
        return START_STICKY;
    }

    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle(NOTICE)
                .setContentText(NOTICE)
                .setContentIntent(pi)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "protectmyphone", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(NOTICE);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private void startTunnel() {
        try {
            Builder builder = new Builder()
                    .setSession("protectmyphone")
                    .setMtu(1500)
                    .addAddress(VPN_ADDRESS, 32)
                    .addRoute(VPN_DNS, 32)
                    .addDnsServer(VPN_DNS)
                    .setBlocking(true);

            int allowed = 0;
            allowed += allowIfInstalled(builder, "com.android.chrome");
            allowed += allowIfInstalled(builder, "com.chrome.beta");
            allowed += allowIfInstalled(builder, "com.chrome.dev");
            allowed += allowIfInstalled(builder, "com.chrome.canary");
            allowed += allowIfInstalled(builder, "com.microsoft.emmx");
            allowed += allowIfInstalled(builder, "com.microsoft.emmx.beta");
            allowed += allowIfInstalled(builder, "com.microsoft.emmx.canary");
            allowed += allowIfInstalled(builder, "com.microsoft.emmx.dev");

            // If neither browser is installed, let Android apply the VPN to apps normally.
            // The route is DNS-only, so this still does not tunnel page contents.
            tunnel = builder.establish();
            if (tunnel == null) {
                stopSelf();
                return;
            }

            store = new TimelineStore(this);
            running = true;
            worker = new Thread(this::runLoop, "protectmyphone-dns");
            worker.start();
        } catch (Throwable e) {
            shutdown();
            stopSelf();
        }
    }

    private int allowIfInstalled(Builder builder, String packageName) {
        try {
            getPackageManager().getPackageInfo(packageName, 0);
            builder.addAllowedApplication(packageName);
            return 1;
        } catch (PackageManager.NameNotFoundException ignored) {
            return 0;
        }
    }

    private void runLoop() {
        try (FileInputStream in = new FileInputStream(tunnel.getFileDescriptor());
             FileOutputStream out = new FileOutputStream(tunnel.getFileDescriptor())) {

            byte[] packet = new byte[32767];
            while (running) {
                int length = in.read(packet);
                if (length <= 0) continue;

                ParsedDnsQuery query = parseDnsQuery(packet, length);
                if (query == null) continue;

                if (query.domain != null && !query.domain.isEmpty()) {
                    logDomain(query.domain);
                }

                byte[] dnsResponse = resolve(query.dnsPayload);
                if (dnsResponse == null) continue;

                byte[] response = buildResponsePacket(query, dnsResponse);
                if (response != null) {
                    out.write(response);
                    out.flush();
                }
            }
        } catch (Throwable ignored) {
        } finally {
            shutdown();
        }
    }

    private void logDomain(String domain) {
        String normalized = domain.toLowerCase();
        String source = ForegroundAppResolver.recentBrowserLabel(this);
        String key = source + "|" + normalized;
        long now = System.currentTimeMillis();
        Long last = recent.get(key);
        if (last != null && now - last < 60_000L) return;
        recent.put(key, now);

        if (recent.size() > 1000) recent.clear();

        if (store != null) {
            store.append(new TimelineEvent(
                    source,
                    "NETWORK",
                    "DOMAIN",
                    "NETWORK",
                    normalized,
                    normalized,
                    "",
                    now,
                    false
            ));
        }
    }

    private byte[] resolve(byte[] dnsQuery) {
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            protect(socket);
            socket.setSoTimeout(3000);
            InetAddress resolver = InetAddress.getByName(UPSTREAM_DNS);
            socket.send(new DatagramPacket(dnsQuery, dnsQuery.length, resolver, 53));

            byte[] buffer = new byte[4096];
            DatagramPacket response = new DatagramPacket(buffer, buffer.length);
            socket.receive(response);

            byte[] exact = new byte[response.getLength()];
            System.arraycopy(response.getData(), response.getOffset(), exact, 0, response.getLength());
            return exact;
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (socket != null) socket.close();
        }
    }

    private ParsedDnsQuery parseDnsQuery(byte[] packet, int length) {
        try {
            if (length < 28) return null;
            int version = (packet[0] >> 4) & 0x0F;
            if (version != 4) return null;

            int ihl = (packet[0] & 0x0F) * 4;
            if (ihl < 20 || length < ihl + 8) return null;
            int protocol = packet[9] & 0xFF;
            if (protocol != 17) return null;

            int udp = ihl;
            int srcPort = u16(packet, udp);
            int dstPort = u16(packet, udp + 2);
            if (dstPort != 53) return null;

            int udpLength = u16(packet, udp + 4);
            int dnsOffset = udp + 8;
            int dnsLength = Math.min(udpLength - 8, length - dnsOffset);
            if (dnsLength < 12) return null;

            byte[] dns = new byte[dnsLength];
            System.arraycopy(packet, dnsOffset, dns, 0, dnsLength);

            String domain = readQueryName(dns);
            byte[] srcIp = new byte[4];
            byte[] dstIp = new byte[4];
            System.arraycopy(packet, 12, srcIp, 0, 4);
            System.arraycopy(packet, 16, dstIp, 0, 4);

            return new ParsedDnsQuery(srcPort, srcIp, dstIp, dns, domain);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private String readQueryName(byte[] dns) {
        if (dns.length < 13) return "";
        int qdCount = u16(dns, 4);
        if (qdCount < 1) return "";

        StringBuilder name = new StringBuilder();
        int pos = 12;
        while (pos < dns.length) {
            int len = dns[pos++] & 0xFF;
            if (len == 0) break;
            if ((len & 0xC0) != 0 || pos + len > dns.length) return "";
            if (name.length() > 0) name.append('.');
            for (int i = 0; i < len; i++) {
                int c = dns[pos++] & 0xFF;
                if (c < 33 || c > 126) return "";
                name.append((char) c);
            }
        }
        return name.toString();
    }

    private byte[] buildResponsePacket(ParsedDnsQuery request, byte[] dnsResponse) {
        try {
            int total = 20 + 8 + dnsResponse.length;
            byte[] out = new byte[total];

            out[0] = 0x45;
            out[1] = 0;
            put16(out, 2, total);
            put16(out, 4, 0);
            put16(out, 6, 0);
            out[8] = 64;
            out[9] = 17;

            System.arraycopy(request.dstIp, 0, out, 12, 4);
            System.arraycopy(request.srcIp, 0, out, 16, 4);
            put16(out, 10, ipChecksum(out, 0, 20));

            int udp = 20;
            put16(out, udp, 53);
            put16(out, udp + 2, request.srcPort);
            put16(out, udp + 4, 8 + dnsResponse.length);
            put16(out, udp + 6, 0); // IPv4 UDP checksum may be zero.
            System.arraycopy(dnsResponse, 0, out, udp + 8, dnsResponse.length);
            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private int ipChecksum(byte[] data, int offset, int length) {
        long sum = 0;
        for (int i = offset; i < offset + length; i += 2) {
            int hi = data[i] & 0xFF;
            int lo = (i + 1 < offset + length) ? data[i + 1] & 0xFF : 0;
            sum += (hi << 8) | lo;
            while ((sum & 0xFFFF0000L) != 0) {
                sum = (sum & 0xFFFFL) + (sum >>> 16);
            }
        }
        return (int) (~sum) & 0xFFFF;
    }

    private int u16(byte[] data, int offset) {
        return ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
    }

    private void put16(byte[] data, int offset, int value) {
        data[offset] = (byte) ((value >>> 8) & 0xFF);
        data[offset + 1] = (byte) (value & 0xFF);
    }

    private synchronized void shutdown() {
        running = false;
        if (tunnel != null) {
            try { tunnel.close(); } catch (IOException ignored) {}
            tunnel = null;
        }
        if (worker != null && worker != Thread.currentThread()) {
            worker.interrupt();
        }
        worker = null;
        stopForeground(true);
    }

    @Override
    public void onRevoke() {
        shutdown();
        stopSelf();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    private static final class ParsedDnsQuery {
        final int srcPort;
        final byte[] srcIp;
        final byte[] dstIp;
        final byte[] dnsPayload;
        final String domain;

        ParsedDnsQuery(int srcPort, byte[] srcIp, byte[] dstIp, byte[] dnsPayload, String domain) {
            this.srcPort = srcPort;
            this.srcIp = srcIp;
            this.dstIp = dstIp;
            this.dnsPayload = dnsPayload;
            this.domain = domain;
        }
    }
}
