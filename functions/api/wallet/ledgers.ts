import { handleLedgers } from '../../../server/wallet/shared-creation.ts';
export const onRequest = (context: {request: Request; env: import('../../../server/wallet/shared-web.ts').SharedWalletEnvironment}) => handleLedgers(context.request,context.env);
