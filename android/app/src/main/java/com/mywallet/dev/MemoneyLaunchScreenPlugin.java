package com.mywallet.dev;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MemoneyLaunchScreen")
public class MemoneyLaunchScreenPlugin extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                getBridge().getWebView().postVisualStateCallback(0, new android.webkit.WebView.VisualStateCallback() {
                    @Override public void onComplete(long requestId) {
                        ((MainActivity) getActivity()).finishLaunch();
                    }
                });
            }
            call.resolve();
        });
    }
}
