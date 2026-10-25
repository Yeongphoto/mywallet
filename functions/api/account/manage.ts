import { handleAccountManagement } from '../../../server/billing/account-management.ts';
import type { MembershipEnvironment } from '../../../server/billing/membership.ts';
export const onRequest = (context: { request: Request; env: MembershipEnvironment }) => handleAccountManagement(context.request,context.env);
