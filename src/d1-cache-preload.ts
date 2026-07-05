const D1_CACHE_STORAGE_KEY = 'mywallet:v2';
const D1_CACHE_BACKUP_KEY = 'mywallet:v2:pre-d1-backup';
const D1_CACHE_BACKUP_PREFIX = 'mywallet:v2:backup:';

type WalletPayload = {
  transactions?: unknown[];
  assets?: unknown[];
  customExpenseCategories?: unknown[];
  customIncomeCategories?: unknown[];
  customAssetCategories?: unknown[];
  categoryColors?: Record<string, unknown>;
  categoryOrder?: Record<string, unknown>;
  hiddenCategories?: Record<string, unknown>;
  recurringRules?: unknown[];
  deletedRecurringTxs?: unknown[];
  updatedAt?: number;
  error?: string;
  [key: string]: unknown;
};

function hasRemoteWalletData(data: WalletPayload) {
  return (
    (Array.isArray(data.transactions) && data.transactions.length > 0) ||
    (Array.isArray(data.assets) && data.assets.length > 0) ||
    (Array.isArray(data.customExpenseCategories) && data.customExpenseCategories.length > 0) ||
    (Array.isArray(data.customIncomeCategories) && data.customIncomeCategories.length > 0) ||
    (Array.isArray(data.customAssetCategories) && data.customAssetCategories.length > 0) ||
    (data.categoryColors && typeof data.categoryColors === 'object' && Object.keys(data.categoryColors).length > 0) ||
    (data.categoryOrder && typeof data.categoryOrder === 'object' && Object.keys(data.categoryOrder).length > 0) ||
    (data.hiddenCategories && typeof data.hiddenCategories === 'object' && Object.keys(data.hiddenCategories).length > 0) ||
    (Array.isArray(data.recurringRules) && data.recurringRules.length > 0) ||
    (Array.isArray(data.deletedRecurringTxs) && data.deletedRecurringTxs.length > 0) ||
    Number(data.updatedAt) > 0
  );
}

function hasLocalWalletData(raw: string | null) {
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as WalletPayload;
    return hasRemoteWalletData(data);
  } catch {
    return false;
  }
}

function backupCurrentLocalCache() {
  const current = window.localStorage.getItem(D1_CACHE_STORAGE_KEY);
  if (!hasLocalWalletData(current)) return;

  const previousBackup = window.localStorage.getItem(D1_CACHE_BACKUP_KEY);
  if (previousBackup !== current) {
    window.localStorage.setItem(D1_CACHE_BACKUP_KEY, current!);
    window.localStorage.setItem(`${D1_CACHE_BACKUP_PREFIX}${Date.now()}`, current!);
  }
}

export async function preloadD1Cache() {
  if (typeof window === 'undefined') return;

  try {
    const response = await window.fetch('/api/data', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-store',
      },
    });

    if (!response.ok) return;
    const data = await response.json() as WalletPayload;
    if (!data || data.error || !hasRemoteWalletData(data)) return;

    backupCurrentLocalCache();
    window.localStorage.setItem(D1_CACHE_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('mywallet:d1-cache-preloaded', { detail: data }));
  } catch {
    // Local cache remains available when offline or when D1 is temporarily unreachable.
  }
}
