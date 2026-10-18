import { handleAuth } from '../../../server/auth/http.ts';
import type { AuthEnvironment } from '../../../server/auth/http.ts';

export const onRequest = (context: { request: Request; env: AuthEnvironment; params: { action?: string | string[] } }) =>
  handleAuth(context.request, context.env, typeof context.params.action === 'string' ? context.params.action : '');
