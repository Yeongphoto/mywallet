import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { AssetItem, CategoryOption, Transaction, UnifiedFormState, EntryType, TransactionType } from './types';

const expenseCategories: CategoryOption[] = [
  { id: 'food', label: '음식' },
  { id: 'daily', label: '생필품' },
  { id: 'saving', label: '저축' },
  { id: 'utility', label: '공공요금' },
  { id: 'subscription', label: '월정료' },
  { id: 'medical', label: '의료' },
  { id: 'housing', label: '주거' },
  { id: 'transport', label: '교통' },
  { id: 'personal', label: '개인' },
  { id: 'travel', label: '여행' },
  { id: 'etc', label: '기타' },
];

const incomeCategories: CategoryOption[] = [
  { id: 'salary', label: '급여' },
  { id: 'bonus', label: '보너스' },
  { id: 'interest', label: '이자' },
  { id: 'etc', label: '기타' },
];

const assetCategories: CategoryOption[] = [
  { id: 'cash', label: '현금' },
  { id: 'stock', label: '주식' },
  { id: 'installment', label: '적금' },
  { id: 'deposit', label: '예금' },
  { id: 'subscription-saving', label: '청약' },
  { id: 'emergency', label: '비상금' },
  { id: 'travel', label: '여행' },
  { id: 'etc', label: '기타' },
];

const STORAGE_KEY = 'mywallet:v2';

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonth() {
  return getToday().slice(0, 7);
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

function parseAmount(value: string) {
  return Number(value.replace(/,/g, '').trim());
}

function getCategoryLabel(categories: CategoryOption[], idOrLabel: string) {
  return categories.find((category) => category.id === idOrLabel || category.label === idOrLabel)?.label ?? idOrLabel;
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
    return { transactions: [] as Transaction[], assets: [] as AssetItem[], budget: 1000000, theme: 'light' as const };
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
        };
      }
      return { transactions: [] as Transaction[], assets: [] as AssetItem[], budget: 1000000, theme: 'light' as const };
    }

    const parsed = JSON.parse(rawData);
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      budget: typeof parsed.budget === 'number' ? parsed.budget : 1000000,
      theme: parsed.theme === 'dark' ? ('dark' as const) : ('light' as const),
    };
  } catch {
    return { transactions: [] as Transaction[], assets: [] as AssetItem[], budget: 1000000, theme: 'light' as const };
  }
}

