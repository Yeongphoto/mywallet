interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    const [txs, asts, plns, cats, sgs, rcRules, delTxs] = await Promise.all([
      db.prepare("SELECT * FROM transactions WHERE deleted_at IS NULL").all(),
      db.prepare("SELECT * FROM assets ORDER BY category, sort_order IS NULL, sort_order, rowid").all(),
      db.prepare("SELECT * FROM plans").all(),
      db.prepare("SELECT * FROM custom_categories").all(),
      db.prepare("SELECT * FROM settings").all(),
      db.prepare("SELECT * FROM recurring_rules").all(),
      db.prepare("SELECT * FROM deleted_recurring_txs").all()
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
        revision: Number(t.revision) || 1,
      })),
      assets: (asts.results || []).map((asset: any) => ({
        ...asset,
        revision: Number(asset.revision) || 1,
        sortOrder: asset.sort_order == null ? null : Number(asset.sort_order),
      })),
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
      assetOrderRevisions: Object.fromEntries(
        (await db.prepare("SELECT id, revision FROM sync_groups WHERE id LIKE 'asset-order:%'").all()).results.map((group: any) => [
          String(group.id).slice('asset-order:'.length),
          Number(group.revision) || 0,
        ])
      ),
      updatedAt: Number(settingsMap['updatedAt']) || 0
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

function transactionInsertStatement(db: D1Database, transaction: any, operationId: string) {
  return db.prepare("INSERT INTO transactions (id, type, date, transaction_time, amount, title, category, created_at, asset_id, to_asset_id, recurring_rule_id, installment_group_id, installment_index, installment_months, revision, last_operation_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)")
    .bind(transaction.id, transaction.type, transaction.date, transaction.time || null, transaction.amount, transaction.title, transaction.category, transaction.createdAt ?? null, transaction.assetId || null, transaction.toAssetId || null, transaction.recurringRuleId || null, transaction.installmentGroupId || null, transaction.installmentIndex ?? null, transaction.installmentMonths ?? null, operationId);
}

async function completedOperation(db: D1Database, operationId: string) {
  return db.prepare("SELECT entity_type, entity_id, status FROM operation_results WHERE operation_id = ?").bind(operationId).first<any>();
}

