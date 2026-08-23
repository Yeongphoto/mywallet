export type TransactionType = 'income' | 'expense' | 'transfer';

export interface CategoryOption {
  id: string;
  label: string;
  color?: string;
  kind?: 'asset' | 'liability';
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string;
  time?: string | null;
  amount: number;
  title: string;
  category: string;
  createdAt?: number | null;
  assetId?: string | null;
  toAssetId?: string | null;
  recurringRuleId?: string | null;
  installmentGroupId?: string | null;
  installmentIndex?: number | null;
  installmentMonths?: number | null;
  cardSettlementId?: string | null;
  revision?: number;
}

export interface CardSettlement {
  id: string;
  cardAssetId: string;
  paymentAssetId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  transactionId: string;
  settledAt: number;
}

export interface AssetItem {
  id: string;
  // category is the parent asset group id (kept for backward compatibility).
  category: string;
  // name is the individual asset title shown in the ledger and asset list.
  name?: string;
  amount: number;
  memo: string;
  revision?: number;
  sortOrder?: number;
  // Both values are optional. When absent, the asset is tracked as a simple running balance.
  cardCycleStartDay?: number | null;
  cardCycleEndDay?: number | null;
  cardPaymentDay?: number | null;
  cardPaymentAssetId?: string | null;
}

export interface TransactionFormState {
  date: string;
  time?: string;
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

export type Theme = 'system' | 'light' | 'dark';

export type EntryType = 'expense' | 'income' | 'transfer';

export interface UnifiedFormState {
  type: EntryType;
  date: string;
  time: string;
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
  time?: string | null;
  amount: number;
  title: string;
  category: string;
  assetId?: string | null;
  toAssetId?: string | null;
  startMonth: string; // YYYY-MM
  endMonth: string | null; // YYYY-MM
}
