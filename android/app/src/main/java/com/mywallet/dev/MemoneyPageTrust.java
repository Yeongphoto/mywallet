package com.mywallet.dev;

import android.net.Uri;
import com.getcapacitor.Bridge;
import java.util.Arrays;

final class MemoneyPageTrust {
    static boolean allowed(Bridge bridge, String... paths) {
        String current = bridge.getWebView().getUrl();
        if (current == null) return false;
        String server = bridge.getConfig().getServerUrl();
        if (server == null) {
            if (!bridge.getConfig().getPluginConfiguration("MemoneyApi").getBoolean("enabled", false)) return false;
            server = bridge.getLocalUrl();
        }
        if (server == null) return false;
        Uri expected = Uri.parse(server), actual = Uri.parse(current);
        return expected.getScheme() != null && expected.getScheme().equals(actual.getScheme())
            && expected.getHost() != null && expected.getHost().equals(actual.getHost())
            && expected.getPort() == actual.getPort() && actual.getUserInfo() == null
            && Arrays.asList(paths).contains(actual.getPath());
    }
}
