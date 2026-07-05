import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const response = await fetch('http://127.0.0.1:5173/api/data');
if (!response.ok) {
  throw new Error(`Failed to fetch /api/data: ${response.status}`);
}

const data = await response.json();
const sql = [];

function esc(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function num(value) {
  return Number(value) || 0;
}

sql.push(
  'DELETE FROM transactions;',
  'DELETE FROM assets;',
  'DELETE FROM plans;',
  'DELETE FROM custom_categories;',
  'DELETE FROM settings;',
  'DELETE FROM recurring_rules;',
  'DELETE FROM deleted_recurring_txs;',
);

for (const t of data.transactions || []) {
  sql.push(
    `INSERT INTO transactions (id, type, date, amount, title, category, recurring_rule_id) VALUES (${esc(t.id)}, ${esc(t.type)}, ${esc(t.date)}, ${num(t.amount)}, ${esc(t.title)}, ${esc(t.category)}, ${esc(t.recurringRuleId)});`,
  );
}

for (const a of data.assets || []) {
  sql.push(
    `INSERT INTO assets (id, category, amount, memo) VALUES (${esc(a.id)}, ${esc(a.category)}, ${num(a.amount)}, ${esc(a.memo)});`,
  );
}

for (const p of data.plans || []) {
  sql.push(
    `INSERT INTO plans (category, type, plannedAmount) VALUES (${esc(p.category)}, ${esc(p.type)}, ${num(p.plannedAmount)});`,
  );
}

for (const c of data.customExpenseCategories || []) {
  sql.push(
    `INSERT INTO custom_categories (id, type, label, color) VALUES (${esc(c.id)}, 'expense', ${esc(c.label)}, ${esc(c.color)});`,
  );
}

for (const c of data.customIncomeCategories || []) {
  sql.push(
    `INSERT INTO custom_categories (id, type, label, color) VALUES (${esc(c.id)}, 'income', ${esc(c.label)}, ${esc(c.color)});`,
  );
}

for (const c of data.customAssetCategories || []) {
  sql.push(
    `INSERT INTO custom_categories (id, type, label, color) VALUES (${esc(c.id)}, 'asset', ${esc(c.label)}, ${esc(c.color)});`,
  );
}

sql.push(
  `INSERT INTO settings (key, value) VALUES ('budget', ${esc(data.budget ?? 1000000)});`,
  `INSERT INTO settings (key, value) VALUES ('theme', ${esc(data.theme ?? 'light')});`,
  `INSERT INTO settings (key, value) VALUES ('updatedAt', ${esc(data.updatedAt ?? Date.now())});`,
);

for (const r of data.recurringRules || []) {
  sql.push(
    `INSERT INTO recurring_rules (id, type, day, amount, title, category, startMonth, endMonth) VALUES (${esc(r.id)}, ${esc(r.type)}, ${num(r.day)}, ${num(r.amount)}, ${esc(r.title)}, ${esc(r.category)}, ${esc(r.startMonth)}, ${esc(r.endMonth)});`,
  );
}

for (const id of data.deletedRecurringTxs || []) {
  sql.push(`INSERT INTO deleted_recurring_txs (id) VALUES (${esc(id)});`);
}

const outputPath = join(tmpdir(), 'mywallet-sync-remote.sql');
writeFileSync(outputPath, sql.join('\n'), 'utf8');
console.log(outputPath);