function saveStoredData(transactions: Transaction[], assets: AssetItem[], budget: number, theme: 'light' | 'dark') {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, assets, budget, theme }));
  } catch {
    // LocalStorage error fallback
  }
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
  const [activeTab, setActiveTab] = useState<'summary' | 'calendar' | 'entry' | 'ledger' | 'asset' | 'settings'>('summary');
  
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

  // Sync state to localstorage
  useEffect(() => {
    saveStoredData(transactions, assets, budget, theme);
  }, [transactions, assets, budget, theme]);

  // Handle theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Sync calendar when selectedMonth changes
  useEffect(() => {
    setCalendarYear(Number(selectedMonth.slice(0, 4)));
    setCalendarMonth(Number(selectedMonth.slice(5, 7)) - 1);
  }, [selectedMonth]);

  // Derived Values
  const monthlyTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(selectedMonth)),
    [transactions, selectedMonth],
  );

  const monthlyExpenses = monthlyTransactions.filter((transaction) => transaction.type === 'expense');
  const monthlyIncomes = monthlyTransactions.filter((transaction) => transaction.type === 'income');
  const expenseTotal = sumAmount(monthlyExpenses);
  const incomeTotal = sumAmount(monthlyIncomes);
  const assetTotal = sumAmount(assets);
  const balance = incomeTotal - expenseTotal;
  const maxFlow = Math.max(expenseTotal, incomeTotal, assetTotal, 1);

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
                          getCategoryLabel(transaction.type === 'expense' ? expenseCategories : incomeCategories, transaction.category)
                            .toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = filterCategory === 'all' || transaction.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [monthlyTransactions, searchTerm, filterCategory]);

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
  }

  function handleUpdateTransaction(updated: Transaction) {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTransaction(null);
  }

  function handleAddAsset(asset: AssetItem) {
    setAssets((prev) => [asset, ...prev]);
  }

  function handleDeleteAsset(id: string) {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }

  function handleReset() {
    if (window.confirm('입력된 거래와 자산을 모두 초기화할까요?')) {
      setTransactions([]);
      setAssets([]);
      setBudget(1000000);
    }
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
          } else if (cells[0] === 'BUDGET') {
            newBudget = Number(cells[1]) || 1000000;
          }
        });

        if (newTransactions.length > 0 || newAssets.length > 0) {
          if (window.confirm(`가계부 백업을 복원할까요? (현재 장부에 거래 ${newTransactions.length}건, 자산 ${newAssets.length}건이 덮어쓰기됩니다.)`)) {
            setTransactions(newTransactions);
            setAssets(newAssets);
            setBudget(newBudget);
          }
        } else {
          alert('가져올 수 있는 유효한 가계부 데이터가 없습니다.');
        }
      } catch {
        alert('CSV 파일 해석 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  return (
    <main className="app-shell">
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
              <strong>대시보드</strong>
            </a>
            <a href="#calendar" className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}>
              <span>📅</span>
              <strong>달력 장부</strong>
            </a>
            <a href="#entry" className={activeTab === 'entry' ? 'active' : ''} onClick={() => setActiveTab('entry')}>
              <span>➕</span>
              <strong>거래 등록</strong>
            </a>
            <a href="#ledger" className={activeTab === 'ledger' ? 'active' : ''} onClick={() => setActiveTab('ledger')}>
              <span>📝</span>
              <strong>거래 대장</strong>
            </a>
            <a href="#asset" className={activeTab === 'asset' ? 'active' : ''} onClick={() => setActiveTab('asset')}>
              <span>💼</span>
              <strong>자산 구성</strong>
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
              onClick={() => setActiveTab('settings')}
              title="환경 설정"
            >
              <span>⚙️</span>
              <strong className="settings-text">설정</strong>
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
              <article className="summary-card balance">
                <span>이번 달 잔액</span>
                <strong>{formatCurrency(balance)}</strong>
                <small>순수 저축 및 가용 예산 금액</small>
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
            <div className="calendar-control">
              <h2>
                {calendarYear}년 {calendarMonth + 1}월
              </h2>
              <div className="calendar-nav-buttons">
                <button type="button" className="calendar-nav-btn" onClick={handleCalendarPrev}>
                  ◀
                </button>
                <button type="button" className="calendar-nav-btn" onClick={handleCalendarNext}>
                  ▶
                </button>
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

        {/* Unified Entry Tab */}
        {activeTab === 'entry' && (
          <section style={{ maxWidth: '640px', margin: '0 auto' }}>
            <UnifiedEntryForm
              onAddTransaction={handleAddTransaction}
              onAddAsset={handleAddAsset}
            />
          </section>
        )}

        {/* Ledger List Tab */}
        {activeTab === 'ledger' && (
          <section className="glass-panel">
            <div className="ledger-header">
              <div>
                <p className="eyebrow">Ledger List</p>
                <h2>거래 장부 목록</h2>
              </div>
              <span className="record-count">{filteredLedgerTransactions.length}건 검색됨</span>
              
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
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="수입 카테고리">
                    {incomeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="split-ledger">
              <TransactionListTable
                title="지출 내역"
                type="expense"
                items={filteredLedgerTransactions.filter((t) => t.type === 'expense')}
                onDelete={handleDeleteTransaction}
                onEdit={setEditingTransaction}
              />
              <TransactionListTable
                title="수입 내역"
                type="income"
                items={filteredLedgerTransactions.filter((t) => t.type === 'income')}
                onDelete={handleDeleteTransaction}
                onEdit={setEditingTransaction}
              />
            </div>
          </section>
        )}

        {/* Assets Portfolio Tab */}
        {activeTab === 'asset' && (
          <section className="glass-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Assets Portfolio</p>
                <h2>자산 구성 관리</h2>
              </div>
              <strong>자산 총액: {formatCurrency(assetTotal)}</strong>
            </div>

            <div className="asset-list">
              {assets.length === 0 ? (
                <p className="empty-note" style={{ gridColumn: '1 / -1' }}>
                  현재 등록된 자산 항목이 없습니다. 거래 등록 탭에서 '자산' 유형을 선택해 자산을 추가해보세요.
                </p>
              ) : (
                assets.map((asset) => (
                  <article key={asset.id} className="asset-card">
                    <div className="asset-card-header">
                      <strong>{getCategoryLabel(assetCategories, asset.category)}</strong>
                      <span>자산</span>
                    </div>
                    <b>{formatCurrency(asset.amount)}</b>
                    <div className="asset-card-footer">
                      <span>{asset.memo || '메모 없음'}</span>
                      <button type="button" className="delete-btn-sm" onClick={() => handleDeleteAsset(asset.id)}>
                        삭제
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <section className="glass-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Application Settings</p>
                <h2>환경 설정</h2>
              </div>
            </div>
            
            <div style={{ display: 'grid', gap: '20px', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', background: 'var(--bg-balance-light)', borderRadius: '16px', border: '1px solid var(--border-card)', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>화면 테마 설정</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    어두운 환경에서 눈을 보호하기 위해 다크 모드를 활성화할 수 있습니다.
                  </span>
                </div>
                <button 
                  type="button" 
                  className="primary-button" 
                  style={{ 
                    minHeight: '44px', 
                    padding: '0 18px', 
                    borderRadius: '12px',
                    fontWeight: '700',
                    width: '180px'
                  }} 
                  onClick={toggleTheme}
                >
                  {theme === 'light' ? '🌙 다크 모드 활성화' : '☀️ 라이트 모드 활성화'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', background: 'var(--bg-balance-light)', borderRadius: '16px', border: '1px solid var(--border-card)', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>가계부 데이터 백업 및 복원</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    현재 데이터를 CSV 파일로 안전하게 백업하거나 백업 파일을 불러옵니다.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    className="primary-button" 
                    style={{ 
                      minHeight: '44px', 
                      padding: '0 18px', 
                      borderRadius: '12px',
                      fontWeight: '700',
                      width: '180px'
                    }} 
                    onClick={exportCSV}
                  >
                    📥 CSV 백업
                  </button>
                  <label 
                    className="primary-button" 
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      cursor: 'pointer', 
                      borderRadius: '12px', 
                      minHeight: '44px', 
                      padding: '0 18px', 
                      fontWeight: '700',
                      width: '180px'
                    }}
                  >
                    📤 CSV 복원
                    <input type="file" accept=".csv" onChange={handleImportCSV} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', background: 'var(--bg-balance-light)', borderRadius: '16px', border: '1px solid var(--border-card)', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>가계부 데이터 초기화</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    등록된 모든 수입, 지출, 자산 및 예산 데이터를 초기화합니다.
                  </span>
                </div>
                <button 
                  type="button" 
                  className="danger-button" 
                  style={{ 
                    minHeight: '44px', 
                    padding: '0 18px', 
                    borderRadius: '12px',
                    fontWeight: '700',
                    width: '180px'
                  }} 
                  onClick={handleReset}
                >
                  ⚠️ 전체 데이터 초기화
                </button>
              </div>
            </div>
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

            <div className="modal-body">
              {modalTab === 'view' ? (
                <div style={{ display: 'grid', gap: '16px' }}>
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
                            .map((t) => (
                              <tr key={t.id}>
                                <td style={{ color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)', fontWeight: 'bold' }}>
                                  {t.type === 'income' ? '수입' : '지출'}
                                </td>
                                <td>{formatCurrency(t.amount)}</td>
                                <td>{t.title}</td>
                                <td>
                                  {getCategoryLabel(t.type === 'income' ? incomeCategories : expenseCategories, t.category)}
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
                            ))}
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
                transaction={editingTransaction}
                onSave={handleUpdateTransaction}
                onCancel={() => setEditingTransaction(null)}
              />
            </div>
          </div>
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
}: {
  title: string;
  type: TransactionType;
  items: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
}) {
  const categories = type === 'expense' ? expenseCategories : incomeCategories;

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
              items.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(transaction.amount)}</td>
                  <td>{transaction.title}</td>
                  <td>{getCategoryLabel(categories, transaction.category)}</td>
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
              ))
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
}: {
  defaultDate?: string;
  onAddTransaction: (t: Transaction) => void;
  onAddAsset: (a: AssetItem) => void;
  isQuickAdd?: boolean;
}) {
  const [form, setForm] = useState<UnifiedFormState>(() => createUnifiedForm(defaultDate, 'expense'));

  // Update categories dynamically depending on selection
  const activeCategories = useMemo(() => {
    if (form.type === 'expense') return expenseCategories;
    if (form.type === 'income') return incomeCategories;
    return assetCategories;
  }, [form.type]);

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
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('올바른 금액을 입력해 주세요.');
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
        alert('날짜를 입력해 주세요.');
        return;
      }
      if (!form.title.trim()) {
        alert('내용을 입력해 주세요.');
        return;
      }

      onAddTransaction({
        id: createId(),
        type: form.type,
        date: form.date,
        amount,
        title: form.title.trim(),
        category: form.category,
      });
    }

    // Reset Form (keep date & type)
    setForm((prev) => ({
      ...prev,
      amount: '',
      title: '',
    }));

    if (!isQuickAdd) {
      alert('성공적으로 등록되었습니다!');
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
}: {
  transaction: Transaction;
  onSave: (t: Transaction) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(transaction.date);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [title, setTitle] = useState(transaction.title);
  const categories = transaction.type === 'expense' ? expenseCategories : incomeCategories;
  const [category, setCategory] = useState(transaction.category);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = parseAmount(amount);
    if (!date || !title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      alert('금액과 내용을 올바르게 입력해주세요.');
      return;
    }

    onSave({
      ...transaction,
      date,
      amount: numericAmount,
      title: title.trim(),
      category,
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
