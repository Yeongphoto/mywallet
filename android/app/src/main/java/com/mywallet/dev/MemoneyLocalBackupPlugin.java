package com.mywallet.dev;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "MemoneyLocalBackup")
public class MemoneyLocalBackupPlugin extends Plugin {
    private boolean pending;
    private boolean trustedPage() {
        String url = getBridge().getWebView().getUrl();
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        Uri configured = Uri.parse(getBridge().getConfig().getServerUrl());
        return configured.getScheme().equals(uri.getScheme()) && configured.getHost().equals(uri.getHost())
            && configured.getPort() == uri.getPort() && "/guest".equals(uri.getPath());
    }
    @PluginMethod
    public void save(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String content = call.getString("content"), name = call.getString("name"), mime = call.getString("mimeType");
            if (!trustedPage() || pending || content == null || content.length() > 20000000
                || name == null || !name.matches("[A-Za-z0-9_.-]{1,120}")
                || !("application/json".equals(mime) || "text/csv".equals(mime))) {
                call.reject("Backup unavailable", "BACKUP_UNAVAILABLE"); return;
            }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, name);
            pending = true;
            try { startActivityForResult(call, intent, "backupSaved"); }
            catch (Exception ignored) { pending = false; call.reject("Backup unavailable", "BACKUP_UNAVAILABLE"); }
        });
    }
    @ActivityCallback
    private void backupSaved(PluginCall call, ActivityResult result) {
        pending = false;
        if (call == null) return;
        Intent intent = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            call.reject("Backup cancelled", "CANCELLED"); return;
        }
        if (!trustedPage()) { call.reject("Backup unavailable", "BACKUP_UNAVAILABLE"); return; }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(intent.getData(), "wt")) {
            if (output == null) throw new IllegalStateException();
            output.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
            output.flush(); call.resolve();
        } catch (Exception ignored) { call.reject("Backup could not be saved", "BACKUP_SAVE_FAILED"); }
    }
}
