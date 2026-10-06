import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const encode = (value) => JSON.stringify(value, (_, item) => {
  if (typeof item === 'bigint') return { integer: item.toString() };
  if (item instanceof Uint8Array) return { blob: Buffer.from(item).toString('hex') };
  return item;
});

// Local SQLite files only; never opens D1 or writes a database/report.
export function fingerprintDatabase(filename) {
  const db = new DatabaseSync(resolve(filename), { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON');
    db.exec('BEGIN');
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('SQLite integrity check failed');
    }
    const tables = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name").all();
    const result = {};
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all();
      const statement = db.prepare(`SELECT * FROM ${quote(table.name)}`);
      statement.setReadBigInts(true);
      const rows = [];
      for (const row of statement.iterate()) {
        rows.push(hash(encode(columns.map(({ name }) => row[name]))));
      }
      // Order-independent, including duplicate rows. No amounts/titles/IDs in output.
      rows.sort();
      result[table.name] = {
        rows: rows.length,
        schemaHash: hash(encode({ sql: table.sql, columns })),
        contentHash: hash(rows.join('\n')),
      };
    }
    // Capture indexes/triggers/views as well as table declarations.
    const objects = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND tbl_name <> 'd1_migrations' ORDER BY type, name").all();
    return {
      tables: result,
      schemaHash: hash(encode(objects)),
      foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length,
    };
  } finally {
    db.close();
  }
}

export function compareDatabases(before, restored) {
  const differences = [];
  if (before.schemaHash !== restored.schemaHash) differences.push('schema');
  if (before.foreignKeyViolations || restored.foreignKeyViolations) differences.push('foreign-key violations');
  for (const name of new Set([...Object.keys(before.tables), ...Object.keys(restored.tables)])) {
    if (encode(before.tables[name]) !== encode(restored.tables[name])) differences.push(`table: ${name}`);
  }
  return differences;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const files = process.argv.slice(2);
    if (files.length !== 2) throw new Error('Usage: node scripts/check-d1-restore.mjs <baseline.sqlite> <restored.sqlite> (Node 24+)');
    const before = fingerprintDatabase(files[0]);
    const restored = fingerprintDatabase(files[1]);
    const differences = compareDatabases(before, restored);
    console.log(JSON.stringify({ match: differences.length === 0, differences, baseline: before, restored }, null, 2));
    if (differences.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
