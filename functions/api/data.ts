interface Env {
  DB: D1Database;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = ensureSchemaOnce(db).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureSchemaOnce(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      transaction_time TEXT,
      amount INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at INTEGER,
      asset_id TEXT,
      to_asset_id TEXT,
      recurring_rule_id TEXT,
      installment_group_id TEXT,
      installment_index INTEGER,
      installment_months INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT,
      kind TEXT,
      amount INTEGER NOT NULL,
      memo TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS plans (
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      plannedAmount INTEGER NOT NULL,
      PRIMARY KEY (category, type)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_categories (
      id TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT,
      PRIMARY KEY (id, type)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS recurring_rules (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      day INTEGER NOT NULL,
      transaction_time TEXT,
      amount INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      asset_id TEXT,
      to_asset_id TEXT,
      startMonth TEXT NOT NULL,
      endMonth TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS deleted_recurring_txs (
      id TEXT PRIMARY KEY
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_groups (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0
    )`)
  ]);

  try { await db.prepare("ALTER TABLE transactions ADD COLUMN asset_id TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE transactions ADD COLUMN to_asset_id TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE transactions ADD COLUMN created_at INTEGER").run(); } catch {}
  try { await db.prepare("ALTER TABLE transactions ADD COLUMN transaction_time TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE transactions ADD COLUMN installment_group_id TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE transactions ADD COLUMN installment_index INTEGER").run(); } catch {}
  try { await db.prepare("ALTER TABLE transactions ADD COLUMN installment_months INTEGER").run(); } catch {}
  try { await db.prepare("ALTER TABLE recurring_rules ADD COLUMN asset_id TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE recurring_rules ADD COLUMN to_asset_id TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE recurring_rules ADD COLUMN transaction_time TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE assets ADD COLUMN name TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE assets ADD COLUMN kind TEXT").run(); } catch {}
  try { await db.prepare("ALTER TABLE assets ADD COLUMN revision INTEGER NOT NULL DEFAULT 1").run(); } catch {}
  try { await db.prepare("ALTER TABLE assets ADD COLUMN sort_order INTEGER").run(); } catch {}
  await db.prepare("INSERT OR IGNORE INTO sync_groups (id, revision) SELECT 'asset-order:' || category, 0 FROM assets GROUP BY category").run();
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    await ensureSchema(db);

    const [txs, asts, plns, cats, sgs, rcRules, delTxs] = await Promise.all([
      db.prepare("SELECT * FROM transactions").all(),
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
        installmentMonths: t.installment_months == null ? null : Number(t.installment_months)
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

function conflictResponse(current: unknown) {
  return new Response(JSON.stringify({ error: 'SYNC_CONFLICT', current }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 Binding not found' }), { status: 500 });

  try {
    await ensureSchema(db);
    const body: any = await context.request.json();

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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "D1 Binding not found" }), { status: 500 });
  }

  try {
    await ensureSchema(db);

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
