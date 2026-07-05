const RECOVERY_PRIMARY_KEY = 'mywallet:v2';
const RECOVERY_LEGACY_KEY = 'mywallet:v1';
const RECOVERY_BACKUP_KEY = 'mywallet:v2:pre-d1-backup';
const RECOVERY_BACKUP_PREFIX = 'mywallet:v2:backup:';

type RecoveryPayload = Record<string, any>;
type RecoveryCandidate = { key: string; label: string; raw: string; count: number; updatedAt: number };

declare global {
  interface Window {
    mywalletOpenLocalRecovery?: () => void;
    mywalletMountSettingsRecoveryButton?: () => void;
  }
}

function parsePayload(raw: string | null): RecoveryPayload | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function countPayload(data: RecoveryPayload | null) {
  if (!data) return 0;
  return [
    data.transactions,
    data.assets,
    data.plans,
    data.customExpenseCategories,
    data.customIncomeCategories,
    data.customAssetCategories,
    data.recurringRules,
    data.deletedRecurringTxs,
  ].reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0)
    + (data.categoryColors && typeof data.categoryColors === 'object' ? Object.keys(data.categoryColors).length : 0)
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
    categoryOrder: parsed.categoryOrder && typeof parsed.categoryOrder === 'object' ? parsed.categoryOrder : {},
    hiddenCategories: parsed.hiddenCategories && typeof parsed.hiddenCategories === 'object' ? parsed.hiddenCategories : {},
    recurringRules: Array.isArray(parsed.recurringRules) ? parsed.recurringRules : [],
    deletedRecurringTxs: Array.isArray(parsed.deletedRecurringTxs) ? parsed.deletedRecurringTxs : [],
    updatedAt: Date.now(),
  });
}

function collectCandidates() {
  const candidates: RecoveryCandidate[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string) => {
    const original = window.localStorage.getItem(key);
    if (!original) return;
    const raw = key === RECOVERY_LEGACY_KEY ? normalizeLegacy(original) : original;
    const parsed = parsePayload(raw);
    const count = countPayload(parsed);
    if (!parsed || count <= 0 || seen.has(raw)) return;
    seen.add(raw);
    candidates.push({ key, label, raw, count, updatedAt: Number(parsed.updatedAt) || 0 });
  };

  push(RECOVERY_BACKUP_KEY, 'D1 덮어쓰기 전 백업');
  push(RECOVERY_PRIMARY_KEY, '현재 Safari 로컬 데이터');
  push(RECOVERY_LEGACY_KEY, '이전 버전 로컬 데이터');

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(RECOVERY_BACKUP_PREFIX)) push(key, `시간별 백업 ${key.replace(RECOVERY_BACKUP_PREFIX, '')}`);
  }

  return candidates.sort((a, b) => (b.count - a.count) || (b.updatedAt - a.updatedAt));
}

async function restore(candidate: RecoveryCandidate) {
  const parsed = parsePayload(candidate.raw) ?? {};
  const payload = JSON.stringify({ ...parsed, updatedAt: Date.now() });
  window.localStorage.setItem(RECOVERY_PRIMARY_KEY, payload);

  const response = await window.fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (!response.ok) throw new Error('D1 저장 실패');
  window.alert('복구 완료. 새로고침합니다.');
  window.location.reload();
}

function openRecoveryPanel() {
  document.querySelector('.local-recovery-force-panel')?.remove();
  const candidates = collectCandidates();
  const panel = document.createElement('div');
  panel.className = 'local-recovery-force-panel';
  panel.style.cssText = 'position:fixed;left:12px;right:12px;bottom:96px;z-index:99999;padding:16px;border-radius:18px;background:#fff;color:#172033;box-shadow:0 18px 70px rgba(15,23,42,.32);font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
  panel.innerHTML = '<strong style="display:block;font-size:18px;margin-bottom:8px;">로컬 데이터 복구</strong><p style="margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.45;">Safari에 남아있는 로컬 데이터를 D1로 다시 올립니다. 항목 수가 가장 많은 후보를 선택하세요.</p>';

  if (candidates.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = '복구 가능한 로컬 후보를 찾지 못했습니다.';
    empty.style.cssText = 'margin:0 0 12px;color:#b42318;font-weight:800;';
    panel.appendChild(empty);
  }

  candidates.slice(0, 8).forEach((candidate) => {
    const button = document.createElement('button');
    const date = candidate.updatedAt ? new Date(candidate.updatedAt).toLocaleString('ko-KR') : '시간 정보 없음';
    button.textContent = `${candidate.label} · 항목 ${candidate.count}개 · ${date}`;
    button.style.cssText = 'display:block;width:100%;min-height:44px;margin:6px 0;padding:9px 10px;border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc;color:#172033;font-weight:900;text-align:left;';
    button.onclick = () => {
      if (window.confirm(`${candidate.label} 후보로 D1을 복구할까요?`)) {
        restore(candidate).catch((error) => window.alert(error instanceof Error ? error.message : '복구 실패'));
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

function mountRecoveryButton() {
  if (!document.body || document.querySelector('.local-recovery-force-button')) return;
  const button = document.createElement('button');
  button.className = 'local-recovery-force-button';
  button.textContent = '로컬 복구';
  button.style.cssText = 'position:fixed;left:12px;bottom:154px;z-index:99998;min-height:40px;padding:0 14px;border:1px solid rgba(23,32,51,.18);border-radius:999px;background:#fff;color:#172033;font-weight:900;box-shadow:0 10px 30px rgba(15,23,42,.22);';
  button.onclick = openRecoveryPanel;
  document.body.appendChild(button);
}

function bootRecoveryButton() {
  window.mywalletOpenLocalRecovery = openRecoveryPanel;
  mountRecoveryButton();
  window.setTimeout(mountRecoveryButton, 500);
  window.setTimeout(mountRecoveryButton, 1500);
  if (new URLSearchParams(window.location.search).get('recovery') === '1') {
    window.setTimeout(openRecoveryPanel, 800);
  }
}

if (typeof window !== 'undefined') {
  window.mywalletOpenLocalRecovery = openRecoveryPanel;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootRecoveryButton, { once: true });
  } else {
    bootRecoveryButton();
  }
}

export {};
