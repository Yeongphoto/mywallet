// Exact OAuth clients only. This does not change the shared Web audience,
// Google subject identity, ledger ownership or any financial data.
export function androidAuthorizedParties(env: { AUTH_GOOGLE_ANDROID_CLIENT_ID?: string; AUTH_GOOGLE_ANDROID_CLIENT_IDS?: string }): string[] | null {
  const parties = [env.AUTH_GOOGLE_ANDROID_CLIENT_ID,
    ...(env.AUTH_GOOGLE_ANDROID_CLIENT_IDS === undefined ? [] : env.AUTH_GOOGLE_ANDROID_CLIENT_IDS.split(','))]
    .filter((value): value is string => value !== undefined);
  if (parties.length > 10 || parties.some(value => !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value))) return null;
  return [...new Set(parties)];
}
