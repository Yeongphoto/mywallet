export type TransactionType = 'income' | 'expense' | 'transfer';

export interface CategoryOption {
  id: string;
  label: string;
  color?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string;
  amount: number;
  title: string;
  category: string;
  assetId?: string | null;
  toAssetId?: string | null;
  recurringRuleId?: string | null;
}

export interface AssetItem {
  id: string;
  category: string;
  amount: number;
  memo: string;
}

export interface TransactionFormState {
  date: string;
  amount: string;
  title: string;
  category: string;
  assetId?: string;
  toAssetId?: string;
}

export interface AssetFormState {
  category: string;
  amount: string;
  memo: string;
}

export interface Budget {
  amount: number;
}

export type Theme = 'light' | 'dark';

export type EntryType = 'expense' | 'income' | 'transfer';

export interface UnifiedFormState {
  type: EntryType;
  date: string;
  amount: string;
  title: string;
  category: string;
  assetId: string;
  toAssetId: string;
}

export interface CategoryPlan {
  category: string;
  type: TransactionType;
  plannedAmount: number;
}

export interface RecurringRule {
  id: string;
  type: TransactionType;
  day: number;
  amount: number;
  title: string;
  category: string;
  assetId?: string | null;
  toAssetId?: string | null;
  startMonth: string; // YYYY-MM
  endMonth: string | null; // YYYY-MM
}
