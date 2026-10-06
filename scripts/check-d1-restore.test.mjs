import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintDatabase, compareDatabases } from './check-d1-restore.mjs';

test('read-only restore comparison detects data/schema drift without exposing row content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memoney-restore-test-'));
  try {
    const make = (name, reverse) => {
      const filename = join(dir, name);
      const db = new DatabaseSync(filename);
      db.exec('CREATE TABLE transactions(id TEXT PRIMARY KEY, title TEXT, amount INTEGER); CREATE INDEX amount_index ON transactions(amount);');
      const rows = [['a', '복원검증 비공개 메모', 9007199254740993n], ['b', 'second', 100n]];
      for (const row of reverse ? rows.reverse() : rows) db.prepare('INSERT INTO transactions VALUES (?, ?, ?)').run(...row);
      db.close();
      return filename;
    };
    const a = make('baseline.sqlite', false);
    const b = make('restored.sqlite', true);
    const original = readFileSync(a);
    const baseline = fingerprintDatabase(a);
    assert.deepEqual(compareDatabases(baseline, fingerprintDatabase(b)), []);
    assert.deepEqual(readFileSync(a), original);
    assert.ok(!JSON.stringify(baseline).includes('비공개'));
    const db = new DatabaseSync(b);
    db.exec("UPDATE transactions SET amount = amount - 1 WHERE id = 'a'");
    assert.ok(compareDatabases(baseline, fingerprintDatabase(b)).includes('table: transactions'));
    db.exec("DELETE FROM transactions WHERE id = 'b'; DROP INDEX amount_index;");
    const changed = fingerprintDatabase(b);
    assert.equal(changed.tables.transactions.rows, 1);
    assert.ok(compareDatabases(baseline, changed).includes('schema'));
    db.exec('CREATE TABLE extra(id INTEGER)');
    assert.ok(compareDatabases(baseline, fingerprintDatabase(b)).includes('table: extra'));
    db.close();
    assert.throws(() => fingerprintDatabase(join(dir, 'missing.sqlite')));
  } finally {
    // Only this test's uniquely created temporary directory is removed.
    rmSync(dir, { recursive: true });
  }
});

test('BLOB changes and declared foreign-key violations fail comparison', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memoney-restore-test-'));
  try {
    const filename = join(dir, 'fixture.sqlite');
    const db = new DatabaseSync(filename);
    db.exec('CREATE TABLE assets(id INTEGER PRIMARY KEY); CREATE TABLE links(asset_id INTEGER REFERENCES assets(id), payload BLOB); INSERT INTO assets VALUES (1);');
    db.prepare('INSERT INTO links VALUES (1, ?)').run(Buffer.from([0, 255, 1]));
    const baseline = fingerprintDatabase(filename);
    db.prepare('UPDATE links SET payload = ?').run(Buffer.from([0, 255, 2]));
    assert.ok(compareDatabases(baseline, fingerprintDatabase(filename)).includes('table: links'));
    db.exec('PRAGMA foreign_keys = OFF; UPDATE links SET asset_id = 999;');
    const broken = fingerprintDatabase(filename);
    assert.equal(broken.foreignKeyViolations, 1);
    assert.ok(compareDatabases(baseline, broken).includes('foreign-key violations'));
    db.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
