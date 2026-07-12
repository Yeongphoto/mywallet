const RECOVERY_PRIMARY_KEY = 'mywallet:v2';
const RECOVERY_LEGACY_KEY = 'mywallet:v1';
const RECOVERY_BACKUP_KEY = 'mywallet:v2:pre-d1-backup';
const RECOVERY_BACKUP_PREFIX = 'mywallet:v2:backup:';

type RecoveryPayload = {
  transactions?: unknown[];
  assets?: unknown[];
  customExpenseCategories?: unknown[];
  customIncomeCategories?: unknown[];
  customAssetCategories?: unknown[];
  categoryColors?: Record<string, unknown>;
  categoryLabels?: Record<string, unknown>;
  categoryBudgetExcluded?: Record<string, unknown>;
  categoryOrder?: Record<string, unknown>;
  hiddenCategories?: Record<string, unknown>;
  recurringRules?: unknown[];
  deletedRecurringTxs?: unknown[];
  updatedAt?: number;
  [key: string]: unknown;
};

type RecoveryCandidate = {
  key: string;
  label: string;
  raw: string;
  count: number;
  updatedAt: number;
};

function parsePayload(raw: string | null): RecoveryPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecoveryPayload;
  } catch {
    return null;
  }
}

function scorePayload(data: RecoveryPayload | null) {
  if (!data) return 0;
  return [
    data.transactions,
    data.assets,
    data.customExpenseCategories,
    data.customIncomeCategories,
    data.customAssetCategories,
    data.recurringRules,
    data.deletedRecurringTxs,
  ].reduce((total, item) => total + (Array.isArray(item) ? item.length : 0), 0)
    + (data.categoryColors && typeof data.categoryColors === 'object' ? Object.keys(data.categoryColors).length : 0)
    + (data.categoryLabels && typeof data.categoryLabels === 'object' ? Object.keys(data.categoryLabels).length : 0)
    + (data.categoryBudgetExcluded && typeof data.categoryBudgetExcluded === 'object' ? Object.keys(data.categoryBudgetExcluded).length : 0)
    + (data.categoryOrder && typeof data.categoryOrder === 'object' ? Object.keys(data.categoryOrder).length : 0)
    + (data.hiddenCategories && typeof data.hiddenCategories === 'object' ? Object.keys(data.hiddenCategories).length : 0);
}

function normalizeLegacyPayload(raw: string) {
  const parsed = parsePayload(raw);
  if (!parsed) return raw;
  if (Array.isArray(parsed.transactions) || Array.isArray(parsed.assets)) {
    return JSON.stringify({
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      budget: typeof parsed.budget === 'number' ? parsed.budget : 1000000,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      customExpenseCategories: Array.isArray(parsed.customExpenseCategories) ? parsed.customExpenseCategories : [],
      customIncomeCategories: Array.isArray(parsed.customIncomeCategories) ? parsed.customIncomeCategories : [],
      customAssetCategories: Array.isArray(parsed.customAssetCategories) ? parsed.customAssetCategories : [],
      categoryColors: parsed.categoryColors && typeof parsed.categoryColors === 'object' ? parsed.categoryColors : {},
      categoryLabels: parsed.categoryLabels && typeof parsed.categoryLabels === 'object' ? parsed.categoryLabels : {},
      categoryBudgetExcluded: parsed.categoryBudgetExcluded && typeof parsed.categoryBudgetExcluded === 'object' ? parsed.categoryBudgetExcluded : {},
      categoryOrder: parsed.categoryOrder && typeof parsed.categoryOrder === 'object' ? parsed.categoryOrder : {},
      hiddenCategories: parsed.hiddenCategories && typeof parsed.hiddenCategories === 'object' ? parsed.hiddenCategories : {},
      recurringRules: Array.isArray(parsed.recurringRules) ? parsed.recurringRules : [],
      deletedRecurringTxs: Array.isArray(parsed.deletedRecurringTxs) ? parsed.deletedRecurringTxs : [],
      updatedAt: Date.now(),
    });
  }
  return raw;
}

