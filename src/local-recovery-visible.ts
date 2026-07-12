const SERVER_PUSH_PRIMARY_KEY = 'mywallet:v2';
const SERVER_PUSH_LEGACY_KEY = 'mywallet:v1';
const SERVER_PUSH_BACKUP_KEY = 'mywallet:v2:pre-d1-backup';
const SERVER_PUSH_BACKUP_PREFIX = 'mywallet:v2:backup:';

type ServerPushPayload = Record<string, unknown>;
type ServerPushCandidate = { key: string; label: string; raw: string; count: number; updatedAt: number };

declare global {
  interface Window {
    mywalletOpenLocalRecovery?: () => void;
    mywalletMountSettingsRecoveryButton?: () => void;
  }
}

function parsePayload(raw: string | null): ServerPushPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServerPushPayload;
  } catch {
    return null;
  }
}

function countPayload(data: ServerPushPayload | null) {
  if (!data) return 0;
  return ([
    data.transactions,
    data.assets,
    data.plans,
    data.customExpenseCategories,
    data.customIncomeCategories,
    data.customAssetCategories,
    data.recurringRules,
    data.deletedRecurringTxs,
  ] as unknown[]).reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0)
    + (data.categoryColors && typeof data.categoryColors === 'object' ? Object.keys(data.categoryColors).length : 0)
    + (data.categoryLabels && typeof data.categoryLabels === 'object' ? Object.keys(data.categoryLabels).length : 0)
    + (data.categoryBudgetExcluded && typeof data.categoryBudgetExcluded === 'object' ? Object.keys(data.categoryBudgetExcluded).length : 0)
    + (data.categoryOrder && typeof data.categoryOrder === 'object' ? Object.keys(data.categoryOrder).length : 0)
    + (data.hiddenCategories && typeof data.hiddenCategories === 'object' ? Object.keys(data.hiddenCategories).length : 0);
}

function normalizeLegacy(raw: string) {
  const parsed = parsePayload(raw);
  if (!parsed) return raw;
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

function collectCandidates() {
  const candidates: ServerPushCandidate[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string) => {
    const original = window.localStorage.getItem(key);
    if (!original) return;
    const raw = key === SERVER_PUSH_LEGACY_KEY ? normalizeLegacy(original) : original;
    const parsed = parsePayload(raw);
    const count = countPayload(parsed);
    if (!parsed || count <= 0 || seen.has(raw)) return;
    seen.add(raw);
    candidates.push({ key, label, raw, count, updatedAt: Number(parsed.updatedAt) || 0 });
  };

  push(SERVER_PUSH_BACKUP_KEY, 'D1 덮어쓰기 전 자동 백업');
  push(SERVER_PUSH_PRIMARY_KEY, '현재 브라우저 로컬 데이터');
  push(SERVER_PUSH_LEGACY_KEY, '이전 버전 로컬 데이터');

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(SERVER_PUSH_BACKUP_PREFIX)) {
      push(key, `시간별 백업 ${key.replace(SERVER_PUSH_BACKUP_PREFIX, '')}`);
    }
  }

  return candidates.sort((a, b) => (b.count - a.count) || (b.updatedAt - a.updatedAt));
}

async function pushCandidateToServer(candidate: ServerPushCandidate) {
  const parsed = parsePayload(candidate.raw) ?? {};
  const payload = JSON.stringify({ ...parsed, updatedAt: Date.now() });
  window.localStorage.setItem(SERVER_PUSH_PRIMARY_KEY, payload);

  const response = await window.fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (!response.ok) throw new Error('서버 저장 실패');
  window.alert('서버 반영이 완료되었습니다. 새로고침합니다.');
  window.location.reload();
}

function openServerPushPanel() {
  document.querySelector('.local-recovery-force-panel')?.remove();
  const candidates = collectCandidates();
  const panel = document.createElement('div');
  panel.className = 'local-recovery-force-panel';
  panel.style.cssText = 'position:fixed;left:12px;right:12px;bottom:96px;z-index:99999;padding:16px;border-radius:18px;background:#fff;color:#172033;box-shadow:0 18px 70px rgba(15,23,42,.32);font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
  panel.innerHTML = '<strong style="display:block;font-size:18px;margin-bottom:8px;">로컬 데이터 서버 반영</strong><p style="margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.45;">브라우저에 남아있는 로컬 데이터를 D1 서버에 강제로 저장합니다. 항목 수와 시간을 확인하고 선택하세요.</p>';

  if (candidates.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = '서버에 반영할 로컬 후보를 찾지 못했습니다.';
    empty.style.cssText = 'margin:0 0 12px;color:#b42318;font-weight:800;';
    panel.appendChild(empty);
  }

  candidates.slice(0, 8).forEach((candidate) => {
    const button = document.createElement('button');
    const date = candidate.updatedAt ? new Date(candidate.updatedAt).toLocaleString('ko-KR') : '시간 정보 없음';
    button.textContent = `${candidate.label} · 항목 ${candidate.count}개 · ${date}`;
    button.style.cssText = 'display:block;width:100%;min-height:44px;margin:6px 0;padding:9px 10px;border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc;color:#172033;font-weight:900;text-align:left;';
    button.onclick = () => {
      if (window.confirm(`${candidate.label} 후보를 서버에 반영할까요? 현재 서버 데이터가 이 후보로 교체됩니다.`)) {
        pushCandidateToServer(candidate).catch((error) => window.alert(error instanceof Error ? error.message : '서버 반영 실패'));
      }
    };
    panel.appendChild(button);
  });

  const close = document.createElement('button');
  close.textContent = '닫기';
  close.style.cssText = 'display:block;width:100%;min-height:40px;margin-top:10px;border:0;border-radius:12px;background:#172033;color:#fff;font-weight:900;';
  close.onclick = () => panel.remove();
  panel.appendChild(close);
  document.body.appendChild(panel);
}

function bootServerPushButton() {
  window.mywalletOpenLocalRecovery = openServerPushPanel;
  document.querySelectorAll<HTMLElement>('.local-recovery-force-button, .local-recovery-button').forEach((button) => {
    button.style.display = 'none';
  });
  if (new URLSearchParams(window.location.search).get('recovery') === '1') {
    window.setTimeout(openServerPushPanel, 800);
  }
}

if (typeof window !== 'undefined') {
  window.mywalletOpenLocalRecovery = openServerPushPanel;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootServerPushButton, { once: true });
  } else {
    bootServerPushButton();
  }
}

export {};
