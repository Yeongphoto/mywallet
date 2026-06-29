import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { AssetFormState, AssetItem, CategoryOption, Transaction, TransactionFormState, TransactionType } from './types';

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

const STORAGE_KEY = 'mywallet:v1';

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
  return Number(value.replaceAll(',', '').trim());
}

function getCategoryLabel(categories: CategoryOption[], idOrLabel: string) {
  return categories.find((category) => category.id === idOrLabel || category.label === idOrLabel)?.label ?? idOrLabel;
}

function createTransactionForm(categories: CategoryOption[]): TransactionFormState {
  return {
    date: getToday(),
    amount: '',
    title: '',
    category: categories[0]?.id ?? 'etc',
  };
}

function createAssetForm(): AssetFormState {
  return {
    category: assetCategories[0]?.id ?? 'cash',
    amount: '',
    memo: '',
  };
}

function loadStoredData() {
  if (typeof window === 'undefined') {
    return { transactions: [] as Transaction[], assets: [] as AssetItem[] };
  }

  try {
    const rawData = window.localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
      return { transactions: [] as Transaction[], assets: [] as AssetItem[] };
    }

    const parsed = JSON.parse(rawData) as { transactions?: Transaction[]; assets?: AssetItem[] };
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    };
  } catch {
    return { transactions: [] as Transaction[], assets: [] as AssetItem[] };
  }
}

function sumAmount<T extends { amount: number }>(items: T[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function SummaryCard({ label, value, helper, tone }: { label: string; value: number; helper: string; tone: 'expense' | 'income' | 'asset' | 'balance' }) {
  return (
    <article className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
      <small>{helper}</small>
    </article>
  );
}

function FlowBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'expense' | 'income' | 'asset' }) {
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

function TransactionForm({ type, title, categories, onAdd }: { type: TransactionType; title: string; categories: CategoryOption[]; onAdd: (transaction: Transaction) => void }) {
  const [form, setForm] = useState<TransactionFormState>(() => createTransactionForm(categories));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = parseAmount(form.amount);
    if (!form.date || !form.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    onAdd({
      id: createId(),
      type,
      date: form.date,
      amount,
      title: form.title.trim(),
      category: form.category,
    });

    setForm(createTransactionForm(categories));
  }

  return (
    <form className={`entry-form ${type}`} onSubmit={handleSubmit}>
      <div className="entry-form-title">
        <strong>{title}</strong>
        <span>{type === 'expense' ? '엑셀 거래 시트의 왼쪽 영역' : '엑셀 거래 시트의 오른쪽 영역'}</span>
      </div>
      <div className="form-grid">
        <label>
          날짜
          <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
        </label>
        <label>
          금액
          <input inputMode="numeric" placeholder="0" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} />
        </label>
        <label>
          내용
          <input placeholder="예: 식비, 교통비" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
        </label>
        <label>
          카테고리
          <select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit">{title} 추가</button>
    </form>
  );
}

function AssetForm({ onAdd }: { onAdd: (asset: AssetItem) => void }) {
  const [form, setForm] = useState<AssetFormState>(() => createAssetForm());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = parseAmount(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    onAdd({
      id: createId(),
      category: form.category,
      amount,
      memo: form.memo.trim(),
    });

    setForm(createAssetForm());
  }

  return (
    <form className="asset-form" onSubmit={handleSubmit}>
      <label>
        자산 구분
        <select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
          {assetCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.label}</option>
          ))}
        </select>
      </label>
      <label>
        금액
        <input inputMode="numeric" placeholder="0" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} />
      </label>
      <label>
        메모
        <input placeholder="선택 입력" value={form.memo} onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))} />
      </label>
      <button type="submit">자산 추가</button>
    </form>
  );
}

