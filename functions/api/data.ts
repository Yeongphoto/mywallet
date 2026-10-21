import { sharedWalletData } from '../../server/wallet/shared-web.ts';
import type { SharedWalletEnvironment } from '../../server/wallet/shared-web.ts';
type Context = { request: Request; env: SharedWalletEnvironment };
// Every hosted financial route requires authentication and ledger membership.
// Never expose the legacy unscoped handler when configuration is unavailable.
export const onRequestGet = (context: Context) => sharedWalletData(context.request, context.env);
export const onRequestPatch = (context: Context) => sharedWalletData(context.request, context.env);
export const onRequestPost = (context: Context) => sharedWalletData(context.request, context.env);
