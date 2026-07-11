import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import type { AssetItem, CategoryOption, Transaction, UnifiedFormState, EntryType, TransactionType, CategoryPlan, RecurringRule } from './types';

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
  { id: 'cash', label: '현금', color: '#10b981' },
  { id: 'stock', label: '주식', color: '#3b82f6' },
  { id: 'installment', label: '적금', color: '#14b8a6' },
  { id: 'deposit', label: '예금', color: '#06b6d4' },
  { id: 'subscription-saving', label: '청약', color: '#8b5cf6' },
  { id: 'emergency', label: '비상금', color: '#f59e0b' },
  { id: 'travel', label: '여행', color: '#0284c7' },
  { id: 'etc', label: '기타', color: '#64748b' },
];

const STORAGE_KEY = 'mywallet:v2';
const categoryColorPresets = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#2563eb', '#6366f1', '#7c3aed', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#db2777', '#64748b',
];

type NoticeType = 'info' | 'success' | 'warning' | 'error';
type CategoryScope = TransactionType | 'asset';
type CategoryColorMap = Record<string, string>;
type CategoryOrderMap = Partial<Record<CategoryScope, string[]>>;
type HiddenCategoryMap = Record<string, boolean>;
type AppTab = 'summary' | 'asset' | 'plan' | 'calendar' | 'ledger' | 'settings';
type AppIconName = 'dashboard' | 'asset' | 'plan' | 'calendar' | 'ledger' | 'settings' | 'plus' | 'edit' | 'chevronLeft' | 'chevronRight' | 'eye' | 'eyeOff';
type RemoteSyncStatus = 'checking' | 'pending' | 'saving' | 'synced' | 'stale' | 'error';
type FlowSegment = { id: string; label: string; value: number; color: string };

interface NoticeState {
  id: number;
  type: NoticeType;
  title: string;
  message: string;
}

interface ConfirmState {
  title: string;
  message: string;
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

function getCurrentMonth() {
  return getToday().slice(0, 7);
}

function getNextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextDate = new Date(year, monthNumber, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
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

function formatMobileCalendarAmount(amount: number) {
  // 1. 창 너비가 768px 이상(PC/태블릿)이면 100% 원래 숫자로 포맷 표기
  if (window.innerWidth >= 768) {
    return formatCurrency(amount);
  }
  
  // 2. 모바일 뷰포트(768px 미만)일 때의 콤팩트 축약 규칙:
  if (amount < 10000) {
    // 1만원 미만은 K 축약하지 않고 원화 기호/콤마만 제거한 순수 원본 숫자로 표기하여 최대 보존 (예: 7890, 850)
    return amount.toString();
  }
  
  // 3. 1만원 이상일 때만 K 축약 적용
  const k = amount / 1000;
  if (k % 1 === 0) {
    return `${k}k`;
  }
  const formatted = k.toFixed(1);
  if (formatted.endsWith('.0')) {
    return `${formatted.slice(0, -2)}k`;
  }
  return `${formatted}k`;
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

function applyCategorySettings(categories: CategoryOption[], type: CategoryScope, colors: CategoryColorMap, order: CategoryOrderMap) {
  const orderList = order[type] ?? [];
  const orderIndex = new Map(orderList.map((id, index) => [id, index]));

  return categories.map((category) => ({
    ...category,
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
  const defaultCategory = defaultType === 'expense' 
    ? (expenseCategories[0]?.id ?? 'etc')
    : defaultType === 'income'
    ? (incomeCategories[0]?.id ?? 'etc')
    : (assetCategories[0]?.id ?? 'cash');

  return {
    type: defaultType,
    date: defaultDate,
    amount: '',
    title: '',
    category: defaultCategory,
  };
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
      categoryOrder: {} as CategoryOrderMap,
      hiddenCategories: {} as HiddenCategoryMap,
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
          categoryOrder: {} as CategoryOrderMap,
          hiddenCategories: {} as HiddenCategoryMap,
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
        categoryOrder: {} as CategoryOrderMap,
        hiddenCategories: {} as HiddenCategoryMap,
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
      theme: parsed.theme === 'dark' ? ('dark' as const) : ('light' as const),
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      customExpenseCategories: Array.isArray(parsed.customExpenseCategories) ? parsed.customExpenseCategories : [] as CategoryOption[],
      customIncomeCategories: Array.isArray(parsed.customIncomeCategories) ? parsed.customIncomeCategories : [] as CategoryOption[],
      customAssetCategories: Array.isArray(parsed.customAssetCategories) ? parsed.customAssetCategories : [] as CategoryOption[],
      categoryColors: parsed.categoryColors && typeof parsed.categoryColors === 'object' ? parsed.categoryColors as CategoryColorMap : {} as CategoryColorMap,
      categoryOrder: parsed.categoryOrder && typeof parsed.categoryOrder === 'object' ? parsed.categoryOrder as CategoryOrderMap : {} as CategoryOrderMap,
      hiddenCategories: parsed.hiddenCategories && typeof parsed.hiddenCategories === 'object' ? parsed.hiddenCategories as HiddenCategoryMap : {} as HiddenCategoryMap,
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
      categoryOrder: {} as CategoryOrderMap,
      hiddenCategories: {} as HiddenCategoryMap,
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
  theme: 'light' | 'dark', 
  plans: CategoryPlan[],
  customExpenseCategories: CategoryOption[],
  customIncomeCategories: CategoryOption[],
  customAssetCategories: CategoryOption[],
  categoryColors: CategoryColorMap,
  categoryOrder: CategoryOrderMap,
  hiddenCategories: HiddenCategoryMap,
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
        categoryOrder,
        hiddenCategories,
        recurringRules, 
        deletedRecurringTxs,
        updatedAt
      })
    );
  } catch {
    // LocalStorage error fallback
  }
}

function saveRemoteD1(
  transactions: Transaction[], 
  assets: AssetItem[], 
  budget: number, 
  theme: 'light' | 'dark', 
  plans: CategoryPlan[],
  customExpenseCategories: CategoryOption[],
  customIncomeCategories: CategoryOption[],
  customAssetCategories: CategoryOption[],
  categoryColors: CategoryColorMap,
  categoryOrder: CategoryOrderMap,
  hiddenCategories: HiddenCategoryMap,
  recurringRules: RecurringRule[],
  deletedRecurringTxs: string[],
  updatedAt: number
) {
  return fetch("/api/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transactions,
      assets,
      budget,
      theme,
      plans,
      customExpenseCategories,
      customIncomeCategories,
      customAssetCategories,
      categoryColors,
      categoryOrder,
      hiddenCategories,
      recurringRules,
      deletedRecurringTxs,
      updatedAt
    })
  });
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

function parseCSVLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
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

