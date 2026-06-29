export type TransactionType = 'income' | 'expense';

export interface CategoryOption {
  id: string;
  label: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string;
  amount: number;
  title: string;
  category: string;
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
}

export interface AssetFormState {
  category: string;
  amount: string;
  memo: string;
}
