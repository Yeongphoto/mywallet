import { handleMembership } from '../../../server/billing/membership.ts';
import type { MembershipEnvironment } from '../../../server/billing/membership.ts';
export const onRequest = (context: { request: Request; env: MembershipEnvironment }) => handleMembership(context.request, context.env);