function TransactionTable({ title, type, items, onDelete }: { title: string; type: TransactionType; items: Transaction[]; onDelete: (id: string) => void }) {
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
              <th aria-label="삭제" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">등록된 내역이 없습니다.</td>
              </tr>
            ) : (
              items.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>{formatCurrency(transaction.amount)}</td>
                  <td>{transaction.title}</td>
                  <td>{getCategoryLabel(categories, transaction.category)}</td>
                  <td><button type="button" className="delete-button" onClick={() => onDelete(transaction.id)}>삭제</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryColumn({ title, categories, values }: { title: string; categories: CategoryOption[]; values: Record<string, number> }) {
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

function aggregateByCategory(items: Transaction[] | AssetItem[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + item.amount;
    return acc;
  }, {});
}

export default function App() {
  const storedData = useMemo(() => loadStoredData(), []);
  const [transactions, setTransactions] = useState<Transaction[]>(storedData.transactions);
  const [assets, setAssets] = useState<AssetItem[]>(storedData.assets);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, assets }));
  }, [transactions, assets]);

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
  const expenseSummary = aggregateByCategory(monthlyExpenses);
  const incomeSummary = aggregateByCategory(monthlyIncomes);
  const assetSummary = aggregateByCategory(assets);

  function handleAddTransaction(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
    setSelectedMonth(transaction.date.slice(0, 7));
  }

  function handleDeleteTransaction(id: string) {
    setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
  }

  function handleDeleteAsset(id: string) {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }

  function handleReset() {
    if (window.confirm('입력된 거래와 자산을 모두 초기화할까요?')) {
      setTransactions([]);
      setAssets([]);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>MW</span>
          <div>
            <strong>MyWallet</strong>
            <small>엑셀 레퍼런스 기반 가계부</small>
          </div>
        </div>
        <nav>
          <a href="#monthly" className="active">월간 요약</a>
          <a href="#entry">거래 입력</a>
          <a href="#ledger">거래 장부</a>
          <a href="#asset">자산 관리</a>
        </nav>
      </aside>

      <section className="content" id="monthly">
        <header className="hero">
          <div>
            <p className="eyebrow">Excel Reference</p>
            <h1>{selectedMonth.replace('-', '.')} 가계부</h1>
            <p>엑셀의 월별 요약, 거래 입력, 카테고리 합계 구조를 웹앱 화면으로 옮긴 첫 버전입니다.</p>
          </div>
          <div className="hero-actions">
            <label>
              조회 월
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </label>
            <button type="button" className="danger-button" onClick={handleReset}>전체 초기화</button>
          </div>
        </header>

        <section className="summary-grid" aria-label="월간 요약">
          <SummaryCard label="지출" value={expenseTotal} helper="선택한 월의 총 지출" tone="expense" />
          <SummaryCard label="수입" value={incomeTotal} helper="선택한 월의 총 수입" tone="income" />
          <SummaryCard label="자산" value={assetTotal} helper="현재 입력된 자산 합계" tone="asset" />
          <SummaryCard label="잔액" value={balance} helper="수입에서 지출을 뺀 금액" tone="balance" />
        </section>

        <section className="flow-panel panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Monthly Flow</p>
              <h2>월간 흐름</h2>
            </div>
          </div>
          <FlowBar label="지출" value={expenseTotal} max={maxFlow} tone="expense" />
          <FlowBar label="수입" value={incomeTotal} max={maxFlow} tone="income" />
          <FlowBar label="자산" value={assetTotal} max={maxFlow} tone="asset" />
        </section>

        <section className="entry-grid" id="entry">
          <TransactionForm type="expense" title="지출" categories={expenseCategories} onAdd={handleAddTransaction} />
          <TransactionForm type="income" title="수입" categories={incomeCategories} onAdd={handleAddTransaction} />
        </section>

        <section className="dashboard-grid" id="ledger">
          <div className="panel panel-large">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Ledger</p>
                <h2>거래 장부</h2>
              </div>
              <span className="record-count">{monthlyTransactions.length}건</span>
            </div>
            <div className="split-ledger">
              <TransactionTable title="지출" type="expense" items={monthlyExpenses} onDelete={handleDeleteTransaction} />
              <TransactionTable title="수입" type="income" items={monthlyIncomes} onDelete={handleDeleteTransaction} />
            </div>
          </div>

          <div className="side-panels">
            <section className="panel" id="asset">
              <div className="panel-header compact">
                <div>
                  <p className="eyebrow">Assets</p>
                  <h2>자산 관리</h2>
                </div>
              </div>
              <AssetForm onAdd={(asset) => setAssets((prev) => [asset, ...prev])} />
              <div className="asset-list">
                {assets.length === 0 ? (
                  <p className="empty-note">자산 항목을 추가해보세요.</p>
                ) : (
                  assets.map((asset) => (
                    <article key={asset.id}>
                      <div>
                        <strong>{getCategoryLabel(assetCategories, asset.category)}</strong>
                        <span>{asset.memo || '메모 없음'}</span>
                      </div>
                      <b>{formatCurrency(asset.amount)}</b>
                      <button type="button" className="delete-button" onClick={() => handleDeleteAsset(asset.id)}>삭제</button>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="summary-table-grid panel">
          <div className="panel-header full">
            <div>
              <p className="eyebrow">Category Summary</p>
              <h2>카테고리별 합계</h2>
            </div>
          </div>
          <SummaryColumn title="지출" categories={expenseCategories} values={expenseSummary} />
          <SummaryColumn title="수입" categories={incomeCategories} values={incomeSummary} />
          <SummaryColumn title="자산" categories={assetCategories} values={assetSummary} />
        </section>
      </section>
    </main>
  );
}
