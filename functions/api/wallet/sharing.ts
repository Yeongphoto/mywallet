import { handleSharing } from '../../../server/wallet/invitations.ts';
import type { SharedWalletEnvironment } from '../../../server/wallet/shared-web.ts';

export const onRequest = (context: { request: Request; env: SharedWalletEnvironment }) => handleSharing(context.request, context.env);
