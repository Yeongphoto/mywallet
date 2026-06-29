import { budgets, categoryLabels, transactions } from './data/sample';
import type { Transaction, TransactionCategory } from './types';

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function getTotalByType(type: Transaction['type']) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function getSpentByCategory(category: TransactionCategory) {
  return transactions
    .filter((transaction) => transaction.type === 'expense' && transaction.category === category)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function SummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
      <small>{helper}</small>
    </article>
  );
}

function TransactionList() {
  return (
    <section className="panel panel-large">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Transactions</p>
          <h2>최근 거래내역</h2>
        </div>
        <button type="button" className="ghost-button">거래 추가</button>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">
          <strong>아직 등록된 거래가 없습니다.</strong>
          <p>다음 단계에서 거래 추가 폼과 저장 기능을 연결하면 됩니다.</p>
        </div>
      ) : (
        <ul className="transaction-list">
          {transactions.map((transaction) => (
            <li key={transaction.id}>
              <div>
                <strong>{transaction.title}</strong>
                <span>{categoryLabels[transaction.category]} · {transaction.date}</span>
              </div>
              <b className={transaction.type === 'income' ? 'income' : 'expense'}>
                {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BudgetPanel() {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Budget</p>
          <h2>예산 현황</h2>
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="empty-state small">
          <strong>예산 항목이 없습니다.</strong>
          <p>식비, 교통, 쇼핑처럼 자주 쓰는 항목부터 추가해보면 좋습니다.</p>
        </div>
      ) : (
        <div className="budget-list">
          {budgets.map((budget) => {
            const spent = getSpentByCategory(budget.category);
            const ratio = budget.limit > 0 ? Math.min((spent / budget.limit) * 100, 100) : 0;

            return (
              <article key={budget.category} className="budget-item">
                <div>
                  <strong>{budget.label}</strong>
                  <span>{formatCurrency(spent)} / {formatCurrency(budget.limit)}</span>
                </div>
                <div className="progress-bar" aria-label={`${budget.label} 예산 사용률`}>
                  <i style={{ width: `${ratio}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CategoryPanel() {
  const expenseCategories = Object.entries(categoryLabels).filter(([key]) => key !== 'salary');

  return (
    <section className="panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Categories</p>
          <h2>카테고리</h2>
        </div>
      </div>
      <div className="category-grid">
        {expenseCategories.map(([key, label]) => (
          <button type="button" key={key}>
            <span>{label}</span>
            <b>{formatCurrency(getSpentByCategory(key as TransactionCategory))}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const income = getTotalByType('income');
  const expense = getTotalByType('expense');
  const balance = income - expense;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>MW</span>
          <div>
            <strong>MyWallet</strong>
            <small>개인 가계부</small>
          </div>
        </div>
        <nav>
          <a href="#dashboard" className="active">대시보드</a>
          <a href="#transactions">거래내역</a>
          <a href="#budget">예산</a>
          <a href="#categories">카테고리</a>
        </nav>
      </aside>

      <section className="content" id="dashboard">
        <header className="hero">
          <div>
            <p className="eyebrow">Household Ledger</p>
            <h1>이번 달 돈 흐름을 한눈에 봅니다.</h1>
            <p>처음 버전은 화면 구조 중심입니다. 이후 입력 폼, 저장소, 통계 기능을 차례대로 붙이면 됩니다.</p>
          </div>
          <button type="button" className="primary-button">새 거래 등록</button>
        </header>

        <section className="summary-grid" aria-label="월간 요약">
          <SummaryCard label="수입" value={income} helper="이번 달 들어온 금액" />
          <SummaryCard label="지출" value={expense} helper="이번 달 사용한 금액" />
          <SummaryCard label="잔액" value={balance} helper="수입에서 지출을 뺀 금액" />
        </section>

        <section className="dashboard-grid">
          <div id="transactions">
            <TransactionList />
          </div>
          <div className="side-panels">
            <div id="budget"><BudgetPanel /></div>
            <div id="categories"><CategoryPanel /></div>
          </div>
        </section>
      </section>
    </main>
  );
}
