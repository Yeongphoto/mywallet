import { onRequestGet as legacyGet, onRequestPatch as legacyPatch, onRequestPost as legacyPost } from '../../server/wallet/legacy-data.ts';
import { sharedWalletData } from '../../server/wallet/shared-web.ts';
import type { SharedWalletEnvironment } from '../../server/wallet/shared-web.ts';
type Context = { request: Request; env: SharedWalletEnvironment };
// Enabled deployments never fall back to the unscoped financial handler.
const enabled = (env: SharedWalletEnvironment) => env.AUTH_ENABLED === 'true' || env.AUTH_WEB_WALLETS === 'true';
export const onRequestGet = (context: Context) => enabled(context.env) ? sharedWalletData(context.request, context.env) : legacyGet(context);
export const onRequestPatch = (context: Context) => enabled(context.env) ? sharedWalletData(context.request, context.env) : legacyPatch(context);
export const onRequestPost = (context: Context) => enabled(context.env) ? sharedWalletData(context.request, context.env) : legacyPost();
