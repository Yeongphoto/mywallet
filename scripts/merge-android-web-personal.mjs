import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b))));
const sha = text => createHash('sha256').update(text).digest('hex');

export function buildMerge(web, android, now = Date.now()) {
  const source = web.prepare('SELECT * FROM transactions').all();
  const target = new Map(android.prepare('SELECT * FROM transactions').all().map(row => [row.id, row]));
  for (const row of source) if (target.has(row.id) && canonical(row) !== canonical(target.get(row.id))) throw Error('Transaction conflict: manual review required');
  const additions = source.filter(row => !target.has(row.id));
  // This rollout permits exactly the audited active web-only row. Tombstones or
  // a changed difference set stop the merge rather than silently expanding scope.
  if (additions.length !== 1 || additions.some(row => row.deleted_at !== null)) throw Error('Expected exactly one active web-only transaction');
  const row = additions[0];
  for (const field of ['asset_id','to_asset_id']) if (row[field] && !android.prepare('SELECT id FROM assets WHERE id=?').get(row[field])) throw Error('Missing target asset reference');
  for (const [field,table] of [['recurring_rule_id','recurring_rules'],['card_settlement_id','card_settlements']]) if(row[field] && !android.prepare(`SELECT id FROM ${table} WHERE id=?`).get(row[field])) throw Error('Missing target reference');
  const op = web.prepare('SELECT * FROM operation_results WHERE operation_id=?').get(row.last_operation_id);
  if (!op || op.status !== 'success' || op.entity_id !== row.id || android.prepare('SELECT operation_id FROM operation_results WHERE operation_id=?').get(row.last_operation_id)) throw Error('Operation history is not an unambiguous single-row addition');
  const insert = (table, values) => `INSERT OR IGNORE INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.values(values).map(quote).join(',')});`;
  const payload = { id:row.id,type:row.type,date:row.date,time:row.transaction_time||null,amount:row.amount,title:row.title,category:row.category,createdAt:row.created_at??null,assetId:row.asset_id||null,toAssetId:row.to_asset_id||null,recurringRuleId:row.recurring_rule_id||null,installmentGroupId:row.installment_group_id||null,installmentIndex:row.installment_index??null,installmentMonths:row.installment_months??null,cardSettlementId:row.card_settlement_id||null,revision:row.revision||1 };
  const exactRow = Object.entries(row).map(([key,value]) => `${key} IS ${quote(value)}`).join(' AND ');
  const sql = [insert('transactions',row), insert('operation_results',op),
    `INSERT INTO sync_changes(entity_type,entity_id,change_type,revision,payload_json,created_at) SELECT 'transaction',${quote(row.id)},'upsert',${quote(row.revision)},${quote(JSON.stringify(payload))},${now} WHERE EXISTS(SELECT 1 FROM transactions WHERE ${exactRow}) AND NOT EXISTS(SELECT 1 FROM sync_changes WHERE entity_type='transaction' AND entity_id=${quote(row.id)} AND change_type='upsert' AND revision=${quote(row.revision)} AND payload_json=${quote(JSON.stringify(payload))});`,
    `UPDATE settings SET value=CAST(MAX(CAST(value AS INTEGER),${now}) AS TEXT) WHERE key='updatedAt' AND EXISTS(SELECT 1 FROM sync_changes WHERE entity_id=${quote(row.id)} AND created_at=${now});`,
  ].join('\n') + '\n';
  return { sql, row, operation:op };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, mode] = process.argv.slice(2);
  if (!directory || !['--plan','--apply'].includes(mode)) throw Error('Usage: node scripts/merge-android-web-personal.mjs <backup-directory> --plan|--apply');
  const dir=resolve(directory),manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
  for(const name of ['mywallet-db','memoney-android-test-personal']) {
    const entry=manifest.records.find(r=>r.name===name);
    if(!entry || sha(readFileSync(join(dir,`${name}.sql`),'utf8'))!==entry.sha256)throw Error('Backup integrity mismatch');
  }
  const web=new DatabaseSync(join(dir,'mywallet-db.sqlite'),{readOnly:true});
  const android=new DatabaseSync(join(dir,'memoney-android-test-personal.sqlite'),{readOnly:true});
  try {
    const planFile=join(dir,'personal-merge-plan.json'),sqlFile=join(dir,'personal-merge.sql');
    if(mode==='--plan') {
      if(existsSync(planFile)||existsSync(sqlFile))throw Error('Refusing to overwrite existing merge plan');
      const plan=buildMerge(web,android);
      // Rehearse the additive statements and retry against a memory copy first.
      const test=new DatabaseSync(':memory:');
      try {test.exec(readFileSync(join(dir,'memoney-android-test-personal.sql'),'utf8'));const before=test.prepare('SELECT COUNT(*) n FROM transactions').get().n;test.exec(plan.sql);test.exec(plan.sql);
        if(test.prepare('SELECT COUNT(*) n FROM transactions').get().n!==before+1 || canonical(test.prepare('SELECT * FROM transactions WHERE id=?').get(plan.row.id))!==canonical(plan.row))throw Error('Merge rehearsal failed');
      }finally{test.close();}
      writeFileSync(sqlFile,plan.sql,{encoding:'utf8',flag:'wx'});
      writeFileSync(planFile,JSON.stringify({target:'memoney-android-test-personal',rowId:plan.row.id,sourceHash:sha(canonical(plan.row)),sqlHash:sha(plan.sql),createdAt:Date.now()},null,2),{encoding:'utf8',flag:'wx'});
      console.log(JSON.stringify({action:'planned-and-rehearsed',additions:1,updates:0,deletes:0,directory:dir}));
    } else {
      const plan=JSON.parse(readFileSync(planFile,'utf8')),sql=readFileSync(sqlFile,'utf8');
      if(plan.target!=='memoney-android-test-personal'||sha(sql)!==plan.sqlHash||Date.now()-plan.createdAt>3600000)throw Error('Invalid or stale merge plan');
      const expected=web.prepare('SELECT * FROM transactions WHERE id=?').get(plan.rowId);
      if(!expected||sha(canonical(expected))!==plan.sourceHash)throw Error('Unexpected merge source');
      const token=readFileSync(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
      const endpoint='https://api.cloudflare.com/client/v4/accounts/090ff65afe732a3bcc7036cc7fc37b3d/d1/database/';
      const query=async(id,sql,params=[])=>{const r=await fetch(endpoint+id+'/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params})});const data=await r.json();if(!data.success)throw Error('Remote preflight/verification failed');return data.result[0].results;};
      const source=await query('8dfd0da4-d04e-4f57-bc74-4cc567d2de0e','SELECT * FROM transactions WHERE id=?',[plan.rowId]);
      const target=await query('1f8e7054-bdd8-4032-b19e-b12a56ac2777','SELECT * FROM transactions WHERE id=?',[plan.rowId]);
      if(source.length!==1||canonical(source[0])!==canonical(expected)||(target.length&&canonical(target[0])!==canonical(expected)))throw Error('Source/target changed since backup; merge stopped');
      const originalOperation=web.prepare('SELECT * FROM operation_results WHERE operation_id=?').get(expected.last_operation_id);
      const remoteOperation=await query('1f8e7054-bdd8-4032-b19e-b12a56ac2777','SELECT * FROM operation_results WHERE operation_id=?',[expected.last_operation_id]);
      if(remoteOperation.length&&canonical(remoteOperation[0])!==canonical(originalOperation))throw Error('Operation ID conflict; merge stopped');
      const cli=join(dirname(process.execPath),'node_modules/npm/bin/npx-cli.js');
      // Idempotent statements also complete a previously interrupted additive import.
      try {execFileSync(process.execPath,[cli,'--yes','wrangler@4.148.0','d1','execute',plan.target,'--remote','--file',sqlFile],{stdio:'pipe',timeout:120000});}
      catch {throw Error('Additive import did not finish. Preserve backups and inspect; do not restore or delete data automatically.');}
      const saved=await query('1f8e7054-bdd8-4032-b19e-b12a56ac2777','SELECT * FROM transactions WHERE id=?',[plan.rowId]);
      if(saved.length!==1||canonical(saved[0])!==canonical(expected))throw Error('Post-merge row mismatch');
      const operation=await query('1f8e7054-bdd8-4032-b19e-b12a56ac2777','SELECT * FROM operation_results WHERE operation_id=?',[expected.last_operation_id]);
      const events=await query('1f8e7054-bdd8-4032-b19e-b12a56ac2777',"SELECT COUNT(*) n FROM sync_changes WHERE entity_type='transaction' AND entity_id=? AND change_type='upsert' AND revision=?",[expected.id,expected.revision]);
      if(operation.length!==1||canonical(operation[0])!==canonical(originalOperation)||events[0].n<1)throw Error('Post-merge operation/event verification failed');
      console.log(JSON.stringify({action:'remote-merge-verified',additions:target.length?0:1,updates:0,deletes:0}));
    }
  } finally {web.close();android.close();}
}
