package com.mywallet.dev;

import android.net.Uri;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "MemoneyGoogleAuth")
public class MemoneyGoogleAuthPlugin extends Plugin {
    private CancellationSignal pending;

    // Only the configured test app origin can use native Google credentials.
    private boolean trustedPage() {
        String url = getBridge().getWebView().getUrl();
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        Uri configured = Uri.parse(getBridge().getConfig().getServerUrl());
        return configured.getScheme().equals(uri.getScheme()) && configured.getHost().equals(uri.getHost())
            && configured.getPort() == uri.getPort()
            && ("/signin".equals(uri.getPath()) || "/wallet".equals(uri.getPath()) || "/sharing".equals(uri.getPath()) || "/guest".equals(uri.getPath()));
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String nonce = call.getString("nonce", "");
            String clientId = call.getString("clientId", "");
            String configuredId = getConfig().getString("webClientId", "");
            if (!trustedPage() || configuredId.isEmpty() || !configuredId.equals(clientId)
                || !nonce.matches("[a-f0-9]{64}")) {
                call.reject("Sign-in configuration unavailable", "CONFIGURATION");
                return;
            }
            if (pending != null) {
                call.reject("Sign-in already in progress", "BUSY");
                return;
            }
            CancellationSignal signal = new CancellationSignal();
            pending = signal;
            try {
                GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(configuredId)
                    .setNonce(nonce).build();
                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(option).build();
                CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request, signal,
                    ContextCompat.getMainExecutor(getContext()),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse result) {
                            pending = null;
                            if (signal.isCanceled() || !trustedPage()) {
                                call.reject("Sign-in cancelled", "CANCELLED");
                                return;
                            }
                            try {
                                Credential credential = result.getCredential();
                                if (!(credential instanceof CustomCredential)
                                    || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                    call.reject("Unsupported credential", "INVALID_CREDENTIAL");
                                    return;
                                }
                                String idToken = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                                JSObject response = new JSObject();
                                response.put("idToken", idToken);
                                // Transient bridge response only. Never persist or log credentials.
                                call.resolve(response);
                            } catch (Exception ignored) {
                                call.reject("Invalid credential", "INVALID_CREDENTIAL");
                            }
                        }
                        @Override
                        public void onError(GetCredentialException error) {
                            pending = null;
                            String code = error instanceof GetCredentialCancellationException ? "CANCELLED"
                                : error instanceof NoCredentialException ? "NO_CREDENTIAL" : "SIGN_IN_FAILED";
                            call.reject("Google sign-in unavailable", code);
                        }
                    });
            } catch (Exception ignored) {
                pending = null;
                call.reject("Google sign-in unavailable", "SIGN_IN_FAILED");
            }
        });
    }

    @PluginMethod
    public void clearCredentialState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!trustedPage()) {
                call.reject("Sign-in configuration unavailable", "CONFIGURATION");
                return;
            }
            try {
                CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(),
                    null, ContextCompat.getMainExecutor(getContext()),
                    new CredentialManagerCallback<Void, ClearCredentialException>() {
                        @Override public void onResult(Void result) { call.resolve(); }
                        @Override public void onError(ClearCredentialException error) {
                            call.reject("Credential state unavailable", "CLEAR_FAILED");
                        }
                    });
            } catch (Exception ignored) { call.reject("Credential state unavailable", "CLEAR_FAILED"); }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (pending != null) pending.cancel();
        pending = null;
    }
}
