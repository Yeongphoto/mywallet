import { handleBilling } from '../../../server/billing/http.ts';
import type { BillingEnvironment } from '../../../server/billing/http.ts';

export const onRequest = (context: { request: Request; env: BillingEnvironment; params: { action?: string | string[] } }) =>
  handleBilling(context.request, context.env, typeof context.params.action === 'string' ? context.params.action : '');
