import { handleRecovery } from '../../../server/wallet/recovery.ts';
export const onRequest = (context: {request:Request;env:import('../../../server/wallet/shared-web.ts').SharedWalletEnvironment}) => handleRecovery(context.request,context.env);
