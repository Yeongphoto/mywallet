type Deployment = {
  AUTH_ORIGIN?: string;
  AUTH_LOCAL_DEV?: string;
  AUTH_SHARED_TEST_DEPLOYMENT?: string;
  AUTH_RELEASE_DEPLOYMENT?: string;
};

// Keep the legacy isolation flag until its bindings/markers are migrated as a
// separate change. Never infer production permission from a pages.dev suffix.
export function hostedWalletDeployment(env: Deployment) {
  if (env.AUTH_LOCAL_DEV === 'true' || env.AUTH_SHARED_TEST_DEPLOYMENT !== 'true') return false;
  if (env.AUTH_ORIGIN === 'https://memoney-android-test.pages.dev') return env.AUTH_RELEASE_DEPLOYMENT !== 'true';
  return env.AUTH_RELEASE_DEPLOYMENT === 'true' && env.AUTH_ORIGIN === 'https://memoney-6r5.pages.dev';
}
