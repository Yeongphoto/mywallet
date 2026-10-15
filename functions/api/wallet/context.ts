import { sharedWalletContext } from '../../../server/wallet/shared-web.ts';
import type { SharedWalletEnvironment } from '../../../server/wallet/shared-web.ts';

export const onRequestGet = (context: { request: Request; env: SharedWalletEnvironment }) =>
  sharedWalletContext(context.request, context.env);
