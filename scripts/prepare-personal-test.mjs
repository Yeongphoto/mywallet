import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

// One-time preparation only. No remote request and no production database write.
const connection=JSON.parse(readFileSync('.android-tools/shared-wallet.json','utf8'));
const config={databaseId:'1f8e7054-bdd8-4032-b19e-b12a56ac2777',databaseName:'memoney-android-test-personal',
  ledgerId:randomUUID(),ownerUserId:connection.ownerUserId};
const source=readFileSync('android/build/web-finance-readonly-20261014.sql','utf8');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(source);
const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
const allowed=['assets','card_settlements','custom_categories','deleted_recurring_txs','operation_results','plans','recurring_rules','settings','sync_changes','sync_groups','transactions'];
if (JSON.stringify(tables)!==JSON.stringify(allowed)) throw Error('Unexpected source schema; refuse to export other data');
const counts=Object.fromEntries(tables.map(table=>[table,sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
sqlite.close();
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const now=Date.now();
const metadata=`INSERT INTO ledgers(id,owner_user_id,name,created_at) VALUES(${quote(config.ledgerId)},${quote(config.ownerUserId)},'개인 장부',${now});
INSERT INTO ledger_memberships(ledger_id,user_id,role,created_at) VALUES(${quote(config.ledgerId)},${quote(config.ownerUserId)},'owner',${now});\n`;
const marker=`\nCREATE TABLE memoney_test_database(id TEXT PRIMARY KEY,ledger_id TEXT NOT NULL);
INSERT INTO memoney_test_database VALUES('memoney-android-test-personal',${quote(config.ledgerId)});\n`;
writeFileSync('android/build/personal-test-finance-initialization.sql',source+marker,{encoding:'utf8',flag:'wx'});
writeFileSync('android/build/personal-test-metadata-initialization.sql',metadata,{encoding:'utf8',flag:'wx'});
writeFileSync('.android-tools/personal-test-wallet.json',JSON.stringify(config,null,2)+'\n',{encoding:'utf8',flag:'wx'});
writeFileSync('android/build/personal-test-source-counts.json',JSON.stringify(counts,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({database:config.databaseName,ledgerId:config.ledgerId,counts,productionWrites:0}));
