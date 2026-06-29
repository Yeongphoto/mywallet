export type TransactionType = 'income' | 'expense';

export type TransactionCategory =
  | 'salary'
  | 'food'
  | 'transport'
  | 'housing'
  | 'shopping'
  | 'saving'
  | 'etc';

export interface Transaction {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  title: string;
  amount: number;
  date: string;
  memo?: string;
}

export interface Budget {
  category: TransactionCategory;
  label: string;
  limit: number;
}
