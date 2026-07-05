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
  fetch("/api/data", {
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
  }).catch(() => {
    // Ignore errors for offline fallback
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
  const [settingsSection, setSettingsSection] = useState<'category' | 'app' | 'data'>('category');
  
  // Filtering & Search states
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

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
  const [assetSection, setAssetSection] = useState({ showAsset: true, showPlan: false, showRecurring: false });
  const [openPaletteKey, setOpenPaletteKey] = useState<string | null>(null);
  const [paletteDraftColor, setPaletteDraftColor] = useState('#64748b');

  const [isLoading, setIsLoading] = useState(true);
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
    if (isLoading) return;

    // 2. Debounce D1 Database sync by 1 second (1000ms)
    const syncTimer = setTimeout(() => {
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
              saveRemoteD1(
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
              );
            } else {
              setTransactions([]);
              setAssets([]);
              setRecurringRules([]);
              setDeletedRecurringTxs([]);
              setPlans([]);
              setUpdatedAt(0);
            }
            setIsLoading(false);
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
                newTime
              );
            }
          }
        }
      })
      .catch(() => {
        // Fallback silently to LocalStorage if API fails or offline
      })
      .finally(() => {
        setIsLoading(false);
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

        const exists = transactions.some((t) => t.id === txId);
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

    if (newTxs.length > 0) {
      setTransactions((prev) => [...prev, ...newTxs]);
    }
  }, [recurringRules, transactions, deletedRecurringTxs, isLoading]);

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

  function handleStopRecurringRule(id: string) {
    setRecurringRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, endMonth: selectedMonth } : r))
    );
    showNotice('다음 달부터 반복 기록이 중단됩니다.', '정기 기록 중지', 'success');
  }

  function handleStopRecurringFromTx(txId: string) {
    if (!txId.startsWith('rec_')) return;
    const lastUnderscoreIndex = txId.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) return;
    const ruleId = txId.substring(4, lastUnderscoreIndex);
    const txMonth = txId.substring(lastUnderscoreIndex + 1); // "YYYY-MM"
    
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
      newTime
    );
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
      saveRemoteD1(
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
      );
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
    const firstDayOfWeek = date.getDay();
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

    const lastDate = new Date(calendarYear, calendarMonth + 1, 0).getDate();
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

  return (
    <main className="app-shell">
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'var(--bg-app)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            border: '4px solid var(--border-card)',
            borderTop: '4px solid var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 800 }}>데이터베이스 연결 중...</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>가계부의 실시간 D1 데이터를 불러오는 중입니다.</span>
        </div>
      )}
      {/* Sidebar Navigation (Fixed bottom bar on mobile) */}
      <aside className="sidebar">
        <div>
          <div className="brand">
            <span>MW</span>
            <div>
              <strong>MyWallet</strong>
              <small>스마트 가계부 캘린더</small>
            </div>
          </div>
          <nav>
            <a href="#summary" className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>
              <span>📊</span>
              <strong>메인</strong>
            </a>
            <a href="#asset" className={activeTab === 'asset' ? 'active' : ''} onClick={() => setActiveTab('asset')}>
              <span>💼</span>
              <strong>자산</strong>
            </a>
            <a href="#plan" className={activeTab === 'plan' ? 'active' : ''} onClick={() => setActiveTab('plan')}>
              <span>📈</span>
              <strong>계획</strong>
            </a>
            <a href="#calendar" className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}>
              <span>📅</span>
              <strong>달력</strong>
            </a>
            <a href="#ledger" className={activeTab === 'ledger' ? 'active' : ''} onClick={() => setActiveTab('ledger')}>
              <span>📝</span>
              <strong>장부</strong>
            </a>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <section className="content">
        <header className="app-header">
          {/* 모바일 전용 로고 영역 (PC 뷰에서는 CSS로 숨김) */}
          <div className="header-brand">
            <span className="logo-box">MW</span>
            <div className="brand-text">
              <strong>MyWallet</strong>
              <small>스마트 가계부 캘린더</small>
            </div>
          </div>

          {/* PC 전용 헤더 좌측 타이틀 (선택 월에 연동, 모바일에서는 CSS로 숨김) */}
          <h1 className="header-title">
            {selectedMonth.replace('-', '.')} 재정 현황
          </h1>

          {/* 헤더 우측 액션 그룹 */}
          <div className="header-actions">
            {/* 공통 월 선택 영역 */}
            <div className="month-picker-wrap">
              <div className="month-picker-display">
                {selectedMonth.replace('-', '.')} 📅
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
              <span>⚙️</span>
            </button>
          </div>
        </header>

        {/* Dashboard Tab */}
        {activeTab === 'summary' && (
          <>
            <section className="summary-grid" aria-label="월간 요약">
              <article className="summary-card expense">
                <span>이번 달 총 지출</span>
                <strong>{formatCurrency(expenseTotal)}</strong>
                <small>합리적인 소비를 위한 예산 대비 관리</small>
              </article>
              <article className="summary-card income">
                <span>이번 달 총 수입</span>
                <strong>{formatCurrency(incomeTotal)}</strong>
                <small>월별 부가 소득 및 급여 포함</small>
              </article>
              <article className="summary-card budget-status">
                <span>설정된 한달 예산</span>
                <strong>{formatCurrency(budget)}</strong>
                <small>예산 대비 {budgetPercent}% 소진 중</small>
              </article>
              <article className="summary-card asset">
                <span>총 관리 자산</span>
                <strong>{formatCurrency(assetTotal)}</strong>
                <small>현금, 투자 자산 등 누적 금액</small>
              </article>
            </section>


            {/* Flow Panel */}
            <section className="glass-panel flow-panel">
              <FlowRowItem label="지출" value={expenseTotal} max={maxFlow} tone="expense" />
              <FlowRowItem label="수입" value={incomeTotal} max={maxFlow} tone="income" />
              <FlowRowItem label="자산" value={assetTotal} max={maxFlow} tone="asset" />
            </section>

            {/* 계획 대비 실적 비교 그래프 패널 */}
            <section className="glass-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Plan vs Actual</p>
                  <h2>이번 달 계획 대비 실적 비교</h2>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '12px' }} className="compare-grid">
                {/* 종합 계획 대비 실적 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>종합 달성 현황</h3>
                  
                  {/* 수입 비교 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 700 }}>
                      <span>총 수입 실적: {formatCurrency(incomeTotal)}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>목표: {formatCurrency(plannedIncomeTotal)}</span>
                    </div>
                    <div className="budget-progress-bar" style={{ height: '14px', background: 'var(--bg-balance-light)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div 
                        className="budget-progress-fill" 
                        style={{ 
                          width: `${plannedIncomeTotal > 0 ? Math.min((incomeTotal / plannedIncomeTotal) * 100, 100) : 0}%`,
                          height: '100%',
                          background: 'var(--color-income)',
                          borderRadius: '10px',
                          transition: 'width 0.4s ease'
                        }} 
                      />
                    </div>
                    <small style={{ display: 'block', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      달성률: {plannedIncomeTotal > 0 ? Math.round((incomeTotal / plannedIncomeTotal) * 100) : 0}%
                    </small>
                  </div>

                  {/* 지출 비교 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 700 }}>
                      <span>총 지출 실적: {formatCurrency(expenseTotal)}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>예산: {formatCurrency(plannedExpenseTotal)}</span>
                    </div>
                    <div className="budget-progress-bar" style={{ height: '14px', background: 'var(--bg-balance-light)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div 
                        className="budget-progress-fill" 
                        style={{ 
                          width: `${plannedExpenseTotal > 0 ? Math.min((expenseTotal / plannedExpenseTotal) * 100, 100) : 0}%`,
                          height: '100%',
                          background: expenseTotal > plannedExpenseTotal ? 'var(--color-expense)' : 'var(--primary)',
                          borderRadius: '10px',
                          transition: 'width 0.4s ease'
                        }} 
                      />
                    </div>
                    <small style={{ display: 'block', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      소비율: {plannedExpenseTotal > 0 ? Math.round((expenseTotal / plannedExpenseTotal) * 100) : 0}%
                    </small>
                  </div>
                </div>

                {/* 카테고리별 지출 계획 대비 실적 */}
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>주요 지출 카테고리별 현황</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {allExpenseCategories.slice(0, 5).map((c: CategoryOption) => {
                      const plan = plans.find(p => p.category === c.id && p.type === 'expense');
                      const plannedAmt = plan ? plan.plannedAmount : 0;
                      const actualAmt = transactions
                          .filter(t => t.type === 'expense' && t.category === c.id && t.date.slice(0, 7) === selectedMonth)
                        .reduce((sum, t) => sum + t.amount, 0);
                      const pct = plannedAmt > 0 ? Math.round((actualAmt / plannedAmt) * 100) : 0;
                      let toneColor = 'var(--primary)';
                      if (pct >= 100) toneColor = 'var(--color-expense)';
                      else if (pct >= 80) toneColor = '#f59e0b';

                      return (
                        <div key={c.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px', fontWeight: 700 }}>
                            <span>{c.label}: {formatCurrency(actualAmt)}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>계획: {formatCurrency(plannedAmt)} ({pct}%)</span>
                          </div>
                          <div className="budget-progress-bar" style={{ height: '8px', background: 'var(--bg-balance-light)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                width: `${plannedAmt > 0 ? Math.min((actualAmt / plannedAmt) * 100, 100) : 0}%`,
                                height: '100%',
                                background: toneColor,
                                borderRadius: '10px',
                                transition: 'width 0.4s ease'
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Category summary table */}
            <section className="glass-panel summary-table-grid">
              <div className="panel-header" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <div>
                  <p className="eyebrow">Category Summary</p>
                  <h2>카테고리별 합계</h2>
                </div>
              </div>
              <CategorySummaryColumn title="지출 카테고리" categories={expenseCategories} values={expenseSummary} />
              <CategorySummaryColumn title="수입 카테고리" categories={incomeCategories} values={incomeSummary} />
              <CategorySummaryColumn title="자산 분배 상태" categories={assetCategories} values={assetSummary} />
            </section>
          </>
        )}

        {/* Calendar View Tab */}
        {activeTab === 'calendar' && (
          <section className="glass-panel calendar-view-container">
            <div className="calendar-control" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>
                {calendarYear}년 {calendarMonth + 1}월
              </h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="calendar-nav-buttons">
                  <button type="button" className="calendar-nav-btn" onClick={handleCalendarPrev}>
                    ◀
                  </button>
                  <button type="button" className="calendar-nav-btn" onClick={handleCalendarNext}>
                    ▶
                  </button>
                </div>
              </div>
            </div>

            <div className="calendar-grid">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                <div
                  key={day}
                  className={`calendar-day-name ${idx === 0 ? 'sunday' : idx === 6 ? 'saturday' : ''}`}
                >
                  {day}
                </div>
              ))}
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
                        <span className="calendar-value-badge income">+{formatCurrency(daySums.income)}</span>
                      )}
                      {daySums?.expense > 0 && (
                        <span className="calendar-value-badge expense">-{formatCurrency(daySums.expense)}</span>
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
              />
              <TransactionListTable
                title="수입 내역"
                type="income"
                items={filteredLedgerTransactions.filter((t) => t.type === 'income')}
                onDelete={handleDeleteTransaction}
                onEdit={setEditingTransaction}
                categories={allIncomeCategories}
                onStopRecurring={handleStopRecurringFromTx}
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
                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(rule.amount)}</td>
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

                                    const isDuplicate = transactions.some(
                                      (t) => t.date === dateStr && t.amount === rule.amount && t.title === rule.title && t.category === rule.category
                                    );
                                    const addRecurringTransaction = () => {
                                      handleAddTransaction({
                                        id: `tx_${Date.now()}`,
                                        type: rule.type,
                                        date: dateStr,
                                        amount: rule.amount,
                                        title: rule.title,
                                        category: rule.category
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
                  <strong style={{ fontSize: '1.05rem', color: 'var(--color-asset)' }}>💼 자산 총액: {formatCurrency(assetTotal)}</strong>
                </div>
              </div>
            </div>

            {/* 고정 카드 그리드 영역 */}
            <div className="asset-accordion-group" style={{ display: 'grid', gap: '12px' }}>
              
              {/* 1. [ 자산 현황 ] 고정 카드 */}
              <div className="glass-panel" style={{ padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                  <span>💼</span> 자산 목록
                </h3>
                <div className="asset-table-list" style={{ display: 'grid', gap: '6px' }}>
                  {assets.length === 0 ? (
                    <p className="empty-note" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)' }}>
                      등록된 자산 항목이 없습니다. 우측 상단의 [자산 등록] 단추를 통해 자산을 추가해보세요.
                    </p>
                  ) : (
                    assets.map((asset, index) => {
                      const isDragging = draggedAssetIndex === index;
                      
                      if (isDragging) {
                        return (
                          <div
                            key={asset.id}
                            onDragOver={(e) => handleAssetDragOver(e, index)}
                            onDragEnter={() => handleAssetDragEnter(index)}
                            onDragEnd={handleAssetDragEnd}
                            onDrop={handleAssetDrop}
                            style={{
                              height: '40px',
                              border: '2px dashed var(--primary)',
                              borderRadius: '8px',
                              background: 'var(--bg-balance-light)',
                              opacity: 0.6,
                              transition: 'all 0.15s ease',
                            }}
                          />
                        );
                      }

                      return (
                        <div
                          key={asset.id}
                          draggable
                          onDragStart={(e) => handleAssetDragStart(e, index)}
                          onDragOver={(e) => handleAssetDragOver(e, index)}
                          onDragEnter={() => handleAssetDragEnter(index)}
                          onDragEnd={handleAssetDragEnd}
                          onDrop={handleAssetDrop}
                          className="glass-panel"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            cursor: 'grab',
                            transition: 'all 0.15s ease',
                            background: 'var(--bg-card)',
                            borderColor: 'var(--border-card)',
                            borderStyle: 'solid',
                            borderWidth: '1px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-secondary)', cursor: 'grab', fontSize: '1.1rem', userSelect: 'none' }}>⠿</span>
                            <CategoryBadge categories={allAssetCategories} idOrLabel={asset.category} />
                            <span style={{ fontWeight: 700, fontSize: '1rem' }}>{formatCurrency(asset.amount)}</span>
                            {asset.memo && (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>({asset.memo})</span>
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

            </div>
          </>
        )}

        {/* Plans Tab */}
        {activeTab === 'plan' && (
          <>
            <div className="tab-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>월간 계획 설정</h1>
              </div>
            </div>

            <div className="asset-accordion-group" style={{ display: 'grid', gap: '24px' }}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-card)', paddingBottom: '12px' }}>
                  <span>📊</span> 월간 계획 (수입/지출 예산)
                </h3>

                <div className="plans-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
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
          </>
        )}

        {activeTab === 'settings' && (
          <section className="glass-panel settings-hub">
            <div className="settings-head">
              <h2>설정</h2>
              <div className="settings-segment" role="tablist" aria-label="설정 메뉴">
                <button type="button" className={settingsSection === 'category' ? 'active' : ''} onClick={() => setSettingsSection('category')}>카테고리</button>
                <button type="button" className={settingsSection === 'app' ? 'active' : ''} onClick={() => setSettingsSection('app')}>환경</button>
                <button type="button" className={settingsSection === 'data' ? 'active' : ''} onClick={() => setSettingsSection('data')}>데이터</button>
              </div>
            </div>

            {settingsSection === 'category' && (
              <div className="category-manager">
                <div className="category-manager-head">
                  <h3>카테고리 관리</h3>
                  <span className="category-total-chip">
                    {categoryManagerGroups.reduce((sum, group) => sum + group.categories.length, 0)}개
                  </span>
                </div>

                <form id="category-create-form" className="category-create-card" onSubmit={handleAddManagedCategory}>
                  <div className="category-create-copy">
                    <strong>새 카테고리</strong>
                  </div>
                  <select
                    value={categoryDraft.type}
                    onChange={(event) => setCategoryDraft((prev) => ({ ...prev, type: event.target.value as CategoryScope }))}
                    aria-label="카테고리 분류"
                  >
                    {categoryTypeOptions.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={categoryDraft.label}
                    onChange={(event) => setCategoryDraft((prev) => ({ ...prev, label: event.target.value }))}
                    placeholder="카테고리 이름"
                    aria-label="카테고리 이름"
                  />
                  <label className="category-color-field">
                    <span style={{ background: categoryDraft.color }} />
                    <input
                      type="color"
                      value={categoryDraft.color}
                      onChange={(event) => setCategoryDraft((prev) => ({ ...prev, color: event.target.value }))}
                      aria-label="새 카테고리 색상"
                    />
                  </label>
                </form>

                <div className="category-card-grid">
                  {categoryManagerGroups.map((group) => (
                    <article key={group.type} className="category-table-card">
                      <div className="category-table-head">
                        <strong>{group.title}</strong>
                        <b>{group.categories.length}개</b>
                      </div>
                      <div className="category-table">
                        {group.categories.map((category) => {
                          const color = category.color || '#64748b';
                          const paletteKey = getCategoryColorKey(group.type, category.id);
                          const isOpen = openPaletteKey === paletteKey;

                          return (
                            <div
                              key={`${group.type}-${category.id}`}
                              className={`category-row ${dragCategory?.type === group.type && dragCategory.id === category.id ? 'dragging' : ''}`}
                              draggable
                              onDragStart={() => setDragCategory({ type: group.type, id: category.id })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => handleCategoryDrop(event, group.type, category.id, group.categories)}
                              onDragEnd={() => setDragCategory(null)}
                            >
                              <span className="category-drag-handle" aria-hidden="true">⋮⋮</span>
                              <div className="category-color-menu">
                                <button
                                  type="button"
                                  className="category-color-swatch"
                                  style={{ background: color }}
                                  onClick={() => {
                                    setPaletteDraftColor(color);
                                    setOpenPaletteKey((prev) => (prev === paletteKey ? null : paletteKey));
                                  }}
                                  aria-label={`${category.label} 색상`}
                                />
                                {isOpen && (
                                  <div className="category-palette-popover">
                                    <div className="category-preset-grid">
                                      {categoryColorPresets.map((preset) => (
                                        <button
                                          key={preset}
                                          type="button"
                                          className={preset.toLowerCase() === paletteDraftColor.toLowerCase() ? 'active' : ''}
                                          style={{ background: preset }}
                                          onClick={() => setPaletteDraftColor(preset)}
                                          aria-label={`${category.label} ${preset}`}
                                        />
                                      ))}
                                    </div>
                                    <label className="category-custom-color">
                                      <span style={{ background: paletteDraftColor }} />
                                      <input
                                        type="color"
                                        value={paletteDraftColor}
                                        onChange={(event) => setPaletteDraftColor(event.target.value)}
                                        aria-label="커스텀 색상"
                                      />
                                      <strong>커스텀</strong>
                                    </label>
                                    <div className="category-palette-actions">
                                      <button type="button" className="secondary-button" onClick={() => setOpenPaletteKey(null)}>취소</button>
                                      <button
                                        type="button"
                                        className="primary-button"
                                        onClick={() => {
                                          handleCategoryColorChange(group.type, category.id, paletteDraftColor);
                                          setOpenPaletteKey(null);
                                        }}
                                      >
                                        확인
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="category-row-main">
                                <CategoryBadge categories={group.categories} idOrLabel={category.id} />
                              </div>
                              <button
                                type="button"
                                className="category-row-action"
                                onClick={() => handleArchiveCategory(group.type, category.id, category.label)}
                              >
                                삭제
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {settingsSection === 'app' && (
              <div className="settings-stack">
                <div className="settings-row">
                  <strong>화면 테마</strong>
                  <button type="button" className="primary-button" onClick={toggleTheme}>
                    {theme === 'light' ? '다크 모드' : '라이트 모드'}
                  </button>
                </div>
              </div>
            )}

            {settingsSection === 'data' && (
              <div className="settings-stack">
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
                <div className="settings-row">
                  <strong>데이터 초기화</strong>
                  <button type="button" className="danger-button" onClick={handleReset}>전체 초기화</button>
                </div>
              </div>
            )}
          </section>
        )}
      </section>

      {(activeTab === 'calendar' || activeTab === 'ledger' || activeTab === 'asset' || (activeTab === 'settings' && settingsSection === 'category')) && (
        <div className="floating-action-layer">
          {(activeTab === 'calendar' || activeTab === 'ledger') && (
            <button
              type="button"
              className="floating-action"
              onClick={() => setIsEntryModalOpen(true)}
              aria-label="새 거래 등록"
              title="새 거래 등록"
            >
              <span aria-hidden="true">+</span>
              <strong>거래 등록</strong>
            </button>
          )}
          {activeTab === 'asset' && (
            <button
              type="button"
              className="floating-action"
              onClick={() => {
                setEditingAsset(null);
                setIsAssetModalOpen(true);
              }}
              aria-label="자산 등록"
              title="자산 등록"
            >
              <span aria-hidden="true">+</span>
              <strong>자산 등록</strong>
            </button>
          )}
          {activeTab === 'settings' && settingsSection === 'category' && (
            <button
              type="submit"
              form="category-create-form"
              className="floating-action"
              aria-label="카테고리 등록"
              title="카테고리 등록"
            >
              <span aria-hidden="true">+</span>
              <strong>카테고리 등록</strong>
            </button>
          )}
        </div>
      )}

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
            
            <div className="modal-tab-header">
              <button
                type="button"
                className={`modal-tab-btn ${modalTab === 'view' ? 'active' : ''}`}
                onClick={() => setModalTab('view')}
              >
                상세 내역 보기
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${modalTab === 'add' ? 'active' : ''}`}
                onClick={() => setModalTab('add')}
              >
                통합 거래 등록
              </button>
            </div>

            <div className="modal-body" style={{ padding: '24px 28px' }}>
              {modalTab === 'view' ? (
                <div style={{ display: 'grid', gap: '20px' }}>
                  <h4>지출 및 수입 내역</h4>
                  {transactions.filter((t) => t.date === selectedDayData).length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>
                      해당 날짜에 등록된 거래 내역이 없습니다.
                    </p>
                  ) : (
                    <div className="ledger-table-scroll">
                      <table className="ledger-table">
                        <thead>
                          <tr>
                            <th>유형</th>
                            <th>금액</th>
                            <th>내용</th>
                            <th>카테고리</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {transactions
                            .filter((t) => t.date === selectedDayData)
                            .map((t) => {
                              const isFuture = t.date > getToday();
                              return (
                                <tr key={t.id} style={{ opacity: isFuture ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                                  <td style={{ color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)', fontWeight: 'bold' }}>
                                    {t.type === 'income' ? '수입' : '지출'}
                                  </td>
                                  <td>{formatCurrency(t.amount)}</td>
                                  <td>
                                    {t.title}
                                    {t.recurringRuleId && (
                                      <span
                                        title="정기 반복 결제"
                                        style={{ marginLeft: '6px', color: 'var(--primary)', fontSize: '0.9rem', cursor: 'help' }}
                                      >
                                        🔄
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <CategoryBadge categories={t.type === 'income' ? incomeCategories : expenseCategories} idOrLabel={t.category} />
                                  </td>
                                  <td>
                                    <div className="actions-cell">
                                      <button type="button" className="edit-btn" onClick={() => {
                                        setEditingTransaction(t);
                                        setSelectedDayData(null);
                                      }}>
                                        수정
                                      </button>
                                      <button type="button" className="delete-btn-sm" onClick={() => handleDeleteTransaction(t.id)}>
                                        삭제
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '20px' }}>
                  <UnifiedEntryForm
                    defaultDate={selectedDayData}
                    onAddTransaction={(t) => {
                      handleAddTransaction(t);
                      setModalTab('view');
                    }}
                    onAddAsset={(a) => {
                      handleAddAsset(a);
                      setModalTab('view');
                    }}
                    isQuickAdd={true}
                    expenseCategories={activeExpenseCategories}
                    incomeCategories={activeIncomeCategories}
                    onAddRecurringRule={handleAddRecurringRule}
                    onNotify={showNotice}
                  />
                </div>
              )}
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
                recurringRules={recurringRules}
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
              <h3>{editingAsset ? '💼 개별 자산 항목 수정' : '💼 개별 자산 항목 추가'}</h3>
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
                  {editingAsset ? '자산 수정 ✏️' : '자산 등록 ➕'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 카테고리 통합 등록 모달 */}
      {isCategoryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCategoryModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>🏷️ 카테고리 추가 등록</h3>
              <button type="button" className="close-btn" onClick={() => setIsCategoryModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const typeSelect = e.currentTarget.elements.namedItem('cat-type') as HTMLSelectElement;
              const nameInput = e.currentTarget.elements.namedItem('cat-name') as HTMLInputElement;
              
              const catType = typeSelect.value as 'expense' | 'income' | 'asset';
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {['#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'].map((color) => {
                    const isSelected = selectedCategoryColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: color,
                          border: isSelected ? '3px solid var(--text-primary)' : '1px solid rgba(0, 0, 0, 0.1)',
                          cursor: 'pointer',
                          padding: 0,
                          transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 4px 6px rgba(0,0,0,0.15)' : 'none'
                        }}
                        onClick={() => setSelectedCategoryColor(color)}
                      />
                    );
                  })}
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
                  추가하기 ➕
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 통합 거래 등록 모달 */}
      {isEntryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsEntryModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>➕ 통합 거래 등록</h3>
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
    </main>
  );
}

// Flow bar sub-component
function FlowRowItem({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'expense' | 'income' | 'asset' }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flow-row">
      <div>
        <strong>{label}</strong>
        <span>{formatCurrency(value)}</span>
      </div>
      <div className="flow-track">
        <i className={tone} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

// Category summary sub-column
function CategorySummaryColumn({ title, categories, values }: { title: string; categories: CategoryOption[]; values: Record<string, number> }) {
  const total = categories.reduce((sum, category) => sum + (values[category.id] ?? 0), 0);
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
          {categories.map((category) => (
            <tr key={category.id}>
              <td>{category.label}</td>
              <td>{formatCurrency(values[category.id] ?? 0)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>합계</td>
            <td>{formatCurrency(total)}</td>
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
}: {
  title: string;
  type: TransactionType;
  items: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
  categories: CategoryOption[];
  onStopRecurring?: (id: string) => void;
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
                    <td style={{ fontWeight: 600 }}>{formatCurrency(transaction.amount)}</td>
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
  recurringRules,
  onStopRecurring,
  onNotify,
}: {
  transaction: Transaction;
  onSave: (t: Transaction) => void;
  onCancel: () => void;
  onAddRecurringRule?: (r: RecurringRule) => void;
  recurringRules: RecurringRule[];
  onStopRecurring?: (id: string) => void;
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
    let updatedId = transaction.id;
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

      updatedId = `rec_${ruleId}_${date.slice(0, 7)}`;
      nextRuleId = ruleId;
      onNotify?.(`다음 달(${nextMonthStr})부터 매달 ${dy}일에 자동 등록됩니다.`, '정기 기록 설정', 'success');
    } else if (!isRecurring && wasRecurring && onStopRecurring) {
      // 2. Checked -> Unchecked: Stop recurring rules from next month
      onStopRecurring(transaction.id);
      nextRuleId = null;
    }

    onSave({
      ...transaction,
      id: updatedId,
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
