// Server-owned account grants. These survive public rollout and app updates.
// IDs are authenticated Google-subject-backed users, never client-supplied roles.
// This registry grants membership benefits, not access to other users' ledgers.
const administrators = new Set(['18f5a8d3-2561-4083-bbac-2ffb67f15da6']);
export type AccountBenefit = 'premium_admin' | 'premium_tester';

export function accountBenefit(userId: string): AccountBenefit | null {
  if (administrators.has(userId)) return 'premium_admin';
  return null;
}