async function operationSuccessResponse(db: D1Database, operation: any, operationId: string) {
  if (operation.entity_type === 'transaction_batch') {
    const rows = await db.prepare("SELECT * FROM transactions WHERE last_operation_id = ? AND deleted_at IS NULL").bind(operationId).all<any>();
    return new Response(JSON.stringify({ success: true, operationId, transactions: (rows.results || []).map(transactionRow) }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (operation.entity_type !== 'transaction') return null;
  const transaction = await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(operation.entity_id).first<any>();
  return new Response(JSON.stringify({
    success: true,
    operationId,
    transaction: transaction && !transaction.deleted_at ? transactionRow(transaction) : null,
    deleted: Boolean(transaction?.deleted_at),
  }), { headers: { 'Content-Type': 'application/json' } });
}

function conflictResponse(current: unknown) {
  return new Response(JSON.stringify({ error: 'SYNC_CONFLICT', current }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 Binding not found' }), { status: 500 });
  let body: any;

  try {
    body = await context.request.json();

    if (body.op === 'transaction.create' || body.op === 'transaction.createBatch') {
      const transactions = body.op === 'transaction.createBatch' ? body.transactions : [body.transaction];
      const operationId = body.operationId;
      if (!isOperationId(operationId) || !Array.isArray(transactions) || transactions.length === 0 || transactions.some((transaction) => !validTransaction(transaction))) {
        return new Response(JSON.stringify({ error: 'INVALID_TRANSACTION' }), { status: 400 });
      }
      const ids = transactions.map((transaction) => String(transaction.id));
      if (new Set(ids).size !== ids.length) return new Response(JSON.stringify({ error: 'DUPLICATE_TRANSACTION_ID' }), { status: 400 });
      const previous = await completedOperation(db, operationId);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const now = Date.now();
      const entityId = body.op === 'transaction.createBatch' ? String(body.groupId || operationId) : ids[0];
      const responseJson = JSON.stringify({ operationId, entityId, change: 'create' });
      await db.batch([
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, created_at) VALUES (?, ?, ?, 'pending', ?, ?)")
          .bind(operationId, body.op === 'transaction.createBatch' ? 'transaction_batch' : 'transaction', entityId, responseJson, now),
        ...transactions.map((transaction) => transactionInsertStatement(db, transaction, operationId)),
        ...transactions.map((transaction) => db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) VALUES ('transaction', ?, 'upsert', 1, ?, ?)")
          .bind(transaction.id, JSON.stringify({ ...transaction, revision: 1 }), now)),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND (SELECT COUNT(*) FROM transactions WHERE last_operation_id = ?) = ?")
          .bind(operationId, operationId, transactions.length),
        db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ]);
      const created = await db.prepare(`SELECT * FROM transactions WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all<any>();
      const result = (created.results || []).map(transactionRow);
      return new Response(JSON.stringify({ success: true, operationId, transaction: body.op === 'transaction.create' ? result[0] : undefined, transactions: result }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'transaction.update') {
      const transaction = body.transaction;
      const expectedRevision = Number(body.expectedRevision);
      const operationId = body.operationId;
      if (!isOperationId(operationId) || !validTransaction(transaction) || !Number.isInteger(expectedRevision)) {
        return new Response(JSON.stringify({ error: 'INVALID_TRANSACTION_UPDATE' }), { status: 400 });
      }
      const previous = await completedOperation(db, operationId);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const now = Date.now();
      const nextRevision = expectedRevision + 1;
      const responseJson = JSON.stringify({ operationId, entityId: transaction.id, change: 'update' });
      await db.batch([
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, created_at) VALUES (?, 'transaction', ?, 'pending', ?, ?)")
          .bind(operationId, transaction.id, responseJson, now),
        db.prepare("UPDATE transactions SET type = ?, date = ?, transaction_time = ?, amount = ?, title = ?, category = ?, created_at = ?, asset_id = ?, to_asset_id = ?, recurring_rule_id = ?, installment_group_id = ?, installment_index = ?, installment_months = ?, revision = ?, last_operation_id = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL")
          .bind(transaction.type, transaction.date, transaction.time || null, transaction.amount, transaction.title, transaction.category, transaction.createdAt ?? null, transaction.assetId || null, transaction.toAssetId || null, transaction.recurringRuleId || null, transaction.installmentGroupId || null, transaction.installmentIndex ?? null, transaction.installmentMonths ?? null, nextRevision, operationId, transaction.id, expectedRevision),
        db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) SELECT 'transaction', id, 'upsert', revision, ?, ? FROM transactions WHERE id = ? AND last_operation_id = ?")
          .bind(JSON.stringify({ ...transaction, revision: nextRevision }), now, transaction.id, operationId),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND last_operation_id = ?)")
          .bind(operationId, transaction.id, operationId),
        db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ]);
      const updated = await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(String(transaction.id)).first<any>();
      return new Response(JSON.stringify({ success: true, operationId, transaction: transactionRow(updated) }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'transaction.delete') {
      const transactionId = String(body.transactionId || '');
      const expectedRevision = Number(body.expectedRevision);
      const operationId = body.operationId;
      if (!isOperationId(operationId) || !transactionId || !Number.isInteger(expectedRevision)) return new Response(JSON.stringify({ error: 'INVALID_TRANSACTION_DELETE' }), { status: 400 });
      const previous = await completedOperation(db, operationId);
      if (previous?.status === 'success') {
        const response = await operationSuccessResponse(db, previous, operationId);
        if (response) return response;
      }
      const now = Date.now();
      const responseJson = JSON.stringify({ operationId, entityId: transactionId, change: 'delete' });
      await db.batch([
        db.prepare("INSERT INTO operation_results (operation_id, entity_type, entity_id, status, response_json, created_at) VALUES (?, 'transaction', ?, 'pending', ?, ?)")
          .bind(operationId, transactionId, responseJson, now),
        db.prepare("UPDATE transactions SET deleted_at = ?, revision = revision + 1, last_operation_id = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL")
          .bind(now, operationId, transactionId, expectedRevision),
        db.prepare("INSERT INTO sync_changes (entity_type, entity_id, change_type, revision, payload_json, created_at) SELECT 'transaction', id, 'delete', revision, NULL, ? FROM transactions WHERE id = ? AND last_operation_id = ?")
          .bind(now, transactionId, operationId),
        db.prepare("UPDATE operation_results SET status = 'success' WHERE operation_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND last_operation_id = ?)")
          .bind(operationId, transactionId, operationId),
        db.prepare("UPDATE operation_results SET response_json = NULL WHERE operation_id = ? AND status = 'pending'").bind(operationId),
      ]);
      return new Response(JSON.stringify({ success: true, operationId, transactionId, deleted: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (body.op === 'asset.create') {
      const asset = body.asset;
      const openingTransaction = body.openingTransaction;
      if (!asset?.id || !asset.category || !asset.name || !Number.isFinite(Number(asset.amount)) || typeof asset.memo !== 'string') {
        return new Response(JSON.stringify({ error: 'INVALID_ASSET' }), { status: 400 });
      }
      const existing = await db.prepare("SELECT id FROM assets WHERE id = ?").bind(String(asset.id)).first();
      if (existing) return conflictResponse({ asset: existing });

      const maxSort = await db.prepare("SELECT MAX(sort_order) AS value FROM assets WHERE category = ?").bind(String(asset.category)).first<{ value: number | null }>();
      const sortOrder = Number.isFinite(Number(maxSort?.value)) ? Number(maxSort?.value) + 1 : 0;
      const statements: D1PreparedStatement[] = [
        db.prepare("INSERT INTO assets (id, category, name, kind, amount, memo, revision, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
          .bind(String(asset.id), String(asset.category), String(asset.name), asset.kind || null, 0, String(asset.memo), sortOrder),
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
      if (!asset?.id || !asset.category || !asset.name || typeof asset.memo !== 'string' || !Number.isInteger(expectedRevision)) {
        return new Response(JSON.stringify({ error: 'INVALID_ASSET_UPDATE' }), { status: 400 });
      }
      const current = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(String(asset.id)).first<any>();
      if (!current || Number(current.revision) !== expectedRevision) return conflictResponse({ asset: current ? assetRow(current) : null });

      const movedCategory = current.category !== asset.category;
      const maxSort = movedCategory
        ? await db.prepare("SELECT MAX(sort_order) AS value FROM assets WHERE category = ?").bind(String(asset.category)).first<{ value: number | null }>()
        : null;
      const nextSortOrder = movedCategory && Number.isFinite(Number(maxSort?.value)) ? Number(maxSort?.value) + 1 : movedCategory ? 0 : current.sort_order;
      const result = await db.prepare("UPDATE assets SET category = ?, name = ?, kind = ?, memo = ?, sort_order = ?, revision = revision + 1 WHERE id = ? AND revision = ?")
        .bind(String(asset.category), String(asset.name), asset.kind || null, String(asset.memo), nextSortOrder, String(asset.id), expectedRevision).run();
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
      if (!categoryId || !Number.isInteger(expectedRevision) || assetIds.length === 0 || new Set(assetIds).size !== assetIds.length) {
        return new Response(JSON.stringify({ error: 'INVALID_ASSET_REORDER' }), { status: 400 });
      }

      const groupId = `asset-order:${categoryId}`;
      const currentRows = await db.prepare("SELECT * FROM assets WHERE category = ? ORDER BY sort_order IS NULL, sort_order, rowid").bind(categoryId).all();
      const currentIds = (currentRows.results || []).map((asset: any) => String(asset.id));
      if (currentIds.length !== assetIds.length || currentIds.some((id) => !assetIds.includes(id))) {
        const currentGroup = await db.prepare("SELECT revision FROM sync_groups WHERE id = ?").bind(groupId).first<{ revision: number }>();
        return conflictResponse({ assets: (currentRows.results || []).map(assetRow), revision: Number(currentGroup?.revision) || 0 });
      }

      const statements: D1PreparedStatement[] = assetIds.map((id, index) =>
        db.prepare("UPDATE assets SET sort_order = ? WHERE id = ? AND category = ? AND EXISTS (SELECT 1 FROM sync_groups WHERE id = ? AND revision = ?)")
          .bind(index, id, categoryId, groupId, expectedRevision)
      );
      statements.push(
        db.prepare("UPDATE sync_groups SET revision = revision + 1 WHERE id = ? AND revision = ?")
          .bind(groupId, expectedRevision)
      );
      const results = await db.batch(statements);
      const versionResult = results[results.length - 1];
      if (!versionResult.meta.changes) {
        const currentGroup = await db.prepare("SELECT revision FROM sync_groups WHERE id = ?").bind(groupId).first<{ revision: number }>();
        return conflictResponse({ assets: (currentRows.results || []).map(assetRow), revision: Number(currentGroup?.revision) || 0 });
      }

      const ordered = await db.prepare("SELECT * FROM assets WHERE category = ? ORDER BY sort_order, rowid").bind(categoryId).all();
      return new Response(JSON.stringify({
        success: true,
        assets: (ordered.results || []).map(assetRow),
        revision: expectedRevision + 1,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'UNKNOWN_OPERATION' }), { status: 400 });
  } catch (err: any) {
    if (body?.op === 'transaction.update' || body?.op === 'transaction.delete') {
      const transactionId = String(body.transaction?.id || body.transactionId || '');
      const current = transactionId
        ? await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(transactionId).first<any>()
        : null;
      return conflictResponse({ transaction: current && !current.deleted_at ? transactionRow(current) : null });
    }
    if (body?.op === 'transaction.create') {
      const transactionId = String(body.transaction?.id || '');
      const current = transactionId
        ? await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(transactionId).first<any>()
        : null;
      return conflictResponse({ transaction: current && !current.deleted_at ? transactionRow(current) : null });
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    const body: any = await context.request.json();
    const { 
      transactions, 
      assets, 
      plans, 
      customExpenseCategories, 
      customIncomeCategories, 
      customAssetCategories,
      categoryColors,
      categoryLabels,
      categoryBudgetExcluded,
      categoryOrder,
      hiddenCategories,
      budget, 
      theme, 
      recurringRules, 
      deletedRecurringTxs,
      updatedAt,
      baseUpdatedAt
    } = body;

    const nextUpdatedAt = Number(updatedAt) || Date.now();
    const expectedUpdatedAt = Number(baseUpdatedAt);
    if (Number.isFinite(expectedUpdatedAt)) {
      const versionResult = expectedUpdatedAt === 0
        ? await db.prepare("INSERT INTO settings (key, value) VALUES ('updatedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value = '0'")
          .bind(String(nextUpdatedAt)).run()
        : await db.prepare("UPDATE settings SET value = ? WHERE key = 'updatedAt' AND value = ?")
          .bind(String(nextUpdatedAt), String(expectedUpdatedAt)).run();

      if (!versionResult.meta.changes) {
        const currentVersion = await db.prepare("SELECT value FROM settings WHERE key = 'updatedAt'").first<{ value: string }>();
        return new Response(JSON.stringify({
          error: 'SYNC_CONFLICT',
          updatedAt: Number(currentVersion?.value) || 0,
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const statements: D1PreparedStatement[] = [];

    // Clear old data
    statements.push(db.prepare("DELETE FROM transactions"));
    statements.push(db.prepare("DELETE FROM assets"));
    statements.push(db.prepare("DELETE FROM plans"));
    statements.push(db.prepare("DELETE FROM custom_categories"));
    statements.push(db.prepare("DELETE FROM settings"));
    statements.push(db.prepare("DELETE FROM recurring_rules"));
    statements.push(db.prepare("DELETE FROM deleted_recurring_txs"));

    // Insert transactions
    if (Array.isArray(transactions)) {
      transactions.forEach((t: any) => {
        statements.push(
          db.prepare("INSERT INTO transactions (id, type, date, transaction_time, amount, title, category, created_at, asset_id, to_asset_id, recurring_rule_id, installment_group_id, installment_index, installment_months) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(t.id, t.type, t.date, t.time || null, t.amount, t.title, t.category, t.createdAt ?? null, t.assetId || null, t.toAssetId || null, t.recurringRuleId || null, t.installmentGroupId || null, t.installmentIndex ?? null, t.installmentMonths ?? null)
        );
      });
    }

    // Insert assets
    if (Array.isArray(assets)) {
      assets.forEach((a: any) => {
        statements.push(
          db.prepare("INSERT INTO assets (id, category, name, kind, amount, memo) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(a.id, a.category, a.name || null, a.kind || null, a.amount, a.memo)
        );
      });
    }

    // Insert plans
    if (Array.isArray(plans)) {
      plans.forEach((p: any) => {
        statements.push(
          db.prepare("INSERT INTO plans (category, type, plannedAmount) VALUES (?, ?, ?)")
            .bind(p.category, p.type, p.plannedAmount)
        );
      });
    }

    // Insert custom categories
    if (Array.isArray(customExpenseCategories)) {
      customExpenseCategories.forEach((c: any) => {
        statements.push(
          db.prepare("INSERT INTO custom_categories (id, type, label, color) VALUES (?, 'expense', ?, ?)")
            .bind(c.id, c.label, c.color || null)
        );
      });
    }
    if (Array.isArray(customIncomeCategories)) {
      customIncomeCategories.forEach((c: any) => {
        statements.push(
          db.prepare("INSERT INTO custom_categories (id, type, label, color) VALUES (?, 'income', ?, ?)")
            .bind(c.id, c.label, c.color || null)
        );
      });
    }
    if (Array.isArray(customAssetCategories)) {
      customAssetCategories.forEach((c: any) => {
        statements.push(
          db.prepare("INSERT INTO custom_categories (id, type, label, color) VALUES (?, ?, ?, ?)")
            .bind(c.id, c.kind === 'liability' ? 'liability' : 'asset', c.label, c.color || null)
        );
      });
    }

    // Insert settings
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('budget', ?)")
      .bind(String(budget ?? 1000000)));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('theme', ?)")
      .bind(String(theme ?? 'light')));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('categoryColors', ?)")
      .bind(JSON.stringify(categoryColors && typeof categoryColors === 'object' ? categoryColors : {})));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('categoryLabels', ?)")
      .bind(JSON.stringify(categoryLabels && typeof categoryLabels === 'object' ? categoryLabels : {})));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('categoryBudgetExcluded', ?)")
      .bind(JSON.stringify(categoryBudgetExcluded && typeof categoryBudgetExcluded === 'object' ? categoryBudgetExcluded : {})));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('categoryOrder', ?)")
      .bind(JSON.stringify(categoryOrder && typeof categoryOrder === 'object' ? categoryOrder : {})));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('hiddenCategories', ?)")
      .bind(JSON.stringify(hiddenCategories && typeof hiddenCategories === 'object' ? hiddenCategories : {})));
    statements.push(db.prepare("INSERT INTO settings (key, value) VALUES ('updatedAt', ?)")
      .bind(String(nextUpdatedAt)));

    // Insert recurring rules
    if (Array.isArray(recurringRules)) {
      recurringRules.forEach((r: any) => {
        statements.push(
          db.prepare("INSERT INTO recurring_rules (id, type, day, transaction_time, amount, title, category, asset_id, to_asset_id, startMonth, endMonth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(r.id, r.type, r.day, r.time || null, r.amount, r.title, r.category, r.assetId || null, r.toAssetId || null, r.startMonth, r.endMonth || null)
        );
      });
    }

    // Insert deleted recurring transaction IDs
    if (Array.isArray(deletedRecurringTxs)) {
      deletedRecurringTxs.forEach((id: string) => {
        statements.push(
          db.prepare("INSERT INTO deleted_recurring_txs (id) VALUES (?)")
            .bind(id)
        );
      });
    }

    // Batch execute
    await db.batch(statements);

    return new Response(JSON.stringify({ success: true, updatedAt: nextUpdatedAt }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
