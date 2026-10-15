import { guestKey, localSnapshot } from './local-wallet.ts';
import type { LocalSnapshot, Row } from './local-wallet.ts';
import type { WalletContext } from './wallet-scope.ts';

export type ImportStep = { body: Row; kind: string; id: string; expected?: Row };
export type ImportJob = { version: 1; guestId: string; target: WalletContext; snapshot: LocalSnapshot; steps: ImportStep[]; next: number; completed: boolean };
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

export function buildImportSteps(source: LocalSnapshot, prefix: string): ImportStep[] {
  // The existing web API cannot round-trip rule times. Refuse before writing any rows.
  if (source.recurringRules.some(r => r.time)) throw new Error('RULE_TIME_UNSUPPORTED');
  const steps: ImportStep[] = [], ids = new Map<string, string>();
  const map = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (!ids.has(id)) ids.set(id, `${prefix}-${ids.size}`);
    return ids.get(id)!;
  };
  const categoryIds = new Map<string, string>();
  for (const [type, field] of [['expense', 'customExpenseCategories'], ['income', 'customIncomeCategories'], ['asset', 'customAssetCategories']]) {
    for (const c of source[field] || []) {
      const id = map(`category:${type}:${c.id}`)!;
      categoryIds.set(`${type}:${c.id}`, id);
      const label = source.categoryLabels[c.id] || c.label;
      const color = source.categoryColors[`${type}:${c.id}`] || c.color;
      steps.push({ kind: field, id, expected: { label, color: color || null }, body: { op: 'category.create', id, type, label, color, kind: c.kind } });
    }
  }
  const category = (type: string, id: string) => categoryIds.get(`${type}:${id}`) || id;
  for (const a of source.assets) map(a.id);
  for (const r of source.recurringRules) map(r.id);
  const recurringId = (id: string) => {
    const match = /^rec_(.+)_(\d{4}-\d{2})$/.exec(id);
    return match ? `rec_${map(match[1])}_${match[2]}` : map(id)!;
  };
  for (const t of source.transactions) ids.set(t.id, /^rec_/.test(t.id) ? recurringId(t.id) : map(t.id)!);
  const assetSteps = source.assets.map(a => {
    const asset = { ...a, id: map(a.id), category: category('asset', a.category), cardPaymentAssetId: map(a.cardPaymentAssetId),
      name: a.name || a.memo || a.category, memo: a.memo || '', amount: 0, revision: 1 };
    return { body: { op: 'asset.create', asset }, kind: 'assets', id: asset.id!, expected: asset };
  });
  // Payment accounts precede the cards which reference them. Reject cycles rather than break references.
  const ordered = new Set<string>();
  while (assetSteps.length) {
    const index = assetSteps.findIndex(s => !s.body.asset.cardPaymentAssetId || ordered.has(s.body.asset.cardPaymentAssetId));
    if (index < 0) throw new Error('INVALID_CARD_PAYMENT_ACCOUNT');
    const [step] = assetSteps.splice(index, 1); steps.push(step); ordered.add(step.id);
  }
  for (const a of source.assets) {
    // Historical backups may have a nonzero legacy opening amount with no opening transaction.
    if (Number(a.amount)) {
      const transaction = { id: map(`legacy-opening:${a.id}`), type: a.amount > 0 ? 'income' : 'expense', date: '2000-01-01',
        amount: Math.abs(a.amount), title: '기초잔액', category: 'opening-balance', assetId: map(a.id), time: null };
      steps.push({ kind: 'transactions', id: transaction.id!, expected: transaction, body: { op: 'transaction.create', operationId: map(`operation:${transaction.id}`), transaction } });
    }
  }
  for (const r of source.recurringRules) {
    const rule = { ...r, id: map(r.id), category: category(r.type, r.category), assetId: map(r.assetId), toAssetId: map(r.toAssetId), time: null };
    steps.push({ kind: 'recurringRules', id: rule.id!, expected: rule, body: { op: 'recurring_rule.create', rule } });
  }
  const settlementTxIds = new Set(source.cardSettlements.map(s => s.transactionId));
  for (const t of source.transactions.filter(t => !settlementTxIds.has(t.id))) {
    const transaction = { ...t, id: ids.get(t.id), category: category(t.type, t.category), assetId: map(t.assetId), toAssetId: map(t.toAssetId),
      recurringRuleId: map(t.recurringRuleId), installmentGroupId: map(t.installmentGroupId), cardSettlementId: null, revision: 1 };
    steps.push({ kind: 'transactions', id: transaction.id!, expected: transaction, body: { op: 'transaction.create', operationId: map(`operation:${transaction.id}`), transaction } });
  }
  for (const s of [...source.cardSettlements].sort((a, b) => a.settledAt - b.settledAt)) {
    const transfer = source.transactions.find(t => t.id === s.transactionId);
    if (!transfer) throw new Error('INVALID_CARD_SETTLEMENT');
    const amount = source.transactions.filter(t => t.cardSettlementId === s.id && t.id !== s.transactionId).reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount), 0);
    if (amount !== s.amount || transfer.amount !== s.amount) throw new Error('INVALID_CARD_SETTLEMENT');
    steps.push({ kind: 'cardSettlements', id: map(s.id)!, expected: { id: map(s.id), cardAssetId: map(s.cardAssetId), paymentAssetId: map(s.paymentAssetId),
      periodStart: s.periodStart, periodEnd: s.periodEnd, dueDate: s.dueDate, amount: s.amount, transactionId: ids.get(s.transactionId) }, body: { op: 'card.settle', operationId: map(`settle:${s.id}`), settlementId: map(s.id),
      transactionId: ids.get(s.transactionId), cardAssetId: map(s.cardAssetId), paymentAssetId: map(s.paymentAssetId),
      periodStart: s.periodStart, periodEnd: s.periodEnd, dueDate: s.dueDate, settledDate: transfer.date } });
  }
  for (const id of source.deletedRecurringTxs) {
    const mapped = recurringId(id);
    steps.push({ kind: 'deletedRecurringTxs', id: mapped, body: { op: 'recurring_tx.delete', id: mapped } });
  }
  // Only new custom-category plans are added. Built-in/shared budgets and preferences retain their current values.
  for (const p of source.plans) {
    const mapped = categoryIds.get(`${p.type}:${p.category}`);
    if (mapped) steps.push({ kind: 'plans', id: `${p.type}:${mapped}`, expected: { ...p, category: mapped }, body: { op: 'plan.upsert', ...p, category: mapped } });
  }
  return steps;
}
export function readImportJob(id: string, storage = window.localStorage): ImportJob | null {
  const raw = storage.getItem(guestKey(id, 'sync-job'));
  if (!raw) return null;
  const job = JSON.parse(raw);
  if (job.version !== 1 || job.guestId !== id || !Array.isArray(job.steps) || !Number.isInteger(job.next)) throw new Error('LOCAL_SYNC_INVALID');
  return job;
}
export function startImportJob(id: string, target: WalletContext, storage = window.localStorage): ImportJob {
  if (target.mode !== 'shared-web' || !['owner', 'editor'].includes(target.ledger.role)) throw new Error('WALLET_WRITE_DENIED');
  const previous = readImportJob(id, storage);
  if (previous) {
    if (previous.target.user.id !== target.user.id || previous.target.ledger.id !== target.ledger.id) throw new Error('SYNC_ACCOUNT_CHANGED');
    return previous;
  }
  const snapshot = localSnapshot(storage, id);
  const steps = buildImportSteps(snapshot, `guest-${crypto.randomUUID()}`);
  const job: ImportJob = { version: 1, guestId: id, target, snapshot, steps, next: 0, completed: false };
  // Store the immutable source, mapping and checkpoint before any cloud writes.
  storage.setItem(guestKey(id, 'sync-job'), JSON.stringify(job));
  return job;
}
async function cloud(requestFetch: typeof fetch, method: string, body?: Row) {
  const response = await requestFetch('/api/data', { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'SYNC_FAILED');
  return result;
}
function existing(step: ImportStep, snapshot: LocalSnapshot) {
  if (step.kind === 'deletedRecurringTxs') return snapshot.deletedRecurringTxs.includes(step.id);
  if (step.kind === 'plans') return snapshot.plans.find(p => `${p.type}:${p.category}` === step.id);
  return (snapshot[step.kind] || []).find((r: Row) => r.id === step.id);
}
function matches(step: ImportStep, row: Row) {
  if (!step.expected) return true;
  const keys = step.kind === 'transactions' ? ['id', 'type', 'date', 'time', 'amount', 'title', 'category', 'assetId', 'toAssetId', 'recurringRuleId', 'installmentGroupId', 'installmentIndex', 'installmentMonths']
    : step.kind === 'assets' ? ['id', 'category', 'name', 'memo', 'amount', 'cardPaymentAssetId', 'cardCycleStartDay', 'cardCycleEndDay', 'cardPaymentDay']
    : step.kind === 'recurringRules' ? ['id', 'type', 'day', 'time', 'amount', 'title', 'category', 'assetId', 'toAssetId', 'startMonth', 'endMonth'] : Object.keys(step.expected);
  return keys.every(k => same(row[k] ?? null, step.expected![k] ?? null));
}
export async function runImportJob(job: ImportJob, getContext: () => Promise<WalletContext>, requestFetch: typeof fetch = window.fetch.bind(window), storage = window.localStorage, progress: (n: number, total: number) => void = () => {}) {
  if (job.completed) return;
  const scopedFetch:typeof fetch=(input,init)=>{
    const headers=new Headers(init?.headers);headers.set('X-Memoney-Ledger',job.target.ledger.id);
    return requestFetch(input,{...init,headers});
  };
  const verify = async () => {
    const target = await getContext();
    if (target.mode !== 'shared-web' || target.user.id !== job.target.user.id || target.ledger.id !== job.target.ledger.id || target.ledger.role === 'viewer') throw new Error('SYNC_ACCOUNT_CHANGED');
  };
  await verify();
  let snapshot = await cloud(scopedFetch, 'GET') as LocalSnapshot;
  for (; job.next < job.steps.length;) {
    await verify();
    const step = job.steps[job.next], row = existing(step, snapshot);
    if (row && !matches(step, row)) throw new Error('SYNC_IMPORTED_RECORD_CHANGED');
    if (!row) {
      await cloud(scopedFetch, 'PATCH', step.body);
      // Confirm the committed row; restart uses the same IDs and never duplicates an uncertain write.
      snapshot = await cloud(scopedFetch, 'GET') as LocalSnapshot;
      const saved = existing(step, snapshot);
      if (!saved || !matches(step, saved)) throw new Error('SYNC_VERIFY_FAILED');
    }
    job.next++;
    storage.setItem(guestKey(job.guestId, 'sync-job'), JSON.stringify(job));
    progress(job.next, job.steps.length);
  }
  await verify();
  job.completed = true;
  storage.setItem(guestKey(job.guestId, 'sync-job'), JSON.stringify(job));
}
