package com.mywallet.dev;

import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.android.billingclient.api.*;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "MemoneyBilling")
public class MemoneyBillingPlugin extends Plugin {
    private static final String PRODUCT = "memoney_premium", BASE_PLAN = "annual";
    private final Handler main = new Handler(Looper.getMainLooper());
    private BillingClient client;
    private PluginCall active;
    private Runnable timeout;
    private boolean waitingForPurchase;
    private String account;

    private boolean supported() {
        return getConfig().getBoolean("enabled", false) && "com.memoney.app".equals(getContext().getPackageName()) &&
            getBridge().getConfig().getServerUrl() == null &&
            getBridge().getConfig().getPluginConfiguration("MemoneyApi").getBoolean("enabled", false);
    }
    private boolean trusted() { return MemoneyPageTrust.allowed(getBridge(), "/wallet", "/sharing"); }
    private void finish(PluginCall call, JSObject result) {
        if (active != call) return;
        if (timeout != null) main.removeCallbacks(timeout);
        active = null; waitingForPurchase = false; account = null;
        if (!trusted()) call.reject("Billing page changed", "ACCOUNT_OR_PAGE_CHANGED");
        else call.resolve(result);
    }
    private void fail(PluginCall call, String code) {
        if (active != call) return;
        if (timeout != null) main.removeCallbacks(timeout);
        active = null; waitingForPurchase = false; account = null;
        call.reject("Play billing could not complete", code);
    }
    private String errorCode(BillingResult result) {
        switch (result.getResponseCode()) {
            case BillingClient.BillingResponseCode.USER_CANCELED: return "CANCELLED";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED: return "PURCHASE_ALREADY_OWNED";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "PRODUCT_UNAVAILABLE";
            default: return "PLAY_BILLING_UNAVAILABLE";
        }
    }
    private void start(PluginCall call, Runnable operation) {
        getActivity().runOnUiThread(() -> {
            if (!supported() || !trusted()) { call.reject("Billing is not enabled for this app", "BILLING_UNAVAILABLE"); return; }
            if (active != null) { call.reject("Another billing operation is running", "BILLING_BUSY"); return; }
            active = call;
            timeout = () -> fail(call, "PLAY_BILLING_TIMEOUT"); main.postDelayed(timeout, 20000);
            try {
            if (client == null) {
                client = BillingClient.newBuilder(getContext()).setListener((result, purchases) -> main.post(() -> {
                    PluginCall pending = active;
                    if (pending == null || !waitingForPurchase) return;
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail(pending, errorCode(result)); return; }
                    finish(pending, purchaseResult(purchases, account));
                })).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                    .enableAutoServiceReconnection().build();
            }
            if (client.isReady()) operation.run();
            else client.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) { main.post(() -> {
                    if (active != call) return;
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        try { operation.run(); } catch (Exception ignored) { fail(call, "PLAY_BILLING_UNAVAILABLE"); }
                    }
                    else fail(call, errorCode(result));
                }); }
                @Override public void onBillingServiceDisconnected() { /* SDK reconnects on the next request. */ }
            });
            } catch (Exception ignored) { fail(call, "PLAY_BILLING_UNAVAILABLE"); }
        });
    }
    private JSObject purchaseResult(List<Purchase> purchases, String expectedAccount) {
        JSArray rows = new JSArray();
        if (purchases != null) for (Purchase purchase : purchases) {
            AccountIdentifiers identity = purchase.getAccountIdentifiers();
            if (!purchase.getProducts().contains(PRODUCT) || identity == null ||
                !expectedAccount.equals(identity.getObfuscatedAccountId()) || purchase.getPurchaseToken().isEmpty()) continue;
            int state = purchase.getPurchaseState();
            if (state != Purchase.PurchaseState.PURCHASED && state != Purchase.PurchaseState.PENDING) continue;
            JSObject row = new JSObject(); row.put("purchaseToken", purchase.getPurchaseToken());
            row.put("state", state == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending"); rows.put(row);
        }
        JSObject result = new JSObject(); result.put("purchases", rows); return result;
    }
    private interface ProductAction { void run(ProductDetails product, ProductDetails.SubscriptionOfferDetails offer); }
    private void queryProduct(PluginCall call, ProductAction action) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT).setProductType(BillingClient.ProductType.SUBS).build();
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build(),
            (result, details) -> main.post(() -> {
                if (active != call) return;
                if (!trusted()) { fail(call, "ACCOUNT_OR_PAGE_CHANGED"); return; }
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail(call, errorCode(result)); return; }
                for (ProductDetails item : details.getProductDetailsList()) {
                    if (!PRODUCT.equals(item.getProductId()) || item.getSubscriptionOfferDetails() == null) continue;
                    for (ProductDetails.SubscriptionOfferDetails offer : item.getSubscriptionOfferDetails()) {
                        if (!BASE_PLAN.equals(offer.getBasePlanId()) || offer.getOfferId() != null) continue;
                        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                        if (phases.size() == 1 && "P1Y".equals(phases.get(0).getBillingPeriod()) &&
                            phases.get(0).getRecurrenceMode() == ProductDetails.RecurrenceMode.INFINITE_RECURRING) {
                            try { action.run(item, offer); } catch (Exception ignored) { fail(call, "PLAY_BILLING_UNAVAILABLE"); }
                            return;
                        }
                    }
                }
                fail(call, "PRODUCT_UNAVAILABLE");
            }));
    }
    @PluginMethod public void configuration(PluginCall call) {
        getActivity().runOnUiThread(() -> { JSObject result = new JSObject();
            result.put("available", supported() && trusted()); call.resolve(result); });
    }
    @PluginMethod public void product(PluginCall call) {
        start(call, () -> queryProduct(call, (product, offer) -> {
            ProductDetails.PricingPhase phase = offer.getPricingPhases().getPricingPhaseList().get(0);
            JSObject result = new JSObject(); result.put("productId", PRODUCT); result.put("basePlanId", BASE_PLAN);
            result.put("billingPeriod", phase.getBillingPeriod()); result.put("formattedPrice", phase.getFormattedPrice());
            result.put("currency", phase.getPriceCurrencyCode()); result.put("priceMicros", phase.getPriceAmountMicros());
            finish(call, result);
        }));
    }
    @PluginMethod public void purchase(PluginCall call) {
        String requestedAccount = call.getString("accountId", "");
        if (!requestedAccount.matches("[a-f0-9]{64}")) { call.reject("An authenticated account is required", "BILLING_ACCOUNT_REQUIRED"); return; }
        start(call, () -> queryProduct(call, (product, offer) -> {
            account = requestedAccount; waitingForPurchase = true;
            // ProductDetails and offer tokens are queried again for every launch.
            BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(product).setOfferToken(offer.getOfferToken()).build();
            BillingResult result = client.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(item)).setObfuscatedAccountId(account).build());
            if (active != call) return;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) fail(call, errorCode(result));
            else if (timeout != null) main.removeCallbacks(timeout); // User confirmation can take longer than a query.
        }));
    }
    @PluginMethod public void restore(PluginCall call) {
        String requestedAccount = call.getString("accountId", "");
        if (!requestedAccount.matches("[a-f0-9]{64}")) { call.reject("An authenticated account is required", "BILLING_ACCOUNT_REQUIRED"); return; }
        start(call, () -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result, purchases) -> main.post(() -> {
                if (active != call) return;
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) fail(call, errorCode(result));
                else finish(call, purchaseResult(purchases, requestedAccount));
            })));
    }
    @PluginMethod public void manage(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!supported() || !trusted()) { call.reject("Billing is not available", "BILLING_UNAVAILABLE"); return; }
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(
                    "https://play.google.com/store/account/subscriptions?sku=" + PRODUCT + "&package=com.memoney.app")));
                call.resolve();
            } catch (Exception ignored) { call.reject("Subscription management unavailable", "PLAY_BILLING_UNAVAILABLE"); }
        });
    }
    @Override protected void handleOnDestroy() {
        main.post(() -> {
            if (active != null) fail(active, "BILLING_INTERRUPTED");
            if (client != null) { client.endConnection(); client = null; }
        });
        super.handleOnDestroy();
    }
}
