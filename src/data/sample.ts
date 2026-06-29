import type { Budget, Transaction } from '../types';

export const transactions: Transaction[] = [];

export const budgets: Budget[] = [];

export const categoryLabels: Record<string, string> = {
  salary: '수입',
  food: '식비',
  transport: '교통',
  housing: '주거',
  shopping: '쇼핑',
  saving: '저축',
  etc: '기타'
};
