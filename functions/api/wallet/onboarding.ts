import { handlePersonalOnboarding } from '../../../server/wallet/personal.ts';
import type { SharedWalletEnvironment } from '../../../server/wallet/shared-web.ts';
export const onRequest = (context:{request:Request;env:SharedWalletEnvironment}) => handlePersonalOnboarding(context.request,context.env);