function collectRecoveryCandidates() {
  const candidates: RecoveryCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (key: string, label: string) => {
    const rawOriginal = window.localStorage.getItem(key);
    if (!rawOriginal) return;
    const raw = key === RECOVERY_LEGACY_KEY ? normalizeLegacyPayload(rawOriginal) : rawOriginal;
    const parsed = parsePayload(raw);
    const count = scorePayload(parsed);
    if (!parsed || count <= 0 || seen.has(raw)) return;
    seen.add(raw);
    candidates.push({
      key,
      label,
      raw,
      count,
      updatedAt: Number(parsed.updatedAt) || 0,
    });
  };

  pushCandidate(RECOVERY_BACKUP_KEY, 'D1 덮어쓰기 전 자동 백업');
  pushCandidate(RECOVERY_PRIMARY_KEY, '현재 로컬 캐시');
  pushCandidate(RECOVERY_LEGACY_KEY, '이전 버전 로컬 데이터');

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(RECOVERY_BACKUP_PREFIX)) continue;
    pushCandidate(key, `시간별 백업 ${key.replace(RECOVERY_BACKUP_PREFIX, '')}`);
  }

  return candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.updatedAt - a.updatedAt;
  });
}

async function restoreCandidate(candidate: RecoveryCandidate) {
  const parsed = parsePayload(candidate.raw) ?? {};
  const payload = JSON.stringify({ ...parsed, updatedAt: Date.now() });

  window.localStorage.setItem(RECOVERY_PRIMARY_KEY, payload);

  const response = await window.fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (!response.ok) {
    throw new Error('D1 저장 실패');
  }

  window.alert('로컬 데이터 복구가 완료됐습니다. 화면을 새로고침합니다.');
  window.location.reload();
}

function showRecoveryPanel() {
  const candidates = collectRecoveryCandidates();
  const existing = document.querySelector('.local-recovery-panel');
  existing?.remove();

  const panel = document.createElement('div');
  panel.className = 'local-recovery-panel';
  panel.style.cssText = `
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 112px;
    z-index: 5000;
    padding: 16px;
    border-radius: 18px;
    background: rgba(255,255,255,.96);
    box-shadow: 0 18px 60px rgba(15,23,42,.24);
    color: #172033;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const title = document.createElement('strong');
  title.textContent = '로컬 데이터 복구';
  title.style.cssText = 'display:block;font-size:18px;margin-bottom:8px;';
  panel.appendChild(title);

  const desc = document.createElement('p');
  desc.textContent = candidates.length > 0
    ? '복구 가능한 로컬 후보를 찾았습니다. 가장 데이터가 많은 후보부터 표시됩니다.'
    : '현재 브라우저에서 복구 가능한 로컬 후보를 찾지 못했습니다.';
  desc.style.cssText = 'margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.45;';
  panel.appendChild(desc);

  candidates.slice(0, 6).forEach((candidate) => {
    const button = document.createElement('button');
    const date = candidate.updatedAt ? new Date(candidate.updatedAt).toLocaleString('ko-KR') : '시간 정보 없음';
    button.textContent = `${candidate.label} · 항목 ${candidate.count}개 · ${date}`;
    button.style.cssText = `
      width: 100%;
      min-height: 42px;
      margin: 6px 0;
      padding: 8px 10px;
      border: 1px solid #dbe3ef;
      border-radius: 12px;
      background: #f8fafc;
      color: #172033;
      font-weight: 800;
      text-align: left;
    `;
    button.onclick = () => {
      if (window.confirm(`${candidate.label} 후보로 D1 데이터를 복구할까요?`)) {
        restoreCandidate(candidate).catch((error) => window.alert(error instanceof Error ? error.message : '복구 실패'));
      }
    };
    panel.appendChild(button);
  });

  const close = document.createElement('button');
  close.textContent = '닫기';
  close.style.cssText = `
    width: 100%;
    min-height: 38px;
    margin-top: 10px;
    border: 0;
    border-radius: 12px;
    background: #172033;
    color: white;
    font-weight: 900;
  `;
  close.onclick = () => panel.remove();
  panel.appendChild(close);

  document.body.appendChild(panel);
}

function mountRecoveryButton() {
  if (document.querySelector('.local-recovery-button')) return;
  const button = document.createElement('button');
  button.className = 'local-recovery-button';
  button.textContent = '로컬 복구';
  button.style.cssText = `
    position: fixed;
    left: 14px;
    bottom: 112px;
    z-index: 4200;
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid rgba(23,32,51,.16);
    border-radius: 999px;
    background: rgba(255,255,255,.92);
    color: #172033;
    font-weight: 900;
    box-shadow: 0 8px 24px rgba(15,23,42,.16);
  `;
  button.onclick = showRecoveryPanel;
  document.body.appendChild(button);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(mountRecoveryButton, 800);
  });
}
