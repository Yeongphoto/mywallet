interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    const url = new URL(context.request.url);
    const after = url.searchParams.get('after');
    if (after !== null) {
      const cursor = Number(after);
      if (!Number.isInteger(cursor) || cursor < 0) {
        return new Response(JSON.stringify({ error: 'INVALID_CURSOR' }), { status: 400 });
      }
      const changes = await db.prepare("SELECT cursor, entity_type, entity_id, change_type, revision, payload_json FROM sync_changes WHERE cursor > ? ORDER BY cursor LIMIT 200")
        .bind(cursor)
        .all<any>();
      const rows = changes.results || [];
      return new Response(JSON.stringify({
        changes: rows.map((change: any) => ({
          cursor: Number(change.cursor),
          entityType: change.entity_type,
          entityId: change.entity_id,
          changeType: change.change_type,
          revision: change.revision == null ? null : Number(change.revision),
          payload: change.payload_json ? JSON.parse(change.payload_json) : null,
        })),
        nextCursor: rows.length ? Number(rows[rows.length - 1].cursor) : cursor,
      }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    // Read the cursor first. Later writes may be included in this snapshot, but will
    // also be returned by incremental sync; reading it first prevents a missed gap.
    const syncCursor = await db.prepare("SELECT MAX(cursor) AS cursor FROM sync_changes").first<{ cursor: number | null }>();
    const [txs, asts, plns, cats, sgs, rcRules, delTxs, settlements] = await Promise.all([
      db.prepare("SELECT * FROM transactions WHERE deleted_at IS NULL").all(),
      db.prepare("SELECT * FROM assets ORDER BY category, sort_order IS NULL, sort_order, rowid").all(),
      db.prepare("SELECT * FROM plans").all(),
      db.prepare("SELECT * FROM custom_categories").all(),
      db.prepare("SELECT * FROM settings").all(),
      db.prepare("SELECT * FROM recurring_rules").all(),
      db.prepare("SELECT * FROM deleted_recurring_txs").all(),
      db.prepare("SELECT * FROM card_settlements ORDER BY due_date DESC, settled_at DESC").all()
    ]);

    // parse settings
    const settingsMap: Record<string, string> = {};
    sgs.results.forEach((row: any) => {
      settingsMap[row.key] = row.value;
    });

    const data = {
      transactions: (txs.results || []).map((t: any) => ({
        id: t.id,
        type: t.type,
        date: t.date,
        time: t.transaction_time || null,
        amount: Number(t.amount),
        title: t.title,
        category: t.category,
        createdAt: t.created_at == null ? null : Number(t.created_at),
        assetId: t.asset_id || null,
        toAssetId: t.to_asset_id || null,
        recurringRuleId: t.recurring_rule_id || null,
        installmentGroupId: t.installment_group_id || null,
        installmentIndex: t.installment_index == null ? null : Number(t.installment_index),
        installmentMonths: t.installment_months == null ? null : Number(t.installment_months),
        cardSettlementId: t.card_settlement_id || null,
        revision: Number(t.revision) || 1,
      })),
      assets: (asts.results || []).map(assetRow),
      plans: plns.results || [],
      customExpenseCategories: (cats.results || []).filter((c: any) => c.type === 'expense').map((c: any) => ({ id: c.id, label: c.label, color: c.color || null })),
      customIncomeCategories: (cats.results || []).filter((c: any) => c.type === 'income').map((c: any) => ({ id: c.id, label: c.label, color: c.color || null })),
      customAssetCategories: (cats.results || [])
        .filter((c: any) => c.type === 'asset' || c.type === 'liability')
        .map((c: any) => ({ id: c.id, label: c.label, color: c.color || null, kind: c.type === 'liability' ? 'liability' : 'asset' })),
      budget: Number(settingsMap['budget']) || 1000000,
      theme: settingsMap['theme'] || 'light',
      categoryColors: settingsMap['categoryColors'] ? JSON.parse(settingsMap['categoryColors']) : {},
      categoryLabels: settingsMap['categoryLabels'] ? JSON.parse(settingsMap['categoryLabels']) : {},
      categoryBudgetExcluded: settingsMap['categoryBudgetExcluded'] ? JSON.parse(settingsMap['categoryBudgetExcluded']) : {},
      categoryOrder: settingsMap['categoryOrder'] ? JSON.parse(settingsMap['categoryOrder']) : {},
      hiddenCategories: settingsMap['hiddenCategories'] ? JSON.parse(settingsMap['hiddenCategories']) : {},
      hiddenAssets: settingsMap['hiddenAssets'] ? JSON.parse(settingsMap['hiddenAssets']) : {},
      recurringRules: (rcRules.results || []).map((r: any) => ({
        id: r.id,
        type: r.type,
        day: Number(r.day),
        time: r.transaction_time || null,
        amount: Number(r.amount),
        title: r.title,
        category: r.category,
        assetId: r.asset_id || null,
        toAssetId: r.to_asset_id || null,
        startMonth: r.startMonth,
        endMonth: r.endMonth || null
      })),
      deletedRecurringTxs: (delTxs.results || []).map((r: any) => r.id),
      cardSettlements: (settlements.results || []).map((settlement: any) => ({
        id: settlement.id,
        cardAssetId: settlement.card_asset_id,
        paymentAssetId: settlement.payment_asset_id,
        periodStart: settlement.period_start,
        periodEnd: settlement.period_end,
        dueDate: settlement.due_date,
        amount: Number(settlement.amount),
        transactionId: settlement.transaction_id,
        settledAt: Number(settlement.settled_at),
      })),
      assetOrderRevisions: Object.fromEntries(
        (await db.prepare("SELECT id, revision FROM sync_groups WHERE id LIKE 'asset-order:%'").all()).results.map((group: any) => [
          String(group.id).slice('asset-order:'.length),
          Number(group.revision) || 0,
        ])
      ),
      categoryOrderRevisions: Object.fromEntries(
        (await db.prepare("SELECT id, revision FROM sync_groups WHERE id LIKE 'category-order:%'").all()).results.map((group: any) => [
          String(group.id).slice('category-order:'.length),
          Number(group.revision) || 0,
        ])
      ),
      updatedAt: Number(settingsMap['updatedAt']) || 0,
      cursor: Number(syncCursor?.cursor) || 0
    };

    return new Response(JSON.stringify(data), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

function assetRow(asset: any) {
  return {
    id: asset.id,
    category: asset.category,
    name: asset.name || null,
    kind: asset.kind || null,
    amount: Number(asset.amount),
    memo: asset.memo || '',
    revision: Number(asset.revision) || 1,
    sortOrder: asset.sort_order == null ? null : Number(asset.sort_order),
    cardCycleStartDay: asset.card_cycle_start_day == null ? null : Number(asset.card_cycle_start_day),
    cardCycleEndDay: asset.card_cycle_end_day == null ? null : Number(asset.card_cycle_end_day),
    cardPaymentDay: asset.card_payment_day == null ? null : Number(asset.card_payment_day),
    cardPaymentAssetId: asset.card_payment_asset_id || null,
  };
}

function transactionRow(transaction: any) {
  return {
    id: transaction.id,
    type: transaction.type,
    date: transaction.date,
    time: transaction.transaction_time || null,
    amount: Number(transaction.amount),
    title: transaction.title,
    category: transaction.category,
    createdAt: transaction.created_at == null ? null : Number(transaction.created_at),
    assetId: transaction.asset_id || null,
    toAssetId: transaction.to_asset_id || null,
    recurringRuleId: transaction.recurring_rule_id || null,
    installmentGroupId: transaction.installment_group_id || null,
    installmentIndex: transaction.installment_index == null ? null : Number(transaction.installment_index),
    installmentMonths: transaction.installment_months == null ? null : Number(transaction.installment_months),
    cardSettlementId: transaction.card_settlement_id || null,
    revision: Number(transaction.revision) || 1,
  };
}

function validTransaction(transaction: any) {
  return Boolean(
    transaction?.id &&
    ['income', 'expense', 'transfer'].includes(transaction.type) &&
    transaction.date &&
    Number.isFinite(Number(transaction.amount)) &&
    Number(transaction.amount) > 0 &&
    transaction.title &&
    transaction.category
  );
}

function isOperationId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function operationRequestHash(payload: unknown) {
  const bytes = new TextEncoder().encode(stableJson(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function transactionInsertStatement(db: D1Database, transaction: any, operationId: string) {
  return db.prepare("INSERT INTO transactions (id, type, date, transaction_time, amount, title, category, created_at, asset_id, to_asset_id, recurring_rule_id, installment_group_id, installment_index, installment_months, revision, last_operation_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)")
    .bind(transaction.id, transaction.type, transaction.date, transaction.time || null, transaction.amount, transaction.title, transaction.category, transaction.createdAt ?? null, transaction.assetId || null, transaction.toAssetId || null, transaction.recurringRuleId || null, transaction.installmentGroupId || null, transaction.installmentIndex ?? null, transaction.installmentMonths ?? null, operationId);
}

async function completedOperation(db: D1Database, operationId: string) {
  return db.prepare("SELECT entity_type, entity_id, status, response_json, request_hash FROM operation_results WHERE operation_id = ?").bind(operationId).first<any>();
}

async function operationSuccessResponse(db: D1Database, operation: any, operationId: string) {
  if (operation.status !== 'success') return null;
  const result = JSON.parse(operation.response_json);
  return new Response(JSON.stringify({ ...result, operationId }), { headers: { 'Content-Type': 'application/json' } });
}

function apiError(error: string, status: number, current?: unknown) {
  return new Response(JSON.stringify({ error, current }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function conflictResponse(current: unknown) {
  return apiError('REVISION_CONFLICT', 409, current);
}

async function transactionFailureResponse(db: D1Database, transactionId: string) {
  const current = transactionId
    ? await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(transactionId).first<any>()
    : null;
  if (!current) return apiError('NOT_FOUND', 404);
  if (current.deleted_at) return apiError('DELETED_CONFLICT', 409, { transaction: transactionRow(current) });
  return conflictResponse({ transaction: transactionRow(current) });
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 Binding not found' }), { status: 500 });
  let body: any;

  try {
    body = await context.request.json();
  } catch {
    return apiError('BAD_REQUEST', 400);
  }

  try {
    if (body.op === 'transaction.create' || body.op === 'transaction.createBatch') {
      const transactions = body.op === 'transaction.createBatch' ? body.transactions : [body.transaction];
      const operationId = body.operationId;
      if (!isOperationId(operationId)) return apiError('BAD_REQUEST', 400);
      if (!Array.isArray(transactions) || transactions.length === 0 || transactions.some((transaction) => !validTransaction(transaction))) return apiError('VALIDATION_ERROR', 422);
      const ids = transactions.map((transaction) => String(transaction.id));
      if (new Set(ids).size !== ids.length) return apiError('VALIDATION_ERROR', 422);
      const requestHash = await operationRequestHash(body);
      const previous = await completedOperation(db, operationId);
      if (previous && previous.request_hash !== requestHash) return apiError('OPERATION_ID_REUSED', 409);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const now = Date.now();
      const entityId = body.op === 'transaction.createBatch' ? String(body.groupId || operationId) : ids[0];
      const savedTransactions = transactions.map((transaction) => ({ ...transaction, revision: 1 }));
      const responseJson = JSON.stringify({
        success: true,
        transaction: body.op === 'transaction.create' ? savedTransactions[0] : undefined,
        transactions: savedTransactions,
      });
      await db.batch([
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)")
          .bind(operationId, body.op === 'transaction.createBatch' ? 'transaction_batch' : 'transaction', entityId, responseJson, requestHash, now),
        ...transactions.map((transaction) => transactionInsertStatement(db, transaction, operationId)),
        ...transactions.map((transaction) => db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) VALUES ('transaction', ?, 'upsert', 1, ?, ?)")
          .bind(transaction.id, JSON.stringify({ ...transaction, revision: 1 }), now)),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND (SELECT COUNT(*) FROM transactions WHERE last_operation_id = ?) = ?")
          .bind(operationId, operationId, transactions.length),
        db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ]);
      const completed = await completedOperation(db, operationId);
      if (completed?.status !== 'success') return transactionFailureResponse(db, entityId);
      const created = await db.prepare(`SELECT * FROM transactions WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all<any>();
      const result = (created.results || []).map(transactionRow);
      return new Response(JSON.stringify({ success: true, operationId, transaction: body.op === 'transaction.create' ? result[0] : undefined, transactions: result }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'transaction.update') {
      const transaction = body.transaction;
      const expectedRevision = Number(body.expectedRevision);
      const operationId = body.operationId;
      if (!isOperationId(operationId)) return apiError('BAD_REQUEST', 400);
      if (!validTransaction(transaction) || !Number.isInteger(expectedRevision)) return apiError('VALIDATION_ERROR', 422);
      const requestHash = await operationRequestHash(body);
      const previous = await completedOperation(db, operationId);
      if (previous && previous.request_hash !== requestHash) return apiError('OPERATION_ID_REUSED', 409);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const now = Date.now();
      const nextRevision = expectedRevision + 1;
      const responseJson = JSON.stringify({ success: true, transaction: { ...transaction, revision: nextRevision } });
      await db.batch([
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) VALUES (?, 'transaction', ?, 'pending', ?, ?, ?)")
          .bind(operationId, transaction.id, responseJson, requestHash, now),
        db.prepare("UPDATE transactions SET type = ?, date = ?, transaction_time = ?, amount = ?, title = ?, category = ?, created_at = ?, asset_id = ?, to_asset_id = ?, recurring_rule_id = ?, installment_group_id = ?, installment_index = ?, installment_months = ?, revision = ?, last_operation_id = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL")
          .bind(transaction.type, transaction.date, transaction.time || null, transaction.amount, transaction.title, transaction.category, transaction.createdAt ?? null, transaction.assetId || null, transaction.toAssetId || null, transaction.recurringRuleId || null, transaction.installmentGroupId || null, transaction.installmentIndex ?? null, transaction.installmentMonths ?? null, nextRevision, operationId, transaction.id, expectedRevision),
        db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) SELECT 'transaction', id, 'upsert', revision, ?, ? FROM transactions WHERE id = ? AND last_operation_id = ?")
          .bind(JSON.stringify({ ...transaction, revision: nextRevision }), now, transaction.id, operationId),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND last_operation_id = ?)")
          .bind(operationId, transaction.id, operationId),
        db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ]);
      const completed = await completedOperation(db, operationId);
      if (completed?.status !== 'success') return transactionFailureResponse(db, String(transaction.id));
      const updated = await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(String(transaction.id)).first<any>();
      return new Response(JSON.stringify({ success: true, operationId, transaction: transactionRow(updated) }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'transaction.delete') {
      const transactionId = String(body.transactionId || '');
      const expectedRevision = Number(body.expectedRevision);
      const operationId = body.operationId;
      if (!isOperationId(operationId) || !transactionId || !Number.isInteger(expectedRevision)) return apiError('BAD_REQUEST', 400);
      const requestHash = await operationRequestHash(body);
      const previous = await completedOperation(db, operationId);
      if (previous && previous.request_hash !== requestHash) return apiError('OPERATION_ID_REUSED', 409);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const now = Date.now();
      const responseJson = JSON.stringify({ success: true, transactionId, deleted: true });
      await db.batch([
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) VALUES (?, 'transaction', ?, 'pending', ?, ?, ?)")
          .bind(operationId, transactionId, responseJson, requestHash, now),
        db.prepare("UPDATE transactions SET deleted_at = ?, revision = revision + 1, last_operation_id = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL")
          .bind(now, operationId, transactionId, expectedRevision),
        db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) SELECT 'transaction', id, 'delete', revision, NULL, ? FROM transactions WHERE id = ? AND last_operation_id = ?")
          .bind(now, transactionId, operationId),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND last_operation_id = ?)")
          .bind(operationId, transactionId, operationId),
        db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ]);
      const completed = await completedOperation(db, operationId);
      if (completed?.status !== 'success') return transactionFailureResponse(db, transactionId);
      return new Response(JSON.stringify({ success: true, operationId, transactionId, deleted: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'card.settle') {
      const operationId = body.operationId;
      const cardAssetId = String(body.cardAssetId || '');
      const paymentAssetId = String(body.paymentAssetId || '');
      const periodStart = String(body.periodStart || '');
      const periodEnd = String(body.periodEnd || '');
      const dueDate = String(body.dueDate || '');
      const settledDate = String(body.settledDate || '');
      const settlementId = String(body.settlementId || '');
      const transactionId = String(body.transactionId || '');
      if (!isOperationId(operationId) || !cardAssetId || !paymentAssetId || !settlementId || !transactionId
        || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
        || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(settledDate)) return apiError('BAD_REQUEST', 400);
      const requestHash = await operationRequestHash(body);
      const previous = await completedOperation(db, operationId);
      if (previous && previous.request_hash !== requestHash) return apiError('OPERATION_ID_REUSED', 409);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const cardAsset = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(cardAssetId).first<any>();
      const paymentAsset = await db.prepare("SELECT id FROM assets WHERE id = ?").bind(paymentAssetId).first<any>();
      if (!cardAsset || !paymentAsset || cardAsset.card_payment_asset_id !== paymentAssetId) return apiError('INVALID_CARD_PAYMENT_ACCOUNT', 422);
      const sourceRows = await db.prepare("SELECT * FROM transactions WHERE deleted_at IS NULL AND card_settlement_id IS NULL AND asset_id = ? AND date >= ? AND date <= ? AND date <= ? AND category <> ? AND type IN ('expense', 'income') ORDER BY date, transaction_time, id")
        .bind(cardAssetId, periodStart, periodEnd, settledDate, 'opening-balance').all<any>();
      const sources = sourceRows.results || [];
      const amount = sources.reduce((sum: number, transaction: any) => sum + (transaction.type === 'expense' ? Number(transaction.amount) : -Number(transaction.amount)), 0);
      if (!sources.length || amount <= 0) return apiError('NO_CARD_BALANCE_TO_SETTLE', 422);
      const now = Date.now();
      const transfer = {
        id: transactionId,
        type: 'transfer',
        date: settledDate,
        time: new Date(now).toISOString().slice(11, 16),
        amount,
        title: `${cardAsset.name || '카드'} 결제`,
        category: 'card-payment',
        assetId: paymentAssetId,
        toAssetId: cardAssetId,
        cardSettlementId: settlementId,
        revision: 1,
      };
      const settlement = { id: settlementId, cardAssetId, paymentAssetId, periodStart, periodEnd, dueDate, amount, transactionId, settledAt: now };
      const responseJson = JSON.stringify({ success: true, settlement, transaction: transfer, settledTransactionIds: sources.map((source: any) => source.id) });
      try {
        await db.batch([
          db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) VALUES (?, 'card_settlement', ?, 'pending', ?, ?, ?)")
            .bind(operationId, settlementId, responseJson, requestHash, now),
          db.prepare("INSERT INTO card_settlements (id, card_asset_id, payment_asset_id, period_start, period_end, due_date, amount, transaction_id, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(settlementId, cardAssetId, paymentAssetId, periodStart, periodEnd, dueDate, amount, transactionId, now),
          db.prepare("INSERT INTO transactions (id, type, date, transaction_time, amount, title, category, asset_id, to_asset_id, card_settlement_id, revision, last_operation_id, deleted_at) VALUES (?, 'transfer', ?, ?, ?, ?, 'card-payment', ?, ?, ?, 1, ?, NULL)")
            .bind(transactionId, settledDate, transfer.time, amount, transfer.title, paymentAssetId, cardAssetId, settlementId, operationId),
          ...sources.flatMap((source: any) => [
            db.prepare("UPDATE transactions SET card_settlement_id = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND card_settlement_id IS NULL AND deleted_at IS NULL")
              .bind(settlementId, source.id, source.revision),
            db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) SELECT ?, 'card_settlement_guard', ?, 'pending', '', '', ? WHERE (SELECT changes()) = 0")
              .bind(operationId, source.id, now),
          ]),
          db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) VALUES ('transaction', ?, 'upsert', 1, ?, ?)")
            .bind(transactionId, JSON.stringify(transfer), now),
          db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM card_settlements WHERE id = ?) AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND last_operation_id = ?)")
            .bind(operationId, settlementId, transactionId, operationId),
          db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
        ]);
      } catch (error) {
        if (/constraint failed/i.test(String((error as Error)?.message || error))) return conflictResponse({ asset: assetRow(cardAsset) });
        throw error;
      }
      const completed = await completedOperation(db, operationId);
      if (completed?.status !== 'success') return apiError('CARD_SETTLEMENT_FAILED', 500);
      const savedTransfer = await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(transactionId).first<any>();
      return new Response(JSON.stringify({ success: true, operationId, settlement, transaction: transactionRow(savedTransfer), settledTransactionIds: sources.map((source: any) => source.id) }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'asset.create') {
      const asset = body.asset;
      const openingTransaction = body.openingTransaction;
      const cardCycleStartDay = asset?.cardCycleStartDay == null ? null : Number(asset.cardCycleStartDay);
      const cardCycleEndDay = asset?.cardCycleEndDay == null ? null : Number(asset.cardCycleEndDay);
      const cardPaymentDay = asset?.cardPaymentDay == null ? null : Number(asset.cardPaymentDay);
      const cardPaymentAssetId = asset?.cardPaymentAssetId == null ? null : String(asset.cardPaymentAssetId);
      if (!asset?.id || !asset.category || !asset.name || !Number.isFinite(Number(asset.amount)) || typeof asset.memo !== 'string'
        || (cardCycleStartDay !== null && (!Number.isInteger(cardCycleStartDay) || cardCycleStartDay < 1 || cardCycleStartDay > 28))
        || (cardCycleEndDay !== null && (!Number.isInteger(cardCycleEndDay) || cardCycleEndDay < 1 || cardCycleEndDay > 28))
        || (cardPaymentDay !== null && (!Number.isInteger(cardPaymentDay) || cardPaymentDay < 1 || cardPaymentDay > 28))
        || (cardPaymentAssetId !== null && cardPaymentAssetId === String(asset.id))) {
        return new Response(JSON.stringify({ error: 'INVALID_ASSET' }), { status: 400 });
      }
      const existing = await db.prepare("SELECT id FROM assets WHERE id = ?").bind(String(asset.id)).first();
      if (existing) return conflictResponse({ asset: existing });
      if (cardPaymentAssetId) {
        const paymentAsset = await db.prepare("SELECT id FROM assets WHERE id = ?").bind(cardPaymentAssetId).first();
        if (!paymentAsset) return new Response(JSON.stringify({ error: 'INVALID_CARD_PAYMENT_ACCOUNT' }), { status: 422 });
      }

      const maxSort = await db.prepare("SELECT MAX(sort_order) AS value FROM assets WHERE category = ?").bind(String(asset.category)).first<{ value: number | null }>();
      const sortOrder = Number.isFinite(Number(maxSort?.value)) ? Number(maxSort?.value) + 1 : 0;
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO assets (id, category, name, kind, amount, memo, card_cycle_start_day, card_cycle_end_day, card_payment_day, card_payment_asset_id, revision, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)")
          .bind(String(asset.id), String(asset.category), String(asset.name), asset.kind || null, 0, String(asset.memo), cardCycleStartDay, cardCycleEndDay, cardPaymentDay, cardPaymentAssetId, sortOrder),
        db.prepare("INSERT OR IGNORE INTO sync_groups (id, revision) VALUES (?, 0)").bind(`asset-order:${String(asset.category)}`),
      ];
      if (openingTransaction) {
        statements.push(
          db.prepare("INSERT INTO transactions (id, type, date, transaction_time, amount, title, category, created_at, asset_id, to_asset_id, recurring_rule_id, installment_group_id, installment_index, installment_months) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(openingTransaction.id, openingTransaction.type, openingTransaction.date, openingTransaction.time || null, openingTransaction.amount, openingTransaction.title, openingTransaction.category, openingTransaction.createdAt ?? null, openingTransaction.assetId, openingTransaction.toAssetId || null, null, null, null, null)
        );
      }
      await db.batch(statements);
      const created = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(String(asset.id)).first();
      return new Response(JSON.stringify({ success: true, asset: assetRow(created), transaction: openingTransaction || null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'asset.update') {
      const asset = body.asset;
      const expectedRevision = Number(body.expectedRevision);
      const cardCycleStartDay = asset?.cardCycleStartDay == null ? null : Number(asset.cardCycleStartDay);
      const cardCycleEndDay = asset?.cardCycleEndDay == null ? null : Number(asset.cardCycleEndDay);
      const cardPaymentDay = asset?.cardPaymentDay == null ? null : Number(asset.cardPaymentDay);
      const cardPaymentAssetId = asset?.cardPaymentAssetId == null ? null : String(asset.cardPaymentAssetId);
      if (!asset?.id || !asset.category || !asset.name || typeof asset.memo !== 'string' || !Number.isInteger(expectedRevision)
        || (cardCycleStartDay !== null && (!Number.isInteger(cardCycleStartDay) || cardCycleStartDay < 1 || cardCycleStartDay > 28))
        || (cardCycleEndDay !== null && (!Number.isInteger(cardCycleEndDay) || cardCycleEndDay < 1 || cardCycleEndDay > 28))
        || (cardPaymentDay !== null && (!Number.isInteger(cardPaymentDay) || cardPaymentDay < 1 || cardPaymentDay > 28))
        || (cardPaymentAssetId !== null && cardPaymentAssetId === String(asset.id))) {
        return new Response(JSON.stringify({ error: 'INVALID_ASSET_UPDATE' }), { status: 400 });
      }
      const current = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(String(asset.id)).first<any>();
      if (!current || Number(current.revision) !== expectedRevision) return conflictResponse({ asset: current ? assetRow(current) : null });
      if (cardPaymentAssetId) {
        const paymentAsset = await db.prepare("SELECT id FROM assets WHERE id = ?").bind(cardPaymentAssetId).first();
        if (!paymentAsset) return new Response(JSON.stringify({ error: 'INVALID_CARD_PAYMENT_ACCOUNT' }), { status: 422 });
      }

      const movedCategory = current.category !== asset.category;
      const maxSort = movedCategory
        ? await db.prepare("SELECT MAX(sort_order) AS value FROM assets WHERE category = ?").bind(String(asset.category)).first<{ value: number | null }>()
        : null;
      const nextSortOrder = movedCategory && Number.isFinite(Number(maxSort?.value)) ? Number(maxSort?.value) + 1 : movedCategory ? 0 : current.sort_order;
      const result = await db.prepare("UPDATE assets SET category = ?, name = ?, kind = ?, memo = ?, card_cycle_start_day = ?, card_cycle_end_day = ?, card_payment_day = ?, card_payment_asset_id = ?, sort_order = ?, revision = revision + 1 WHERE id = ? AND revision = ?")
        .bind(String(asset.category), String(asset.name), asset.kind || null, String(asset.memo), cardCycleStartDay, cardCycleEndDay, cardPaymentDay, cardPaymentAssetId, nextSortOrder, String(asset.id), expectedRevision).run();
      if (!result.meta.changes) {
        const latest = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(String(asset.id)).first<any>();
        return conflictResponse({ asset: latest ? assetRow(latest) : null });
      }
      if (movedCategory) await db.prepare("INSERT OR IGNORE INTO sync_groups (id, revision) VALUES (?, 0)").bind(`asset-order:${String(asset.category)}`).run();
      const updated = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(String(asset.id)).first<any>();
      return new Response(JSON.stringify({ success: true, asset: assetRow(updated) }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'asset.delete') {
      const assetId = String(body.assetId || '');
      const expectedRevision = Number(body.expectedRevision);
      if (!assetId || !Number.isInteger(expectedRevision)) return new Response(JSON.stringify({ error: 'INVALID_ASSET_DELETE' }), { status: 400 });
      const current = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first<any>();
      if (!current || Number(current.revision) !== expectedRevision) return conflictResponse({ asset: current ? assetRow(current) : null });
      const result = await db.prepare("DELETE FROM assets WHERE id = ? AND revision = ?").bind(assetId, expectedRevision).run();
      if (!result.meta.changes) return conflictResponse({ asset: current ? assetRow(current) : null });
      return new Response(JSON.stringify({ success: true, assetId }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'asset.reorder') {
      const categoryId = String(body.categoryId || '');
      const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map(String) : [];
      const expectedRevision = Number(body.expectedRevision);
      const operationId = body.operationId;
      if (!isOperationId(operationId) || !categoryId || !Number.isInteger(expectedRevision) || assetIds.length === 0 || new Set(assetIds).size !== assetIds.length) {
        return new Response(JSON.stringify({ error: 'INVALID_ASSET_REORDER' }), { status: 400 });
      }

      const requestHash = await operationRequestHash(body);
      const previous = await completedOperation(db, operationId);
      if (previous && previous.request_hash !== requestHash) return apiError('OPERATION_ID_REUSED', 409);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }

      const groupId = `asset-order:${categoryId}`;
      const currentRows = await db.prepare("SELECT * FROM assets WHERE category = ? ORDER BY sort_order IS NULL, sort_order, rowid").bind(categoryId).all();
      const currentIds = (currentRows.results || []).map((asset: any) => String(asset.id));
      const currentGroup = await db.prepare("SELECT revision FROM sync_groups WHERE id = ?").bind(groupId).first<{ revision: number }>();
      const currentRevision = Number(currentGroup?.revision) || 0;
      if (currentIds.length !== assetIds.length || currentIds.some((id) => !assetIds.includes(id)) || currentRevision !== expectedRevision) {
        return conflictResponse({ assets: (currentRows.results || []).map(assetRow), revision: currentRevision });
      }

      const now = Date.now();
      const currentById = new Map((currentRows.results || []).map((asset: any) => [String(asset.id), asset]));
      const responsePayload = {
        success: true,
        assets: assetIds.map((id, index) => assetRow({ ...currentById.get(id), sort_order: index })),
        revision: currentRevision + 1,
      };
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) VALUES (?, 'asset_order', ?, 'pending', ?, ?, ?)")
          .bind(operationId, categoryId, JSON.stringify(responsePayload), requestHash, now),
        ...assetIds.map((id, index) =>
        db.prepare("UPDATE assets SET sort_order = ? WHERE id = ? AND category = ? AND EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?)")
          .bind(index, id, categoryId, groupId, expectedRevision)
        ),
        db.prepare("UPDATE sync_groups SET revision = revision + 1 WHERE id = ? AND revision = ?")
          .bind(groupId, expectedRevision),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?)")
          .bind(operationId, groupId, currentRevision + 1),
        db.prepare("DELETE FROM operation_results WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ];
      const results = await db.batch(statements);
      const versionResult = results[assetIds.length + 1];
      if (!versionResult.meta.changes) {
        const latestRows = await db.prepare("SELECT * FROM assets WHERE category = ? ORDER BY sort_order IS NULL, sort_order, rowid").bind(categoryId).all();
        const currentGroup = await db.prepare("SELECT revision FROM sync_groups WHERE id = ?").bind(groupId).first<{ revision: number }>();
        return conflictResponse({ assets: (latestRows.results || []).map(assetRow), revision: Number(currentGroup?.revision) || 0 });
      }

      return new Response(JSON.stringify({ ...responsePayload, operationId }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'category.reorder') {
      const type = body.type;
      const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : [];
      const expectedRevision = Number(body.expectedRevision);
      const operationId = body.operationId;
      const labelPatch = body.categoryLabels && typeof body.categoryLabels === 'object' && !Array.isArray(body.categoryLabels)
        ? body.categoryLabels as Record<string, unknown>
        : {};
      if (!isOperationId(operationId) || !['asset', 'expense', 'income'].includes(type) || !Number.isInteger(expectedRevision)
        || categoryIds.length === 0 || new Set(categoryIds).size !== categoryIds.length
        || categoryIds.some((id) => !id)) {
        return new Response(JSON.stringify({ error: 'INVALID_CATEGORY_REORDER' }), { status: 400 });
      }

      const requestHash = await operationRequestHash(body);
      const previous = await completedOperation(db, operationId);
      if (previous && previous.request_hash !== requestHash) return apiError('OPERATION_ID_REUSED', 409);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }

      const groupId = `category-order:${type}`;
      await db.prepare("INSERT OR IGNORE INTO sync_groups (id, revision) VALUES (?, 0)").bind(groupId).run();
      const currentGroup = await db.prepare("SELECT revision FROM sync_groups WHERE id = ?").bind(groupId).first<{ revision: number }>();
      const settingsRows = await db.prepare("SELECT key, value FROM settings WHERE key IN ('categoryOrder', 'categoryLabels')").all<any>();
      const settings = Object.fromEntries((settingsRows.results || []).map((row: any) => [String(row.key), String(row.value)])) as Record<string, string>;
      const currentOrder = settings.categoryOrder ? JSON.parse(settings.categoryOrder) : {};
      const currentLabels = settings.categoryLabels ? JSON.parse(settings.categoryLabels) : {};
      const currentRevision = Number(currentGroup?.revision) || 0;
      if (currentRevision !== expectedRevision) {
        return conflictResponse({ categoryOrder: currentOrder, categoryLabels: currentLabels, revision: currentRevision });
      }

      const nextOrder = { ...currentOrder, [type]: categoryIds };
      const nextLabels = { ...currentLabels, ...labelPatch };
      const now = Date.now();
      const responsePayload = { success: true, type, categoryOrder: nextOrder, categoryLabels: nextLabels, revision: currentRevision + 1 };
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, request_hash, created_at) VALUES (?, 'category_order', ?, 'pending', ?, ?, ?)")
          .bind(operationId, type, JSON.stringify(responsePayload), requestHash, now),
        db.prepare("UPDATE sync_groups SET revision = revision + 1 WHERE id = ? AND revision = ?")
          .bind(groupId, expectedRevision),
        db.prepare("INSERT INTO settings (key, value) SELECT 'categoryOrder', ? WHERE EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(JSON.stringify(nextOrder), groupId, currentRevision + 1),
        db.prepare("INSERT INTO settings (key, value) SELECT 'categoryLabels', ? WHERE EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(JSON.stringify(nextLabels), groupId, currentRevision + 1),
        db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) SELECT 'category-order', ?, 'upsert', ?, ?, ? WHERE EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?)")
          .bind(type, currentRevision + 1, JSON.stringify(responsePayload), now, groupId, currentRevision + 1),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?)")
          .bind(operationId, groupId, currentRevision + 1),
        db.prepare("DELETE FROM operation_results WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ];
      const results = await db.batch(statements);
      if (!results[5].meta.changes) {
        const latestGroup = await db.prepare("SELECT revision FROM sync_groups WHERE id = ?").bind(groupId).first<{ revision: number }>();
        return conflictResponse({ categoryOrder: currentOrder, categoryLabels: currentLabels, revision: Number(latestGroup?.revision) || 0 });
      }
      return new Response(JSON.stringify({ ...responsePayload, operationId }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'plan.upsert') {
      const category = String(body.category || '');
      const type = String(body.type || '');
      const plannedAmount = Number(body.plannedAmount) || 0;
      if (!category || !type) return apiError('VALIDATION_ERROR', 422);

      await db.prepare("INSERT INTO plans (category, type, plannedAmount) VALUES (?, ?, ?) ON CONFLICT(category, type) DO UPDATE SET plannedAmount = excluded.plannedAmount")
        .bind(category, type, plannedAmount).run();

      return new Response(JSON.stringify({ success: true, plan: { category, type, plannedAmount } }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'plans.sync' || body.op === 'plans.save') {
      const plans = Array.isArray(body.plans) ? body.plans : [];
      const statements: D1PreparedStatement[] = [
        db.prepare("DELETE FROM plans"),
        ...plans.map((p: any) =>
          db.prepare("INSERT INTO plans (category, type, plannedAmount) VALUES (?, ?, ?)")
            .bind(String(p.category), String(p.type), Number(p.plannedAmount) || 0)
        ),
      ];
      await db.batch(statements);
      return new Response(JSON.stringify({ success: true, count: plans.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'setting.set') {
      const key = String(body.key || '');
      const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);
      if (!key) return apiError('BAD_REQUEST', 400);

      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key, value).run();

      return new Response(JSON.stringify({ success: true, key }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'settings.batch') {
      const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
      const entries = Object.entries(settings);
      if (entries.length > 0) {
        const statements = entries.map(([key, val]) =>
          db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(key, typeof val === 'string' ? val : JSON.stringify(val))
        );
        await db.batch(statements);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'UNKNOWN_OPERATION' }), { status: 400 });
  } catch (err: any) {
    const isConstraintError = /constraint failed/i.test(String(err?.message || ''));
    if (isConstraintError && (body?.op === 'transaction.update' || body?.op === 'transaction.delete')) {
      const transactionId = String(body.transaction?.id || body.transactionId || '');
      return transactionFailureResponse(db, transactionId);
    }
    if (isConstraintError && (body?.op === 'transaction.create' || body?.op === 'transaction.createBatch')) {
      const transactionId = String(body.transaction?.id || body.transactions?.[0]?.id || '');
      return transactionFailureResponse(db, transactionId);
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async () => {
  // Full-state replacement is deliberately disabled. Row mutations must use PATCH
  // with an operation id and an entity revision, so an old browser cannot replace
  // newer D1 records after a reload or a drag gesture.
  return new Response(JSON.stringify({
    error: 'FULL_SNAPSHOT_DISABLED',
    message: 'Use PATCH row operations instead of POST /api/data.',
  }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
