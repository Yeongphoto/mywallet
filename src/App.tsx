import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { DragEvent, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import type { AssetItem, CardSettlement, CategoryOption, Transaction, UnifiedFormState, EntryType, TransactionType, CategoryPlan, RecurringRule } from './types';
import { importEasyMoneyCsv } from './easyMoneyImporter';

const expenseCategories: CategoryOption[] = [
  { id: 'food', label: '음식', color: '#ef4444' },
  { id: 'daily', label: '생필품', color: '#f97316' },
  { id: 'saving', label: '저축', color: '#2563eb' },
  { id: 'utility', label: '공공요금', color: '#0891b2' },
  { id: 'subscription', label: '월정료', color: '#7c3aed' },
  { id: 'medical', label: '의료', color: '#db2777' },
  { id: 'housing', label: '주거', color: '#475569' },
  { id: 'transport', label: '교통', color: '#16a34a' },
  { id: 'personal', label: '개인', color: '#0f766e' },
  { id: 'travel', label: '여행', color: '#0284c7' },
  { id: 'etc', label: '기타', color: '#64748b' },
];

const incomeCategories: CategoryOption[] = [
  { id: 'salary', label: '급여', color: '#059669' },
  { id: 'bonus', label: '보너스', color: '#0ea5e9' },
  { id: 'interest', label: '이자', color: '#6366f1' },
  { id: 'etc', label: '기타', color: '#64748b' },
];

const assetCategories: CategoryOption[] = [
  { id: 'card', label: '\uCE74\uB4DC', color: '#f97316' },
  { id: 'bank', label: '\uC740\uD589', color: '#10b981' },
  { id: 'saving', label: '\uC801\uAE08', color: '#14b8a6' },
  { id: 'etc', label: '\uAE30\uD0C0', color: '#64748b' },
];

const STORAGE_KEY = 'mywallet:v2';
const PENDING_SYNC_KEY = 'mywallet:v2:pendingSyncAt';
const PENDING_TRANSACTION_OPERATIONS_KEY = 'mywallet:v2:pendingTransactionOperations';
const SYNC_CURSOR_KEY = 'mywallet:v2:syncCursor';
const MONTH_PICKER_YEAR_START = 2000;
const MONTH_PICKER_YEAR_END = 2100;
const MONTH_PICKER_ROW_HEIGHT = 38;
const OPENING_BALANCE_CATEGORY = '\uAE30\uCD08\uC794\uC561';
const categoryColorPresets = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#2563eb', '#6366f1', '#7c3aed', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#db2777', '#64748b',
];

type NoticeType = 'info' | 'success' | 'warning' | 'error';
type CategoryScope = TransactionType | 'asset';
type CategoryColorMap = Record<string, string>;
type CategoryLabelMap = Record<string, string>;
type CategoryBudgetExcludedMap = Record<string, boolean>;
type CategoryOrderMap = Partial<Record<CategoryScope, string[]>>;
type HiddenCategoryMap = Record<string, boolean>;
type HiddenAssetMap = Record<string, boolean>;
type AppTab = 'summary' | 'asset' | 'plan' | 'calendar' | 'ledger' | 'settings';
type AppIconName = 'dashboard' | 'asset' | 'plan' | 'calendar' | 'ledger' | 'settings' | 'plus' | 'edit' | 'chevronLeft' | 'chevronRight' | 'eye' | 'eyeOff';
type RemoteSyncStatus = 'checking' | 'pending' | 'saving' | 'synced' | 'stale' | 'error';
type ThemePreference = 'system' | 'light' | 'dark';
type FlowSegment = { id: string; label: string; value: number; color: string };

const SYNC_OVERLAY_MIN_DURATION = 2000;
const LOADING_ORBIT_DURATION = 1200;

interface NoticeState {
  id: number;
  type: NoticeType;
  title: string;
  message: string;
}

interface ConfirmState {
  title: string;
  message: string;
  warningNote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

interface RemoteSyncState {
  status: RemoteSyncStatus;
  localUpdatedAt?: number;
  remoteUpdatedAt?: number;
  checkedAt?: number;
  message: string;
}

function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  const paths: Record<AppIconName, string[]> = {
    dashboard: ['M4 13h4v7H4z', 'M10 4h4v16h-4z', 'M16 9h4v11h-4z'],
    asset: ['M5 8h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z', 'M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M4 11h16'],
    plan: ['M4 19V5', 'M4 19h16', 'M7 15l3-4 3 2 5-7'],
    calendar: ['M7 3v3', 'M17 3v3', 'M4 8h16', 'M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
    ledger: ['M6 3h9l3 3v15H6z', 'M15 3v4h4', 'M8 12h8', 'M8 16h8', 'M8 8h4'],
    settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .4.2.76.6 1 .3.25.7.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6z'],
    plus: ['M12 5v14', 'M5 12h14'],
    edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
    chevronLeft: ['M15 18l-6-6 6-6'],
    chevronRight: ['M9 18l6-6-6-6'],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    eyeOff: ['M3 3l18 18', 'M10.6 10.6A3 3 0 0 0 13.4 13.4', 'M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-3.2 4.4', 'M6.6 6.6C3.6 8.4 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 4.1-.8'],
  };

  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function MyWalletLogo({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <img 
      src="/logo.png" 
      alt="MyWallet 로고" 
      className={`mywallet-logo ${className}`} 
      style={{ 
        objectFit: 'contain',
        ...style 
      }} 
    />
  );
}

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

interface CategoryOrderSyncPayload {
  type: CategoryScope;
  categoryOrder: CategoryOrderMap;
  categoryLabels: CategoryLabelMap;
  revision: number;
}

function isCategoryOrderSyncPayload(value: unknown): value is CategoryOrderSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CategoryOrderSyncPayload>;
  return (payload.type === 'asset' || payload.type === 'expense' || payload.type === 'income')
    && Boolean(payload.categoryOrder && typeof payload.categoryOrder === 'object')
    && Boolean(payload.categoryLabels && typeof payload.categoryLabels === 'object')
    && Number.isInteger(payload.revision);
}

function isTransaction(value: unknown): value is Transaction {
  return Boolean(value && typeof value === 'object' && typeof (value as Transaction).id === 'string'
    && typeof (value as Transaction).type === 'string' && typeof (value as Transaction).date === 'string');
}

interface PendingTransactionOperation {
  operationId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  status: 'retry' | 'conflict';
}

interface SyncRunResult {
  appliedChanges: number;
  replayedOperations: number;
  conflictedOperations: number;
  pendingOperations: number;
  blocked: boolean;
}

function readPendingTransactionOperations(): PendingTransactionOperation[] {
  try {
    const value = window.localStorage.getItem(PENDING_TRANSACTION_OPERATIONS_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((operation): operation is PendingTransactionOperation =>
      typeof operation?.operationId === 'string' && operation.payload && typeof operation.payload === 'object'
    ) : [];
  } catch {
    return [];
  }
}

function writePendingTransactionOperations(operations: PendingTransactionOperation[]) {
  try {
    if (operations.length === 0) {
      window.localStorage.removeItem(PENDING_TRANSACTION_OPERATIONS_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_TRANSACTION_OPERATIONS_KEY, JSON.stringify(operations));
  } catch {
    // A storage failure must not change server mutation behavior.
  }
}

function updatePendingTransactionOperation(operationId: string, update?: Partial<PendingTransactionOperation>) {
  const pending = readPendingTransactionOperations();
  const index = pending.findIndex((operation) => operation.operationId === operationId);
  if (index < 0 && update) {
    pending.push({ operationId, payload: update.payload || {}, createdAt: update.createdAt || Date.now(), status: update.status || 'retry' });
  } else if (index >= 0 && update) {
    pending[index] = { ...pending[index], ...update };
  } else if (index >= 0) {
    pending.splice(index, 1);
  }
  writePendingTransactionOperations(pending);
}

function getCurrentTransactionDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function getCurrentTransactionTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function getCurrentMonth() {
  return getToday().slice(0, 7);
}

function getNextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextDate = new Date(year, monthNumber, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const previousDate = new Date(year, monthNumber - 2, 1);
  return `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function addMonthsToTransactionDate(date: string, monthsToAdd: number) {
  const [year, month, day] = date.split('-').map(Number);
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function getPrivacyDisplayAmount(value: number) {
  const absoluteValue = Math.abs(Math.trunc(value));
  if (absoluteValue === 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(absoluteValue));
  const seed = String(absoluteValue).split('').reduce((hash, digit) => ((hash * 31) + digit.charCodeAt(0)) >>> 0, 2166136261);
  const alternate = magnitude + (seed % (9 * magnitude));
  return value < 0 ? -alternate : alternate;
}

function formatMobileCalendarAmount(amount: number) {
  return numberFormatter.format(amount).replace(/,(?=\d{3}$)/, ' ,​'.trimStart());
}

function formatNumberInput(value: number) {
  return value > 0 ? numberFormatter.format(value) : '';
}

function parseAmount(value: string) {
  return Number(value.replace(/,/g, '').trim());
}

function parseNumberInput(value: string) {
  return Number(value.replace(/[^\d]/g, '')) || 0;
}

function getCategoryLabel(categories: CategoryOption[], idOrLabel: string) {
  return categories.find((category) => category.id === idOrLabel || category.label === idOrLabel)?.label ?? idOrLabel;
}

function formatAssetLabel(asset: AssetItem, categories: CategoryOption[] = []): string {
  if (asset.name?.trim()) return asset.name.trim();
  const catLabel = getCategoryLabel(categories, asset.category);
  const isRawId = !catLabel || catLabel.startsWith('cat_') || catLabel === asset.category;
  
  if (asset.memo && asset.memo.trim()) {
    const memoTrimmed = asset.memo.trim();
    if (isRawId || memoTrimmed === catLabel) {
      return memoTrimmed;
    }
    return `${memoTrimmed} (${catLabel})`;
  }
  
  return isRawId ? (asset.category && !asset.category.startsWith('cat_') ? asset.category : '자산') : catLabel;
}

function getAssetCategoryKindKey(id: string) {
  return `asset-kind:${id}`;
}

function isLiabilityAsset(asset: AssetItem, categories: CategoryOption[] = [], categoryLabels: CategoryLabelMap = {}) {
  const category = categories.find((item) => item.id === asset.category || item.label === asset.category);
  const categoryKind = categoryLabels[getAssetCategoryKindKey(asset.category)] || category?.kind;
  return categoryKind === 'liability';
}

function buildCategorySegments(categories: CategoryOption[], values: Record<string, number>): FlowSegment[] {
  return categories
    .map((category) => ({
      id: category.id,
      label: category.label,
      value: values[category.id] ?? 0,
      color: category.color || '#64748b',
    }))
    .filter((segment) => segment.value > 0);
}

function getCategoryColorKey(type: CategoryScope, id: string) {
  return `${type}:${id}`;
}

function getTabFromHash(): AppTab {
  const hash = window.location.hash.replace('#', '');
  const tabs: AppTab[] = ['summary', 'asset', 'plan', 'calendar', 'ledger', 'settings'];
  return tabs.includes(hash as AppTab) ? hash as AppTab : 'summary';
}

function applyCategorySettings(categories: CategoryOption[], type: CategoryScope, colors: CategoryColorMap, labels: CategoryLabelMap, order: CategoryOrderMap) {
  const orderList = order[type] ?? [];
  const orderIndex = new Map(orderList.map((id, index) => [id, index]));

  return categories.map((category) => ({
    ...category,
    label: labels[getCategoryColorKey(type, category.id)] ?? category.label,
    color: colors[getCategoryColorKey(type, category.id)] ?? category.color,
  })).sort((a, b) => {
    const aIndex = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bIndex = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}

function isCategoryHidden(hiddenCategories: HiddenCategoryMap, type: CategoryScope, id: string) {
  return Boolean(hiddenCategories[getCategoryColorKey(type, id)]);
}

function CategoryBadge({ categories, idOrLabel }: { categories: CategoryOption[]; idOrLabel: string }) {
  const cat = categories.find((c) => c.id === idOrLabel || c.label === idOrLabel);
  const label = cat?.label ?? idOrLabel;
  const customColor = cat?.color;

  if (customColor) {
    return (
      <span
        className="category-badge"
        style={{ 
          display: 'inline-block',
          padding: '3px 8px', 
          borderRadius: '6px', 
          fontSize: '0.8rem',
          fontWeight: 700,
          background: `${customColor}1c`, // ~11% opacity in hex
          color: customColor,
          border: `1px solid ${customColor}40` // 25% opacity border
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className="category-badge"
      style={{ 
        display: 'inline-block',
        padding: '3px 8px', 
        borderRadius: '6px', 
        fontSize: '0.8rem',
        fontWeight: 700,
        background: 'var(--bg-balance-light)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-input)'
      }}
    >
      {label}
    </span>
  );
}

function PlanAmountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="plan-amount-control">
      <input
        type="text"
        inputMode="numeric"
        value={formatNumberInput(value)}
        onChange={(event) => onChange(parseNumberInput(event.target.value))}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="0"
      />
      <span>원</span>
    </div>
  );
}

function createUnifiedForm(defaultDate = getToday(), defaultType: EntryType = 'expense'): UnifiedFormState {
  const defaultCategory = defaultType === 'transfer' ? 'transfer' : '';

  return {
    type: defaultType,
    date: defaultDate,
    time: getCurrentTransactionTime(),
    amount: '',
    title: '',
    category: defaultCategory,
    assetId: '',
    toAssetId: '',
  };
}

function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark' ? value : 'light';
}

function getSystemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadStoredData() {
  if (typeof window === 'undefined') {
    return { 
      transactions: [] as Transaction[], 
      assets: [] as AssetItem[], 
      budget: 1000000, 
      theme: 'light' as const, 
      plans: [] as CategoryPlan[],
      customExpenseCategories: [] as CategoryOption[],
      customIncomeCategories: [] as CategoryOption[],
      customAssetCategories: [] as CategoryOption[],
      categoryColors: {} as CategoryColorMap,
      categoryLabels: {} as CategoryLabelMap,
      categoryBudgetExcluded: {} as CategoryBudgetExcludedMap,
      categoryOrder: {} as CategoryOrderMap,
      hiddenCategories: {} as HiddenCategoryMap,
      hiddenAssets: {} as HiddenAssetMap,
      recurringRules: [] as RecurringRule[],
      deletedRecurringTxs: [] as string[],
      updatedAt: 0
    };
  }

  try {
    const rawData = window.localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
      const oldData = window.localStorage.getItem('mywallet:v1');
      if (oldData) {
        const parsed = JSON.parse(oldData);
        return {
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          assets: Array.isArray(parsed.assets) ? parsed.assets : [],
          budget: 1000000,
          theme: 'light' as const,
          plans: [] as CategoryPlan[],
          customExpenseCategories: [] as CategoryOption[],
          customIncomeCategories: [] as CategoryOption[],
          customAssetCategories: [] as CategoryOption[],
          categoryColors: {} as CategoryColorMap,
          categoryLabels: {} as CategoryLabelMap,
          categoryBudgetExcluded: {} as CategoryBudgetExcludedMap,
          categoryOrder: {} as CategoryOrderMap,
          hiddenCategories: {} as HiddenCategoryMap,
          hiddenAssets: {} as HiddenAssetMap,
          recurringRules: [] as RecurringRule[],
          deletedRecurringTxs: [] as string[],
          updatedAt: 0
        };
      }
      return { 
        transactions: [] as Transaction[], 
        assets: [] as AssetItem[], 
        budget: 1000000, 
        theme: 'light' as const, 
        plans: [] as CategoryPlan[],
        customExpenseCategories: [] as CategoryOption[],
        customIncomeCategories: [] as CategoryOption[],
        customAssetCategories: [] as CategoryOption[],
        categoryColors: {} as CategoryColorMap,
        categoryLabels: {} as CategoryLabelMap,
        categoryBudgetExcluded: {} as CategoryBudgetExcludedMap,
        categoryOrder: {} as CategoryOrderMap,
        hiddenCategories: {} as HiddenCategoryMap,
        hiddenAssets: {} as HiddenAssetMap,
        recurringRules: [] as RecurringRule[],
        deletedRecurringTxs: [] as string[],
        updatedAt: 0
      };
    }

    const parsed = JSON.parse(rawData);
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      budget: typeof parsed.budget === 'number' ? parsed.budget : 1000000,
      theme: normalizeThemePreference(parsed.theme),
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      customExpenseCategories: Array.isArray(parsed.customExpenseCategories) ? parsed.customExpenseCategories : [] as CategoryOption[],
      customIncomeCategories: Array.isArray(parsed.customIncomeCategories) ? parsed.customIncomeCategories : [] as CategoryOption[],
      customAssetCategories: Array.isArray(parsed.customAssetCategories) ? parsed.customAssetCategories : [] as CategoryOption[],
      categoryColors: parsed.categoryColors && typeof parsed.categoryColors === 'object' ? parsed.categoryColors as CategoryColorMap : {} as CategoryColorMap,
      categoryLabels: parsed.categoryLabels && typeof parsed.categoryLabels === 'object' ? parsed.categoryLabels as CategoryLabelMap : {} as CategoryLabelMap,
      categoryBudgetExcluded: parsed.categoryBudgetExcluded && typeof parsed.categoryBudgetExcluded === 'object' ? parsed.categoryBudgetExcluded as CategoryBudgetExcludedMap : {} as CategoryBudgetExcludedMap,
      categoryOrder: parsed.categoryOrder && typeof parsed.categoryOrder === 'object' ? parsed.categoryOrder as CategoryOrderMap : {} as CategoryOrderMap,
      hiddenCategories: parsed.hiddenCategories && typeof parsed.hiddenCategories === 'object' ? parsed.hiddenCategories as HiddenCategoryMap : {} as HiddenCategoryMap,
      hiddenAssets: parsed.hiddenAssets && typeof parsed.hiddenAssets === 'object' ? parsed.hiddenAssets as HiddenAssetMap : {} as HiddenAssetMap,
      recurringRules: Array.isArray(parsed.recurringRules) ? parsed.recurringRules : [] as RecurringRule[],
      deletedRecurringTxs: Array.isArray(parsed.deletedRecurringTxs) ? parsed.deletedRecurringTxs : [] as string[],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    };
  } catch {
    return { 
      transactions: [] as Transaction[], 
      assets: [] as AssetItem[], 
      budget: 1000000, 
      theme: 'light' as const, 
      plans: [] as CategoryPlan[],
      customExpenseCategories: [] as CategoryOption[],
      customIncomeCategories: [] as CategoryOption[],
      customAssetCategories: [] as CategoryOption[],
      categoryColors: {} as CategoryColorMap,
      categoryLabels: {} as CategoryLabelMap,
      categoryBudgetExcluded: {} as CategoryBudgetExcludedMap,
      categoryOrder: {} as CategoryOrderMap,
      hiddenCategories: {} as HiddenCategoryMap,
      hiddenAssets: {} as HiddenAssetMap,
      recurringRules: [] as RecurringRule[],
      deletedRecurringTxs: [] as string[],
      updatedAt: 0
    };
  }
}

function saveLocalStorage(
  transactions: Transaction[], 
  assets: AssetItem[], 
  budget: number, 
  theme: ThemePreference,
  plans: CategoryPlan[],
  customExpenseCategories: CategoryOption[],
  customIncomeCategories: CategoryOption[],
  customAssetCategories: CategoryOption[],
  categoryColors: CategoryColorMap,
  categoryLabels: CategoryLabelMap,
  categoryBudgetExcluded: CategoryBudgetExcludedMap,
  categoryOrder: CategoryOrderMap,
  hiddenCategories: HiddenCategoryMap,
  hiddenAssets: HiddenAssetMap,
  recurringRules: RecurringRule[],
  deletedRecurringTxs: string[],
  updatedAt: number
) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY, 
      JSON.stringify({ 
        transactions, 
        assets, 
        budget, 
        theme, 
        plans, 
        customExpenseCategories, 
        customIncomeCategories, 
        customAssetCategories,
        categoryColors,
        categoryLabels,
        categoryBudgetExcluded,
        categoryOrder,
        hiddenCategories,
        hiddenAssets,
        recurringRules, 
        deletedRecurringTxs,
        updatedAt
      })
    );
  } catch {
    // LocalStorage error fallback
  }
}

// The legacy full-snapshot writer is intentionally retained as a no-op while
// older UI paths are being removed. It must never send client state to D1.
function saveRemoteD1(..._snapshot: unknown[]) {
  return Promise.resolve(new Response(JSON.stringify({ error: 'FULL_SNAPSHOT_DISABLED' }), { status: 410 }));
}

async function saveTransactionOperation(payload: Record<string, unknown>, operationId = createId()) {
  updatePendingTransactionOperation(operationId, {
    payload,
    createdAt: Date.now(),
    status: 'retry',
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('/api/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, operationId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.error || 'TRANSACTION_SAVE_FAILED') as Error & { status?: number; current?: unknown; operationId?: string };
        error.status = response.status;
        error.current = result.current;
        error.operationId = operationId;
        throw error;
      }
      updatePendingTransactionOperation(operationId);
      return result as { transaction?: Transaction | null; transactions?: Transaction[]; transactionId?: string };
    } catch (error) {
      lastError = error;
      if ((error as { status?: number }).status) {
        if ((error as { status?: number }).status === 409) {
          updatePendingTransactionOperation(operationId, { status: 'conflict' });
        }
        throw error;
      }
      if (attempt === 1) throw error;
    }
  }
  throw lastError;
}

function sumAmount<T extends { amount: number }>(items: T[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function downloadCSV(csvContent: string, fileName: string) {
  const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeCSVCell(value: unknown) {
  const text = value == null ? '' : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function createCSVRow(values: unknown[]) {
  return values.map(escapeCSVCell).join(',');
}

function parseCSVRows(text: string) {
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      cells.push(current);
      if (cells.some((cell) => cell.length > 0)) rows.push(cells);
      cells = [];
      current = '';
    } else {
      current += char;
    }
  }

  if (inQuotes) throw new Error('닫히지 않은 CSV 따옴표가 있습니다.');
  cells.push(current);
  if (cells.some((cell) => cell.length > 0)) rows.push(cells);
  return rows;
}

async function saveAssetOrder(categoryId: string, assetIds: string[], expectedRevision: number, operationId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch('/api/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'asset.reorder', categoryId, assetIds, expectedRevision, operationId }),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function saveCategoryOrder(
  type: CategoryScope,
  categoryIds: string[],
  expectedRevision: number,
  operationId: string,
  categoryLabels?: CategoryLabelMap,
) {
  return fetch('/api/data', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'category.reorder', type, categoryIds, expectedRevision, operationId, categoryLabels }),
  });
}

function saveAssetMutation(payload: Record<string, unknown>) {
  return fetch('/api/data', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function formatSyncTime(value?: number) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function isValidTransactionTime(value?: string | null) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeTransactionTime(value?: string | null) {
  return isValidTransactionTime(value) ? value : null;
}

function compareTransactionsByDateTime(a: Transaction, b: Transaction) {
  const dateCompare = a.date.localeCompare(b.date);
  if (dateCompare !== 0) return dateCompare;
  return (a.time || '').localeCompare(b.time || '');
}

export default function App() {
  const storedData = useMemo(() => loadStoredData(), []);
  
  // App states
  const [transactions, setTransactions] = useState<Transaction[]>(storedData.transactions);
  const [assets, setAssets] = useState<AssetItem[]>(storedData.assets);
  const [cardSettlements, setCardSettlements] = useState<CardSettlement[]>([]);
  const [budget, setBudget] = useState<number>(storedData.budget);
  const [theme, setTheme] = useState<ThemePreference>(storedData.theme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
  const [customExpenseCategories, setCustomExpenseCategories] = useState<CategoryOption[]>(storedData.customExpenseCategories);
  const [customIncomeCategories, setCustomIncomeCategories] = useState<CategoryOption[]>(storedData.customIncomeCategories);
  const [customAssetCategories, setCustomAssetCategories] = useState<CategoryOption[]>(storedData.customAssetCategories || []);
  const [categoryColors, setCategoryColors] = useState<CategoryColorMap>(storedData.categoryColors || {});
  const [categoryLabels, setCategoryLabels] = useState<CategoryLabelMap>(storedData.categoryLabels || {});
  const [categoryBudgetExcluded, setCategoryBudgetExcluded] = useState<CategoryBudgetExcludedMap>(storedData.categoryBudgetExcluded || {});
  const [categoryOrder, setCategoryOrder] = useState<CategoryOrderMap>(storedData.categoryOrder || {});
  const [hiddenCategories, setHiddenCategories] = useState<HiddenCategoryMap>(storedData.hiddenCategories || {});
  const [hiddenAssets, setHiddenAssets] = useState<HiddenAssetMap>(storedData.hiddenAssets || {});
   const [recurringRules, setRecurringRules] = useState<RecurringRule[]>(storedData.recurringRules || []);
  const [deletedRecurringTxs, setDeletedRecurringTxs] = useState<string[]>(storedData.deletedRecurringTxs || []);
  const [updatedAt, setUpdatedAt] = useState<number>(storedData.updatedAt || 0);

  const activeAssets = useMemo(() => {
    return assets.filter((asset) => !hiddenAssets[asset.id]);
  }, [assets, hiddenAssets]);

  const hiddenAssetsList = useMemo(() => {
    return assets.filter((asset) => Boolean(hiddenAssets[asset.id]));
  }, [assets, hiddenAssets]);

  const allExpenseCategories = useMemo(
    () => applyCategorySettings([...expenseCategories, ...customExpenseCategories], 'expense', categoryColors, categoryLabels, categoryOrder),
    [customExpenseCategories, categoryColors, categoryLabels, categoryOrder]
  );
  const allIncomeCategories = useMemo(
    () => applyCategorySettings([...incomeCategories, ...customIncomeCategories], 'income', categoryColors, categoryLabels, categoryOrder),
    [customIncomeCategories, categoryColors, categoryLabels, categoryOrder]
  );
  const allAssetCategories = useMemo(
    () => applyCategorySettings([...assetCategories, ...customAssetCategories], 'asset', categoryColors, categoryLabels, categoryOrder),
    [customAssetCategories, categoryColors, categoryLabels, categoryOrder]
  );
  const activeExpenseCategories = useMemo(
    () => allExpenseCategories.filter((category) => !isCategoryHidden(hiddenCategories, 'expense', category.id)),
    [allExpenseCategories, hiddenCategories]
  );
  const activeIncomeCategories = useMemo(
    () => allIncomeCategories.filter((category) => !isCategoryHidden(hiddenCategories, 'income', category.id)),
    [allIncomeCategories, hiddenCategories]
  );
  const activeAssetCategories = useMemo(
    () => allAssetCategories.filter((category) => !isCategoryHidden(hiddenCategories, 'asset', category.id)),
    [allAssetCategories, hiddenCategories]
  );
  const openingBalanceCategoryId = useMemo(
    () => allIncomeCategories.find((category) => category.label === OPENING_BALANCE_CATEGORY)?.id ?? OPENING_BALANCE_CATEGORY,
    [allIncomeCategories],
  );
  const isOpeningBalanceTransaction = useCallback(
    (transaction: Transaction) => transaction.category === OPENING_BALANCE_CATEGORY || transaction.category === openingBalanceCategoryId,
    [openingBalanceCategoryId],
  );
  function getAssetCategoryGroupId(asset: AssetItem) {
    return allAssetCategories.find((category) => category.id === asset.category || category.label === asset.category)?.id ?? asset.category;
  }
  const assetGroups = useMemo(() => {
    const knownGroups = allAssetCategories.map((category) => ({
      id: category.id,
      label: category.label,
      assets: activeAssets.filter((asset) => getAssetCategoryGroupId(asset) === category.id),
    })).filter((group) => group.assets.length > 0);
    const knownIds = new Set(knownGroups.map((group) => group.id));
    const unknownGroups = new Map<string, AssetItem[]>();
    activeAssets.forEach((asset) => {
      const groupId = getAssetCategoryGroupId(asset);
      if (knownIds.has(groupId)) return;
      unknownGroups.set(groupId, [...(unknownGroups.get(groupId) ?? []), asset]);
    });
    return [...knownGroups, ...Array.from(unknownGroups, ([id, groupedAssets]) => ({ id, label: id, assets: groupedAssets }))];
  }, [activeAssets, allAssetCategories]);
  const assetCategoryGroups = useMemo(() => (
    ([
      { kind: 'asset' as const, label: '자산' },
      { kind: 'liability' as const, label: '대출' },
    ]).map((group) => ({
      ...group,
      categories: activeAssetCategories.filter((category) => (
        (categoryLabels[getAssetCategoryKindKey(category.id)] || category.kind || 'asset') === group.kind
      )),
    }))
  ), [activeAssetCategories, categoryLabels]);
  const [dragCategory, setDragCategory] = useState<{ type: CategoryScope; id: string } | null>(null);
  const categorySortSessionRef = useRef<{
    type: CategoryScope;
    sourceId: string;
    previewTargetKey: string | null;
    previousOrder: CategoryOrderMap;
    previousLabels: CategoryLabelMap;
    nextOrder: CategoryOrderMap;
    nextLabels: CategoryLabelMap;
    labelPatch?: CategoryLabelMap;
    hasPreview: boolean;
  } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ type: CategoryScope; id: string } | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState('');
  const [categoryAssetKindDraft, setCategoryAssetKindDraft] = useState<'asset' | 'liability'>('asset');

  const [plans, setPlans] = useState<CategoryPlan[]>(() => {
    const initialPlans: CategoryPlan[] = storedData.plans || [];
    const allCategories = [
      ...expenseCategories.map((c: CategoryOption) => ({ category: c.id, type: 'expense' as const })),
      ...storedData.customExpenseCategories.map((c: CategoryOption) => ({ category: c.id, type: 'expense' as const })),
      ...incomeCategories.map((c: CategoryOption) => ({ category: c.id, type: 'income' as const })),
      ...storedData.customIncomeCategories.map((c: CategoryOption) => ({ category: c.id, type: 'income' as const }))
    ];
    return allCategories.map(item => {
      const existing = initialPlans.find(p => p.category === item.category && p.type === item.type);
      return existing ? { ...existing, plannedAmount: Number(existing.plannedAmount) || 0 } : { category: item.category, type: item.type, plannedAmount: 0 };
    });
  });
  const [activeTab, setActiveTab] = useState<AppTab>(() => getTabFromHash());
  const contentScrollRef = useRef<HTMLElement | null>(null);
  const assetListScrollRef = useRef({ contentTop: 0, documentTop: 0 });
  const assetScrollTransitionRef = useRef<'detail' | 'list' | null>(null);
  const previousTabRef = useRef<AppTab>(activeTab);
  const [settingsSection, setSettingsSection] = useState<'app' | 'category' | 'asset' | 'recurring' | 'data'>('app');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showAssetDetails, setShowAssetDetails] = useState(false);
  
  // Dashboard Chart states
  const [chartFilter, setChartFilter] = useState<'both' | 'income' | 'expense' | 'asset'>('both');
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);
  const [hoveredChartPos, setHoveredChartPos] = useState<{ x: number; y: number } | null>(null);
  const [summaryType, setSummaryType] = useState<'expense' | 'income' | 'asset'>('expense');

  // Filter & DB Loaded states
  const isDbLoadedRef = useRef(false);
  const skipNextPersistenceRef = useRef(true);
  const serverUpdatedAtRef = useRef(storedData.updatedAt || 0);
  const syncCursorRef = useRef(Number(window.localStorage.getItem(SYNC_CURSOR_KEY)) || 0);
  const remoteSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const remoteSyncConflictRef = useRef(false);
  const transactionSyncRunRef = useRef<Promise<SyncRunResult> | null>(null);
  const assetsRef = useRef<AssetItem[]>(assets);
  const assetOrderRevisionsRef = useRef<Record<string, number>>({});
  const assetOrderSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const categoryOrderRevisionsRef = useRef<Record<string, number>>({});
  const categoryOrderSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const assetOrderBeforeDragRef = useRef<{ categoryId: string; assetIds: string[]; sourceId: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(() => Number(getCurrentMonth().slice(0, 4)));
  const [monthPickerMonth, setMonthPickerMonth] = useState(() => Number(getCurrentMonth().slice(5, 7)));
  const monthPickerYearRef = useRef<HTMLDivElement>(null);
  const monthPickerMonthRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [ledgerView, setLedgerView] = useState<'daily' | 'calendar' | 'monthly' | 'settlement'>('daily');
  const [settlementType, setSettlementType] = useState<'expense' | 'income'>('expense');
  const [expandedSettlementCategory, setExpandedSettlementCategory] = useState<string | null>(null);
  const [expandedLedgerMonth, setExpandedLedgerMonth] = useState<string | null>(selectedMonth);

  useEffect(() => {
    if (!isMonthPickerOpen) return;

    const frame = window.requestAnimationFrame(() => {
      monthPickerYearRef.current?.scrollTo({
        top: (monthPickerYear - MONTH_PICKER_YEAR_START) * MONTH_PICKER_ROW_HEIGHT,
        behavior: 'auto',
      });
      monthPickerMonthRef.current?.scrollTo({
        top: (monthPickerMonth - 1) * MONTH_PICKER_ROW_HEIGHT,
        behavior: 'auto',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isMonthPickerOpen]);

  const yearlyData = useMemo(() => {
    const year = selectedMonth.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const today = getToday();
    return months.map((mo) => {
      const monthStr = `${year}-${mo}`;
      const monthlyTxs = transactions.filter((t) => t.date.startsWith(monthStr) && t.date <= today);
      const income = monthlyTxs
        .filter((t) => t.type === 'income' && !isOpeningBalanceTransaction(t))
        .reduce((sum, t) => sum + t.amount, 0);
      const expense = monthlyTxs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      const isFutureMonth = monthStr > today.slice(0, 7);
      if (isFutureMonth) {
        return { month: `${Number(mo)}월`, income, expense, asset: null };
      }
      const monthEnd = `${monthStr}-${String(new Date(Number(year), Number(mo), 0).getDate()).padStart(2, '0')}`;
      const balanceDate = monthEnd < today ? monthEnd : today;
      const balanceTransactions = transactions.filter((transaction) => transaction.date <= balanceDate);
      const balances = new Map(assets.map((asset) => {
        let openingBalance = 0;
        let hasOpeningBalance = false;
        balanceTransactions.forEach((transaction) => {
          if (!isOpeningBalanceTransaction(transaction)) return;
          if (transaction.type === 'income' && transaction.assetId === asset.id) {
            openingBalance += transaction.amount;
            hasOpeningBalance = true;
          } else if (transaction.type === 'expense' && transaction.assetId === asset.id) {
            openingBalance -= transaction.amount;
            hasOpeningBalance = true;
          } else if (transaction.type === 'transfer') {
            if (transaction.assetId === asset.id) {
              openingBalance -= transaction.amount;
              hasOpeningBalance = true;
            }
            if (transaction.toAssetId === asset.id) {
              openingBalance += transaction.amount;
              hasOpeningBalance = true;
            }
          }
        });
        return [asset.id, hasOpeningBalance ? openingBalance : asset.amount] as const;
      }));
      balanceTransactions.filter((transaction) => !isOpeningBalanceTransaction(transaction)).forEach((transaction) => {
        if (transaction.type === 'income' && transaction.assetId) {
          balances.set(transaction.assetId, (balances.get(transaction.assetId) ?? 0) + transaction.amount);
        } else if (transaction.type === 'expense' && transaction.assetId) {
          balances.set(transaction.assetId, (balances.get(transaction.assetId) ?? 0) - transaction.amount);
        } else if (transaction.type === 'transfer') {
          if (transaction.assetId) balances.set(transaction.assetId, (balances.get(transaction.assetId) ?? 0) - transaction.amount);
          if (transaction.toAssetId) balances.set(transaction.toAssetId, (balances.get(transaction.toAssetId) ?? 0) + transaction.amount);
        }
      });
      const asset = assets.reduce((sum, item) => {
        const balance = balances.get(item.id) ?? item.amount;
        return sum + (isLiabilityAsset(item, allAssetCategories, categoryLabels) ? -Math.abs(balance) : balance);
      }, 0);
      return {
        month: `${Number(mo)}월`,
        income,
        expense,
        asset,
      };
    });
  }, [transactions, assets, selectedMonth, allAssetCategories, categoryLabels, isOpeningBalanceTransaction]);

  const latestTrackedAsset = useMemo(
    () => [...yearlyData].reverse().find((data) => data.asset !== null) ?? null,
    [yearlyData],
  );

  // Calendar states
  const [calendarYear, setCalendarYear] = useState(() => Number(selectedMonth.slice(0, 4)));
  const [calendarMonth, setCalendarMonth] = useState(() => Number(selectedMonth.slice(5, 7)) - 1); // 0-11
  const [selectedDayData, setSelectedDayData] = useState<string | null>(null); // Date string YYYY-MM-DD
  const [modalTab, setModalTab] = useState<'view' | 'add'>('view');

  // Edit states
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);
  const [showAllCardPayments, setShowAllCardPayments] = useState(false);
  const [isAssetSettingsOpen, setIsAssetSettingsOpen] = useState(false);
  const [assetBalanceDraft, setAssetBalanceDraft] = useState('');
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [assetSwipe, setAssetSwipe] = useState<{ id: string | null; offset: number; dragging: boolean }>({ id: null, offset: 0, dragging: false });
  const assetSwipeGestureRef = useRef({ id: '', startX: 0, startY: 0, baseOffset: 0, isHorizontal: false });
  const [assetHandleDragVisual, setAssetHandleDragVisual] = useState<{ id: string | null; targetId: string | null }>({ id: null, targetId: null });
  const assetHandleDragRef = useRef({ id: '', pointerId: -1, startX: 0, startY: 0, grabOffsetX: 0, grabOffsetY: 0, targetId: null as string | null, active: false, moved: false, justDragged: false, ghost: null as HTMLElement | null, sourceRow: null as HTMLElement | null, moveListener: null as ((event: PointerEvent) => void) | null, releaseListener: null as ((event: PointerEvent) => void) | null });
  const [isLedgerFormOpen, setIsLedgerFormOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<EntryType | 'asset'>('expense');

  function scrollAppContent({ contentTop, documentTop }: { contentTop: number; documentTop: number }) {
    contentScrollRef.current?.scrollTo({ top: contentTop, behavior: 'auto' });
    window.scrollTo({ top: documentTop, behavior: 'auto' });
    document.scrollingElement?.scrollTo({ top: documentTop, behavior: 'auto' });
  }

  function openAssetHistory(asset: AssetItem) {
    assetListScrollRef.current = {
      contentTop: contentScrollRef.current?.scrollTop ?? 0,
      documentTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    };
    setSelectedAsset(asset);
    setShowAllCardPayments(false);
    setAssetBalanceDraft(String(getAssetBalance(asset.id, getAssetOpeningBalance(asset))));
    assetScrollTransitionRef.current = 'detail';
  }

  function returnToAssetList() {
    setSelectedAsset(null);
    assetScrollTransitionRef.current = 'list';
  }

  function switchRegistrationMode(mode: EntryType | 'asset') {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    setRegistrationMode(mode);
  }
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryColor, setSelectedCategoryColor] = useState<string>('#ef4444');
  const [categoryDraft, setCategoryDraft] = useState<{ type: CategoryScope; label: string; color: string }>({
    type: 'expense',
    label: '',
    color: '#0284c7',
  });
  const [assetCatLabel, setAssetCatLabel] = useState('');
  const [assetCatColor, setAssetCatColor] = useState('#0284c7');
  const [planCatLabel, setPlanCatLabel] = useState('');
  const [planCatColor, setPlanCatColor] = useState('#ef4444');
  const [planCatType, setPlanCatType] = useState<CategoryScope>('expense');
  const [categoryModalType, setCategoryModalType] = useState<CategoryScope>('expense');
  const [categoryModalAssetKind, setCategoryModalAssetKind] = useState<'asset' | 'liability'>('asset');
  const [customPaletteOpen, setCustomPaletteOpen] = useState(false);
  const [pickerHue, setPickerHue] = useState(200);
  const [pickerSat, setPickerSat] = useState(80);
  const [pickerLight, setPickerLight] = useState(50);
  const [assetSection, setAssetSection] = useState({ showAsset: true, showPlan: false, showRecurring: false });
  const [openPaletteKey, setOpenPaletteKey] = useState<string | null>(null);
  const [paletteDraftColor, setPaletteDraftColor] = useState('#64748b');

  const [isLoading, setIsLoading] = useState(true);
  const [loadingOrbitDelay] = useState(() => {
    const elapsed = typeof performance === 'undefined' ? 0 : performance.now() % LOADING_ORBIT_DURATION;
    return `-${elapsed}ms`;
  });
  const [isSyncOverlayVisible, setIsSyncOverlayVisible] = useState(false);
  const [remoteSync, setRemoteSync] = useState<RemoteSyncState>({
    status: 'checking',
    message: '서버 저장 상태 확인 중',
  });
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);

  function showNotice(message: string, title = '알림', type: NoticeType = 'info') {
    setNotice({
      id: Date.now(),
      type,
      title,
      message,
    });
  }

  function requestConfirm(options: ConfirmState) {
    setConfirmDialog(options);
  }

  function closeConfirmDialog() {
    setConfirmDialog(null);
  }

  function applySavedTransactionOperation(payload: Record<string, unknown>, result: { transaction?: Transaction | null; transactions?: Transaction[]; transactionId?: string }) {
    skipNextPersistenceRef.current = true;
    if (payload.op === 'transaction.create' && result.transaction) {
      setTransactions((previous) => [result.transaction!, ...previous.filter((transaction) => transaction.id !== result.transaction!.id)]);
      return;
    }
    if (payload.op === 'transaction.createBatch' && result.transactions) {
      const savedIds = new Set(result.transactions.map((transaction) => transaction.id));
      setTransactions((previous) => [...result.transactions!, ...previous.filter((transaction) => !savedIds.has(transaction.id))]);
      return;
    }
    if (payload.op === 'transaction.update' && result.transaction) {
      setTransactions((previous) => previous.map((transaction) => transaction.id === result.transaction!.id ? result.transaction! : transaction));
      return;
    }
    if (payload.op === 'transaction.delete' && result.transactionId) {
      setTransactions((previous) => previous.filter((transaction) => transaction.id !== result.transactionId));
    }
  }

  async function pullTransactionChanges(): Promise<{ appliedChanges: number; blocked: boolean }> {
    const cursor = syncCursorRef.current;
    const response = await fetch(`/api/data?after=${cursor}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('SYNC_PULL_FAILED');
    const result = await response.json() as {
      changes?: Array<{ cursor: number; entityType: string; entityId: string; changeType: string; payload: Transaction | CategoryOrderSyncPayload | null }>;
    };
    const pendingIds = new Set(readPendingTransactionOperations().flatMap((operation) => {
      const transaction = operation.payload.transaction as { id?: string } | undefined;
      const transactions = operation.payload.transactions as Array<{ id?: string }> | undefined;
      return [transaction?.id, operation.payload.transactionId, ...(Array.isArray(transactions) ? transactions.map((item) => item.id) : [])]
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    }));
    const changes = result.changes || [];
    const applicableTransactions: typeof changes = [];
    const applicableCategoryOrders: Array<{ cursor: number; payload: CategoryOrderSyncPayload }> = [];
    let appliedCursor = cursor;
    for (const change of changes) {
      if (change.entityType === 'category-order' && change.payload && isCategoryOrderSyncPayload(change.payload)) {
        applicableCategoryOrders.push({ cursor: change.cursor, payload: change.payload });
        appliedCursor = change.cursor;
        continue;
      }
      if (change.entityType !== 'transaction') {
        appliedCursor = change.cursor;
        continue;
      }
      if (pendingIds.has(change.entityId)) break;
      applicableTransactions.push(change);
      appliedCursor = change.cursor;
    }
    if (applicableTransactions.length === 0 && applicableCategoryOrders.length === 0) {
      return { appliedChanges: 0, blocked: appliedCursor !== (changes[changes.length - 1]?.cursor ?? cursor) };
    }
    skipNextPersistenceRef.current = true;
    setTransactions((previous) => applicableTransactions.reduce((next, change) => {
      if (change.changeType === 'delete') return next.filter((transaction) => transaction.id !== change.entityId);
      if (!change.payload) return next;
      if (!isTransaction(change.payload)) return next;
      const existing = next.find((transaction) => transaction.id === change.entityId);
      if (existing && (existing.revision ?? 1) > (change.payload.revision ?? 1)) return next;
      return [change.payload, ...next.filter((transaction) => transaction.id !== change.entityId)];
    }, previous));
    applicableCategoryOrders.forEach(({ payload }) => {
      categoryOrderRevisionsRef.current[payload.type] = payload.revision;
      setCategoryOrder(payload.categoryOrder);
      setCategoryLabels(payload.categoryLabels);
    });
    syncCursorRef.current = appliedCursor;
    window.localStorage.setItem(SYNC_CURSOR_KEY, String(appliedCursor));
    const appliedChanges = applicableTransactions.length + applicableCategoryOrders.length;
    return { appliedChanges, blocked: appliedCursor !== (changes[changes.length - 1]?.cursor ?? appliedCursor) };
  }

  async function replayPendingTransactionOperations() {
    const pending = readPendingTransactionOperations().filter((operation) => operation.status === 'retry');
    let replayedOperations = 0;
    for (const operation of pending) {
      try {
        const result = await saveTransactionOperation(operation.payload, operation.operationId);
        applySavedTransactionOperation(operation.payload, result);
        replayedOperations += 1;
      } catch {
        // Retain the exact operationId until it succeeds or the user resolves its conflict.
      }
    }
    return {
      replayedOperations,
      conflictedOperations: readPendingTransactionOperations().filter((operation) => operation.status === 'conflict').length,
      pendingOperations: readPendingTransactionOperations().filter((operation) => operation.status === 'retry').length,
    };
  }

  function synchronizeTransactionState(): Promise<SyncRunResult> {
    if (transactionSyncRunRef.current) return transactionSyncRunRef.current;
    const run = (async () => {
      const replay = await replayPendingTransactionOperations();
      let appliedChanges = 0;
      let blocked = false;
      for (let page = 0; page < 20; page += 1) {
        const pulled = await pullTransactionChanges();
        appliedChanges += pulled.appliedChanges;
        blocked = pulled.blocked;
        if (pulled.appliedChanges === 0 || pulled.blocked) break;
      }
      return { appliedChanges, ...replay, blocked };
    })();
    transactionSyncRunRef.current = run;
    void run.finally(() => {
      if (transactionSyncRunRef.current === run) transactionSyncRunRef.current = null;
    });
    return run;
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const syncTabFromHash = () => setActiveTab(getTabFromHash());
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  // Keep only the non-authoritative recovery cache here. Normal saves use row APIs.
  useEffect(() => {
    if (isLoading || !isDbLoadedRef.current) {
      return;
    }

    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      saveLocalStorage(
        transactions,
        assets,
        budget,
        theme,
        plans,
        customExpenseCategories,
        customIncomeCategories,
        customAssetCategories,
        categoryColors,
        categoryLabels,
        categoryBudgetExcluded,
        categoryOrder,
        hiddenCategories,
        hiddenAssets,
        recurringRules,
        deletedRecurringTxs,
        updatedAt
      );
      return;
    }

    saveLocalStorage(
      transactions,
      assets,
      budget,
      theme,
      plans,
      customExpenseCategories,
      customIncomeCategories,
      customAssetCategories,
      categoryColors,
      categoryLabels,
      categoryBudgetExcluded,
      categoryOrder,
      hiddenCategories,
      hiddenAssets,
      recurringRules,
      deletedRecurringTxs,
      updatedAt
    );
    // Snapshot POST is intentionally disabled during the row-operation migration.
    return;

    const newUpdatedAt = Date.now();
    setUpdatedAt(newUpdatedAt);
    window.localStorage.setItem(PENDING_SYNC_KEY, String(newUpdatedAt));

    // 1. LocalStorage is synced instantly for quick local cache recovery
    saveLocalStorage(
      transactions, 
      assets, 
      budget, 
      theme, 
      plans, 
      customExpenseCategories, 
      customIncomeCategories, 
      customAssetCategories,
      categoryColors,
      categoryLabels,
      categoryBudgetExcluded,
      categoryOrder,
      hiddenCategories,
      hiddenAssets,
      recurringRules, 
      deletedRecurringTxs,
      newUpdatedAt
    );

    setRemoteSync({
      status: 'pending',
      localUpdatedAt: newUpdatedAt,
      message: '변경사항 저장 대기 중',
    });

    // 2. Debounce D1 Database sync by 1 second (1000ms)
    const syncTimer = setTimeout(() => {
      setRemoteSync((prev) => ({
        ...prev,
        status: 'saving',
        localUpdatedAt: newUpdatedAt,
        message: '서버에 저장 중',
      }));
      const syncSnapshot = () => saveRemoteD1(
        transactions, 
        assets, 
        budget, 
        theme, 
        plans, 
        customExpenseCategories, 
        customIncomeCategories, 
        customAssetCategories,
        categoryColors,
        categoryLabels,
        categoryBudgetExcluded,
        categoryOrder,
        hiddenCategories,
        recurringRules, 
        deletedRecurringTxs,
        newUpdatedAt,
        serverUpdatedAtRef.current
      )
        .then(async (res) => {
          if (res.status === 409) {
            const conflict = await res.json();
            const remoteUpdatedAt = Number(conflict.updatedAt) || 0;
            serverUpdatedAtRef.current = remoteUpdatedAt;
            remoteSyncConflictRef.current = true;
            window.localStorage.removeItem(PENDING_SYNC_KEY);
            setRemoteSync({
              status: 'stale',
              localUpdatedAt: newUpdatedAt,
              remoteUpdatedAt,
              checkedAt: Date.now(),
              message: '다른 기기 변경 감지 - 잠시 후 다시 확인',
            });
            showNotice('다른 기기에서 먼저 저장했어요. 잠시 뒤 상단 초록 원을 눌러 최신 데이터를 확인한 후 다시 시도해 주세요.', '저장은 잠깐 양보', 'warning');
            return;
          }
          if (!res.ok) throw new Error('remote save failed');
          serverUpdatedAtRef.current = newUpdatedAt;
          window.localStorage.removeItem(PENDING_SYNC_KEY);
          setRemoteSync((prev) => {
            if (prev.localUpdatedAt && prev.localUpdatedAt > newUpdatedAt) return prev;
            return {
              status: 'synced',
              localUpdatedAt: newUpdatedAt,
              remoteUpdatedAt: newUpdatedAt,
              checkedAt: Date.now(),
              message: '서버 저장 완료',
            };
          });
        })
        .catch(() => {
          setRemoteSync((prev) => {
            if (prev.localUpdatedAt && prev.localUpdatedAt > newUpdatedAt) return prev;
            return {
              status: 'error',
              localUpdatedAt: newUpdatedAt,
              checkedAt: Date.now(),
              message: '서버 저장 실패 - 로컬에는 보관됨',
            };
          });
        });
      remoteSaveQueueRef.current = remoteSaveQueueRef.current.then(
        () => remoteSyncConflictRef.current ? undefined : syncSnapshot(),
        () => remoteSyncConflictRef.current ? undefined : syncSnapshot()
      );
    }, 1000);

    return () => {
      clearTimeout(syncTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    transactions, 
    assets, 
    budget, 
    theme, 
    plans, 
    customExpenseCategories, 
    customIncomeCategories, 
    customAssetCategories,
    categoryColors,
    categoryLabels,
    categoryBudgetExcluded,
    categoryOrder,
    hiddenCategories,
    recurringRules, 
    deletedRecurringTxs, 
    isLoading
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', updateSystemTheme);
    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const previousTab = previousTabRef.current;
    if (previousTab === 'asset' && activeTab !== 'asset' && selectedAsset) {
      setSelectedAsset(null);
      assetListScrollRef.current = { contentTop: 0, documentTop: 0 };
      window.requestAnimationFrame(() => scrollAppContent(assetListScrollRef.current));
    }
    previousTabRef.current = activeTab;
  }, [activeTab, selectedAsset]);

  useLayoutEffect(() => {
    const transition = assetScrollTransitionRef.current;
    if (!transition) return;

    assetScrollTransitionRef.current = null;
    scrollAppContent(transition === 'detail' ? { contentTop: 0, documentTop: 0 } : assetListScrollRef.current);
  }, [selectedAsset]);

  useEffect(() => {
    if (isLoading || !isOnline) return;
    let cancelled = false;
    const syncChanges = () => {
      void synchronizeTransactionState().catch(() => {
        if (!cancelled) setRemoteSync((previous) => ({ ...previous, status: 'error', message: '서버 변경을 확인하지 못했습니다.' }));
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncChanges();
    };
    syncChanges();
    window.addEventListener('online', syncChanges);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(syncChanges, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('online', syncChanges);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [isLoading, isOnline]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  // Handle theme attribute and native browser colors.
  useEffect(() => {
    const resolvedTheme = theme === 'system' ? systemTheme : theme;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'only light' : 'dark light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#172033' : '#f5f7fb');
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolvedTheme === 'light' ? 'only light' : 'dark light');
  }, [theme, systemTheme]);

  // Load data from D1 on mount (Timestamp 조율 DB-First & Local-First 하이브리드)
  useEffect(() => {
    const startTime = Date.now();
    fetch("/api/data")
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data: any) => {
        if (data && !data.error) {
          const serverUpdatedAt = Number(data.updatedAt) || 0;
          const localUpdatedAt = storedData.updatedAt || 0;
          const pendingSyncAt = Number(window.localStorage.getItem(PENDING_SYNC_KEY)) || 0;

          const hasDbData = 
            (Array.isArray(data.transactions) && data.transactions.length > 0) ||
            (Array.isArray(data.assets) && data.assets.length > 0) ||
            (Array.isArray(data.customExpenseCategories) && data.customExpenseCategories.length > 0) ||
            (Array.isArray(data.customIncomeCategories) && data.customIncomeCategories.length > 0) ||
            (Array.isArray(data.customAssetCategories) && data.customAssetCategories.length > 0) ||
            (data.categoryColors && typeof data.categoryColors === 'object' && Object.keys(data.categoryColors).length > 0) ||
            (data.categoryLabels && typeof data.categoryLabels === 'object' && Object.keys(data.categoryLabels).length > 0) ||
            (data.categoryBudgetExcluded && typeof data.categoryBudgetExcluded === 'object' && Object.keys(data.categoryBudgetExcluded).length > 0) ||
            (data.categoryOrder && typeof data.categoryOrder === 'object' && Object.keys(data.categoryOrder).length > 0) ||
            (data.hiddenCategories && typeof data.hiddenCategories === 'object' && Object.keys(data.hiddenCategories).length > 0) ||
            (Array.isArray(data.recurringRules) && data.recurringRules.length > 0) ||
            (Array.isArray(data.deletedRecurringTxs) && data.deletedRecurringTxs.length > 0);

          const hasLocalData =
            storedData.transactions.length > 0 ||
            storedData.assets.length > 0 ||
            storedData.customExpenseCategories.length > 0 ||
            storedData.customIncomeCategories.length > 0 ||
            storedData.customAssetCategories.length > 0 ||
            Object.keys(storedData.categoryColors || {}).length > 0 ||
            Object.keys(storedData.categoryLabels || {}).length > 0 ||
            Object.keys(storedData.categoryBudgetExcluded || {}).length > 0 ||
            Object.keys(storedData.categoryOrder || {}).length > 0 ||
            Object.keys(storedData.hiddenCategories || {}).length > 0 ||
            storedData.recurringRules.length > 0 ||
            storedData.deletedRecurringTxs.length > 0;

          if (!hasDbData && serverUpdatedAt === 0) {
            // A recovery upload must be an explicit administrative action.
            setTransactions([]);
            setAssets([]);
            setRecurringRules([]);
            setDeletedRecurringTxs([]);
            setPlans([]);
            setUpdatedAt(0);
            return;
          }

          if (hasDbData) {
            // 원격 DB 데이터 최우선(DB-First) -> DB 데이터 적용
            const fetchedTxs: Transaction[] = data.transactions || [];
            setTransactions(fetchedTxs);
            setAssets(data.assets || []);
            setCardSettlements(data.cardSettlements || []);
            assetOrderRevisionsRef.current = data.assetOrderRevisions || {};
            categoryOrderRevisionsRef.current = data.categoryOrderRevisions || {};
            setBudget(data.budget ?? 1000000);
            setTheme(normalizeThemePreference(data.theme));
            setCustomExpenseCategories(data.customExpenseCategories || []);
            setCustomIncomeCategories(data.customIncomeCategories || []);
            setCustomAssetCategories(data.customAssetCategories || []);
            setCategoryColors(data.categoryColors || {});
            setCategoryLabels(data.categoryLabels || {});
            setCategoryBudgetExcluded(data.categoryBudgetExcluded || {});
            setCategoryOrder(data.categoryOrder || {});
            setHiddenCategories(data.hiddenCategories || {});
            setHiddenAssets(data.hiddenAssets || {});
            setRecurringRules(data.recurringRules || []);
            setDeletedRecurringTxs(data.deletedRecurringTxs || []);
            setUpdatedAt(serverUpdatedAt);
            serverUpdatedAtRef.current = serverUpdatedAt;
            syncCursorRef.current = Number(data.cursor) || 0;
            window.localStorage.setItem(SYNC_CURSOR_KEY, String(syncCursorRef.current));
            window.localStorage.removeItem(PENDING_SYNC_KEY);
            if (Array.isArray(data.plans)) {
              setPlans(data.plans);
            }
            if (fetchedTxs.length > 0) {
              const completedTransactions = fetchedTxs.filter((transaction: Transaction) => transaction.date <= getToday());
              const referenceTransactions = completedTransactions.length > 0 ? completedTransactions : fetchedTxs;
              const latestDate = referenceTransactions.reduce((latest: string, t: Transaction) => (t.date > latest ? t.date : latest), referenceTransactions[0].date);
              if (latestDate && latestDate.length >= 7) {
                setSelectedMonth(latestDate.slice(0, 7));
              }
            }
            setRemoteSync({
              status: 'synced',
              localUpdatedAt: serverUpdatedAt,
              remoteUpdatedAt: serverUpdatedAt,
              message: '서버 데이터 적용됨',
            });
            showNotice('최신 서버 데이터를 불러왔습니다.', '동기화 완료', 'success');
          } else {
            // 로컬 데이터가 더 최신이거나 DB가 완전히 비어있음
            if (
              transactions.length > 0 ||
              assets.length > 0 ||
              customExpenseCategories.length > 0 ||
              customIncomeCategories.length > 0 ||
              customAssetCategories.length > 0 ||
              Object.keys(categoryColors).length > 0 ||
              Object.keys(categoryLabels).length > 0 ||
              Object.keys(categoryBudgetExcluded).length > 0 ||
              Object.keys(categoryOrder).length > 0 ||
              Object.keys(hiddenCategories).length > 0 ||
              recurringRules.length > 0 ||
              deletedRecurringTxs.length > 0
            ) {
              const newTime = Date.now();
              setUpdatedAt(newTime);
              void saveRemoteD1(
                transactions,
                assets,
                budget,
                theme,
                plans,
                customExpenseCategories,
                customIncomeCategories,
                customAssetCategories,
                categoryColors,
                categoryLabels,
                categoryBudgetExcluded,
                categoryOrder,
                hiddenCategories,
                recurringRules,
                deletedRecurringTxs,
                newTime,
                serverUpdatedAtRef.current
              )
                .then((res) => {
                  if (!res.ok) throw new Error('remote save failed');
                  window.localStorage.removeItem(PENDING_SYNC_KEY);
                  setRemoteSync({
                    status: 'synced',
                    localUpdatedAt: newTime,
                    remoteUpdatedAt: newTime,
                    checkedAt: Date.now(),
                    message: '로컬 데이터 서버 반영 완료',
                  });
                })
                .catch(() => {
                  setRemoteSync({
                    status: 'error',
                    localUpdatedAt: newTime,
                    checkedAt: Date.now(),
                    message: '서버 저장 실패 - 로컬에는 보관됨',
                  });
                });
            }
          }
        }
      })
      .catch(() => {
        setRemoteSync({
          status: 'error',
          localUpdatedAt: storedData.updatedAt || 0,
          message: '서버 확인 실패 - 로컬 데이터 사용 중',
        });
      })
      .finally(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          isDbLoadedRef.current = true;
          setIsLoading(false);
        }, remaining);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Migrate legacy non-recurring ID formats for transactions matching active rules
  useEffect(() => {
    if (isLoading || recurringRules.length === 0) return;

    setTransactions((prev) => {
      let migrated = false;
      const next = prev.map((tx) => {
        const txMonth = tx.date.slice(0, 7);
        if (!tx.recurringRuleId && !tx.id.startsWith('rec_')) {
          return tx;
        }

        const matchingRule = recurringRules.find((rule) => {
          const matchInfo = rule.type === tx.type &&
                            rule.title === tx.title &&
                            rule.amount === tx.amount &&
                            rule.category === tx.category;
          const matchDate = rule.startMonth <= txMonth &&
                            (!rule.endMonth || rule.endMonth >= txMonth);
          return matchInfo && matchDate;
        });

        if (matchingRule) {
          const hasLegacyId = !tx.id.startsWith('rec_');
          const hasMissingProp = !tx.recurringRuleId || tx.recurringRuleId !== matchingRule.id;
          
          if (hasLegacyId || hasMissingProp) {
            migrated = true;
            return {
              ...tx,
              id: `rec_${matchingRule.id}_${txMonth}`,
              recurringRuleId: matchingRule.id,
            };
          }
        }
        return tx;
      });

      return migrated ? next : prev;
    });
  }, [isLoading, recurringRules]);

  // Auto-generate recurring transactions based on recurringRules (only when date is today or past)
  useEffect(() => {
    if (isLoading || recurringRules.length === 0) return;

    const todayStr = getToday();
    const [todayYr, todayMo] = todayStr.split('-').map(Number);

    setTransactions((prev) => {
      const newTxs: Transaction[] = [];

      recurringRules.forEach((rule) => {
        let [startYear, startMonth] = rule.startMonth.split('-').map(Number);
        const [endYear, endMonth] = rule.endMonth ? rule.endMonth.split('-').map(Number) : [9999, 12];

        let yr = startYear;
        let mo = startMonth;

        while (yr < todayYr || (yr === todayYr && mo <= todayMo)) {
          if (yr > endYear || (yr === endYear && mo > endMonth)) {
            break;
          }

          const moStr = String(mo).padStart(2, '0');
          const lastDay = new Date(yr, mo, 0).getDate();
          const targetDay = Math.min(rule.day, lastDay);
          const dayStr = String(targetDay).padStart(2, '0');
          const ruleDateStr = `${yr}-${moStr}-${dayStr}`;

          // Skip future dates
          if (ruleDateStr > todayStr) {
            mo++;
            if (mo > 12) {
              mo = 1;
              yr++;
            }
            continue;
          }

          const txId = `rec_${rule.id}_${yr}-${moStr}`;

          const exists = prev.some((t) => t.id === txId);
          const isDeleted = deletedRecurringTxs.includes(txId);
          if (!exists && !isDeleted) {
            newTxs.push({
              id: txId,
              type: rule.type,
              date: ruleDateStr,
              time: normalizeTransactionTime(rule.time),
              createdAt: Date.now(),
              amount: rule.amount,
              title: rule.title,
              category: rule.category,
              assetId: rule.assetId || null,
              toAssetId: rule.toAssetId || null,
              recurringRuleId: rule.id
            });
          }

          mo++;
          if (mo > 12) {
            mo = 1;
            yr++;
          }
        }
      });

      return newTxs.length > 0 ? [...prev, ...newTxs] : prev;
    });
  }, [recurringRules, deletedRecurringTxs, isLoading]);

  // Sync calendar when selectedMonth changes
  useEffect(() => {
    setCalendarYear(Number(selectedMonth.slice(0, 4)));
    setCalendarMonth(Number(selectedMonth.slice(5, 7)) - 1);
  }, [selectedMonth]);

  // Derived Values
  const monthlyTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.date.startsWith(selectedMonth))
        .sort(compareTransactionsByDateTime),
    [transactions, selectedMonth],
  );

  const todayStr = getToday();
  const monthlyExpenses = monthlyTransactions.filter((transaction) => transaction.type === 'expense' && transaction.date <= todayStr);
  const monthlyIncomes = monthlyTransactions.filter(
    (transaction) => transaction.type === 'income' && transaction.date <= todayStr && !isOpeningBalanceTransaction(transaction),
  );
  const expenseTotal = sumAmount(monthlyExpenses);
  const incomeTotal = sumAmount(monthlyIncomes);

  const ledgerMonthlySummaries = useMemo(() => {
    const year = selectedMonth.slice(0, 4);
    return Array.from({ length: 12 }, (_, index) => {
      const monthNumber = 12 - index;
      const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
      const items = transactions.filter((transaction) => transaction.date.startsWith(month));
      return {
        month,
        label: `${monthNumber}월`,
        income: items.filter((transaction) => transaction.type === 'income' && !isOpeningBalanceTransaction(transaction)).reduce((sum, transaction) => sum + transaction.amount, 0),
        expense: items.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
      };
    }).filter((summary) => summary.income > 0 || summary.expense > 0);
  }, [transactions, selectedMonth]);

  const ledgerWeeklySummaries = useMemo(() => {
    const [year, month] = (expandedLedgerMonth ?? selectedMonth).split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const start = new Date(year, month - 1, 1 - firstDay.getDay());
    const end = new Date(year, month - 1, lastDay.getDate() + (6 - lastDay.getDay()));
    const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const weeks: Array<{ start: string; end: string; label: string; income: number; expense: number }> = [];

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
      const weekStart = formatDate(cursor);
      const weekEndDate = new Date(cursor);
      weekEndDate.setDate(weekEndDate.getDate() + 6);
      const weekEnd = formatDate(weekEndDate);
      const items = transactions.filter((transaction) => transaction.date >= weekStart && transaction.date <= weekEnd);
      weeks.push({
        start: weekStart,
        end: weekEnd,
        label: `${cursor.getMonth() + 1}. ${cursor.getDate()}. ~ ${weekEndDate.getMonth() + 1}. ${weekEndDate.getDate()}.`,
        income: items.filter((transaction) => transaction.type === 'income' && !isOpeningBalanceTransaction(transaction)).reduce((sum, transaction) => sum + transaction.amount, 0),
        expense: items.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0),
      });
    }

    return weeks.reverse();
  }, [transactions, expandedLedgerMonth, selectedMonth, isOpeningBalanceTransaction]);
  
  const getAssetOpeningBalance = useCallback((asset: AssetItem) => {
    let openingBalance = 0;
    for (const transaction of transactions) {
      if (!isOpeningBalanceTransaction(transaction)) continue;
      if (transaction.type === 'income' && transaction.assetId === asset.id) openingBalance += transaction.amount;
      else if (transaction.type === 'expense' && transaction.assetId === asset.id) openingBalance -= transaction.amount;
      else if (transaction.type === 'transfer') {
        if (transaction.assetId === asset.id) openingBalance -= transaction.amount;
        if (transaction.toAssetId === asset.id) openingBalance += transaction.amount;
      }
    }
    return openingBalance || Number(asset.amount) || 0;
  }, [transactions, isOpeningBalanceTransaction]);

  const getAssetFlow = useCallback((assetId: string) => {
    let flow = 0;
    for (const transaction of transactions) {
      const isScheduledInstallment = Boolean(transaction.installmentGroupId && transaction.installmentMonths && transaction.installmentMonths > 1);
      if ((transaction.date > todayStr && !isScheduledInstallment) || isOpeningBalanceTransaction(transaction)) continue;
      if (transaction.type === 'income' && transaction.assetId === assetId) flow += transaction.amount;
      else if (transaction.type === 'expense' && transaction.assetId === assetId) flow -= transaction.amount;
      else if (transaction.type === 'transfer') {
        if (transaction.assetId === assetId) flow -= transaction.amount;
        if (transaction.toAssetId === assetId) flow += transaction.amount;
      }
    }
    return flow;
  }, [transactions, todayStr, isOpeningBalanceTransaction]);

  const getAssetBalance = useCallback(
    (assetId: string, openingBalance: number) => (Number(openingBalance) || 0) + getAssetFlow(assetId),
    [getAssetFlow],
  );

  const getNetAssetBalance = useCallback(
    (asset: AssetItem) => {
      const balance = getAssetBalance(asset.id, getAssetOpeningBalance(asset));
      return isLiabilityAsset(asset, allAssetCategories, categoryLabels) ? -Math.abs(balance) : balance;
    },
    [getAssetBalance, getAssetOpeningBalance, allAssetCategories, categoryLabels],
  );

  const assetTotal = useMemo(() => {
    return assets.reduce((sum, asset) => sum + getNetAssetBalance(asset), 0);
  }, [assets, getNetAssetBalance]);
  
  const recurringExpenseTotal = useMemo(() => {
    return recurringRules
      .filter((rule) => {
        const isStarted = rule.startMonth <= selectedMonth;
        const isNotEnded = !rule.endMonth || rule.endMonth >= selectedMonth;
        return rule.type === 'expense' && isStarted && isNotEnded;
      })
      .reduce((sum, rule) => sum + rule.amount, 0);
  }, [recurringRules, selectedMonth]);

  const balance = incomeTotal - expenseTotal;
  const maxFlow = Math.max(expenseTotal, incomeTotal, assetTotal, 1);
  const budgetedMonthlyExpenses = useMemo(
    () => monthlyExpenses.filter((transaction) => !categoryBudgetExcluded[getCategoryColorKey('expense', transaction.category)]),
    [monthlyExpenses, categoryBudgetExcluded]
  );
  const budgetedExpenseTotal = sumAmount(budgetedMonthlyExpenses);

  // Plans derived values
  const plannedExpenseTotal = useMemo(
    () => plans
      .filter((p) => p.type === 'expense' && !categoryBudgetExcluded[getCategoryColorKey('expense', p.category)])
      .reduce((sum, p) => sum + p.plannedAmount, 0),
    [plans, categoryBudgetExcluded]
  );
  const plannedIncomeTotal = useMemo(
    () => plans.filter(p => p.type === 'income').reduce((sum, p) => sum + p.plannedAmount, 0),
    [plans]
  );
  const monthlyBudgetTotal = plannedExpenseTotal;
  const plannedNetTotal = plannedIncomeTotal - plannedExpenseTotal;

  // Budget calculations
  const budgetPercent = monthlyBudgetTotal > 0 ? Math.min(Math.round((budgetedExpenseTotal / monthlyBudgetTotal) * 100), 200) : 0;
  const budgetRemaining = monthlyBudgetTotal - budgetedExpenseTotal;
  const budgetTone = budgetPercent >= 100 ? 'danger' : budgetPercent >= 80 ? 'warn' : 'safe';

  // Category summary calculations
  const expenseSummary = useMemo(() => {
    return monthlyExpenses.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amount;
      return acc;
    }, {});
  }, [monthlyExpenses]);