export default function App() {
  const storedData = useMemo(() => loadStoredData(), []);
  
  // App states
  const [transactions, setTransactions] = useState<Transaction[]>(storedData.transactions);
  const [assets, setAssets] = useState<AssetItem[]>(storedData.assets);
  const [budget, setBudget] = useState<number>(storedData.budget);
  const [theme, setTheme] = useState<'light' | 'dark'>(storedData.theme);
  const [customExpenseCategories, setCustomExpenseCategories] = useState<CategoryOption[]>(storedData.customExpenseCategories);
  const [customIncomeCategories, setCustomIncomeCategories] = useState<CategoryOption[]>(storedData.customIncomeCategories);
  const [customAssetCategories, setCustomAssetCategories] = useState<CategoryOption[]>(storedData.customAssetCategories || []);
  const [categoryColors, setCategoryColors] = useState<CategoryColorMap>(storedData.categoryColors || {});
  const [categoryOrder, setCategoryOrder] = useState<CategoryOrderMap>(storedData.categoryOrder || {});
  const [hiddenCategories, setHiddenCategories] = useState<HiddenCategoryMap>(storedData.hiddenCategories || {});
   const [recurringRules, setRecurringRules] = useState<RecurringRule[]>(storedData.recurringRules || []);
  const [deletedRecurringTxs, setDeletedRecurringTxs] = useState<string[]>(storedData.deletedRecurringTxs || []);
  const [updatedAt, setUpdatedAt] = useState<number>(storedData.updatedAt || 0);

  
  const allExpenseCategories = useMemo(
    () => applyCategorySettings([...expenseCategories, ...customExpenseCategories], 'expense', categoryColors, categoryOrder),
    [customExpenseCategories, categoryColors, categoryOrder]
  );
  const allIncomeCategories = useMemo(
    () => applyCategorySettings([...incomeCategories, ...customIncomeCategories], 'income', categoryColors, categoryOrder),
    [customIncomeCategories, categoryColors, categoryOrder]
  );
  const allAssetCategories = useMemo(
    () => applyCategorySettings([...assetCategories, ...customAssetCategories], 'asset', categoryColors, categoryOrder),
    [customAssetCategories, categoryColors, categoryOrder]
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
  const [dragCategory, setDragCategory] = useState<{ type: CategoryScope; id: string } | null>(null);

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
  const [settingsSection, setSettingsSection] = useState<'app' | 'data'>('app');
  const [privacyMode, setPrivacyMode] = useState(false);
  
  // Dashboard Chart states
  const [chartFilter, setChartFilter] = useState<'both' | 'income' | 'expense'>('both');
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);
  const [hoveredChartPos, setHoveredChartPos] = useState<{ x: number; y: number } | null>(null);
  const [summaryType, setSummaryType] = useState<'expense' | 'income' | 'asset'>('expense');

  // Filtering & Search states
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const yearlyData = useMemo(() => {
    const year = selectedMonth.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    return months.map((mo) => {
      const monthStr = `${year}-${mo}`;
      const monthlyTxs = transactions.filter((t) => t.date.startsWith(monthStr));
      const income = monthlyTxs.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expense = monthlyTxs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      return {
        month: `${Number(mo)}월`,
        income,
        expense,
      };
    });
  }, [transactions, selectedMonth]);

  // Calendar states
  const [calendarYear, setCalendarYear] = useState(() => Number(selectedMonth.slice(0, 4)));
  const [calendarMonth, setCalendarMonth] = useState(() => Number(selectedMonth.slice(5, 7)) - 1); // 0-11
  const [selectedDayData, setSelectedDayData] = useState<string | null>(null); // Date string YYYY-MM-DD
  const [modalTab, setModalTab] = useState<'view' | 'add'>('view');

  // Edit states
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [draggedAssetIndex, setDraggedAssetIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [isLedgerFormOpen, setIsLedgerFormOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
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
  const [customPaletteOpen, setCustomPaletteOpen] = useState(false);
  const [pickerHue, setPickerHue] = useState(200);
  const [pickerSat, setPickerSat] = useState(80);
  const [pickerLight, setPickerLight] = useState(50);
  const [assetSection, setAssetSection] = useState({ showAsset: true, showPlan: false, showRecurring: false });
  const [openPaletteKey, setOpenPaletteKey] = useState<string | null>(null);
  const [paletteDraftColor, setPaletteDraftColor] = useState('#64748b');

  const [isLoading, setIsLoading] = useState(true);
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

  // Sync state to LocalStorage and D1 (Debounced with Timestamp updates)
  useEffect(() => {
    const newUpdatedAt = Date.now();
    setUpdatedAt(newUpdatedAt);

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
      categoryOrder,
      hiddenCategories,
      recurringRules, 
      deletedRecurringTxs,
      newUpdatedAt
    );

    // If still fetching initial DB data, do NOT upload/overwrite database
    if (isLoading) {
      setRemoteSync((prev) => ({
        ...prev,
        status: 'checking',
        localUpdatedAt: newUpdatedAt,
        message: '서버 데이터 확인 중',
      }));
      return;
    }

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
      saveRemoteD1(
        transactions, 
        assets, 
        budget, 
        theme, 
        plans, 
        customExpenseCategories, 
        customIncomeCategories, 
        customAssetCategories,
        categoryColors,
        categoryOrder,
        hiddenCategories,
        recurringRules, 
        deletedRecurringTxs,
        newUpdatedAt
      )
        .then((res) => {
          if (!res.ok) throw new Error('remote save failed');
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
    categoryOrder,
    hiddenCategories,
    recurringRules, 
    deletedRecurringTxs, 
    isLoading
  ]);

  // Handle theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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

          const hasDbData = 
            (Array.isArray(data.transactions) && data.transactions.length > 0) ||
            (Array.isArray(data.assets) && data.assets.length > 0) ||
            (Array.isArray(data.customExpenseCategories) && data.customExpenseCategories.length > 0) ||
            (Array.isArray(data.customIncomeCategories) && data.customIncomeCategories.length > 0) ||
            (Array.isArray(data.customAssetCategories) && data.customAssetCategories.length > 0) ||
            (data.categoryColors && typeof data.categoryColors === 'object' && Object.keys(data.categoryColors).length > 0) ||
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
            Object.keys(storedData.categoryOrder || {}).length > 0 ||
            Object.keys(storedData.hiddenCategories || {}).length > 0 ||
            storedData.recurringRules.length > 0 ||
            storedData.deletedRecurringTxs.length > 0;

          if (!hasDbData && serverUpdatedAt === 0) {
            if (hasLocalData) {
              const newTime = Date.now();
              setUpdatedAt(newTime);
              void saveRemoteD1(
                storedData.transactions,
                storedData.assets,
                storedData.budget,
                storedData.theme,
                storedData.plans,
                storedData.customExpenseCategories,
                storedData.customIncomeCategories,
                storedData.customAssetCategories,
                storedData.categoryColors,
                storedData.categoryOrder,
                storedData.hiddenCategories,
                storedData.recurringRules,
                storedData.deletedRecurringTxs,
                newTime
              ).catch(() => undefined);
            } else {
              setTransactions([]);
              setAssets([]);
              setRecurringRules([]);
              setDeletedRecurringTxs([]);
              setPlans([]);
              setUpdatedAt(0);
            }
            return;
          }

          if (hasDbData && serverUpdatedAt >= localUpdatedAt) {
            // 원격 DB 데이터가 로컬보다 더 최신이거나 같음 -> DB 데이터 적용
            setTransactions(data.transactions || []);
            setAssets(data.assets || []);
            setBudget(data.budget ?? 1000000);
            setTheme(data.theme === 'dark' ? 'dark' : 'light');
            setCustomExpenseCategories(data.customExpenseCategories || []);
            setCustomIncomeCategories(data.customIncomeCategories || []);
            setCustomAssetCategories(data.customAssetCategories || []);
            setCategoryColors(data.categoryColors || {});
            setCategoryOrder(data.categoryOrder || {});
            setHiddenCategories(data.hiddenCategories || {});
            setRecurringRules(data.recurringRules || []);
            setDeletedRecurringTxs(data.deletedRecurringTxs || []);
            setUpdatedAt(serverUpdatedAt);
            if (Array.isArray(data.plans)) {
              setPlans(data.plans);
            }
            setRemoteSync({
              status: 'synced',
              localUpdatedAt: serverUpdatedAt,
              remoteUpdatedAt: serverUpdatedAt,
              checkedAt: Date.now(),
              message: '서버 데이터 적용됨',
            });
          } else {
            // 로컬 데이터가 더 최신이거나 DB가 완전히 비어있음
            if (
              transactions.length > 0 ||
              assets.length > 0 ||
              customExpenseCategories.length > 0 ||
              customIncomeCategories.length > 0 ||
              customAssetCategories.length > 0 ||
              Object.keys(categoryColors).length > 0 ||
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
                categoryOrder,
                hiddenCategories,
                recurringRules,
                deletedRecurringTxs,
                newTime
              )
                .then((res) => {
                  if (!res.ok) throw new Error('remote save failed');
                  setRemoteSync({
                    status: 'synced',
                    localUpdatedAt: newTime,
                    remoteUpdatedAt: newTime,
                    checkedAt: Date.now(),
                    message: '로컬 최신 데이터 서버 반영됨',
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
          checkedAt: Date.now(),
          message: '서버 확인 실패 - 로컬 데이터 사용 중',
        });
      })
      .finally(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
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
              amount: rule.amount,
              title: rule.title,
              category: rule.category,
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
        .sort((a, b) => a.date.localeCompare(b.date)),
    [transactions, selectedMonth],
  );

  const todayStr = getToday();
  const monthlyExpenses = monthlyTransactions.filter((transaction) => transaction.type === 'expense' && transaction.date <= todayStr);
  const monthlyIncomes = monthlyTransactions.filter((transaction) => transaction.type === 'income' && transaction.date <= todayStr);
  const expenseTotal = sumAmount(monthlyExpenses);
  const incomeTotal = sumAmount(monthlyIncomes);
  const assetTotal = sumAmount(assets);
  
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

  // Plans derived values
  const plannedExpenseTotal = useMemo(
    () => plans.filter(p => p.type === 'expense').reduce((sum, p) => sum + p.plannedAmount, 0),
    [plans]
  );
  const plannedIncomeTotal = useMemo(
    () => plans.filter(p => p.type === 'income').reduce((sum, p) => sum + p.plannedAmount, 0),
    [plans]
  );

  // Budget calculations
  const budgetPercent = budget > 0 ? Math.min(Math.round((expenseTotal / budget) * 100), 200) : 0;
  const budgetRemaining = budget - expenseTotal;
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

  const assetSummary = useMemo(() => {
    return assets.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amount;
      return acc;
    }, {});
  }, [assets]);

  const expenseFlowSegments = useMemo(
    () => buildCategorySegments(activeExpenseCategories, expenseSummary),
    [activeExpenseCategories, expenseSummary]
  );

  const incomeFlowSegments = useMemo(
    () => buildCategorySegments(activeIncomeCategories, incomeSummary),
    [activeIncomeCategories, incomeSummary]
  );

  const assetFlowSegments = useMemo(
    () => buildCategorySegments(activeAssetCategories, assetSummary),
    [activeAssetCategories, assetSummary]
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
  function handleAddTransaction(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
    const transactionMonth = transaction.date.slice(0, 7);
    if (transactionMonth !== selectedMonth) {
      setSelectedMonth(transactionMonth);
    }
  }

  function handleDeleteTransaction(id: string) {
    setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
    if (id.startsWith('rec_')) {
      setDeletedRecurringTxs((prev) => [...prev, id]);
    }
  }

  function handleUpdateTransaction(oldId: string, updated: Transaction) {
    setTransactions((prev) => {
      const filtered = prev.filter((t) => t.id !== oldId);
      return [updated, ...filtered];
    });
    setEditingTransaction(null);
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
      prev.map((r) => (r.id === id ? { ...r, endMonth: selectedMonth } : r))
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
      prev.map((r) => (r.id === ruleId ? { ...r, endMonth: txMonth } : r))
    );
    showNotice(`${txMonth}월까지 유지되고 다음 달부터 중단됩니다.`, '정기 기록 중지', 'success');
  }

  function handleDeleteRecurringRule(id: string) {
    requestConfirm({
      title: '정기 기록 삭제',
      message: '이 정기 기록 규칙을 삭제할까요? 이미 기록된 거래 내역은 삭제되지 않습니다.',
      confirmLabel: '삭제',
      tone: 'danger',
      onConfirm: () => {
        setRecurringRules((prev) => prev.filter((r) => r.id !== id));
        showNotice('정기 기록 규칙을 삭제했습니다.', '삭제 완료', 'success');
      },
    });
  }

  function handleAddAsset(asset: AssetItem) {
    setAssets((prev) => [asset, ...prev]);
  }

  function handleUpdateAsset(updated: AssetItem) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingAsset(null);
  }

  function handleDeleteAsset(id: string) {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }

  function handleAssetDragStart(e: React.DragEvent, index: number) {
    setDraggedAssetIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }

  function handleAssetDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
  }

  function handleAssetDragEnter(targetIndex: number) {
    if (draggedAssetIndex === null || draggedAssetIndex === targetIndex) return;

    const newAssets = [...assets];
    const draggedItem = newAssets[draggedAssetIndex];
    newAssets.splice(draggedAssetIndex, 1);
    newAssets.splice(targetIndex, 0, draggedItem);

    setAssets(newAssets);
    setDraggedAssetIndex(targetIndex);
  }

  function handleAssetDragEnd() {
    setDraggedAssetIndex(null);
    setDragOverIndex(null);

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
      categoryOrder,
      hiddenCategories,
      recurringRules,
      deletedRecurringTxs,
      newTime
    ).catch(() => undefined);
  }

  function handleAssetDrop(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleCategoryColorChange(type: CategoryScope, id: string, color: string) {
    setCategoryColors((prev) => ({
      ...prev,
      [getCategoryColorKey(type, id)]: color,
    }));
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
    requestConfirm({
      title: '카테고리 삭제',
      message: `'${label}' 카테고리를 목록에서 제거할까요? 기존 거래와 자산 기록은 유지됩니다.`,
      confirmLabel: '삭제',
      tone: 'danger',
      onConfirm: () => {
        setHiddenCategories((prev) => ({ ...prev, [getCategoryColorKey(type, id)]: true }));
        showNotice(`'${label}' 카테고리를 숨겼습니다.`, '삭제 완료', 'success');
      },
    });
  }

  function handleCategoryDrop(event: DragEvent<HTMLDivElement>, type: CategoryScope, targetId: string, categories: CategoryOption[]) {
    event.preventDefault();
    if (!dragCategory || dragCategory.type !== type || dragCategory.id === targetId) return;

    const visibleIds = categories.map((category) => category.id);
    const nextIds = visibleIds.filter((id) => id !== dragCategory.id);
    const targetIndex = nextIds.indexOf(targetId);
    nextIds.splice(targetIndex, 0, dragCategory.id);

    setCategoryOrder((prev) => ({ ...prev, [type]: nextIds }));
    setDragCategory(null);
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
        [],
        [],
        newTime
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

    // 35칸(5주)을 초과하는 달의 경우 시작 요일을 강제로 일요일(0)로 당겨 5행 수용 보장
    const firstDayOfWeek = (rawFirstDayOfWeek + lastDate > 35) ? 0 : rawFirstDayOfWeek;
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

    // 무조건 5행(35일)으로 픽스하여 남은 공간 채움
    const remaining = 35 - days.length;
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
      } else {
        acc[t.date].expense += t.amount;
      }
      return acc;
    }, {});
  }, [transactions]);

  function handleCalendarPrev() {
    if (calendarMonth === 0) {
      setCalendarYear((prev) => prev - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((prev) => prev - 1);
    }
  }

  function handleCalendarNext() {
    if (calendarMonth === 11) {
      setCalendarYear((prev) => prev + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((prev) => prev + 1);
    }
  }

  // Backup CSV Export
  function exportCSV() {
    let csv = 'SECTION,TYPE/CATEGORY,DATE/MEMO,AMOUNT,TITLE,EXTRA\n';
    transactions.forEach((t) => {
      csv += `T,${t.id},${t.type},${t.date},${t.amount},"${t.title.replace(/"/g, '""')}",${t.category}\n`;
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

  async function verifyRemoteSync(showToast = true) {
    setRemoteSync((prev) => ({
      ...prev,
      status: 'checking',
      message: '서버 저장 상태 확인 중',
    }));

    try {
      const response = await fetch(`/api/data?check=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('remote check failed');
      const data = await response.json();
      const remoteUpdatedAt = Number(data.updatedAt) || 0;
      const isSynced = remoteUpdatedAt >= (updatedAt || 0);
      setRemoteSync({
        status: isSynced ? 'synced' : 'stale',
        localUpdatedAt: updatedAt || 0,
        remoteUpdatedAt,
        checkedAt: Date.now(),
        message: isSynced ? '서버와 로컬이 일치함' : '서버 반영 대기 또는 불일치',
      });
      if (showToast) {
        showNotice(
          isSynced ? '현재 데이터가 서버에 반영되어 있습니다.' : '서버 데이터가 로컬보다 오래되었습니다. 잠시 뒤 다시 확인하세요.',
          isSynced ? '저장 확인' : '저장 대기',
          isSynced ? 'success' : 'warning'
        );
      }
    } catch {
      setRemoteSync({
        status: 'error',
        localUpdatedAt: updatedAt || 0,
        checkedAt: Date.now(),
        message: '서버 확인 실패',
      });
      if (showToast) {
        showNotice('서버 저장 상태를 확인하지 못했습니다.', '저장 확인 실패', 'error');
      }
    }
  }

  function exportFullCSV() {
    const backupSettings = {
      version: 2,
      exportedAt: Date.now(),
      budget,
      theme,
      customExpenseCategories,
      customIncomeCategories,
      customAssetCategories,
      categoryColors,
      categoryOrder,
      hiddenCategories,
      recurringRules,
      deletedRecurringTxs,
      updatedAt,
    };

    const rows = [
      createCSVRow(['SECTION', 'ID', 'TYPE_OR_CATEGORY', 'DATE_OR_MEMO', 'AMOUNT', 'TITLE', 'EXTRA', 'JSON']),
      createCSVRow(['SETTINGS', 'mywallet-v2', '', '', '', '', '', JSON.stringify(backupSettings)]),
      ...transactions.map((t) => createCSVRow(['T', t.id, t.type, t.date, t.amount, t.title, t.category, t.recurringRuleId ?? ''])),
      ...assets.map((a) => createCSVRow(['A', a.id, a.category, a.amount, a.memo, '', '', ''])),
      ...plans.map((p) => createCSVRow(['P', p.category, p.type, p.plannedAmount, '', '', '', ''])),
      createCSVRow(['BUDGET', budget, '', '', '', '', '', '']),
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
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
        const newTransactions: Transaction[] = [];
        const newAssets: AssetItem[] = [];
        const newPlans: CategoryPlan[] = [];
        let importedSettings: Partial<{
          budget: number;
          theme: 'light' | 'dark';
          customExpenseCategories: CategoryOption[];
          customIncomeCategories: CategoryOption[];
          customAssetCategories: CategoryOption[];
          categoryColors: CategoryColorMap;
          categoryOrder: CategoryOrderMap;
          hiddenCategories: HiddenCategoryMap;
          recurringRules: RecurringRule[];
          deletedRecurringTxs: string[];
        }> | null = null;
        let newBudget = budget;

        lines.forEach((line) => {
          const cells = parseCSVLine(line);
          if (cells[0] === 'SECTION') return;
          if (cells[0] === 'T') {
            newTransactions.push({
              id: cells[1],
              type: cells[2] as TransactionType,
              date: cells[3],
              amount: Number(cells[4]),
              title: cells[5],
              category: cells[6],
              recurringRuleId: cells[7] || null,
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
          } else if (cells[0] === 'SETTINGS') {
            const rawJson = cells[7] || cells[1] || '';
            if (rawJson) {
              importedSettings = JSON.parse(rawJson);
              newBudget = Number(importedSettings?.budget) || newBudget;
            }
          }
        });

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
              setTheme(importedSettings?.theme === 'dark' ? 'dark' : 'light');
              setCustomExpenseCategories(Array.isArray(importedSettings?.customExpenseCategories) ? importedSettings.customExpenseCategories : []);
              setCustomIncomeCategories(Array.isArray(importedSettings?.customIncomeCategories) ? importedSettings.customIncomeCategories : []);
              setCustomAssetCategories(Array.isArray(importedSettings?.customAssetCategories) ? importedSettings.customAssetCategories : []);
              setCategoryColors(importedSettings?.categoryColors && typeof importedSettings.categoryColors === 'object' ? importedSettings.categoryColors : {});
              setCategoryOrder(importedSettings?.categoryOrder && typeof importedSettings.categoryOrder === 'object' ? importedSettings.categoryOrder : {});
              setHiddenCategories(importedSettings?.hiddenCategories && typeof importedSettings.hiddenCategories === 'object' ? importedSettings.hiddenCategories : {});
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
  const displayCurrency = (value: number) => (privacyMode ? '₩••••••' : formatCurrency(value));
  const displayCalendarAmount = (value: number) => (privacyMode ? '•••' : formatMobileCalendarAmount(value));

  return (
    <main className="app-shell">
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'radial-gradient(circle at center, #0f172a 0%, #030712 100%)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px'
        }}>
          {/* Logo container with pulsing animation */}
          <div style={{
            width: '110px',
            height: '110px',
            animation: 'logoPulse 2s infinite ease-in-out'
          }}>
            <MyWalletLogo style={{ width: '100%', height: '100%' }} />
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'center'
          }}>
            <h1 style={{
              margin: 0,
              fontSize: '1.9rem',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              <span style={{ color: '#ffffff' }}>My</span>
              <span style={{ color: 'var(--primary)' }}>Wallet</span>
            </h1>
          </div>

          {/* Premium Progress Bar */}
          <div style={{
            width: '220px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            overflow: 'hidden',
            marginTop: '12px'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, var(--primary) 0%, #22d3ee 100%)',
              borderRadius: '10px',
              animation: 'progressFill 2s infinite linear'
            }} />
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
              <strong>메인</strong>
            </a>
            <a href="#asset" className={activeTab === 'asset' ? 'active' : ''} onClick={() => setActiveTab('asset')}>
              <span><AppIcon name="asset" /></span>
              <strong>자산</strong>
            </a>
            <a href="#plan" className={activeTab === 'plan' ? 'active' : ''} onClick={() => setActiveTab('plan')}>
              <span><AppIcon name="plan" /></span>
              <strong>계획</strong>
            </a>
            <a href="#calendar" className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}>
              <span><AppIcon name="calendar" /></span>
              <strong>달력</strong>
            </a>
            <a href="#ledger" className={activeTab === 'ledger' ? 'active' : ''} onClick={() => setActiveTab('ledger')}>
              <span><AppIcon name="ledger" /></span>
              <strong>장부</strong>
            </a>
          </nav>
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
          <div className={`sync-mini-indicator ${topSyncStatus}`} title={!isOnline ? '인터넷 연결 없음' : remoteSync.message}>
            <span aria-hidden="true" />
          </div>
          <button
            type="button"
            className={`privacy-toggle ${privacyMode ? 'active' : ''}`}
            onClick={() => setPrivacyMode((prev) => !prev)}
            title={privacyMode ? '금액 표시' : '금액 숨기기'}
            aria-pressed={privacyMode}
          >
            <AppIcon name={privacyMode ? 'eyeOff' : 'eye'} size={18} />
          </button>
          {/* 공통 월 선택 영역 */}
          <div className="month-picker-wrap">
            <div className="month-picker-display">
              {selectedMonth.replace('-', '.')} <AppIcon name="calendar" size={16} />
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
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
              <article className="summary-card budget-status">
                <span>설정된 한달 예산</span>
                <strong>{displayCurrency(budget)}</strong>
                <small>예산 대비 {budgetPercent}% 소진 중</small>
              </article>
              <article className="summary-card asset">
                <span>총 관리 자산</span>
                <strong>{displayCurrency(assetTotal)}</strong>
                <small>현금, 투자 자산 등 누적 금액</small>
              </article>
            </section>




            {/* 자산 분배 현황 원형 그래프 패널 */}
            <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '14px 16px' }}>
              <div className="panel-header" style={{ marginBottom: '0px' }}>
                <div>
                  <p className="eyebrow">Asset Allocation</p>
                  <h2 style={{ margin: 0 }}>자산 분배 현황</h2>
                </div>
              </div>

              <div className="asset-donut-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0', padding: '0' }}>
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
                          const actualPercent = assetTotal > 0 ? (s.value / assetTotal) * 100 : 0;
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
            <section className="glass-panel" style={{ position: 'relative', paddingLeft: '8px', paddingRight: '8px', overflow: 'visible', zIndex: 10 }}>
              <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <p className="eyebrow">Annual Analytics</p>
                  <h2 style={{ margin: 0 }}>{selectedMonth.slice(0, 4)}년 연간 수입 · 지출 추이</h2>
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
                    전체 비교
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
                    수입만
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
                    지출만
                  </button>
                </div>
              </div>

              {/* 연간 차트 영역 */}
              <div style={{ width: '100%', position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: '100%', position: 'relative' }}>
                  <svg width="100%" height="240" viewBox="0 0 520 240" onClick={() => setHoveredChartIndex(null)} style={{ display: 'block', overflow: 'visible' }}>
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
                    </defs>

                    {/* Y축 그리드 라인 & 라벨 */}
                    {(() => {
                      const maxVal = Math.max(
                        ...yearlyData.map(d => {
                          if (chartFilter === 'income') return d.income;
                          if (chartFilter === 'expense') return d.expense;
                          return Math.max(d.income, d.expense);
                        }),
                        100000
                      );

                      // 100만 원 이상일 때는 100만 단위 배수, 미만일 때는 10만 단위 배수로 스텝 사이즈 결정
                      let stepSize = 1000000;
                      if (maxVal < 1000000) {
                        stepSize = 100000; // 10만 원 단위
                      } else if (maxVal > 10000000) {
                        stepSize = 5000000; // 1000만 원 초과 시 500만 원 단위
                      } else if (maxVal > 5000000) {
                        stepSize = 2000000; // 500만 원 초과 시 200만 원 단위
                      }
                      
                      const chartMaxY = Math.ceil(maxVal / stepSize) * stepSize;
                      const scale = 150 / chartMaxY;

                      const gridValues = [];
                      for (let val = 0; val <= chartMaxY; val += stepSize) {
                        gridValues.push(val);
                      }

                      return (
                        <g>
                          {gridValues.map((val, idx) => {
                            const y = 190 - (val / chartMaxY) * 150; // 차트 높이 기준 Y 좌표 (y=40 ~ y=190)
                            return (
                              <g key={idx}>
                                <line 
                                  x1="28" 
                                  y1={y} 
                                  x2="515" 
                                  y2={y} 
                                  stroke="var(--border-card)" 
                                  strokeDasharray="4 4" 
                                  strokeWidth="1" 
                                  opacity="0.5"
                                />
                                <text 
                                  x="22" 
                                  y={y + 4} 
                                  textAnchor="end" 
                                  fontSize="9.5" 
                                  fontWeight="600"
                                  fill="var(--text-secondary)"
                                >
                                  {val === 0 
                                    ? '0' 
                                    : val >= 100000000 
                                    ? `${(val / 100000000).toFixed(1)}억` 
                                    : val >= 10000 
                                    ? `${Math.round(val / 10000)}만` 
                                    : `${val}`
                                  }
                                </text>
                              </g>
                            );
                          })}

                          {/* X축 기본 라인 */}
                          <line x1="28" y1="190" x2="515" y2="190" stroke="var(--border-card)" strokeWidth="1.5" />

                          {/* 12개월 바 차트 렌더 */}
                          {yearlyData.map((d, idx) => {
                            const xCenter = 28 + idx * 40 + 20; // X축 마진을 28px까지 바짝 밀고 간격을 40px로 획기적 확장
                            
                            const incHeight = d.income * scale;
                            const expHeight = d.expense * scale;
                            
                            const showIncome = chartFilter === 'both' || chartFilter === 'income';
                            const showExpense = chartFilter === 'both' || chartFilter === 'expense';

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
                                  x={xCenter - 20} 
                                  y="20" 
                                  width="40" 
                                  height="180" 
                                  fill="transparent"
                                />

                                {/* 수입 막대 */}
                                {showIncome && (
                                  <rect
                                    x={chartFilter === 'both' ? xCenter - 12 : xCenter - 9}
                                    y={190 - incHeight}
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
                                    y={190 - expHeight}
                                    width={chartFilter === 'both' ? '10' : '18'}
                                    height={Math.max(expHeight, 2)}
                                    rx="3"
                                    ry="3"
                                    fill="url(#chart-expense-grad)"
                                    opacity={hoveredChartIndex === null || hoveredChartIndex === idx ? 1 : 0.45}
                                    style={{ transition: 'all 0.2s ease-in-out' }}
                                  />
                                )}

                                {/* X축 월 이름 라벨 */}
                                <text
                                  x={xCenter}
                                  y="210"
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

              {/* 실시간 대화형 오버레이 팝업 (50% 축소, -32px 하강 월 라벨 노출, 28%~72% 슬라이딩 보정) */}
              {hoveredChartIndex !== null && (
                <div style={{
                  position: 'absolute',
                  left: `calc(30% + ${(hoveredChartIndex / 11) * 40}%)`, /* 1월은 우측(30%), 12월은 좌측(70%) 쪽으로 편향 보정 */
                  bottom: '-32px', /* 월 표시 아래로 완전히 내려 가리지 않게 피신 */
                  transform: 'translateX(-50%)',
                  width: '52%', /* 획기적으로 50% 수준으로 축소 */
                  minWidth: '176px',
                  maxWidth: '230px',
                  background: 'rgba(15, 23, 42, 0.96)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  color: '#ffffff',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  fontSize: '0.76rem',
                  zIndex: 1000, /* 라운드 박스를 완전히 넘어 앞으로 튀어나오게 처리 */
                  pointerEvents: 'none',
                  boxShadow: '0 6px 20px rgba(15, 23, 42, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  boxSizing: 'border-box',
                  transition: 'left 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)' /* 팝업이 기둥 따라 부드럽게 좌우로 미끄러짐 */
                }}>
                  <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: '#f1f5f9', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '3px' }}>
                    {selectedMonth.slice(0, 4)}년 {yearlyData[hoveredChartIndex].month} 상세
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                    {chartFilter === 'both' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.2)', paddingTop: '2px', marginTop: '2px' }}>
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

            {/* Category summary table */}
            <section className="glass-panel summary-table-grid" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="panel-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '12px', marginBottom: '8px', gridColumn: '1 / -1' }}>
                <div>
                  <p className="eyebrow">Category Summary</p>
                  <h2 style={{ margin: 0, fontSize: '0.94rem', whiteSpace: 'nowrap' }}>카테고리별 합계 요약</h2>
                </div>
                
                {/* 드롭다운 셀렉트 박스 */}
                <select 
                  value={summaryType} 
                  onChange={(e) => setSummaryType(e.target.value as 'expense' | 'income' | 'asset')}
                  style={{
                    padding: '4px 20px 4px 6px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-input)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontWeight: 'bold',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '78px',
                    width: '78px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <option value="expense">🔴 지출</option>
                  <option value="income">🔵 수입</option>
                  <option value="asset">🟢 자산</option>
                </select>
              </div>

              {/* 선택된 요약 테이블만 렌더링 */}
              <div style={{ width: '100%', gridColumn: '1 / -1' }}>
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
              <h2>
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
                        <span className="calendar-value-badge income">+{displayCalendarAmount(daySums.income)}</span>
                      )}
                      {daySums?.expense > 0 && (
                        <span className="calendar-value-badge expense">-{displayCalendarAmount(daySums.expense)}</span>
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
          <section className="glass-panel">
            <div className="ledger-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p className="eyebrow">Ledger List</p>
                <h2 style={{ margin: 0 }}>거래 장부 목록</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span className="record-count" style={{ margin: 0 }}>{filteredLedgerTransactions.length}건 검색됨</span>
              </div>
            </div>
              
              <div className="ledger-filters">
                <input
                  type="text"
                  placeholder="제목 또는 카테고리 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="all">모든 카테고리</option>
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

            <div className="split-ledger">
              <TransactionListTable
                title="지출 내역"
                type="expense"
                items={filteredLedgerTransactions.filter((t) => t.type === 'expense')}
                onDelete={handleDeleteTransaction}
                onEdit={setEditingTransaction}
                categories={allExpenseCategories}
                onStopRecurring={handleStopRecurringFromTx}
                formatMoney={displayCurrency}
              />
              <TransactionListTable
                title="수입 내역"
                type="income"
                items={filteredLedgerTransactions.filter((t) => t.type === 'income')}
                onDelete={handleDeleteTransaction}
                onEdit={setEditingTransaction}
                categories={allIncomeCategories}
                onStopRecurring={handleStopRecurringFromTx}
                formatMoney={displayCurrency}
              />
            </div>
          </section>
        )}

        {/* 정기 지출 규칙 관리 영역 외부 분리 */}
        {activeTab === 'ledger' && (
          <section className="glass-panel" style={{ marginTop: '24px' }}>
            <div className="panel-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔄</span> 정기 지출
                </h3>
              </div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                등록된 규칙: {recurringRules.length}개
              </strong>
            </div>

            <div className="ledger-table-scroll">
              <table className="ledger-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-card)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>구분</th>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>매달 예정일</th>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>카테고리</th>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>내용</th>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>금액</th>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>시작 ~ 종료</th>
                    <th style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringRules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-cell" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                        등록된 정기 반복 규칙이 없습니다. 장부 탭이나 달력 모달의 거래 등록 양식에서 [매달 정기 기록으로 등록]을 체크하고 추가해보세요.
                      </td>
                    </tr>
                  ) : (
                    recurringRules.map((rule) => {
                      const isStopped = !!rule.endMonth;
                      const ruleTypeLabel = rule.type === 'expense' ? '지출 🔴' : '수입 🔵';
                      const catList = rule.type === 'expense' ? allExpenseCategories : allIncomeCategories;
                      
                      return (
                        <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-card)', opacity: isStopped ? 0.6 : 1 }}>
                          <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{ruleTypeLabel}</td>
                          <td style={{ padding: '12px 8px' }}>매월 {rule.day}일</td>
                          <td style={{ padding: '12px 8px' }}><CategoryBadge categories={catList} idOrLabel={rule.category} /></td>
                          <td style={{ padding: '12px 8px' }}>{rule.title}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold' }}>{displayCurrency(rule.amount)}</td>
                          <td style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {rule.startMonth} ~ {rule.endMonth ? `🏁 ${rule.endMonth} 끊김` : '진행중'}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                              {!isStopped && (
                                <button
                                  type="button"
                                  className="primary-button"
                                  style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', marginTop: 0, width: 'auto' }}
                                  onClick={() => {
                                    const year = Number(selectedMonth.slice(0, 4));
                                    const month = Number(selectedMonth.slice(5, 7));
                                    const lastDay = new Date(year, month, 0).getDate();
                                    const targetDay = Math.min(rule.day, lastDay);
                                    const dateStr = `${selectedMonth}-${String(targetDay).padStart(2, '0')}`;

                                    const recurringTxId = `rec_${rule.id}_${selectedMonth}`;
                                    const isDuplicate = transactions.some(
                                      (t) => t.id === recurringTxId || (
                                        t.date === dateStr && t.recurringRuleId === rule.id
                                      )
                                    );
                                      const addRecurringTransaction = () => {
                                        handleAddTransaction({
                                          id: recurringTxId,
                                          type: rule.type,
                                          date: dateStr,
                                          amount: rule.amount,
                                          title: rule.title,
                                          category: rule.category,
                                          recurringRuleId: rule.id,
                                        });
                                      showNotice(`${dateStr} 자로 '${rule.title}' 거래가 등록되었습니다.`, '거래 등록 완료', 'success');
                                    };

                                    if (isDuplicate) {
                                      requestConfirm({
                                        title: '중복 거래 확인',
                                        message: '동일한 예정일에 유사한 정기 거래가 이미 있습니다. 추가로 등록할까요?',
                                        confirmLabel: '추가 등록',
                                        onConfirm: addRecurringTransaction,
                                      });
                                      return;
                                    }

                                    addRecurringTransaction();
                                  }}
                                >
                                  ⚡ 거래 등록
                                </button>
                              )}
                              {!isStopped ? (
                                <button
                                  type="button"
                                  className="delete-btn-sm"
                                  style={{ background: 'var(--color-expense)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem' }}
                                  onClick={() => handleStopRecurringRule(rule.id)}
                                >
                                  🛑 끊기
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-expense)', fontWeight: 'bold' }}>끊김</span>
                              )}
                              <button
                                type="button"
                                className="delete-btn-sm"
                                style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem' }}
                                onClick={() => handleDeleteRecurringRule(rule.id)}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
                                              {/* Assets Portfolio Tab */}
        {activeTab === 'asset' && (
          <>
            {/* 자산 탭 상단 헤더 및 등록 제어 단추 */}
            <div className="tab-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, marginBottom: '4px' }}>자산 현황</h1>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <strong className="section-title-icon" style={{ fontSize: '1.05rem', color: 'var(--color-asset)' }}><AppIcon name="asset" size={18} /> 자산 총액: {displayCurrency(assetTotal)}</strong>
                </div>
              </div>
            </div>

            {/* 고정 카드 그리드 영역 */}
            <div className="asset-accordion-group" style={{ display: 'grid', gap: '12px' }}>
              
              {/* 1. [ 자산 현황 ] 고정 카드 */}
              <div className="glass-panel" style={{ padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                  <AppIcon name="asset" size={19} /> 자산 목록
                </h3>
                <div className="asset-table-list" style={{ display: 'grid', gap: '3px' }}>
                  {assets.length === 0 ? (
                    <p className="empty-note" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                      등록된 자산 항목이 없습니다. 우측 상단의 [자산 등록] 단추를 통해 자산을 추가해보세요.
                    </p>
                  ) : (
                    assets.map((asset, index) => {
                      const isDragging = draggedAssetIndex === index;
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
                      
                      if (isDragging) {
                        return (
                          <div
                            key={asset.id}
                            data-asset-id={asset.id}
                            onDragOver={(e) => handleAssetDragOver(e, index)}
                            onDragEnter={() => handleAssetDragEnter(index)}
                            onDragEnd={handleAssetDragEnd}
                            onDrop={handleAssetDrop}
                            style={{
                              ...baseRowStyle,
                              border: '2px dashed var(--primary)',
                              background: 'rgba(2, 132, 199, 0.08)',
                              opacity: 0.65,
                            }}
                          >
                            {/* 실제 Row와 100% 동일한 컨텐츠이지만 visibility: 'hidden'을 주어 공간(높이/너비)을 완벽 정밀 점유! */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', visibility: 'hidden' }}>
                              <span style={{ fontSize: '1.1rem' }}>⠿</span>
                              <CategoryBadge categories={allAssetCategories} idOrLabel={asset.category} />
                              <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{displayCurrency(asset.amount)}</span>
                              {asset.memo && (
                                <span style={{ fontSize: '0.82rem' }}>({asset.memo})</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', visibility: 'hidden' }}>
                              <button type="button" className="edit-btn" style={{ padding: '4px 8px', fontSize: '0.78rem', borderRadius: '6px' }}>수정</button>
                              <button type="button" className="delete-btn-sm" style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}>삭제</button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={asset.id}
                          data-asset-id={asset.id}
                          draggable
                          onDragStart={(e) => handleAssetDragStart(e, index)}
                          onDragOver={(e) => handleAssetDragOver(e, index)}
                          onDragEnter={() => handleAssetDragEnter(index)}
                          onDragEnd={handleAssetDragEnd}
                          onDrop={handleAssetDrop}
                          onMouseEnter={() => setHoveredRowIndex(index)}
                          onMouseLeave={() => setHoveredRowIndex(null)}
                          style={{
                            ...baseRowStyle,
                            cursor: 'grab',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-primary)', opacity: isHovered ? 0.8 : 0.45, cursor: 'grab', fontSize: '1.1rem', userSelect: 'none', marginRight: '4px' }}>⠿</span>
                            <CategoryBadge categories={allAssetCategories} idOrLabel={asset.category} />
                            <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{displayCurrency(asset.amount)}</span>
                            {asset.memo && (
                              <span style={{ color: '#52525b', fontSize: '0.82rem', marginLeft: '8px' }}>({asset.memo})</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="edit-btn"
                              style={{ padding: '4px 8px', fontSize: '0.78rem', borderRadius: '6px' }}
                              onClick={() => {
                                setEditingAsset(asset); // 수정 모드 전환
                                setIsAssetModalOpen(true);
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className="delete-btn-sm"
                              style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}
                              onClick={() => handleDeleteAsset(asset.id)}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
                </div>
              </div>

              {/* 자산 카테고리 설정 카드 (이식 완료) */}
              <article className="glass-panel managed-category-card managed-category-card-asset" data-category-scope="asset" style={{ width: '100%', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AppIcon name="settings" size={19} /> 등록된 자산 카테고리
                  </span>
                  <b style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{activeAssetCategories.length}개</b>
                </h3>
                <div className="category-table" style={{ padding: '0', display: 'grid', gap: '6px' }}>
                      {activeAssetCategories.map((category) => {
                        const color = category.color || '#64748b';
                        const paletteKey = getCategoryColorKey('asset', category.id);
                        const isOpen = openPaletteKey === paletteKey;

                        return (
                          <div
                            key={`asset-${category.id}`}
                            data-category-id={category.id}
                            data-category-scope="asset"
                            className={`category-row ${dragCategory?.type === 'asset' && dragCategory.id === category.id ? 'dragging' : ''}`}
                            draggable
                            onDragStart={() => setDragCategory({ type: 'asset', id: category.id })}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleCategoryDrop(event, 'asset', category.id, activeAssetCategories)}
                            onDragEnd={() => setDragCategory(null)}
                            style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', transition: 'all 0.15s ease' }}
                          >
                            <span className="category-drag-handle" style={{ cursor: 'grab', marginRight: '12px', color: 'var(--text-secondary)', userSelect: 'none' }}>⋮⋮</span>
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
                              <CategoryBadge categories={activeAssetCategories} idOrLabel={category.id} />
                            </div>
                            <button
                              type="button"
                              className="category-row-action"
                              style={{ background: 'transparent', border: 'none', color: 'var(--color-expense)', cursor: 'pointer', fontSize: '0.85rem' }}
                              onClick={() => handleArchiveCategory('asset', category.id, category.label)}
                            >
                              삭제
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </article>

              {/* 하단바 가림 방지 공백 */}
              <div style={{ height: '80px' }} />
            </div>
          </>
        )}

        {/* Plans Tab */}
        {activeTab === 'plan' && (
          <>
            <div className="tab-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>월간 계획 설정</h1>
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
              </div>
            </div>

            {/* 계획 카테고리 설정 카드 (이식 완료) */}
            <div className="managed-category-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '0px' }}>
                  
                  {/* 지출 카테고리 목록 */}
                  <article className="glass-panel managed-category-card managed-category-card-plan" data-category-scope="expense" style={{ padding: '16px', marginBottom: '0px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AppIcon name="settings" size={19} /> 지출 카테고리 목록
                      </span>
                      <b style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{activeExpenseCategories.length}개</b>
                    </h3>
                    <div className="category-table" style={{ padding: '0', display: 'grid', gap: '6px' }}>
                      {activeExpenseCategories.map((category) => {
                        const color = category.color || '#64748b';
                        const paletteKey = getCategoryColorKey('expense', category.id);
                        const isOpen = openPaletteKey === paletteKey;

                        return (
                          <div
                            key={`expense-${category.id}`}
                            data-category-id={category.id}
                            data-category-scope="expense"
                            className={`category-row ${dragCategory?.type === 'expense' && dragCategory.id === category.id ? 'dragging' : ''}`}
                            draggable
                            onDragStart={() => setDragCategory({ type: 'expense', id: category.id })}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleCategoryDrop(event, 'expense', category.id, activeExpenseCategories)}
                            onDragEnd={() => setDragCategory(null)}
                            style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', transition: 'all 0.15s ease' }}
                          >
                            <span className="category-drag-handle" style={{ cursor: 'grab', marginRight: '12px', color: 'var(--text-secondary)', userSelect: 'none' }}>⋮⋮</span>
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
                              <CategoryBadge categories={activeExpenseCategories} idOrLabel={category.id} />
                            </div>
                            <button
                              type="button"
                              className="category-row-action"
                              style={{ background: 'transparent', border: 'none', color: 'var(--color-expense)', cursor: 'pointer', fontSize: '0.85rem' }}
                              onClick={() => handleArchiveCategory('expense', category.id, category.label)}
                            >
                              삭제
                            </button>
                          </div>
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
                      <b style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{activeIncomeCategories.length}개</b>
                    </h3>
                    <div className="category-table" style={{ padding: '0', display: 'grid', gap: '6px' }}>
                      {activeIncomeCategories.map((category) => {
                        const color = category.color || '#64748b';
                        const paletteKey = getCategoryColorKey('income', category.id);
                        const isOpen = openPaletteKey === paletteKey;

                        return (
                          <div
                            key={`income-${category.id}`}
                            data-category-id={category.id}
                            data-category-scope="income"
                            className={`category-row ${dragCategory?.type === 'income' && dragCategory.id === category.id ? 'dragging' : ''}`}
                            draggable
                            onDragStart={() => setDragCategory({ type: 'income', id: category.id })}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleCategoryDrop(event, 'income', category.id, activeIncomeCategories)}
                            onDragEnd={() => setDragCategory(null)}
                            style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', transition: 'all 0.15s ease' }}
                          >
                            <span className="category-drag-handle" style={{ cursor: 'grab', marginRight: '12px', color: 'var(--text-secondary)', userSelect: 'none' }}>⋮⋮</span>
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
                              <CategoryBadge categories={activeIncomeCategories} idOrLabel={category.id} />
                            </div>
                            <button
                              type="button"
                              className="category-row-action"
                              style={{ background: 'transparent', border: 'none', color: 'var(--color-expense)', cursor: 'pointer', fontSize: '0.85rem' }}
                              onClick={() => handleArchiveCategory('income', category.id, category.label)}
                            >
                              삭제
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </article>
              </div>

              {/* 하단바 가림 방지 공백 */}
              <div style={{ height: '80px' }} />
            </>
          )}

        {activeTab === 'settings' && (
          <section className="glass-panel settings-hub">
            <div className="settings-head">
              <h2>설정</h2>
              <div className="settings-segment" role="tablist" aria-label="설정 메뉴">
                <button type="button" className={settingsSection === 'app' ? 'active' : ''} onClick={() => setSettingsSection('app')}>환경</button>
                <button type="button" className={settingsSection === 'data' ? 'active' : ''} onClick={() => setSettingsSection('data')}>데이터</button>
              </div>
            </div>

            {settingsSection === 'app' && (
              <div className="settings-stack">
                <div className="settings-row theme-settings-row">
                  <strong>화면 테마</strong>
                  <div className="theme-toggle" role="group" aria-label="화면 테마">
                    <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                      라이트 모드
                    </button>
                    <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                      다크 모드
                    </button>
                  </div>
                </div>
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
                </div>
                <div className="settings-row">
                  <strong>백업 및 복원</strong>
                  <div className="settings-actions">
                    <button type="button" className="primary-button" onClick={exportCSV}>CSV 백업</button>
                    <label className="primary-button">
                      CSV 복원
                      <input type="file" accept=".csv" onChange={handleImportCSV} style={{ display: 'none' }} />
                    </label>
                  </div>
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
                                  onClick={() => {
                                    setEditingTransaction(t);
                                    setSelectedDayData(null);
                                  }}
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>거래 내역 수정</h3>
              <button type="button" className="close-btn" onClick={() => setEditingTransaction(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <TransactionEditForm
                key={editingTransaction.id}
                transaction={editingTransaction}
                onSave={(updated) => handleUpdateTransaction(editingTransaction.id, updated)}
                onCancel={() => setEditingTransaction(null)}
                onAddRecurringRule={handleAddRecurringRule}
                onUpdateRecurringRule={handleUpdateRecurringRule}
                recurringRules={recurringRules}
                expenseCategories={allExpenseCategories}
                incomeCategories={allIncomeCategories}
                onStopRecurring={handleStopRecurringFromTx}
                onNotify={showNotice}
              />
            </div>
          </div>
        </div>
      )}

      {/* 자산 개별 항목 등록/수정 모달 */}
      {isAssetModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAssetModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title-icon"><AppIcon name="asset" size={20} /> {editingAsset ? '개별 자산 항목 수정' : '개별 자산 항목 추가'}</h3>
              <button type="button" className="close-btn" onClick={() => setIsAssetModalOpen(false)}>✕</button>
            </div>
            <form 
              key={editingAsset ? editingAsset.id : 'new'} 
              onSubmit={(e) => {
                e.preventDefault();
                const category = (e.currentTarget.elements.namedItem('asset-cat') as HTMLSelectElement).value;
                const amountRaw = (e.currentTarget.elements.namedItem('asset-amount') as HTMLInputElement).value;
                const memo = (e.currentTarget.elements.namedItem('asset-memo') as HTMLInputElement).value;
                
                const amount = Number(amountRaw) || 0;
                if (!category) {
                  showNotice('자산 종류를 선택해 주세요.', '입력 확인', 'warning');
                  return;
                }
                if (amount <= 0) {
                  showNotice('올바른 금액을 입력해 주세요.', '입력 확인', 'warning');
                  return;
                }

                if (editingAsset) {
                  handleUpdateAsset({ id: editingAsset.id, category, amount, memo });
                } else {
                  handleAddAsset({ id: createId(), category, amount, memo });
                }
                setIsAssetModalOpen(false);
              }} 
              style={{ display: 'grid', gap: '20px', padding: '24px 28px' }}
            >
              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>자산 분류</label>
                <select 
                  name="asset-cat" 
                  required
                  defaultValue={editingAsset ? editingAsset.category : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <option value="">-- 분류 선택 --</option>
                  {activeAssetCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>금액 (원)</label>
                <input 
                  type="number" 
                  name="asset-amount" 
                  placeholder="예: 500000"
                  required
                  defaultValue={editingAsset ? String(editingAsset.amount) : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>메모</label>
                <input 
                  type="text" 
                  name="asset-memo" 
                  placeholder="예: 카카오뱅크 자유적금"
                  defaultValue={editingAsset ? editingAsset.memo : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  className="secondary-button" 
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setIsAssetModalOpen(false)}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className="primary-button" 
                  style={{ flex: 2, marginTop: 0 }}
                >
                  <AppIcon name={editingAsset ? 'edit' : 'plus'} size={17} /> {editingAsset ? '자산 수정' : '자산 등록'}
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
              <h3>🏷️ 카테고리 추가 등록</h3>
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
              const newCategory = { id: generatedId, label: catName, color: selectedCategoryColor };

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
              
              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>카테고리 유형</label>
                <select 
                  name="cat-type"
                  value={categoryModalType}
                  onChange={(e) => setCategoryModalType(e.target.value as CategoryScope)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <option value="expense">지출 🔴</option>
                  <option value="income">수입 🔵</option>
                  <option value="asset">자산 🟢</option>
                </select>
              </div>

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

      {/* 통합 거래 등록 모달 */}
      {isEntryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsEntryModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title-icon"><AppIcon name="plus" size={20} /> 통합 거래 등록</h3>
              <button type="button" className="close-btn" onClick={() => setIsEntryModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '24px 28px' }}>
              <UnifiedEntryForm
                onAddTransaction={(t) => {
                  handleAddTransaction(t);
                  setIsEntryModalOpen(false);
                }}
                onAddAsset={(a) => {
                  handleAddAsset(a);
                  setIsEntryModalOpen(false);
                }}
                expenseCategories={activeExpenseCategories}
                incomeCategories={activeIncomeCategories}
                onAddRecurringRule={(r) => {
                  handleAddRecurringRule(r);
                  setIsEntryModalOpen(false);
                }}
                onNotify={showNotice}
                isQuickAdd={true}
              />
            </div>
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
            <div className={`confirm-symbol ${confirmDialog.tone === 'danger' ? 'danger' : ''}`} aria-hidden="true" />
            <div>
              <h3 id="confirm-title">{confirmDialog.title}</h3>
              <p>{confirmDialog.message}</p>
            </div>
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

      {/* 4대 코어 탭 하단 고정 등록바 */}
      {(activeTab === 'asset' || activeTab === 'plan' || activeTab === 'calendar' || activeTab === 'ledger') && (
        <div className="fixed-bottom-bar" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
          {activeTab === 'asset' && (
            <>
              <button
                type="button"
                className="secondary-button fixed-bottom-bar-btn"
                style={{ background: 'var(--bg-balance-light)', border: '1px solid var(--border-card)', color: 'var(--text-primary)' }}
                onClick={() => {
                  setCategoryModalType('asset');
                  setIsCategoryModalOpen(true);
                }}
              >
                <AppIcon name="plus" size={17} /> 카테고리 등록
              </button>
              <button
                type="button"
                className="primary-button fixed-bottom-bar-btn"
                onClick={() => setIsAssetModalOpen(true)}
              >
                <AppIcon name="plus" size={17} /> 자산 등록
              </button>
            </>
          )}
          {activeTab === 'plan' && (
            <>
              <button
                type="button"
                className="secondary-button fixed-bottom-bar-btn"
                style={{ background: 'var(--bg-balance-light)', border: '1px solid var(--border-card)', color: 'var(--text-primary)' }}
                onClick={() => {
                  setCategoryModalType('expense');
                  setIsCategoryModalOpen(true);
                }}
              >
                <AppIcon name="plus" size={17} /> 카테고리 등록
              </button>
              <button
                type="button"
                className="primary-button fixed-bottom-bar-btn"
                onClick={() => {
                  setIsEntryModalOpen(true);
                  setModalTab('add');
                }}
              >
                <AppIcon name="plus" size={17} /> 거래 등록
              </button>
            </>
          )}
          {activeTab === 'calendar' && (
            <button
              type="button"
              className="primary-button fixed-bottom-bar-btn"
              onClick={() => {
                setIsEntryModalOpen(true);
                setModalTab('add');
              }}
            >
              <AppIcon name="plus" size={17} /> 거래 등록
            </button>
          )}
          {activeTab === 'ledger' && (
            <button
              type="button"
              className="primary-button fixed-bottom-bar-btn"
              onClick={() => {
                setIsEntryModalOpen(true);
                setModalTab('add');
              }}
            >
              <AppIcon name="plus" size={17} /> 거래 등록
            </button>
          )}
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

  let emptyMsg = "표시할 내역이 없습니다.";
  if (title.includes("지출")) emptyMsg = "표시할 지출이 없습니다.";
  else if (title.includes("수입")) emptyMsg = "표시할 수입이 없습니다.";
  else if (title.includes("자산")) emptyMsg = "표시할 자산이 없습니다.";

  if (validCategories.length === 0) {
    return (
      <article className="summary-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', background: 'var(--bg-input)', borderRadius: '16px', border: '1px dashed var(--border-input)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 'bold', margin: 0 }}>{emptyMsg}</p>
      </article>
    );
  }

  return (
    <article className="summary-column">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>카테고리</th>
            <th>금액</th>
          </tr>
        </thead>
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

// Transaction List Table sub-component
function TransactionListTable({
  title,
  type,
  items,
  onDelete,
  onEdit,
  categories,
  onStopRecurring,
  formatMoney = formatCurrency,
}: {
  title: string;
  type: TransactionType;
  items: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
  categories: CategoryOption[];
  onStopRecurring?: (id: string, stopMonth?: string) => void;
  formatMoney?: (value: number) => string;
}) {

  return (
    <section className="ledger-table-wrap">
      <h3 className={type}>{title}</h3>
      <div className="ledger-table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>금액</th>
              <th>내용</th>
              <th>카테고리</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  등록된 내역이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((transaction) => {
                const isFuture = transaction.date > getToday();
                return (
                  <tr key={transaction.id} style={{ opacity: isFuture ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                    <td>{transaction.date}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(transaction.amount)}</td>
                  <td>
                    {transaction.title}
                    {transaction.recurringRuleId && (
                      <span
                        title="정기 반복 결제"
                        style={{ marginLeft: '6px', color: 'var(--primary)', fontSize: '0.9rem', cursor: 'help' }}
                      >
                        🔄
                      </span>
                    )}
                  </td>
                  <td><CategoryBadge categories={categories} idOrLabel={transaction.category} /></td>
                  <td>
                    <div className="actions-cell">
                      <button type="button" className="edit-btn" onClick={() => onEdit(transaction)}>
                        수정
                      </button>
                      <button type="button" className="delete-btn-sm" onClick={() => onDelete(transaction.id)}>
                        삭제
                      </button>
                    </div>
                  </td>
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

// Unified Entry Form (Income / Expense / Asset)
function UnifiedEntryForm({
  defaultDate = getToday(),
  onAddTransaction,
  onAddAsset,
  isQuickAdd = false,
  expenseCategories,
  incomeCategories,
  onAddRecurringRule,
  onNotify,
}: {
  defaultDate?: string;
  onAddTransaction: (t: Transaction) => void;
  onAddAsset: (a: AssetItem) => void;
  isQuickAdd?: boolean;
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  onAddRecurringRule?: (r: RecurringRule) => void;
  onNotify?: (message: string, title?: string, type?: NoticeType) => void;
}) {
  const [form, setForm] = useState<UnifiedFormState>(() => createUnifiedForm(defaultDate, 'expense'));
  const [isRecurring, setIsRecurring] = useState(false);

  // Update categories dynamically depending on selection
  const activeCategories: CategoryOption[] = useMemo(() => {
    if (form.type === 'expense') return expenseCategories;
    if (form.type === 'income') return incomeCategories;
    return assetCategories;
  }, [form.type, expenseCategories, incomeCategories]);

  // Adjust default category when type changes
  function handleTypeChange(newType: EntryType) {
    const defaultCat = newType === 'expense'
      ? (expenseCategories[0]?.id ?? 'etc')
      : newType === 'income'
      ? (incomeCategories[0]?.id ?? 'etc')
      : (assetCategories[0]?.id ?? 'cash');

    setForm((prev) => ({
      ...prev,
      type: newType,
      category: defaultCat,
    }));
    if (newType === 'asset') {
      setIsRecurring(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      onNotify?.('올바른 금액을 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    if (form.type === 'asset') {
      // Asset Registration
      onAddAsset({
        id: createId(),
        category: form.category,
        amount,
        memo: form.title.trim() || '자산 등록',
      });
    } else {
      // Income or Expense Registration
      if (!form.date) {
        onNotify?.('날짜를 입력해 주세요.', '입력 확인', 'warning');
        return;
      }
      if (!form.title.trim()) {
        onNotify?.('내용을 입력해 주세요.', '입력 확인', 'warning');
        return;
      }

      if (isRecurring && onAddRecurringRule) {
        const day = Number(form.date.slice(8, 10)) || 1;
        const transactionMonth = form.date.slice(0, 7); // "YYYY-MM"
        const startMonth = getNextMonth(transactionMonth);
        const ruleId = `rule_${Date.now()}`;
        onAddRecurringRule({
          id: ruleId,
          type: form.type as TransactionType,
          day,
          amount,
          title: form.title.trim(),
          category: form.category,
          startMonth,
          endMonth: null
        });

        // Write the current day transaction immediately using matching rec_ ID
        onAddTransaction({
          id: `rec_${ruleId}_${transactionMonth}`,
          type: form.type as TransactionType,
          date: form.date,
          amount,
          title: form.title.trim(),
          category: form.category,
          recurringRuleId: ruleId,
        });
      } else {
        onAddTransaction({
          id: createId(),
          type: form.type as TransactionType,
          date: form.date,
          amount,
          title: form.title.trim(),
          category: form.category,
        });
      }
    }

    // Reset Form (keep date & type)
    setForm((prev) => ({
      ...prev,
      amount: '',
      title: '',
    }));
    setIsRecurring(false);

    if (!isQuickAdd) {
      onNotify?.('성공적으로 등록되었습니다.', '등록 완료', 'success');
    }
  }

  const formColorClass = form.type === 'expense' ? 'expense' : form.type === 'income' ? 'income' : 'asset';

  return (
    <form className={isQuickAdd ? 'entry-form' : 'glass-panel entry-form'} onSubmit={handleSubmit}>
      {!isQuickAdd && (
        <div className={`entry-form-title ${formColorClass}`}>
          <strong>통합 거래 등록</strong>
          <span>수입, 지출, 자산 내역을 드롭다운 선택으로 한 번에 관리합니다.</span>
        </div>
      )}

      <div className="form-grid" style={{ gridTemplateColumns: isQuickAdd ? '1fr' : '1fr 1fr' }}>
        <label>
          구분 (유형)
          <select value={form.type} onChange={(e) => handleTypeChange(e.target.value as EntryType)}>
            <option value="expense">지출 🔴</option>
            <option value="income">수입 🔵</option>
            <option value="asset">자산 🟢</option>
          </select>
        </label>

        <label>
          {form.type === 'asset' ? '자산 구분' : '카테고리'}
          <select
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
          >
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {form.type !== 'asset' && (
          <label style={{ gridColumn: isQuickAdd ? 'span 1' : 'span 2' }}>
            날짜
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
            />
          </label>
        )}

        <label style={{ gridColumn: isQuickAdd ? 'span 1' : 'span 2' }}>
          {form.type === 'asset' ? '자산 메모' : '내용'}
          <input
            type="text"
            placeholder={form.type === 'asset' ? '예: 카카오뱅크 통장, 주식 계좌' : '예: 식비, 교통비, 보너스'}
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
        </label>

        <label style={{ gridColumn: isQuickAdd ? 'span 1' : 'span 2' }}>
          금액 (원)
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
        </label>

        {form.type !== 'asset' && (
          <label className="recurring-toggle" style={{ gridColumn: isQuickAdd ? 'span 1' : 'span 2' }}>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            <span className="recurring-toggle-mark" aria-hidden="true" />
            <span className="recurring-toggle-text">정기 기록</span>
          </label>
        )}
      </div>

      <button type="submit" className="primary-button" style={{ marginTop: '8px', background: form.type === 'expense' ? 'var(--color-expense)' : form.type === 'income' ? 'var(--color-income)' : 'var(--color-asset)' }}>
        {form.type === 'expense' ? '지출 등록' : form.type === 'income' ? '수입 등록' : '자산 등록'}
      </button>
    </form>
  );
}

// Edit Form
function TransactionEditForm({
  transaction,
  onSave,
  onCancel,
  onAddRecurringRule,
  onUpdateRecurringRule,
  recurringRules,
  expenseCategories,
  incomeCategories,
  onStopRecurring,
  onNotify,
}: {
  transaction: Transaction;
  onSave: (t: Transaction) => void;
  onCancel: () => void;
  onAddRecurringRule?: (r: RecurringRule) => void;
  onUpdateRecurringRule?: (r: RecurringRule) => void;
  recurringRules: RecurringRule[];
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  onStopRecurring?: (id: string, stopMonth?: string) => void;
  onNotify?: (message: string, title?: string, type?: NoticeType) => void;
}) {
  const [date, setDate] = useState(transaction.date);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [title, setTitle] = useState(transaction.title);
  const categories = transaction.type === 'expense' ? expenseCategories : incomeCategories;
  const [category, setCategory] = useState(transaction.category);
  
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = parseAmount(amount);
    if (!date || !title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      onNotify?.('금액과 내용을 올바르게 입력해 주세요.', '입력 확인', 'warning');
      return;
    }

    const activeRecurringRule = transaction.recurringRuleId
      ? recurringRules.find((rule) => rule.id === transaction.recurringRuleId && !rule.endMonth)
      : undefined;
    const wasRecurring = !!activeRecurringRule;
    let nextRuleId = transaction.recurringRuleId || null;

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
        amount: numericAmount,
        title: title.trim(),
        category,
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
        amount: numericAmount,
        title: title.trim(),
        category,
      });
      onNotify?.('정기 반복 결제 정보가 변경되었습니다.', '정기 기록 수정', 'success');
    }

    onSave({
      ...transaction,
      date,
      amount: numericAmount,
      title: title.trim(),
      category,
      recurringRuleId: nextRuleId,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
      <label>
        날짜
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        금액 (원)
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label>
        내용
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        카테고리
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="recurring-toggle">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
        />
        <span className="recurring-toggle-mark" aria-hidden="true" />
        <span className="recurring-toggle-text">정기 기록</span>
      </label>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
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
