// The guest ledger is authoritative only in explicitly selected local mode.
// Account caches and the legacy web keys are never read or migrated here.
export const GUEST_ID_KEY = 'memoney:guest:active-id';
export const MODE_KEY = 'memoney:wallet-mode';
export type Row = Record<string, any>;
export type LocalSnapshot = Record<string, any> & {
  transactions: Row[]; assets: Row[]; plans: Row[]; recurringRules: Row[];
  deletedRecurringTxs: string[]; cardSettlements: Row[];
};
const generations=new Map<string,string>();
export function guestGeneration(id:string,storage=window.localStorage) { return storage.getItem(`memoney:guest:${id}:recovery-generation`)||'initial'; }
export function pinGuestGeneration(id:string,storage=window.localStorage) {generations.set(id,guestGeneration(id,storage));}
export function assertGuestGeneration(id:string,storage=window.localStorage) {
  if(generations.has(id)&&generations.get(id)!==guestGeneration(id,storage))throw Error('LOCAL_GENERATION_CHANGED');
}
export function guestKey(id: string, key = 'mywallet:v2') {
  const generation=generations.get(id);
  return `memoney:guest:${id}:${key}`+(key==='mywallet:v2'&&generation&&generation!=='initial'?`:generation:${generation}`:'');
}
export function withGuestLock<T>(id:string,action:()=>T):T|Promise<T> {
  return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(`memoney-local:${id}`,action):action();
}
export function activeGuestId(storage = window.localStorage) {
  let id = storage.getItem(GUEST_ID_KEY);
  if (!id) { id = crypto.randomUUID(); storage.setItem(GUEST_ID_KEY, id); }
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('LOCAL_STORAGE_INVALID');
  return id;
}
export function localSnapshot(storage: Pick<Storage, 'getItem'>, id: string): LocalSnapshot {
  const raw = storage.getItem(guestKey(id));
  const empty = { transactions: [], assets: [], plans: [], recurringRules: [], deletedRecurringTxs: [], cardSettlements: [],
    customExpenseCategories: [], customIncomeCategories: [], customAssetCategories: [], budget: 1000000,
    categoryColors: {}, categoryLabels: {}, categoryBudgetExcluded: {}, categoryOrder: {}, hiddenCategories: {}, hiddenAssets: {},
    assetOrderRevisions: {}, categoryOrderRevisions: {}, updatedAt: 0, cursor: 0 };
  if (!raw) return empty;
  const data = JSON.parse(raw);
  for (const field of ['transactions', 'assets', 'plans', 'recurringRules', 'deletedRecurringTxs']) {
    if (!Array.isArray(data[field])) throw new Error('LOCAL_STORAGE_INVALID');
  }
  if (data.transactions.some((t: Row) => !t || typeof t.id !== 'string' || typeof t.title !== 'string' || !['income', 'expense', 'transfer'].includes(t.type) || !Number.isFinite(Number(t.amount))) ||
      data.assets.some((a: Row) => !a || typeof a.id !== 'string' || typeof a.category !== 'string') ||
      data.recurringRules.some((r: Row) => !r || typeof r.id !== 'string' || typeof r.startMonth !== 'string') ||
      data.deletedRecurringTxs.some((id: unknown) => typeof id !== 'string')) throw new Error('LOCAL_STORAGE_INVALID');
  return { ...empty, ...data };
}
export function persistLocalView(id: string, view: Row, storage = window.localStorage) {
  return withGuestLock(id,()=>{
  assertGuestGeneration(id,storage);
  const current = localSnapshot(storage, id);
  const job = storage.getItem(guestKey(id, 'sync-job'));
  if (job && !JSON.parse(job).completed) return;
  // Keep settlements, order revisions and completed operation receipts which App's view does not contain.
  const changed = Object.keys(view).some(k => !['updatedAt', 'theme', 'styleTheme'].includes(k) && stable(view[k]) !== stable(current[k]));
  const updatedAt = Math.max(current.updatedAt || 0, view.updatedAt || 0, changed ? Date.now() : 0);
  storage.setItem(guestKey(id), JSON.stringify({ ...current, ...view, updatedAt }));
  });
}
class LocalError extends Error {
  status: number; current: unknown;
  constructor(code: string, status = 400, current?: unknown) { super(code); this.status = status; this.current = current; }
}
function requireValue(value: unknown, code = 'BAD_REQUEST'): asserts value { if (!value) throw new LocalError(code); }
function tx(row: Row): Row {
  requireValue(row?.id && ['expense', 'income', 'transfer'].includes(row.type) && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number(row.amount) > 0 && Number.isFinite(Number(row.amount)) && row.title && row.category);
  return { ...row, amount: Number(row.amount), time: /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time || '') ? row.time : null, revision: row.revision || 1 };
}
function revision(row: Row | undefined, expected: unknown, type: string) {
  if (!row || Number(expected) !== (row.revision || 1)) throw new LocalError('REVISION_CONFLICT', 409, { [type]: row || null });
}
function categoryField(type: string) {
  requireValue(['expense', 'income', 'asset', 'liability'].includes(type));
  return type === 'expense' ? 'customExpenseCategories' : type === 'income' ? 'customIncomeCategories' : 'customAssetCategories';
}
function mutate(data: LocalSnapshot, body: Row): Row {
  const success: Row = { success: true, operationId: body.operationId };
  const op = body.op;
  if (op === 'transaction.create' || op === 'transaction.createBatch') {
    const rows = (op === 'transaction.create' ? [body.transaction] : body.transactions)?.map(tx);
    requireValue(rows?.length && new Set(rows.map((r: Row) => r.id)).size === rows.length);
    if (rows.some((r: Row) => data.transactions.some(t => t.id === r.id))) throw new LocalError('REVISION_CONFLICT', 409);
    data.transactions.push(...rows.map((r: Row) => ({ ...r, revision: 1 })));
    return { ...success, transaction: op === 'transaction.create' ? rows[0] : undefined, transactions: rows };
  }
  if (op === 'transaction.update' || op === 'transaction.delete') {
    const id = body.transactionId || body.transaction?.id;
    const current = data.transactions.find(r => r.id === id);
    revision(current, body.expectedRevision, 'transaction');
    if (op === 'transaction.delete') { data.transactions = data.transactions.filter(r => r.id !== id); return { ...success, transactionId: id, deleted: true }; }
    const next = tx({ ...current, ...body.transaction, revision: (current!.revision || 1) + 1 });
    data.transactions = data.transactions.map(r => r.id === id ? next : r);
    return { ...success, transaction: next };
  }
  if (op === 'asset.create' || op === 'asset.update') {
    const asset = body.asset;
    requireValue(asset?.id && asset.category && asset.name && typeof asset.memo === 'string', 'INVALID_ASSET');
    for (const key of ['cardCycleStartDay', 'cardCycleEndDay', 'cardPaymentDay']) {
      requireValue(asset[key] == null || (Number.isInteger(asset[key]) && asset[key] >= 1 && asset[key] <= 28), 'INVALID_ASSET');
    }
    requireValue(!asset.cardPaymentAssetId || (asset.cardPaymentAssetId !== asset.id && data.assets.some(a => a.id === asset.cardPaymentAssetId)), 'INVALID_CARD_PAYMENT_ACCOUNT');
    const current = data.assets.find(a => a.id === asset.id);
    if (op === 'asset.create' && current) throw new LocalError('REVISION_CONFLICT', 409);
    if (op === 'asset.update') revision(current, body.expectedRevision, 'asset');
    const moved = !current || current.category !== asset.category;
    const sortOrder = moved ? Math.max(-1, ...data.assets.filter(a => a.category === asset.category).map(a => a.sortOrder ?? -1)) + 1 : current.sortOrder;
    const next = { ...current, ...asset, amount: current?.amount || 0, revision: (current?.revision || 0) + 1, sortOrder };
    const opening = body.openingTransaction ? tx(body.openingTransaction) : null;
    if (opening && data.transactions.some(t => t.id === opening.id)) throw new LocalError('REVISION_CONFLICT', 409);
    data.assets = [...data.assets.filter(a => a.id !== asset.id), next];
    if (opening) data.transactions.push(opening);
    return { ...success, asset: next, transaction: opening };
  }
  if (op === 'asset.delete') {
    revision(data.assets.find(a => a.id === body.assetId), body.expectedRevision, 'asset');
    data.assets = data.assets.filter(a => a.id !== body.assetId);
    return { ...success, assetId: body.assetId };
  }
  if (op === 'asset.reorder') {
    const ids: string[] = body.assetIds || [], rows = data.assets.filter(a => a.category === body.categoryId);
    const version = data.assetOrderRevisions[body.categoryId] || 0;
    if (version !== body.expectedRevision || ids.length !== rows.length || new Set(ids).size !== rows.length || rows.some(a => !ids.includes(a.id))) throw new LocalError('REVISION_CONFLICT', 409, { assets: rows, revision: version });
    data.assets = data.assets.map(a => ids.includes(a.id) ? { ...a, sortOrder: ids.indexOf(a.id) } : a);
    data.assetOrderRevisions[body.categoryId] = version + 1;
    return { ...success, assets: ids.map(id => data.assets.find(a => a.id === id)), revision: version + 1 };
  }
  if (op === 'category.reorder') {
    categoryField(body.type);
    const version = data.categoryOrderRevisions[body.type] || 0;
    if (version !== body.expectedRevision) throw new LocalError('REVISION_CONFLICT', 409, { categoryOrder: data.categoryOrder, categoryLabels: data.categoryLabels, revision: version });
    requireValue(Array.isArray(body.categoryIds) && new Set(body.categoryIds).size === body.categoryIds.length);
    data.categoryOrder[body.type] = body.categoryIds;
    Object.assign(data.categoryLabels, body.categoryLabels || {});
    data.categoryOrderRevisions[body.type] = version + 1;
    return { ...success, type: body.type, categoryOrder: data.categoryOrder, categoryLabels: data.categoryLabels, revision: version + 1 };
  }
  if (op === 'category.create' || op === 'category.upsert') {
    requireValue(body.id && body.label);
    const field = categoryField(body.type), category = { id: body.id, label: body.label, color: body.color || null, ...(body.type === 'asset' ? { kind: body.kind || 'asset' } : {}) };
    data[field] = [...data[field].filter((c: Row) => c.id !== body.id), category];
    data.categoryLabels[body.id] = body.label;
    if (body.kind) data.categoryLabels[`asset_kind_${body.id}`] = body.kind;
    if (body.color) data.categoryColors[`${body.type}:${body.id}`] = body.color;
    return { ...success, category };
  }
  if (op === 'category.delete') {
    for (const field of ['customExpenseCategories', 'customIncomeCategories', 'customAssetCategories']) data[field] = data[field].filter((c: Row) => c.id !== body.id);
    return { ...success, id: body.id, type: body.type };
  }
  if (op === 'category.sync' || op === 'categories.sync') {
    for (const category of body.categories || []) mutate(data, { ...category, op: 'category.create' });
    return success;
  }
  if (op === 'plan.upsert') {
    requireValue(body.category && ['expense', 'income'].includes(body.type) && Number.isFinite(Number(body.plannedAmount)));
    const plan = { category: body.category, type: body.type, plannedAmount: Number(body.plannedAmount) };
    data.plans = [...data.plans.filter(p => p.category !== plan.category || p.type !== plan.type), plan];
    return success;
  }
  if (op === 'plans.sync' || op === 'plans.save') { requireValue(Array.isArray(body.plans)); data.plans = body.plans; return success; }
  if (op === 'setting.set' || op === 'settings.batch') {
    const values = op === 'setting.set' ? { [body.key]: body.value } : body.settings;
    const allowed = ['budget', 'theme', 'categoryColors', 'categoryLabels', 'categoryBudgetExcluded', 'categoryOrder', 'hiddenCategories', 'hiddenAssets'];
    for (const [key, raw] of Object.entries(values || {})) {
      requireValue(allowed.includes(key));
      let value = raw;
      if (typeof raw === 'string' && key !== 'theme') { try { value = JSON.parse(raw); } catch { throw new LocalError('BAD_REQUEST'); } }
      data[key] = value;
    }
    return success;
  }
  if (op === 'recurring_rule.create' || op === 'recurring_rule.upsert' || op === 'recurring_rule.update') {
    const rule = body.rule;
    requireValue(rule?.id && rule.type && rule.title && rule.category && rule.startMonth);
    data.recurringRules = [...data.recurringRules.filter(r => r.id !== rule.id), { ...rule }];
    return { ...success, rule };
  }
  if (op === 'recurring_rule.stop') {
    requireValue(body.id && body.endMonth);
    data.recurringRules = data.recurringRules.map(r => r.id === body.id ? { ...r, endMonth: body.endMonth } : r);
    return { ...success, id: body.id, endMonth: body.endMonth };
  }
  if (op === 'recurring_rule.delete') { data.recurringRules = data.recurringRules.filter(r => r.id !== body.id); return { ...success, id: body.id }; }
  if (op === 'recurring_tx.delete') {
    requireValue(body.id);
    if (!data.deletedRecurringTxs.includes(body.id)) data.deletedRecurringTxs.push(body.id);
    data.transactions = data.transactions.filter(t => t.id !== body.id);
    return { ...success, id: body.id };
  }
  if (op === 'recurring_rules.sync') {
    requireValue(Array.isArray(body.recurringRules) && Array.isArray(body.deletedRecurringTxs));
    data.recurringRules = body.recurringRules; data.deletedRecurringTxs = body.deletedRecurringTxs; return success;
  }
  if (op === 'card.settle') {
    const card = data.assets.find(a => a.id === body.cardAssetId);
    requireValue(card && card.cardPaymentAssetId === body.paymentAssetId && data.assets.some(a => a.id === body.paymentAssetId), 'INVALID_CARD_PAYMENT_ACCOUNT');
    if (data.cardSettlements.some(s => s.id === body.settlementId)) throw new LocalError('REVISION_CONFLICT', 409);
    const sources = data.transactions.filter(t => !t.cardSettlementId && t.assetId === card!.id && t.date >= body.periodStart && t.date <= body.periodEnd && t.date <= body.settledDate && !['opening-balance', '__asset_only_adjustment__'].includes(t.category) && ['expense', 'income'].includes(t.type));
    const amount = sources.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount), 0);
    requireValue(sources.length && amount > 0, 'NO_CARD_BALANCE_TO_SETTLE');
    const settlement = { id: body.settlementId, cardAssetId: card!.id, paymentAssetId: body.paymentAssetId, periodStart: body.periodStart, periodEnd: body.periodEnd, dueDate: body.dueDate, amount, transactionId: body.transactionId, settledAt: Date.now() };
    const transaction = tx({ id: body.transactionId, type: 'transfer', date: body.settledDate, time: new Date().toTimeString().slice(0, 5), amount, title: `${card!.name} 결제`, category: 'card-payment', assetId: body.paymentAssetId, toAssetId: card!.id, cardSettlementId: settlement.id });
    requireValue(!data.transactions.some(t => t.id === transaction.id));
    const ids = sources.map(t => t.id);
    data.transactions = [...data.transactions.map(t => ids.includes(t.id) ? { ...t, cardSettlementId: settlement.id, revision: (t.revision || 1) + 1 } : t), transaction];
    data.cardSettlements.push(settlement);
    return { ...success, settlement, transaction, settledTransactionIds: ids };
  }
  throw new LocalError('UNKNOWN_OPERATION');
}
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function localWalletFetch(id: string, input: RequestInfo | URL, init?: RequestInit, storage = window.localStorage): Promise<Response> {
  return withGuestLock(id,()=>localWalletFetchUnlocked(id,input,init,storage));
}
async function localWalletFetchUnlocked(id: string, input: RequestInfo | URL, init: RequestInit|undefined, storage:Storage): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
  // Explicitly reject every endpoint other than the guest data adapter. Never fall through to a cloud request.
  if (url.pathname !== '/api/data' || url.origin !== 'http://localhost') throw new Error('LOCAL_ENDPOINT_UNAVAILABLE');
  const method = (init?.method || 'GET').toUpperCase();
  try {
    assertGuestGeneration(id,storage);
    const data = localSnapshot(storage, id);
    if (method === 'GET') return Response.json(url.searchParams.has('after') ? { changes: [], nextCursor: Number(url.searchParams.get('after')) || 0 } : data);
    requireValue(method === 'PATCH');
    const pending = storage.getItem(guestKey(id, 'sync-job'));
    if (pending && !JSON.parse(pending).completed) throw new LocalError('LOCAL_SYNC_IN_PROGRESS', 409);
    const body = JSON.parse(String(init?.body));
    const request = stable(body), receipts = data.localOperations || {};
    if (body.operationId && receipts[body.operationId]) {
      const previous = receipts[body.operationId];
      if (previous.request !== request) throw new LocalError('OPERATION_ID_REUSED', 409);
      return Response.json(previous.result);
    }
    const result = mutate(data, body);
    data.updatedAt = Date.now();
    if (body.operationId) receipts[body.operationId] = { request, result };
    data.localOperations = receipts;
    // A single synchronous write commits rows and receipts together; quota/errors never report success.
    storage.setItem(guestKey(id), JSON.stringify(data));
    return Response.json(result);
  } catch (error) {
    if (error instanceof LocalError) return Response.json({ error: error.message, current: error.current }, { status: error.status });
    throw new Error('LOCAL_STORAGE_FAILED');
  }
}