  const incomeSummary = useMemo(() => {
    return monthlyIncomes.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amount;
      return acc;
    }, {});
  }, [monthlyIncomes]);

  const expenseSettlementList = useMemo(() => {
    return activeExpenseCategories.map((c: CategoryOption) => {
      const plan = plans.find((p) => (p.category === c.id || p.category === c.label || (c.label === '기타' && (p.category === 'etc' || p.category === 'import-기타'))) && p.type === 'expense');
      const budget = plan ? plan.plannedAmount : 0;
      const isExcluded = Boolean(categoryBudgetExcluded[getCategoryColorKey('expense', c.id)]);
      const catTransactions = monthlyExpenses.filter((t) => t.category === c.id || t.category === c.label || (c.label === '기타' && (t.category === 'etc' || t.category === 'import-기타')));
      const spent = catTransactions.reduce((sum, t) => sum + t.amount, 0);
      const percent = budget > 0 ? Math.round((spent / budget) * 100) : spent > 0 ? 100 : 0;
      const diff = budget - spent;
      const isOver = budget > 0 ? spent > budget : spent > 0;

      return {
        category: c,
        budget,
        spent,
        percent,
        diff,
        isOver,
        isExcluded,
        transactions: catTransactions,
      };
    });
  }, [activeExpenseCategories, plans, monthlyExpenses, categoryBudgetExcluded]);

  const incomeSettlementList = useMemo(() => {
    return activeIncomeCategories.map((c: CategoryOption) => {
      const plan = plans.find((p) => (p.category === c.id || p.category === c.label || (c.label === '기타' && (p.category === 'etc' || p.category === 'import-기타'))) && p.type === 'income');
      const target = plan ? plan.plannedAmount : 0;
      const catTransactions = monthlyIncomes.filter((t) => t.category === c.id || t.category === c.label || (c.label === '기타' && (t.category === 'etc' || t.category === 'import-기타')));
      const actual = catTransactions.reduce((sum, t) => sum + t.amount, 0);
      const percent = target > 0 ? Math.round((actual / target) * 100) : actual > 0 ? 100 : 0;
      const diff = actual - target;
      const isAchieved = target > 0 ? actual >= target : actual > 0;

      return {
        category: c,
        target,
        actual,
        percent,
        diff,
        isAchieved,
        transactions: catTransactions,
      };
    });
  }, [activeIncomeCategories, plans, monthlyIncomes]);

  const assetSummary = useMemo(() => {
    return activeAssets.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + getNetAssetBalance(item);
      return acc;
    }, {});
  }, [activeAssets, getNetAssetBalance]);

  const assetAllocation = useMemo(() => {
    return activeAssets
      .map((asset) => {
        const category = allAssetCategories.find((item) => item.id === asset.category || item.label === asset.category);
        const value = getNetAssetBalance(asset);
        const liability = isLiabilityAsset(asset, allAssetCategories, categoryLabels) || value < 0;
        return {
          id: asset.id,
          categoryId: category?.id ?? asset.category,
          label: formatAssetLabel(asset, allAssetCategories),
          value,
          liability,
          color: liability ? '#ef4444' : category?.color || '#64748b',
        };
      })
      .filter((item) => item.value !== 0)
      .sort((a, b) => {
        const categoryOrder = allAssetCategories.findIndex((category) => category.id === a.categoryId)
          - allAssetCategories.findIndex((category) => category.id === b.categoryId);
        return categoryOrder || a.label.localeCompare(b.label, 'ko');
      });
  }, [activeAssets, allAssetCategories, categoryLabels, getNetAssetBalance]);

  const assetCategoryAllocation = useMemo(() => {
    const grouped = new Map<string, { id: string; label: string; value: number; liability: boolean; color: string }>();
    assetAllocation.forEach((asset) => {
      const existing = grouped.get(asset.categoryId);
      if (existing) {
        existing.value += asset.value;
        return;
      }
      const category = allAssetCategories.find((item) => item.id === asset.categoryId);
      grouped.set(asset.categoryId, {
        id: asset.categoryId,
        label: category?.label ?? asset.categoryId,
        value: asset.value,
        liability: asset.liability,
        color: asset.liability ? '#ef4444' : category?.color || asset.color,
      });
    });
    return Array.from(grouped.values()).filter((item) => item.value !== 0);
  }, [assetAllocation, allAssetCategories]);

  const grossAssetTotal = useMemo(
    () => assetAllocation.filter((item) => item.value > 0).reduce((sum, item) => sum + item.value, 0),
    [assetAllocation],
  );

  const liabilityTotal = useMemo(
    () => assetAllocation.filter((item) => item.value < 0).reduce((sum, item) => sum + Math.abs(item.value), 0),
    [assetAllocation],
  );

  const assetDistributionTotal = grossAssetTotal;

  const expenseFlowSegments = useMemo(
    () => buildCategorySegments(activeExpenseCategories, expenseSummary),
    [activeExpenseCategories, expenseSummary]
  );

  const incomeFlowSegments = useMemo(
    () => buildCategorySegments(activeIncomeCategories, incomeSummary),
    [activeIncomeCategories, incomeSummary]
  );

  const assetFlowSegments = useMemo(
    () => (showAssetDetails ? assetAllocation : assetCategoryAllocation).filter((item) => !item.liability).map((item) => ({
      id: item.id,
      label: item.label,
      value: Math.abs(item.value),
      color: item.color,
    })),
    [assetAllocation, assetCategoryAllocation, showAssetDetails],
  );

  // Filtered Transactions for Ledger view
  const filteredLedgerTransactions = useMemo(() => {
    return monthlyTransactions.filter((transaction) => {
      const matchSearch = transaction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          getCategoryLabel(transaction.type === 'expense' ? allExpenseCategories : allIncomeCategories, transaction.category)
                            .toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = filterCategory === 'all' || transaction.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [monthlyTransactions, searchTerm, filterCategory, allExpenseCategories, allIncomeCategories]);

  // Actions
  async function handleAddTransaction(transaction: Transaction) {
    try {
      const result = await saveTransactionOperation({ op: 'transaction.create', transaction });
      const saved = result.transaction;
      if (!saved) throw new Error('TRANSACTION_SAVE_FAILED');
      skipNextPersistenceRef.current = true;
      setTransactions((prev) => [saved, ...prev]);
      const transactionMonth = saved.date.slice(0, 7);
      if (transactionMonth !== selectedMonth) setSelectedMonth(transactionMonth);
      return true;
    } catch (error) {
      const conflict = (error as { status?: number }).status === 409;
      showNotice(
        conflict ? '같은 거래가 이미 변경되었어요. 최신 내용을 확인해 주세요.' : '거래를 저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.',
        conflict ? '거래 충돌' : '거래 저장 실패',
        'error'
      );
      return false;
    }
  }

  async function handleDeleteTransaction(id: string) {
    const current = transactions.find((transaction) => transaction.id === id);
    if (!current) return false;
    if (id.startsWith('rec_')) {
      setDeletedRecurringTxs((prev) => [...prev, id]);
      return true;
    }
    try {
      await saveTransactionOperation({ op: 'transaction.delete', transactionId: id, expectedRevision: current.revision ?? 1 });
      skipNextPersistenceRef.current = true;
      setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
      return true;
    } catch (error) {
      showNotice('거래를 삭제하지 못했습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.', '거래 삭제 실패', 'error');
      return false;
    }
  }

  async function handleUpdateTransaction(oldId: string, updated: Transaction) {
    const current = transactions.find((transaction) => transaction.id === oldId);
    if (!current) return false;
    try {
      const result = await saveTransactionOperation({
        op: 'transaction.update',
        transaction: { ...updated, id: oldId },
        expectedRevision: current.revision ?? 1,
      });
      const saved = result.transaction;
      if (!saved) throw new Error('TRANSACTION_SAVE_FAILED');
      skipNextPersistenceRef.current = true;
      setTransactions((prev) => prev.map((transaction) => transaction.id === oldId ? saved : transaction));
      setEditingTransaction(null);
      return true;
    } catch (error) {
      const currentServer = (error as { current?: { transaction?: Transaction } }).current?.transaction;
      if (currentServer) {
        skipNextPersistenceRef.current = true;
        setTransactions((prev) => prev.map((transaction) => transaction.id === oldId ? currentServer : transaction));
      }
      showNotice('다른 기기에서 먼저 수정했어요. 입력 내용은 그대로 두었으니 최신 내용을 확인한 뒤 다시 저장해 주세요.', '거래 충돌', 'warning');
      return false;
    }
  }

  function handleAddRecurringRule(rule: RecurringRule) {
    setRecurringRules((prev) => [...prev, rule]);
  }

  function handleUpdateRecurringRule(updated: RecurringRule) {
    setRecurringRules((prev) =>
      prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
    );
  }

  function handleStopRecurringRule(id: string) {
    setRecurringRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const targetEndMonth = selectedMonth < r.startMonth ? r.startMonth : selectedMonth;
        return { ...r, endMonth: targetEndMonth };
      })
    );
    showNotice('다음 달부터 반복 기록이 중단됩니다.', '정기 기록 중지', 'success');
  }

  function handleStopRecurringFromTx(txIdOrRuleId: string, stopMonth?: string) {
    let ruleId = txIdOrRuleId;
    let txMonth = stopMonth || selectedMonth;

    if (txIdOrRuleId.startsWith('rec_')) {
      const lastUnderscoreIndex = txIdOrRuleId.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) return;
      ruleId = txIdOrRuleId.substring(4, lastUnderscoreIndex);
      txMonth = txIdOrRuleId.substring(lastUnderscoreIndex + 1); // "YYYY-MM"
    }
    
    setRecurringRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const targetEndMonth = txMonth < r.startMonth ? r.startMonth : txMonth;
        return { ...r, endMonth: targetEndMonth };
      })
    );
    showNotice(`${txMonth}월까지 유지되고 다음 달부터 중단됩니다.`, '정기 기록 중지', 'success');
  }

  function handleDeleteRecurringRule(id: string) {
    const targetRule = recurringRules.find((r) => r.id === id);
    if (targetRule && !targetRule.endMonth) {
      showNotice('먼저 이달부터 끊기를 눌러 정기 기록을 중단한 뒤 삭제할 수 있습니다.', '삭제 전 중단 필요', 'warning');
      return;
    }

    requestConfirm({
      title: '정기 기록 목록에서 삭제',
      message: '이 정기 기록 규칙을 목록에서 완전히 삭제할까요?\n\n※ 이미 장부 및 달력에 기록된 지난 거래 내역은 삭제되지 않고 안전하게 유지됩니다.',
      confirmLabel: '목록에서 삭제',
      tone: 'danger',
      onConfirm: () => {
        setRecurringRules((prev) => prev.filter((r) => r.id !== id));
        showNotice('정기 기록 규칙이 관리 목록에서 삭제되었습니다.', '삭제 완료', 'success');
      },
    });
  }

  async function handleAddAsset(asset: AssetItem) {
    const openingTransaction: Transaction | null = asset.amount > 0 ? {
      id: createId(),
      type: 'income',
      date: todayStr,
      time: new Date().toTimeString().slice(0, 5),
      amount: asset.amount,
      title: '기초 잔액',
      category: openingBalanceCategoryId,
      assetId: asset.id,
    } : null;
    setRemoteSync({ status: 'saving', message: '자산을 저장 중' });
    try {
      const response = await saveAssetMutation({ op: 'asset.create', asset, openingTransaction });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'asset create failed');
      skipNextPersistenceRef.current = true;
      setAssets((previous) => {
        const next = [payload.asset as AssetItem, ...previous];
        assetsRef.current = next;
        return next;
      });
      if (payload.transaction) setTransactions((previous) => [payload.transaction as Transaction, ...previous]);
      setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '자산 저장 완료' });
      return true;
    } catch {
      setRemoteSync({ status: 'error', checkedAt: Date.now(), message: '자산을 저장하지 못함' });
      showNotice('자산을 저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.', '자산 등록 실패', 'error');
      return false;
    }
  }

  async function handleUpdateAsset(updated: AssetItem) {
    const current = assetsRef.current.find((asset) => asset.id === updated.id);
    if (!current) return false;
    setRemoteSync({ status: 'saving', message: '자산 정보를 저장 중' });
    try {
      const response = await saveAssetMutation({ op: 'asset.update', asset: updated, expectedRevision: current.revision || 1 });
      const payload = await response.json();
      if (response.status === 409) {
        setRemoteSync({ status: 'stale', checkedAt: Date.now(), message: '다른 기기에서 자산 정보가 변경됨' });
        showNotice('다른 기기에서 이 자산을 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 수정해 주세요.', '자산 수정 충돌', 'warning');
        return false;
      }
      if (!response.ok) throw new Error(payload.error || 'asset update failed');
      skipNextPersistenceRef.current = true;
      setAssets((previous) => {
        const next = previous.map((asset) => asset.id === updated.id ? payload.asset as AssetItem : asset);
        assetsRef.current = next;
        return next;
      });
      setEditingAsset(null);
      setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '자산 정보 저장 완료' });
      return true;
    } catch {
      setRemoteSync({ status: 'error', checkedAt: Date.now(), message: '자산 정보를 저장하지 못함' });
      showNotice('자산 정보를 저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.', '자산 수정 실패', 'error');
      return false;
    }
  }

  function handleAssetBalanceAdjustment(asset: AssetItem, nextBalance: number) {
    const currentBalance = getAssetBalance(asset.id, getAssetOpeningBalance(asset));
    const difference = nextBalance - currentBalance;
    if (!difference) return;
    handleAddTransaction({
      id: createId(),
      type: difference > 0 ? 'income' : 'expense',
      date: todayStr,
      time: new Date().toTimeString().slice(0, 5),
      amount: Math.abs(difference),
      title: '자산 잔액 조정',
      category: 'etc',
      assetId: asset.id,
    });
  }

  async function handleCardSettlement(asset: AssetItem, period: CardPaymentPeriod) {
    const paymentAssetId = asset.cardPaymentAssetId;
    if (!paymentAssetId) return false;
    const operationId = createId();
    const settlementId = createId();
    const transactionId = createId();
    setRemoteSync({ status: 'saving', message: '카드 결제 처리 중' });
    try {
      const response = await saveAssetMutation({
        op: 'card.settle',
        operationId,
        settlementId,
        transactionId,
        cardAssetId: asset.id,
        paymentAssetId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: period.dueDate,
        settledDate: todayStr,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'CARD_SETTLEMENT_FAILED');
      skipNextPersistenceRef.current = true;
      const settledIds = new Set<string>(payload.settledTransactionIds || []);
      setTransactions((previous) => [payload.transaction as Transaction, ...previous.map((transaction) => settledIds.has(transaction.id) ? { ...transaction, cardSettlementId: payload.settlement.id, revision: (transaction.revision ?? 1) + 1 } : transaction)]);
      setCardSettlements((previous) => [payload.settlement as CardSettlement, ...previous]);
      setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '카드 결제 처리 완료' });
      showNotice('결제 계좌 이체와 카드 결제 완료 처리를 기록했습니다.', '결제 처리 완료', 'success');
      return true;
    } catch (error) {
      const conflict = (error as { message?: string }).message === 'REVISION_CONFLICT';
      setRemoteSync({ status: conflict ? 'stale' : 'error', checkedAt: Date.now(), message: conflict ? '이미 처리된 결제 기간' : '카드 결제 처리 실패' });
      showNotice(conflict ? '이 청구 기간은 다른 기기에서 이미 처리되었습니다. 최신 이력을 확인해 주세요.' : '카드 결제를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', conflict ? '결제 처리 충돌' : '결제 처리 실패', 'warning');
      return false;
    }
  }

  function handleDeleteAsset(id: string) {
    const current = assetsRef.current.find((asset) => asset.id === id);
    if (!current) return;
    const assetLabel = formatAssetLabel(current, allAssetCategories);

    // Count linked transactions
    const linkedTxs = transactions.filter((t) => t.assetId === id || t.toAssetId === id);
    const linkedCount = linkedTxs.length;

    requestConfirm({
      title: '자산 삭제',
      message: `'${assetLabel}' 자산을 삭제할까요?`,
      warningNote: linkedCount > 0
        ? `이 자산에 연결된 과거 거래 ${linkedCount}건은 안전하게 보존되며, [설정 > 자산관리]에서 언제든 다시 복원할 수 있습니다.`
        : '자산 목록에서 삭제되며, [설정 > 자산관리]에서 언제든 복원하거나 영구 삭제할 수 있습니다.',
      confirmLabel: '삭제',
      tone: 'danger',
      onConfirm: () => {
        setHiddenAssets((prev) => ({ ...prev, [id]: true }));
        showNotice(`'${assetLabel}' 자산이 삭제(보관)되었습니다. [설정 > 자산관리]에서 복원할 수 있습니다.`, '자산 보관', 'success');
      },
    });
  }

  function handleToggleHideAsset(assetId: string, hide: boolean) {
    const asset = assets.find((a) => a.id === assetId);
    const assetLabel = asset ? formatAssetLabel(asset, allAssetCategories) : '자산';
    if (hide) {
      const linkedCount = transactions.filter((t) => t.assetId === assetId || t.toAssetId === assetId).length;
      requestConfirm({
        title: '자산 숨김(보관)',
        message: `'${assetLabel}' 자산을 숨김 처리할까요?`,
        warningNote: linkedCount > 0
          ? `과거 거래 내역 ${linkedCount}건은 안전하게 보존되며, 자산 탭 목록에서만 숨겨집니다. 설정에서 언제든 복원할 수 있습니다.`
          : '자산 탭 목록에서 숨겨지며, 설정에서 언제든 다시 복원할 수 있습니다.',
        confirmLabel: '숨기기',
        tone: 'danger',
        onConfirm: () => {
          setHiddenAssets((prev) => ({ ...prev, [assetId]: true }));
          showNotice(`'${assetLabel}' 자산을 숨김 보관했습니다.`, '자산 숨김', 'success');
        },
      });
    } else {
      setHiddenAssets((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
      showNotice(`'${assetLabel}' 자산을 다시 자산 탭에 표시합니다.`, '자산 복원', 'success');
    }
  }

  function handlePermanentDeleteAsset(assetId: string) {
    const asset = assets.find((a) => a.id === assetId);
    const assetLabel = asset ? formatAssetLabel(asset, allAssetCategories) : '자산';
    const linkedCount = transactions.filter((t) => t.assetId === assetId || t.toAssetId === assetId).length;

    if (linkedCount > 0) {
      showNotice(`이 자산은 거래 내역 ${linkedCount}건이 연결되어 있어 영구 삭제할 수 없습니다. 대신 숨김 보관을 이용해 주세요.`, '영구 삭제 불가', 'warning');
      return;
    }

    requestConfirm({
      title: '자산 영구 삭제',
      message: `'${assetLabel}' 자산을 완전히 삭제할까요?`,
      warningNote: '이 자산은 연결된 거래가 없으므로 서버 데이터베이스에서 영구적으로 삭제됩니다.',
      confirmLabel: '영구 삭제',
      tone: 'danger',
      onConfirm: () => {
        setHiddenAssets((prev) => {
          const next = { ...prev };
          delete next[assetId];
          return next;
        });
        void executeDeleteAsset(assetId);
      },
    });
  }

  async function executeDeleteAsset(id: string) {
    const current = assetsRef.current.find((asset) => asset.id === id);
    if (!current) return false;
    setRemoteSync({ status: 'saving', message: '자산을 삭제 중' });
    try {
      const response = await saveAssetMutation({ op: 'asset.delete', assetId: id, expectedRevision: current.revision || 1 });
      const payload = await response.json();
      if (response.status === 409) {
        setRemoteSync({ status: 'stale', checkedAt: Date.now(), message: '다른 기기에서 자산 정보가 변경됨' });
        showNotice('다른 기기에서 이 자산을 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.', '자산 삭제 충돌', 'warning');
        return false;
      }
      if (!response.ok) throw new Error(payload.error || 'asset delete failed');
      skipNextPersistenceRef.current = true;
      setAssets((previous) => {
        const next = previous.filter((asset) => asset.id !== id);
        assetsRef.current = next;
        return next;
      });
      setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '자산 삭제 완료' });
      showNotice('자산이 삭제되었습니다.', '삭제 완료', 'success');
      return true;
    } catch {
      setRemoteSync({ status: 'error', checkedAt: Date.now(), message: '자산을 삭제하지 못함' });
      showNotice('자산을 삭제하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.', '자산 삭제 실패', 'error');
      return false;
    }
  }

  function rememberAssetOrderBeforeDrag(assetId: string) {
    const source = assetsRef.current.find((asset) => asset.id === assetId);
    if (!source) return;
    const categoryId = getAssetCategoryGroupId(source);
    assetOrderBeforeDragRef.current = {
      categoryId,
      sourceId: assetId,
      assetIds: assetsRef.current
        .filter((asset) => getAssetCategoryGroupId(asset) === categoryId)
        .map((asset) => asset.id),
    };
  }

  function restoreAssetOrder(categoryId: string, assetIds: string[]) {
    skipNextPersistenceRef.current = true;
    setAssets((previous) => {
      const byId = new Map(previous.map((asset) => [asset.id, asset]));
      const restored = assetIds.map((id) => byId.get(id)).filter((asset): asset is AssetItem => Boolean(asset));
      let index = 0;
      const next = previous.map((asset) => (
        getAssetCategoryGroupId(asset) === categoryId ? (restored[index++] || asset) : asset
      ));
      assetsRef.current = next;
      return next;
    });
  }

  function applyAssetOrderResponse(
    categoryId: string,
    payload: { assets?: AssetItem[]; revision?: number },
    fallbackRevision: number,
  ) {
    const returnedAssets = Array.isArray(payload.assets) ? payload.assets : [];
    const savedById = new Map<string, AssetItem>(returnedAssets.map((asset) => [asset.id, asset]));
    assetOrderRevisionsRef.current[categoryId] = Number(payload.revision) || fallbackRevision;
    if (savedById.size === 0) return;

    skipNextPersistenceRef.current = true;
    setAssets((previous) => {
      const updated = previous.map((asset) => savedById.get(asset.id) || asset);
      const updatedById = new Map(updated.map((asset) => [asset.id, asset]));
      const ordered = returnedAssets
        .map((asset) => updatedById.get(asset.id) || asset)
        .filter((asset) => getAssetCategoryGroupId(asset) === categoryId);
      let index = 0;
      const next = updated.map((asset) => (
        getAssetCategoryGroupId(asset) === categoryId ? (ordered[index++] || asset) : asset
      ));
      assetsRef.current = next;
      return next;
    });
  }

  function persistAssetOrder(categoryId: string) {
    const beforeDrag = assetOrderBeforeDragRef.current;
    assetOrderBeforeDragRef.current = null;
    const orderedAssets = assetsRef.current.filter((asset) => getAssetCategoryGroupId(asset) === categoryId);
    if (orderedAssets.length < 2 || !beforeDrag || beforeDrag.categoryId !== categoryId) return;
    const assetIds = orderedAssets.map((asset) => asset.id);
    if (assetIds.every((id, index) => id === beforeDrag.assetIds[index])) return;

    const save = async () => {
      const expectedRevision = assetOrderRevisionsRef.current[categoryId] || 0;
      const operationId = createId();
      setRemoteSync({ status: 'saving', message: '자산 순서를 저장 중' });
      try {
      const response = await saveAssetOrder(categoryId, assetIds, expectedRevision, operationId);
      const payload = await response.json();
      if (response.status === 409) {
        const latestAssets = Array.isArray(payload.assets) ? payload.assets as AssetItem[] : [];
        const latestIds = latestAssets.map((asset) => asset.id);
        const sourceIndex = assetIds.indexOf(beforeDrag.sourceId);
        const sourceExists = latestIds.includes(beforeDrag.sourceId);

        if (sourceIndex < 0 || !sourceExists) {
          applyAssetOrderResponse(categoryId, payload, expectedRevision);
          setRemoteSync({ status: 'stale', checkedAt: Date.now(), message: '자산 순서가 최신 상태로 갱신됨' });
          showNotice('자산 목록이 변경되어 최신 순서를 불러왔습니다. 다시 정렬해 주세요.', '자산 순서 갱신', 'warning');
          return;
        }

        const previousId = assetIds[sourceIndex - 1];
        const nextId = assetIds[sourceIndex + 1];
        const rebasedIds = latestIds.filter((id) => id !== beforeDrag.sourceId);
        const previousIndex = previousId ? rebasedIds.indexOf(previousId) : -1;
        const nextIndex = nextId ? rebasedIds.indexOf(nextId) : -1;
        const insertIndex = previousIndex >= 0 ? previousIndex + 1 : nextIndex >= 0 ? nextIndex : rebasedIds.length;
        rebasedIds.splice(insertIndex, 0, beforeDrag.sourceId);

        const retryRevision = Number(payload.revision) || expectedRevision;
        const retryResponse = await saveAssetOrder(categoryId, rebasedIds, retryRevision, createId());
        const retryPayload = await retryResponse.json();
        if (!retryResponse.ok) {
          applyAssetOrderResponse(categoryId, retryPayload, retryRevision);
          setRemoteSync({ status: 'stale', checkedAt: Date.now(), message: '자산 순서를 최신 상태로 갱신함' });
          showNotice('순서가 동시에 변경되어 최신 순서를 불러왔습니다. 다시 정렬해 주세요.', '자산 순서 갱신', 'warning');
          return;
        }

        applyAssetOrderResponse(categoryId, retryPayload, retryRevision + 1);
        setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '최신 순서에 반영해 저장 완료' });
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'asset order save failed');

      applyAssetOrderResponse(categoryId, payload, expectedRevision + 1);
      setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '자산 순서 저장 완료' });
      } catch {
      restoreAssetOrder(categoryId, beforeDrag.assetIds);
      setRemoteSync({ status: 'error', checkedAt: Date.now(), message: '자산 순서를 저장하지 못함' });
      showNotice('순서를 저장하지 못해 이전 순서로 되돌렸습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.', '자산 순서 저장 실패', 'error');
      }
    };
    assetOrderSaveQueueRef.current = assetOrderSaveQueueRef.current.then(save, save);
    return assetOrderSaveQueueRef.current;
  }

  function clearAssetHandleDragVisual() {
    const moveListener = assetHandleDragRef.current.moveListener;
    if (moveListener) {
      window.removeEventListener('pointermove', moveListener);
      assetHandleDragRef.current.moveListener = null;
    }
    const releaseListener = assetHandleDragRef.current.releaseListener;
    if (releaseListener) {
      window.removeEventListener('pointerup', releaseListener);
      window.removeEventListener('pointercancel', releaseListener);
      assetHandleDragRef.current.releaseListener = null;
    }
    assetHandleDragRef.current.ghost?.remove();
    assetHandleDragRef.current.ghost = null;
    assetHandleDragRef.current.sourceRow = null;
    document.body.classList.remove('asset-handle-drag-active');
    setAssetHandleDragVisual({ id: null, targetId: null });
  }

  function startAssetHandleDrag(event: React.PointerEvent<HTMLSpanElement>, assetId: string) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    rememberAssetOrderBeforeDrag(assetId);
    clearAssetHandleDragVisual();
    const sourceRow = event.currentTarget.closest<HTMLElement>('[data-asset-id]');
    const sourceRect = sourceRow?.getBoundingClientRect();
    assetHandleDragRef.current = {
      id: assetId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: sourceRect ? event.clientX - sourceRect.left : 0,
      grabOffsetY: sourceRect ? event.clientY - sourceRect.top : 0,
      targetId: null,
      active: true,
      moved: false,
      justDragged: false,
      ghost: null,
      sourceRow: sourceRow || null,
      moveListener: null,
      releaseListener: null,
    };
    const moveListener = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== assetHandleDragRef.current.pointerId) return;
      nativeEvent.preventDefault();
      moveAssetHandleDrag(nativeEvent.clientX, nativeEvent.clientY);
    };
    const releaseListener = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== assetHandleDragRef.current.pointerId) return;
      completeAssetHandleDrag(nativeEvent.type === 'pointercancel');
    };
    assetHandleDragRef.current.moveListener = moveListener;
    assetHandleDragRef.current.releaseListener = releaseListener;
    window.addEventListener('pointermove', moveListener, { passive: false });
    window.addEventListener('pointerup', releaseListener);
    window.addEventListener('pointercancel', releaseListener);
  }

  function moveAssetHandleDrag(clientX: number, clientY: number) {
    const gesture = assetHandleDragRef.current;
    if (!gesture.active) return;
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < 5) return;
    if (!gesture.moved) {
      gesture.moved = true;
      const sourceRow = gesture.sourceRow;
      if (sourceRow) {
        const rect = sourceRow.getBoundingClientRect();
        const ghost = sourceRow.cloneNode(true) as HTMLElement;
        ghost.classList.remove('asset-handle-drag-source', 'asset-handle-drag-target');
        ghost.classList.add('sortable-drag-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = `${clientX - gesture.grabOffsetX}px`;
        ghost.style.top = `${clientY - gesture.grabOffsetY}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.style.opacity = '0.96';
        ghost.style.boxShadow = '0 14px 30px rgba(15, 23, 42, 0.24)';
        document.body.appendChild(ghost);
        gesture.ghost = ghost;
      }
      document.body.classList.add('asset-handle-drag-active');
      setAssetHandleDragVisual({ id: gesture.id, targetId: null });
    }
    if (gesture.ghost) {
      gesture.ghost.style.left = `${clientX - gesture.grabOffsetX}px`;
      gesture.ghost.style.top = `${clientY - gesture.grabOffsetY}px`;
    }
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-asset-id]');
    const targetId = target?.dataset.assetId;
    const targetCategoryId = target?.dataset.assetCategoryId;
    const source = assetsRef.current.find((item) => item.id === gesture.id);
    if (!targetId || !targetCategoryId || targetId === gesture.id || !source || getAssetCategoryGroupId(source) !== targetCategoryId) {
      setAssetHandleDragVisual((previous) => previous.targetId === null ? previous : { ...previous, targetId: null });
      return;
    }
    if (gesture.targetId === targetId) {
      setAssetHandleDragVisual((previous) => previous.id === gesture.id && previous.targetId === targetId ? previous : { id: gesture.id, targetId });
      return;
    }
    const currentAssets = assetsRef.current;
    const sourceIndex = currentAssets.findIndex((item) => item.id === gesture.id);
    const targetIndex = currentAssets.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextAssets = [...currentAssets];
    const [draggedAsset] = nextAssets.splice(sourceIndex, 1);
    nextAssets.splice(targetIndex, 0, draggedAsset);
    gesture.targetId = targetId;
    skipNextPersistenceRef.current = true;
    assetsRef.current = nextAssets;
    setAssets(nextAssets);
    setAssetHandleDragVisual((previous) => previous.id === gesture.id && previous.targetId === targetId ? previous : { id: gesture.id, targetId });
  }

  function completeAssetHandleDrag(cancelled = false) {
    const gesture = assetHandleDragRef.current;
    if (!gesture.active) return;
    const moved = gesture.moved;
    gesture.active = false;
    gesture.justDragged = moved;
    const targetId = gesture.targetId;
    const beforeDrag = assetOrderBeforeDragRef.current;
    const categoryId = beforeDrag?.categoryId;
    clearAssetHandleDragVisual();
    if (cancelled && moved && beforeDrag) {
      assetOrderBeforeDragRef.current = null;
      restoreAssetOrder(beforeDrag.categoryId, beforeDrag.assetIds);
    } else if (moved && categoryId && targetId && targetId !== gesture.id) {
      const currentAssets = assetsRef.current;
      const source = currentAssets.find((item) => item.id === gesture.id);
      if (source && getAssetCategoryGroupId(source) === categoryId) {
        void persistAssetOrder(categoryId);
      } else {
        assetOrderBeforeDragRef.current = null;
      }
    } else {
      assetOrderBeforeDragRef.current = null;
    }
    window.setTimeout(() => { assetHandleDragRef.current.justDragged = false; }, 0);
  }

  function handleUpdateInstallment(updated: Transaction) {
    const groupId = updated.installmentGroupId;
    if (!groupId || !updated.installmentIndex || !updated.installmentMonths) {
      handleUpdateTransaction(updated.id, updated);
      return;
    }

    setTransactions((prev) => {
      const group = prev
        .filter((transaction) => transaction.installmentGroupId === groupId)
        .sort((a, b) => (a.installmentIndex || 0) - (b.installmentIndex || 0));
      const paidBefore = group
        .filter((transaction) => (transaction.installmentIndex || 0) < updated.installmentIndex!)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const totalAmount = group.reduce((sum, transaction) => sum + transaction.amount, 0);
      const future = group.filter((transaction) => (transaction.installmentIndex || 0) > updated.installmentIndex!);
      const futureBalance = totalAmount - paidBefore - updated.amount;
      if (futureBalance < 0) return prev;

      const baseAmount = future.length ? Math.floor(futureBalance / future.length) : 0;
      const remainder = future.length ? futureBalance % future.length : 0;
      return prev.map((transaction) => {
        if (transaction.id === updated.id) return updated;
        const futureIndex = future.findIndex((item) => item.id === transaction.id);
        if (futureIndex < 0) return transaction;
        return { ...transaction, amount: baseAmount + (futureIndex < remainder ? 1 : 0) };
      });
    });
    setEditingTransaction(null);
  }

  async function handleAddTransactions(newTransactions: Transaction[]) {
    if (newTransactions.length === 0) return false;
    try {
      const result = await saveTransactionOperation({
        op: 'transaction.createBatch',
        groupId: newTransactions[0].installmentGroupId || newTransactions[0].id,
        transactions: newTransactions,
      });
      const saved = result.transactions || [];
      if (saved.length !== newTransactions.length) throw new Error('TRANSACTION_SAVE_FAILED');
      skipNextPersistenceRef.current = true;
      setTransactions((prev) => [...saved, ...prev]);
      setSelectedMonth(saved[0].date.slice(0, 7));
      return true;
    } catch {
      showNotice('할부 거래를 저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.', '할부 등록 실패', 'error');
      return false;
    }
  }

  function openAmountEntry(action: () => void) {
    if (privacyMode) {
      showNotice('금액을 확인하려면 상단 눈 아이콘을 켜 주세요.', '금액 가림 중', 'warning');
      return;
    }
    action();
  }

  function moveAssetWithinCategory(id: string, categoryId: string, targetId?: string) {
    rememberAssetOrderBeforeDrag(id);
    skipNextPersistenceRef.current = true;
    setAssets((prev) => {
      const source = prev.find((asset) => asset.id === id);
      if (!source || getAssetCategoryGroupId(source) !== categoryId) return prev;

      const groupAssets = prev.filter((asset) => getAssetCategoryGroupId(asset) === categoryId);
      const reordered = groupAssets.filter((asset) => asset.id !== id);
      const targetIndex = targetId ? reordered.findIndex((asset) => asset.id === targetId) : -1;
      if (targetIndex >= 0) reordered.splice(targetIndex, 0, source);
      else reordered.push(source);

      let groupIndex = 0;
      const next = prev.map((asset) => (
        getAssetCategoryGroupId(asset) === categoryId ? reordered[groupIndex++] : asset
      ));
      assetsRef.current = next;
      return next;
    });
    window.queueMicrotask(() => { void persistAssetOrder(categoryId); });
  }

  useEffect(() => {
    const handleTouchAssetGroupDrop = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; categoryId?: string; targetId?: string }>).detail;
      if (!detail?.id || !detail.categoryId) return;
      moveAssetWithinCategory(detail.id, detail.categoryId, detail.targetId);
    };
    window.addEventListener('mywallet:asset-group-drop', handleTouchAssetGroupDrop);
    return () => window.removeEventListener('mywallet:asset-group-drop', handleTouchAssetGroupDrop);
  }, [assets, allAssetCategories]);

  function handleCategoryColorChange(type: CategoryScope, id: string, color: string) {
    setCategoryColors((prev) => ({
      ...prev,
      [getCategoryColorKey(type, id)]: color,
    }));
  }

  function getBaseCategoryLabel(type: CategoryScope, id: string) {
    const baseList =
      type === 'expense'
        ? [...expenseCategories, ...customExpenseCategories]
        : type === 'income'
        ? [...incomeCategories, ...customIncomeCategories]
        : [...assetCategories, ...customAssetCategories];
    return baseList.find((category) => category.id === id)?.label ?? '';
  }

  function getCategoriesByType(type: CategoryScope) {
    if (type === 'expense') return activeExpenseCategories;
    if (type === 'income') return activeIncomeCategories;
    return activeAssetCategories;
  }

  function handleStartCategoryRename(type: CategoryScope, category: CategoryOption) {
    setEditingCategory({ type, id: category.id });
    setCategoryNameDraft(category.label);
    setCategoryAssetKindDraft(
      categoryLabels[getAssetCategoryKindKey(category.id)] === 'liability' || category.kind === 'liability'
        ? 'liability'
        : 'asset',
    );
  }

  function handleCancelCategoryRename() {
    setEditingCategory(null);
    setCategoryNameDraft('');
    setCategoryAssetKindDraft('asset');
  }

  function handleSaveCategoryRename(type: CategoryScope, id: string) {
    const nextLabel = categoryNameDraft.trim();
    if (!nextLabel) {
      showNotice('카테고리 이름을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    const targetList = getCategoriesByType(type);
    if (targetList.some((category) => category.id !== id && category.label === nextLabel)) {
      showNotice('이미 등록된 카테고리 이름입니다.', '중복 카테고리', 'warning');
      return;
    }

    const key = getCategoryColorKey(type, id);
    const baseLabel = getBaseCategoryLabel(type, id);
    setCategoryLabels((prev) => {
      const next = { ...prev };
      if (baseLabel === nextLabel) {
        delete next[key];
      } else {
        next[key] = nextLabel;
      }
      if (type === 'asset') {
        next[getAssetCategoryKindKey(id)] = categoryAssetKindDraft;
      }
      return next;
    });
    setEditingCategory(null);
    setCategoryNameDraft('');
    setCategoryAssetKindDraft('asset');
    showNotice(`카테고리 이름을 '${nextLabel}'로 변경했습니다.`, '카테고리 수정', 'success');
  }

  function handleAddManagedCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = categoryDraft.label.trim();
    if (!label) {
      showNotice('카테고리 이름을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    const targetList =
      categoryDraft.type === 'expense'
        ? activeExpenseCategories
        : categoryDraft.type === 'income'
        ? activeIncomeCategories
        : activeAssetCategories;

    if (targetList.some((category) => category.label === label)) {
      showNotice('이미 등록된 카테고리입니다.', '중복 카테고리', 'warning');
      return;
    }

    const generatedId = `cat_${Date.now()}`;
    const newCategory = { id: generatedId, label, color: categoryDraft.color };

    if (categoryDraft.type === 'expense') {
      setCustomExpenseCategories((prev) => [...prev, newCategory]);
      setPlans((prev) => [...prev, { category: generatedId, type: 'expense', plannedAmount: 0 }]);
    } else if (categoryDraft.type === 'income') {
      setCustomIncomeCategories((prev) => [...prev, newCategory]);
      setPlans((prev) => [...prev, { category: generatedId, type: 'income', plannedAmount: 0 }]);
    } else {
      setCustomAssetCategories((prev) => [...prev, newCategory]);
    }

    handleCategoryColorChange(categoryDraft.type, generatedId, categoryDraft.color);
    setCategoryOrder((prev) => ({
      ...prev,
      [categoryDraft.type]: [...(prev[categoryDraft.type] ?? targetList.map((category) => category.id)), generatedId],
    }));
    setCategoryDraft((prev) => ({ ...prev, label: '' }));
    showNotice(`'${label}' 카테고리를 추가했습니다.`, '카테고리 추가', 'success');
  }

  function handleAddAssetCategory(labelVal: string, colorVal: string) {
    const label = labelVal.trim();
    if (!label) {
      showNotice('카테고리 이름을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (activeAssetCategories.some((category) => category.label === label)) {
      showNotice('이미 등록된 카테고리입니다.', '중복 카테고리', 'warning');
      return;
    }

    const generatedId = `cat_${Date.now()}`;
    const newCategory = { id: generatedId, label, color: colorVal };

    setCustomAssetCategories((prev) => [...prev, newCategory]);
    handleCategoryColorChange('asset', generatedId, colorVal);
    setCategoryOrder((prev) => ({
      ...prev,
      asset: [...(prev.asset ?? activeAssetCategories.map((category) => category.id)), generatedId],
    }));

    setAssetCatLabel('');
    showNotice(`'${label}' 자산 카테고리를 추가했습니다.`, '카테고리 추가', 'success');
  }

  function handleAddPlanCategory(labelVal: string, colorVal: string, typeVal: CategoryScope) {
    const label = labelVal.trim();
    if (!label) {
      showNotice('카테고리 이름을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    const targetList = typeVal === 'expense' ? activeExpenseCategories : activeIncomeCategories;
    if (targetList.some((category) => category.label === label)) {
      showNotice('이미 등록된 카테고리입니다.', '중복 카테고리', 'warning');
      return;
    }

    const generatedId = `cat_${Date.now()}`;
    const newCategory = { id: generatedId, label, color: colorVal };

    if (typeVal === 'expense') {
      setCustomExpenseCategories((prev) => [...prev, newCategory]);
      setPlans((prev) => [...prev, { category: generatedId, type: 'expense', plannedAmount: 0 }]);
    } else {
      setCustomIncomeCategories((prev) => [...prev, newCategory]);
      setPlans((prev) => [...prev, { category: generatedId, type: 'income', plannedAmount: 0 }]);
    }

    handleCategoryColorChange(typeVal, generatedId, colorVal);
    setCategoryOrder((prev) => ({
      ...prev,
      [typeVal]: [...(prev[typeVal] ?? targetList.map((category) => category.id)), generatedId],
    }));

    setPlanCatLabel('');
    showNotice(`'${label}' 카테고리를 추가했습니다.`, '카테고리 추가', 'success');
  }

  function handleArchiveCategory(type: CategoryScope, id: string, label: string) {
    const linkedCount = transactions.filter((t) => {
      if (t.type !== type && type !== 'asset') return false;
      return t.category === id || t.category === label;
    }).length;

    requestConfirm({
      title: '카테고리 삭제',
      message: `'${label}' 카테고리를 목록에서 제거할까요?`,
      warningNote: linkedCount > 0
        ? `이 카테고리를 사용 중인 기존 거래 내역 ${linkedCount}건은 삭제되지 않고 안전하게 보존됩니다.`
        : '기존 거래와 자산 기록은 안전하게 보존됩니다.',
      confirmLabel: '삭제',
      tone: 'danger',
      onConfirm: () => {
        setHiddenCategories((prev) => ({ ...prev, [getCategoryColorKey(type, id)]: true }));
        showNotice(`'${label}' 카테고리를 숨겼습니다.`, '삭제 완료', 'success');
      },
    });
  }

  function persistCategoryOrder(
    type: CategoryScope,
    nextOrder: CategoryOrderMap,
    previousOrder: CategoryOrderMap,
    labelPatch?: CategoryLabelMap,
    previousLabels?: CategoryLabelMap,
  ) {
    const operationId = createId();
    const save = async () => {
      const expectedRevision = categoryOrderRevisionsRef.current[type] || 0;
      setRemoteSync({ status: 'saving', message: '카테고리 순서를 저장하는 중입니다.' });
      try {
        let response: Response | null = null;
        let payload: any = {};
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await saveCategoryOrder(type, nextOrder[type] || [], expectedRevision, operationId, labelPatch);
            payload = await response.json();
            if (response.ok || response.status === 409) break;
            throw new Error(payload.error || 'CATEGORY_ORDER_SAVE_FAILED');
          } catch (error) {
            lastError = error;
            if (attempt === 1) throw error;
          }
        }
        if (!response) throw lastError;
        if (response.status === 409) {
          const current = payload.current as Partial<CategoryOrderSyncPayload> | undefined;
          if (current?.categoryOrder && current.categoryLabels && Number.isInteger(current.revision)) {
            skipNextPersistenceRef.current = true;
            setCategoryOrder(current.categoryOrder);
            setCategoryLabels(current.categoryLabels);
            categoryOrderRevisionsRef.current[type] = Number(current.revision);
          } else {
            setCategoryOrder(previousOrder);
            if (previousLabels) setCategoryLabels(previousLabels);
          }
          setRemoteSync({ status: 'stale', checkedAt: Date.now(), message: '다른 기기에서 카테고리 순서가 변경되었습니다.' });
          showNotice('다른 기기의 최신 카테고리 순서를 불러왔습니다. 다시 정렬해 주세요.', '카테고리 순서 충돌', 'warning');
          return;
        }
        if (!response.ok) throw new Error(payload.error || 'CATEGORY_ORDER_SAVE_FAILED');
        skipNextPersistenceRef.current = true;
        setCategoryOrder(payload.categoryOrder || nextOrder);
        if (payload.categoryLabels) setCategoryLabels(payload.categoryLabels);
        categoryOrderRevisionsRef.current[type] = Number(payload.revision) || expectedRevision + 1;
        setRemoteSync({ status: 'synced', checkedAt: Date.now(), message: '카테고리 순서 저장 완료' });
      } catch {
        skipNextPersistenceRef.current = true;
        setCategoryOrder(previousOrder);
        if (previousLabels) setCategoryLabels(previousLabels);
        setRemoteSync({ status: 'error', checkedAt: Date.now(), message: '카테고리 순서를 저장하지 못했습니다.' });
        showNotice('카테고리 순서를 저장하지 못해 이전 순서로 되돌렸습니다.', '카테고리 순서 저장 실패', 'error');
      }
    };
    categoryOrderSaveQueueRef.current = categoryOrderSaveQueueRef.current.then(save, save);
    return categoryOrderSaveQueueRef.current;
  }

  function getOrderedCategoryIds(type: CategoryScope, order: CategoryOrderMap) {
    const knownIds = (type === 'asset'
      ? activeAssetCategories
      : type === 'expense'
        ? activeExpenseCategories
        : activeIncomeCategories
    ).map((category) => category.id);
    const currentIds = (order[type] ?? knownIds).filter((categoryId) => knownIds.includes(categoryId));
    return [...currentIds, ...knownIds.filter((categoryId) => !currentIds.includes(categoryId))];
  }

  function beginCategorySort(type: CategoryScope, sourceId: string) {
    if (categorySortSessionRef.current) return;
    categorySortSessionRef.current = {
      type,
      sourceId,
      previewTargetKey: null,
      previousOrder: categoryOrder,
      previousLabels: categoryLabels,
      nextOrder: categoryOrder,
      nextLabels: categoryLabels,
      hasPreview: false,
    };
    setDragCategory({ type, id: sourceId });
  }

  function previewCategorySort(type: CategoryScope, sourceId: string, targetId: string, targetAssetGroup?: 'asset' | 'liability') {
    const session = categorySortSessionRef.current;
    if (!session || session.type !== type || session.sourceId !== sourceId || sourceId === targetId) return;
    const targetKey = `${targetAssetGroup || ''}:${targetId}`;
    if (session.previewTargetKey === targetKey) return;

    const orderedIds = getOrderedCategoryIds(type, session.nextOrder);
    const sourceIndex = orderedIds.indexOf(sourceId);
    const targetIndex = orderedIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextIds = orderedIds.filter((id) => id !== sourceId);
    nextIds.splice(nextIds.indexOf(targetId), 0, sourceId);
    const nextOrder = { ...session.nextOrder, [type]: nextIds };
    let nextLabels = session.nextLabels;
    let labelPatch: CategoryLabelMap | undefined;
    if (type === 'asset' && targetAssetGroup) {
      const kindKey = getAssetCategoryKindKey(sourceId);
      if ((nextLabels[kindKey] || 'asset') !== targetAssetGroup) {
        nextLabels = { ...nextLabels, [kindKey]: targetAssetGroup };
      }
      if ((session.previousLabels[kindKey] || 'asset') !== (nextLabels[kindKey] || 'asset')) {
        labelPatch = { [kindKey]: nextLabels[kindKey] };
      }
    }

    session.previewTargetKey = targetKey;
    session.nextOrder = nextOrder;
    session.nextLabels = nextLabels;
    session.labelPatch = labelPatch;
    session.hasPreview = true;
    skipNextPersistenceRef.current = true;
    setCategoryOrder(nextOrder);
    if (nextLabels !== categoryLabels) setCategoryLabels(nextLabels);
  }

  function commitCategorySort() {
    const session = categorySortSessionRef.current;
    categorySortSessionRef.current = null;
    setDragCategory(null);
    if (!session?.hasPreview) return;
    void persistCategoryOrder(
      session.type,
      session.nextOrder,
      session.previousOrder,
      session.labelPatch,
      session.previousLabels,
    );
  }

  function cancelCategorySort() {
    const session = categorySortSessionRef.current;
    categorySortSessionRef.current = null;
    setDragCategory(null);
    if (!session?.hasPreview) return;
    skipNextPersistenceRef.current = true;
    setCategoryOrder(session.previousOrder);
    setCategoryLabels(session.previousLabels);
  }

  function handleReset() {
    requestConfirm({
      title: '데이터 초기화',
      message: '입력된 거래, 자산, 정기 기록 규칙을 모두 초기화할까요?',
      confirmLabel: '초기화',
      tone: 'danger',
      onConfirm: () => {
      // 1. Wipe LocalStorage
      localStorage.removeItem('mywallet_transactions');
      localStorage.removeItem('mywallet_assets');
      localStorage.removeItem('mywallet_recurringRules');
      localStorage.removeItem('mywallet_deletedRecurringTxs');
      localStorage.removeItem('mywallet_plans');
      localStorage.removeItem('mywallet_budget');
      localStorage.removeItem('mywallet_updatedAt');
      localStorage.removeItem(STORAGE_KEY);

      const initialPlans = [
        ...expenseCategories.map((c: CategoryOption) => ({ category: c.id, type: 'expense' as const, plannedAmount: 0 })),
        ...incomeCategories.map((c: CategoryOption) => ({ category: c.id, type: 'income' as const, plannedAmount: 0 }))
      ];

      // 2. Wipe React State
      setTransactions([]);
      setAssets([]);
      setBudget(1000000);
      setCustomExpenseCategories([]);
      setCustomIncomeCategories([]);
      setCustomAssetCategories([]);
      setCategoryColors({});
      setCategoryLabels({});
      setCategoryBudgetExcluded({});
      setCategoryOrder({});
      setHiddenCategories({});
      setRecurringRules([]);
      setDeletedRecurringTxs([]);
      setPlans(initialPlans);

      // 3. Push empty sync state to Server D1
      const newTime = Date.now();
      setUpdatedAt(newTime);
      void saveRemoteD1(
        [],
        [],
        1000000,
        theme,
        initialPlans,
        [],
        [],
        [],
        {},
        {},
        {},
        {},
        {},
        [],
        [],
        newTime,
        serverUpdatedAtRef.current
      ).catch(() => undefined);
      showNotice('가계부 데이터가 초기화되었습니다.', '초기화 완료', 'success');
      },
    });
  }

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  // Calendar Helper Logic
  const calendarDays = useMemo(() => {
    const date = new Date(calendarYear, calendarMonth, 1);
    const days = [];
    const rawFirstDayOfWeek = date.getDay();
    const lastDate = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const firstDayOfWeek = rawFirstDayOfWeek;
    const prevMonthLastDate = new Date(calendarYear, calendarMonth, 0).getDate();

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(calendarYear, calendarMonth - 1, prevMonthLastDate - i);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const d = String(prevDate.getDate()).padStart(2, '0');
      days.push({
        dateStr: `${y}-${m}-${d}`,
        dayNum: prevMonthLastDate - i,
        isCurrentMonth: false,
        dayOfWeek: prevDate.getDay(),
      });
    }

    for (let i = 1; i <= lastDate; i++) {
      const y = calendarYear;
      const m = String(calendarMonth + 1).padStart(2, '0');
      const d = String(i).padStart(2, '0');
      days.push({
        dateStr: `${y}-${m}-${d}`,
        dayNum: i,
        isCurrentMonth: true,
        dayOfWeek: new Date(calendarYear, calendarMonth, i).getDay(),
      });
    }

    // 모든 달을 실제 요일 기준의 6행(42일)으로 유지한다.
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(calendarYear, calendarMonth + 1, i);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const d = String(nextDate.getDate()).padStart(2, '0');
      days.push({
        dateStr: `${y}-${m}-${d}`,
        dayNum: i,
        isCurrentMonth: false,
        dayOfWeek: nextDate.getDay(),
      });
    }

    return days;
  }, [calendarYear, calendarMonth]);

  const dateWiseSums = useMemo(() => {
    return transactions.reduce<Record<string, { income: number; expense: number }>>((acc, t) => {
      if (!acc[t.date]) {
        acc[t.date] = { income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        acc[t.date].income += t.amount;
      } else if (t.type === 'expense') {
        acc[t.date].expense += t.amount;
      }
      return acc;
    }, {});
  }, [transactions]);

  function handleCalendarPrev() {
    if (calendarMonth === 0) {
      const year = calendarYear - 1;
      setCalendarYear(year);
      setCalendarMonth(11);
      setSelectedMonth(`${year}-12`);
    } else {
      const month = calendarMonth - 1;
      setCalendarMonth(month);
      setSelectedMonth(`${calendarYear}-${String(month + 1).padStart(2, '0')}`);
    }
  }

  function handleCalendarNext() {
    if (calendarMonth === 11) {
      const year = calendarYear + 1;
      setCalendarYear(year);
      setCalendarMonth(0);
      setSelectedMonth(`${year}-01`);
    } else {
      const month = calendarMonth + 1;
      setCalendarMonth(month);
      setSelectedMonth(`${calendarYear}-${String(month + 1).padStart(2, '0')}`);
    }
  }

  // Backup CSV Export
  function exportCSV() {
    let csv = 'SECTION,TYPE/CATEGORY,DATE/MEMO,AMOUNT,TITLE,EXTRA,TIME,CREATED_AT\n';
    transactions.forEach((t) => {
      csv += `T,${t.id},${t.type},${t.date},${t.amount},"${t.title.replace(/"/g, '""')}",${t.category},${t.time ?? ''},${t.createdAt ?? ''}\n`;
    });
    assets.forEach((a) => {
      csv += `A,${a.id},${a.category},${a.amount},"${a.memo.replace(/"/g, '""')}",,\n`;
    });
    plans.forEach((p) => {
      csv += `P,${p.category},${p.type},${p.plannedAmount},,,\n`;
    });
    csv += `BUDGET,${budget},,,,\n`;

    downloadCSV(csv, `mywallet_backup_${selectedMonth.replace('-', '')}.csv`);
  }

  // Backup CSV Import
  function handleImportCSV(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split('\n');
        const newTransactions: Transaction[] = [];
        const newAssets: AssetItem[] = [];
        const newPlans: CategoryPlan[] = [];
        let newBudget = budget;

        lines.forEach((line) => {
          const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          if (cells[0] === 'T') {
            newTransactions.push({
              id: cells[1],
              type: cells[2] as TransactionType,
              date: cells[3],
              amount: Number(cells[4]),
              title: cells[5],
              category: cells[6],
              time: normalizeTransactionTime(cells[7]),
              createdAt: cells[8] ? Number(cells[8]) : cells[7] && !isValidTransactionTime(cells[7]) ? Number(cells[7]) : null,
            });
          } else if (cells[0] === 'A') {
            newAssets.push({
              id: cells[1],
              category: cells[2],
              amount: Number(cells[3]),
              memo: cells[4],
            });
          } else if (cells[0] === 'P') {
            newPlans.push({
              category: cells[1],
              type: cells[2] as TransactionType,
              plannedAmount: Number(cells[3]) || 0,
            });
          } else if (cells[0] === 'BUDGET') {
            newBudget = Number(cells[1]) || 1000000;
          }
        });

        if (newTransactions.length > 0 || newAssets.length > 0 || newPlans.length > 0) {
          requestConfirm({
            title: '백업 복원',
            message: `현재 장부가 백업 데이터로 바뀝니다. 거래 ${newTransactions.length}건, 자산 ${newAssets.length}건, 계획 ${newPlans.length}건을 복원할까요?`,
            confirmLabel: '복원',
            onConfirm: () => {
            setTransactions(newTransactions);
            setAssets(newAssets);
            setBudget(newBudget);
            if (newPlans.length > 0) {
              setPlans(newPlans);
            }
            showNotice('백업 데이터를 복원했습니다.', '복원 완료', 'success');
            },
          });
        } else {
          showNotice('가져올 수 있는 유효한 가계부 데이터가 없습니다.', '복원 실패', 'warning');
        }
      } catch {
        showNotice('CSV 파일 해석 중 오류가 발생했습니다.', '복원 실패', 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleImportEasyMoneyCSV(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      try {
        const imported = importEasyMoneyCsv(text);
        const warningText = imported.summary.warnings.length ? `\n\n확인 필요: ${imported.summary.warnings.slice(0, 2).join(' / ')}` : '';
        requestConfirm({
          title: '편한가계부 CSV 이관',
          message: `현재 원장 데이터를 편한가계부 데이터로 교체합니다.\n거래 ${imported.transactions.length}건, 자산 ${imported.assets.length}개, 이체 ${imported.summary.transferPairs}건, 미래 예정 거래 ${imported.summary.scheduledTransactions}건을 가져옵니다.${warningText}`,
          confirmLabel: '이관 시작', tone: 'danger',
          onConfirm: () => {
            const nextUpdatedAt = Date.now();
            setTransactions(imported.transactions); setAssets(imported.assets); setBudget(0); setPlans([]);
            setRecurringRules([]); setDeletedRecurringTxs([]);
            setCustomExpenseCategories(imported.expenseCategories); setCustomIncomeCategories(imported.incomeCategories); setCustomAssetCategories(imported.assetCategories);
            setCategoryColors({}); setCategoryLabels({}); setCategoryBudgetExcluded({}); setCategoryOrder({}); setHiddenCategories(Object.fromEntries([
              ...expenseCategories.map((item) => [getCategoryColorKey('expense', item.id), true]),
              ...incomeCategories.map((item) => [getCategoryColorKey('income', item.id), true]),
              ...assetCategories.map((item) => [getCategoryColorKey('asset', item.id), true]),
            ]));
            setUpdatedAt(nextUpdatedAt);
            setRemoteSync({ status: 'pending', localUpdatedAt: nextUpdatedAt, message: '편한가계부 이관 데이터를 서버에 저장하는 중' });
            showNotice(`거래 ${imported.transactions.length}건과 자산 ${imported.assets.length}개를 이관했습니다.`, '이관 완료', 'success');
          },
        });
      } catch (error) {
        showNotice(error instanceof Error ? error.message : 'CSV 파일을 읽지 못했습니다.', '이관 실패', 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }
  async function verifyRemoteSync(showToast = true) {
    const syncStartedAt = Date.now();
    let noticeAfterSync: { message: string; title: string; type: NoticeType } | null = null;
    setIsSyncOverlayVisible(true);
    setRemoteSync((prev) => ({
      ...prev,
      status: 'checking',
      message: '서버 변경을 동기화하는 중',
    }));

    try {
      const result = await synchronizeTransactionState();
      const hasPending = result.pendingOperations > 0;
      const hasConflict = result.conflictedOperations > 0 || result.blocked;
      const isSynced = !hasConflict && !hasPending;
      if (isSynced) window.localStorage.removeItem(PENDING_SYNC_KEY);
      setRemoteSync({
        status: isSynced ? 'synced' : 'stale',
        localUpdatedAt: updatedAt || 0,
        checkedAt: Date.now(),
        message: isSynced ? '서버 변경 반영 완료' : hasConflict ? '충돌한 저장 작업을 확인해 주세요' : '저장 대기 작업을 다시 시도해 주세요',
      });
      if (showToast) {
        const summary = [
          result.replayedOperations > 0 ? `대기 저장 ${result.replayedOperations}건 완료` : '',
          result.appliedChanges > 0 ? `서버 변경 ${result.appliedChanges}건 반영` : '',
        ].filter(Boolean).join(', ');
        noticeAfterSync = {
          message: isSynced ? (summary || '새로운 서버 변경이 없습니다.') : hasConflict ? `충돌 또는 보류 작업 ${result.conflictedOperations}건이 있습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.` : `저장 대기 작업 ${result.pendingOperations}건을 서버에 반영하지 못했습니다. 네트워크를 확인한 뒤 다시 동기화해 주세요.`,
          title: isSynced ? '동기화 완료' : hasConflict ? '저장 충돌' : '저장 대기',
          type: isSynced ? 'success' : 'warning',
        };
      }
    } catch {
      setRemoteSync({
        status: 'error',
        localUpdatedAt: updatedAt || 0,
        checkedAt: Date.now(),
        message: '서버 동기화 실패',
      });
      if (showToast) {
        noticeAfterSync = { message: '서버 변경을 가져오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.', title: '동기화 실패', type: 'error' };
      }
    } finally {
      const remaining = Math.max(0, SYNC_OVERLAY_MIN_DURATION - (Date.now() - syncStartedAt));
      window.setTimeout(() => {
        setIsSyncOverlayVisible(false);
        if (noticeAfterSync) {
          window.requestAnimationFrame(() => showNotice(noticeAfterSync!.message, noticeAfterSync!.title, noticeAfterSync!.type));
        }
      }, remaining);
    }
  }

  function exportFullCSV() {
    const backupSettings = {
      version: 3,
      exportedAt: Date.now(),
      budget,
      theme,
      customExpenseCategories,
      customIncomeCategories,
      customAssetCategories,
      categoryColors,
      categoryLabels,
      categoryBudgetExcluded,
      categoryOrder,
      hiddenCategories,
      hiddenAssets,
      recurringRules,
      deletedRecurringTxs,
      updatedAt,
    };

    const rows = [
      createCSVRow(['SECTION', 'ID', 'TYPE_OR_CATEGORY', 'DATE_OR_MEMO', 'AMOUNT', 'TITLE', 'EXTRA', 'RECURRING_RULE_ID', 'ASSET_ID', 'TO_ASSET_ID', 'TIME', 'CREATED_AT', 'INSTALLMENT_GROUP_ID', 'INSTALLMENT_INDEX', 'INSTALLMENT_MONTHS', 'JSON']),
      createCSVRow(['SETTINGS', 'mywallet-v3', '', '', '', '', '', '', '', '', '', '', '', '', '', JSON.stringify(backupSettings)]),
      ...transactions.map((t) => createCSVRow(['T', t.id, t.type, t.date, t.amount, t.title, t.category, t.recurringRuleId ?? '', t.assetId ?? '', t.toAssetId ?? '', t.time ?? '', t.createdAt ?? '', t.installmentGroupId ?? '', t.installmentIndex ?? '', t.installmentMonths ?? '', ''])),
      ...assets.map((a) => createCSVRow(['A', a.id, a.category, a.amount, a.memo, a.name ?? '', '', '', '', '', '', '', '', '', '', ''])),
      ...plans.map((p) => createCSVRow(['P', p.category, p.type, p.plannedAmount, '', '', '', '', '', '', '', '', '', '', '', ''])),
      createCSVRow(['BUDGET', budget, '', '', '', '', '', '', '', '', '', '', '', '', '', '']),
    ];

    downloadCSV(`${rows.join('\n')}\n`, `mywallet_full_backup_${selectedMonth.replace('-', '')}.csv`);
  }

  function handleImportFullCSV(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const rows = parseCSVRows(text.replace(/^\uFEFF/, ''));
        const [header, ...dataRows] = rows;
        if (!header || header[0] !== 'SECTION') throw new Error('MyWallet 전체 백업 CSV 형식이 아닙니다.');
        const newTransactions: Transaction[] = [];
        const newAssets: AssetItem[] = [];
        const newPlans: CategoryPlan[] = [];
        const transactionIds = new Set<string>();
        const assetIds = new Set<string>();
        let invalidRows = 0;
        let importedSettings: Partial<{
          version: number;
          budget: number;
          theme: ThemePreference;
          customExpenseCategories: CategoryOption[];
          customIncomeCategories: CategoryOption[];
          customAssetCategories: CategoryOption[];
          categoryColors: CategoryColorMap;
          categoryLabels: CategoryLabelMap;
          categoryBudgetExcluded: CategoryBudgetExcludedMap;
          categoryOrder: CategoryOrderMap;
          hiddenCategories: HiddenCategoryMap;
          hiddenAssets: HiddenAssetMap;
          recurringRules: RecurringRule[];
          deletedRecurringTxs: string[];
        }> | null = null;
        let newBudget = budget;

        dataRows.forEach((cells) => {
          if (cells[0] === 'SECTION') return;
          if (cells[0] === 'T') {
            const type = cells[2];
            const amount = Number(cells[4]);
            if (!cells[1] || transactionIds.has(cells[1]) || !['income', 'expense', 'transfer'].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(cells[3]) || !Number.isFinite(amount) || amount < 0 || !cells[5]) {
              invalidRows += 1;
              return;
            }
            const installmentIndex = Number(cells[13]);
            const installmentMonths = Number(cells[14]);
            transactionIds.add(cells[1]);
            newTransactions.push({
              id: cells[1],
              type: type as TransactionType,
              date: cells[3],
              amount,
              title: cells[5],
              category: cells[6],
              recurringRuleId: cells[7] || null,
              assetId: cells[8] || null,
              toAssetId: cells[9] || null,
              time: normalizeTransactionTime(cells[10]),
              createdAt: cells[11] ? Number(cells[11]) : cells[10] && !isValidTransactionTime(cells[10]) ? Number(cells[10]) : null,
              installmentGroupId: cells[12] || null,
              installmentIndex: Number.isInteger(installmentIndex) && installmentIndex > 0 ? installmentIndex : null,
              installmentMonths: Number.isInteger(installmentMonths) && installmentMonths > 0 ? installmentMonths : null,
            });
          } else if (cells[0] === 'A') {
            const amount = Number(cells[3]);
            if (!cells[1] || assetIds.has(cells[1]) || !cells[2] || !Number.isFinite(amount)) {
              invalidRows += 1;
              return;
            }
            assetIds.add(cells[1]);
            newAssets.push({
              id: cells[1],
              category: cells[2],
              amount,
              memo: cells[4],
              name: cells[5] || undefined,
            });
          } else if (cells[0] === 'P') {
            const plannedAmount = Number(cells[3]);
            if (!cells[1] || !['income', 'expense', 'transfer'].includes(cells[2]) || !Number.isFinite(plannedAmount)) {
              invalidRows += 1;
              return;
            }
            newPlans.push({
              category: cells[1],
              type: cells[2] as TransactionType,
              plannedAmount,
            });
          } else if (cells[0] === 'BUDGET') {
            const parsedBudget = Number(cells[1]);
            if (!Number.isFinite(parsedBudget)) {
              invalidRows += 1;
              return;
            }
            newBudget = parsedBudget;
          } else if (cells[0] === 'SETTINGS') {
            const rawJson = cells[15] || cells[7] || cells[1] || '';
            if (rawJson) {
              const parsedSettings = JSON.parse(rawJson);
              if (!parsedSettings || typeof parsedSettings !== 'object' || Array.isArray(parsedSettings)) throw new Error('설정 백업 데이터가 올바르지 않습니다.');
              importedSettings = parsedSettings;
              const parsedBudget = Number((parsedSettings as { budget?: unknown }).budget);
              if (Number.isFinite(parsedBudget)) newBudget = parsedBudget;
            }
          }
        });

        if (invalidRows > 0) throw new Error(`유효하지 않은 백업 행 ${invalidRows}개가 있어 복원을 중단했습니다.`);
        const restoredAssetIds = new Set(newAssets.map((asset) => asset.id));
        if (newTransactions.some((transaction) => (transaction.assetId && !restoredAssetIds.has(transaction.assetId)) || (transaction.toAssetId && !restoredAssetIds.has(transaction.toAssetId)))) {
          throw new Error('존재하지 않는 자산을 참조하는 거래가 있어 복원을 중단했습니다.');
        }

        if (newTransactions.length > 0 || newAssets.length > 0 || newPlans.length > 0 || importedSettings) {
          requestConfirm({
            title: 'CSV 복원',
            message: `현재 데이터가 백업 파일 기준으로 교체됩니다. 거래 ${newTransactions.length}건, 자산 ${newAssets.length}건, 계획 ${newPlans.length}건${importedSettings ? ', 설정값 포함' : ''}을 복원할까요?`,
            confirmLabel: '복원',
            onConfirm: () => {
              const nextTime = Date.now();
              setTransactions(newTransactions);
              setAssets(newAssets);
              setBudget(newBudget);
              setTheme(normalizeThemePreference(importedSettings?.theme));
              setCustomExpenseCategories(Array.isArray(importedSettings?.customExpenseCategories) ? importedSettings.customExpenseCategories : []);
              setCustomIncomeCategories(Array.isArray(importedSettings?.customIncomeCategories) ? importedSettings.customIncomeCategories : []);
              setCustomAssetCategories(Array.isArray(importedSettings?.customAssetCategories) ? importedSettings.customAssetCategories : []);
              setCategoryColors(importedSettings?.categoryColors && typeof importedSettings.categoryColors === 'object' ? importedSettings.categoryColors : {});
              setCategoryLabels(importedSettings?.categoryLabels && typeof importedSettings.categoryLabels === 'object' ? importedSettings.categoryLabels : {});
              setCategoryBudgetExcluded(importedSettings?.categoryBudgetExcluded && typeof importedSettings.categoryBudgetExcluded === 'object' ? importedSettings.categoryBudgetExcluded : {});
              setCategoryOrder(importedSettings?.categoryOrder && typeof importedSettings.categoryOrder === 'object' ? importedSettings.categoryOrder : {});
              setHiddenCategories(importedSettings?.hiddenCategories && typeof importedSettings.hiddenCategories === 'object' ? importedSettings.hiddenCategories : {});
              setHiddenAssets(importedSettings?.hiddenAssets && typeof importedSettings.hiddenAssets === 'object' ? importedSettings.hiddenAssets : {});
              setRecurringRules(Array.isArray(importedSettings?.recurringRules) ? importedSettings.recurringRules : []);
              setDeletedRecurringTxs(Array.isArray(importedSettings?.deletedRecurringTxs) ? importedSettings.deletedRecurringTxs : []);
              setPlans(newPlans);
              setUpdatedAt(nextTime);
              setRemoteSync({
                status: 'pending',
                localUpdatedAt: nextTime,
                message: '복원 데이터 서버 저장 대기 중',
              });
              showNotice('CSV 백업 데이터와 설정값을 복원했습니다.', '복원 완료', 'success');
            },
          });
        } else {
          showNotice('가져올 수 있는 유효한 가계부 데이터가 없습니다.', '복원 실패', 'warning');
        }
      } catch {
        showNotice('CSV 파일 해석 중 오류가 발생했습니다.', '복원 실패', 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  const categoryTypeOptions: { type: CategoryScope; label: string }[] = [
    { type: 'expense', label: '지출' },
    { type: 'income', label: '수입' },
    { type: 'asset', label: '자산' },
  ];

  const categoryManagerGroups = [
    {
      type: 'expense' as const,
      title: '지출 카테고리',
      categories: activeExpenseCategories,
    },
    {
      type: 'income' as const,
      title: '수입 카테고리',
      categories: activeIncomeCategories,
    },
    {
      type: 'asset' as const,
      title: '자산 카테고리',
      categories: activeAssetCategories,
    },
  ];

  const topSyncStatus = !isOnline ? 'offline' : remoteSync.status;
  const displayCurrency = (value: number) => (privacyMode ? formatCurrency(getPrivacyDisplayAmount(value)) : formatCurrency(value));
  const displayCalendarAmount = (value: number) => (privacyMode ? formatMobileCalendarAmount(getPrivacyDisplayAmount(value)) : formatMobileCalendarAmount(value));
  const renderLedgerCalendar = () => (
    <section className="calendar-view-container ledger-calendar-view">
      <div className="calendar-control" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="page-title-kor page-title-with-icon"><AppIcon name="calendar" size={18} /> {calendarYear}년 {calendarMonth + 1}월</h2>
        <div className="calendar-nav-buttons">
          <button type="button" className="calendar-nav-btn" onClick={handleCalendarPrev}><AppIcon name="chevronLeft" size={20} /></button>
          <button type="button" className="calendar-nav-btn" onClick={handleCalendarNext}><AppIcon name="chevronRight" size={20} /></button>
        </div>
      </div>
      <div className="calendar-day-names-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '4px' }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
          <div key={day} className={`calendar-day-name ${index === 0 ? 'sunday' : index === 6 ? 'saturday' : ''}`} style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, padding: '6px 0' }}>{day}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {calendarDays.map((day) => {
          const daySums = dateWiseSums[day.dateStr];
          const isSelected = selectedDayData === day.dateStr;
          const isToday = day.dateStr === getToday();
          return (
            <div
              key={day.dateStr}
              className={`calendar-cell ${day.isCurrentMonth ? '' : 'prev-month'} ${day.dayOfWeek === 0 ? 'sunday' : day.dayOfWeek === 6 ? 'saturday' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => { setSelectedDayData(day.dateStr); setModalTab('view'); }}
            >
              <span className="date-number">{day.dayNum}</span>
              <div className="day-values">
                {daySums?.income > 0 && <span className="calendar-value-badge income"><span className="calendar-value-sign">+</span>{displayCalendarAmount(daySums.income)}</span>}
                {daySums?.expense > 0 && <span className="calendar-value-badge expense"><span className="calendar-value-sign">−</span>{displayCalendarAmount(daySums.expense)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <main className="app-shell">
      {isLoading && (
        <div className="app-loading-screen" role="status" aria-live="polite" aria-busy="true">
          <div className="app-loading-mark" aria-hidden="true">
            <span className="app-loading-orbit-track" />
            <span className="app-loading-orbit" style={{ animationDelay: loadingOrbitDelay }} />
            <div className="app-loading-logo">
              <MyWalletLogo style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
          <div className="app-loading-copy">
            <h1>
              <span style={{ color: '#ffffff' }}>My</span>
              <span style={{ color: 'var(--primary)' }}>Wallet</span>
            </h1>
          </div>
        </div>
      )}
      {!isLoading && isSyncOverlayVisible && (
        <div className="app-sync-overlay" role="status" aria-live="polite" aria-label="동기화 중" aria-busy="true">
          <div className="app-loading-mark" aria-hidden="true">
            <span className="app-loading-orbit-track" />
            <span className="app-loading-orbit" />
            <div className="app-loading-logo">
              <MyWalletLogo style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>
      )}
      {/* Sidebar Navigation (Fixed bottom bar on mobile) */}
      <aside className="sidebar">
        <div>
          <div className="brand">
            <MyWalletLogo />
            <div>
              <strong className="brand-wordmark"><span>My</span><span>Wallet</span></strong>
            </div>
          </div>
          <nav>
            <a href="#summary" className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>
              <span><AppIcon name="dashboard" /></span>
              <strong>차트</strong>
            </a>
            <a href="#asset" className={activeTab === 'asset' ? 'active' : ''} onClick={() => setActiveTab('asset')}>
              <span><AppIcon name="asset" /></span>
              <strong>자산</strong>
            </a>
            <button
              type="button"
              className="mobile-primary-action"
              aria-label={activeTab === 'asset' ? '자산 등록' : '거래 등록'}
              onClick={() => {
                openAmountEntry(() => {
                  if (activeTab === 'asset') {
                    setEditingAsset(null);
                    setRegistrationMode('asset');
                    setIsEntryModalOpen(true);
                    return;
                  }
                  setRegistrationMode('expense');
                  setIsEntryModalOpen(true);
                  setModalTab('add');
                });
              }}
            >
              <AppIcon name="plus" size={25} />
            </button>
            <a href="#plan" className={activeTab === 'plan' ? 'active' : ''} onClick={() => setActiveTab('plan')}>
              <span><AppIcon name="plan" /></span>
              <strong>계획</strong>
            </a>
            <a href="#ledger" className={activeTab === 'ledger' ? 'active' : ''} onClick={() => { setLedgerView('daily'); setActiveTab('ledger'); }}>
              <span><AppIcon name="ledger" /></span>
              <strong>장부</strong>
            </a>
          </nav>
          <div className="desktop-registration-action">
            <button
              type="button"
              onClick={() => {
                openAmountEntry(() => {
                  if (activeTab === 'asset') {
                    setEditingAsset(null);
                    setRegistrationMode('asset');
                    setIsEntryModalOpen(true);
                    return;
                  }
                  setRegistrationMode('expense');
                  setIsEntryModalOpen(true);
                  setModalTab('add');
                });
              }}
            >
              <AppIcon name="plus" size={20} />
              <span>{activeTab === 'asset' ? '자산 등록' : '거래 등록'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <header className="app-header">
        {/* 모바일 전용 로고 영역 (PC 뷰에서는 CSS로 숨김) */}
        <div className="header-brand">
          <MyWalletLogo />
          <div className="brand-text">
            <strong className="brand-wordmark"><span>My</span><span>Wallet</span></strong>
          </div>
        </div>

        {/* PC 전용 헤더 좌측 타이틀 (선택 월에 연동, 모바일에서는 CSS로 숨김) */}
        <h1 className="header-title">
          {selectedMonth.replace('-', '.')} 재정 현황
        </h1>

        {/* 헤더 우측 액션 그룹 */}
        <div className="header-actions">
          <button
            type="button"
            className={`sync-mini-indicator ${topSyncStatus}`}
            onClick={() => void verifyRemoteSync(true)}
            title={!isOnline ? '인터넷 연결 없음' : `${remoteSync.message} - 서버 확인`}
            aria-label="서버 동기화 상태 확인"
          >
            <span aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`privacy-toggle ${privacyMode ? 'active' : ''}`}
            onClick={() => setPrivacyMode((prev) => !prev)}
            title={privacyMode ? '금액 표시' : '금액 숨기기'}
            aria-pressed={privacyMode}
          >
            <AppIcon name={privacyMode ? 'eyeOff' : 'eye'} size={18} />
          </button>
          <div className="month-navigation" aria-label="조회 월 이동">
            <button type="button" className="month-nav-button" aria-label="이전 달" onClick={() => setSelectedMonth(getPreviousMonth(selectedMonth))}>
              <AppIcon name="chevronLeft" size={18} />
            </button>
            <div className="month-picker-wrap">
              <button
                type="button"
                className="month-picker-display"
                aria-haspopup="dialog"
                aria-expanded={isMonthPickerOpen}
                onClick={() => {
                  setMonthPickerYear(Number(selectedMonth.slice(0, 4)));
                  setMonthPickerMonth(Number(selectedMonth.slice(5, 7)));
                  setIsMonthPickerOpen((open) => !open);
                }}
              >
                {selectedMonth.slice(0, 4)}년 {Number(selectedMonth.slice(5, 7))}월 <AppIcon name="calendar" size={16} />
              </button>
            </div>
            <button type="button" className="month-nav-button" aria-label="다음 달" onClick={() => setSelectedMonth(getNextMonth(selectedMonth))}>
              <AppIcon name="chevronRight" size={18} />
            </button>
            {isMonthPickerOpen && (
              <div className="month-picker-popover" role="dialog" aria-label="조회 월 선택">
                <div className="month-picker-wheel" aria-label="년월 선택">
                  <div
                    ref={monthPickerYearRef}
                    className="month-picker-wheel-column"
                    onScroll={(event) => {
                      const index = Math.round(event.currentTarget.scrollTop / MONTH_PICKER_ROW_HEIGHT);
                      setMonthPickerYear(Math.min(MONTH_PICKER_YEAR_END, Math.max(MONTH_PICKER_YEAR_START, MONTH_PICKER_YEAR_START + index)));
                    }}
                  >
                    {Array.from({ length: MONTH_PICKER_YEAR_END - MONTH_PICKER_YEAR_START + 1 }, (_, index) => MONTH_PICKER_YEAR_START + index).map((year) => (
                      <button key={year} type="button" className={year === monthPickerYear ? 'active' : ''} onClick={() => monthPickerYearRef.current?.scrollTo({ top: (year - MONTH_PICKER_YEAR_START) * MONTH_PICKER_ROW_HEIGHT, behavior: 'smooth' })}>{year}년</button>
                    ))}
                  </div>
                  <div
                    ref={monthPickerMonthRef}
                    className="month-picker-wheel-column"
                    onScroll={(event) => {
                      const index = Math.round(event.currentTarget.scrollTop / MONTH_PICKER_ROW_HEIGHT);
                      setMonthPickerMonth(Math.min(12, Math.max(1, index + 1)));
                    }}
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <button key={month} type="button" className={month === monthPickerMonth ? 'active' : ''} onClick={() => monthPickerMonthRef.current?.scrollTo({ top: (month - 1) * MONTH_PICKER_ROW_HEIGHT, behavior: 'smooth' })}>{month}월</button>
                    ))}
                  </div>
                </div>
                <button type="button" className="month-picker-confirm" onClick={() => { setSelectedMonth(`${monthPickerYear}-${String(monthPickerMonth).padStart(2, '0')}`); setIsMonthPickerOpen(false); }}>선택 완료</button>
              </div>
            )}
          </div>

          {/* 설정 바로가기 버튼 */}
          <button
            type="button"
            className={`header-settings-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => {
              window.location.hash = 'settings';
              setActiveTab('settings');
            }}
            title="환경 설정"
          >
            <span><AppIcon name="settings" size={21} /></span>
          </button>
        </div>
      </header>

      <section 
        ref={contentScrollRef}
        className="content" 
        style={
          activeTab === 'calendar' 
            ? { 
                overflow: 'hidden', 
                height: '100dvh', 
                paddingTop: 'calc(80px + env(safe-area-inset-top, 0px))', /* 상단 타이틀 수평 동기화 */
                paddingBottom: '73px', /* 하단바 및 거래등록 플로팅 단추의 가림 완벽 방지 */
                boxSizing: 'border-box'
              } 
            : undefined
        }
      >

        {/* Dashboard Tab */}
        {activeTab === 'summary' && (
          <>
            <section className="summary-grid" aria-label="월간 요약">
              <article className="summary-card expense">
                <span>이번 달 총 지출</span>
                <strong>{displayCurrency(expenseTotal)}</strong>
                <small>합리적인 소비를 위한 예산 대비 관리</small>
              </article>
              <article className="summary-card income">
                <span>이번 달 총 수입</span>
                <strong>{displayCurrency(incomeTotal)}</strong>
                <small>월별 부가 소득 및 급여 포함</small>
              </article>
              <article className="summary-card asset">
                <span>자산</span>
                <strong>{displayCurrency(grossAssetTotal)}</strong>
                <small>부채를 제외한 자산 잔액</small>
              </article>
              <article className="summary-card asset">
                <span>자산(부채포함)</span>
                <strong>{displayCurrency(assetTotal)}</strong>
                <small>부채를 차감한 순자산</small>
              </article>
            </section>




            {/* 자산 분배 현황 원형 그래프 패널 */}
            <div className="summary-visual-grid">
            <section className="glass-panel asset-distribution-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '14px 16px' }}>
              <div className="panel-header asset-distribution-header">
                <h2 className="panel-title-kor">자산 분배 현황</h2>
                <label className="asset-detail-toggle">
                  <input type="checkbox" checked={showAssetDetails} onChange={(event) => setShowAssetDetails(event.target.checked)} />
                  <span>세부 자산</span>
                </label>
              </div>

              <div className="asset-donut-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', padding: '12px 0 0' }}>
                {/* 파이 원형 그래프 (2배 이상 확대 & 여백 완전 밀착) */}
                <div style={{ position: 'relative', width: '100%', maxWidth: '440px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg 
                    width="100%" 
                    height="auto" 
                    viewBox="0 0 380 276" 
                    style={{ 
                      display: 'block', 
                      overflow: 'visible',
                      aspectRatio: '380 / 276',
                      filter: 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.22))'
                    }}
                  >
                    {/* Background Circle */}
                    <circle cx="190" cy="130" r="98" fill="#1e293b" opacity="0.4" />

                    {assetFlowSegments.length === 0 ? (
                      <text x="190" y="135" textAnchor="middle" fill="var(--text-secondary)" fontSize="13" fontWeight="bold">
                        자산 데이터가 없습니다.
                      </text>
                    ) : (
                      (() => {
                        const R = 98;
                        const CX = 190;
                        const CY = 130;
                        let accumulatedAngle = -90; // 12시 방향부터 채워나가기 시작

                        // 1단계: 너무 작아서 겹치는 세그먼트에 최소 렌더링 퍼센트(4.2%) 적용
                        const minPercent = 4.2;
                        let tempSegments = assetFlowSegments.map(s => {
                          const actualPercent = assetDistributionTotal > 0 ? (s.value / assetDistributionTotal) * 100 : 0;
                          return {
                            ...s,
                            actualPercent,
                            // 비율이 있고 minPercent보다 작으면 minPercent로 임시 보정
                            renderPercent: (actualPercent > 0 && actualPercent < minPercent) ? minPercent : actualPercent
                          };
                        });

                        // 2단계: 합산율 정규화 (100%로 총합 맞춤)
                        const totalRenderSum = tempSegments.reduce((sum, item) => sum + item.renderPercent, 0);
                        const normalizedSegments = tempSegments.map(item => ({
                          ...item,
                          renderPercent: totalRenderSum > 0 ? (item.renderPercent / totalRenderSum) * 100 : 0
                        }));

                        // 작은 세그먼트들만 걸러서 지그재그 인덱스 매칭 (보정된 renderPercent 기준)
                        const smallSegments = normalizedSegments.filter(s => s.actualPercent < 12);

                        return normalizedSegments.map((segment) => {
                          // 파이 조각 렌더링과 위치 각도는 보정 비율(renderPercent) 적용
                          const angle = (segment.renderPercent / 100) * 360;
                          
                          const startAngle = accumulatedAngle;
                          const endAngle = accumulatedAngle + angle;
                          accumulatedAngle = endAngle;

                          // 삼각함수로 조각 호의 외곽 좌표 계산
                          const x1 = CX + R * Math.cos((startAngle * Math.PI) / 180);
                          const y1 = CY + R * Math.sin((startAngle * Math.PI) / 180);
                          const x2 = CX + R * Math.cos((endAngle * Math.PI) / 180);
                          const y2 = CY + R * Math.sin((endAngle * Math.PI) / 180);

                          const largeArcFlag = angle > 180 ? 1 : 0;
                          const pathData = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                          // 텍스트 라벨 & 지시선 각도 좌표 계산 (가운데 각도 구하기)
                          const midAngle = startAngle + angle / 2;
                          const rad = (midAngle * Math.PI) / 180;
                          const isLarge = segment.actualPercent >= 12; // 실제 비율 기준으로 내외부 판정

                          // 내부 텍스트 좌표
                          const txInternal = CX + R * 0.62 * Math.cos(rad);
                          const tyInternal = CY + R * 0.62 * Math.sin(rad);

                          // 작은 조각 지그재그 오프셋 계산 (인접 겹침 완벽 소멸 솔루션)
                          const smallIndex = smallSegments.findIndex(s => s.id === segment.id);
                          // 3단계 지그재그 배율: smallIndex에 따라 1.18, 1.34, 1.50로 지선 길이 엇갈림 분산
                          const lineScale = 1.18 + (smallIndex !== -1 ? (smallIndex % 3) * 0.16 : 0);
                          const horizontalLength = 12 + (smallIndex !== -1 ? (smallIndex % 3) * 6 : 0); // 수평선 길이도 12, 18, 24px로 엇갈림

                          // 외부 텍스트 및 꺾은선 지시선 좌표
                          const lxStart = CX + R * 0.95 * Math.cos(rad);
                          const lyStart = CY + R * 0.95 * Math.sin(rad);
                          
                          const lxMid = CX + R * lineScale * Math.cos(rad);
                          const lyMid = CY + R * lineScale * Math.sin(rad);
                          
                          const isRightSide = Math.cos(rad) >= 0;
                          const lxEnd = lxMid + (isRightSide ? horizontalLength : -horizontalLength);
                          const lyEnd = lyMid;
                          
                          const txExternal = lxEnd + (isRightSide ? 6 : -6);
                          const tyExternal = lyEnd;

                          return (
                            <g key={segment.id}>
                              {/* 1. 파이 조각 단면 */}
                              <path 
                                d={pathData} 
                                fill={segment.color}
                                stroke="var(--bg-card)"
                                strokeWidth="1.5"
                                style={{ transition: 'all 0.3s ease' }}
                              />

                              {/* 2. 자막 라벨 텍스트 */}
                              {isLarge ? (
                                <text
                                  x={txInternal}
                                  y={tyInternal}
                                  textAnchor="middle"
                                  fill="#ffffff"
                                  fontSize="11"
                                  fontWeight="900"
                                  style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
                                >
                                  <tspan x={txInternal} dy="-4" textAnchor="middle">{segment.label}</tspan>
                                  <tspan x={txInternal} dy="12" fontSize="9.5" fontWeight="bold" textAnchor="middle" opacity="0.9">({segment.actualPercent.toFixed(1)}%)</tspan>
                                </text>
                              ) : (
                                <g>
                                  {/* 지시선 (꺾은선) */}
                                  <polyline
                                    points={`${lxStart},${lyStart} ${lxMid},${lyMid} ${lxEnd},${lyEnd}`}
                                    fill="none"
                                    stroke={segment.color}
                                    strokeWidth="1.2"
                                    opacity="0.85"
                                  />
                                  <circle cx={lxStart} cy={lyStart} r="2" fill={segment.color} />

                                  {/* 외부 텍스트 */}
                                  <text
                                    x={txExternal}
                                    y={tyExternal - 3}
                                    textAnchor={isRightSide ? "start" : "end"}
                                    fill="var(--text-primary)"
                                    fontSize="11"
                                    fontWeight="900"
                                  >
                                    {segment.label}
                                  </text>
                                  <text
                                    x={txExternal}
                                    y={tyExternal + 8}
                                    textAnchor={isRightSide ? "start" : "end"}
                                    fill="var(--primary)"
                                    fontSize="10"
                                    fontWeight="bold"
                                  >
                                    ({segment.actualPercent.toFixed(1)}%)
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        });
                      })()
                    )}
                  </svg>
                </div>
              </div>
            </section>

            {/* 연간 수입/지출 분석 그래프 패널 */}
            <section className="glass-panel annual-chart-panel" style={{ position: 'relative', paddingLeft: '8px', paddingRight: '8px', overflow: 'visible', zIndex: 10 }}>
              <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <h2 className="panel-title-kor">연간 그래프</h2>
                </div>
                
                {/* 필터 칩 선택기 */}
                <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-input)', padding: '3px 4px', borderRadius: '10px', border: '1px solid var(--border-input)' }}>
                  <button 
                    type="button" 
                    onClick={() => setChartFilter('both')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      borderRadius: '8px',
                      border: 'none',
                      background: chartFilter === 'both' ? 'var(--bg-app)' : 'transparent',
                      color: chartFilter === 'both' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      boxShadow: chartFilter === 'both' ? 'var(--shadow-sm)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    지출입
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setChartFilter('income')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      borderRadius: '8px',
                      border: 'none',
                      background: chartFilter === 'income' ? 'var(--bg-app)' : 'transparent',
                      color: chartFilter === 'income' ? 'var(--color-income)' : 'var(--text-secondary)',
                      boxShadow: chartFilter === 'income' ? 'var(--shadow-sm)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    수입
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setChartFilter('expense')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      borderRadius: '8px',
                      border: 'none',
                      background: chartFilter === 'expense' ? 'var(--bg-app)' : 'transparent',
                      color: chartFilter === 'expense' ? 'var(--color-expense)' : 'var(--text-secondary)',
                      boxShadow: chartFilter === 'expense' ? 'var(--shadow-sm)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    지출
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setChartFilter('asset')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      borderRadius: '8px',
                      border: 'none',
                      background: chartFilter === 'asset' ? 'var(--bg-app)' : 'transparent',
                      color: chartFilter === 'asset' ? 'var(--color-asset)' : 'var(--text-secondary)',
                      boxShadow: chartFilter === 'asset' ? 'var(--shadow-sm)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    자산
                  </button>
                </div>
                {chartFilter === 'asset' && latestTrackedAsset && latestTrackedAsset.asset !== null && (
                  <span className="yearly-asset-current">현재 순자산 {displayCurrency(latestTrackedAsset.asset)}</span>
                )}
              </div>

              {/* 연간 차트 영역 */}
              <div style={{ width: '100%', position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: '100%', position: 'relative' }}>
                  <svg width="100%" height="320" viewBox="0 0 560 320" onClick={() => setHoveredChartIndex(null)} style={{ display: 'block', overflow: 'visible' }}>
                    {/* SVG Definition for Gradients */}
                    <defs>
                      <linearGradient id="chart-income-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                      <linearGradient id="chart-expense-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" />
                        <stop offset="100%" stopColor="#ef4444" />
                      </linearGradient>
                      <linearGradient id="chart-asset-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>

                    {/* Y축 그리드 라인 & 라벨 */}
                    {(() => {
                      const isAssetChart = chartFilter === 'asset';
                      const toNiceStep = (value: number) => {
                        const magnitude = 10 ** Math.floor(Math.log10(value));
                        const normalized = value / magnitude;
                        return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
                      };
                      const assetValues = yearlyData.flatMap((data) => data.asset === null ? [] : [data.asset]);
                      const assetMinimum = Math.min(...assetValues);
                      const assetMaximum = Math.max(...assetValues);
                      const standardMaximum = Math.max(
                        ...yearlyData.map((data) => {
                          if (chartFilter === 'income') return data.income;
                          if (chartFilter === 'expense') return data.expense;
                          return Math.max(data.income, data.expense);
                        }),
                        100000
                      );
                      const valueRange = isAssetChart
                        ? Math.max(assetMaximum - assetMinimum, Math.max(Math.abs(assetMaximum) * 0.04, 100000))
                        : standardMaximum;
                      const stepSize = toNiceStep(valueRange / 5);
                      const chartMinY = isAssetChart ? Math.floor((assetMinimum - stepSize * 0.5) / stepSize) * stepSize : 0;
                      const chartMaxY = isAssetChart
                        ? Math.ceil((assetMaximum + stepSize * 0.5) / stepSize) * stepSize
                        : Math.ceil(standardMaximum / stepSize) * stepSize;
                      const scale = 210 / Math.max(chartMaxY - chartMinY, stepSize);
                      const gridValues = [];
                      for (let value = chartMinY; value <= chartMaxY; value += stepSize) {
                        gridValues.push(value);
                      }
                      const chartY = (value: number) => 260 - (value - chartMinY) * scale;
                      const chartX = (index: number) => 48 + index * (482 / 12) + (482 / 24);
                      const formatAxisValue = (value: number) => {
                        const sign = value < 0 ? '-' : '';
                        const absolute = Math.abs(value);
                        if (absolute >= 100000000) return `${sign}${(absolute / 100000000).toFixed(1)}억`;
                        if (absolute >= 10000) return `${sign}${Math.round(absolute / 10000)}만`;
                        return `${value}`;
                      };

                      return (
                        <g>
                          {gridValues.map((val, idx) => {
                            const y = chartY(val); // 차트 높이 기준 Y 좌표 (y=40 ~ y=190)
                            return (
                              <g key={idx}>
                                <line 
                                  x1="48" 
                                  y1={y} 
                                  x2="530" 
                                  y2={y} 
                                  stroke="var(--border-card)" 
                                  strokeDasharray="4 4" 
                                  strokeWidth="1" 
                                  opacity="0.5"
                                />
                                <text 
                                  x="40" 
                                  y={y + 4} 
                                  textAnchor="end" 
                                  fontSize="9.5" 
                                  fontWeight="600"
                                  fill="var(--text-secondary)"
                                >
                                  {formatAxisValue(val)}
                                </text>
                              </g>
                            );
                          })}

                          {/* X축 기본 라인 */}
                          <line x1="48" y1={chartY(isAssetChart ? chartMinY : 0)} x2="530" y2={chartY(isAssetChart ? chartMinY : 0)} stroke="var(--border-card)" strokeWidth="1.5" />

                          {isAssetChart && (
                            <polyline
                              points={yearlyData.map((data, index) => data.asset === null ? null : `${chartX(index)},${chartY(data.asset)}`).filter((point): point is string => point !== null).join(' ')}
                              fill="none"
                              stroke="url(#chart-asset-grad)"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {/* 12개월 바 차트 렌더 */}
                          {yearlyData.map((d, idx) => {
                            const xCenter = chartX(idx);
                            
                            const incHeight = d.income * scale;
                            const expHeight = d.expense * scale;
                            
                            const showIncome = chartFilter === 'both' || chartFilter === 'income';
                            const showExpense = chartFilter === 'both' || chartFilter === 'expense';
                            const showAsset = chartFilter === 'asset';

                            return (
                              <g 
                                key={idx} 
                                onMouseEnter={(e) => {
                                  setHoveredChartIndex(idx);
                                  setHoveredChartPos({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseMove={(e) => {
                                  setHoveredChartPos({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseLeave={() => setHoveredChartIndex(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHoveredChartIndex(idx);
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                {/* 백그라운드 마우스 감지 보이지 않는 바 */}
                                <rect 
                                  x={xCenter - (482 / 24)} 
                                  y="20" 
                                  width={482 / 12} 
                                  height="250"
                                  fill="transparent"
                                />

                                {/* 수입 막대 */}
                                {showIncome && (
                                  <rect
                                    x={chartFilter === 'both' ? xCenter - 12 : xCenter - 9}
                                    y={260 - incHeight}
                                    width={chartFilter === 'both' ? '10' : '18'}
                                    height={Math.max(incHeight, 2)}
                                    rx="3"
                                    ry="3"
                                    fill="url(#chart-income-grad)"
                                    opacity={hoveredChartIndex === null || hoveredChartIndex === idx ? 1 : 0.45}
                                    style={{ transition: 'all 0.2s ease-in-out' }}
                                  />
                                )}

                                {/* 지출 막대 */}
                                {showExpense && (
                                  <rect
                                    x={chartFilter === 'both' ? xCenter + 2 : xCenter - 9}
                                    y={260 - expHeight}
                                    width={chartFilter === 'both' ? '10' : '18'}
                                    height={Math.max(expHeight, 2)}
                                    rx="3"
                                    ry="3"
                                    fill="url(#chart-expense-grad)"
                                    opacity={hoveredChartIndex === null || hoveredChartIndex === idx ? 1 : 0.45}
                                    style={{ transition: 'all 0.2s ease-in-out' }}
                                  />
                                )}

                                {showAsset && d.asset !== null && (
                                  <circle
                                    cx={xCenter}
                                    cy={chartY(d.asset)}
                                    r={hoveredChartIndex === idx ? 5 : 3.5}
                                    fill="var(--bg-card)"
                                    stroke="#10b981"
                                    strokeWidth="2.5"
                                    style={{ transition: 'all 0.2s ease-in-out' }}
                                  />
                                )}

                                {/* X축 월 이름 라벨 */}
                                <text
                                  x={xCenter}
                                  y="280"
                                  textAnchor="middle"
                                  fontSize="11"
                                  fontWeight="bold"
                                  fill={selectedMonth.endsWith(String(idx + 1).padStart(2, '0')) ? 'var(--primary)' : 'var(--text-secondary)'}
                                >
                                  {d.month}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* 실시간 대화형 오버레이 팝업 (상단에 위치시켜 모바일/데스크톱 화면 잘림 방지) */}
              {hoveredChartIndex !== null && (
                <div 
                  onClick={() => setHoveredChartIndex(null)}
                  style={{
                    position: 'absolute',
                    left: `calc(28% + ${(hoveredChartIndex / 11) * 44}%)`, /* 1월~12월 기둥 위치에 맞추어 좌우 슬라이딩 */
                    top: '12px', /* 상단에 배치하여 모바일 화면 하단 잘림 방지 */
                    transform: 'translateX(-50%)',
                    width: 'auto',
                    minWidth: '180px',
                    maxWidth: '240px',
                    background: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    color: '#ffffff',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    fontSize: '0.78rem',
                    zIndex: 1000,
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    boxSizing: 'border-box',
                    transition: 'left 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                  title="터치하여 닫기"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.12)', paddingBottom: '4px' }}>
                    <strong style={{ fontSize: '0.82rem', color: '#f8fafc' }}>
                      {selectedMonth.slice(0, 4)}년 {yearlyData[hoveredChartIndex].month} 상세
                    </strong>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: '6px' }}>✕</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {(chartFilter === 'both' || chartFilter === 'income') && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: '#34d399', fontWeight: 600 }}>🟢 수입:</span>
                        <span style={{ fontWeight: 'bold' }}>{displayCurrency(yearlyData[hoveredChartIndex].income)}</span>
                      </div>
                    )}
                    {(chartFilter === 'both' || chartFilter === 'expense') && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: '#f87171', fontWeight: 600 }}>🔴 지출:</span>
                        <span style={{ fontWeight: 'bold' }}>{displayCurrency(yearlyData[hoveredChartIndex].expense)}</span>
                      </div>
                    )}
                    {chartFilter === 'asset' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: '#34d399', fontWeight: 600 }}>자산:</span>
                        <span style={{ fontWeight: 'bold' }}>{yearlyData[hoveredChartIndex].asset === null ? '기록 전' : displayCurrency(yearlyData[hoveredChartIndex].asset)}</span>
                      </div>
                    )}
                    {chartFilter === 'both' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.2)', paddingTop: '3px', marginTop: '2px' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 600 }}>⚖️ 순수익:</span>
                        <span style={{ fontWeight: 'bold', color: yearlyData[hoveredChartIndex].income - yearlyData[hoveredChartIndex].expense >= 0 ? '#34d399' : '#f87171' }}>
                          {displayCurrency(yearlyData[hoveredChartIndex].income - yearlyData[hoveredChartIndex].expense)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
            </div>

            {/* Category summary table */}
            <section className="glass-panel summary-table-grid">
              <div className="panel-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '12px', marginBottom: '8px', gridColumn: '1 / -1' }}>
                <div>
                  <h2 className="panel-title-kor">카테고리별 요약</h2>
                </div>
                
                {/* 드롭다운 셀렉트 박스 */}
                <select
                  className="summary-category-select"
                  value={summaryType} 
                  onChange={(e) => setSummaryType(e.target.value as 'expense' | 'income' | 'asset')}
                  style={{
                    padding: '5px 28px 5px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-input)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontWeight: 'bold',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '116px',
                    width: '116px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <option value="expense">🔴 지출</option>
                  <option value="income">🔵 수입</option>
                  <option value="asset">🟢 자산</option>
                </select>
              </div>

              {/* 선택된 요약 테이블만 렌더링 */}
              <div className="summary-category-columns">
                <CategorySummaryColumn title="지출 카테고리 요약" categories={activeExpenseCategories} values={expenseSummary} formatMoney={displayCurrency} />
                <CategorySummaryColumn title="수입 카테고리 요약" categories={activeIncomeCategories} values={incomeSummary} formatMoney={displayCurrency} />
                <CategorySummaryColumn title="자산 분배 상태 요약" categories={activeAssetCategories} values={assetSummary} formatMoney={displayCurrency} />
              </div>

              <div className="summary-category-mobile">
                {summaryType === 'expense' && (
                  <CategorySummaryColumn title="지출 카테고리 요약" categories={activeExpenseCategories} values={expenseSummary} formatMoney={displayCurrency} />
                )}
                {summaryType === 'income' && (
                  <CategorySummaryColumn title="수입 카테고리 요약" categories={activeIncomeCategories} values={incomeSummary} formatMoney={displayCurrency} />
                )}
                {summaryType === 'asset' && (
                  <CategorySummaryColumn title="자산 분배 상태 요약" categories={activeAssetCategories} values={assetSummary} formatMoney={displayCurrency} />
                )}
              </div>
            </section>
          </>
        )}

        {/* Calendar View Tab */}
        {activeTab === 'calendar' && (
          <section 
            className="calendar-view-container" 
            style={{ 
              background: 'transparent', 
              border: 'none', 
              boxShadow: 'none', 
              padding: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxSizing: 'border-box'
            }}
          >
            <div className="calendar-control" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="page-title-kor page-title-with-icon">
                <AppIcon name="calendar" size={18} />
                {calendarYear}년 {calendarMonth + 1}월
              </h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="calendar-nav-buttons">
                  <button type="button" className="calendar-nav-btn" onClick={handleCalendarPrev}>
                    <AppIcon name="chevronLeft" size={20} />
                  </button>
                  <button type="button" className="calendar-nav-btn" onClick={handleCalendarNext}>
                    <AppIcon name="chevronRight" size={20} />
                  </button>
                </div>
              </div>
            </div>

            <div className="calendar-day-names-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '4px' }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                <div
                  key={day}
                  className={`calendar-day-name ${idx === 0 ? 'sunday' : idx === 6 ? 'saturday' : ''}`}
                  style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, padding: '6px 0' }}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarDays.map((day) => {
                const daySums = dateWiseSums[day.dateStr];
                const isSelected = selectedDayData === day.dateStr;
                const isToday = day.dateStr === getToday();
                
                return (
                  <div
                    key={day.dateStr}
                    className={`calendar-cell ${day.isCurrentMonth ? '' : 'prev-month'} ${
                      day.dayOfWeek === 0 ? 'sunday' : day.dayOfWeek === 6 ? 'saturday' : ''
                    } ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedDayData(day.dateStr);
                      setModalTab('view');
                    }}
                  >
                    <span className="date-number">{day.dayNum}</span>
                    <div className="day-values">
                      {daySums?.income > 0 && (
                        <span className="calendar-value-badge income"><span className="calendar-value-sign">+</span>{displayCalendarAmount(daySums.income)}</span>
                      )}
                      {daySums?.expense > 0 && (
                        <span className="calendar-value-badge expense"><span className="calendar-value-sign">−</span>{displayCalendarAmount(daySums.expense)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Ledger List Tab */}
        {activeTab === 'ledger' && (
          <section className="ledger-workspace">
            <div className="ledger-view-toggle" role="tablist" aria-label="장부 보기 전환">
              <button type="button" className={ledgerView === 'daily' ? 'active' : ''} onClick={() => setLedgerView('daily')}>일일</button>
              <button type="button" className={ledgerView === 'calendar' ? 'active' : ''} onClick={() => setLedgerView('calendar')}>달력</button>
              <button type="button" className={ledgerView === 'monthly' ? 'active' : ''} onClick={() => setLedgerView('monthly')}>월별</button>
              <button type="button" className={ledgerView === 'settlement' ? 'active' : ''} onClick={() => setLedgerView('settlement')}>결산</button>
            </div>
            {ledgerView !== 'settlement' && (
              <div className="ledger-month-summary" aria-label={`${selectedMonth} 수입 지출 합계`}>
                <div><span>수입</span><strong className="income">{displayCurrency(incomeTotal)}</strong></div>
                <div><span>지출</span><strong className="expense">{displayCurrency(expenseTotal)}</strong></div>
                <div><span>합계</span><strong>{displayCurrency(balance)}</strong></div>
              </div>
            )}
            {ledgerView === 'daily' && (
              <>
              <div className="ledger-filters">
                <input
                  type="text"
                  placeholder="제목 또는 카테고리 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="all">모든 내역</option>
                  <option value="transfer">이체 내역 🟣</option>
                  <optgroup label="지출 카테고리">
                    {activeExpenseCategories.map((c: CategoryOption) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="수입 카테고리">
                    {activeIncomeCategories.map((c: CategoryOption) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="ledger-header">
                <h2 className="page-title-kor page-title-with-icon"><AppIcon name="ledger" size={18} /> 거래 장부 목록</h2>
                <span className="record-count">{filteredLedgerTransactions.length}건 검색됨</span>
              </div>

            <div className="split-ledger">
              <TransactionListTable
                title="지출 내역"
                type="expense"
                items={filteredLedgerTransactions.filter((t) => t.type === 'expense')}
                onDelete={handleDeleteTransaction}
                onEdit={(transaction) => openAmountEntry(() => setEditingTransaction(transaction))}
                categories={allExpenseCategories}
                assetCategories={allAssetCategories}
                assets={assets}
                onStopRecurring={handleStopRecurringFromTx}
                formatMoney={displayCurrency}
              />
              <TransactionListTable
                title="수입 내역"
                type="income"
                items={filteredLedgerTransactions.filter((t) => t.type === 'income')}
                onDelete={handleDeleteTransaction}
                onEdit={(transaction) => openAmountEntry(() => setEditingTransaction(transaction))}
                categories={allIncomeCategories}
                assetCategories={allAssetCategories}
                assets={assets}
                onStopRecurring={handleStopRecurringFromTx}
                formatMoney={displayCurrency}
              />
              <TransactionListTable
                title="이체 내역"
                type="transfer"
                items={filteredLedgerTransactions.filter((t) => t.type === 'transfer')}
                onDelete={handleDeleteTransaction}
                onEdit={(transaction) => openAmountEntry(() => setEditingTransaction(transaction))}
                categories={[]}
                assetCategories={allAssetCategories}
                assets={assets}
                onStopRecurring={handleStopRecurringFromTx}
                formatMoney={displayCurrency}
              />
            </div>
            <MobileLedgerTimeline
              items={filteredLedgerTransactions}
              expenseCategories={allExpenseCategories}
              incomeCategories={allIncomeCategories}
              assetCategories={allAssetCategories}
              assets={assets}
              formatMoney={displayCurrency}
              onEdit={(transaction) => openAmountEntry(() => setEditingTransaction(transaction))}
              onDelete={handleDeleteTransaction}
            />
              </>
            )}
            {ledgerView === 'calendar' && renderLedgerCalendar()}
            {ledgerView === 'monthly' && (
              <div className="ledger-monthly-view">
                {ledgerMonthlySummaries.length === 0 ? (
                  <p className="empty-note">표시할 월별 거래가 없습니다.</p>
                ) : ledgerMonthlySummaries.map((summary) => (
                  <div className="ledger-month-group" key={summary.month}>
                    <button
                      type="button"
                      className={`ledger-period-row ledger-month-toggle ${expandedLedgerMonth === summary.month ? 'expanded' : ''}`}
                      aria-expanded={expandedLedgerMonth === summary.month}
                      onClick={() => setExpandedLedgerMonth((current) => current === summary.month ? null : summary.month)}
                    >
                      <span className="ledger-period-label"><strong>{summary.label}</strong><small>{summary.month.slice(5)}. 1. ~ {summary.month.slice(5)}. {new Date(Number(summary.month.slice(0, 4)), Number(summary.month.slice(5)), 0).getDate()}.</small></span>
                      <strong className="income">{displayCurrency(summary.income)}</strong>
                      <strong className="expense">{displayCurrency(summary.expense)}</strong>
                      <span className="ledger-month-disclosure" aria-hidden="true"><AppIcon name="chevronRight" size={17} /></span>
                    </button>
                    {expandedLedgerMonth === summary.month && (
                      <div className="ledger-weekly-list">
                        <div className="ledger-weekly-heading">{summary.label} 주간 내역</div>
                        {ledgerWeeklySummaries.map((week) => (
                          <div className="ledger-period-row weekly" key={week.start}>
                            <div className="ledger-period-label"><strong>{week.label}</strong></div>
                            <strong className="income">{displayCurrency(week.income)}</strong>
                            <strong className="expense">{displayCurrency(week.expense)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {ledgerView === 'settlement' && (
              <div className="ledger-settlement-view">
                {/* 상단 요약 카드 */}
                <div className="settlement-summary-card">
                  <div className="settlement-summary-top">
                    <h3 className="settlement-summary-title">
                      <AppIcon name="plan" size={19} /> {selectedMonth.slice(0, 4)}년 {Number(selectedMonth.slice(5, 7))}월 예산 결산
                    </h3>
                    <div className="settlement-type-toggle" role="tablist" aria-label="결산 구분">
                      <button
                        type="button"
                        className={`expense ${settlementType === 'expense' ? 'active' : ''}`}
                        onClick={() => setSettlementType('expense')}
                      >
                        지출 예산
                      </button>
                      <button
                        type="button"
                        className={`income ${settlementType === 'income' ? 'active' : ''}`}
                        onClick={() => setSettlementType('income')}
                      >
                        수입 목표
                      </button>
                    </div>
                  </div>

                  {settlementType === 'expense' ? (
                    <>
                      <div className="settlement-stat-grid">
                        <div className="settlement-stat-item">
                          <span>지출 예산</span>
                          <strong>{displayCurrency(plannedExpenseTotal)}</strong>
                        </div>
                        <div className="settlement-stat-item">
                          <span>실제 지출</span>
                          <strong className="expense">{displayCurrency(expenseTotal)}</strong>
                        </div>
                        <div className="settlement-stat-item">
                          <span>{plannedExpenseTotal >= expenseTotal ? '잔여 예산' : '초과 지출'}</span>
                          {plannedExpenseTotal >= expenseTotal ? (
                            <strong className="settlement-remain-positive">{displayCurrency(plannedExpenseTotal - expenseTotal)} 남음</strong>
                          ) : (
                            <strong className="settlement-remain-negative">{displayCurrency(expenseTotal - plannedExpenseTotal)} 초과</strong>
                          )}
                        </div>
                      </div>

                      <div className="settlement-overall-progress">
                        <div className="settlement-progress-labels">
                          <span>전체 예산 소진율</span>
                          <strong className={plannedExpenseTotal > 0 && expenseTotal > plannedExpenseTotal ? 'danger' : ''}>
                            {plannedExpenseTotal > 0 ? `${Math.round((expenseTotal / plannedExpenseTotal) * 100)}%` : '예산 미설정'}
                          </strong>
                        </div>
                        <div className="settlement-progress-bar">
                          <div
                            className={`settlement-progress-fill ${
                              plannedExpenseTotal > 0 && expenseTotal > plannedExpenseTotal
                                ? 'danger'
                                : plannedExpenseTotal > 0 && (expenseTotal / plannedExpenseTotal) >= 0.8
                                ? 'warn'
                                : 'safe'
                            }`}
                            style={{
                              width: `${plannedExpenseTotal > 0 ? Math.min(Math.round((expenseTotal / plannedExpenseTotal) * 100), 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="settlement-stat-grid">
                        <div className="settlement-stat-item">
                          <span>수입 목표</span>
                          <strong>{displayCurrency(plannedIncomeTotal)}</strong>
                        </div>
                        <div className="settlement-stat-item">
                          <span>실제 수입</span>
                          <strong className="income">{displayCurrency(incomeTotal)}</strong>
                        </div>
                        <div className="settlement-stat-item">
                          <span>{incomeTotal >= plannedIncomeTotal ? '초과 달성' : '목표 부족'}</span>
                          {incomeTotal >= plannedIncomeTotal ? (
                            <strong className="settlement-remain-positive">{displayCurrency(incomeTotal - plannedIncomeTotal)} 달성</strong>
                          ) : (
                            <strong className="settlement-remain-negative">{displayCurrency(plannedIncomeTotal - incomeTotal)} 부족</strong>
                          )}
                        </div>
                      </div>

                      <div className="settlement-overall-progress">
                        <div className="settlement-progress-labels">
                          <span>목표 대비 달성률</span>
                          <strong className="income">
                            {plannedIncomeTotal > 0 ? `${Math.round((incomeTotal / plannedIncomeTotal) * 100)}%` : '목표 미설정'}
                          </strong>
                        </div>
                        <div className="settlement-progress-bar">
                          <div
                            className="settlement-progress-fill income-achieved"
                            style={{
                              width: `${plannedIncomeTotal > 0 ? Math.min(Math.round((incomeTotal / plannedIncomeTotal) * 100), 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 카테고리별 결산 목록 */}
                {settlementType === 'expense' ? (
                  <div className="settlement-category-list">
                    {expenseSettlementList.length === 0 ? (
                      <p className="empty-note">표시할 지출 내역이 없습니다.</p>
                    ) : (
                      expenseSettlementList.map((item) => {
                        const isExpanded = expandedSettlementCategory === `expense-${item.category.id}`;
                        return (
                          <div
                            key={item.category.id}
                            className={`settlement-category-card ${item.isOver ? 'is-over' : ''}`}
                          >
                            <div
                              className="settlement-category-main"
                              onClick={() =>
                                setExpandedSettlementCategory((curr) =>
                                  curr === `expense-${item.category.id}` ? null : `expense-${item.category.id}`
                                )
                              }
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                            >
                              <div className="settlement-cat-info">
                                <CategoryBadge categories={allExpenseCategories} idOrLabel={item.category.id} />
                                <span className="settlement-budget-label">
                                  {item.budget > 0 ? `예산 ${displayCurrency(item.budget)}` : '예산 미설정'}
                                </span>
                              </div>

                              <div className="settlement-gauge-wrap">
                                <div className="settlement-gauge-bar">
                                  <div
                                    className={`settlement-gauge-fill ${
                                      item.isOver
                                        ? 'danger'
                                        : item.percent >= 80
                                        ? 'warn'
                                        : item.budget === 0 && item.spent === 0
                                        ? 'empty'
                                        : 'safe'
                                    }`}
                                    style={{ width: `${Math.min(item.percent, 100)}%` }}
                                  />
                                </div>
                                <span
                                  className={`settlement-gauge-percent ${
                                    item.isOver ? 'danger' : item.percent >= 80 ? 'warn' : ''
                                  }`}
                                >
                                  {item.budget > 0 ? `${item.percent}%` : item.spent > 0 ? '미설정' : '0%'}
                                </span>
                              </div>

                              <div className="settlement-cat-result">
                                <strong className={`settlement-spent-amount ${item.isOver ? 'danger' : ''}`}>
                                  {displayCurrency(item.spent)}
                                </strong>
                                <span className={`settlement-diff-badge ${item.isOver ? 'danger' : 'safe'}`}>
                                  {item.budget > 0
                                    ? item.diff >= 0
                                      ? `${displayCurrency(item.diff)} 남음`
                                      : `${displayCurrency(Math.abs(item.diff))} 초과`
                                    : item.spent > 0
                                    ? `${displayCurrency(item.spent)} 지출`
                                    : '0원'}
                                </span>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="settlement-category-drawer">
                                <div className="settlement-drawer-inner">
                                  <div className="settlement-drawer-heading">
                                    <span>{item.category.label} 지출 세부 내역 ({item.transactions.length}건)</span>
                                    <span>금액</span>
                                  </div>
                                  {item.transactions.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      이번 달 지출 내역이 없습니다.
                                    </div>
                                  ) : (
                                    item.transactions.map((tx) => (
                                      <div key={tx.id} className="settlement-drawer-tx-item">
                                        <div className="settlement-drawer-tx-left">
                                          <span className="settlement-drawer-tx-date">{tx.date.slice(5)}</span>
                                          <span className="settlement-drawer-tx-title">{tx.title || item.category.label}</span>
                                        </div>
                                        <strong className="settlement-drawer-tx-amount expense">
                                          -{displayCurrency(tx.amount)}
                                        </strong>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="settlement-category-list">
                    {incomeSettlementList.length === 0 ? (
                      <p className="empty-note">표시할 수입 내역이 없습니다.</p>
                    ) : (
                      incomeSettlementList.map((item) => {
                        const isExpanded = expandedSettlementCategory === `income-${item.category.id}`;
                        return (
                          <div
                            key={item.category.id}
                            className="settlement-category-card"
                          >
                            <div
                              className="settlement-category-main"
                              onClick={() =>
                                setExpandedSettlementCategory((curr) =>
                                  curr === `income-${item.category.id}` ? null : `income-${item.category.id}`
                                )
                              }
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                            >
                              <div className="settlement-cat-info">
                                <CategoryBadge categories={allIncomeCategories} idOrLabel={item.category.id} />
                                <span className="settlement-budget-label">
                                  {item.target > 0 ? `목표 ${displayCurrency(item.target)}` : '목표 미설정'}
                                </span>
                              </div>

                              <div className="settlement-gauge-wrap">
                                <div className="settlement-gauge-bar">
                                  <div
                                    className={`settlement-gauge-fill ${
                                      item.isAchieved ? 'income' : item.target === 0 && item.actual === 0 ? 'empty' : 'safe'
                                    }`}
                                    style={{ width: `${Math.min(item.percent, 100)}%` }}
                                  />
                                </div>
                                <span className="settlement-gauge-percent">
                                  {item.target > 0 ? `${item.percent}%` : item.actual > 0 ? '미설정' : '0%'}
                                </span>
                              </div>

                              <div className="settlement-cat-result">
                                <strong className="settlement-spent-amount income">
                                  +{displayCurrency(item.actual)}
                                </strong>
                                <span className={`settlement-diff-badge ${item.isAchieved ? 'income-good' : 'safe'}`}>
                                  {item.target > 0
                                    ? item.diff >= 0
                                      ? `${displayCurrency(item.diff)} 달성`
                                      : `${displayCurrency(Math.abs(item.diff))} 부족`
                                    : item.actual > 0
                                    ? `${displayCurrency(item.actual)} 수입`
                                    : '0원'}
                                </span>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="settlement-category-drawer">
                                <div className="settlement-drawer-inner">
                                  <div className="settlement-drawer-heading">
                                    <span>{item.category.label} 수입 세부 내역 ({item.transactions.length}건)</span>
                                    <span>금액</span>
                                  </div>
                                  {item.transactions.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      이번 달 수입 내역이 없습니다.
                                    </div>
                                  ) : (
                                    item.transactions.map((tx) => (
                                      <div key={tx.id} className="settlement-drawer-tx-item">
                                        <div className="settlement-drawer-tx-left">
                                          <span className="settlement-drawer-tx-date">{tx.date.slice(5)}</span>
                                          <span className="settlement-drawer-tx-title">{tx.title || item.category.label}</span>
                                        </div>
                                        <strong className="settlement-drawer-tx-amount income">
                                          +{displayCurrency(tx.amount)}
                                        </strong>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 정기 지출 규칙 관리 영역 외부 분리 */}
{/* Assets Portfolio Tab */}
        {activeTab === 'asset' && (
          selectedAsset ? (
            (() => {
              const openingBalance = getAssetOpeningBalance(selectedAsset!);
              const currentBalance = getAssetBalance(selectedAsset!.id, openingBalance);
              const history = transactions
                .filter((transaction) => transaction.date <= todayStr && (transaction.assetId === selectedAsset!.id || transaction.toAssetId === selectedAsset!.id))
                .sort((a, b) => (b.date + ' ' + (b.time || '')).localeCompare(a.date + ' ' + (a.time || '')));
              const hasCardSchedule = selectedAsset.cardCycleStartDay != null && selectedAsset.cardCycleEndDay != null && selectedAsset.cardPaymentDay != null && selectedAsset.cardPaymentAssetId != null;
              const currentAsset = assets.find((asset) => asset.id === selectedAsset.id) ?? selectedAsset;
              const paymentAsset = assets.find((asset) => asset.id === selectedAsset.cardPaymentAssetId) ?? null;
              const paymentAssetOptions = assets.filter((asset) => asset.id !== currentAsset.id && !isLiabilityAsset(asset, allAssetCategories, categoryLabels));
              const pendingCardPayments = cardPaymentPeriods(currentAsset, transactions);
              const currentPaymentDueDate = cardPaymentDueDateForToday(currentAsset, todayStr);
              const visibleCardPayments = showAllCardPayments || !currentPaymentDueDate
                ? pendingCardPayments
                : pendingCardPayments.filter((period) => period.dueDate <= currentPaymentDueDate);
              const hiddenCardPaymentCount = pendingCardPayments.length - visibleCardPayments.length;
              return <section className="asset-history-page" aria-label="자산 상세 이력">
                <header className="asset-history-page-header">
                  <button type="button" className="asset-history-back" onClick={returnToAssetList} aria-label="자산 목록으로 돌아가기">
                    <AppIcon name="chevronLeft" size={20} />
                  </button>
                  <div className="asset-history-page-title"><span>자산 이력</span><strong>{formatAssetLabel(currentAsset, allAssetCategories)}</strong></div>
                  <button type="button" className="asset-history-settings-button" onClick={() => setIsAssetSettingsOpen(true)}>자산 설정</button>
                </header>
                <div className="asset-history-page-body">
                  <div className="asset-history-overview">
                  <div className="asset-history-current">
                    <div><span>현재 자산</span><strong>{displayCurrency(currentBalance)}</strong><small>기초 금액 {displayCurrency(openingBalance)}</small></div>
                    <CategoryBadge categories={allAssetCategories} idOrLabel={currentAsset.category} />
                  </div>
                  {hasCardSchedule && pendingCardPayments.length > 0 && <section className="asset-card-payment-list" aria-label="미결제 카드 청구 기간">
                    {visibleCardPayments.map((period) => <div className="asset-card-payment-row" key={period.periodStart}>
                      <div><span>{period.dueDate.replace(/-/g, '.')} 결제 예상액</span><strong>{displayCurrency(period.amount)}</strong></div>
                      {(!currentPaymentDueDate || period.dueDate <= currentPaymentDueDate) ? <button type="button" className="primary-button" onClick={() => {
                        if (window.confirm(`${period.periodStart} ~ ${period.periodEnd} 사용분 ${displayCurrency(period.amount)}을 ${paymentAsset ? formatAssetLabel(paymentAsset, allAssetCategories) : '결제 계좌'}에서 결제 처리할까요?`)) {
                          void handleCardSettlement(currentAsset, period);
                        }
                      }}>결제</button> : <span className="asset-card-payment-future">예정</span>}
                    </div>)}
                    {!showAllCardPayments && hiddenCardPaymentCount > 0 && <button type="button" className="asset-card-payment-toggle" onClick={() => setShowAllCardPayments(true)}>결제 금액 전체 보기 · {hiddenCardPaymentCount}건</button>}
                    {showAllCardPayments && hiddenCardPaymentCount > 0 && <button type="button" className="asset-card-payment-toggle" onClick={() => setShowAllCardPayments(false)}>결제 금액 간단히 보기</button>}
                  </section>}
                  {hasCardSchedule && <div className="asset-card-schedule-summary">사용 기간 {selectedAsset.cardCycleStartDay}일 ~ 다음 달 {selectedAsset.cardCycleEndDay}일 · 결제일(다음 달) {selectedAsset.cardPaymentDay}일 · 결제 계좌 {paymentAsset ? formatAssetLabel(paymentAsset, allAssetCategories) : '미선택'}</div>}
                  <form className="asset-balance-adjust-form" onSubmit={(e) => {
                    e.preventDefault();
                    const nextBalance = Number(assetBalanceDraft);
                    const difference = nextBalance - currentBalance;
                    if (!Number.isFinite(nextBalance) || nextBalance < 0) { showNotice('0원 이상의 금액을 입력해 주세요.', '입력 확인', 'warning'); return; }
                    if (!difference) return;
                    const direction = difference > 0 ? '수입(+)' : '지출(-)';
                    if (window.confirm('차액 ' + formatCurrency(Math.abs(difference)) + '을 ' + direction + ' 거래로 장부에 기록할까요?')) {
                      handleAssetBalanceAdjustment(selectedAsset, nextBalance);
                    }
                  }}>
                    <label htmlFor="asset-balance-draft">현재 잔액 수정</label>
                    <div><input id="asset-balance-draft" type="text" inputMode="numeric" value={assetBalanceDraft ? formatNumberInput(parseNumberInput(assetBalanceDraft)) : ''} onChange={(e) => setAssetBalanceDraft(e.target.value.replace(/[^\d]/g, ''))} /><button type="submit" className="primary-button">차액 기록</button></div>
                    <p>저장 전 차액을 수입 또는 지출 거래로 기록할지 확인합니다.</p>
                  </form>
                  </div>
                  <div className="asset-history-list">
                    <h4>변동 내역 <span>{history.length}건</span></h4>
                    {history.length === 0 ? <p className="empty-note">변동 내역이 없습니다.</p> : history.map((transaction) => {
                      const isIncoming = (transaction.type === 'income' && transaction.assetId === selectedAsset.id) || transaction.toAssetId === selectedAsset.id;
                      return <div className="asset-history-item" key={transaction.id}><div><strong>{transaction.category === OPENING_BALANCE_CATEGORY ? '기초 잔액' : (transaction.title || '거래')}{transaction.cardSettlementId && <em className="card-settled-tag">결제완료</em>}</strong><span>{transaction.date}{transaction.time ? ' ' + transaction.time : ''}</span></div><b className={isIncoming ? 'income' : 'expense'}>{isIncoming ? '+' : '−'}{displayCurrency(transaction.amount)}</b></div>;
                    })}
                  </div>
                </div>
                {isAssetSettingsOpen && (
                  <div className="modal-backdrop asset-settings-backdrop" onClick={() => setIsAssetSettingsOpen(false)}>
                    <form className="modal-content asset-settings-modal" onClick={(event) => event.stopPropagation()} onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const cardCycleStartDay = Number(form.get('cardCycleStartDay')) || null;
                      const cardCycleEndDay = Number(form.get('cardCycleEndDay')) || null;
                      const cardPaymentDay = Number(form.get('cardPaymentDay')) || null;
                      const cardPaymentAssetId = String(form.get('cardPaymentAssetId') || '') || null;
                      if ([cardCycleStartDay, cardCycleEndDay, cardPaymentDay, cardPaymentAssetId].some((value) => value == null) && [cardCycleStartDay, cardCycleEndDay, cardPaymentDay, cardPaymentAssetId].some((value) => value != null)) {
                        showNotice('사용 기간·결제일·결제 계좌는 함께 설정해 주세요.', '입력 확인', 'warning');
                        return;
                      }
                      const saved = await handleUpdateAsset({ ...currentAsset, cardCycleStartDay, cardCycleEndDay, cardPaymentDay, cardPaymentAssetId });
                      if (saved) {
                        setSelectedAsset((previous) => previous ? { ...previous, cardCycleStartDay, cardCycleEndDay, cardPaymentDay, cardPaymentAssetId } : previous);
                        setIsAssetSettingsOpen(false);
                      }
                    }}>
                      <div className="modal-header"><h3>자산 설정</h3></div>
                      <div className="asset-settings-fields">
                        <p>비워 두면 이 자산은 결제 주기 없이 단순 누적으로 관리됩니다.</p>
                        <div className="asset-settings-schedule-row">
                          <label>시작일<select name="cardCycleStartDay" defaultValue={currentAsset.cardCycleStartDay ?? ''}><option value="">설정 안 함</option>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}일</option>)}</select></label>
                          <label>종료일<select name="cardCycleEndDay" defaultValue={currentAsset.cardCycleEndDay ?? ''}><option value="">설정 안 함</option>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}일</option>)}</select></label>
                        </div>
                        <label>결제일(다음 달)<select name="cardPaymentDay" defaultValue={currentAsset.cardPaymentDay ?? ''}><option value="">설정 안 함</option>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}일</option>)}</select></label>
                        <label>결제 계좌<select name="cardPaymentAssetId" defaultValue={currentAsset.cardPaymentAssetId ?? ''}><option value="">설정 안 함</option>{paymentAssetOptions.map((asset) => <option key={asset.id} value={asset.id}>{formatAssetLabel(asset, allAssetCategories)}</option>)}</select></label>
                      </div>
                      <div className="asset-settings-actions"><button type="button" className="secondary-button" onClick={() => setIsAssetSettingsOpen(false)}>취소</button><button type="submit" className="primary-button">저장</button></div>
                    </form>
                  </div>
                )}
              </section>;
            })()
          ) : (
          <>
            {/* 자산 탭 상단 헤더 및 등록 제어 단추 */}
            <div className="tab-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h1 className="page-title-kor" style={{ marginBottom: '4px' }}>자산 현황</h1>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <strong className="section-title-icon" style={{ fontSize: '1.05rem', color: 'var(--color-asset)' }}><AppIcon name="asset" size={18} /> 자산 총액: {displayCurrency(assetTotal)}</strong>
                </div>
              </div>
            </div>

            {/* 고정 카드 그리드 영역 */}
            <div className="asset-accordion-group" style={{ display: 'grid', gap: '12px' }}>
              {/* 1. [ 자산 현황 ] 고정 카드 */}
              <div className="asset-workspace">
                <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                  <AppIcon name="asset" size={19} /> 자산 목록
                </h3>
                <div className="asset-category-list">
                  {assets.length === 0 ? (
                    <p className="empty-note" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                      등록된 자산 항목이 없습니다. 하단 중앙의 + 버튼으로 자산을 추가해보세요.
                    </p>
                  ) : (
                    assetGroups.map((group) => {
                      const groupTotal = group.assets.reduce((sum, asset) => sum + getNetAssetBalance(asset), 0);
                      return (
                      <section key={group.id} className="asset-list-category-group" data-asset-category-id={group.id}>
                        <div className="asset-list-category-head">
                          <strong>{group.label}</strong>
                          <span className="asset-list-category-summary"><span>{group.assets.length}개</span><strong>{displayCurrency(groupTotal)}</strong></span>
                        </div>
                        <div className="asset-table-list" data-asset-category-id={group.id} style={{ display: 'grid', gap: '3px' }}>
                    {group.assets.map((asset) => {
                      const index = assets.findIndex((item) => item.id === asset.id);
                      const isHovered = hoveredRowIndex === index;

                      // 그림자 없는 1px 테두리 스트로크 및 8px 보더 반경
                      const baseRowStyle: React.CSSProperties = {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        transition: 'background-color 0.15s ease, border-color 0.15s ease',
                        boxSizing: 'border-box',
                        border: isHovered ? '1px solid var(--primary)' : '1px solid var(--border-card)',
                        borderRadius: '8px',
                        boxShadow: 'none',
                        background: isHovered ? 'rgba(2, 132, 199, 0.06)' : 'var(--bg-card)',
                      };
                      
                      return (
                        <div
                          key={asset.id}
                          className={`asset-row-swipe ${assetSwipe.id === asset.id && assetSwipe.offset < 0 ? 'is-open' : ''} ${assetSwipe.id === asset.id && assetSwipe.dragging ? 'is-dragging' : ''}`}
                        >
                          <div className="asset-row-swipe-actions" aria-hidden={assetSwipe.id !== asset.id || assetSwipe.offset >= 0}>
                            <button
                              type="button"
                              className="asset-row-swipe-edit row-action-button row-action-edit"
                              aria-label="수정"
                              tabIndex={assetSwipe.id === asset.id && assetSwipe.offset < 0 ? 0 : -1}
                              onClick={() => openAmountEntry(() => {
                                setAssetSwipe({ id: null, offset: 0, dragging: false });
                                setEditingAsset(asset);
                                setRegistrationMode('asset');
                                setIsEntryModalOpen(true);
                              })}
                            >
                              <AppIcon name="edit" size={18} />
                            </button>
                            <button
                              type="button"
                              className="asset-row-swipe-delete row-action-button row-action-delete"
                              aria-label="삭제"
                              tabIndex={assetSwipe.id === asset.id && assetSwipe.offset < 0 ? 0 : -1}
                              onClick={() => {
                                setAssetSwipe({ id: null, offset: 0, dragging: false });
                                handleDeleteAsset(asset.id);
                              }}
                            >
                              ×
                            </button>
                          </div>
                          <div
                          data-asset-id={asset.id}
                          data-asset-category-id={group.id}
                          className={`asset-row ${assetHandleDragVisual.id === asset.id ? 'asset-handle-drag-source' : ''} ${assetHandleDragVisual.targetId === asset.id ? 'asset-handle-drag-target' : ''}`}
                          onMouseEnter={() => {
                            if (window.matchMedia('(hover: hover)').matches) setHoveredRowIndex(index);
                          }}
                          onMouseLeave={() => {
                            if (window.matchMedia('(hover: hover)').matches) setHoveredRowIndex(null);
                          }}
                          onClick={() => {
                            if (assetHandleDragRef.current.justDragged) {
                              assetHandleDragRef.current.justDragged = false;
                              return;
                            }
                            openAmountEntry(() => {
                              openAssetHistory(asset);
                            });
                          }}
                          style={{
                            ...baseRowStyle,
                            cursor: 'grab',
                            transform: `translateX(${assetSwipe.id === asset.id ? assetSwipe.offset : 0}px)`,
                          }}
                        >
                          {(() => {
                            const currentBalance = getNetAssetBalance(asset);
                            const openingBalance = getAssetOpeningBalance(asset);
                            const isLiability = isLiabilityAsset(asset, allAssetCategories, categoryLabels) || currentBalance < 0;
                            return (
                              <div className="asset-row-summary" style={{ display: 'flex', alignItems: 'center', minHeight: '44px' }}>
                                <span
                                  className="asset-drag-handle sortable-drag-handle"
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => startAssetHandleDrag(event, asset.id)}
                                  style={{ opacity: isHovered ? 0.8 : undefined }}
                                >{'\u283F'}</span>
                                <CategoryBadge categories={allAssetCategories} idOrLabel={asset.category} />
                                <strong className="asset-row-name">{formatAssetLabel(asset, allAssetCategories)}</strong>
                                <strong
                                  className="asset-balance-values asset-swipe-region"
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => {
                                    if (!window.matchMedia('(max-width: 768px)').matches) return;
                                    event.stopPropagation();
                                    assetSwipeGestureRef.current = { id: asset.id, startX: event.clientX, startY: event.clientY, baseOffset: assetSwipe.id === asset.id ? assetSwipe.offset : 0, isHorizontal: false };
                                  }}
                                  onPointerMove={(event) => {
                                    if (!window.matchMedia('(max-width: 768px)').matches) return;
                                    const gesture = assetSwipeGestureRef.current;
                                    if (gesture.id !== asset.id) return;
                                    const deltaX = event.clientX - gesture.startX;
                                    const deltaY = event.clientY - gesture.startY;
                                    if (!gesture.isHorizontal) {
                                      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
                                      gesture.isHorizontal = true;
                                      event.currentTarget.setPointerCapture(event.pointerId);
                                    }
                                    setAssetSwipe({ id: asset.id, offset: Math.max(-104, Math.min(0, gesture.baseOffset + deltaX)), dragging: true });
                                  }}
                                  onPointerUp={(event) => {
                                    if (!window.matchMedia('(max-width: 768px)').matches) return;
                                    const gesture = assetSwipeGestureRef.current;
                                    if (gesture.id !== asset.id || !gesture.isHorizontal) return;
                                    const offset = Math.max(-104, Math.min(0, gesture.baseOffset + event.clientX - gesture.startX));
                                    setAssetSwipe(offset <= -52 ? { id: asset.id, offset: -104, dragging: false } : { id: null, offset: 0, dragging: false });
                                    gesture.isHorizontal = false;
                                  }}
                                  onPointerCancel={() => {
                                    if (!window.matchMedia('(max-width: 768px)').matches) return;
                                    const open = assetSwipe.id === asset.id && assetSwipe.offset <= -52;
                                    setAssetSwipe(open ? { id: asset.id, offset: -104, dragging: false } : { id: null, offset: 0, dragging: false });
                                    assetSwipeGestureRef.current.isHorizontal = false;
                                  }}
                                  style={{ color: isLiability ? 'var(--danger)' : 'var(--text-primary)' }}
                                >{displayCurrency(currentBalance)}</strong>
                              </div>
                            );
                          })()}
                          <div className="asset-row-desktop-actions" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              className="asset-row-swipe-edit row-action-button row-action-edit"
                              aria-label="수정"
                              onClick={() => openAmountEntry(() => {
                                setEditingAsset(asset);
                                setRegistrationMode('asset');
                                setIsEntryModalOpen(true);
                              })}
                            >
                              <AppIcon name="edit" size={18} />
                            </button>
                            <button
                              type="button"
                              className="asset-row-swipe-delete row-action-button row-action-delete"
                              aria-label="삭제"
                              onClick={() => handleDeleteAsset(asset.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        </div>
                      );
                    })}
                        </div>
                      </section>
                    );
                  })
                )}
                </div>

                {hiddenAssetsList.length > 0 && (
                  <div 
                    className="hidden-assets-notice-bar"
                    onClick={() => {
                      setActiveTab('settings');
                      setSettingsSection('asset');
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'color-mix(in srgb, var(--bg-card) 85%, var(--bg-input))',
                      border: '1px dashed var(--border-card)',
                      cursor: 'pointer',
                      marginTop: '14px',
                      fontSize: '0.84rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 650,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span>🔒 삭제/보관된 자산이 <b>{hiddenAssetsList.length}개</b> 있습니다.</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 800 }}>설정 &gt; 자산관리에서 복원 →</span>
                  </div>
                )}
              </div>

              {/* 자산 카테고리 설정 카드 (이식 완료) */}
              <div style={{ height: '80px' }} />
            </div>
          </>
          )
        )}

        {/* Plans Tab */}
        {activeTab === 'plan' && (
          <>
            <div className="tab-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h1 className="page-title-kor">월간 계획 설정</h1>
              </div>
            </div>

            <div className="asset-accordion-group" style={{ display: 'grid', gap: '12px' }}>
              <div className="glass-panel" style={{ padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                  <AppIcon name="plan" size={19} /> 월간 계획 (수입/지출 예산)
                </h3>

                <div className="plans-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* 지출 계획 */}
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '12px', color: 'var(--color-expense)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔴</span> 지출 예산 계획
                    </h3>
                    <table className="plans-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-card)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>카테고리</th>
                          <th style={{ padding: '8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>목표 예산</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeExpenseCategories.map((c: CategoryOption) => {
                          const plan = plans.find((p) => p.category === c.id && p.type === 'expense');
                          const value = plan ? plan.plannedAmount : 0;
                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                              <td style={{ padding: '10px 0', fontWeight: 700 }}>
                                <CategoryBadge categories={allExpenseCategories} idOrLabel={c.id} />
                              </td>
                              <td style={{ padding: '10px 0', textAlign: 'right' }}>
                                <PlanAmountInput
                                  value={value}
                                  onChange={(amt) => {
                                    setPlans((prev) =>
                                      prev.map((p) => (p.category === c.id && p.type === 'expense' ? { ...p, plannedAmount: amt } : p))
                                    );
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 수입 계획 */}
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '12px', color: 'var(--color-income)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔵</span> 수입 목표 계획
                    </h3>
                    <table className="plans-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-card)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>카테고리</th>
                          <th style={{ padding: '8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>목표 금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeIncomeCategories.map((c: CategoryOption) => {
                          const plan = plans.find((p) => p.category === c.id && p.type === 'income');
                          const value = plan ? plan.plannedAmount : 0;
                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                              <td style={{ padding: '10px 0', fontWeight: 700 }}>
                                <CategoryBadge categories={allIncomeCategories} idOrLabel={c.id} />
                              </td>
                              <td style={{ padding: '10px 0', textAlign: 'right' }}>
                                <PlanAmountInput
                                  value={value}
                                  onChange={(amt) => {
                                    setPlans((prev) =>
                                      prev.map((p) => (p.category === c.id && p.type === 'income' ? { ...p, plannedAmount: amt } : p))
                                    );
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="plan-total-bar">
                  <div className="plan-total-item plan-total-expense">
                    <span>지출 예산 합계</span>
                    <strong>{displayCurrency(plannedExpenseTotal)}</strong>
                  </div>
                  <div className="plan-total-item plan-total-income">
                    <span>수입 목표 합계</span>
                    <strong>{displayCurrency(plannedIncomeTotal)}</strong>
                  </div>
                  <div className={`plan-total-item ${plannedNetTotal >= 0 ? 'plan-total-income' : 'plan-total-expense'}`}>
                    <span>계획 차액</span>
                    <strong>{displayCurrency(plannedNetTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* 계획 카테고리 설정 카드 (이식 완료) */}
              <div style={{ height: '80px' }} />
            </>
          )}

        {activeTab === 'settings' && (
          <section className="settings-hub settings-hub-category">
            <div className="settings-head">
              <h2>설정</h2>
              <div className="settings-segment" role="tablist" aria-label="설정 메뉴">
                <button type="button" className={settingsSection === 'app' ? 'active' : ''} onClick={() => setSettingsSection('app')}>환경</button>
                <button type="button" className={settingsSection === 'category' ? 'active' : ''} onClick={() => setSettingsSection('category')}>카테고리</button>
                <button type="button" className={settingsSection === 'asset' ? 'active' : ''} onClick={() => setSettingsSection('asset')}>자산관리</button>
                <button type="button" className={settingsSection === 'recurring' ? 'active' : ''} onClick={() => setSettingsSection('recurring')}>정기기록</button>
                <button type="button" className={settingsSection === 'data' ? 'active' : ''} onClick={() => setSettingsSection('data')}>데이터</button>
              </div>
            </div>

            {settingsSection === 'app' && (
              <div className="settings-stack">
                <div className="settings-row theme-settings-row">
                  <strong>화면 테마</strong>
                  <div className="theme-toggle" role="group" aria-label="화면 테마">
                    <button type="button" className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')}>
                      시스템 설정
                    </button>
                    <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                      라이트
                    </button>
                    <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                      다크
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settingsSection === 'asset' && (
              <div className="settings-stack settings-asset-stack">
                <div className="managed-category-grid settings-managed-category-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', marginTop: '0px' }}>
                  {/* 삭제/보관된 자산 복원 히스토리 */}
                  <article className="glass-panel managed-category-card managed-category-card-asset" style={{ width: '100%', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AppIcon name="asset" size={19} /> 삭제/보관된 자산 히스토리
                      </span>
                      <span className="category-header-actions">
                        <b>{hiddenAssetsList.length}개 보관 중</b>
                      </span>
                    </h3>

                    {hiddenAssetsList.length === 0 ? (
                      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px dashed var(--border-card)' }}>
                        삭제되거나 보관된 자산이 없습니다.<br />
                        <span style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px', display: 'inline-block' }}>자산 탭에서 자산을 삭제하면 과거 거래 내역을 안전하게 보존한 채 이곳에 보관되며 언제든 다시 복원할 수 있습니다.</span>
                      </div>
                    ) : (
                      <div className="category-table" style={{ padding: '0', display: 'grid', gap: '8px' }}>
                        {hiddenAssetsList.map((asset) => {
                          const linkedCount = transactions.filter((t) => t.assetId === asset.id || t.toAssetId === asset.id).length;
                          const currentBalance = getNetAssetBalance(asset);
                          const isLiability = isLiabilityAsset(asset, allAssetCategories, categoryLabels) || currentBalance < 0;

                          return (
                            <div
                              key={`archived-asset-${asset.id}`}
                              className="category-row settings-asset-row is-hidden-asset"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                border: '1px dashed var(--border-card)',
                                borderRadius: '10px',
                                background: 'color-mix(in srgb, var(--bg-card) 65%, var(--bg-input))',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                <CategoryBadge categories={allAssetCategories} idOrLabel={asset.category} />
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                  <strong style={{ fontSize: '0.94rem', color: 'var(--text-primary)', textDecoration: 'line-through', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {formatAssetLabel(asset, allAssetCategories)}
                                  </strong>
                                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                    과거 거래 {linkedCount}건 기록됨
                                  </span>
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isLiability ? 'var(--color-expense)' : 'var(--text-primary)', marginLeft: 'auto', marginRight: '10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                  {displayCurrency(currentBalance)}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
                                <button
                                  type="button"
                                  className="primary-button"
                                  style={{ padding: '6px 14px', fontSize: '0.8rem', marginTop: 0, minHeight: '32px' }}
                                  onClick={() => handleToggleHideAsset(asset.id, false)}
                                >
                                  복원
                                </button>

                                {linkedCount === 0 && (
                                  <button
                                    type="button"
                                    className="row-action-button row-action-delete"
                                    aria-label="영구 삭제"
                                    style={{ width: '30px', height: '30px', fontSize: '0.95rem' }}
                                    title="연결된 거래가 없어 영구 삭제할 수 있습니다."
                                    onClick={() => handlePermanentDeleteAsset(asset.id)}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>

                  {/* 등록된 자산 카테고리 (자산/대출 그룹) */}
                  <article className="glass-panel managed-category-card managed-category-card-asset" data-category-scope="asset" style={{ width: '100%', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AppIcon name="settings" size={19} /> 등록된 자산 카테고리
                      </span>
                      
                      <span className="category-header-actions">
                        <b>{activeAssetCategories.length}개</b>
                        <button
                          type="button"
                          className="category-header-add-button"
                          onClick={() => {
                            setCategoryModalType('asset');
                            setCategoryModalAssetKind('asset');
                            setSelectedCategoryColor('#0284c7');
                            setIsCategoryModalOpen(true);
                          }}
                        >
                          <AppIcon name="plus" size={15} /> 등록
                        </button>
                      </span>
                    </h3>
                    <div className="asset-category-groups">
                      {assetCategoryGroups.map((group) => (
                        <section
                          key={group.kind}
                          className="asset-category-group"
                          data-asset-category-kind={group.kind}
                        >
                          <div className="asset-category-group-head">
                            <strong>{group.label}</strong>
                            <span>{group.categories.length}개</span>
                          </div>
                          <div className="category-table" style={{ padding: '0', display: 'grid', gap: '6px' }}>
                          {group.categories.map((category) => {
                            const color = category.color || '#64748b';
                            const paletteKey = getCategoryColorKey('asset', category.id);
                            const isOpen = openPaletteKey === paletteKey;
                            const isRenaming = editingCategory?.type === 'asset' && editingCategory.id === category.id;

                            return (
                              <CategoryActionRow
                                key={`asset-${category.id}`}
                                categoryId={category.id}
                                scope="asset"
                                isEditing={isRenaming}
                                onSortStart={() => beginCategorySort('asset', category.id)}
                                onSortPreview={(targetId, targetGroup) => previewCategorySort('asset', category.id, targetId, targetGroup)}
                                onSortCommit={commitCategorySort}
                                onSortCancel={cancelCategorySort}
                              >
                              <div
                                data-category-id={category.id}
                                data-category-scope="asset"
                                data-asset-category-kind={group.kind}
                                className={`category-row ${dragCategory?.type === 'asset' && dragCategory.id === category.id ? 'category-handle-drag-source' : ''}`}
                                style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', transition: 'all 0.15s ease' }}
                              >
                                <span className="category-drag-handle sortable-drag-handle">⠿</span>
                                <div className="category-color-menu" style={{ position: 'relative', marginRight: '12px' }}>
                                  <button
                                    type="button"
                                    className="category-color-swatch"
                                    style={{ background: color, width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer' }}
                                    onClick={() => {
                                      setPaletteDraftColor(color);
                                      setOpenPaletteKey((prev) => (prev === paletteKey ? null : paletteKey));
                                    }}
                                    aria-label={`${category.label} 색상`}
                                  />
                                  {isOpen && (
                                    <div className="category-palette-popover" style={{ position: 'absolute', top: '24px', left: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: '220px' }}>
                                      <div className="category-preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                        {categoryColorPresets.map((preset) => (
                                          <button
                                            key={preset}
                                            type="button"
                                            className={preset.toLowerCase() === paletteDraftColor.toLowerCase() ? 'active' : ''}
                                            style={{ background: preset, width: '24px', height: '24px', borderRadius: '4px', border: preset.toLowerCase() === paletteDraftColor.toLowerCase() ? '2px solid var(--text-primary)' : 'none', cursor: 'pointer' }}
                                            onClick={() => setPaletteDraftColor(preset)}
                                          />
                                        ))}
                                      </div>
                                      <label className="category-custom-color" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '4px', background: paletteDraftColor }} />
                                        <input
                                          type="color"
                                          value={paletteDraftColor}
                                          onChange={(event) => setPaletteDraftColor(event.target.value)}
                                          style={{ display: 'none' }}
                                        />
                                        <strong style={{ fontSize: '0.85rem', cursor: 'pointer' }}>커스텀 색상 선택</strong>
                                      </label>
                                      <div className="category-palette-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: 0 }} onClick={() => setOpenPaletteKey(null)}>취소</button>
                                        <button
                                          type="button"
                                          className="primary-button"
                                          style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: 0 }}
                                          onClick={() => {
                                            handleCategoryColorChange('asset', category.id, paletteDraftColor);
                                            setOpenPaletteKey(null);
                                          }}
                                        >
                                          확인
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="category-row-main" style={{ flex: 1 }}>
                                  {isRenaming ? (
                                    <form
                                      className="category-name-edit"
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        handleSaveCategoryRename('asset', category.id);
                                      }}
                                    >
                                      <input
                                        value={categoryNameDraft}
                                        onChange={(event) => setCategoryNameDraft(event.target.value)}
                                        autoFocus
                                      />
                                      <select
                                        value={categoryAssetKindDraft}
                                        onChange={(event) => setCategoryAssetKindDraft(event.target.value as 'asset' | 'liability')}
                                      >
                                        <option value="asset">자산 그룹</option>
                                        <option value="liability">대출 그룹</option>
                                      </select>
                                      <button type="submit" className="category-row-action category-row-action-save">저장</button>
                                      <button type="button" className="category-row-action category-row-action-muted" onClick={handleCancelCategoryRename}>취소</button>
                                    </form>
                                  ) : (
                                    <CategoryBadge categories={activeAssetCategories} idOrLabel={category.id} />
                                  )}
                                </div>
                                {!isRenaming && (
                                  <button
                                    type="button"
                                    className="row-action-button row-action-edit"
                                    aria-label="수정"
                                    onClick={() => handleStartCategoryRename('asset', category)}
                                  >
                                    <AppIcon name="edit" size={18} />
                                  </button>
                                )}
                                {!isRenaming && (
                                  <button
                                    type="button"
                                    className="row-action-button row-action-delete"
                                    aria-label="삭제"
                                    onClick={() => handleArchiveCategory('asset', category.id, category.label)}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              </CategoryActionRow>
                            );
                          })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                </div>
              </div>
            )}

            {settingsSection === 'category' && (
              <div className="settings-stack settings-category-stack">
                <div className="managed-category-grid settings-managed-category-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', marginTop: '0px' }}>
                  
                  {/* 지출 카테고리 목록 */}
                  <article className="glass-panel managed-category-card managed-category-card-plan" data-category-scope="expense" style={{ padding: '16px', marginBottom: '0px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AppIcon name="settings" size={19} /> 지출 카테고리 목록
                      </span>
                      
                        <span className="category-header-actions">
                          <b>{activeExpenseCategories.length}개</b>
                          <button
                            type="button"
                            className="category-header-add-button"
                            onClick={() => {
                              setCategoryModalType('expense');
                              setSelectedCategoryColor('#ef4444');
                              setIsCategoryModalOpen(true);
                            }}
                          >
                            <AppIcon name="plus" size={15} /> 등록
                          </button>
                        </span>
                    </h3>
                    <div className="category-table" style={{ padding: '0', display: 'grid', gap: '6px' }}>
                      {activeExpenseCategories.map((category) => {
                        const color = category.color || '#64748b';
                        const paletteKey = getCategoryColorKey('expense', category.id);
                        const isOpen = openPaletteKey === paletteKey;
                        const isRenaming = editingCategory?.type === 'expense' && editingCategory.id === category.id;
                        const isBudgetExcluded = Boolean(categoryBudgetExcluded[paletteKey]);

                        return (
                          <CategoryActionRow
                            key={`expense-${category.id}`}
                            categoryId={category.id}
                            scope="expense"
                            isEditing={isRenaming}
                            onSortStart={() => beginCategorySort('expense', category.id)}
                            onSortPreview={(targetId) => previewCategorySort('expense', category.id, targetId)}
                            onSortCommit={commitCategorySort}
                            onSortCancel={cancelCategorySort}
                          >
                          <div
                            data-category-id={category.id}
                            data-category-scope="expense"
                            className={`category-row ${dragCategory?.type === 'expense' && dragCategory.id === category.id ? 'category-handle-drag-source' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', transition: 'all 0.15s ease' }}
                          >
                            <span className="category-drag-handle sortable-drag-handle">⠿</span>
                            <div className="category-color-menu" style={{ position: 'relative', marginRight: '12px' }}>
                              <button
                                type="button"
                                className="category-color-swatch"
                                style={{ background: color, width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer' }}
                                onClick={() => {
                                  setPaletteDraftColor(color);
                                  setOpenPaletteKey((prev) => (prev === paletteKey ? null : paletteKey));
                                }}
                                aria-label={`${category.label} 색상`}
                              />
                              {isOpen && (
                                <div className="category-palette-popover" style={{ position: 'absolute', top: '24px', left: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: '220px' }}>
                                  <div className="category-preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                    {categoryColorPresets.map((preset) => (
                                      <button
                                        key={preset}
                                        type="button"
                                        className={preset.toLowerCase() === paletteDraftColor.toLowerCase() ? 'active' : ''}
                                        style={{ background: preset, width: '24px', height: '24px', borderRadius: '4px', border: preset.toLowerCase() === paletteDraftColor.toLowerCase() ? '2px solid var(--text-primary)' : 'none', cursor: 'pointer' }}
                                        onClick={() => setPaletteDraftColor(preset)}
                                      />
                                    ))}
                                  </div>
                                  <label className="category-custom-color" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '4px', background: paletteDraftColor }} />
                                    <input
                                      type="color"
                                      value={paletteDraftColor}
                                      onChange={(event) => setPaletteDraftColor(event.target.value)}
                                      style={{ display: 'none' }}
                                    />
                                    <strong style={{ fontSize: '0.85rem', cursor: 'pointer' }}>커스텀 색상 선택</strong>
                                  </label>
                                  <div className="category-palette-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: 0 }} onClick={() => setOpenPaletteKey(null)}>취소</button>
                                    <button
                                      type="button"
                                      className="primary-button"
                                      style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: 0 }}
                                      onClick={() => {
                                        handleCategoryColorChange('expense', category.id, paletteDraftColor);
                                        setOpenPaletteKey(null);
                                      }}
                                    >
                                      확인
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="category-row-main" style={{ flex: 1 }}>
                              {isRenaming ? (
                                <form
                                  className="category-name-edit"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    handleSaveCategoryRename('expense', category.id);
                                  }}
                                >
                                  <input
                                    value={categoryNameDraft}
                                    onChange={(event) => setCategoryNameDraft(event.target.value)}
                                    autoFocus
                                  />
                                  <button type="submit" className="category-row-action category-row-action-save">저장</button>
                                  <button type="button" className="category-row-action category-row-action-muted" onClick={handleCancelCategoryRename}>취소</button>
                                </form>
                              ) : (
                                <CategoryBadge categories={activeExpenseCategories} idOrLabel={category.id} />
                              )}
                            </div>
                            {!isRenaming && (
                              <>
                                <label className="category-budget-toggle">
                                  <input
                                    type="checkbox"
                                    checked={isBudgetExcluded}
                                    onChange={(event) => {
                                      const checked = event.target.checked;
                                      setCategoryBudgetExcluded((prev) => {
                                        const next = { ...prev };
                                        if (checked) {
                                          next[paletteKey] = true;
                                        } else {
                                          delete next[paletteKey];
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                  <span aria-hidden="true" />
                                  <b>예산</b>
                                </label>
                                <button
                                  type="button"
                                className="row-action-button row-action-edit"
                                aria-label="수정"
                                onClick={() => handleStartCategoryRename('expense', category)}
                              >
                                <AppIcon name="edit" size={18} />
                                </button>
                              </>
                            )}
                            {!isRenaming && (
                              <button
                                type="button"
                                className="row-action-button row-action-delete"
                                aria-label="삭제"
                                onClick={() => handleArchiveCategory('expense', category.id, category.label)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                          </CategoryActionRow>
                        );
                      })}
                    </div>
                  </article>

                  {/* 수입 카테고리 목록 */}
                  <article className="glass-panel managed-category-card managed-category-card-plan" data-category-scope="income" style={{ padding: '16px', marginBottom: '0px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AppIcon name="settings" size={19} /> 수입 카테고리 목록
                      </span>
                      
                        <span className="category-header-actions">
                          <b>{activeIncomeCategories.length}개</b>
                          <button
                            type="button"
                            className="category-header-add-button"
                            onClick={() => {
                              setCategoryModalType('income');
                              setSelectedCategoryColor('#059669');
                              setIsCategoryModalOpen(true);
                            }}
                          >
                            <AppIcon name="plus" size={15} /> 등록
                          </button>
                        </span>
                    </h3>
                    <div className="category-table" style={{ padding: '0', display: 'grid', gap: '6px' }}>
                      {activeIncomeCategories.map((category) => {
                        const color = category.color || '#64748b';
                        const paletteKey = getCategoryColorKey('income', category.id);
                        const isOpen = openPaletteKey === paletteKey;
                        const isRenaming = editingCategory?.type === 'income' && editingCategory.id === category.id;

                        return (
                          <CategoryActionRow
                            key={`income-${category.id}`}
                            categoryId={category.id}
                            scope="income"
                            isEditing={isRenaming}
                            onSortStart={() => beginCategorySort('income', category.id)}
                            onSortPreview={(targetId) => previewCategorySort('income', category.id, targetId)}
                            onSortCommit={commitCategorySort}
                            onSortCancel={cancelCategorySort}
                          >
                          <div
                            data-category-id={category.id}
                            data-category-scope="income"
                            className={`category-row ${dragCategory?.type === 'income' && dragCategory.id === category.id ? 'category-handle-drag-source' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', transition: 'all 0.15s ease' }}
                          >
                            <span className="category-drag-handle sortable-drag-handle">⠿</span>
                            <div className="category-color-menu" style={{ position: 'relative', marginRight: '12px' }}>
                              <button
                                type="button"
                                className="category-color-swatch"
                                style={{ background: color, width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer' }}
                                onClick={() => {
                                  setPaletteDraftColor(color);
                                  setOpenPaletteKey((prev) => (prev === paletteKey ? null : paletteKey));
                                }}
                                aria-label={`${category.label} 색상`}
                              />
                              {isOpen && (
                                <div className="category-palette-popover" style={{ position: 'absolute', top: '24px', left: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: '220px' }}>
                                  <div className="category-preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                    {categoryColorPresets.map((preset) => (
                                      <button
                                        key={preset}
                                        type="button"
                                        className={preset.toLowerCase() === paletteDraftColor.toLowerCase() ? 'active' : ''}
                                        style={{ background: preset, width: '24px', height: '24px', borderRadius: '4px', border: preset.toLowerCase() === paletteDraftColor.toLowerCase() ? '2px solid var(--text-primary)' : 'none', cursor: 'pointer' }}
                                        onClick={() => setPaletteDraftColor(preset)}
                                      />
                                    ))}
                                  </div>
                                  <label className="category-custom-color" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '4px', background: paletteDraftColor }} />
                                    <input
                                      type="color"
                                      value={paletteDraftColor}
                                      onChange={(event) => setPaletteDraftColor(event.target.value)}
                                      style={{ display: 'none' }}
                                    />
                                    <strong style={{ fontSize: '0.85rem', cursor: 'pointer' }}>커스텀 색상 선택</strong>
                                  </label>
                                  <div className="category-palette-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: 0 }} onClick={() => setOpenPaletteKey(null)}>취소</button>
                                    <button
                                      type="button"
                                      className="primary-button"
                                      style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: 0 }}
                                      onClick={() => {
                                        handleCategoryColorChange('income', category.id, paletteDraftColor);
                                        setOpenPaletteKey(null);
                                      }}
                                    >
                                      확인
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="category-row-main" style={{ flex: 1 }}>
                              {isRenaming ? (
                                <form
                                  className="category-name-edit"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    handleSaveCategoryRename('income', category.id);
                                  }}
                                >
                                  <input
                                    value={categoryNameDraft}
                                    onChange={(event) => setCategoryNameDraft(event.target.value)}
                                    autoFocus
                                  />
                                  <button type="submit" className="category-row-action category-row-action-save">저장</button>
                                  <button type="button" className="category-row-action category-row-action-muted" onClick={handleCancelCategoryRename}>취소</button>
                                </form>
                              ) : (
                                <CategoryBadge categories={activeIncomeCategories} idOrLabel={category.id} />
                              )}
                            </div>
                            {!isRenaming && (
                              <button
                                type="button"
                                className="row-action-button row-action-edit"
                                aria-label="수정"
                                onClick={() => handleStartCategoryRename('income', category)}
                              >
                                <AppIcon name="edit" size={18} />
                              </button>
                            )}
                            {!isRenaming && (
                              <button
                                type="button"
                                className="row-action-button row-action-delete"
                                aria-label="삭제"
                                onClick={() => handleArchiveCategory('income', category.id, category.label)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                          </CategoryActionRow>
                        );
                      })}
                    </div>
                  </article>
              </div>

              {/* 하단바 가림 방지 공백 */}
              </div>
            )}

            {settingsSection === 'recurring' && (
              <div className="settings-stack settings-recurring-stack">
          <section className="settings-recurring-panel">
            <div className="recurring-section-header">
              <div>
                <h3>정기기록</h3>
                <p>등록된 규칙 {recurringRules.length}개</p>
              </div>
              <div className="recurring-type-legend" aria-label="정기기록 구분">
                <span className="expense"><i aria-hidden="true" />지출</span>
                <span className="income"><i aria-hidden="true" />수입</span>
                <span className="transfer"><i aria-hidden="true" />이체</span>
              </div>
            </div>

            {recurringRules.length === 0 ? (
              <div className="recurring-rules-empty">
                등록된 정기기록이 없습니다. 거래 등록에서 ‘매달 정기 기록으로 등록’을 선택해 추가할 수 있습니다.
              </div>
            ) : (
              <div className="recurring-rule-list">
                {recurringRules.map((rule) => {
                  const isStopped = !!rule.endMonth;
                  const typeClass = rule.type === 'expense' ? 'expense' : rule.type === 'income' ? 'income' : 'transfer';
                  const catList = rule.type === 'expense' ? allExpenseCategories : allIncomeCategories;
                  const fromAsset = assets.find((asset) => asset.id === rule.assetId);
                  const toAsset = assets.find((asset) => asset.id === rule.toAssetId);
                  const formatRuleDate = (month: string) => `${month.replace('-', '.')}.${String(rule.day).padStart(2, '0')}.`;
                  const statusLabel = isStopped
                    ? `${formatRuleDate(rule.startMonth)} ~ ${formatRuleDate(rule.endMonth!)}`
                    : `${formatRuleDate(rule.startMonth)}${rule.time ? ` ${rule.time}` : ''}부터 기록 중`;

                  return (
                    <article key={rule.id} className={`recurring-rule-card ${typeClass}${isStopped ? ' is-stopped' : ''}`}>
                      <span className="recurring-rule-type-dot" aria-hidden="true" />
                      <div className="recurring-rule-copy">
                        <div className="recurring-rule-title">
                          <h4>{rule.title}</h4>
                        </div>
                        <span className={`recurring-rule-status${isStopped ? ' is-stopped' : ''}`}>{statusLabel}</span>
                        <div className="recurring-rule-side">
                          <div className="recurring-rule-finance">
                            {rule.type === 'transfer' ? (
                              <span>{fromAsset ? formatAssetLabel(fromAsset, allAssetCategories) : '보내는 계좌'} → {toAsset ? formatAssetLabel(toAsset, allAssetCategories) : '받는 계좌'}</span>
                            ) : (
                              <CategoryBadge categories={catList} idOrLabel={rule.category} />
                          )}
                            <strong>{displayCurrency(rule.amount)}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="recurring-rule-actions">
                        {!isStopped ? (
                          <button type="button" className="recurring-rule-action recurring-rule-action-stop" onClick={() => handleStopRecurringRule(rule.id)}>
                            끊기
                          </button>
                        ) : (
                          <button type="button" className="recurring-rule-action recurring-rule-action-delete" onClick={() => handleDeleteRecurringRule(rule.id)} title="이 정기기록 규칙만 목록에서 삭제합니다. 이미 기록된 거래는 유지됩니다.">
                            삭제
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
              </div>
            )}

            {settingsSection === 'data' && (
              <div className="settings-stack settings-data-stack">
                <button type="button" className={`settings-sync-button ${remoteSync.status}`} onClick={() => void verifyRemoteSync(true)}>
                  <span className="settings-sync-dot" aria-hidden="true" />
                  <span className="settings-sync-copy">
                    <strong>{remoteSync.message}</strong>
                    <small>가장 최근 저장 {formatSyncTime(remoteSync.remoteUpdatedAt || remoteSync.localUpdatedAt || updatedAt)}</small>
                  </span>
                  <span className="settings-sync-action">서버 확인</span>
                </button>
                <div className="settings-data-grid">
                  <article className="settings-data-card settings-csv-card">
                    <div>
                      <span>CSV DATA</span>
                      <strong>CSV 백업 및 복원</strong>
                    </div>
                    <div className="settings-card-actions">
                      <button type="button" className="primary-button" onClick={exportFullCSV}>백업</button>
                      <label className="primary-button">
                        복원
                        <input type="file" accept=".csv" onChange={handleImportFullCSV} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </article>
                  <article className="settings-data-card settings-csv-card">
                    <div><span>EASY MONEY</span><strong>편한가계부 CSV 이관</strong></div>
                    <div className="settings-card-actions"><label className="primary-button">CSV 이관<input type="file" accept=".csv" onChange={handleImportEasyMoneyCSV} style={{ display: 'none' }} /></label></div>
                  </article>
                </div>
                <div className="settings-row">
                  <strong>안전한 전체 백업</strong>
                  <span>위 CSV DATA에서 백업과 복원을 진행하세요.</span>
                </div>
              </div>
            )}
          </section>
        )}
      </section>



      {/* Date Detail View Modal (Calendar Cell Clicked) */}
      {selectedDayData && (
        <div className="modal-backdrop" onClick={() => setSelectedDayData(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDayData} 거래 관리</h3>
              <button type="button" className="close-btn" onClick={() => setSelectedDayData(null)}>
                &times;
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>지출 및 수입 내역</h4>
                {transactions.filter((t) => t.date === selectedDayData).length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 0' }}>
                    해당 날짜에 등록된 거래 내역이 없습니다.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '12px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                    {transactions
                      .filter((t) => t.date === selectedDayData)
                      .map((t) => {
                        const isIncome = t.type === 'income';
                        const isFuture = t.date > getToday();
                        return (
                          <div
                            key={t.id}
                            className="calendar-detail-card"
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              padding: '16px',
                              borderRadius: '12px',
                              border: '1px solid var(--border-card)',
                              background: isIncome ? 'rgba(59, 130, 246, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                              position: 'relative',
                              opacity: isFuture ? 0.65 : 1,
                              transition: 'opacity 0.2s'
                            }}
                          >
                            {/* 상단: 유형 태그 배지 & 작업 단추 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 'bold',
                                  background: isIncome ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                  color: isIncome ? 'var(--color-income)' : 'var(--color-expense)'
                                }}
                              >
                                {isIncome ? '🔵 수입' : '🔴 지출'}
                              </span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  type="button"
                                  className="edit-btn"
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px' }}
                                  onClick={() => openAmountEntry(() => {
                                    setEditingTransaction(t);
                                    setSelectedDayData(null);
                                  })}
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className="delete-btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px' }}
                                  onClick={() => handleDeleteTransaction(t.id)}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>

                            {/* 중단: 타이틀 내용 & 카테고리 배지 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <strong style={{ fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                                {t.title}
                                {t.recurringRuleId && (
                                  <span
                                    title="정기 반복 결제"
                                    style={{ marginLeft: '4px', color: 'var(--primary)', fontSize: '0.9rem', cursor: 'help' }}
                                  >
                                    🔄
                                  </span>
                                )}
                              </strong>
                              <CategoryBadge categories={isIncome ? allIncomeCategories : allExpenseCategories} idOrLabel={t.category} />
                            </div>

                            {/* 하단: 금액 표시 */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-card)', paddingTop: '8px', marginTop: '2px' }}>
                              <span style={{ fontSize: '1.15rem', fontWeight: '800', color: isIncome ? 'var(--color-income)' : 'var(--color-expense)' }}>
                                {isIncome ? '+' : '-'}{displayCurrency(t.amount)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="modal-backdrop" onClick={() => setEditingTransaction(null)}>
          <div className="modal-content transaction-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>거래 내역 수정</h3>
            </div>
            <div className="modal-body">
              <TransactionEditForm
                key={editingTransaction.id}
                transaction={editingTransaction}
                onSave={(updated) => handleUpdateTransaction(editingTransaction.id, updated)}
                onSaveInstallment={handleUpdateInstallment}
                installmentTransactions={editingTransaction.installmentGroupId
                  ? transactions.filter((transaction) => transaction.installmentGroupId === editingTransaction.installmentGroupId)
                  : []}
                onCancel={() => setEditingTransaction(null)}
                onAddRecurringRule={handleAddRecurringRule}
                onUpdateRecurringRule={handleUpdateRecurringRule}
                recurringRules={recurringRules}
                expenseCategories={activeExpenseCategories}
                incomeCategories={activeIncomeCategories}
                assetCategories={allAssetCategories}
                assets={assets}
                onStopRecurring={handleStopRecurringFromTx}
                onNotify={showNotice}
              />
            </div>
          </div>
        </div>
      )}

      {/* 자산 개별 항목 등록/수정 모달 */}
      {selectedAsset && false && (
        <div className="modal-backdrop" onClick={() => setSelectedAsset(null)}>
          <div className="modal-content asset-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title-icon"><AppIcon name="asset" size={20} /> 자산 변동 내역</h3>
              <button type="button" className="close-btn" onClick={() => setSelectedAsset(null)}>×</button>
            </div>
            {(() => {
              const openingBalance = getAssetOpeningBalance(selectedAsset!);
              const currentBalance = getAssetBalance(selectedAsset!.id, openingBalance);
              const history = transactions
                .filter((transaction) => transaction.date <= todayStr && (transaction.assetId === selectedAsset!.id || transaction.toAssetId === selectedAsset!.id))
                .sort((a, b) => (b.date + ' ' + (b.time || '')).localeCompare(a.date + ' ' + (a.time || '')));
              return <div className="asset-history-body">
                <div className="asset-history-current">
                  <div><span>{'\uD604\uC7AC \uC790\uC0B0'}</span><strong>{displayCurrency(currentBalance)}</strong><small>{'\uAE30\uCD08\uAE08\uC561'} {displayCurrency(openingBalance)}</small></div>
                  <CategoryBadge categories={allAssetCategories} idOrLabel={selectedAsset!.category} />
                </div>
                <form className="asset-balance-adjust-form" onSubmit={(e) => {
                  e.preventDefault();
                  const nextBalance = Number(assetBalanceDraft);
                  const difference = nextBalance - currentBalance;
                  if (!Number.isFinite(nextBalance) || nextBalance < 0) { showNotice('0원 이상의 금액을 입력해 주세요.', '입력 확인', 'warning'); return; }
                  if (!difference) { setSelectedAsset(null); return; }
                  const direction = difference > 0 ? '수입(+)' : '지출(-)';
                  if (window.confirm('차액 ' + formatCurrency(Math.abs(difference)) + '을 ' + direction + ' 거래로 장부에 기록할까요?')) {
                    handleAssetBalanceAdjustment(selectedAsset!, nextBalance);
                    setSelectedAsset(null);
                  }
                }}>
                  <label htmlFor="asset-balance-draft">현재 잔액 수정</label>
                  <div><input id="asset-balance-draft" type="text" inputMode="numeric" value={assetBalanceDraft ? formatNumberInput(parseNumberInput(assetBalanceDraft)) : ''} onChange={(e) => setAssetBalanceDraft(e.target.value.replace(/[^\d]/g, ''))} /><button type="submit" className="primary-button">차액 기록</button></div>
                  <p>저장 전 차액을 수입 또는 지출 거래로 기록할지 확인합니다.</p>
                </form>
                <div className="asset-history-list">
                  <h4>변동 내역</h4>
                  {history.length === 0 ? <p className="empty-note">변동 내역이 없습니다.</p> : history.map((transaction) => {
                    const isIncoming = (transaction.type === 'income' && transaction.assetId === selectedAsset!.id) || transaction.toAssetId === selectedAsset!.id;
                    return <div className="asset-history-item" key={transaction.id}><div><strong>{transaction.category === OPENING_BALANCE_CATEGORY ? '기초 잔액' : (transaction.title || '거래')}</strong><span>{transaction.date}{transaction.time ? ' ' + transaction.time : ''}</span></div><b className={isIncoming ? 'income' : 'expense'}>{isIncoming ? '+' : '−'}{displayCurrency(transaction.amount)}</b></div>;
                  })}
                </div>
              </div>;
            })()}
          </div>
        </div>
      )}

      {isAssetModalOpen && !isEntryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAssetModalOpen(false)}>
          <div className="modal-content asset-entry-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title-icon"><AppIcon name="asset" size={20} /> 통합 자산/거래 등록</h3>
            </div>
            <div className="registration-mode-tabs" aria-label="등록 종류">
              <button type="button" className="active asset" onClick={() => setRegistrationMode('asset')}>자산</button>
              <button type="button" onClick={() => { setRegistrationMode('expense'); setIsAssetModalOpen(false); setIsEntryModalOpen(true); }}>지출</button>
              <button type="button" onClick={() => { setRegistrationMode('income'); setIsAssetModalOpen(false); setIsEntryModalOpen(true); }}>수입</button>
              <button type="button" onClick={() => { setRegistrationMode('transfer'); setIsAssetModalOpen(false); setIsEntryModalOpen(true); }}>이체</button>
            </div>
            <form 
              key={editingAsset ? editingAsset.id : 'new'}
              className="asset-entry-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const category = (e.currentTarget.elements.namedItem('asset-cat') as HTMLSelectElement).value;
                const name = (e.currentTarget.elements.namedItem('asset-name') as HTMLInputElement).value.trim();
                const amountRaw = (e.currentTarget.elements.namedItem('asset-amount') as HTMLInputElement).value;
                const memo = (e.currentTarget.elements.namedItem('asset-memo') as HTMLInputElement).value;
                
                const amount = parseAmount(amountRaw) || 0;
                if (!category) {
                  showNotice('자산 종류를 선택해 주세요.', '입력 확인', 'warning');
                  return;
                }
                if (!name) {
                  showNotice('자산 이름을 입력해 주세요.', '입력 확인', 'warning');
                  return;
                }
                if (!editingAsset && amount <= 0) {
                  showNotice('올바른 금액을 입력해 주세요.', '입력 확인', 'warning');
                  return;
                }

                const saved = editingAsset
                  ? await handleUpdateAsset({ id: editingAsset.id, category, name, amount: editingAsset.amount, memo })
                  : await handleAddAsset({ id: createId(), category, name, amount, memo });
                if (saved) setIsAssetModalOpen(false);
              }} 
            >
              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>자산 분류</label>
                <select 
                  name="asset-cat" 
                  required
                  defaultValue={editingAsset ? editingAsset.category : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <option value="">자산 카테고리</option>
                  {activeAssetCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>자산 이름</label>
                <input
                  type="text"
                  name="asset-name"
                  placeholder="자산 이름"
                  required
                  defaultValue={editingAsset ? formatAssetLabel(editingAsset, allAssetCategories) : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>금액 (원)</label>
                <input 
                  type="text"
                  name="asset-amount" 
                  inputMode="numeric"
                  placeholder="기초 금액"
                  required
                  defaultValue={editingAsset ? formatNumberInput(getAssetOpeningBalance(editingAsset)) : ''}
                  readOnly={Boolean(editingAsset)}
                  onChange={(event) => {
                    const digits = event.currentTarget.value.replace(/[^\d]/g, '');
                    event.currentTarget.value = digits ? formatNumberInput(Number(digits)) : '';
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: editingAsset ? 'var(--bg-muted)' : 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>메모</label>
                <input 
                  type="text" 
                  name="asset-memo" 
                  placeholder="메모 (선택)"
                  defaultValue={editingAsset ? editingAsset.memo : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
              </div>

              <div className="asset-entry-actions">
                <button 
                  type="button" 
                  className="secondary-button" 
                  onClick={() => setIsAssetModalOpen(false)}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className="primary-button" 
                >
                  {editingAsset ? '자산 수정' : '자산 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 카테고리 통합 등록 모달 */}
      {isCategoryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCategoryModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', overflow: 'visible', position: 'relative' }}>
            <div className="modal-header">
              <h3>{categoryModalType === 'asset' ? '자산 카테고리 추가' : categoryModalType === 'expense' ? '지출 카테고리 추가' : '수입 카테고리 추가'}</h3>
              <button type="button" className="close-btn" onClick={() => setIsCategoryModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const nameInput = e.currentTarget.elements.namedItem('cat-name') as HTMLInputElement;
              const catType = categoryModalType;
              const catName = nameInput.value.trim();

              if (!catName) {
                showNotice('카테고리명을 입력해 주세요.', '입력 확인', 'warning');
                return;
              }

              const targetList =
                catType === 'expense' ? activeExpenseCategories :
                catType === 'income' ? activeIncomeCategories :
                activeAssetCategories;

              if (targetList.some((c) => c.label === catName)) {
                showNotice('이미 존재하는 카테고리입니다.', '중복 카테고리', 'warning');
                return;
              }

              const generatedId = `cat_${Date.now()}`;
              const newCategory = {
                id: generatedId,
                label: catName,
                color: selectedCategoryColor,
                kind: catType === 'asset' ? categoryModalAssetKind : undefined,
              };

              if (catType === 'expense') {
                setCustomExpenseCategories(prev => [...prev, newCategory]);
                setPlans(prev => [...prev, { category: generatedId, type: 'expense', plannedAmount: 0 }]);
              } else if (catType === 'income') {
                setCustomIncomeCategories(prev => [...prev, newCategory]);
                setPlans(prev => [...prev, { category: generatedId, type: 'income', plannedAmount: 0 }]);
              } else {
                setCustomAssetCategories(prev => [...prev, newCategory]);
              }

              nameInput.value = '';
              setIsCategoryModalOpen(false);
              showNotice(`'${catName}' 카테고리가 추가되었습니다.`, '카테고리 추가', 'success');
            }} style={{ display: 'grid', gap: '20px', padding: '24px 28px' }}>
              
              {categoryModalType === 'asset' && (
                <div className="form-group">
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>자산 카테고리 그룹</label>
                  <select
                    value={categoryModalAssetKind}
                    onChange={(e) => setCategoryModalAssetKind(e.target.value as 'asset' | 'liability')}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                  >
                    <option value="asset">자산 그룹</option>
                    <option value="liability">대출 그룹</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>카테고리 이름</label>
                <input 
                  type="text" 
                  name="cat-name" 
                  placeholder="예: 반려동물, 해외주식, 당근마켓"
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>카테고리 고유 색상</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' }}>
                  {['#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'].map((color) => {
                    const isSelected = selectedCategoryColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          background: color,
                          border: isSelected ? '3px solid var(--text-primary)' : '1px solid rgba(0, 0, 0, 0.1)',
                          cursor: 'pointer',
                          padding: 0,
                          transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 4px 6px rgba(0,0,0,0.15)' : 'none'
                        }}
                        onClick={() => setSelectedCategoryColor(color)}
                      />
                    );
                  })}

                  {/* 자율자재 선택 가능한 팔레트 칩 (창작 피커 트리거!) */}
                  {(() => {
                    const presetColors = ['#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'];
                    const isCustom = !presetColors.includes(selectedCategoryColor.toLowerCase());
                    
                    return (
                      <div style={{ position: 'relative', display: 'inline-block', margin: 0, lineHeight: 1 }}>
                        <button
                          type="button"
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: isCustom ? selectedCategoryColor : 'linear-gradient(45deg, red, orange, yellow, green, blue, purple)',
                            border: isCustom ? '3px solid var(--text-primary)' : '1px solid rgba(0, 0, 0, 0.1)',
                            cursor: 'pointer',
                            padding: 0,
                            transform: isCustom ? 'scale(1.12)' : 'scale(1)',
                            transition: 'all 0.15s ease',
                            boxShadow: isCustom ? '0 4px 6px rgba(0,0,0,0.15)' : 'none'
                          }}
                          onClick={() => {
                            const hsl = hexToHsl(selectedCategoryColor);
                            setPickerHue(hsl.h);
                            setPickerSat(hsl.s);
                            setPickerLight(hsl.l);
                            setCustomPaletteOpen((prev) => !prev);
                          }}
                          title="커스텀 색상 선택"
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  className="secondary-button" 
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className="primary-button" 
                  style={{ flex: 2, marginTop: 0 }}
                >
                  <AppIcon name="plus" size={17} /> 추가하기
                </button>
              </div>
            </form>

            {/* 자율자재 색상 선택 독립 서브 모달 (중앙 배치) */}
            {customPaletteOpen && (() => {
              const currentCustomHex = hslToHex(pickerHue, pickerSat, pickerLight);
              return (
                <div 
                  className="modal-backdrop" 
                  style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                  onClick={() => setCustomPaletteOpen(false)}
                >
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    style={{ 
                      width: '340px', 
                      height: 'auto', 
                      maxHeight: 'min(78dvh, 480px)',
                      padding: '20px', 
                      boxSizing: 'border-box',
                      zIndex: 1110,
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: '16px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-card)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.3)'
                    }}
                  >
                    <h4 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 'bold' }}>🎨 자율자재 색상 선택</h4>
                    
                    {/* 색조 슬라이더 그룹 */}
                    <div style={{ display: 'grid', gap: '6px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <span>색조 (Hue)</span>
                        <span>{pickerHue}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="360" 
                        value={pickerHue} 
                        onChange={(e) => setPickerHue(Number(e.target.value))}
                        style={{
                          width: '100%',
                          height: '8px',
                          borderRadius: '4px',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                          cursor: 'pointer',
                          margin: 0
                        }}
                      />
                    </div>

                    {/* 명도 슬라이더 그룹 */}
                    <div style={{ display: 'grid', gap: '6px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <span>명도 (Lightness)</span>
                        <span>{pickerLight}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="15" 
                        max="85" 
                        value={pickerLight} 
                        onChange={(e) => setPickerLight(Number(e.target.value))}
                        style={{
                          width: '100%',
                          height: '8px',
                          borderRadius: '4px',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          background: `linear-gradient(to right, #111, hsl(${pickerHue}, 100%, 50%), #eee)`,
                          cursor: 'pointer',
                          margin: 0
                        }}
                      />
                    </div>

                    {/* 미리보기 및 HEX 값 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-balance-light)', padding: '8px 16px', borderRadius: '8px', height: '44px', boxSizing: 'border-box', marginBottom: '16px' }}>
                      <span style={{ display: 'block', width: '28px', height: '28px', borderRadius: '50%', background: currentCustomHex, border: '1px solid var(--border-card)' }} />
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase' }}>{currentCustomHex}</strong>
                    </div>

                    {/* 확인/취소 단추 (정규 스타일 적용) */}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-card)', paddingTop: '16px' }}>
                      <button 
                        type="button" 
                        className="secondary-button" 
                        style={{ flex: '1 1 0px', width: '100%', height: '42px', marginTop: 0 }} 
                        onClick={() => setCustomPaletteOpen(false)}
                      >
                        취소
                      </button>
                      <button 
                        type="button" 
                        className="primary-button" 
                        style={{ flex: '1 1 0px', width: '100%', height: '42px', marginTop: 0 }}
                        onClick={() => {
                          setSelectedCategoryColor(currentCustomHex);
                          setCustomPaletteOpen(false);
                        }}
                      >
                        확인
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 통합 자산/거래 등록 모달 */}
      {isEntryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsEntryModalOpen(false)}>
          <div className={`modal-content entry-modal${registrationMode === 'asset' ? ' asset-entry-modal' : ''}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title-icon"><AppIcon name="plus" size={20} /> 통합 자산/거래 등록</h3>
            </div>
            <div className="registration-mode-tabs" aria-label="등록 종류">
              <button type="button" className={registrationMode === 'asset' ? 'active asset' : ''} onClick={() => switchRegistrationMode('asset')}>자산</button>
              <button type="button" className={registrationMode === 'expense' ? 'active expense' : ''} onClick={() => switchRegistrationMode('expense')}>지출</button>
              <button type="button" className={registrationMode === 'income' ? 'active income' : ''} onClick={() => switchRegistrationMode('income')}>수입</button>
              <button type="button" className={registrationMode === 'transfer' ? 'active transfer' : ''} onClick={() => switchRegistrationMode('transfer')}>이체</button>
            </div>
            {registrationMode === 'asset' ? (
              <AssetRegistrationForm
                editingAsset={editingAsset}
                categories={activeAssetCategories}
                allCategories={allAssetCategories}
                getOpeningBalance={getAssetOpeningBalance}
                onCancel={() => setIsEntryModalOpen(false)}
                onSave={async ({ category, name, amount, memo }) => {
                  if (!category) { showNotice('자산 종류를 선택해 주세요.', '입력 확인', 'warning'); return; }
                  if (!name) { showNotice('자산 이름을 입력해 주세요.', '입력 확인', 'warning'); return; }
                  if (!editingAsset && amount <= 0) { showNotice('올바른 금액을 입력해 주세요.', '입력 확인', 'warning'); return; }
                  const saved = editingAsset
                    ? await handleUpdateAsset({ id: editingAsset.id, category, name, amount: editingAsset.amount, memo })
                    : await handleAddAsset({ id: createId(), category, name, amount, memo });
                  if (!saved) return;
                  setIsEntryModalOpen(false);
                  showNotice(editingAsset ? '자산 정보를 수정했습니다.' : '자산을 등록했습니다.', editingAsset ? '자산 수정' : '자산 등록', 'success');
                }}
              />
            ) : (
              <div className="modal-body" style={{ padding: '24px 28px' }}>
                <UnifiedEntryForm
                key={registrationMode}
                initialType={registrationMode}
                onAddTransaction={async (t) => {
                  const saved = await handleAddTransaction(t);
                  if (saved) setIsEntryModalOpen(false);
                  return saved;
                }}
                onAddTransactions={async (transactions) => {
                  const saved = await handleAddTransactions(transactions);
                  if (saved) setIsEntryModalOpen(false);
                  return saved;
                }}
                expenseCategories={activeExpenseCategories}
                incomeCategories={activeIncomeCategories}
                assetCategories={activeAssetCategories}
                assets={assets}
                onAddRecurringRule={(r) => {
                  handleAddRecurringRule(r);
                  setIsEntryModalOpen(false);
                }}
                onNotify={showNotice}
                onCancel={() => setIsEntryModalOpen(false)}
                isQuickAdd={true}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className={`app-toast ${notice.type}`} role="status" aria-live="polite">
          <div className="app-toast-icon" aria-hidden="true" />
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
          </div>
          <button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}>
            &times;
          </button>
        </div>
      )}

      {confirmDialog && (
        <div className="confirm-backdrop" role="presentation" onClick={closeConfirmDialog}>
          <section className="confirm-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-header">
              <div className={`confirm-icon-badge ${confirmDialog.tone === 'danger' ? 'danger' : 'default'}`}>
                {confirmDialog.tone === 'danger' ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                )}
              </div>
              <div className="confirm-text-wrap">
                <h3 id="confirm-title">{confirmDialog.title}</h3>
                <p className="confirm-message">{confirmDialog.message}</p>
              </div>
            </div>

            {confirmDialog.warningNote && (
              <div className="confirm-warning-note">
                <span className="confirm-warning-icon">ℹ️</span>
                <span>{confirmDialog.warningNote}</span>
              </div>
            )}

            <div className="confirm-actions">
              <button type="button" className="secondary-button" onClick={closeConfirmDialog}>
                {confirmDialog.cancelLabel ?? '취소'}
              </button>
              <button
                type="button"
                className={confirmDialog.tone === 'danger' ? 'danger-button' : 'primary-button'}
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  closeConfirmDialog();
                  action();
                }}
              >
                {confirmDialog.confirmLabel ?? '확인'}
              </button>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}

// Flow bar sub-component
function FlowRowItem({
  label,
  value,
  max,
  tone,
  segments,
  formatMoney = formatCurrency,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'expense' | 'income' | 'asset';
  segments: FlowSegment[];
  formatMoney?: (value: number) => string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flow-row">
      <div>
        <strong>{label}</strong>
        <span>{formatMoney(value)}</span>
      </div>
      <div className="flow-track">
        <div className={`flow-fill ${tone}`} style={{ width: `${width}%` }}>
          {segments.length > 0 ? (
            segments.map((segment) => (
              <i
                key={segment.id}
                title={`${segment.label} ${formatMoney(segment.value)}`}
                style={{ width: `${(segment.value / value) * 100}%`, background: segment.color }}
              />
            ))
          ) : (
            <i />
          )}
        </div>
      </div>
    </div>
  );
}

// Category summary sub-column
function CategorySummaryColumn({ title, categories, values, formatMoney = formatCurrency }: { title: string; categories: CategoryOption[]; values: Record<string, number>; formatMoney?: (value: number) => string }) {
  const validCategories = categories.filter(category => (values[category.id] ?? 0) !== 0);
  const total = validCategories.reduce((sum, category) => sum + (values[category.id] ?? 0), 0);
  const summaryKind = title.includes('지출') ? 'expense' : title.includes('수입') ? 'income' : 'asset';

  let emptyMsg = "표시할 내역이 없습니다.";
  if (title.includes("지출")) emptyMsg = "표시할 지출이 없습니다.";
  else if (title.includes("수입")) emptyMsg = "표시할 수입이 없습니다.";
  else if (title.includes("자산")) emptyMsg = "표시할 자산이 없습니다.";

  if (validCategories.length === 0) {
    return (
      <article className={`summary-column summary-column-${summaryKind}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', background: 'var(--bg-input)', borderRadius: '16px', border: '1px dashed var(--border-input)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 'bold', margin: 0 }}>{emptyMsg}</p>
      </article>
    );
  }

  return (
    <article className={`summary-column summary-column-${summaryKind}`}>
      <h3>{title}</h3>
      <table>
        <tbody>
          {validCategories.map((category) => (
            <tr key={category.id}>
              <td>{category.label}</td>
              <td>{formatMoney(values[category.id] ?? 0)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>합계</td>
            <td>{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

function CategoryActionRow({
  children,
  categoryId,
  scope,
  isEditing,
  onSortStart,
  onSortPreview,
  onSortCommit,
  onSortCancel,
}: {
  children: ReactNode;
  categoryId: string;
  scope: CategoryScope;
  isEditing: boolean;
  onSortStart: () => void;
  onSortPreview: (targetId: string, targetGroup?: 'asset' | 'liability') => void;
  onSortCommit: () => void;
  onSortCancel: () => void;
}) {
  const categorySortRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    row: HTMLElement;
    ghost: HTMLElement | null;
    active: boolean;
    previewTargetKey: string | null;
    moveListener: ((event: PointerEvent) => void) | null;
    releaseListener: ((event: PointerEvent) => void) | null;
  } | null>(null);
  const clearCategorySort = () => {
    const state = categorySortRef.current;
    if (!state) return;
    if (state.moveListener) window.removeEventListener('pointermove', state.moveListener);
    if (state.releaseListener) {
      window.removeEventListener('pointerup', state.releaseListener);
      window.removeEventListener('pointercancel', state.releaseListener);
    }
    state.ghost?.remove();
    document.body.classList.remove('category-handle-drag-active');
    categorySortRef.current = null;
  };

  useEffect(() => () => {
    const wasActive = categorySortRef.current?.active;
    clearCategorySort();
    if (wasActive) onSortCancel();
  }, []);

  const activateCategorySort = () => {
    const state = categorySortRef.current;
    if (!state || state.active) return;
    const rect = state.row.getBoundingClientRect();
    const ghost = state.row.cloneNode(true) as HTMLElement;
    ghost.classList.remove('category-handle-drag-source');
    ghost.classList.add('sortable-drag-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = `${state.startX - state.grabOffsetX}px`;
    ghost.style.top = `${state.startY - state.grabOffsetY}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.96';
    ghost.style.boxShadow = '0 14px 30px rgba(15, 23, 42, 0.24)';
    document.body.appendChild(ghost);
    state.ghost = ghost;
    state.active = true;
    document.body.classList.add('category-handle-drag-active');
    onSortStart();
  };

  const moveCategorySort = (clientX: number, clientY: number) => {
    const state = categorySortRef.current;
    if (!state) return;
    if (!state.active) {
      if (Math.hypot(clientX - state.startX, clientY - state.startY) < 5) return;
      activateCategorySort();
    }
    if (state.ghost) {
      state.ghost.style.left = `${clientX - state.grabOffsetX}px`;
      state.ghost.style.top = `${clientY - state.grabOffsetY}px`;
    }
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.category-action-row');
    const targetRow = target?.querySelector<HTMLElement>('.category-row');
    const targetId = target?.dataset.categoryId;
    const targetScope = targetRow?.dataset.categoryScope as CategoryScope | undefined;
    const targetGroup = targetRow?.dataset.assetCategoryKind;
    if (!targetId || targetId === categoryId || targetScope !== scope) return;
    const group = targetGroup === 'asset' || targetGroup === 'liability' ? targetGroup : undefined;
    const targetKey = `${group || ''}:${targetId}`;
    if (state.previewTargetKey === targetKey) return;
    state.previewTargetKey = targetKey;
    onSortPreview(targetId, group);
  };

  const finishCategorySort = (cancelled: boolean) => {
    const state = categorySortRef.current;
    if (!state) return;
    const wasActive = state.active;
    clearCategorySort();
    if (!wasActive) return;
    if (cancelled) onSortCancel();
    else onSortCommit();
  };

  return (
    <div className={`category-action-row ${isEditing ? 'is-editing' : ''}`} data-category-id={categoryId}>
      <div
        className="category-action-front"
        onPointerDown={(event) => {
          const handle = (event.target as HTMLElement).closest('.category-drag-handle');
          const row = event.currentTarget.querySelector<HTMLElement>('.category-row');
          if (handle && row && !isEditing) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            clearCategorySort();
            const rowRect = row.getBoundingClientRect();
            const pending = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              grabOffsetX: event.clientX - rowRect.left,
              grabOffsetY: event.clientY - rowRect.top,
              row,
              ghost: null as HTMLElement | null,
              active: false,
              previewTargetKey: null as string | null,
              moveListener: null as ((nativeEvent: PointerEvent) => void) | null,
              releaseListener: null as ((nativeEvent: PointerEvent) => void) | null,
            };
            const moveListener = (nativeEvent: PointerEvent) => {
              if (nativeEvent.pointerId !== pending.pointerId) return;
              nativeEvent.preventDefault();
              moveCategorySort(nativeEvent.clientX, nativeEvent.clientY);
            };
            const releaseListener = (nativeEvent: PointerEvent) => {
              if (nativeEvent.pointerId !== pending.pointerId) return;
              finishCategorySort(nativeEvent.type === 'pointercancel');
            };
            pending.moveListener = moveListener;
            pending.releaseListener = releaseListener;
            categorySortRef.current = pending;
            window.addEventListener('pointermove', moveListener, { passive: false });
            window.addEventListener('pointerup', releaseListener);
            window.addEventListener('pointercancel', releaseListener);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MobileLedgerSwipeItem({
  transaction,
  typeClass,
  category,
  title,
  detail,
  formatMoney,
  isOpen,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  typeClass: string;
  category: string;
  title: string;
  detail: string;
  formatMoney: (amount: number) => string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const actionWidth = 104;
  const gestureRef = useRef({ startX: 0, startY: 0, baseOffset: 0, isHorizontal: false });
  const [offset, setOffset] = useState(isOpen ? -actionWidth : 0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setOffset(isOpen ? -actionWidth : 0);
  }, [isOpen]);

  const clampOffset = (value: number) => Math.max(-actionWidth, Math.min(0, value));

  return (
    <div className={`mobile-ledger-swipe ${isOpen ? 'is-open' : ''} ${isDragging ? 'is-dragging' : ''}`}>
      <div className="mobile-ledger-swipe-actions" aria-hidden={!isOpen}>
        <button type="button" className="mobile-ledger-swipe-edit row-action-button row-action-edit" aria-label="수정" tabIndex={isOpen ? 0 : -1} onClick={onEdit}>
          <AppIcon name="edit" size={18} />
        </button>
        <button type="button" className="mobile-ledger-swipe-delete row-action-button row-action-delete" aria-label="삭제" tabIndex={isOpen ? 0 : -1} onClick={onDelete}>×</button>
      </div>
      <article
        className={`mobile-ledger-item ${typeClass}`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        <span className="mobile-ledger-category">{category}</span>
        <div className="mobile-ledger-copy">
          <strong>{title}{transaction.recurringRuleId && <span className="ledger-recurring-badge">정기</span>}</strong>
        </div>
        <strong
          className="mobile-ledger-amount mobile-ledger-swipe-region"
          onPointerDown={(event) => {
            gestureRef.current = { startX: event.clientX, startY: event.clientY, baseOffset: offset, isHorizontal: false };
          }}
          onPointerMove={(event) => {
            const deltaX = event.clientX - gestureRef.current.startX;
            const deltaY = event.clientY - gestureRef.current.startY;
            if (!gestureRef.current.isHorizontal) {
              if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
              gestureRef.current.isHorizontal = true;
              setIsDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            setOffset(clampOffset(gestureRef.current.baseOffset + deltaX));
          }}
          onPointerUp={(event) => {
            if (!gestureRef.current.isHorizontal) return;
            const nextOffset = clampOffset(gestureRef.current.baseOffset + event.clientX - gestureRef.current.startX);
            onOpenChange(nextOffset <= -(actionWidth / 2));
            gestureRef.current.isHorizontal = false;
            setIsDragging(false);
          }}
          onPointerCancel={() => {
            onOpenChange(offset <= -(actionWidth / 2));
            gestureRef.current.isHorizontal = false;
            setIsDragging(false);
          }}
        >
          {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''}{formatMoney(transaction.amount)}
        </strong>
        <div className="mobile-ledger-meta">{detail && <small>{detail}</small>}</div>
        <div className="mobile-ledger-desktop-actions">
          <button type="button" className="mobile-ledger-swipe-edit row-action-button row-action-edit" aria-label="수정" onClick={onEdit}>
            <AppIcon name="edit" size={18} />
          </button>
          <button type="button" className="mobile-ledger-swipe-delete row-action-button row-action-delete" aria-label="삭제" onClick={onDelete}>×</button>
        </div>
      </article>
    </div>
  );
}

type CardPaymentPeriod = { periodStart: string; periodEnd: string; dueDate: string; amount: number };

function shiftYearMonth(yearMonth: string, delta: number) {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function cardPaymentPeriods(asset: AssetItem, transactions: Transaction[]): CardPaymentPeriod[] {
  const startDay = asset.cardCycleStartDay;
  const endDay = asset.cardCycleEndDay;
  const paymentDay = asset.cardPaymentDay;
  if (!startDay || !endDay || !paymentDay || !asset.cardPaymentAssetId) return [];
  const grouped = new Map<string, CardPaymentPeriod>();
  transactions.filter((transaction) => transaction.assetId === asset.id && !transaction.cardSettlementId && !isOpeningBalanceCategory(transaction.category) && (transaction.type === 'expense' || transaction.type === 'income')).forEach((transaction) => {
    const yearMonth = transaction.date.slice(0, 7);
    const day = Number(transaction.date.slice(8, 10));
    const crossesMonth = startDay > endDay;
    if (!crossesMonth && (day < startDay || day > endDay)) return;
    const startMonth = crossesMonth && day < startDay ? shiftYearMonth(yearMonth, -1) : yearMonth;
    const endMonth = crossesMonth ? shiftYearMonth(startMonth, 1) : startMonth;
    const periodStart = `${startMonth}-${String(startDay).padStart(2, '0')}`;
    const periodEnd = `${endMonth}-${String(endDay).padStart(2, '0')}`;
    const dueDate = `${shiftYearMonth(endMonth, 1)}-${String(paymentDay).padStart(2, '0')}`;
    const key = `${periodStart}:${periodEnd}`;
    const current = grouped.get(key) ?? { periodStart, periodEnd, dueDate, amount: 0 };
    current.amount += transaction.type === 'expense' ? transaction.amount : -transaction.amount;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).filter((period) => period.amount > 0).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

function cardPaymentDueDateForToday(asset: AssetItem, today: string) {
  const startDay = asset.cardCycleStartDay;
  const endDay = asset.cardCycleEndDay;
  const paymentDay = asset.cardPaymentDay;
  if (!startDay || !endDay || !paymentDay) return null;
  const yearMonth = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const crossesMonth = startDay > endDay;
  if (!crossesMonth && (day < startDay || day > endDay)) return null;
  const startMonth = crossesMonth && day < startDay ? shiftYearMonth(yearMonth, -1) : yearMonth;
  const endMonth = crossesMonth ? shiftYearMonth(startMonth, 1) : startMonth;
  return `${shiftYearMonth(endMonth, 1)}-${String(paymentDay).padStart(2, '0')}`;
}

function isOpeningBalanceCategory(category: string) {
  return category === OPENING_BALANCE_CATEGORY || category.startsWith('opening-balance');
}

// Transaction List Table sub-component
function MobileLedgerTimeline({
  items,
  expenseCategories,
  incomeCategories,
  assetCategories,
  assets,
  formatMoney,
  onEdit,
  onDelete,
}: {
  items: Transaction[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  assetCategories: CategoryOption[];
  assets: AssetItem[];
  formatMoney: (amount: number) => string;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const sortedItems = [...items].sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
  const groups = sortedItems.reduce<Array<{ date: string; items: Transaction[] }>>((result, transaction) => {
    const currentGroup = result[result.length - 1];
    if (!currentGroup || currentGroup.date !== transaction.date) {
      result.push({ date: transaction.date, items: [transaction] });
    } else {
      currentGroup.items.push(transaction);
    }
    return result;
  }, []);

  const getAssetName = (id: string | null | undefined) => {
    const asset = assets.find((item) => item.id === id);
    return asset ? formatAssetLabel(asset, assetCategories) : '';
  };
  const getCategoryName = (transaction: Transaction) => {
    if (transaction.type === 'transfer') return '이체';
    const categories = transaction.type === 'expense' ? expenseCategories : incomeCategories;
    return categories.find((category) => category.id === transaction.category)?.label || transaction.category || '기타';
  };
  const getDetail = (transaction: Transaction) => {
    if (transaction.type === 'transfer') {
      const from = getAssetName(transaction.assetId) || '출금 계좌';
      const to = getAssetName(transaction.toAssetId) || '입금 계좌';
      return `${transaction.time || ''} ${from} → ${to}`.trim();
    }
    return [transaction.time, getAssetName(transaction.assetId)].filter(Boolean).join(' · ');
  };

  return (
    <div className="mobile-ledger-timeline" aria-label="모바일 거래 장부">
      {groups.length === 0 ? (
        <p className="mobile-ledger-empty">등록된 내역이 없습니다.</p>
      ) : groups.map((group) => {
        const date = new Date(`${group.date}T00:00:00`);
        const income = group.items.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
        const expense = group.items.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
        return (
          <section className="mobile-ledger-day" key={group.date}>
            <header className="mobile-ledger-day-header">
              <div className="mobile-ledger-date-card">
                <strong>{Number(date.getMonth() + 1)}월 {Number(group.date.slice(8, 10))}일</strong>
                <span>{weekdayLabels[date.getDay()]}요일</span>
              </div>
              <div className="mobile-ledger-day-totals">
                {income > 0 && <span className="income">+{formatMoney(income)}</span>}
                {expense > 0 && <span className="expense">-{formatMoney(expense)}</span>}
              </div>
            </header>
            <div className="mobile-ledger-day-list">
              {group.items.map((transaction) => {
                const typeClass = transaction.type === 'transfer' ? 'transfer' : transaction.type;
                const title = transaction.title || getCategoryName(transaction);
                const detail = getDetail(transaction);
                return (
                  <MobileLedgerSwipeItem
                    key={transaction.id}
                    transaction={transaction}
                    typeClass={typeClass}
                    category={getCategoryName(transaction)}
                    title={title}
                    detail={detail}
                    formatMoney={formatMoney}
                    isOpen={openSwipeId === transaction.id}
                    onOpenChange={(open) => setOpenSwipeId(open ? transaction.id : null)}
                    onEdit={() => {
                      setOpenSwipeId(null);
                      onEdit(transaction);
                    }}
                    onDelete={() => {
                      setOpenSwipeId(null);
                      onDelete(transaction.id);
                    }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TransactionListTable({
  title,
  type,
  items,
  onDelete,
  onEdit,
  categories,
  assetCategories = [],
  assets = [],
  onStopRecurring,
  formatMoney = formatCurrency,
}: {
  title: string;
  type: TransactionType;
  items: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
  categories: CategoryOption[];
  assetCategories?: CategoryOption[];
  assets?: AssetItem[];
  onStopRecurring?: (id: string, stopMonth?: string) => void;
  formatMoney?: (value: number) => string;
}) {
  const getAssetName = (id?: string | null) => {
    if (!id || !assets) return null;
    const ast = assets.find((a) => a.id === id);
    return ast ? formatAssetLabel(ast, assetCategories) : null;
  };

  return (
    <section className="ledger-table-wrap">
      <h3 className={type}>{title}</h3>
      <div className="ledger-table-scroll">
        <table className="ledger-table ledger-table-fixed">
          <colgroup>
            <col className="ledger-col-date" />
            <col className="ledger-col-amount" />
            <col className="ledger-col-category" />
            <col className="ledger-col-account" />
            <col className="ledger-col-title" />
            <col className="ledger-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>날짜</th>
              <th>금액</th>
              <th>{type === 'transfer' ? '출금 계좌' : '카테고리'}</th>
              <th>{type === 'transfer' ? '입금 계좌' : '계좌'}</th>
              <th>내용</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  등록된 내역이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((transaction) => {
                const isFuture = transaction.date > getToday();
                const recurringMark = transaction.recurringRuleId && (
                  <span className="ledger-recurring-badge" title="정기 기록">
                    정기
                  </span>
                );
                const dateCell = (
                  <div className="ledger-date-cell">
                    <strong>{transaction.date}</strong>
                    {transaction.time && <span>{transaction.time}</span>}
                  </div>
                );

                if (type === 'transfer') {
                  return (
                    <tr key={transaction.id} style={{ opacity: isFuture ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                      <td>{dateCell}</td>
                      <td className="ledger-amount-cell" style={{ fontWeight: 600, color: '#8b5cf6' }}>{formatMoney(transaction.amount)}</td>
                      <td><span className="ledger-account-badge ledger-account-badge-out">{getAssetName(transaction.assetId) || '출금 계좌 미지정'}</span></td>
                      <td><span className="ledger-account-badge ledger-account-badge-in">{getAssetName(transaction.toAssetId) || '입금 계좌 미지정'}</span></td>
                      <td className="ledger-title-cell">{transaction.title}{recurringMark}</td>
                      <td><div className="actions-cell"><button type="button" className="edit-btn" onClick={() => onEdit(transaction)}>수정</button><button type="button" className="delete-btn-sm" onClick={() => onDelete(transaction.id)}>삭제</button></div></td>
                    </tr>
                  );
                }

                return (
                  <tr key={transaction.id} style={{ opacity: isFuture ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                    <td>{dateCell}</td>
                    <td className="ledger-amount-cell" style={{ fontWeight: 600 }}>{formatMoney(transaction.amount)}</td>
                    <td><CategoryBadge categories={categories} idOrLabel={transaction.category} /></td>
                    <td>{getAssetName(transaction.assetId) ? <span className="ledger-account-badge ledger-account-badge-linked">{getAssetName(transaction.assetId)}</span> : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>-</span>}</td>
                    <td className="ledger-title-cell">{transaction.title}{recurringMark}</td>
                    <td><div className="actions-cell"><button type="button" className="edit-btn" onClick={() => onEdit(transaction)}>수정</button><button type="button" className="delete-btn-sm" onClick={() => onDelete(transaction.id)}>삭제</button></div></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InstantSelect({
  ariaLabel,
  value,
  placeholder,
  options,
  onChange,
  triggerRef,
  onSelectNext,
}: {
  ariaLabel: string;
  value: string | number;
  placeholder: string;
  options: Array<{ value: string | number; label: string }>;
  onChange: (value: string) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onSelectNext?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => String(option.value) === String(value))?.label;
  const selectOption = (option: { value: string | number }) => {
    onChange(String(option.value));
    setIsOpen(false);
    requestAnimationFrame(() => onSelectNext?.());
  };

  useEffect(() => {
    if (!isOpen) return;

    const closeOutsideSelect = (event: Event) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOutsideSelect, true);
    document.addEventListener('focusin', closeOutsideSelect, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutsideSelect, true);
      document.removeEventListener('focusin', closeOutsideSelect, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="instant-select">
      <button
        type="button"
        ref={triggerRef}
        className="instant-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span className={selectedLabel ? '' : 'instant-select-placeholder'}>{selectedLabel || placeholder}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen && (
        <div className="instant-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={String(option.value) === String(value) ? 'selected' : ''}
              key={String(option.value)}
              onClick={() => selectOption(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetRegistrationForm({
  editingAsset,
  categories,
  allCategories,
  getOpeningBalance,
  onSave,
  onCancel,
}: {
  editingAsset: AssetItem | null;
  categories: CategoryOption[];
  allCategories: CategoryOption[];
  getOpeningBalance: (asset: AssetItem) => number;
  onSave: (values: { category: string; name: string; amount: number; memo: string }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(editingAsset?.category || '');
  const categoryRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);

  return (
    <form
      key={editingAsset ? editingAsset.id : 'new'}
      className="asset-entry-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const name = (event.currentTarget.elements.namedItem('asset-name') as HTMLInputElement).value.trim();
        const amount = parseAmount((event.currentTarget.elements.namedItem('asset-amount') as HTMLInputElement).value) || 0;
        const memo = (event.currentTarget.elements.namedItem('asset-memo') as HTMLInputElement).value;
        await onSave({ category, name, amount, memo });
      }}
    >
      <div className="form-group"><InstantSelect ariaLabel="자산 카테고리" value={category} placeholder="자산 카테고리" options={categories.map((item) => ({ value: item.id, label: item.label }))} onChange={setCategory} triggerRef={categoryRef} onSelectNext={() => nameRef.current?.focus()} /></div>
      <div className="form-group"><label>자산 이름</label><input ref={nameRef} name="asset-name" placeholder="자산 이름" required defaultValue={editingAsset ? formatAssetLabel(editingAsset, allCategories) : ''} /></div>
      <div className="form-group"><label>기초 금액</label><input ref={amountRef} type="text" name="asset-amount" inputMode="numeric" placeholder="기초 금액" required defaultValue={editingAsset ? formatNumberInput(getOpeningBalance(editingAsset)) : ''} readOnly={Boolean(editingAsset)} onChange={(event) => { const digits = event.currentTarget.value.replace(/[^\d]/g, ''); event.currentTarget.value = digits ? formatNumberInput(Number(digits)) : ''; }} /></div>
      <div className="form-group"><label>메모</label><input ref={memoRef} name="asset-memo" placeholder="메모 (선택)" defaultValue={editingAsset?.memo || ''} /></div>
      <div className="asset-entry-actions"><button type="button" className="secondary-button" onClick={onCancel}>취소</button><button type="submit" className="primary-button">{editingAsset ? '자산 수정' : '자산 등록'}</button></div>
    </form>
  );
}

function UnifiedEntryForm({
  defaultDate = getCurrentTransactionDate(),
  initialType = 'expense',
  onAddTransaction,
  onAddTransactions,
  isQuickAdd = false,
  expenseCategories,
  incomeCategories,
  assetCategories: propAssetCategories,
  assets = [],
  onAddAsset,
  onAddRecurringRule,
  onNotify,
  onCancel,
}: {
  defaultDate?: string;
  initialType?: EntryType;
  onAddTransaction: (t: Transaction) => void | Promise<boolean>;
  onAddTransactions?: (transactions: Transaction[]) => void | Promise<boolean>;
  onAddAsset?: (a: AssetItem) => void;
  isQuickAdd?: boolean;
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  assetCategories?: CategoryOption[];
  assets?: AssetItem[];
  onAddRecurringRule?: (r: RecurringRule) => void;
  onNotify?: (message: string, title?: string, type?: NoticeType) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<UnifiedFormState>(() => createUnifiedForm(defaultDate, initialType));
  const [isRecurring, setIsRecurring] = useState(false);
  const [installmentMonths, setInstallmentMonths] = useState(1);
  const amountRef = useRef<HTMLInputElement>(null);
  const installmentRef = useRef<HTMLButtonElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const assetRef = useRef<HTMLButtonElement>(null);
  const toAssetRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const currentAssetCategories = propAssetCategories || assetCategories;

  const activeCategories: CategoryOption[] = useMemo(() => {
    if (form.type === 'expense') return expenseCategories;
    if (form.type === 'income') return incomeCategories;
    return [{ id: 'transfer', label: '계좌 이체', color: '#8b5cf6' }];
  }, [form.type, expenseCategories, incomeCategories]);

  function handleTypeChange(newType: EntryType) {
    const defaultCat = newType === 'transfer' ? 'transfer' : '';

    setForm((prev) => ({
      ...prev,
      type: newType,
      category: defaultCat,
    }));
    if (newType !== 'expense') setInstallmentMonths(1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      onNotify?.('올바른 금액을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (!form.date) {
      onNotify?.('날짜를 입력해 주세요.', '입력 확인', 'warning');
      return;
    }
    if (!form.title.trim()) {
      onNotify?.('내용을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (form.type !== 'transfer' && !form.category) {
      onNotify?.('카테고리를 선택해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (form.type === 'transfer') {
      if (!form.assetId || !form.toAssetId) {
        onNotify?.('보내는 계좌와 받는 계좌를 모두 선택해 주세요.', '입력 확인', 'warning');
        return;
      }
      if (form.assetId === form.toAssetId) {
        onNotify?.('보내는 계좌와 받는 계좌가 동일합니다. 서로 다른 계좌를 선택해 주세요.', '입력 확인', 'warning');
        return;
      }
    }

    const transactionTime = normalizeTransactionTime(form.time);
    const installmentCount = form.type === 'expense' ? installmentMonths : 1;

    if (installmentCount > 1) {
      const now = Date.now();
      const installmentGroupId = `installment_${now}`;
      const baseAmount = Math.floor(amount / installmentCount);
      const remainder = amount % installmentCount;
      const installmentTransactions = Array.from({ length: installmentCount }, (_, index) => ({
        id: `${installmentGroupId}_${index + 1}`,
        type: form.type as TransactionType,
        date: addMonthsToTransactionDate(form.date, index),
        time: transactionTime,
        createdAt: now + index,
        amount: baseAmount + (index < remainder ? 1 : 0),
        title: `${form.title.trim()} (${index + 1}/${installmentCount})`,
        category: form.category,
        assetId: form.assetId || null,
        toAssetId: null,
        installmentGroupId,
        installmentIndex: index + 1,
        installmentMonths: installmentCount,
      }));
      if (onAddTransactions) {
        const saved = await onAddTransactions(installmentTransactions);
        if (saved === false) return;
      }
      else installmentTransactions.forEach(onAddTransaction);
    } else if (isRecurring && onAddRecurringRule) {
      const day = Number(form.date.slice(8, 10)) || 1;
      const transactionMonth = form.date.slice(0, 7);
      const startMonth = getNextMonth(transactionMonth);
      const now = Date.now();
      const ruleId = `rule_${now}`;
      onAddRecurringRule({
        id: ruleId,
        type: form.type as TransactionType,
        day,
        time: transactionTime,
        amount,
        title: form.title.trim(),
        category: form.type === 'transfer' ? 'transfer' : form.category,
        assetId: form.assetId || null,
        toAssetId: form.type === 'transfer' ? form.toAssetId : null,
        startMonth,
        endMonth: null,
      });

      onAddTransaction({
        id: `rec_${ruleId}_${transactionMonth}`,
        type: form.type as TransactionType,
        date: form.date,
        time: transactionTime,
        createdAt: now,
        amount,
        title: form.title.trim(),
        category: form.type === 'transfer' ? 'transfer' : form.category,
        assetId: form.assetId || null,
        toAssetId: form.type === 'transfer' ? form.toAssetId : null,
        recurringRuleId: ruleId,
      });
    } else {
      const saved = await onAddTransaction({
        id: createId(),
        type: form.type as TransactionType,
        date: form.date,
        time: transactionTime,
        createdAt: Date.now(),
        amount,
        title: form.title.trim(),
        category: form.type === 'transfer' ? 'transfer' : form.category,
        assetId: form.assetId || null,
        toAssetId: form.type === 'transfer' ? form.toAssetId : null,
      });
      if (saved === false) return;
    }

    setForm((prev) => ({
      ...prev,
      amount: '',
      title: '',
    }));
    setIsRecurring(false);
    setInstallmentMonths(1);

    onNotify?.('성공적으로 등록되었습니다.', '등록 완료', 'success');
  }

  const formColorClass = form.type === 'expense' ? 'expense' : form.type === 'income' ? 'income' : 'transfer';

  return (
    <form className={isQuickAdd ? 'entry-form' : 'glass-panel entry-form'} onSubmit={handleSubmit}>
      {!isQuickAdd && (
        <div className={`entry-form-title ${formColorClass}`}>
          <strong>통합 자산/거래 등록</strong>
          <span>수입, 지출 및 계좌 간 이체 내역을 드롭다운 선택으로 등록합니다.</span>
        </div>
      )}

      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {/* 1. 구분: 3개 버튼 1행 나열 */}
        <div className="type-toggle-group">
          <div className="type-toggle-row">
            <button
              type="button"
              className={`type-toggle-btn ${form.type === 'expense' ? 'active expense' : ''}`}
              onClick={() => handleTypeChange('expense')}
            >
              지출 🔴
            </button>
            <button
              type="button"
              className={`type-toggle-btn ${form.type === 'income' ? 'active income' : ''}`}
              onClick={() => handleTypeChange('income')}
            >
              수입 🔵
            </button>
            <button
              type="button"
              className={`type-toggle-btn ${form.type === 'transfer' ? 'active transfer' : ''}`}
              onClick={() => handleTypeChange('transfer')}
            >
              이체 🟣
            </button>
          </div>
        </div>

        {/* 2. 날짜 */}
        <label className="compact-entry-field" aria-label="날짜">
          <input
            type="date"
            aria-label="날짜"
            value={form.date}
            onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
          />
        </label>

        <label className="compact-entry-field" aria-label="시간">
          <input
            type="time"
            aria-label="시간"
            value={form.time}
            onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
          />
        </label>

        {/* 3. 금액 */}
        <label
          className="compact-entry-field amount-entry-field"
          aria-label="금액"
          style={form.type !== 'expense' ? { gridColumn: 'span 2' } : undefined}
        >
          <input
            type="text"
            inputMode="numeric"
            aria-label="금액"
            placeholder="금액"
            ref={amountRef}
            value={form.amount ? formatNumberInput(parseNumberInput(form.amount)) : ''}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value.replace(/[^\d]/g, '') }))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (form.type === 'expense') installmentRef.current?.focus();
              else if (form.type === 'transfer') assetRef.current?.focus();
              else categoryRef.current?.focus();
            }}
            autoFocus
          />
          <span className="currency-suffix" aria-hidden="true">원</span>
        </label>

        {form.type === 'expense' && (
          <label className="installment-select compact-entry-field" aria-label="할부">
            <InstantSelect
              ariaLabel="할부"
              value={installmentMonths}
              placeholder="일시불"
              options={Array.from({ length: 24 }, (_, index) => index + 1).map((months) => ({
                value: months,
                label: months === 1 ? '일시불' : `${months}개월`,
              }))}
              onChange={(value) => {
                const months = Number(value);
                setInstallmentMonths(months);
                if (months > 1) setIsRecurring(false);
              }}
              triggerRef={installmentRef}
              onSelectNext={() => categoryRef.current?.focus()}
            />
            {installmentMonths > 1 && <small>총액을 {installmentMonths}개월로 나누어 매월 무이자로 등록합니다.</small>}
          </label>
        )}

        {/* 4. 카테고리 (이체 선택 시 비표시) */}
        {form.type !== 'transfer' && (
          <label className="compact-entry-field" style={{ gridColumn: 'span 2' }} aria-label="카테고리">
            <InstantSelect
              ariaLabel="카테고리"
              value={form.category}
              placeholder="카테고리"
              options={activeCategories.map((category) => ({ value: category.id, label: category.label }))}
              onChange={(category) => setForm((prev) => ({ ...prev, category }))}
              triggerRef={categoryRef}
              onSelectNext={() => assetRef.current?.focus()}
            />
          </label>
        )}

        {/* 5. 자산 */}
        {form.type === 'transfer' ? (
          <>
            <label className="compact-entry-field" aria-label="보내는 계좌">
              <InstantSelect
                ariaLabel="보내는 계좌"
                value={form.assetId}
                placeholder="보내는 계좌"
                options={assets.map((asset) => ({ value: asset.id, label: formatAssetLabel(asset, currentAssetCategories) }))}
                onChange={(assetId) => setForm((prev) => ({ ...prev, assetId }))}
                triggerRef={assetRef}
                onSelectNext={() => toAssetRef.current?.focus()}
              />
            </label>
            <label className="compact-entry-field" aria-label="받는 계좌">
              <InstantSelect
                ariaLabel="받는 계좌"
                value={form.toAssetId}
                placeholder="받는 계좌"
                options={assets.map((asset) => ({ value: asset.id, label: formatAssetLabel(asset, currentAssetCategories) }))}
                onChange={(toAssetId) => setForm((prev) => ({ ...prev, toAssetId }))}
                triggerRef={toAssetRef}
                onSelectNext={() => titleRef.current?.focus()}
              />
            </label>
          </>
        ) : (
          <label className="compact-entry-field" style={{ gridColumn: 'span 2' }} aria-label="계좌">
            <InstantSelect
              ariaLabel="계좌"
              value={form.assetId}
              placeholder="계좌"
              options={assets.map((asset) => ({ value: asset.id, label: formatAssetLabel(asset, currentAssetCategories) }))}
              onChange={(assetId) => setForm((prev) => ({ ...prev, assetId }))}
              triggerRef={assetRef}
              onSelectNext={() => titleRef.current?.focus()}
            />
          </label>
        )}

        {/* 6. 내용 */}
        <label className="content-entry-field compact-entry-field" style={{ gridColumn: 'span 2' }} aria-label="내용">
          <input
            type="text"
            ref={titleRef}
            placeholder="내용"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
        </label>

        {/* 7. 매달 정기 기록 체크박스 */}
        <label className="recurring-toggle" style={{ gridColumn: 'span 2', opacity: installmentMonths > 1 ? 0.55 : 1 }}>
          <input
            type="checkbox"
            checked={isRecurring}
            disabled={installmentMonths > 1}
            onChange={(e) => setIsRecurring(e.target.checked)}
          />
          <span className="recurring-toggle-mark" aria-hidden="true" />
          <span className="recurring-toggle-text">매달 정기 기록으로 등록</span>
        </label>
      </div>

      <div className="entry-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>취소</button>
        <button type="submit" className="primary-button entry-submit" style={{ background: form.type === 'expense' ? 'var(--color-expense)' : form.type === 'income' ? 'var(--color-income)' : 'var(--color-transfer)' }}>
          {form.type === 'expense' ? '지출 등록' : form.type === 'income' ? '수입 등록' : '이체 등록'}
        </button>
      </div>
    </form>
  );
}

// Edit Form
function TransactionEditForm({
  transaction,
  onSave,
  onSaveInstallment,
  installmentTransactions = [],
  onCancel,
  onAddRecurringRule,
  onUpdateRecurringRule,
  recurringRules,
  expenseCategories,
  incomeCategories,
  assetCategories = [],
  assets = [],
  onStopRecurring,
  onNotify,
}: {
  transaction: Transaction;
  onSave: (t: Transaction) => void | Promise<boolean>;
  onSaveInstallment?: (t: Transaction) => void;
  installmentTransactions?: Transaction[];
  onCancel: () => void;
  onAddRecurringRule?: (r: RecurringRule) => void;
  onUpdateRecurringRule?: (r: RecurringRule) => void;
  recurringRules: RecurringRule[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  assetCategories?: CategoryOption[];
  assets?: AssetItem[];
  onStopRecurring?: (id: string, stopMonth?: string) => void;
  onNotify?: (message: string, title?: string, type?: NoticeType) => void;
}) {
  const [date, setDate] = useState(transaction.date);
  const [time, setTime] = useState(transaction.time || '');
  const [amount, setAmount] = useState(String(transaction.amount));
  const [title, setTitle] = useState(transaction.title);
  const categories = transaction.type === 'expense' ? expenseCategories : incomeCategories;
  const [category, setCategory] = useState(() => (
    categories.some((item) => item.id === transaction.category) ? transaction.category : ''
  ));
  const [assetId, setAssetId] = useState(transaction.assetId || '');
  const [toAssetId, setToAssetId] = useState(transaction.toAssetId || '');
  const categoryRef = useRef<HTMLButtonElement>(null);
  const assetRef = useRef<HTMLButtonElement>(null);
  const toAssetRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isInstallment = Boolean(transaction.installmentGroupId && transaction.installmentIndex && transaction.installmentMonths && installmentTransactions.length > 1);
  const installmentTotal = installmentTransactions.reduce((sum, item) => sum + item.amount, 0);
  const paidInstallmentAmount = installmentTransactions
    .filter((item) => (item.installmentIndex || 0) < (transaction.installmentIndex || 0))
    .reduce((sum, item) => sum + item.amount, 0);
  const remainingInstallments = installmentTransactions.filter((item) => (item.installmentIndex || 0) > (transaction.installmentIndex || 0)).length;
  const previewRemainingBalance = installmentTotal - paidInstallmentAmount - parseAmount(amount);
  
  // Load initial checkbox state based on transaction recurringRuleId
  const [isRecurring, setIsRecurring] = useState(() => {
    if (!transaction.recurringRuleId) return false;
    const rule = recurringRules.find((r) => r.id === transaction.recurringRuleId);
    return rule ? !rule.endMonth : false;
  });

  // Synchronize checkbox state whenever transaction.recurringRuleId changes
  useEffect(() => {
    if (!transaction.recurringRuleId) {
      setIsRecurring(false);
      return;
    }
    const rule = recurringRules.find((r) => r.id === transaction.recurringRuleId);
    setIsRecurring(rule ? !rule.endMonth : false);
  }, [transaction.recurringRuleId, recurringRules]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = parseAmount(amount);
    if (!date || !title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      onNotify?.('금액과 내용을 올바르게 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (transaction.type !== 'transfer' && !category) {
      onNotify?.('카테고리를 선택해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (transaction.type === 'transfer') {
      if (!assetId || !toAssetId) {
        onNotify?.('보내는 계좌와 받는 계좌를 모두 선택해 주세요.', '입력 확인', 'warning');
        return;
      }
      if (assetId === toAssetId) {
        onNotify?.('보내는 계좌와 받는 계좌가 동일합니다.', '입력 확인', 'warning');
        return;
      }
    }

    const activeRecurringRule = transaction.recurringRuleId
      ? recurringRules.find((rule) => rule.id === transaction.recurringRuleId && !rule.endMonth)
      : undefined;
    const wasRecurring = !!activeRecurringRule;
    let nextRuleId = transaction.recurringRuleId || null;
    const transactionTime = normalizeTransactionTime(time);

    if (isInstallment) {
      if (previewRemainingBalance < 0) {
        onNotify?.('이번 회차 금액은 남은 할부 총액을 넘을 수 없습니다.', '입력 확인', 'warning');
        return;
      }
      onSaveInstallment?.({
        ...transaction,
        date,
        time: transactionTime,
        amount: numericAmount,
        title: title.trim(),
        category: transaction.type === 'transfer' ? 'transfer' : category,
        assetId: assetId || null,
        toAssetId: transaction.type === 'transfer' ? toAssetId : null,
      });
      return;
    }

    // Handle transitions
    if (isRecurring && !wasRecurring && onAddRecurringRule) {
      // 1. Unchecked -> Checked: Add recurring rule starting next month
      const dy = Number(date.slice(8, 10)) || 1;
      const nextMonthStr = getNextMonth(date.slice(0, 7));
      const ruleId = `rule_${Date.now()}`;

      onAddRecurringRule({
        id: ruleId,
        type: transaction.type,
        day: dy,
        time: transactionTime,
        amount: numericAmount,
        title: title.trim(),
        category: transaction.type === 'transfer' ? 'transfer' : category,
        assetId: assetId || null,
        toAssetId: transaction.type === 'transfer' ? toAssetId : null,
        startMonth: nextMonthStr,
        endMonth: null
      });

      nextRuleId = ruleId;
      onNotify?.(`다음 달(${nextMonthStr})부터 매달 ${dy}일에 자동 등록됩니다.`, '정기 기록 설정', 'success');
    } else if (!isRecurring && wasRecurring && onStopRecurring) {
      // 2. Checked -> Unchecked: Stop recurring rules from next month
      onStopRecurring(transaction.recurringRuleId || transaction.id, date.slice(0, 7));
      nextRuleId = null;
    } else if (isRecurring && wasRecurring && activeRecurringRule && onUpdateRecurringRule) {
      // 3. Checked -> Checked (Keep recurring, but update information)
      const dy = Number(date.slice(8, 10)) || 1;
      onUpdateRecurringRule({
        ...activeRecurringRule,
        day: dy,
        time: transactionTime,
        amount: numericAmount,
        title: title.trim(),
        category: transaction.type === 'transfer' ? 'transfer' : category,
        assetId: assetId || null,
        toAssetId: transaction.type === 'transfer' ? toAssetId : null,
      });
      onNotify?.('정기 반복 결제 정보가 변경되었습니다.', '정기 기록 수정', 'success');
    }

    const saved = await onSave({
      ...transaction,
      date,
      time: transactionTime,
      amount: numericAmount,
      title: title.trim(),
      category: transaction.type === 'transfer' ? 'transfer' : category,
      assetId: assetId || null,
      toAssetId: transaction.type === 'transfer' ? toAssetId : null,
      recurringRuleId: nextRuleId,
    });
    if (saved === false) return;
  }

  return (
    <form className="transaction-edit-form" onSubmit={handleSubmit}>
      <label className="compact-entry-field" aria-label="날짜">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="compact-entry-field" aria-label="시간">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="compact-entry-field amount-entry-field" style={{ gridColumn: 'span 2' }} aria-label="금액">
        <input
          type="text"
          inputMode="numeric"
          placeholder="금액"
          value={amount ? formatNumberInput(parseNumberInput(amount)) : ''}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
        />
        <span className="currency-suffix" aria-hidden="true">원</span>
      </label>
      <label className="compact-entry-field content-entry-field" style={{ gridColumn: 'span 2' }} aria-label="내용">
        <input ref={titleRef} type="text" placeholder="내용" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      {isInstallment && (
        <div className="installment-edit-summary">
          <span>총 할부금액 {formatCurrency(installmentTotal)}</span>
          <span>남은 잔액 {formatCurrency(Math.max(0, previewRemainingBalance))} · 남은 {remainingInstallments}개월</span>
        </div>
      )}

      {transaction.type === 'transfer' ? (
        <>
          <label className="compact-entry-field" aria-label="보내는 계좌">
            <InstantSelect
              ariaLabel="보내는 계좌"
              value={assetId}
              placeholder="보내는 계좌"
              options={assets.map((asset) => ({ value: asset.id, label: formatAssetLabel(asset) }))}
              onChange={setAssetId}
              triggerRef={assetRef}
              onSelectNext={() => toAssetRef.current?.focus()}
            />
          </label>
          <label className="compact-entry-field" aria-label="받는 계좌">
            <InstantSelect
              ariaLabel="받는 계좌"
              value={toAssetId}
              placeholder="받는 계좌"
              options={assets.map((asset) => ({ value: asset.id, label: formatAssetLabel(asset) }))}
              onChange={setToAssetId}
              triggerRef={toAssetRef}
              onSelectNext={() => titleRef.current?.focus()}
            />
          </label>
        </>
      ) : (
        <>
      <label className="compact-entry-field" style={{ gridColumn: 'span 2' }} aria-label="카테고리">
        <InstantSelect
          ariaLabel="카테고리"
          value={category}
          placeholder="카테고리"
          options={categories.map((item) => ({ value: item.id, label: item.label }))}
          onChange={setCategory}
          triggerRef={categoryRef}
          onSelectNext={() => assetRef.current?.focus()}
        />
      </label>
          <label className="compact-entry-field" style={{ gridColumn: 'span 2' }} aria-label="계좌">
            <InstantSelect
              ariaLabel="계좌"
              value={assetId}
              placeholder="계좌"
              options={assets.map((asset) => ({ value: asset.id, label: formatAssetLabel(asset) }))}
              onChange={setAssetId}
              triggerRef={assetRef}
              onSelectNext={() => titleRef.current?.focus()}
            />
          </label>
        </>
      )}

      {!isInstallment && <label className="recurring-toggle">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
        />
        <span className="recurring-toggle-mark" aria-hidden="true" />
        <span className="recurring-toggle-text">정기 기록</span>
      </label>}

      <div className="transaction-edit-actions">
        <button type="button" className="danger-button" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="primary-button">
          변경 사항 저장
        </button>
      </div>
    </form>
  );
}

// HSL 및 HEX 변환 헬퍼 함수
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}
