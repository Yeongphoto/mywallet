package com.mywallet.dev;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean launchReady = false;
    public void finishLaunch() { launchReady = true; }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        long launchDeadline = android.os.SystemClock.elapsedRealtime() + 30000;
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !launchReady && android.os.SystemClock.elapsedRealtime() < launchDeadline);
        splash.setOnExitAnimationListener(view -> view.remove());
        registerPlugin(MemoneyLaunchScreenPlugin.class);
        registerPlugin(MemoneyApiPlugin.class);
        bridgeBuilder.addWebViewListener(new com.getcapacitor.WebViewListener() {
            @Override public void onPageLoaded(android.webkit.WebView view) {
                if (view.getUrl() != null && view.getUrl().endsWith("/android-unavailable.html")) finishLaunch();
            }
        });
        registerPlugin(MemoneyGoogleAuthPlugin.class);
        registerPlugin(MemoneyLocalBackupPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(getResources().getColor(R.color.memoney_launch_background, getTheme()));
    }
}
