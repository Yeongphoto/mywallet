import { hasAnnualPremium } from './annual.ts';
import type { VerifiedAnnualSubscription } from './annual.ts';

export const freeLimits = Object.freeze({ assetsPerLedger: 10, entriesPerAccountDay: 10, entriesPerReward: 10 });

// Access/owner IDs and counters must come from authenticated server state.
// This policy never replaces ledger membership checks or writes financial data.
export function monetizationPolicy({ actorUserId, ledgerOwnerUserId, ledgerAssetCount, entriesUsedToday,
  verifiedRewardsToday, purchases, now = Date.now() }: {
    actorUserId: string; ledgerOwnerUserId: string; ledgerAssetCount: number; entriesUsedToday: number;
    verifiedRewardsToday: number; purchases: readonly VerifiedAnnualSubscription[]; now?: number;
  }) {
  for (const value of [ledgerAssetCount, entriesUsedToday, verifiedRewardsToday]) {
    if (!Number.isSafeInteger(value) || value < 0) throw Error('INVALID_MONETIZATION_COUNTER');
  }
  const freeDailyLimit = freeLimits.entriesPerAccountDay + verifiedRewardsToday * freeLimits.entriesPerReward;
  if (!Number.isSafeInteger(freeDailyLimit)) throw Error('INVALID_MONETIZATION_COUNTER');
  const ownerPremium = hasAnnualPremium(ledgerOwnerUserId, purchases, now);
  const actorPremium = hasAnnualPremium(actorUserId, purchases, now);
  const assetLimit = ownerPremium ? null : freeLimits.assetsPerLedger;
  const dailyEntryLimit = actorPremium ? null : freeDailyLimit;
  const entriesRemaining = dailyEntryLimit === null ? null : Math.max(0, dailyEntryLimit - entriesUsedToday);
  return Object.freeze({
    actorPlan: actorPremium ? 'premium_yearly' as const : 'free' as const,
    ledgerAssetPlan: ownerPremium ? 'premium_yearly' as const : 'free' as const,
    assetLimit, canCreateAsset: assetLimit === null || ledgerAssetCount < assetLimit,
    dailyEntryLimit, entriesRemaining, canCreateEntry: entriesRemaining === null || entriesRemaining > 0,
    adsEnabled: !actorPremium, rewardRequiredForNextEntry: entriesRemaining === 0,
    restrictExistingRecords: false, preserveExistingRecords: true,
  });
}
