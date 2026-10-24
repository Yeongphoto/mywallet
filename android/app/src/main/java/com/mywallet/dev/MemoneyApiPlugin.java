package com.mywallet.dev;

import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.webkit.CookieManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.CookieHandler;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "MemoneyApi")
public class MemoneyApiPlugin extends Plugin {
    private final ExecutorService queue = Executors.newSingleThreadExecutor();
    private CookieHandler previousCookies;
    private CookieHandler scopedCookies;
    private static final List<String> ENDPOINTS = Arrays.asList(
        "/api/data", "/api/auth/config", "/api/auth/session", "/api/auth/challenge", "/api/auth/google", "/api/auth/logout",
        "/api/auth/browser-start", "/api/auth/browser-preview", "/api/auth/browser-approve", "/api/auth/browser-poll", "/api/auth/browser-claim",
        "/api/wallet/context", "/api/wallet/sharing", "/api/wallet/ledgers", "/api/wallet/onboarding", "/api/wallet/recovery"
    );
    private String origin() {
        if (!getConfig().getBoolean("enabled", false) || getBridge().getConfig().getServerUrl() != null) return null;
        String value = getConfig().getString("origin", "");
        if ("https://memoney-6r5.pages.dev".equals(value) && "com.memoney.app".equals(getContext().getPackageName())) return value;
        boolean debug = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debug && "com.memoney.probe".equals(getContext().getPackageName()) &&
            getConfig().getBoolean("allowLocalProbe", false) && "http://127.0.0.1:5198".equals(value)) return value;
        return null;
    }
    private boolean trusted() {
        return MemoneyPageTrust.allowed(getBridge(), "/", "/guest", "/signin", "/wallet", "/sharing");
    }
    @Override public void load() {
        if (origin() == null) return;
        previousCookies = CookieHandler.getDefault();
        scopedCookies = new CookieHandler() {
            private boolean backend(URI uri) {
                return uri != null && origin() != null && URI.create(origin()).getAuthority().equals(uri.getAuthority())
                    && URI.create(origin()).getScheme().equals(uri.getScheme());
            }
            @Override public Map<String, List<String>> get(URI uri, Map<String, List<String>> headers) throws java.io.IOException {
                if (!backend(uri)) return previousCookies == null ? Collections.emptyMap() : previousCookies.get(uri, headers);
                String value = CookieManager.getInstance().getCookie(uri.toString());
                return value == null ? Collections.emptyMap() : Collections.singletonMap("Cookie", Collections.singletonList(value));
            }
            @Override public void put(URI uri, Map<String, List<String>> headers) throws java.io.IOException {
                if (!backend(uri)) { if (previousCookies != null) previousCookies.put(uri, headers); return; }
                for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                    if (entry.getKey() != null && "set-cookie".equalsIgnoreCase(entry.getKey())) {
                        for (String value : entry.getValue()) storeCookie(uri.toString(), value);
                    }
                }
            }
        };
        // The framework's default handler also copies host-only cookies to the
        // local app origin. For this one backend, use a host-only handler and
        // let HttpURLConnection attach cookies exactly once.
        CookieHandler.setDefault(scopedCookies);
    }
    private void storeCookie(String url, String value) throws java.io.IOException {
        CountDownLatch stored = new CountDownLatch(1);
        AtomicBoolean accepted = new AtomicBoolean(false);
        getActivity().runOnUiThread(() -> CookieManager.getInstance().setCookie(url, value, success -> {
            accepted.set(success); stored.countDown();
        }));
        try {
            if (!stored.await(5, TimeUnit.SECONDS) || !accepted.get()) throw new java.io.IOException("Cookie storage unavailable");
        } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new java.io.IOException("Cookie storage interrupted"); }
        CookieManager.getInstance().flush();
    }
    @PluginMethod
    public void configuration(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("enabled", trusted() && origin() != null);
            call.resolve(result);
        });
    }
    @PluginMethod
    public void request(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String backend = origin();
            String path = call.getString("path", ""), method = call.getString("method", "");
            Uri endpoint = Uri.parse(path);
            JSObject headers = call.getObject("headers", new JSObject());
            String body = call.getString("body", "");
            if (!trusted() || backend == null || endpoint.isAbsolute() || !path.startsWith("/api/") || path.length() > 4096 ||
                endpoint.getFragment() != null || endpoint.getEncodedPath() == null || !endpoint.getEncodedPath().equals(endpoint.getPath()) ||
                !ENDPOINTS.contains(endpoint.getPath()) || !Arrays.asList("GET", "POST", "PATCH").contains(method) ||
                ("GET".equals(method) && !body.isEmpty()) || body.getBytes(StandardCharsets.UTF_8).length > 20_000_000) {
                call.reject("API request rejected", "API_REJECTED"); return;
            }
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next(), value = headers.optString(key, "");
                if (!Arrays.asList("content-type", "accept", "cache-control", "x-memoney-ledger", "x-memoney-generation").contains(key.toLowerCase(java.util.Locale.ROOT)) ||
                    value.length() > 256 || value.contains("\r") || value.contains("\n")) {
                    call.reject("API header rejected", "API_REJECTED"); return;
                }
            }
            queue.execute(() -> perform(call, backend, path, method, headers, body));
        });
    }
    private void perform(PluginCall call, String backend, String path, String method, JSObject headers, String body) {
        HttpURLConnection connection = null;
        try {
            URL target = new URL(backend + path);
            connection = (HttpURLConnection) target.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10_000); connection.setReadTimeout(20_000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Origin", backend);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) { String key = keys.next(); connection.setRequestProperty(key, headers.getString(key)); }
            if (!body.isEmpty()) {
                connection.setDoOutput(true);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalStateException("Redirect rejected");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream != null) try (InputStream input = stream) {
                byte[] block = new byte[8192]; int length;
                while ((length = input.read(block)) != -1) {
                    if (bytes.size() + length > 32_000_000) throw new IllegalStateException("Response too large");
                    bytes.write(block, 0, length);
                }
            }
            JSObject safeHeaders = new JSObject();
            for (String name : Arrays.asList("Content-Type", "Cache-Control", "X-Memoney-Generation")) {
                String value = connection.getHeaderField(name);
                if (value != null) safeHeaders.put(name, value);
            }
            JSObject result = new JSObject(); result.put("status", status);
            result.put("headers", safeHeaders); result.put("body", new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception ignored) { call.reject("API unavailable; request was not automatically retried", "NETWORK"); }
        finally { if (connection != null) connection.disconnect(); }
    }
    @Override protected void handleOnDestroy() {
        queue.shutdownNow();
        if (scopedCookies != null && CookieHandler.getDefault() == scopedCookies) CookieHandler.setDefault(previousCookies);
    }
}
