type ReleaseEnvironment = {
  AUTH_RELEASE_DEPLOYMENT?: string;
  AUTH_ORIGIN?: string;
  AUTH_ENABLED?: string;
  AUTH_PERSONAL_ONBOARDING?: string;
};

// Only the generated release runtime installs this gate. Existing origins keep
// their current behavior until the coordinated onboarding rollout is approved.
export function releaseGate(request: Request, env: ReleaseEnvironment): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  if (env.AUTH_RELEASE_DEPLOYMENT === 'true' && env.AUTH_ORIGIN === 'https://memoney-6r5.pages.dev' &&
      url.origin === env.AUTH_ORIGIN && env.AUTH_ENABLED === 'true' && env.AUTH_PERSONAL_ONBOARDING === 'true') return null;
  return Response.json({ error: 'RELEASE_NOT_READY' }, { status: 503,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Retry-After': '300' } });
}
