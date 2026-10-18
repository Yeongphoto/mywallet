import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';

// Explicitly read/export the four known stores. No import, deployment, or financial writes.
if (process.argv.length !== 3 || process.argv[2] !== '--backup') throw Error('Usage: node scripts/snapshot-android-web-databases.mjs --backup');
const base = join(process.env.LOCALAPPDATA, 'Memoney', 'backups');
mkdirSync(base, { recursive: true });
const directory = mkdtempSync(join(base, 'android-web-'));
const npx = join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
const names = ['mywallet-db', 'memoney-android-test-auth', 'memoney-android-test-personal', 'memoney-android-test-shared'];
const records = [];
for (const name of names) {
  const sqlFile = join(directory, `${name}.sql`);
  const sqliteFile = join(directory, `${name}.sqlite`);
  try {
    // Capture Wrangler's signed download URLs and SQL output; never print those credentials.
    execFileSync(process.execPath, [npx, '--yes', 'wrangler@4.148.0', 'd1', 'export', name, '--remote', '--output', sqlFile], { stdio: 'pipe', timeout: 120000 });
  } catch { throw Error(`Backup failed: ${name}. Inspect local Wrangler logs; no import was attempted.`); }
  const sql = readFileSync(sqlFile, 'utf8');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(sql);
    await backup(db, sqliteFile);
    records.push({ name, sha256: createHash('sha256').update(sql).digest('hex'), bytes: Buffer.byteLength(sql),
      tables: db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map(r => r.name) });
  } finally { db.close(); }
  console.log(`Backed up and restored locally: ${name}`);
}
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), records }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ directory, databases: records.length }));
